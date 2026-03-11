# Stage 0 Onboarding UI Implementation

## Source Documentation

- [Stage 0 Onboarding](../../docs/mvp-planning/plans/stages/stage-0-onboarding.md)
- [Auth Flow Wireframes](../../docs/mvp-planning/plans/wireframes/auth-flow.md)

## Prerequisites

- [ ] `mobile/navigation.md` complete
- [ ] `mobile/api-client.md` complete
- [ ] `backend/stage-0-api.md` complete

## External Services Required

> **None.**

## Scope

Implement the Curiosity Compact onboarding flow for new sessions.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/components/__tests__/CuriosityCompact.test.tsx`:

```typescript
describe('CuriosityCompact', () => {
  it('renders compact terms', () => {
    render(<CuriosityCompact sessionId="123" onSign={jest.fn()} />);
    expect(screen.getByText(/approach this process with curiosity/i)).toBeTruthy();
  });

  it('requires checkbox before signing', () => {
    render(<CuriosityCompact sessionId="123" onSign={jest.fn()} />);
    const signButton = screen.getByText(/sign and begin/i);
    expect(signButton).toBeDisabled();
  });

  it('enables sign button when checkbox checked', () => {
    render(<CuriosityCompact sessionId="123" onSign={jest.fn()} />);
    fireEvent.press(screen.getByTestId('agree-checkbox'));
    expect(screen.getByText(/sign and begin/i)).not.toBeDisabled();
  });

  it('calls onSign when signed', async () => {
    const onSign = jest.fn();
    render(<CuriosityCompact sessionId="123" onSign={onSign} />);
    fireEvent.press(screen.getByTestId('agree-checkbox'));
    fireEvent.press(screen.getByText(/sign and begin/i));
    await waitFor(() => expect(onSign).toHaveBeenCalled());
  });
});
```

### 2. Create compact terms component

Create `mobile/src/components/CompactTerms.tsx`:

```typescript
import { View, Text, StyleSheet, ScrollView } from 'react-native';

const COMPACT_COMMITMENTS = [
  'Approach this process with curiosity rather than certainty',
  'Allow the AI to guide the pace of our work',
  'Share honestly within my private space',
  'Consider the others perspective when presented',
  'Focus on understanding needs rather than winning arguments',
  'Take breaks when emotions run high',
];

const COMPACT_UNDERSTANDING = [
  'The AI will not judge who is right or wrong',
  'My raw thoughts remain private unless I consent to share',
  'Progress requires both parties to complete each stage',
  'I can pause at any time but cannot skip ahead',
];

export function CompactTerms() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>I commit to:</Text>
      {COMPACT_COMMITMENTS.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.itemText}>{item}</Text>
        </View>
      ))}

      <Text style={[styles.sectionTitle, styles.secondSection]}>I understand that:</Text>
      {COMPACT_UNDERSTANDING.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.itemText}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  secondSection: { marginTop: 24 },
  item: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    width: 20,
    color: '#4F46E5',
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
});
```

### 3. Create curiosity compact component

Create `mobile/src/components/CuriosityCompact.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { CheckCircle, Circle } from 'lucide-react-native';
import { CompactTerms } from './CompactTerms';
import { useSignCompact } from '../hooks/useStage0';

interface Props {
  sessionId: string;
  onSign: () => void;
}

export function CuriosityCompact({ sessionId, onSign }: Props) {
  const [agreed, setAgreed] = useState(false);
  const { mutate: signCompact, isPending } = useSignCompact(sessionId);

  const handleSign = () => {
    signCompact(undefined, { onSuccess: onSign });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Curiosity Compact</Text>
      <Text style={styles.subtitle}>
        Before we begin, please review and agree to these commitments
      </Text>

      <View style={styles.termsContainer}>
        <CompactTerms />
      </View>

      <TouchableOpacity
        testID="agree-checkbox"
        style={styles.checkbox}
        onPress={() => setAgreed(!agreed)}
      >
        {agreed ? (
          <CheckCircle color="#4F46E5" size={24} />
        ) : (
          <Circle color="#9CA3AF" size={24} />
        )}
        <Text style={styles.checkboxLabel}>
          I agree to proceed with curiosity
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.signButton, !agreed && styles.signButtonDisabled]}
        onPress={handleSign}
        disabled={!agreed || isPending}
      >
        <Text style={styles.signButtonText}>
          {isPending ? 'Signing...' : 'Sign and Begin'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.questionsButton}>
        <Text style={styles.questionsText}>I have questions</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  termsContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxLabel: {
    marginLeft: 12,
    fontSize: 16,
    color: '#374151',
  },
  signButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  signButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  signButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  questionsButton: {
    alignItems: 'center',
    padding: 12,
  },
  questionsText: {
    color: '#4F46E5',
    fontSize: 14,
  },
});
```

### 4. Create stage 0 hook

Create `mobile/src/hooks/useStage0.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function useSignCompact(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sessions/${sessionId}/compact/sign`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}
```

### 5. Create onboarding screen

Create `mobile/app/(auth)/session/[id]/onboarding.tsx`:

```typescript
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../../../src/hooks/useSessions';
import { CuriosityCompact } from '../../../../src/components/CuriosityCompact';
import { WaitingRoom } from '../../../../src/components/WaitingRoom';

export default function OnboardingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession(sessionId);

  const handleSigned = () => {
    // Refresh to check if partner has also signed
    router.replace(`/session/${sessionId}`);
  };

  const hasSigned = session?.myProgress.compactSigned;
  const partnerSigned = session?.partnerProgress.compactSigned;

  if (hasSigned && !partnerSigned) {
    return (
      <View style={styles.container}>
        <WaitingRoom
          message="Waiting for your partner to sign the Curiosity Compact"
          partnerName={session?.partner.name}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CuriosityCompact sessionId={sessionId} onSign={handleSigned} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
});
```

### 6. Create waiting room component

Create `mobile/src/components/WaitingRoom.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';

interface Props {
  message: string;
  partnerName?: string;
}

export function WaitingRoom({ message, partnerName }: Props) {
  return (
    <View style={styles.container}>
      <Clock color="#4F46E5" size={48} />
      <Text style={styles.title}>Waiting Room</Text>
      <Text style={styles.message}>{message}</Text>
      {partnerName && (
        <Text style={styles.partner}>
          We will notify you when {partnerName} is ready
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  partner: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
```

### 7. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Compact terms display correctly
- [ ] Checkbox enables/disables sign button
- [ ] Sign mutation calls API
- [ ] Waiting room shows after signing
- [ ] Navigates to Stage 1 when both signed
- [ ] `npm run check` passes
- [ ] `npm run test` passes
