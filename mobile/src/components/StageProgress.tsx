/**
 * StageProgress Component
 *
 * Displays visual progress through the 4 conversation stages.
 * Shows completed, current, and upcoming stages as dots.
 */

import { View, Text } from 'react-native';
import { createStyles } from '../theme/styled';

// ============================================================================
// Types
// ============================================================================

interface StageProgressProps {
  /** Current stage number (1-4) */
  currentStage: number;
  /** Number of completed stages (0-4) */
  completedStages?: number;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STAGE_LABELS = ['Witness', 'Perspective', 'Needs', 'Compact'] as const;
const TOTAL_STAGES = 4;

// ============================================================================
// Component
// ============================================================================

export function StageProgress({
  currentStage,
  completedStages = currentStage - 1,
  testID = 'stage-progress',
}: StageProgressProps) {
  const styles = useStyles();

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.dotsContainer}>
        {Array.from({ length: TOTAL_STAGES }, (_, index) => {
          const stageNumber = index + 1;
          const isCompleted = stageNumber <= completedStages;
          const isCurrent = stageNumber === currentStage;
          const isUpcoming = stageNumber > currentStage;

          return (
            <View key={stageNumber} style={styles.dotWrapper}>
              <View
                style={[
                  styles.dot,
                  isCompleted && styles.dotCompleted,
                  isCurrent && styles.dotCurrent,
                  isUpcoming && styles.dotUpcoming,
                ]}
                testID={`${testID}-dot-${stageNumber}`}
              />
              {index < TOTAL_STAGES - 1 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.labelsContainer}>
        {STAGE_LABELS.map((label, index) => {
          const stageNumber = index + 1;
          const isCurrent = stageNumber === currentStage;
          const isCompleted = stageNumber <= completedStages;

          return (
            <Text
              key={label}
              style={[
                styles.label,
                isCurrent && styles.labelCurrent,
                isCompleted && styles.labelCompleted,
              ]}
            >
              {label}
            </Text>
          );
        })}
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
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dotWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: t.colors.bgTertiary,
      borderWidth: 2,
      borderColor: t.colors.border,
    },
    dotCompleted: {
      backgroundColor: t.colors.success,
      borderColor: t.colors.success,
    },
    dotCurrent: {
      backgroundColor: t.colors.accent,
      borderColor: t.colors.accent,
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    dotUpcoming: {
      backgroundColor: 'transparent',
      borderColor: t.colors.border,
    },
    connector: {
      width: 40,
      height: 2,
      backgroundColor: t.colors.border,
      marginHorizontal: 4,
    },
    connectorCompleted: {
      backgroundColor: t.colors.success,
    },
    labelsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: t.spacing.xs,
      paddingHorizontal: t.spacing.sm,
    },
    label: {
      fontSize: t.typography.fontSize.xs,
      color: t.colors.textMuted,
      textAlign: 'center',
      flex: 1,
    },
    labelCurrent: {
      color: t.colors.accent,
      fontWeight: '600',
    },
    labelCompleted: {
      color: t.colors.success,
    },
  }));
