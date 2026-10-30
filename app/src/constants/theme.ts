/**
 * Shared neutral theme primitives for Klipp.
 * Role accents live in src/lib/brand.ts and are applied by the role layouts.
 */
import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#15213B',
    background: '#F5F7FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF2FF',
    textSecondary: '#64748B',
  },
  dark: {
    text: '#F8FAFC',
    background: '#101A30',
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
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 1120;
