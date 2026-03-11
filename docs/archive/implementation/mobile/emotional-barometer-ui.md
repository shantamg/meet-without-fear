# Emotional Barometer UI Implementation

## Source Documentation

- [Emotional Barometer UI](../../docs/mvp-planning/plans/wireframes/emotional-barometer-ui.md)
- [Emotional Barometer Mechanism](../../docs/mvp-planning/plans/mechanisms/emotional-barometer.md)

## Prerequisites

- [ ] `mobile/api-client.md` complete

## External Services Required

> **None.**

## Scope

Implement emotion check-in slider and regulation exercises.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/components/__tests__/EmotionalBarometer.test.tsx`:

```typescript
describe('EmotionalBarometer', () => {
  it('shows slider with current value', () => {
    render(<EmotionalBarometer value={5} onChange={jest.fn()} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('suggests exercise at high intensity', () => {
    render(<EmotionalBarometer value={8} onChange={jest.fn()} />);
    expect(screen.getByText(/take a moment/i)).toBeTruthy();
  });

  it('calls onChange when slider moved', () => {
    const onChange = jest.fn();
    render(<EmotionalBarometer value={5} onChange={onChange} />);
    // Simulate slider change
    fireEvent(screen.getByTestId('slider'), 'valueChange', 7);
    expect(onChange).toHaveBeenCalledWith(7);
  });
});
```

### 2. Create barometer slider component

Create `mobile/src/components/EmotionalBarometer.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  value: number;
  onChange: (value: number) => void;
  showLabel?: boolean;
}

const INTENSITY_LABELS = [
  { max: 3, label: 'Calm', color: '#10B981' },
  { max: 5, label: 'Neutral', color: '#6B7280' },
  { max: 7, label: 'Heightened', color: '#F59E0B' },
  { max: 10, label: 'Intense', color: '#EF4444' },
];

export function EmotionalBarometer({ value, onChange, showLabel = true }: Props) {
  const currentLevel = INTENSITY_LABELS.find(l => value <= l.max) || INTENSITY_LABELS[3];

  return (
    <View style={styles.container}>
      {showLabel && (
        <View style={styles.header}>
          <Text style={styles.label}>How are you feeling?</Text>
          <Text style={[styles.value, { color: currentLevel.color }]}>
            {value} - {currentLevel.label}
          </Text>
        </View>
      )}

      <Slider
        testID="slider"
        style={styles.slider}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={currentLevel.color}
        maximumTrackTintColor="#E5E7EB"
        thumbTintColor={currentLevel.color}
      />

      <View style={styles.labels}>
        <Text style={styles.scaleLabel}>Calm</Text>
        <Text style={styles.scaleLabel}>Intense</Text>
      </View>

      {value >= 8 && (
        <View style={styles.suggestion}>
          <Text style={styles.suggestionText}>
            Take a moment to ground yourself before continuing
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: { fontSize: 16, fontWeight: '500' },
  value: { fontSize: 18, fontWeight: '600' },
  slider: { width: '100%', height: 40 },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabel: { fontSize: 12, color: '#9CA3AF' },
  suggestion: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  suggestionText: { color: '#92400E', fontSize: 14 },
});
```

### 3. Create exercise modal

Create `mobile/src/components/RegulationExercise.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';

interface Props {
  visible: boolean;
  onComplete: (intensityAfter: number) => void;
  onClose: () => void;
}

export function BreathingExercise({ visible, onComplete, onClose }: Props) {
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [count, setCount] = useState(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setCount(c => {
        if (c >= 3) {
          // After 3 cycles, show completion
          return c;
        }
        return c + 1;
      });
    }, 12000); // Full breath cycle

    return () => clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    if (phase === 'inhale') {
      scale.value = withTiming(1.5, { duration: 4000 });
      setTimeout(() => setPhase('hold'), 4000);
    } else if (phase === 'hold') {
      setTimeout(() => setPhase('exhale'), 4000);
    } else {
      scale.value = withTiming(1, { duration: 4000 });
      setTimeout(() => setPhase('inhale'), 4000);
    }
  }, [phase]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Breathing Exercise</Text>

          <Animated.View style={[styles.circle, animatedStyle]}>
            <Text style={styles.phaseText}>{phase}</Text>
          </Animated.View>

          <Text style={styles.instruction}>
            {phase === 'inhale' && 'Breathe in slowly...'}
            {phase === 'hold' && 'Hold...'}
            {phase === 'exhale' && 'Breathe out slowly...'}
          </Text>

          <Text style={styles.count}>{count}/3 cycles</Text>

          {count >= 3 && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => onComplete(5)} // TODO: ask for new intensity
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onClose}>
            <Text style={styles.skip}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '90%',
  },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 24 },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  phaseText: { color: 'white', fontSize: 16, textTransform: 'capitalize' },
  instruction: { fontSize: 18, marginBottom: 16 },
  count: { fontSize: 14, color: '#9CA3AF', marginBottom: 24 },
  doneButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 48,
    borderRadius: 8,
    marginBottom: 16,
  },
  doneButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  skip: { color: '#9CA3AF', fontSize: 14 },
});
```

### 4. Install dependencies

```bash
npx expo install @react-native-community/slider
```

### 5. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Slider moves smoothly 1-10
- [ ] Color changes based on intensity level
- [ ] Suggestion appears at intensity >= 8
- [ ] Breathing exercise animation works
- [ ] Exercise completion logged
- [ ] `npm run check` passes
- [ ] `npm run test` passes
