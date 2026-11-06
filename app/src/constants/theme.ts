/** Shared app theme; role-specific accents live in src/lib/brand.ts. */
import '@/global.css';
import { Platform } from 'react-native';

import { KlippColors } from '@/lib/brand';

export const Colors = {
  light: {
    text: KlippColors.navy,
    background: KlippColors.canvas,
    backgroundElement: KlippColors.white,
    backgroundSelected: KlippColors.surfaceBlue,
    textSecondary: KlippColors.muted,
  },
  dark: {
    text: '#F8FAFC',
    background: KlippColors.navyDeep,
    backgroundElement: '#1B2942',
    backgroundSelected: '#293A5A',
    textSecondary: '#B5C0D0',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
  eight: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 1120;
