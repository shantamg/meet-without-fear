/**
 * SegmentedControl Component
 *
 * A custom iOS-style segmented control with sliding pill animation.
 * Used for switching between AI and Partner tabs in the session chat.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface SegmentedControlSegment {
  /** Unique key for this segment */
  key: string;
  /** Display label for the segment */
  label: string;
  /** Whether to show a badge indicator */
  showBadge?: boolean;
}

export interface SegmentedControlProps {
  /** Array of segments to display */
  segments: SegmentedControlSegment[];
  /** Currently selected segment key */
  selectedKey: string;
  /** Callback when a segment is selected */
  onSelect: (key: string) => void;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SegmentedControl({
  segments,
  selectedKey,
  onSelect,
  testID = 'segmented-control',
}: SegmentedControlProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const containerWidth = useRef(0);
  const segmentWidth = useRef(0);

  const selectedIndex = segments.findIndex((s) => s.key === selectedKey);

  // Update animation when selection changes
  useEffect(() => {
    if (segmentWidth.current > 0) {
      Animated.spring(slideAnim, {
        toValue: selectedIndex * segmentWidth.current,
        useNativeDriver: true,
        tension: 120,
        friction: 12,
      }).start();
    }
  }, [selectedIndex, slideAnim]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    containerWidth.current = width;
    segmentWidth.current = width / segments.length;
    // Set initial position without animation
    slideAnim.setValue(selectedIndex * segmentWidth.current);
  };

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      testID={testID}
    >
      {/* Sliding pill background */}
      <Animated.View
        style={[
          styles.pill,
          {
            width: `${100 / segments.length}%`,
            transform: [{ translateX: slideAnim }],
          },
        ]}
        testID={`${testID}-pill`}
      />

      {/* Segment buttons */}
      {segments.map((segment, index) => {
        const isSelected = segment.key === selectedKey;

        return (
          <TouchableOpacity
            key={segment.key}
            style={styles.segment}
            onPress={() => onSelect(segment.key)}
            activeOpacity={0.7}
            testID={`${testID}-segment-${segment.key}`}
          >
            <View style={styles.labelContainer}>
              <Text
                style={[
                  styles.label,
                  isSelected && styles.labelSelected,
                ]}
              >
                {segment.label}
              </Text>
              {segment.showBadge && (
                <View style={styles.badge} testID={`${testID}-badge-${segment.key}`} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginVertical: 8,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});

export default SegmentedControl;
