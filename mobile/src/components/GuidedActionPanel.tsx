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
import { colors, designFonts, radius, spacing, typography, useAppAppearance } from '@/theme';

type GuidedActionTone = 'topic' | 'review' | 'share' | 'success' | 'needs';

const PANEL_BORDER_ACCENT_WIDTH = 3;
const PANEL_ICON_SIZE = 17;
const PANEL_ICON_STROKE_WIDTH = 2.4;
const PANEL_BUTTON_MIN_HEIGHT = spacing['3xl'] + spacing.sm;
const PANEL_ICON_TOP_ALIGNMENT_OFFSET = 1;
const PANEL_EYEBROW_LETTER_SPACING = 0.8;

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
  const iconProps = { color, size: PANEL_ICON_SIZE, strokeWidth: PANEL_ICON_STROKE_WIDTH };
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
                    <ActivityIndicator size="small" color={isPrimary ? '#fffaf0' : accent} />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      isPrimary ? [styles.primaryButtonText, { color: '#fffaf0' }] : [styles.secondaryButtonText, { color: accent }],
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
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderLeftWidth: PANEL_BORDER_ACCENT_WIDTH,
  },
  containerCompact: {
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    paddingTop: PANEL_ICON_TOP_ALIGNMENT_OFFSET,
  },
  icon: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.userBg,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: PANEL_EYEBROW_LETTER_SPACING,
    marginBottom: spacing.xs,
    fontFamily: designFonts.mono,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    lineHeight: spacing.xl,
    color: colors.textPrimary,
    fontFamily: designFonts.sans,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.base,
    lineHeight: spacing.xl,
    color: colors.textSecondary,
    fontFamily: designFonts.sans,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionsSingle: {
    justifyContent: 'flex-end',
  },
  button: {
    flex: 1,
    minHeight: PANEL_BUTTON_MIN_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
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
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    fontFamily: designFonts.sans,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
  },
  secondaryButtonText: {},
});

export default GuidedActionPanel;
