export const KlippColors = {
  // Core brand palette — Caribbean Energy.
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  violet: '#7C3AED',
  cyan: '#06B6D4',
  navy: '#0F172A',
  navyDeep: '#0B1020',
  slate: '#334155',
  muted: '#64748B',
  canvas: '#F8FAFC',
  white: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  surfaceSoft: '#F1F5F9',
  blueSoft: '#EFF6FF',
  violetSoft: '#F5F3FF',
  cyanSoft: '#ECFEFF',
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  danger: '#B42318',
  dangerSoft: '#FEF2F2',
  // Backwards-compatible semantic aliases used by existing screens.
  teal: '#06B6D4',
  tealDark: '#0891B2',
  gold: '#7C3AED',
  goldLight: '#F5F3FF',
} as const;

export const KlippLayout = {
  pageGutter: 20,
  contentMaxWidth: 1120,
  cardRadius: 22,
  controlRadius: 14,
  pillRadius: 999,
  sectionGap: 24,
} as const;
