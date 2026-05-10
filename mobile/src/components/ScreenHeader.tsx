/**
 * ScreenHeader Component
 *
 * A reusable header component for screens with:
 * - Optional back button on the left
 * - Centered title with optional icon
 * - Optional right action(s)
 * - Consistent styling across the app
 */

import React, { ReactNode } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { designFonts, useAppAppearance } from '../theme';
import { HeaderBackButton } from './HeaderBackButton';

// ============================================================================
// Types
// ============================================================================

export interface ScreenHeaderProps {
  /** Title text to display in the center */
  title: string;
  /** Optional icon to show before the title */
  titleIcon?: ReactNode;
  /** Show back button (defaults to true) */
  showBackButton?: boolean;
  /** Custom back button handler (defaults to router.back()) */
  onBackPress?: () => void;
  /** Right side action button */
  rightAction?: {
    icon: ReactNode;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    accessibilityLabel: string;
  };
  /** Additional right side content (for custom layouts) */
  rightContent?: ReactNode;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ScreenHeader({
  title,
  titleIcon,
  showBackButton = true,
  onBackPress,
  rightAction,
  rightContent,
  testID = 'screen-header',
}: ScreenHeaderProps) {
  const { palette } = useAppAppearance();
  const router = useRouter();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: palette.bg,
          borderBottomColor: palette.divider,
        },
      ]}
      testID={testID}
    >
      {/* Left section */}
      <View style={styles.leftSection}>
        {showBackButton ? (
          <HeaderBackButton onPress={handleBackPress} testID={`${testID}-back-button`} />
        ) : (
          <View style={styles.headerButtonSpacer} />
        )}
      </View>

      {/* Center section */}
      <View style={styles.titleContainer}>
        {titleIcon}
        <Text style={[styles.titleText, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* Right section */}
      <View style={styles.rightSection}>
        {rightAction ? (
          <Pressable
            style={styles.headerButton}
            onPress={rightAction.onPress}
            disabled={rightAction.disabled || rightAction.loading}
            accessibilityRole="button"
            accessibilityLabel={rightAction.accessibilityLabel}
            testID={`${testID}-right-action`}
          >
            {rightAction.loading ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : (
              rightAction.icon
            )}
          </Pressable>
        ) : rightContent ? (
          rightContent
        ) : (
          <View style={styles.headerButtonSpacer} />
        )}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  leftSection: {
    width: 44,
    alignItems: 'flex-start',
  },
  rightSection: {
    width: 44,
    alignItems: 'flex-end',
  },
  headerButton: {
    padding: 4,
  },
  headerButtonSpacer: {
    width: 24,
    height: 24,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
});

// ============================================================================
// Exports
// ============================================================================

export default ScreenHeader;
