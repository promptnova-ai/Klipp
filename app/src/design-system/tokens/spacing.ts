import { KlippSpacing } from '@/theme/tokens';

/** Legacy scale names mapped to the single canonical spacing scale. */
export const spacing = {
  xs: KlippSpacing[1], sm: KlippSpacing[2], md: KlippSpacing[3],
  base: KlippSpacing[4], lg: KlippSpacing[6], xl: KlippSpacing[8],
  '2xl': KlippSpacing[12], '3xl': KlippSpacing[16],
} as const;
