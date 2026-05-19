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
  Modal,
  TextInput,
  Alert,
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
import type { NeedEditOperation, NeedEditPlan } from '@meet-without-fear/shared';

// ============================================================================
// Types
// ============================================================================

export type NeedsDrawerMode = 'needs' | 'reveal';

interface NeedItem {
  id: string;
  category: string;
  need: string;
  confirmed: boolean;
  needsReframing?: boolean;
  reframingWarning?: string;
}

export interface NeedsDrawerProps {
  visible: boolean;
  onClose: () => void;
  mode: NeedsDrawerMode;
  // Needs mode
  needs?: NeedItem[];
  onAdjustNeeds?: () => void;
  onConfirmNeeds?: () => void;
  onPreviewNeedEdit?: (request: string, targetNeedId?: string) => Promise<NeedEditPlan | null>;
  onApplyNeedEdits?: (operations: NeedEditOperation[]) => Promise<void>;
  onRemoveNeed?: (needId: string) => Promise<void>;
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
  onPreviewNeedEdit,
  onApplyNeedEdits,
  onRemoveNeed,
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
  const [editMode, setEditMode] = useState<'add' | 'edit' | null>(null);
  const [targetNeed, setTargetNeed] = useState<NeedItem | null>(null);
  const [editRequest, setEditRequest] = useState('');
  const [editPlan, setEditPlan] = useState<NeedEditPlan | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isPreviewingEdit, setIsPreviewingEdit] = useState(false);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);

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
    snapTo(position, currentSnap.current === 'full' ? 0.6 : 0.4);
  }, [visible, drawerHostHeight, position3Q, drawerTranslate, snapTo]);

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
  const resetEditModal = useCallback(() => {
    setEditMode(null);
    setTargetNeed(null);
    setEditRequest('');
    setEditPlan(null);
    setEditError(null);
    setIsPreviewingEdit(false);
    setIsApplyingEdit(false);
  }, []);

  const openNeedEdit = useCallback((modeToOpen: 'add' | 'edit', need?: NeedItem) => {
    setEditMode(modeToOpen);
    setTargetNeed(need ?? null);
    setEditRequest('');
    setEditPlan(null);
    setEditError(null);
  }, []);

  const previewEdit = useCallback(async () => {
    if (!onPreviewNeedEdit || !editRequest.trim()) return;
    setIsPreviewingEdit(true);
    setEditError(null);
    try {
      const plan = await onPreviewNeedEdit(editRequest.trim(), targetNeed?.id);
      if (!plan) {
        setEditError('I need a little more detail before I can propose a draft.');
        return;
      }
      setEditPlan(plan);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not preview that edit.');
    } finally {
      setIsPreviewingEdit(false);
    }
  }, [editRequest, onPreviewNeedEdit, targetNeed?.id]);

  const applyEditPlan = useCallback(async () => {
    if (!onApplyNeedEdits || !editPlan) return;
    setIsApplyingEdit(true);
    setEditError(null);
    try {
      await onApplyNeedEdits(editPlan.operations);
      resetEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not apply that edit.');
    } finally {
      setIsApplyingEdit(false);
    }
  }, [editPlan, onApplyNeedEdits, resetEditModal]);

  const removeNeed = useCallback(async (need: NeedItem) => {
    if (!onRemoveNeed) return;
    Alert.alert('Remove this need from your list?', need.need, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setEditError(null);
          try {
            await onRemoveNeed(need.id);
          } catch (error) {
            setEditError(error instanceof Error ? error.message : 'Could not remove that need.');
          }
        },
      },
    ]);
  }, [onRemoveNeed]);

  const renderDiffText = (before: string, after: string) => {
    const beforeWords = before.split(/\s+/).filter(Boolean);
    const afterWords = after.split(/\s+/).filter(Boolean);
    const beforeSet = new Set(beforeWords.map((word) => word.toLowerCase()));
    const afterSet = new Set(afterWords.map((word) => word.toLowerCase()));
    return (
      <View style={styles.diffRows}>
        <Text style={styles.diffLabel}>Before</Text>
        <Text style={styles.diffText}>
          {beforeWords.map((word, index) => (
            <Text
              key={`before-${word}-${index}`}
              style={!afterSet.has(word.toLowerCase()) ? styles.removedWord : undefined}
            >
              {word}{index === beforeWords.length - 1 ? '' : ' '}
            </Text>
          ))}
        </Text>
        <Text style={styles.diffLabel}>After</Text>
        <Text style={styles.diffText}>
          {afterWords.map((word, index) => (
            <Text
              key={`after-${word}-${index}`}
              style={!beforeSet.has(word.toLowerCase()) ? styles.addedWord : undefined}
            >
              {word}{index === afterWords.length - 1 ? '' : ' '}
            </Text>
          ))}
        </Text>
      </View>
    );
  };

  const renderNeedsMode = () => (
    <>
      <Text style={styles.sectionSubtitle}>
        Make sure these are about what matters to you, not what the other person has to do.
      </Text>

      {needs.map((need) => (
        <View key={need.id}>
          <NeedCard
            need={{
              category: need.category,
              description: need.need,
              warning: need.needsReframing ? (need.reframingWarning ?? 'Needs rewording') : undefined,
            }}
            testID={`${testID}-need-${need.id}`}
          />
          {(onPreviewNeedEdit || onRemoveNeed) && (
            <View style={styles.needActionRow}>
              {onPreviewNeedEdit && (
                <>
                  <TouchableOpacity
                    style={styles.inlineActionButton}
                    onPress={() => openNeedEdit('edit', need)}
                    testID={`${testID}-edit-${need.id}`}
                  >
                    <Text style={styles.inlineActionText}>Edit</Text>
                  </TouchableOpacity>
                  {need.needsReframing && (
                    <TouchableOpacity
                      style={styles.inlineActionButton}
                      onPress={() => {
                        openNeedEdit('edit', need);
                        setEditRequest('Please reword this so it is about what matters to me, not what the other person has to do.');
                      }}
                      testID={`${testID}-reword-${need.id}`}
                    >
                      <Text style={styles.inlineActionText}>Ask AI to reword</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {onRemoveNeed && (
                <TouchableOpacity
                  style={styles.inlineDangerButton}
                  onPress={() => removeNeed(need)}
                  testID={`${testID}-remove-${need.id}`}
                >
                  <Text style={styles.inlineDangerText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
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
                if (onPreviewNeedEdit) {
                  openNeedEdit('add');
                } else {
                  closeDrawer();
                  onAdjustNeeds();
                }
              }}
              activeOpacity={0.7}
              testID={`${testID}-adjust`}
            >
              <Text style={styles.secondaryButtonText}>{onPreviewNeedEdit ? 'Add need' : 'Chat to refine'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderEditModal = () => (
    <Modal visible={editMode !== null} transparent animationType="fade" onRequestClose={resetEditModal}>
      <View style={styles.modalBackdrop}>
        <View style={styles.editModal}>
          <Text style={styles.modalTitle}>
            {editMode === 'add' ? 'Add a need' : 'Edit need'}
          </Text>
          {targetNeed && (
            <View style={styles.contextCard}>
              <Text style={styles.contextLabel}>Current draft</Text>
              <Text style={styles.contextText}>{targetNeed.need}</Text>
            </View>
          )}
          {!editPlan ? (
            <>
              <Text style={styles.inputLabel}>
                {editMode === 'add' ? 'What is missing?' : 'What should change about this need?'}
              </Text>
              <TextInput
                style={styles.editInput}
                multiline
                value={editRequest}
                onChangeText={setEditRequest}
                placeholder={editMode === 'add' ? 'Tell the AI what is missing.' : 'Tell the AI what feels off.'}
                placeholderTextColor={palette.textFaint}
                testID={`${testID}-edit-request`}
              />
              {editError && <Text style={styles.errorText}>{editError}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={resetEditModal}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, (!editRequest.trim() || isPreviewingEdit) && styles.primaryButtonDisabled]}
                  onPress={previewEdit}
                  disabled={!editRequest.trim() || isPreviewingEdit}
                  testID={`${testID}-preview-edit`}
                >
                  <Text style={styles.primaryButtonText}>{isPreviewingEdit ? 'Previewing...' : 'Preview'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.planSummary}>{editPlan.summary}</Text>
              {editPlan.affectedNeeds.map((affected, index) => (
                <View key={`${affected.operation}-${affected.needId ?? index}`} style={styles.previewCard}>
                  {affected.before?.text && affected.after?.text
                    ? renderDiffText(affected.before.text, affected.after.text)
                    : (
                      <Text style={styles.contextText}>
                        {affected.operation === 'add'
                          ? affected.after?.text
                          : affected.before?.text}
                      </Text>
                    )}
                  {affected.warning && <Text style={styles.warningText}>{affected.warning}</Text>}
                </View>
              ))}
              {editError && <Text style={styles.errorText}>{editError}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditPlan(null)}>
                  <Text style={styles.secondaryButtonText}>Modify</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={resetEditModal}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, isApplyingEdit && styles.primaryButtonDisabled]}
                  onPress={applyEditPlan}
                  disabled={isApplyingEdit}
                  testID={`${testID}-apply-edit`}
                >
                  <Text style={styles.primaryButtonText}>
                    {isApplyingEdit ? 'Applying...' : editMode === 'add' ? 'Add need' : 'Apply'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

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
      {renderEditModal()}
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
  needActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 12,
  },
  inlineActionButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: palette.bgElev,
  },
  inlineActionText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inlineDangerButton: {
    borderWidth: 1,
    borderColor: palette.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: palette.bgElev,
  },
  inlineDangerText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '600',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  editModal: {
    backgroundColor: palette.bgPane,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    maxHeight: '86%',
  },
  modalTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  contextCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: palette.bgElev,
  },
  contextLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  contextText: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
  },
  inputLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  editInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    color: palette.text,
    backgroundColor: palette.bg,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  planSummary: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 12,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: palette.bgElev,
  },
  diffRows: {
    gap: 6,
  },
  diffLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  diffText: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
  },
  removedWord: {
    color: palette.danger,
    textDecorationLine: 'line-through',
  },
  addedWord: {
    color: palette.success,
    fontWeight: '700',
  },
  warningText: {
    color: palette.warning,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
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
