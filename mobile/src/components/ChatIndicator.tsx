/**
 * ChatIndicator Component
 *
 * Displays inline indicators/dividers in the chat.
 * Used for things like "Invitation Sent" markers.
 */

import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { createStyles } from '../theme/styled';
import { designFonts, useAppAppearance } from '../theme';

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Semantic Color System
// ============================================================================

function getSemanticCategory(type: ChatIndicatorType): 'informational' | 'success' | 'warning' {
  switch (type) {
    case 'empathy-validated': return 'success';
    case 'reconciler-gaps-found':
    case 'strategies-ready':
      return 'warning';
    case 'stage-chapter': return 'informational';
    default: return 'informational';
  }
}

// ============================================================================
// Types
// ============================================================================

export type ChatIndicatorType =
  | 'invitation-sent'
  | 'invitation-accepted'
  | 'session-start'
  | 'feel-heard'
  | 'compact-signed'
  | 'context-shared'
  | 'empathy-shared'
  | 'reconciler-analyzing'
  | 'reconciler-gaps-found'
  | 'reconciler-ready'
  | 'partner-empathy-held'
  // Stage 3: Need Mapping
  | 'needs-identified'
  | 'common-ground-found'
  // Stage 4: Strategic Repair
  | 'strategies-ready'
  | 'overlap-revealed'
  | 'agreement-reached'
  // Semantic indicator types
  | 'empathy-validated'         // Partner confirmed your understanding (success)
  | 'stage-chapter';            // Stage transition chapter marker (informational)

interface ChatIndicatorProps {
  type: ChatIndicatorType;
  timestamp?: string;
  testID?: string;
  /** If provided, makes the indicator tappable */
  onPress?: () => void;
  /** Optional metadata for dynamic indicator text */
  metadata?: {
    /** Whether this content is from the current user (vs partner) */
    isFromMe?: boolean;
    /** Partner's display name (for "Context from {name}" text) */
    partnerName?: string;
    /** Stage name for stage-chapter indicators */
    stageName?: string;
    /** Stage accent color for stage-chapter bar background */
    stageColor?: string;
  };
  /** Slide stage chapter markers in when they first appear live. */
  animateEntrance?: boolean;
  onEntranceComplete?: () => void;
}

const STAGE_CHAPTER_ENTRANCE_DURATION_MS = 260;
const STAGE_CHAPTER_ENTRANCE_OFFSET = 36;

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({
  type,
  timestamp,
  testID,
  onPress,
  metadata,
  animateEntrance = false,
  onEntranceComplete,
}: ChatIndicatorProps) {
  const styles = useStyles();
  const { palette } = useAppAppearance();
  const entranceAnim = useRef(new Animated.Value(animateEntrance ? 0 : 1)).current;

  useEffect(() => {
    if (!animateEntrance) {
      entranceAnim.setValue(1);
      return;
    }

    entranceAnim.setValue(0);
    Animated.timing(entranceAnim, {
      toValue: 1,
      duration: STAGE_CHAPTER_ENTRANCE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onEntranceComplete?.();
      }
    });
  }, [animateEntrance, entranceAnim, onEntranceComplete]);

  const semanticColors = {
    informational: { text: palette.accentText, line: palette.borderStrong },
    success: { text: palette.success, line: palette.borderStrong },
    warning: { text: palette.accentText, line: palette.borderStrong },
  };

  const getIndicatorText = (): string => {
    switch (type) {
      case 'invitation-sent':
        return 'Invitation Ready';
      case 'invitation-accepted':
        return 'Accepted Invitation';
      case 'session-start':
        return 'Session Started';
      case 'feel-heard':
        return 'Felt Heard';
      case 'compact-signed':
        return 'Compact Signed';
      case 'context-shared':
        // Show "Context from {name}" when it's from partner, otherwise "Context shared"
        if (metadata?.isFromMe === false && metadata?.partnerName) {
          return `Context from ${metadata.partnerName}`;
        }
        return 'Context shared';
      case 'empathy-shared':
        // Show "Empathy from {name}" when it's from partner, otherwise "Empathy shared"
        if (metadata?.isFromMe === false && metadata?.partnerName) {
          return `Empathy from ${metadata.partnerName}`;
        }
        return 'Empathy shared';
      case 'reconciler-analyzing':
        return 'Analyzing understanding...';
      case 'reconciler-gaps-found':
        return 'Understanding taking shape';
      case 'reconciler-ready':
        return 'Understanding verified ✓';
      case 'partner-empathy-held':
        const name = metadata?.partnerName || 'Partner';
        return `${name} shared empathy • Awaiting review`;
      // Stage 3: Need Mapping
      case 'needs-identified':
        return 'Needs identified';
      case 'common-ground-found':
        return 'Needs overlap ready to review';
      // Stage 4: Strategic Repair
      case 'strategies-ready':
        return 'Strategies ready';
      case 'overlap-revealed':
        return 'Overlap revealed';
      case 'agreement-reached':
        return 'Next step confirmed ✓';
      // Semantic indicator types
      case 'empathy-validated':
        const validatorName = metadata?.partnerName || 'Partner';
        return `${validatorName} confirmed your understanding`;
      case 'stage-chapter':
        return metadata?.stageName || 'New Chapter';
      default:
        return '';
    }
  };

  const getLineStyle = () => {
    switch (type) {
      case 'invitation-sent':
      case 'invitation-accepted':
        return styles.invitationSentLine;
      case 'feel-heard':
        return styles.feelHeardLine;
      case 'compact-signed':
        return styles.compactSignedLine;
      case 'context-shared':
      case 'empathy-shared':
        return styles.contextSharedLine;
      case 'reconciler-analyzing':
        return styles.reconcilerAnalyzingLine;
      case 'reconciler-gaps-found':
        return styles.reconcilerGapsLine;
      case 'reconciler-ready':
        return styles.reconcilerReadyLine;
      case 'partner-empathy-held':
        return styles.partnerEmpathyHeldLine;
      // Stage 3: Need Mapping - soft blue/teal theme
      case 'needs-identified':
        return styles.needsIdentifiedLine;
      case 'common-ground-found':
        return styles.commonGroundFoundLine;
      // Stage 4: Strategic Repair - green/success theme
      case 'strategies-ready':
        return styles.strategiesReadyLine;
      case 'overlap-revealed':
        return styles.overlapRevealedLine;
      case 'agreement-reached':
        return styles.agreementReachedLine;
      // Semantic indicator types
      case 'empathy-validated':
      case 'stage-chapter': {
        const category = getSemanticCategory(type);
        return { backgroundColor: semanticColors[category].line };
      }
      default:
        return styles.defaultLine;
    }
  };

  const getTextStyle = () => {
    switch (type) {
      case 'invitation-sent':
      case 'invitation-accepted':
        return styles.invitationSentText;
      case 'feel-heard':
        return styles.feelHeardText;
      case 'compact-signed':
        return styles.compactSignedText;
      case 'context-shared':
      case 'empathy-shared':
        return styles.contextSharedText;
      case 'reconciler-analyzing':
        return styles.reconcilerAnalyzingText;
      case 'reconciler-gaps-found':
        return styles.reconcilerGapsText;
      case 'reconciler-ready':
        return styles.reconcilerReadyText;
      case 'partner-empathy-held':
        return styles.partnerEmpathyHeldText;
      // Stage 3: Need Mapping - soft blue/teal theme
      case 'needs-identified':
        return styles.needsIdentifiedText;
      case 'common-ground-found':
        return styles.commonGroundFoundText;
      // Stage 4: Strategic Repair - green/success theme
      case 'strategies-ready':
        return styles.strategiesReadyText;
      case 'overlap-revealed':
        return styles.overlapRevealedText;
      case 'agreement-reached':
        return styles.agreementReachedText;
      // Semantic indicator types
      case 'empathy-validated':
      case 'stage-chapter': {
        const category = getSemanticCategory(type);
        return { color: semanticColors[category].text };
      }
      default:
        return styles.defaultText;
    }
  };

  // Special rendering for stage-chapter indicators — full-width sticky section header
  if (type === 'stage-chapter') {
    const stageColor = metadata?.stageColor || semanticColors.informational.text;

    return (
      <Animated.View
        style={[
          styles.stageChapterBar,
          {
            borderTopColor: stageColor,
            borderBottomColor: stageColor,
            opacity: entranceAnim,
            transform: [{
              translateX: entranceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-STAGE_CHAPTER_ENTRANCE_OFFSET, 0],
              }),
            }],
          },
        ]}
        testID={testID || 'chat-indicator-stage-chapter'}
      >
        <Text style={[styles.stageChapterText, { color: stageColor }]}>
          {getIndicatorText()}
        </Text>
      </Animated.View>
    );
  }

  const content = (
    <View style={styles.lineContainer}>
      <View style={[styles.line, getLineStyle()]} />
      <View style={styles.textContainer}>
        <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
      </View>
      <View style={[styles.line, getLineStyle()]} />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.container}
        testID={testID || `chat-indicator-${type}`}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container} testID={testID || `chat-indicator-${type}`}>
      {content}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () => {
  const { palette } = useAppAppearance();
  return createStyles((t) => ({
    container: {
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    lineContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    line: {
      flex: 1,
      height: 1.5,
      backgroundColor: palette.border,
    },
    textContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: designFonts.mono,
      color: palette.text,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '700',
    },
    // Stage chapter bar — full-width sticky section header at stage transitions
    stageChapterBar: {
      backgroundColor: palette.bg,
      borderTopWidth: 0.5,
      borderBottomWidth: 0.5,
      paddingVertical: 6,
      paddingHorizontal: 18,
    },
    stageChapterText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    // Invitation sent: yellow/amber tint - separate line and text styles
    invitationSentLine: {
      backgroundColor: palette.borderStrong,
    },
    invitationSentText: {
      color: palette.accentText,
    },
    // Feel heard: teal/green tint for completion feeling
    feelHeardLine: {
      backgroundColor: palette.borderStrong,
    },
    feelHeardText: {
      color: palette.success,
    },
    // Compact signed: dark blue tint for commitment
    compactSignedLine: {
      backgroundColor: palette.borderStrong,
    },
    compactSignedText: {
      color: palette.accentText,
    },
    // Context shared: purple/accent tint for shared content
    contextSharedLine: {
      backgroundColor: palette.borderStrong,
    },
    contextSharedText: {
      color: palette.accentText,
    },
    defaultLine: {
      backgroundColor: palette.borderStrong,
    },
    defaultText: {
      color: palette.textMuted,
    },
    // Reconciler analyzing: blue tint for in-progress
    reconcilerAnalyzingLine: {
      backgroundColor: palette.infoSoft,
    },
    reconcilerAnalyzingText: {
      color: palette.info,
    },
    // Reconciler gaps found: orange/warning tint
    reconcilerGapsLine: {
      backgroundColor: palette.warningSoft,
    },
    reconcilerGapsText: {
      color: palette.warning,
    },
    // Reconciler ready: green/success tint
    reconcilerReadyLine: {
      backgroundColor: palette.successSoft,
    },
    reconcilerReadyText: {
      color: palette.success,
    },
    // Partner empathy held: blue/info tint
    partnerEmpathyHeldLine: {
      backgroundColor: palette.infoSoft,
    },
    partnerEmpathyHeldText: {
      color: palette.info,
    },
    // Stage 3: Need Mapping - soft blue/teal theme
    needsIdentifiedLine: {
      backgroundColor: palette.infoSoft,
    },
    needsIdentifiedText: {
      color: palette.info,
    },
    commonGroundFoundLine: {
      backgroundColor: palette.successSoft,
    },
    commonGroundFoundText: {
      color: palette.success,
    },
    // Stage 4: Strategic Repair - amber/purple theme
    strategiesReadyLine: {
      backgroundColor: palette.warningSoft,
    },
    strategiesReadyText: {
      color: palette.warning,
    },
    overlapRevealedLine: {
      backgroundColor: palette.accentSoft,
    },
    overlapRevealedText: {
      color: palette.accentText,
    },
    agreementReachedLine: {
      backgroundColor: palette.successSoft,
    },
    agreementReachedText: {
      color: palette.success,
    },
  }));
};
