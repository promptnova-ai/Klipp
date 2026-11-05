export const KlippColors = {
  // Klipp hospitality palette: warm coral, crisp white and soft neutral surfaces.
  blue: '#FF5A5F',
  blueDark: '#E31C5F',
  violet: '#FF385C',
  cyan: '#00A699',
  navy: '#222222',
  navyDeep: '#161616',
  slate: '#484848',
  muted: '#717171',
  canvas: '#FFFFFF',
  white: '#FFFFFF',
  border: '#EBEBEB',
  borderStrong: '#DDDDDD',
  surfaceSoft: '#F7F7F7',
  blueSoft: '#FFF0F1',
  violetSoft: '#FFF0F1',
  cyanSoft: '#E8F6F4',
  success: '#008A70',
  successSoft: '#E8F6F4',
  warning: '#B98900',
  warningSoft: '#FFF8E1',
  danger: '#C13515',
  dangerSoft: '#FFF0ED',
  // Backwards-compatible semantic aliases used by existing screens.
  teal: '#00A699',
  tealDark: '#008A80',
  gold: '#FF5A5F',
  goldLight: '#FFF0F1',
} as const;

export const KlippLayout = {
  pageGutter: 20,
  contentMaxWidth: 1120,
  cardRadius: 22,
  controlRadius: 14,
  pillRadius: 999,
  sectionGap: 24,
} as const;
