import { KlippRadii } from '@/theme/tokens';

/** Legacy radius names mapped to canonical Klipp radii. */
export const radius = {
  sm: KlippRadii.small, md: KlippRadii.medium, lg: KlippRadii.control,
  xl: KlippRadii.card, '2xl': KlippRadii.cardLarge, pill: KlippRadii.pill,
} as const;
