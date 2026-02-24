/**
 * ReceivedItemsList Component
 *
 * ScrollView of ReceivedItemCard components.
 * Shows items from the partner: share offers, empathy needing validation, received context.
 */

import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { ReceivedItemCard, ReceivedItem } from './ReceivedItemCard';

// ============================================================================
// Types
// ============================================================================

export interface ReceivedItemsListProps {
  items: ReceivedItem[];
  partnerName?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onRefine?: (offerId: string) => void;
  onShareAsIs?: (offerId: string) => void;
  onValidate?: (attemptId: string, rating: 'accurate' | 'partial' | 'inaccurate') => void;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ReceivedItemsList({
  items,
  partnerName,
  isRefreshing = false,
  onRefresh,
  onRefine,
  onShareAsIs,
  onValidate,
  testID = 'received-items-list',
}: ReceivedItemsListProps) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer} testID={`${testID}-empty`}>
        <Text style={styles.emptyIcon}>📬</Text>
        <Text style={styles.emptyTitle}>Nothing received yet</Text>
        <Text style={styles.emptySubtitle}>
          Items from {partnerName || 'the other person'} will appear here
        </Text>
      </View>
    );
  }

  const pendingItems = items.filter(i => i.isPending);
  const historicalItems = items.filter(i => !i.isPending);
  const hasBothSections = pendingItems.length > 0 && historicalItems.length > 0;

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
      {hasBothSections && pendingItems.length > 0 && (
        <Text style={styles.sectionHeader}>Needs your response</Text>
      )}
      {pendingItems.map((item) => (
        <ReceivedItemCard
          key={item.id}
          item={item}
          onRefine={onRefine}
          onShareAsIs={onShareAsIs}
          onValidate={onValidate}
          style={styles.card}
          testID={`${testID}-card-${item.id}`}
        />
      ))}
      {hasBothSections && historicalItems.length > 0 && (
        <Text style={styles.sectionHeader}>Previously received</Text>
      )}
      {historicalItems.map((item) => (
        <ReceivedItemCard
          key={item.id}
          item={item}
          onRefine={onRefine}
          onShareAsIs={onShareAsIs}
          onValidate={onValidate}
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 2,
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

export default ReceivedItemsList;
