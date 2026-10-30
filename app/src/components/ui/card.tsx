import { StyleSheet, View, type ViewProps } from 'react-native';

import { KlippColors, Radius, Space } from '@/lib/brand';

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: KlippColors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: KlippColors.border,
    padding: Space.lg,
    gap: Space.md,
  },
});
