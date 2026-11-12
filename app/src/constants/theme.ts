/** Shared app theme; role labels and accents live in src/lib/brand.ts. */
import '@/global.css';
import { Platform } from 'react-native';

import { KlippColors } from '@/lib/brand';

export const Colors = {
  light: {
    text: KlippColors.ink,
    background: KlippColors.ivory,
    backgroundElement: KlippColors.white,
    backgroundSelected: KlippColors.surfaceBlue,
    textSecondary: KlippColors.muted,
  },
  dark: {
    text: '#F7F5F0',
    background: '#171B2D',
    backgroundElement: '#22283D',
    backgroundSelected: '#303B68',
    textSecondary: '#B7BDCE',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'Inter',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Inter',
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
