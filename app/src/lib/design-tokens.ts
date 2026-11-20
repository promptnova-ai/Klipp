import { useColorScheme } from 'react-native';

export const KlippPalette = {
  light: {
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceSecondary: '#EEF3F7',
    text: '#142B45',
    textSecondary: '#526579',
    border: '#DCE5EC',
    primary: '#153B66',
    primaryPressed: '#0E2D50',
    primarySoft: '#E8F0F7',
    secondary: '#16B8AD',
    secondarySoft: '#E4F8F6',
    accent: '#F4A340',
    accentSoft: '#FFF3E3',
    success: '#16845B',
    successSoft: '#E7F5EE',
    warning: '#A65D00',
    warningSoft: '#FFF3DF',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
    overlay: 'rgba(15, 35, 55, 0.48)',
    onPrimary: '#FFFFFF',
  },
  dark: {
    // Dark surfaces stay within Klipp's official navy / turquoise / warm-gold palette.
    background: '#0E2D50',
    surface: '#153B66',
    surfaceSecondary: '#1B4A78',
    text: '#FFFFFF',
    textSecondary: '#D5E2EE',
    border: '#315779',
    primary: '#16B8AD',
    primaryPressed: '#0D9189',
    primarySoft: '#174B67',
    secondary: '#F4A340',
    secondarySoft: '#4B3A2A',
    accent: '#F4A340',
    accentSoft: '#4B3A2A',
    success: '#55C99A',
    successSoft: '#174B49',
    warning: '#FFC36B',
    warningSoft: '#4B3A2A',
    danger: '#FF8D86',
    dangerSoft: '#552D36',
    overlay: 'rgba(5, 22, 40, 0.78)',
    onPrimary: '#0E2D50',
  },
} as const;

export type KlippTheme = { [Key in keyof typeof KlippPalette.light]: string };

export function useKlippTheme(): KlippTheme {
  return useColorScheme() === 'dark' ? KlippPalette.dark : KlippPalette.light;
}

export const KlippSpace = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const KlippRadius = {
  control: 12,
  card: 16,
  panel: 20,
  pill: 999,
} as const;

export const KlippType = {
  caption: 12,
  body: 14,
  bodyLarge: 16,
  title: 20,
  display: 24,
} as const;

export const KlippTouch = {
  minimum: 48,
  button: 52,
  bottomAction: 60,
} as const;

export const KlippElevation = {
  card: {
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;
