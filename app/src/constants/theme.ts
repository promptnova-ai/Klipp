/** Compatibility exports for Expo template components; values come from the canonical Klipp theme. */
import '@/global.css';
import { Platform } from 'react-native';

import { KlippColors, KlippLayout, KlippSpacing } from '@/theme/tokens';

export const Colors = {
  light: {
    text: KlippColors.ink,
    background: KlippColors.ivory,
    backgroundElement: KlippColors.white,
    backgroundSelected: KlippColors.surfaceBlue,
    textSecondary: KlippColors.muted,
  },
  dark: {
    text: KlippColors.darkInk,
    background: KlippColors.darkCanvas,
    backgroundElement: KlippColors.darkSurface,
    backgroundSelected: KlippColors.darkSurfaceSelected,
    textSecondary: KlippColors.darkMuted,
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
  one: KlippSpacing[1],
  two: KlippSpacing[2],
  three: KlippSpacing[3],
  four: KlippSpacing[4],
  five: KlippSpacing[6],
  six: KlippSpacing[8],
  seven: KlippSpacing[12],
  eight: KlippSpacing[16],
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = KlippLayout.contentMaxWidth;
