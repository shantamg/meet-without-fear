/**
 * SentItemsList Component
 *
 * ScrollView of SentItemCard components.
 * Shows empathy attempts and shared context sent by the current user.
 */

import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { SentItemCard, SentItem } from './SentItemCard';

// ============================================================================
// Types
// ============================================================================

export interface SentItemsListProps {
  items: SentItem[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SentItemsList({
  items,
  isRefreshing = false,
  onRefresh,
  testID = 'sent-items-list',
}: SentItemsListProps) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer} testID={`${testID}-empty`}>
        <Text style={styles.emptyIcon}>💡</Text>
        <Text style={styles.emptyTitle}>Nothing sent yet</Text>
        <Text style={styles.emptySubtitle}>
          Items you share will appear here
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        ) : undefined
      }
      testID={testID}
    >
      {items.map((item) => (
        <SentItemCard
          key={item.id}
          item={item}
          style={styles.card}
          testID={`${testID}-card-${item.id}`}
        />
      ))}
    </ScrollView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  card: {
    // Spacing handled by gap on contentContainer
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default SentItemsList;
