/**
 * SessionCard Component
 *
 * Displays a streamlined session summary with:
 * - Partner name
 * - Time since last activity
 * - Status summary (what you've done, what's happening with partner)
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { SessionSummaryDTO } from '@meet-without-fear/shared';
import { SessionStatus } from '@meet-without-fear/shared';
import { colors } from '@/theme';

// ============================================================================
// Types
// ============================================================================

interface SessionCardProps {
  /** The session data to display */
  session: SessionSummaryDTO;
  /** Whether to display as a hero card (larger, more prominent) */
  isHero?: boolean;
  /** Whether to remove bottom margin (useful when inside a swipeable) */
  noMargin?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format relative time from a date string.
 * Returns strings like "2h ago", "3d ago", "1w ago"
 */
function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}

/**
 * Get partner display name (prefer nickname over actual name)
 */
function getPartnerDisplayName(session: SessionSummaryDTO): string {
  return session.partner.nickname || session.partner.name || 'Partner';
}

// ============================================================================
// Component
// ============================================================================

/**
 * SessionCard displays a streamlined session summary.
 *
 * Features:
 * - Partner name display
 * - Time since last update
 * - Status summary (user status + partner status)
 * - Visual styling based on session state
 * - Navigates to session detail on press
 */
export function SessionCard({ session, isHero = false, noMargin = false }: SessionCardProps) {
  const router = useRouter();

  const partnerName = getPartnerDisplayName(session);
  const timeAgo = formatRelativeTime(session.updatedAt);

  // Fallback for sessions that don't have statusSummary yet (backwards compatibility)
  const statusSummary = session.statusSummary ?? {
    userStatus: session.selfActionNeeded.length > 0 ? 'Your turn' : 'In progress',
    partnerStatus: session.partnerActionNeeded.length > 0 ? `Waiting for ${partnerName}` : '',
  };
  const { userStatus, partnerStatus } = statusSummary;

  // Determine if this session needs attention (user has action to take)
  const needsAttention = session.selfActionNeeded.length > 0;

  // Determine card styling based on session status
  const isPaused = session.status === SessionStatus.PAUSED;
  const isResolved = session.status === SessionStatus.RESOLVED;

  const handlePress = () => {
    router.push(`/session/${session.id}`);
  };

  return (
    <TouchableOpacity
      testID={isHero ? 'hero-card' : 'session-card'}
      style={[
        styles.card,
        isHero && styles.heroCard,
        needsAttention && !isHero && styles.actionCard,
        isPaused && styles.pausedCard,
        isResolved && styles.resolvedCard,
        noMargin && styles.noMargin,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Session with ${partnerName}`}
      accessibilityHint="Tap to view session details"
    >
      {/* Header: Partner name and time */}
      <View style={styles.header}>
        <View style={styles.nameContainer}>
          {session.hasUnread && !isHero && (
            <View style={styles.unreadDot} testID="unread-dot" />
          )}
          <Text
            style={[styles.partnerName, isHero && styles.heroPartnerName]}
            numberOfLines={1}
          >
            {partnerName}
          </Text>
        </View>
        <Text style={[styles.timeAgo, isHero && styles.heroTimeAgo]}>
          {timeAgo}
        </Text>
      </View>

      {/* Status summary */}
      <View style={styles.statusContainer}>
        <Text
          style={[styles.userStatus, isHero && styles.heroUserStatus]}
          numberOfLines={1}
        >
          {userStatus}
        </Text>
        <Text
          style={[styles.partnerStatus, isHero && styles.heroPartnerStatus]}
          numberOfLines={1}
        >
          {partnerStatus}
        </Text>
      </View>

      {isHero && (
        <View style={styles.heroFooter}>
          <Text style={styles.heroHint}>Tap to continue</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Base card styles
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // No margin variant (for use inside swipeables)
  noMargin: {
    marginBottom: 0,
  },

  // Action needed card (subtle highlight)
  actionCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },

  // Paused card (muted)
  pausedCard: {
    opacity: 0.7,
  },

  // Resolved card (subtle success)
  resolvedCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },

  // Hero card variant
  heroCard: {
    backgroundColor: colors.accent,
    padding: 20,
    marginBottom: 20,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 0,
    borderColor: 'transparent',
  },

  // Header with name and time
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  // Name container (for unread dot + name alignment)
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },

  // Blue dot indicator for unread sessions
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginRight: 8,
  },

  // Partner name
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  heroPartnerName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },

  // Time ago text
  timeAgo: {
    fontSize: 13,
    color: colors.textMuted,
  },
  heroTimeAgo: {
    color: 'rgba(255, 255, 255, 0.7)',
  },

  // Status container
  statusContainer: {
    gap: 4,
  },

  // User status (what you've done)
  userStatus: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  heroUserStatus: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },

  // Partner status (what's happening with partner)
  partnerStatus: {
    fontSize: 13,
    color: colors.textMuted,
  },
  heroPartnerStatus: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },

  // Hero footer
  heroFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
});

export default SessionCard;
