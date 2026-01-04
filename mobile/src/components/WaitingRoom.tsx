/**
 * WaitingRoom Component
 *
 * Displayed when waiting for the partner to complete a stage gate.
 * Shows partner info, stage progress, and a friendly waiting message.
 * Optionally shows a button to continue reflecting in Inner Thoughts.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Layers } from 'lucide-react-native';
import { colors } from '@/theme';

// Avatar gradient colors (purple gradient approximation)
const AVATAR_GRADIENT_COLOR = '#7159c1'; // Middle of #667eea and #764ba2

// ============================================================================
// Types
// ============================================================================

interface WaitingRoomProps {
  message: string;
  partnerName?: string;
  partnerInitial?: string;
  currentStage?: number;
  totalStages?: number;
  partnerProgress?: number; // 0-100 percentage
  /** Callback when user wants to continue in Inner Thoughts */
  onContinueInInnerThoughts?: () => void;
}

// ============================================================================
// Stage Names
// ============================================================================

const STAGE_NAMES: Record<number, string> = {
  1: 'The Witness',
  2: 'The Mirror',
  3: 'The Bridge',
  4: 'The Resolution',
  5: 'The Commitment',
};

// ============================================================================
// Component
// ============================================================================

export function WaitingRoom({
  message,
  partnerName,
  partnerInitial,
  currentStage = 1,
  totalStages = 5,
  partnerProgress,
  onContinueInInnerThoughts,
}: WaitingRoomProps) {
  const displayInitial = partnerInitial || (partnerName ? partnerName[0].toUpperCase() : '?');
  const stageName = STAGE_NAMES[currentStage] || `Stage ${currentStage}`;

  return (
    <View style={styles.container}>
      {/* Partner Card */}
      <View style={styles.partnerCard}>
        {/* Partner Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayInitial}</Text>
        </View>

        {/* Partner Info */}
        <View style={styles.partnerInfo}>
          {partnerName && (
            <Text style={styles.partnerName}>{partnerName}</Text>
          )}
          <Text style={styles.stageText}>
            Currently in Stage {currentStage}: {stageName}
          </Text>
        </View>
      </View>

      {/* Stage Progress Indicator */}
      <View style={styles.stageDotsContainer}>
        {Array.from({ length: totalStages }, (_, index) => {
          const stageNumber = index + 1;
          const isCompleted = stageNumber < currentStage;
          const isCurrent = stageNumber === currentStage;

          return (
            <View
              key={stageNumber}
              style={[
                styles.stageDot,
                isCompleted && styles.stageDotCompleted,
                isCurrent && styles.stageDotCurrent,
              ]}
            />
          );
        })}
      </View>

      {/* Progress Bar (optional) */}
      {partnerProgress !== undefined && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(0, partnerProgress))}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{partnerProgress}% complete</Text>
        </View>
      )}

      {/* Waiting Indicator */}
      <View style={styles.iconContainer} testID="waiting-indicator">
        <Text style={styles.icon}>&#8987;</Text>
      </View>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>
      {partnerName && (
        <Text style={styles.waitingText}>
          Waiting for {partnerName} to complete this step
        </Text>
      )}

      {/* Inner Thoughts CTA */}
      {onContinueInInnerThoughts && (
        <View style={styles.innerThoughtsContainer}>
          <Text style={styles.innerThoughtsLabel}>
            While you wait, you're welcome to chat further
          </Text>
          <TouchableOpacity
            style={styles.innerThoughtsButton}
            onPress={onContinueInInnerThoughts}
            activeOpacity={0.8}
          >
            <Layers size={20} color={colors.accent} />
            <Text style={styles.innerThoughtsButtonText}>
              Open Inner Thoughts
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.bgSecondary,
  },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AVATAR_GRADIENT_COLOR,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#ffffff',
  },
  partnerInfo: {
    marginLeft: 16,
    flex: 1,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stageText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  stageDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.bgTertiary,
  },
  stageDotCompleted: {
    backgroundColor: colors.success,
  },
  stageDotCurrent: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 24,
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: colors.bgTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
    color: colors.accent,
  },
  message: {
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  waitingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  innerThoughtsContainer: {
    marginTop: 32,
    alignItems: 'center',
    width: '100%',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  innerThoughtsLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  innerThoughtsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgTertiary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  innerThoughtsButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.accent,
  },
});

export default WaitingRoom;
