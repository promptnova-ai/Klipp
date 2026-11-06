/** Klipp design system: one Caribbean brand with clear role accents. */
export const KlippColors = {
  navy: '#15213B',
  navyDeep: '#101A30',
  slate: '#334155',
  blue: '#315BFF',
  blueDark: '#2447D8',
  teal: '#0F987A',
  tealDark: '#087A63',
  gold: '#D49700',
  goldLight: '#FFF5D9',
  canvas: '#F5F7FB',
  white: '#FFFFFF',
  muted: '#64748B',
  border: '#E7ECF3',
  danger: '#B42318',
  success: '#16845B',
  warning: '#A86B00',
  ink: '#18243A',
  surfaceMuted: '#F8FAFD',
  surfaceBlue: '#EEF2FF',
  surfaceTeal: '#E8F6F1',
  surfaceViolet: '#F1EDFA',
} as const;

export const RoleThemes = {
  client: {
    accent: KlippColors.blue,
    accentStrong: KlippColors.blueDark,
    accentSoft: KlippColors.surfaceBlue,
    canvas: KlippColors.canvas,
    ink: KlippColors.navy,
    label: 'CLIENTE',
  },
  pro: {
    accent: KlippColors.teal,
    accentStrong: KlippColors.tealDark,
    accentSoft: KlippColors.surfaceTeal,
    canvas: '#F3F8F6',
    ink: '#173B34',
    label: 'KLIPP PRO',
  },
  admin: {
    accent: '#7051C8',
    accentStrong: '#593DAA',
    accentSoft: KlippColors.surfaceViolet,
    canvas: '#F6F5FA',
    ink: '#27213F',
    label: 'ADMINISTRACIÓN',
  },
} as const;

export type KlippRole = keyof typeof RoleThemes;

export const KlippLayout = {
  pageGutter: 24,
  pageGutterCompact: 16,
  contentMaxWidth: 1120,
  contentNarrowWidth: 760,
  radiusCard: 20,
  radiusCardLarge: 24,
  radiusControl: 12,
  radiusPill: 999,
  controlHeight: 50,
  sectionGap: 24,
  cardGap: 14,
} as const;

export const KlippMotion = {
  fast: 140,
  standard: 220,
  screen: 280,
  slow: 360,
  pressScale: 0.985,
  screenOffset: 12,
} as const;
