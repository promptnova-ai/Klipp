/** Klipp Caribbean Utility — shared visual language for client, PRO and admin. */
export const KlippColors = {
  cobalt: '#3D5AFE',
  cobaltDark: '#3048D8',
  coral: '#FF7058',
  mint: '#BCEBD8',
  ivory: '#F7F5F0',
  ink: '#171B2D',
  white: '#FFFFFF',
  muted: '#72778A',
  border: '#E8E5DE',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EFE9',
  surfaceBlue: '#E9EDFF',
  surfaceCoral: '#FFF0EC',
  surfaceMint: '#E7F7F0',
  navy: '#171B2D',
  navyDeep: '#111525',
  slate: '#3D4358',
  blue: '#3D5AFE',
  blueDark: '#3048D8',
  teal: '#3D5AFE',
  tealDark: '#3048D8',
  gold: '#FF7058',
  goldLight: '#FFF0EC',
  canvas: '#F7F5F0',
  danger: '#C43F35',
  success: '#247A5A',
  warning: '#A85A25',
  surfaceTeal: '#E7F7F0',
  surfaceViolet: '#E9EDFF',
  whiteBlue: '#E9EDFF',
  whiteMint: '#E7F7F0',
  whiteCoral: '#FFF0EC',
  whiteMuted: '#F1EFE9',
  whiteTeal: '#E7F7F0',
} as const;

export const RoleThemes = {
  client: { accent: KlippColors.cobalt, accentStrong: KlippColors.cobaltDark, accentSoft: KlippColors.surfaceBlue, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'CLIENTE' },
  pro: { accent: KlippColors.cobalt, accentStrong: KlippColors.cobaltDark, accentSoft: KlippColors.surfaceMint, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'KLIPP PRO' },
  admin: { accent: KlippColors.cobalt, accentStrong: KlippColors.cobaltDark, accentSoft: KlippColors.surfaceBlue, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'ADMINISTRACIÓN' },
} as const;

export type KlippRole = keyof typeof RoleThemes;

export const KlippLayout = {
  pageGutter: 24, pageGutterCompact: 16, contentMaxWidth: 1120, contentNarrowWidth: 760,
  radiusCard: 20, radiusCardLarge: 24, radiusControl: 14, radiusPill: 999,
  controlHeight: 52, sectionGap: 24, cardGap: 14,
} as const;

export const KlippMotion = {
  fast: 140, standard: 220, screen: 280, slow: 360, pressScale: 0.985, screenOffset: 12,
} as const;
