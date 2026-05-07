import { colors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { radius } from './radius';

export const theme = {
  colors,
  spacing,
  typography,
  radius,
} as const;

export type Theme = typeof theme;

// Re-export individual modules
export { colors, spacing, typography, radius };
export { APP_MAX_WIDTH, appWidthStyle, modalPageStyle } from './layout';
