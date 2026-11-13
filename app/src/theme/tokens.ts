/** Canonical design tokens for every Klipp surface (React Native + web). */
export const KlippColors = {
  cobalt: '#3D5AFE',
  cobaltDark: '#3048D8',
  coral: '#FF7058',
  coralDark: '#E65C45',
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
  surfaceSuccess: '#E8F7EE',
  surfaceWarning: '#FFF4DB',
  surfaceDanger: '#FEECEB',
  danger: '#C43F35',
  success: '#247A5A',
  warning: '#A85A25',
  slate: '#3D4358',

  /** @deprecated Compatibility aliases. Use cobalt/ink/coral and semantic surfaces. */
  navy: '#171B2D',
  navyDeep: '#111525',
  blue: '#3D5AFE',
  blueDark: '#3048D8',
  teal: '#3D5AFE',
  tealDark: '#3048D8',
  gold: '#FF7058',
  goldLight: '#FFF0EC',
  canvas: '#F7F5F0',
  surfaceTeal: '#E7F7F0',
  surfaceViolet: '#E9EDFF',
  whiteBlue: '#E9EDFF',
  whiteMint: '#E7F7F0',
  whiteCoral: '#FFF0EC',
  whiteMuted: '#F1EFE9',
  whiteTeal: '#E7F7F0',
} as const;

export const KlippSpacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

export const KlippTypography = {
  family: { regular: 'System', medium: 'System', semibold: 'System', bold: 'System' },
  size: { caption: 11, small: 12, bodySmall: 13, body: 15, bodyLarge: 17, titleSmall: 19, title: 22, titleLarge: 30, display: 36 },
  lineHeight: { caption: 15, small: 17, bodySmall: 19, body: 22, bodyLarge: 25, titleSmall: 25, title: 29, titleLarge: 36, display: 42 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
  tracking: { tight: -0.45, normal: 0, label: 0.8, eyebrow: 1.1 },
} as const;

export const KlippRadii = {
  control: 16, card: 22, cardLarge: 28, pill: 999, modal: 28,
} as const;

export const KlippShadows = {
  card: { shadowColor: '#171B2D', shadowOpacity: 0.035, shadowOffset: { width: 0, height: 7 }, shadowRadius: 20, elevation: 2 },
  floating: { shadowColor: '#171B2D', shadowOpacity: 0.10, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 5 },
} as const;

export const KlippLayout = {
  pageGutter: 24, pageGutterCompact: 16, contentMaxWidth: 1120, contentNarrowWidth: 760,
  radiusCard: KlippRadii.card, radiusCardLarge: KlippRadii.cardLarge, radiusControl: KlippRadii.control, radiusPill: KlippRadii.pill,
  controlHeight: 54, sectionGap: 28, cardGap: 16,
} as const;

export const KlippMotion = {
  fast: 140, standard: 220, screen: 280, slow: 360, pressScale: 0.985, screenOffset: 12,
} as const;
