import { Platform } from 'react-native';

export const designFonts = {
  sans: Platform.select({
    web: 'Geist',
    default: 'System',
  }),
  mono: Platform.select({
    web: 'Geist Mono',
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
  serif: 'InstrumentSerif',
  serifItalic: 'InstrumentSerifItalic',
} as const;
