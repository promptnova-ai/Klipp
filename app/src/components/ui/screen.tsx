import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KlippColors, Space } from '@/lib/brand';

type Props = { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> };

export function Screen({ children, scroll = true, style }: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingTop: insets.top + Space.lg,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xxxl,
    gap: Space.xl,
  };

  if (!scroll) return <View style={[styles.root, padding, style]}>{children}</View>;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[padding, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: KlippColors.canvas } });
