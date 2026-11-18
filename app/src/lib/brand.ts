/** Klipp design system: one Caribbean brand with clear role accents. */
export const KlippColors = {
  navy: '#153B66',
  navyDeep: '#0E2D50',
  slate: '#526579',
  blue: '#153B66',
  blueDark: '#0E2D50',
  teal: '#16B8AD',
  tealDark: '#0D9189',
  gold: '#F4A340',
  goldLight: '#FFF3E3',
  canvas: '#F5F7FA',
  white: '#FFFFFF',
  muted: '#526579',
  border: '#DCE5EC',
  danger: '#B42318',
  success: '#16845B',
  warning: '#A86B00',
  ink: '#142B45',
  surfaceMuted: '#EEF3F7',
  surfaceBlue: '#E8F0F7',
  surfaceTeal: '#E4F8F6',
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
  radiusCard: 16,
  radiusCardLarge: 20,
  radiusControl: 12,
  radiusPill: 999,
  controlHeight: 52,
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
