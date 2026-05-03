/**
 * NeedsDrawer Component
 *
 * Bottom-sheet drawer for Stage 3 Need Mapping. Two modes:
 *
 * - `needs`: Review own needs with adjust/confirm actions
 * - `comparison`: Side-by-side view of both users' needs
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
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

export type NeedsDrawerMode = 'needs' | 'comparison';

interface NeedItem {
  id: string;
  category: string;
  need: string;
  confirmed: boolean;
}

export interface NeedsDrawerProps {
  visible: boolean;
  onClose: () => void;
  mode: NeedsDrawerMode;
  // Needs mode
  needs?: NeedItem[];
  onAdjustNeeds?: () => void;
  onConfirmNeeds?: () => void;
  confirmNeedsLabel?: string;
  confirmingNeedsLabel?: string;
  isConfirming?: boolean;
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
  confirmNeedsLabel = 'Confirm my needs',
  confirmingNeedsLabel = 'Sharing...',
  isConfirming = false,
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
  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT - POSITION_3Q);

  // -------------------------------------------------------------------------
  // Open / Close / Snap animations
  // -------------------------------------------------------------------------
  const snapTo = useCallback(
    (position: number, backdrop: number) => {
      setContentHeight(SCREEN_HEIGHT - position);
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
      <View style={[styles.fixedButtonArea, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
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
              style={[styles.primaryButton, isConfirming && styles.primaryButtonDisabled]}
              onPress={() => {
                if (!isConfirming) onConfirmNeeds();
              }}
              activeOpacity={0.7}
              disabled={isConfirming}
              testID={`${testID}-confirm`}
            >
              <Text style={styles.primaryButtonText}>
                {isConfirming ? confirmingNeedsLabel : confirmNeedsLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderSideBySideNeeds = () => {
    return (
      <View style={styles.comparisonContainer} testID={`${testID}-side-by-side`}>
        <View style={styles.comparisonColumn}>
          <Text style={styles.columnHeader}>You</Text>
          {needs.map((need) => (
            <View key={need.id} style={styles.comparisonCard}>
              <Text style={styles.comparisonCategory}>{need.category}</Text>
              <Text style={styles.comparisonNeed}>{need.need}</Text>
            </View>
          ))}
          {needs.length === 0 && (
            <Text style={styles.emptyColumnText}>Waiting for your needs</Text>
          )}
        </View>

        <View style={styles.comparisonColumn}>
          <Text style={styles.columnHeader}>{partnerName}</Text>
          {partnerNeeds.map((need) => (
            <View key={need.id} style={[styles.comparisonCard, styles.partnerComparisonCard]}>
              <Text style={styles.comparisonCategory}>{need.category}</Text>
              <Text style={styles.comparisonNeed}>{need.need}</Text>
            </View>
          ))}
          {partnerNeeds.length === 0 && (
            <Text style={styles.emptyColumnText}>Waiting for {partnerName}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderComparisonMode = () => (
    <>
      <Text style={styles.sectionSubtitle}>
        Review both needs lists side by side.
      </Text>
      {renderSideBySideNeeds()}
    </>
  );


  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!visible) return null;

  const headerText = mode === 'needs' ? 'Your Needs' : 'Needs Side by Side';

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
        {/* Content wrapper constrains layout to visible drawer area */}
        <View style={{ height: contentHeight }}>
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
            {mode === 'comparison' && renderComparisonMode()}
          </ScrollView>

          {/* Fixed footer buttons */}
          {mode === 'needs' && renderNeedsButtons()}
        </View>
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
    paddingBottom: 24,
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

  // Fixed button area at bottom of drawer
  fixedButtonArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    marginTop: 8,
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
  primaryButtonDisabled: {
    opacity: 0.7,
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
  partnerComparisonCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
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
  emptyColumnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

});

export default NeedsDrawer;
