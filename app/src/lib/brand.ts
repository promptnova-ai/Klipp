/** Klipp premium Caribbean visual system — dark surfaces with warm gold accents. */
export const KlippColors = {
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
  surfaceMint: '#272217',
  navy: '#F4F4F5',
  navyDeep: '#09090B',
  slate: '#D4D4D8',
  blue: '#EAB308',
  blueDark: '#CA8A04',
  teal: '#EAB308',
  tealDark: '#CA8A04',
  gold: '#EAB308',
  goldLight: '#272217',
  canvas: '#0A0A0B',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  surfaceTeal: '#272217',
  surfaceViolet: '#272217',
} as const;

export const RoleThemes = {
  client: {
    accent: '#EAB308',
    accentStrong: '#CA8A04',
    accentSoft: '#272217',
    canvas: '#0A0A0B',
    ink: '#F4F4F5',
    label: 'CLIENTE',
  },
  pro: {
    accent: '#D6A441',
    accentStrong: '#B8892E',
    accentSoft: '#292318',
    canvas: '#0A0A0B',
    ink: '#F4F4F5',
    label: 'KLIPP PRO',
  },
  admin: {
    accent: '#EAB308',
    accentStrong: '#CA8A04',
    accentSoft: '#272217',
    canvas: '#0A0A0B',
    ink: '#F4F4F5',
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
