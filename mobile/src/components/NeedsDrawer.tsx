/**
 * NeedsDrawer Component
 *
 * Bottom-sheet drawer for Stage 3 Need Mapping. Two modes:
 *
 * - `needs`: Review own needs with adjust/confirm actions
 * - `reveal`: Side-by-side view of both users' needs
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
  StyleSheet,
  BackHandler,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appWidthStyle, useAppAppearance } from '@/theme';
import { NeedCard } from './NeedCard';

// ============================================================================
// Types
// ============================================================================

export type NeedsDrawerMode = 'needs' | 'reveal';

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
  // Reveal mode
  partnerNeeds?: NeedItem[];
  partnerName?: string;
  onValidateNeeds?: () => void;
  onNeedsNotValidYet?: () => void;
  testID?: string;
}

// ============================================================================
// Constants
// ============================================================================

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
  onValidateNeeds,
  onNeedsNotValidYet,
  testID = 'needs-drawer',
}: NeedsDrawerProps) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppAppearance();
  const styles = makeStyles(palette);
  const { height: windowHeight } = useWindowDimensions();
  const [drawerHostHeight, setDrawerHostHeight] = useState(windowHeight);
  const position3Q = drawerHostHeight * 0.25;
  const drawerHostHeightRef = useRef(drawerHostHeight);
  const position3QRef = useRef(position3Q);
  const positionFullRef = useRef(insets.top);
  drawerHostHeightRef.current = drawerHostHeight;
  position3QRef.current = position3Q;
  positionFullRef.current = insets.top;

  // -------------------------------------------------------------------------
  // Animation refs
  // -------------------------------------------------------------------------
  const drawerTranslate = useRef(new Animated.Value(drawerHostHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);
  const isClosing = useRef(false);
  const currentSnap = useRef<'3q' | 'full'>('3q');
  const wasOpened = useRef(visible);
  const [isMounted, setIsMounted] = useState(visible);
  const [contentHeight, setContentHeight] = useState(drawerHostHeight - position3Q);
  const [backdropTouchableHeight, setBackdropTouchableHeight] = useState(position3Q);

  const handleHostLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    if (measuredHeight > 0) {
      setDrawerHostHeight((current) =>
        Math.abs(current - measuredHeight) > 1 ? measuredHeight : current,
      );
    }
  }, []);

  // -------------------------------------------------------------------------
  // Open / Close / Snap animations
  // -------------------------------------------------------------------------
  const snapTo = useCallback(
    (position: number, backdrop: number) => {
      setBackdropTouchableHeight(position);
      setContentHeight(drawerHostHeightRef.current - position);
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
    isClosing.current = false;
    currentSnap.current = '3q';
    drawerTranslate.setValue(drawerHostHeightRef.current);
    backdropOpacity.setValue(0);
    snapTo(position3QRef.current, 0.4);
  }, [backdropOpacity, drawerTranslate, snapTo]);

  const closeDrawer = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    Animated.parallel([
      Animated.timing(drawerTranslate, {
        toValue: drawerHostHeightRef.current,
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
      wasOpened.current = false;
      isClosing.current = false;
      setIsMounted(false);
      onClose();
    });
  }, [drawerTranslate, backdropOpacity, onClose]);

  useEffect(() => {
    if (visible) {
      wasOpened.current = true;
      setIsMounted(true);
      openDrawer();
    } else if (wasOpened.current) {
      closeDrawer();
    }
  }, [visible, openDrawer, closeDrawer]);

  useEffect(() => {
    if (!visible) {
      drawerTranslate.setValue(drawerHostHeight);
      return;
    }

    const position = currentSnap.current === 'full' ? positionFullRef.current : position3Q;
    setBackdropTouchableHeight(position);
    drawerTranslate.setValue(position);
    setContentHeight(drawerHostHeight - position);
  }, [visible, drawerHostHeight, position3Q, drawerTranslate]);

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
        const base = currentSnap.current === 'full' ? pFull : position3QRef.current;
        const newPos = base + gestureState.dy;
        const clamped = Math.max(pFull, Math.min(newPos, drawerHostHeightRef.current));
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
            snapTo(position3QRef.current, 0.4);
          }
        } else {
          if (dy > SNAP_DOWN_THRESHOLD || vy > 0.5) {
            currentSnap.current = '3q';
            snapTo(position3QRef.current, 0.4);
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
      <Text style={styles.sectionSubtitle}>
        Review and confirm the needs you named in this conversation.
      </Text>

      {needs.map((need) => (
        <NeedCard
          key={need.id}
          need={{ category: need.category, description: need.need }}
          testID={`${testID}-need-${need.id}`}
        />
      ))}

      {needs.length === 0 && (
        <Text style={styles.emptyText}>No needs captured yet.</Text>
      )}
    </>
  );

  const renderNeedsButtons = () => {
    const hasButtons = onAdjustNeeds || onConfirmNeeds;
    if (!hasButtons) return null;
    return (
      <View style={[styles.fixedButtonArea, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.buttonRow}>
          {onConfirmNeeds && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isConfirming && styles.primaryButtonDisabled,
              ]}
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
              <Text style={styles.secondaryButtonText}>Chat to refine</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderSideBySideNeeds = () => {
    return (
      <View style={styles.revealContainer} testID={`${testID}-side-by-side`}>
        <View style={styles.revealColumn}>
          <Text style={styles.columnHeader}>You</Text>
          {needs.map((need) => (
            <View key={need.id} style={styles.revealCard}>
              <Text style={styles.revealCategory}>{need.category}</Text>
              <Text style={styles.revealNeed}>{need.need}</Text>
            </View>
          ))}
          {needs.length === 0 && (
            <Text style={styles.emptyColumnText}>Waiting for your needs</Text>
          )}
        </View>

        <View style={styles.revealColumn}>
          <Text style={styles.columnHeader}>{partnerName}</Text>
          {partnerNeeds.map((need) => (
            <View key={need.id} style={[styles.revealCard, styles.partnerRevealCard]}>
              <Text style={styles.revealCategory}>{need.category}</Text>
              <Text style={styles.revealNeed}>{need.need}</Text>
            </View>
          ))}
          {partnerNeeds.length === 0 && (
            <Text style={styles.emptyColumnText}>Waiting for {partnerName}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderRevealMode = () => (
    <>
      <Text style={styles.sectionSubtitle}>
        Review both needs lists side by side, then validate whether they feel accurate.
      </Text>
      {renderSideBySideNeeds()}
    </>
  );

  const renderRevealButtons = () => {
    const hasButtons = onValidateNeeds || onNeedsNotValidYet;
    if (!hasButtons) return null;
    return (
      <View style={[styles.fixedButtonArea, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.buttonRow}>
          {onNeedsNotValidYet && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                onNeedsNotValidYet();
                closeDrawer();
              }}
              activeOpacity={0.7}
              testID={`${testID}-not-valid-yet`}
              accessibilityRole="button"
              accessibilityLabel="Needs not reviewed yet"
            >
              <Text style={styles.secondaryButtonText}>Not reviewed yet</Text>
            </TouchableOpacity>
          )}
          {onValidateNeeds && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                onValidateNeeds();
                closeDrawer();
              }}
              activeOpacity={0.7}
              testID={`${testID}-validate-needs`}
              accessibilityRole="button"
              accessibilityLabel="Validate needs"
            >
              <Text style={styles.primaryButtonText}>Validate needs</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!isMounted) return null;

  const headerText = mode === 'needs' ? 'Your Needs' : 'Needs Side by Side';

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
      onLayout={handleHostLayout}
      pointerEvents="auto"
      testID={testID}
    >
      {/* Backdrop */}
      <Pressable
        style={[styles.backdropPressable, { height: backdropTouchableHeight }]}
        onPress={() => {
          if (!isDragging.current) closeDrawer();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Close ${headerText}`}
        testID={`${testID}-backdrop`}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          appWidthStyle,
          {
            height: drawerHostHeight,
            transform: [{ translateY: drawerTranslate }],
          },
        ]}
        testID={`${testID}-sheet`}
      >
        {/* Content wrapper constrains layout to visible drawer area */}
        <View style={{ height: contentHeight }} testID={`${testID}-content`}>
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

          {mode === 'needs' && renderNeedsButtons()}
          {mode === 'reveal' && renderRevealButtons()}

          {/* Scrollable content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {mode === 'needs' && renderNeedsMode()}
            {mode === 'reveal' && renderRevealMode()}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  backdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: palette.bgPane,
    borderWidth: 1,
    borderColor: palette.border,
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
    backgroundColor: palette.borderStrong,
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.text,
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
    color: palette.text,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 16,
    marginHorizontal: 16,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: palette.textFaint,
    textAlign: 'center',
    paddingVertical: 24,
    fontStyle: 'italic',
    marginHorizontal: 16,
  },

  // Action area
  fixedButtonArea: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: palette.border,
    borderBottomColor: palette.border,
    backgroundColor: palette.bgPane,
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
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: palette.bg,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fullWidthButton: {
    flex: undefined,
  },

  // Reveal view
  revealContainer: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
  },
  revealColumn: {
    flex: 1,
  },
  columnHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  revealCard: {
    backgroundColor: palette.infoSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.info,
    padding: 10,
    marginBottom: 8,
    position: 'relative',
  },
  partnerRevealCard: {
    backgroundColor: palette.warningSoft,
    borderColor: palette.warning,
  },
  revealCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.textMuted,
    marginBottom: 2,
  },
  revealNeed: {
    fontSize: 13,
    color: palette.text,
    lineHeight: 18,
  },
  emptyColumnText: {
    fontSize: 13,
    color: palette.textFaint,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

});

export default NeedsDrawer;
