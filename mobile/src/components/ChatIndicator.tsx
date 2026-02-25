/**
 * ChatIndicator Component
 *
 * Displays inline indicators/dividers in the chat.
 * Used for things like "Invitation Sent" markers.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Semantic Color System
// ============================================================================

const INDICATOR_COLORS = {
  informational: { text: 'rgba(100, 149, 237, 0.9)', line: 'rgba(100, 149, 237, 0.2)' },
  action: { text: 'rgba(245, 158, 11, 0.9)', line: 'rgba(245, 158, 11, 0.2)' },
  success: { text: 'rgba(34, 197, 94, 0.9)', line: 'rgba(34, 197, 94, 0.2)' },
};

function getSemanticCategory(type: ChatIndicatorType): 'informational' | 'action' | 'success' {
  switch (type) {
    case 'empathy-validated': return 'success';
    case 'share-suggestion-received': return 'action';
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
  | 'share-suggestion-received' // Sharing opportunity available (action)
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
  };
}

// ============================================================================
// Component
// ============================================================================

export function ChatIndicator({ type, timestamp, testID, onPress, metadata }: ChatIndicatorProps) {
  const styles = useStyles();

  const getIndicatorText = (): string => {
    switch (type) {
      case 'invitation-sent':
        return 'Invitation Sent';
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
        return 'Common ground found';
      // Stage 4: Strategic Repair
      case 'strategies-ready':
        return 'Strategies ready';
      case 'overlap-revealed':
        return 'Overlap revealed';
      case 'agreement-reached':
        return 'Agreement reached ✓';
      // Semantic indicator types
      case 'empathy-validated':
        const validatorName = metadata?.partnerName || 'Partner';
        return `${validatorName} confirmed your understanding`;
      case 'share-suggestion-received':
        return 'Sharing opportunity available';
      case 'stage-chapter':
        return metadata?.stageName || 'New Chapter';
      default:
        return '';
    }
  };

  // Whether this indicator links to another page (shows arrow)
  const hasArrow = type === 'context-shared' 
    || type === 'empathy-shared'
    || type === 'needs-identified'
    || type === 'common-ground-found'
    || type === 'strategies-ready'
    || type === 'overlap-revealed'
    || type === 'agreement-reached';

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
      case 'share-suggestion-received':
      case 'stage-chapter': {
        const category = getSemanticCategory(type);
        return { backgroundColor: INDICATOR_COLORS[category].line };
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
      case 'share-suggestion-received':
      case 'stage-chapter': {
        const category = getSemanticCategory(type);
        return { color: INDICATOR_COLORS[category].text };
      }
      default:
        return styles.defaultText;
    }
  };

  // Special rendering for stage-chapter indicators
  if (type === 'stage-chapter') {
    const stageChapterStyle = {
      fontSize: 15,
      textTransform: 'none' as const,
      letterSpacing: 0,
      fontWeight: '500' as const,
      color: INDICATOR_COLORS.informational.text,
    };

    const chapterContent = (
      <View style={styles.lineContainer}>
        <Text style={[styles.text, stageChapterStyle]}>{'\u2014\u2014\u2014'}</Text>
        <View style={styles.textContainer}>
          <Text style={[styles.text, stageChapterStyle]}>{getIndicatorText()}</Text>
        </View>
        <Text style={[styles.text, stageChapterStyle]}>{'\u2014\u2014\u2014'}</Text>
      </View>
    );

    return (
      <View style={styles.container} testID={testID || 'chat-indicator-stage-chapter'}>
        {chapterContent}
      </View>
    );
  }

  const content = (
    <View style={styles.lineContainer}>
      <View style={[styles.line, getLineStyle()]} />
      <View style={styles.textContainer}>
        <Text style={[styles.text, getTextStyle()]}>{getIndicatorText()}</Text>
        {hasArrow && (
          <Text style={[styles.arrow, getTextStyle()]}>→</Text>
        )}
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

const useStyles = () =>
  createStyles((t) => ({
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
      height: 1,
      backgroundColor: t.colors.border,
    },
    textContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    text: {
      fontSize: t.typography.fontSize.sm,
      fontFamily: t.typography.fontFamily.regular,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    arrow: {
      fontSize: 16,
      fontWeight: '600',
    },
    // Invitation sent: yellow/amber tint - separate line and text styles
    invitationSentLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    invitationSentText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Feel heard: teal/green tint for completion feeling
    feelHeardLine: {
      backgroundColor: 'rgba(20, 184, 166, 0.3)',
    },
    feelHeardText: {
      color: 'rgba(20, 184, 166, 0.9)',
    },
    // Compact signed: dark blue tint for commitment
    compactSignedLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    compactSignedText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    // Context shared: purple/accent tint for shared content
    contextSharedLine: {
      backgroundColor: 'rgba(139, 92, 246, 0.3)',
    },
    contextSharedText: {
      color: 'rgba(139, 92, 246, 0.9)',
    },
    defaultLine: {
      backgroundColor: t.colors.border,
    },
    defaultText: {
      color: t.colors.textMuted,
    },
    // Reconciler analyzing: blue tint for in-progress
    reconcilerAnalyzingLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    reconcilerAnalyzingText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    // Reconciler gaps found: orange/warning tint
    reconcilerGapsLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    reconcilerGapsText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    // Reconciler ready: green/success tint
    reconcilerReadyLine: {
      backgroundColor: 'rgba(34, 197, 94, 0.3)',
    },
    reconcilerReadyText: {
      color: 'rgba(34, 197, 94, 0.9)',
    },
    // Partner empathy held: blue/info tint
    partnerEmpathyHeldLine: {
      backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    partnerEmpathyHeldText: {
      color: 'rgba(59, 130, 246, 0.9)',
    },
    // Stage 3: Need Mapping - soft blue/teal theme
    needsIdentifiedLine: {
      backgroundColor: 'rgba(94, 186, 183, 0.3)',
    },
    needsIdentifiedText: {
      color: 'rgba(94, 186, 183, 0.9)',
    },
    commonGroundFoundLine: {
      backgroundColor: 'rgba(134, 197, 166, 0.3)',
    },
    commonGroundFoundText: {
      color: 'rgba(134, 197, 166, 0.9)',
    },
    // Stage 4: Strategic Repair - amber/purple theme
    strategiesReadyLine: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
    },
    strategiesReadyText: {
      color: 'rgba(245, 158, 11, 0.9)',
    },
    overlapRevealedLine: {
      backgroundColor: 'rgba(139, 92, 246, 0.3)',
    },
    overlapRevealedText: {
      color: 'rgba(139, 92, 246, 0.9)',
    },
    agreementReachedLine: {
      backgroundColor: 'rgba(34, 197, 94, 0.3)',
    },
    agreementReachedText: {
      color: 'rgba(34, 197, 94, 0.9)',
    },
  }));
