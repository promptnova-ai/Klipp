import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { KlippColors, Radius } from '@/lib/brand';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const spring = { damping: 20, stiffness: 300 };

export function Button({ label, variant = 'primary', loading, disabled, onPress, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = !!(disabled || loading);

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => { scale.value = withSpring(0.97, spring); }}
      onPressOut={() => { scale.value = withSpring(1, spring); }}
      onPress={(event) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      style={[styles.base, styles[variant], inactive && styles.disabled, animated]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? KlippColors.white : KlippColors.blue} />
      ) : (
        <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelAlt]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: KlippColors.blue },
  secondary: { backgroundColor: KlippColors.blueSoft },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '700' },
  labelPrimary: { color: KlippColors.white },
  labelAlt: { color: KlippColors.blue },
});
