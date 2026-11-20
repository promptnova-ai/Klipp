/** Klipp UX system tokens. React Native / Expo safe; no web-only values. */
export const KlippTokens = {
  color: {
    light: {
      background: '#F5F7FA',
      surface: '#FFFFFF',
      surfaceRaised: '#FFFFFF',
      text: '#142B45',
      textSecondary: '#526579',
      textTertiary: '#718096',
      border: '#DCE5EC',
      primary: '#153B66',
      primaryPressed: '#0E2D50',
      primarySoft: '#E8F0F7',
      secondary: '#16B8AD',
      secondaryPressed: '#0D9189',
      secondarySoft: '#E4F8F6',
      accent: '#F4A340',
      accentSoft: '#FFF3E3',
      success: '#16845B',
      successSoft: '#E7F5EE',
      warning: '#A86B00',
      warningSoft: '#FFF3DF',
      danger: '#B42318',
      dangerSoft: '#FDECEA',
      info: '#245B9A',
      infoSoft: '#EAF2FC',
      disabled: '#A8B4C2',
      overlay: 'rgba(15, 35, 55, 0.48)',
    },
    // Optional dark mode remains inside Klipp's Caribbean brand palette.
    dark: {
      background: '#0E2D50',
      surface: '#153B66',
      surfaceRaised: '#1B4A78',
      text: '#FFFFFF',
      textSecondary: '#D5E2EE',
      textTertiary: '#AFC2D3',
      border: '#315779',
      primary: '#16B8AD',
      primaryPressed: '#0D9189',
      primarySoft: '#174B67',
      secondary: '#F4A340',
      secondaryPressed: '#E58D2B',
      secondarySoft: '#4B3A2A',
      accent: '#F4A340',
      accentSoft: '#4B3A2A',
      success: '#55C99A',
      successSoft: '#174B49',
      warning: '#FFC36B',
      warningSoft: '#4B3A2A',
      danger: '#FF8D86',
      dangerSoft: '#552D36',
      info: '#8BC5E8',
      infoSoft: '#1C4B70',
      disabled: '#7890A6',
      overlay: 'rgba(5, 22, 40, 0.78)',
    },
    pro: {
      accent: '#0C9D91',
      accentSoft: '#E5F7F5',
      accentDark: '#08786F',
    },
  },
  spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  size: { touch: 48, button: 52, buttonCompact: 44, input: 52, icon: 24, avatarSm: 36, avatarMd: 48, avatarLg: 72 },
  typography: {
    family: 'Inter',
    fallback: 'System',
    size: { caption: 12, body: 14, bodyLarge: 16, title: 22, display: 28 },
    lineHeight: { caption: 16, body: 20, bodyLarge: 24, title: 28, display: 34 },
    weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
  },
  motion: { fast: 120, standard: 200, transition: 260, pressScale: 0.985 },
  elevation: {
    card: { shadowColor: '#153B66', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
    floating: { shadowColor: '#102A43', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  },
} as const;

export type KlippColorMode = 'light' | 'dark';
export type KlippPalette = typeof KlippTokens.color.light;

export function getKlippPalette(mode: KlippColorMode = 'light'): KlippPalette {
  return KlippTokens.color[mode] as KlippPalette;
}
