/**
 * SuggestedActionButtons Component
 *
 * Displays action suggestions from the AI during Inner Thoughts sessions.
 * Users can tap to start a partner session, meditation, gratitude entry, etc.
 */

import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Users, Moon, Heart, Activity } from 'lucide-react-native';
import { SuggestedAction, SuggestedActionType } from '@meet-without-fear/shared';

import { createStyles } from '../theme/styled';
import { colors } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface SuggestedActionButtonsProps {
  actions: SuggestedAction[];
  onActionPress: (action: SuggestedAction) => void;
  onDismiss?: () => void;
}

// ============================================================================
// Icon mapping
// ============================================================================

const ACTION_ICONS: Record<SuggestedActionType, React.ElementType> = {
  start_partner_session: Users,
  start_meditation: Moon,
  add_gratitude: Heart,
  check_need: Activity,
};

const ACTION_COLORS: Record<SuggestedActionType, string> = {
  start_partner_session: colors.brandBlue,
  start_meditation: colors.brandNavy,
  add_gratitude: colors.success,
  check_need: colors.brandOrange,
};

// ============================================================================
// Component
// ============================================================================

export function SuggestedActionButtons({
  actions,
  onActionPress,
  onDismiss,
}: SuggestedActionButtonsProps) {
  const styles = useStyles();

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Suggested next steps</Text>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {actions.map((action, index) => {
          const Icon = ACTION_ICONS[action.type] || Activity;
          const iconColor = ACTION_COLORS[action.type] || colors.accent;

          return (
            <TouchableOpacity
              key={`${action.type}-${index}`}
              style={styles.actionButton}
              onPress={() => onActionPress(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
                <Icon color={iconColor} size={20} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {action.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const useStyles = () =>
  createStyles((t) => ({
    container: {
      backgroundColor: t.colors.bgSecondary,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.sm,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    headerText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textMuted,
      fontWeight: '500',
    },
    dismissButton: {
      padding: t.spacing.xs,
    },
    dismissText: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textMuted,
    },
    scrollContent: {
      paddingHorizontal: t.spacing.md,
      gap: t.spacing.sm,
    },
    actionButton: {
      backgroundColor: t.colors.bgTertiary,
      borderRadius: 12,
      padding: t.spacing.md,
      minWidth: 140,
      maxWidth: 180,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.sm,
    },
    actionLabel: {
      fontSize: t.typography.fontSize.sm,
      color: t.colors.textPrimary,
      textAlign: 'center',
      fontWeight: '500',
    },
  }));
