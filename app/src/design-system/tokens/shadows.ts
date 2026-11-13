import type { ViewStyle } from 'react-native';
import { KlippShadows } from '@/theme/tokens';

/** Legacy shadow presets mapped to the canonical shared surface elevations. */
export const shadows: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: KlippShadows.card,
  md: KlippShadows.card,
  lg: KlippShadows.floating,
};
