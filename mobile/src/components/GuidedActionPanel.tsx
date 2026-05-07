import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  Lightbulb,
  MessageCircle,
  Pencil,
  Target,
} from 'lucide-react-native';
import { colors } from '@/theme';

type GuidedActionTone = 'topic' | 'review' | 'share' | 'success' | 'needs';

interface GuidedActionButton {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

export interface GuidedActionPanelProps {
  tone: GuidedActionTone;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryAction?: GuidedActionButton;
  secondaryAction?: GuidedActionButton;
  compact?: boolean;
  testID?: string;
}

const toneColors: Record<GuidedActionTone, string> = {
  topic: colors.accent,
  review: colors.brandBlue,
  share: colors.warning,
  success: 'rgb(20, 184, 166)',
  needs: colors.brandPurple,
};

function ToneIcon({ tone, color }: { tone: GuidedActionTone; color: string }) {
  const iconProps = { color, size: 17, strokeWidth: 2.4 };
  switch (tone) {
    case 'topic':
      return <Target {...iconProps} />;
    case 'review':
      return <MessageCircle {...iconProps} />;
    case 'share':
      return <Lightbulb {...iconProps} />;
    case 'success':
      return <Check {...iconProps} />;
    case 'needs':
      return <Pencil {...iconProps} />;
    default:
      return <Target {...iconProps} />;
  }
}

export function GuidedActionPanel({
  tone,
  eyebrow,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  compact = false,
  testID,
}: GuidedActionPanelProps) {
  const accent = toneColors[tone];
  const actions = [secondaryAction, primaryAction].filter(Boolean) as GuidedActionButton[];

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { borderLeftColor: accent },
      ]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <View style={styles.icon}>
          <ToneIcon tone={tone} color={accent} />
        </View>
      </View>
      <View style={styles.body}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {actions.length > 0 ? (
          <View style={[styles.actions, actions.length === 1 && styles.actionsSingle]}>
            {actions.map((action) => {
              const isPrimary = action === primaryAction;
              return (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.button,
                    isPrimary ? [styles.primaryButton, { backgroundColor: accent, borderColor: accent }] : styles.secondaryButton,
                    action.disabled && styles.buttonDisabled,
                  ]}
                  onPress={action.onPress}
                  disabled={action.disabled || action.loading}
                  activeOpacity={0.75}
                  testID={action.testID}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={isPrimary ? colors.textOnAccent : accent} />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      isPrimary ? styles.primaryButtonText : [styles.secondaryButtonText, { color: accent }],
                    ]}>
                      {action.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderLeftWidth: 3,
  },
  containerCompact: {
    paddingVertical: 10,
  },
  iconWrap: {
    paddingTop: 1,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionsSingle: {
    justifyContent: 'flex-end',
  },
  button: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButton: {},
  secondaryButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButtonText: {
    color: colors.textOnAccent,
  },
  secondaryButtonText: {},
});

export default GuidedActionPanel;
