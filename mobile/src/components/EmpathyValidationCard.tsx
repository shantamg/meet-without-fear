/**
 * EmpathyValidationCard Component
 *
 * An inline interactive card that appears in the chat FlatList when the partner's
 * empathy attempt is revealed. Shows the empathy content with validation buttons.
 *
 * Four states:
 * - pending: Shows empathy content + "Does this feel right?" + two buttons
 * - validated: Shows green check + "You confirmed this feels right"
 * - feedback-given: Shows check + "Feedback shared"
 * - superseded: Shows muted text + "This understanding has been updated"
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  AccessibilityInfo,
} from 'react-native';
import { Heart, Check, RefreshCw } from 'lucide-react-native';
import { createStyles } from '../theme/styled';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// Types
// ============================================================================

export interface EmpathyValidationCardProps {
  partnerName: string;
  empathyContent: string;
  status: 'pending' | 'validated' | 'feedback-given' | 'superseded';
  onValidateAccurate: () => void;
  onValidateNotQuite: () => void;
  skipRevealAnimation?: boolean;
  testID?: string;
}

// ============================================================================
// Component
// ============================================================================

export function EmpathyValidationCard({
  partnerName,
  empathyContent,
  status,
  onValidateAccurate,
  onValidateNotQuite,
  skipRevealAnimation = false,
  testID = 'empathy-validation-card',
}: EmpathyValidationCardProps) {
  const styles = useStyles();

  // Track whether content is expanded (for long text)
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongContent = empathyContent.length > 200;

  // Animation values for 3-phase stagger
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  // Track previous status for LayoutAnimation on transition
  const prevStatusRef = useRef(status);

  // Screen reader detection
  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false);

  useEffect(() => {
    const checkScreenReader = async () => {
      const enabled = await AccessibilityInfo.isScreenReaderEnabled();
      setIsScreenReaderActive(enabled);
    };
    checkScreenReader();

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (enabled: boolean) => {
        setIsScreenReaderActive(enabled);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // 3-phase stagger animation
  useEffect(() => {
    if (skipRevealAnimation || isScreenReaderActive) {
      // Show everything immediately
      cardOpacity.setValue(1);
      contentOpacity.setValue(1);
      actionsOpacity.setValue(1);
      return;
    }

    // Phase 1: Card entrance (400ms fade in)
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Phase 2: Content reveal (800ms, starts at 1200ms total = 800ms delay after phase 1 starts)
    const contentTimer = setTimeout(() => {
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }, 800);

    // Phase 3: Action buttons (500ms, starts at 2500ms total = 2500ms delay)
    const actionsTimer = setTimeout(() => {
      Animated.timing(actionsOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 2000);

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(actionsTimer);
    };
  }, [skipRevealAnimation, isScreenReaderActive, cardOpacity, contentOpacity, actionsOpacity]);

  // LayoutAnimation on status change
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      prevStatusRef.current = status;
    }
  }, [status]);

  // ----------------------------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------------------------

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <Heart size={16} color={styles.headerIcon.color} />
      <Text style={styles.headerText}>
        {partnerName}&apos;s understanding
      </Text>
    </View>
  );

  const renderContent = () => (
    <Animated.View style={{ opacity: contentOpacity }}>
      <Text
        style={styles.empathyContent}
        numberOfLines={status === 'pending' && !isExpanded ? 4 : undefined}
        testID={`${testID}-content`}
      >
        {empathyContent}
      </Text>
      {status === 'pending' && isLongContent && !isExpanded && (
        <Pressable
          onPress={() => setIsExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel="Read full statement"
        >
          <Text style={styles.readMoreText}>Read full statement</Text>
        </Pressable>
      )}
    </Animated.View>
  );

  const renderPendingActions = () => (
    <Animated.View style={{ opacity: actionsOpacity }}>
      <Text style={styles.questionText}>Does this feel right?</Text>
      <View style={styles.buttonRow}>
        <Pressable
          style={styles.accurateButton}
          onPress={onValidateAccurate}
          testID={`${testID}-yes-button`}
          accessibilityRole="button"
          accessibilityLabel="Yes, mostly"
          accessibilityHint="Confirms your partner's understanding of your feelings"
        >
          <Text style={styles.accurateButtonText}>Yes, mostly</Text>
        </Pressable>
        <Pressable
          style={styles.notQuiteButton}
          onPress={onValidateNotQuite}
          testID={`${testID}-no-button`}
          accessibilityRole="button"
          accessibilityLabel="Not quite yet"
          accessibilityHint="Opens a conversation to help refine your partner's understanding"
        >
          <Text style={styles.notQuiteButtonText}>Not quite yet</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderValidated = () => (
    <View style={styles.completedRow} testID={`${testID}-completed`}>
      <Check size={16} color={styles.completedIcon.color} />
      <Text style={styles.completedText}>
        You confirmed this feels right
      </Text>
    </View>
  );

  const renderFeedbackGiven = () => (
    <View style={styles.completedRow} testID={`${testID}-completed`}>
      <Check size={16} color={styles.completedIcon.color} />
      <Text style={styles.completedText}>Feedback shared</Text>
    </View>
  );

  const renderSuperseded = () => (
    <View style={styles.supersededRow} testID={`${testID}-superseded`}>
      <RefreshCw size={16} color={styles.supersededIcon.color} />
      <Text style={styles.supersededText}>
        This understanding has been updated
      </Text>
    </View>
  );

  const renderStatusContent = () => {
    switch (status) {
      case 'pending':
        return renderPendingActions();
      case 'validated':
        return renderValidated();
      case 'feedback-given':
        return renderFeedbackGiven();
      case 'superseded':
        return renderSuperseded();
    }
  };

  // ----------------------------------------------------------------------------
  // Main render
  // ----------------------------------------------------------------------------

  return (
    <View
      testID={testID}
      accessible={true}
      accessibilityLabel={`${partnerName}'s understanding of your feelings`}
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={[styles.container, { opacity: cardOpacity }]}>
        {renderHeader()}
        {renderContent()}
        {renderStatusContent()}
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      marginHorizontal: t.spacing.lg,
      marginVertical: t.spacing.sm,
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accent,
      padding: t.spacing.md,
      minHeight: 180,
    },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: t.spacing.sm,
      gap: t.spacing.sm,
    },
    headerIcon: {
      color: t.colors.accent,
    },
    headerText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.medium,
      fontWeight: '600' as const,
      color: t.colors.textPrimary,
    },
    empathyContent: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.regular,
      fontStyle: 'italic' as const,
      color: t.colors.textSecondary,
      lineHeight: 20,
      marginBottom: t.spacing.sm,
    },
    readMoreText: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.accent,
      marginBottom: t.spacing.sm,
    },
    questionText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.medium,
      fontWeight: '500' as const,
      color: t.colors.textPrimary,
      marginBottom: t.spacing.md,
    },
    buttonRow: {
      flexDirection: 'row' as const,
      gap: t.spacing.sm,
    },
    accurateButton: {
      flex: 1,
      minHeight: 44,
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(34, 197, 94, 0.3)',
      borderRadius: 8,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
    },
    notQuiteButton: {
      flex: 1,
      minHeight: 44,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.3)',
      borderRadius: 8,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
    },
    accurateButtonText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.medium,
      fontWeight: '600' as const,
      color: 'rgba(34, 197, 94, 1)',
    },
    notQuiteButtonText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.medium,
      fontWeight: '600' as const,
      color: 'rgba(245, 158, 11, 1)',
    },
    completedRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    completedIcon: {
      color: t.colors.success,
    },
    completedText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.success,
    },
    supersededRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
    },
    supersededIcon: {
      color: t.colors.textMuted,
    },
    supersededText: {
      fontSize: t.typography.fontSize.base,
      fontFamily: t.typography.fontFamily.regular,
      fontStyle: 'italic' as const,
      color: t.colors.textMuted,
    },
  }));

export default EmpathyValidationCard;
