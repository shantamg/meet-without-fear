import { colors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { radius } from './radius';
import { designFonts } from './fonts';

export const theme = {
  colors,
  spacing,
  typography,
  radius,
  designFonts,
} as const;

export type Theme = typeof theme;

// Re-export individual modules
export { colors, spacing, typography, radius, designFonts };
export { APP_MAX_WIDTH, appWidthStyle, modalPageStyle } from './layout';
export { AppearanceProvider, useAppAppearance, appPalettes } from './appearance';
export type { AppearancePreference } from './appearance';
