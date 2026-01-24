/**
 * BadgeIndicator Component
 *
 * A reusable badge overlay component for showing count on buttons.
 * Supports animation and can be positioned relative to its parent.
 */

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, ViewStyle } from 'react-native';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

export interface BadgeIndicatorProps {
  /** The count to display */
  count: number;
  /** Whether to show the badge (defaults to count > 0) */
  visible?: boolean;
  /** Size of the badge (default: 'default') */
  size?: 'small' | 'default' | 'large';
  /** Background color (default: accent color) */
  color?: string;
  /** Text color (default: textOnAccent) */
  textColor?: string;
  /** Position relative to parent (default: top-right) */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Offset from the corner */
  offset?: { x?: number; y?: number };
  /** Whether to animate on first appearance */
  animate?: boolean;
  /** Custom style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Size configurations
// ============================================================================

const sizeConfig = {
  small: {
    minSize: 16,
    fontSize: 10,
    paddingHorizontal: 4,
  },
  default: {
    minSize: 20,
    fontSize: 12,
    paddingHorizontal: 6,
  },
  large: {
    minSize: 24,
    fontSize: 14,
    paddingHorizontal: 8,
  },
};

// ============================================================================
// Component
// ============================================================================

export function BadgeIndicator({
  count,
  visible,
  size = 'default',
  color = colors.accent,
  textColor = colors.textOnAccent,
  position = 'top-right',
  offset = {},
  animate = true,
  style,
  testID = 'badge-indicator',
}: BadgeIndicatorProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const isVisible = visible ?? count > 0;
  const config = sizeConfig[size];

  // Animate badge appearance
  useEffect(() => {
    if (isVisible && animate) {
      // Spring animation for bouncy entrance
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else if (!isVisible) {
      // Quick fade out
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else if (!animate) {
      scaleAnim.setValue(1);
    }
  }, [isVisible, animate, scaleAnim]);

  if (!isVisible) {
    return null;
  }

  // Position styles
  const positionStyles: ViewStyle = {};
  const offsetX = offset.x ?? -4;
  const offsetY = offset.y ?? -4;

  switch (position) {
    case 'top-right':
      positionStyles.top = offsetY;
      positionStyles.right = offsetX;
      break;
    case 'top-left':
      positionStyles.top = offsetY;
      positionStyles.left = offsetX;
      break;
    case 'bottom-right':
      positionStyles.bottom = offsetY;
      positionStyles.right = offsetX;
      break;
    case 'bottom-left':
      positionStyles.bottom = offsetY;
      positionStyles.left = offsetX;
      break;
  }

  // Display text (max 99+)
  const displayText = count > 99 ? '99+' : count.toString();

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: color,
          minWidth: config.minSize,
          minHeight: config.minSize,
          paddingHorizontal: config.paddingHorizontal,
          transform: [{ scale: scaleAnim }],
        },
        positionStyles,
        style,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize: config.fontSize,
          },
        ]}
        testID={`${testID}-text`}
      >
        {displayText}
      </Text>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  text: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

export default BadgeIndicator;
