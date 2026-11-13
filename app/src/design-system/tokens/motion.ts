import { KlippMotion } from '@/theme/tokens';

/** Legacy motion names mapped to canonical interaction timings. */
export const motion = {
  fast: KlippMotion.fast,
  standard: KlippMotion.standard,
  emphasis: KlippMotion.screen,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  pressScale: KlippMotion.pressScale,
} as const;
