/**
 * NeedsDrawer Component
 *
 * Bottom-sheet drawer for Stage 3 Need Mapping. Replaces inline cards
 * that previously took over the chat FlatList. Three modes:
 *
 * - `needs`: Review own needs with adjust/confirm actions
 * - `common-ground`: Review common ground with confirm action
 * - `comparison`: Side-by-side view of both users' needs + common ground
 */

import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { NeedCard } from './NeedCard';

// ============================================================================
// Types
// ============================================================================

export type NeedsDrawerMode = 'needs' | 'common-ground' | 'comparison';

interface NeedItem {
  id: string;
  category: string;
  need: string;
  confirmed: boolean;
}

interface CommonGroundItem {
  id: string;
  category: string;
  need: string;
  confirmedByMe: boolean;
  confirmedByPartner: boolean;
}

export interface NeedsDrawerProps {
  visible: boolean;
  onClose: () => void;
  mode: NeedsDrawerMode;
  // Needs mode
  needs?: NeedItem[];
  onAdjustNeeds?: () => void;
  onConfirmNeeds?: () => void;
  // Common Ground mode
  commonGround?: CommonGroundItem[];
  noOverlap?: boolean;
  onConfirmCommonGround?: () => void;
  onViewComparison?: () => void;
  // Comparison mode
  partnerNeeds?: NeedItem[];
  partnerName?: string;
  testID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SCREEN_HEIGHT = Dimensions.get('window').height;
const POSITION_3Q = SCREEN_HEIGHT * 0.25;
const SNAP_UP_THRESHOLD = 80;
const SNAP_DOWN_THRESHOLD = 100;

// ============================================================================
// Component
// ============================================================================

export function NeedsDrawer({
  visible,
  onClose,
  mode,
  needs = [],
  onAdjustNeeds,
  onConfirmNeeds,
  commonGround = [],
  noOverlap = false,
  onConfirmCommonGround,
  onViewComparison,
  partnerNeeds = [],
  partnerName = 'Partner',
  testID = 'needs-drawer',
}: NeedsDrawerProps) {
  const insets = useSafeAreaInsets();
  const positionFullRef = useRef(insets.top);
  positionFullRef.current = insets.top;

  // -------------------------------------------------------------------------
  // Animation refs
  // -------------------------------------------------------------------------
  const drawerTranslate = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);
  const currentSnap = useRef<'3q' | 'full'>('3q');

  // -------------------------------------------------------------------------
  // Open / Close / Snap animations
  // -------------------------------------------------------------------------
  const snapTo = useCallback(
    (position: number, backdrop: number) => {
      Animated.parallel([
        Animated.spring(drawerTranslate, {
          toValue: position,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: backdrop,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [drawerTranslate, backdropOpacity],
  );

  const openDrawer = useCallback(() => {
    currentSnap.current = '3q';
    snapTo(POSITION_3Q, 0.4);
  }, [snapTo]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerTranslate, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      currentSnap.current = '3q';
      onClose();
    });
  }, [drawerTranslate, backdropOpacity, onClose]);

  useEffect(() => {
    if (visible) {
      openDrawer();
    }
  }, [visible, openDrawer]);

  // -------------------------------------------------------------------------
  // Android back button
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, closeDrawer]);

  // -------------------------------------------------------------------------
  // PanResponder
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        const pFull = positionFullRef.current;
        const base = currentSnap.current === 'full' ? pFull : POSITION_3Q;
        const newPos = base + gestureState.dy;
        const clamped = Math.max(pFull, Math.min(newPos, SCREEN_HEIGHT));
        drawerTranslate.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDragging.current = false;
        const pFull = positionFullRef.current;
        const { dy, vy } = gestureState;

        if (currentSnap.current === '3q') {
          if (dy < -SNAP_UP_THRESHOLD || vy < -0.5) {
            currentSnap.current = 'full';
            snapTo(pFull, 0.6);
          } else if (dy > SNAP_DOWN_THRESHOLD || vy > 0.5) {
            closeDrawer();
          } else {
            snapTo(POSITION_3Q, 0.4);
          }
        } else {
          if (dy > SNAP_DOWN_THRESHOLD || vy > 0.5) {
            currentSnap.current = '3q';
            snapTo(POSITION_3Q, 0.4);
          } else {
            snapTo(pFull, 0.6);
          }
        }
      },
    }),
  ).current;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const renderNeedsMode = () => (
    <>
      <Text style={styles.sectionTitle}>Your Identified Needs</Text>
      <Text style={styles.sectionSubtitle}>
        Review and confirm the needs identified from your conversation.
      </Text>

      {needs.map((need) => (
        <NeedCard
          key={need.id}
          need={{ category: need.category, description: need.need }}
          isShared={need.confirmed}
          testID={`${testID}-need-${need.id}`}
        />
      ))}

      {needs.length === 0 && (
        <Text style={styles.emptyText}>No needs identified yet.</Text>
      )}
    </>
  );

  const renderNeedsButtons = () => {
    const hasButtons = onAdjustNeeds || onConfirmNeeds;
    if (!hasButtons) return null;
    return (
      <View style={styles.fixedButtonArea}>
        <View style={styles.buttonRow}>
          {onAdjustNeeds && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                closeDrawer();
                onAdjustNeeds();
              }}
              activeOpacity={0.7}
              testID={`${testID}-adjust`}
            >
              <Text style={styles.secondaryButtonText}>Adjust these</Text>
            </TouchableOpacity>
          )}
          {onConfirmNeeds && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                onConfirmNeeds();
                closeDrawer();
              }}
              activeOpacity={0.7}
              testID={`${testID}-confirm`}
            >
              <Text style={styles.primaryButtonText}>Confirm my needs</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderCommonGroundMode = () => (
    <>
      {noOverlap ? (
        <Text style={styles.noOverlapText}>
          No obvious common ground identified. That's completely normal — you
          can still move forward productively.
        </Text>
      ) : (
        <>
          <Text style={styles.sectionSubtitle}>
            Shared needs discovered between you and {partnerName}.
          </Text>

          {commonGround.map((cg) => (
            <View key={cg.id} style={styles.commonGroundItem}>
              <View style={styles.commonGroundBadge}>
                <Text style={styles.commonGroundBadgeText}>Shared</Text>
              </View>
              <Text style={styles.commonGroundCategory}>{cg.category}</Text>
              <Text style={styles.commonGroundNeed}>{cg.need}</Text>
            </View>
          ))}

          {commonGround.length === 0 && (
            <Text style={styles.emptyText}>
              Common ground analysis is not yet complete.
            </Text>
          )}
        </>
      )}
    </>
  );

  const renderCommonGroundButtons = () => {
    if (noOverlap) {
      return onConfirmCommonGround ? (
        <View style={styles.fixedButtonArea}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.fullWidthButton]}
            onPress={() => {
              onConfirmCommonGround();
              closeDrawer();
            }}
            activeOpacity={0.7}
            testID={`${testID}-no-overlap-continue`}
          >
            <Text style={styles.primaryButtonText}>Continue to Strategies</Text>
          </TouchableOpacity>
        </View>
      ) : null;
    }
    const hasButtons = onViewComparison || onConfirmCommonGround;
    if (!hasButtons) return null;
    return (
      <View style={styles.fixedButtonArea}>
        <View style={styles.buttonRow}>
          {onViewComparison && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onViewComparison}
              activeOpacity={0.7}
              testID={`${testID}-view-comparison`}
            >
              <Text style={styles.secondaryButtonText}>Compare</Text>
            </TouchableOpacity>
          )}
          {onConfirmCommonGround && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                onConfirmCommonGround();
                closeDrawer();
              }}
              activeOpacity={0.7}
              testID={`${testID}-confirm-cg`}
            >
              <Text style={styles.primaryButtonText}>Confirm</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderComparisonMode = () => {
    // Identify common ground need IDs for highlighting
    const commonGroundNeeds = new Set(commonGround.map((cg) => cg.need.toLowerCase()));

    return (
      <>
        <Text style={styles.sectionTitle}>Needs Comparison</Text>
        <Text style={styles.sectionSubtitle}>
          Side-by-side view of both your needs.
        </Text>

        <View style={styles.comparisonContainer}>
          {/* My needs column */}
          <View style={styles.comparisonColumn}>
            <Text style={styles.columnHeader}>Your needs</Text>
            {needs.map((need) => {
              const isCommon = commonGroundNeeds.has(need.need.toLowerCase());
              return (
                <View
                  key={need.id}
                  style={[
                    styles.comparisonCard,
                    isCommon && styles.comparisonCardCommon,
                  ]}
                >
                  <Text style={styles.comparisonCategory}>{need.category}</Text>
                  <Text style={styles.comparisonNeed}>{need.need}</Text>
                  {isCommon && (
                    <View style={styles.commonBadgeSmall}>
                      <Text style={styles.commonBadgeSmallText}>Common</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {needs.length === 0 && (
              <Text style={styles.emptyColumnText}>No needs yet</Text>
            )}
          </View>

          {/* Partner needs column */}
          <View style={styles.comparisonColumn}>
            <Text style={styles.columnHeader}>{partnerName}'s needs</Text>
            {partnerNeeds.map((need) => {
              const isCommon = commonGroundNeeds.has(need.need.toLowerCase());
              return (
                <View
                  key={need.id}
                  style={[
                    styles.comparisonCard,
                    isCommon && styles.comparisonCardCommon,
                  ]}
                >
                  <Text style={styles.comparisonCategory}>{need.category}</Text>
                  <Text style={styles.comparisonNeed}>{need.need}</Text>
                  {isCommon && (
                    <View style={styles.commonBadgeSmall}>
                      <Text style={styles.commonBadgeSmallText}>Common</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {partnerNeeds.length === 0 && (
              <Text style={styles.emptyColumnText}>No needs yet</Text>
            )}
          </View>
        </View>

        {/* Common ground summary */}
        {commonGround.length > 0 && (
          <View style={styles.commonGroundSummary}>
            <Text style={styles.commonGroundSummaryTitle}>
              {commonGround.length} shared {commonGround.length === 1 ? 'need' : 'needs'}
            </Text>
            <Text style={styles.commonGroundSummaryText}>
              When we see our shared needs, we remember we're on the same team.
            </Text>
          </View>
        )}
      </>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!visible) return null;

  const headerText =
    mode === 'needs'
      ? 'Your Needs'
      : mode === 'common-ground'
        ? 'Common Ground'
        : 'Needs Comparison';

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
      pointerEvents="auto"
      testID={testID}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdropPressable}
        onPress={() => {
          if (!isDragging.current) closeDrawer();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Close ${headerText}`}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            height: SCREEN_HEIGHT,
            transform: [{ translateY: drawerTranslate }],
          },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
          <View style={styles.dragHandle} />
        </View>

        {/* Header */}
        <Text
          style={styles.header}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID={`${testID}-header`}
        >
          {headerText}
        </Text>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          {mode === 'needs' && renderNeedsMode()}
          {mode === 'common-ground' && renderCommonGroundMode()}
          {mode === 'comparison' && renderComparisonMode()}
        </ScrollView>

        {/* Fixed buttons at bottom — outside ScrollView to avoid overflow issues */}
        {mode === 'needs' && renderNeedsButtons()}
        {mode === 'common-ground' && renderCommonGroundButtons()}
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    elevation: 10,
  },
  dragHandleArea: {
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgTertiary,
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 40,
  },

  // Section text
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    marginHorizontal: 16,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    fontStyle: 'italic',
    marginHorizontal: 16,
  },

  // Fixed button area at bottom of drawer (outside ScrollView)
  fixedButtonArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  fullWidthButton: {
    flex: undefined,
  },

  // Common ground items
  commonGroundItem: {
    backgroundColor: 'rgba(167, 243, 208, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.4)',
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    position: 'relative',
  },
  commonGroundBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  commonGroundBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commonGroundCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
    marginBottom: 4,
  },
  commonGroundNeed: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  noOverlapText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingVertical: 16,
    marginHorizontal: 16,
  },

  // Comparison view
  comparisonContainer: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
  },
  comparisonColumn: {
    flex: 1,
  },
  columnHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  comparisonCard: {
    backgroundColor: 'rgba(147, 197, 253, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    padding: 10,
    marginBottom: 8,
    position: 'relative',
  },
  comparisonCardCommon: {
    backgroundColor: 'rgba(167, 243, 208, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(110, 231, 183, 0.5)',
  },
  comparisonCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  comparisonNeed: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  commonBadgeSmall: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  commonBadgeSmallText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyColumnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Common ground summary
  commonGroundSummary: {
    backgroundColor: 'rgba(167, 243, 208, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginHorizontal: 16,
    alignItems: 'center',
  },
  commonGroundSummaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.success,
    marginBottom: 4,
  },
  commonGroundSummaryText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textPrimary,
    lineHeight: 20,
    textAlign: 'center',
  },
});

export default NeedsDrawer;
