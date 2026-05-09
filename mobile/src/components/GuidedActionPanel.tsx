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
import { colors, designFonts, useAppAppearance } from '@/theme';

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
  const { palette } = useAppAppearance();
  const accent = tone === 'success' ? palette.success : palette.accent;
  const actions = [secondaryAction, primaryAction].filter(Boolean) as GuidedActionButton[];

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { borderLeftColor: accent, backgroundColor: palette.bg, borderTopColor: palette.border },
      ]}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <View style={[styles.icon, { backgroundColor: palette.chipBg }]}>
          <ToneIcon tone={tone} color={accent} />
        </View>
      </View>
      <View style={styles.body}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text> : null}
        {actions.length > 0 ? (
          <View style={[styles.actions, actions.length === 1 && styles.actionsSingle]}>
            {actions.map((action) => {
              const isPrimary = action === primaryAction;
              return (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.button,
                    isPrimary
                      ? [styles.primaryButton, { backgroundColor: accent, borderColor: accent }]
                      : [styles.secondaryButton, { backgroundColor: palette.bgElev, borderColor: palette.border }],
                    action.disabled && styles.buttonDisabled,
                  ]}
                  onPress={action.onPress}
                  disabled={action.disabled || action.loading}
                  activeOpacity={0.75}
                  testID={action.testID}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={isPrimary ? palette.bg : accent} />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      isPrimary ? [styles.primaryButtonText, { color: palette.bg }] : [styles.secondaryButtonText, { color: accent }],
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
    backgroundColor: colors.bgPrimary,
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
    backgroundColor: colors.userBg,
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
    fontFamily: designFonts.mono,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.textPrimary,
    fontFamily: designFonts.sans,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontFamily: designFonts.sans,
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
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButton: {},
  secondaryButton: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: designFonts.sans,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
  },
  secondaryButtonText: {},
});

export default GuidedActionPanel;
