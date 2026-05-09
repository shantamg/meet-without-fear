/**
 * TakeawayReviewSheet Component
 *
 * A full-screen slide-up sheet for reviewing, editing, and deleting distilled
 * takeaways from an Inner Thoughts session.
 *
 * Features:
 * - Slide-up animation using the project's Animated.Value pattern
 * - FlatList of TakeawayRow components (view/edit + swipe-to-delete)
 * - Swipeable delete action via react-native-gesture-handler
 * - Optimistic updates — edits and deletions reflect instantly
 * - Semi-transparent overlay that closes the sheet on tap
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import type { TakeawayDTO } from '@meet-without-fear/shared';
import { useTakeaways, useUpdateTakeaway, useDeleteTakeaway } from '../hooks/useDistillation';
import { TakeawayRow } from './TakeawayRow';
import { appWidthStyle, useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface TakeawayReviewSheetProps {
  sessionId: string;
  visible: boolean;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function TakeawayReviewSheet({ sessionId, visible, onClose }: TakeawayReviewSheetProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ---- Animation -----------------------------------------------------------
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, sheetAnim]);

  // ---- Data ----------------------------------------------------------------
  const { data, isLoading } = useTakeaways(sessionId);
  const updateTakeaway = useUpdateTakeaway(sessionId);
  const deleteTakeaway = useDeleteTakeaway(sessionId);

  const takeaways = data?.takeaways ?? [];

  // ---- Swipeable refs ------------------------------------------------------
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const closeAllSwipeables = useCallback(() => {
    swipeableRefs.current.forEach((ref) => ref.close());
  }, []);

  // ---- Handlers ------------------------------------------------------------
  const handleUpdate = useCallback(
    (takeawayId: string, content: string) => {
      updateTakeaway.mutate({ takeawayId, content });
    },
    [updateTakeaway]
  );

  const handleDelete = useCallback(
    (takeawayId: string) => {
      // Close the swipeable before removing the row
      swipeableRefs.current.get(takeawayId)?.close();
      deleteTakeaway.mutate({ takeawayId });
    },
    [deleteTakeaway]
  );

  // ---- Render helpers ------------------------------------------------------
  const renderRightActions = useCallback(
    (takeawayId: string) => (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDelete(takeawayId)}
        accessibilityRole="button"
        accessibilityLabel="Delete takeaway"
      >
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    ),
    [handleDelete, styles.deleteAction, styles.deleteActionText]
  );

  const renderItem = useCallback(
    ({ item }: { item: TakeawayDTO }) => (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
          else swipeableRefs.current.delete(item.id);
        }}
        renderRightActions={() => renderRightActions(item.id)}
      >
        <TakeawayRow
          takeaway={item}
          onUpdate={handleUpdate}
          onStartEdit={closeAllSwipeables}
        />
      </Swipeable>
    ),
    [renderRightActions, handleUpdate, closeAllSwipeables]
  );

  // Only render when visible (parent controls mounting/unmounting)
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Semi-transparent background — tap to close */}
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close takeaway sheet">
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: sheetAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.5],
              }),
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Slide-up sheet */}
      <Animated.View
        style={[
          styles.sheet,
          appWidthStyle,
          {
            paddingBottom: insets.bottom,
            transform: [
              {
                translateY: sheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [windowHeight, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Sheet header */}
        <View style={styles.header}>
          <View style={styles.headerHandle} />
          <Text style={styles.headerTitle}>Takeaways</Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : takeaways.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No takeaways yet</Text>
          </View>
        ) : (
          <FlatList
            data={takeaways}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const DELETE_TEXT = '#ffffff';

const makeStyles = (palette: Palette) => StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 200,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      // Take up most of the screen height
      height: '85%',
      backgroundColor: palette.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.borderStrong,
      backgroundColor: palette.bgElev,
    },
    headerHandle: {
      // Visual drag handle (decorative)
      position: 'absolute',
      top: 8,
      left: '50%',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.textFaint,
      marginLeft: -20,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '600',
      color: palette.text,
      textAlign: 'center',
    },
    doneButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    doneButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: palette.accentText,
    },
    listContent: {
      flexGrow: 1,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    emptyText: {
      fontSize: 16,
      color: palette.textFaint,
    },
    deleteAction: {
      backgroundColor: palette.danger,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
    },
    deleteActionText: {
      color: DELETE_TEXT,
      fontSize: 14,
      fontWeight: '600',
    },
  });
