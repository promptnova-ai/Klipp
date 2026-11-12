import type { ViewStyle } from 'react-native';
export const shadows: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: { shadowColor: '#171B2D', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  md: { shadowColor: '#171B2D', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  lg: { shadowColor: '#171B2D', shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
};
