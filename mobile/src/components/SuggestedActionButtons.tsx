/**
 * SuggestedActionButtons Component
 *
 * Displays action suggestions from the AI during Inner Thoughts sessions.
 * Users can tap to start a partner session, meditation, gratitude entry, etc.
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users, Moon, Heart, Activity } from 'lucide-react-native';
import { SuggestedAction, SuggestedActionType } from '@meet-without-fear/shared';

import { useAppAppearance } from '../theme';

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

// ============================================================================
// Component
// ============================================================================

export function SuggestedActionButtons({
  actions,
  onActionPress,
  onDismiss,
}: SuggestedActionButtonsProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const actionColors: Record<SuggestedActionType, string> = useMemo(() => ({
    start_partner_session: palette.accent,
    start_meditation: palette.info,
    add_gratitude: palette.success,
    check_need: palette.warning,
  }), [palette]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Suggested next steps</Text>
        {onDismiss && (
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismissButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss suggested next steps"
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.actionList}>
        {actions.map((action, index) => {
          const Icon = ACTION_ICONS[action.type] || Activity;
          const iconColor = actionColors[action.type] || palette.accent;

          return (
            <TouchableOpacity
              key={`${action.type}-${index}`}
              style={styles.actionButton}
              onPress={() => onActionPress(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={styles.iconContainer}>
                <Icon color={iconColor} size={18} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2} ellipsizeMode="tail">
                {action.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      backgroundColor: palette.bg,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: 10,
      paddingBottom: 10,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    headerText: {
      fontSize: 13,
      color: palette.textMuted,
      fontWeight: '600',
    },
    dismissButton: {
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    dismissText: {
      fontSize: 13,
      color: palette.textMuted,
    },
    actionList: {
      paddingHorizontal: 16,
      gap: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.bgElev,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    actionLabel: {
      flex: 1,
      fontSize: 14,
      lineHeight: 19,
      color: palette.text,
      fontWeight: '600',
    },
  });
