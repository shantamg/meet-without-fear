import { StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from './index';

export const commonStyles = StyleSheet.create({
  // Message bubbles
  messageAi: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: 24,
  },
  messageUser: {
    backgroundColor: colors.userBg,
    color: colors.textPrimary,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    maxWidth: '85%',
    alignSelf: 'flex-end',
  },

  // Panels
  panel: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Buttons
  btnPrimary: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.sm,
  },
  btnPrimaryText: {
    color: colors.textOnAccent,
    fontWeight: '500',
    fontSize: typography.fontSize.base,
  },
  btnSecondary: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.sm,
  },

  // Input
  inputWrapper: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.xl,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputField: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },

  // Cards
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Header
  header: {
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
