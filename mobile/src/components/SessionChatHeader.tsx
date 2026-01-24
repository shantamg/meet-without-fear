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
import { ArrowLeft } from 'lucide-react-native';
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
  /** Tab configuration - when provided, shows tabs in header */
  tabs?: {
    /** Currently selected tab key */
    activeTab: 'ai' | 'partner';
    /** Callback when tab is selected */
    onTabChange: (tab: 'ai' | 'partner') => void;
    /** Whether to show badge on partner tab */
    showPartnerBadge?: boolean;
  };
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
  tabs,
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
  const shortPartnerName = partnerName && partnerName.length > 10
    ? partnerName.substring(0, 10) + '...'
    : partnerName;

  // Center content - either tabs or partner name + status
  const centerContent = tabs ? (
    // Tabbed layout: AI | Partner Name
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[
          styles.tab,
          tabs.activeTab === 'ai' && styles.tabActive,
        ]}
        onPress={() => tabs.onTabChange('ai')}
        testID={`${testID}-tab-ai`}
      >
        <Text style={[
          styles.tabText,
          tabs.activeTab === 'ai' && styles.tabTextActive,
        ]}>
          AI
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          tabs.activeTab === 'partner' && styles.tabActive,
        ]}
        onPress={() => tabs.onTabChange('partner')}
        testID={`${testID}-tab-partner`}
      >
        <View style={styles.tabContent}>
          <Text style={[
            styles.tabText,
            tabs.activeTab === 'partner' && styles.tabTextActive,
          ]}>
            {shortPartnerName || 'Partner'}
          </Text>
          {tabs.showPartnerBadge && (
            <View style={styles.tabBadge} testID={`${testID}-partner-badge`} />
          )}
        </View>
      </TouchableOpacity>
    </View>
  ) : (
    // Default layout: partner name + status
    <View style={styles.centerSection}>
      <Text
        style={styles.partnerName}
        numberOfLines={1}
        testID={`${testID}-partner-name`}
      >
        {displayName}
      </Text>
      {!hideOnlineStatus && (
        <View style={styles.statusRow}>
          <StatusDot isOnline={isOnline} />
          <Text
            style={[styles.onlineText, isOnline && styles.onlineTextActive]}
            testID={`${testID}-online-status`}
          >
            {getOnlineText()}
          </Text>
        </View>
      )}
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

      {/* Right section: Brief status */}
      <View style={styles.rightSection}>
        {briefStatus && (
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
        )}
        {/* Spacer if no right content to balance the layout */}
        {!briefStatus && (
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
      width: 44,
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
    // Tab styles for inline header tabs
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 8,
      padding: 2,
    },
    tab: {
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabActive: {
      backgroundColor: t.colors.bgPrimary,
    },
    tabText: {
      fontSize: t.typography.fontSize.sm,
      fontWeight: '500',
      color: t.colors.textSecondary,
    },
    tabTextActive: {
      color: t.colors.textPrimary,
      fontWeight: '600',
    },
    tabContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    tabBadge: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: t.colors.accent,
    },
  }));

// ============================================================================
// Exports
// ============================================================================

export default SessionChatHeader;
