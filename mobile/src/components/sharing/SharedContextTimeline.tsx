/**
 * SharedContextTimeline Component
 *
 * Displays a chronological timeline of all sharing activity in a session.
 * Shows empathy attempts, shared context, and validation events.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { ArrowUp, ArrowDown, Check, MessageSquare } from 'lucide-react-native';
import { colors } from '@/theme';
import { SharedContextHistoryItem } from '@/hooks/useSharingStatus';

// ============================================================================
// Types
// ============================================================================

export interface SharedContextTimelineProps {
  /** List of shared context items */
  items: SharedContextHistoryItem[];
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

function getItemConfig(item: SharedContextHistoryItem): {
  label: string;
  icon: React.ReactNode;
  color: string;
} {
  const isSent = item.direction === 'sent';

  switch (item.type) {
    case 'empathy_attempt':
      return {
        label: isSent ? 'Your understanding shared' : 'Their understanding received',
        icon: isSent ? (
          <ArrowUp color={colors.brandBlue} size={16} />
        ) : (
          <ArrowDown color={colors.success} size={16} />
        ),
        color: isSent ? colors.brandBlue : colors.success,
      };
    case 'shared_context':
      return {
        label: isSent ? 'Context shared' : 'Context received',
        icon: <MessageSquare color={colors.accent} size={16} />,
        color: colors.accent,
      };
    case 'validation':
      return {
        label: isSent ? 'You validated' : 'They validated',
        icon: <Check color={colors.success} size={16} />,
        color: colors.success,
      };
    default:
      return {
        label: 'Activity',
        icon: null,
        color: colors.textMuted,
      };
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TimelineItemProps {
  item: SharedContextHistoryItem;
  isLast: boolean;
  testID?: string;
}

function TimelineItem({ item, isLast, testID }: TimelineItemProps) {
  const config = getItemConfig(item);
  const timestamp = formatTimestamp(item.timestamp);

  return (
    <View style={styles.timelineItem} testID={testID}>
      {/* Timeline connector */}
      <View style={styles.connector}>
        <View style={[styles.iconContainer, { borderColor: config.color }]}>
          {config.icon}
        </View>
        {!isLast && <View style={styles.line} />}
      </View>

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemLabel}>{config.label}</Text>
          <Text style={styles.itemTimestamp}>{timestamp}</Text>
        </View>
        <Text style={styles.itemText}>
          "{item.content}"
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SharedContextTimeline({
  items,
  style,
  testID = 'shared-context-timeline',
}: SharedContextTimelineProps) {
  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer, style]} testID={testID}>
        <Text style={styles.emptyText}>No sharing activity yet</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.sectionTitle}>Sharing History</Text>
      {items.map((item, index) => (
        <TimelineItem
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
          testID={`${testID}-item-${index}`}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 60,
  },
  connector: {
    width: 32,
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: 4,
    marginBottom: 4,
  },
  itemContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemTimestamp: {
    fontSize: 12,
    color: colors.textMuted,
  },
  itemText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

export default SharedContextTimeline;
