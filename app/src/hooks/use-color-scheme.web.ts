import { useColorScheme as useRNColorScheme } from 'react-native';

/** Keep a deterministic light fallback during static rendering. */
export function useColorScheme() {
  return useRNColorScheme() ?? 'light';
}
