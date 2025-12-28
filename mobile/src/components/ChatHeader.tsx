/**
 * ChatHeader Component
 *
 * Displays stage context information at the top of chat screens.
 * Shows stage name, number, description, and optional progress indicator.
 */

import { View, Text } from 'react-native';
import { createStyles } from '../theme/styled';
import { StageProgress } from './StageProgress';

// ============================================================================
// Types
// ============================================================================

interface ChatHeaderProps {
  /** Stage name (e.g., "The Witness", "Perspective Stretch") */
  stageName: string;
  /** Stage number (1-4) */
  stageNumber: number;
  /** Optional brief description of the stage */
  stageDescription?: string;
  /** Optional progress percentage (0-100) - currently unused but available for future */
  progress?: number;
  /** Number of completed stages for progress display */
  completedStages?: number;
  /** Whether to show the stage progress dots */
  showProgress?: boolean;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Stage Background Colors
// ============================================================================

const STAGE_COLORS: Record<number, string> = {
  1: 'rgba(16, 163, 127, 0.08)', // accent/calm - green tint for Witness
  2: 'rgba(99, 102, 241, 0.08)', // indigo tint for Perspective Stretch
  3: 'rgba(245, 158, 11, 0.08)', // warning/elevated - amber tint for Needs
  4: 'rgba(139, 92, 246, 0.08)', // purple tint for Compact
};

// ============================================================================
// Component
// ============================================================================

export function ChatHeader({
  stageName,
  stageNumber,
  stageDescription,
  progress,
  completedStages,
  showProgress = true,
  testID = 'chat-header',
}: ChatHeaderProps) {
  const styles = useStyles();
  const backgroundColor = STAGE_COLORS[stageNumber] || STAGE_COLORS[1];

  return (
    <View style={[styles.container, { backgroundColor }]} testID={testID}>
      {showProgress && (
        <StageProgress
          currentStage={stageNumber}
          completedStages={completedStages}
          testID={`${testID}-progress`}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.stageLabel} testID={`${testID}-label`}>
          Stage {stageNumber}: {stageName}
        </Text>
        {stageDescription && (
          <Text style={styles.description} testID={`${testID}-description`}>
            {stageDescription}
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    content: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.xs,
      paddingBottom: t.spacing.md,
    },
    stageLabel: {
      fontSize: t.typography.fontSize.lg,
      fontWeight: '600',
      color: t.colors.textPrimary,
      marginBottom: t.spacing.xs,
    },
    description: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textSecondary,
      lineHeight: 20,
    },
  }));
