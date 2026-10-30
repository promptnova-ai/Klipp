/** Klipp visual system: one brand, role-specific accents, shared neutral surfaces. */
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
} as const;

export const RoleThemes = {
  client: {
    accent: '#315BFF',
    accentStrong: '#2447D8',
    accentSoft: '#EEF2FF',
    canvas: '#F5F7FB',
    ink: '#15213B',
  },
  pro: {
    accent: '#0F987A',
    accentStrong: '#087A63',
    accentSoft: '#E8F6F1',
    canvas: '#F3F8F6',
    ink: '#173B34',
  },
  admin: {
    accent: '#7051C8',
    accentStrong: '#593DAA',
    accentSoft: '#F1EDFA',
    canvas: '#F6F5FA',
    ink: '#27213F',
  },
} as const;

export type KlippRole = keyof typeof RoleThemes;

export const KlippLayout = {
  pageGutter: 20,
  contentMaxWidth: 1120,
  radiusCard: 18,
  radiusControl: 12,
  controlHeight: 50,
  sectionGap: 24,
} as const;
