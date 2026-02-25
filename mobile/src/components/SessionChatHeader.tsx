/**
 * SessionChatHeader Component
 *
 * A minimal, chat-centric header for session screens.
 * Layout: [Back Arrow] - [Centered Partner Name + Status] - [Sharing Button + Brief Status]
 * No spinners - just clean, simple status display.
 * Designed to feel like a messaging app rather than a dashboard.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { ArrowLeft, BookOpen } from 'lucide-react-native';
import { ConnectionStatus } from '@meet-without-fear/shared';
import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

export interface SessionChatHeaderProps {
  /** Partner's display name (nickname) */
  partnerName?: string | null;
  /** Whether the partner is currently online */
  partnerOnline?: boolean;
  /** Whether the partner is currently typing (ignored - no typing indicator in header) */
  partnerTyping?: boolean;
  /** Connection status to the server */
  connectionStatus?: ConnectionStatus;
  /** Brief status text to show on the right (e.g., "invited", "active", etc.) */
  briefStatus?: string;
  /** Hide the online/offline status row (e.g., during invitation crafting before partner exists) */
  hideOnlineStatus?: boolean;
  /** Callback when back button is pressed */
  onBackPress?: () => void;
  /** Optional callback when header center is pressed (e.g., to show session info) */
  onPress?: () => void;
  /** Optional callback when brief status is pressed (e.g., to show invitation options) */
  onBriefStatusPress?: () => void;
  /** Whether there is new activity to indicate with a dot badge */
  hasNewActivity?: boolean;
  /** Callback when the activity menu icon is pressed */
  onMenuPress?: () => void;
  /** Current stage friendly name to display below partner name */
  stageName?: string;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Simple online/offline status indicator dot
 */
function StatusDot({
  isOnline,
  size = 8,
}: {
  isOnline: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isOnline ? colors.success : colors.textMuted,
      }}
      testID="status-dot"
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SessionChatHeader({
  partnerName,
  partnerOnline = false,
  partnerTyping: _partnerTyping = false, // Ignored - no typing indicator in header
  connectionStatus = ConnectionStatus.CONNECTED,
  briefStatus,
  hideOnlineStatus = false,
  onBackPress,
  onPress,
  onBriefStatusPress,
  hasNewActivity = false,
  onMenuPress,
  stageName,
  style,
  testID = 'session-chat-header',
}: SessionChatHeaderProps) {
  const styles = useStyles();

  // Determine if partner is effectively online
  // If no partner (AI mode), always show as "online"
  const isOnline = !partnerName
    ? true
    : connectionStatus === ConnectionStatus.CONNECTED && partnerOnline;

  // Get the online/offline text
  const getOnlineText = (): string => {
    if (!partnerName) {
      return 'online'; // AI is always online
    }
    return isOnline ? 'online' : 'offline';
  };

  const displayName = partnerName || 'Meet Without Fear';

  // Center content - always partner name + status (whether tabs or not)
  const centerContent = (
    <View style={styles.centerSection}>
      <Text
        style={styles.partnerName}
        numberOfLines={1}
        testID={`${testID}-partner-name`}
      >
        {displayName}
      </Text>
      {stageName ? (
        <Text
          style={styles.stageNameText}
          numberOfLines={1}
          testID={`${testID}-stage-name`}
        >
          {stageName}
        </Text>
      ) : !hideOnlineStatus ? (
        <View style={styles.statusRow}>
          <StatusDot isOnline={isOnline} />
          <Text
            style={[styles.onlineText, isOnline && styles.onlineTextActive]}
            testID={`${testID}-online-status`}
          >
            {getOnlineText()}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Left section: Back button */}
      <View style={styles.leftSection}>
        {onBackPress ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBackPress}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID={`${testID}-back-button`}
          >
            <ArrowLeft color={colors.textPrimary} size={24} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonSpacer} />
        )}
      </View>

      {/* Center section: Partner name + status (optionally tappable) */}
      {onPress ? (
        <TouchableOpacity
          style={styles.centerTouchable}
          onPress={onPress}
          activeOpacity={0.7}
          testID={`${testID}-center-touchable`}
        >
          {centerContent}
        </TouchableOpacity>
      ) : (
        centerContent
      )}

      {/* Right section: Activity menu icon or brief status */}
      <View style={styles.rightSection}>
        {onMenuPress ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={onMenuPress}
            accessibilityRole="button"
            accessibilityLabel={hasNewActivity ? "Open exchange history, new activity" : "Open exchange history"}
            testID={`${testID}-menu-button`}
          >
            <BookOpen color={colors.textPrimary} size={20} />
            {hasNewActivity && (
              <View
                style={styles.activityDot}
                testID={`${testID}-activity-dot`}
                accessibilityLabel="New activity available"
              />
            )}
          </TouchableOpacity>
        ) : briefStatus ? (
          onBriefStatusPress ? (
            <TouchableOpacity
              style={styles.briefStatusPill}
              onPress={onBriefStatusPress}
              activeOpacity={0.6}
              testID={`${testID}-brief-status-touchable`}
            >
              <Text
                style={styles.briefStatusText}
                numberOfLines={1}
                testID={`${testID}-brief-status`}
              >
                {briefStatus}
              </Text>
              <Text style={styles.briefStatusChevron}>›</Text>
            </TouchableOpacity>
          ) : (
            <Text
              style={styles.briefStatus}
              numberOfLines={1}
              testID={`${testID}-brief-status`}
            >
              {briefStatus}
            </Text>
          )
        ) : (
          <View style={styles.rightSpacer} />
        )}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.sm,
      paddingVertical: t.spacing.sm,
      backgroundColor: t.colors.bgSecondary,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      minHeight: 56,
    },
    leftSection: {
      minWidth: 44,
      alignItems: 'flex-start',
    },
    backButton: {
      padding: t.spacing.xs,
    },
    backButtonSpacer: {
      width: 32,
    },
    centerSection: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerTouchable: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rightSection: {
      minWidth: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: t.spacing.xs,
    },
    rightSpacer: {
      width: 32,
    },
    // Activity menu button
    menuButton: {
      padding: t.spacing.xs,
      position: 'relative',
    },
    activityDot: {
      position: 'absolute' as const,
      top: 4,
      right: 2,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.accent,
    },
    partnerName: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
      textAlign: 'center',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    onlineText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textMuted,
    },
    onlineTextActive: {
      color: t.colors.success,
    },
    stageNameText: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
      textAlign: 'center' as const,
      marginTop: 1,
    },
    briefStatus: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
      fontStyle: 'italic',
    },
    // Tappable pill style for brief status when it has an onPress handler
    briefStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.sm,
      paddingVertical: t.spacing.xs,
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.colors.border,
      gap: 4,
    },
    briefStatusText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
    },
    briefStatusChevron: {
      fontSize: 14,
      color: t.colors.textMuted,
      fontWeight: '600',
    },
  }));

// ============================================================================
// Exports
// ============================================================================

export default SessionChatHeader;
