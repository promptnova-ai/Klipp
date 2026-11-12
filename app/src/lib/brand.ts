/** Klipp Caribbean Utility — shared visual language for client, PRO and admin. */
export const KlippColors = {
  // Core brand palette
  cobalt: '#EAB308',
  cobaltDark: '#CA8A04',
  coral: '#EF4444',
  mint: '#EAB308',
  ivory: '#0A0A0B',
  ink: '#F4F4F5',
  white: '#FFFFFF',
  muted: '#A1A1AA',
  border: '#27272A',
  surface: '#18181B',
  surfaceMuted: '#202024',
  surfaceBlue: '#272217',
  surfaceCoral: '#2A1717',
  surfaceMint: '#E7F7F0',
  navy: '#171B2D',
  navyDeep: '#09090B',
  slate: '#D4D4D8',
  blue: '#3D5AFE',
  blueDark: '#3048D8',
  teal: '#3D5AFE',
  tealDark: '#3048D8',
  gold: '#FF7058',
  goldLight: '#FFF0EC',
  canvas: '#F7F5F0',
  danger: '#C43F35',
  success: '#22C55E',
  warning: '#F59E0B',
  surfaceTeal: '#E7F7F0',
  surfaceViolet: '#E9EDFF',
} as const;

/** Role labels remain distinct; all roles share one brand palette and surface system. */
export const RoleThemes = {
  client: {
    accent: KlippColors.cobalt,
    accentStrong: KlippColors.cobaltDark,
    accentSoft: KlippColors.surfaceBlue,
    canvas: KlippColors.ivory,
    ink: KlippColors.ink,
    label: 'CLIENTE',
  },
  pro: {
    accent: KlippColors.cobalt,
    accentStrong: KlippColors.cobaltDark,
    accentSoft: KlippColors.surfaceMint,
    canvas: KlippColors.ivory,
    ink: KlippColors.ink,
    label: 'KLIPP PRO',
  },
  admin: {
    accent: KlippColors.cobalt,
    accentStrong: KlippColors.cobaltDark,
    accentSoft: KlippColors.surfaceBlue,
    canvas: KlippColors.ivory,
    ink: KlippColors.ink,
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
  radiusControl: 14,
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
