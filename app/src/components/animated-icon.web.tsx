import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { KlippMark } from '@/components/klipp-mark';
import { useReducedMotion } from '@/components/ui-primitives';
import { KlippColors } from '@/theme/tokens';

const DURATION = 420;

const splashKeyframe = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: Easing.out(Easing.cubic) },
});

const iconKeyframe = new Keyframe({
  0: { transform: [{ scale: 0.94 }], opacity: 0 },
  100: { transform: [{ scale: 1 }], opacity: 1, easing: Easing.out(Easing.cubic) },
});

const backgroundKeyframe = new Keyframe({
  0: { transform: [{ scale: 0.96 }] },
  100: { transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
});

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const reducedMotion = useReducedMotion();


  if (!visible) return null;

  const entering = reducedMotion
    ? undefined
    : splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      });

  return (
    <Animated.View
      entering={entering}
      onLayout={() => {
        if (reducedMotion) setVisible(false);
      }}
      style={styles.splashOverlay}>
      <View style={styles.splashBrand}>
        <KlippMark size={92} />
        <Text style={styles.brandName}>klipp</Text>
      </View>
    </Animated.View>
  );
}

export function AnimatedIcon() {
  const reducedMotion = useReducedMotion();
  return (
    <View style={styles.iconContainer}>
      <Animated.View
        entering={reducedMotion ? undefined : backgroundKeyframe.duration(DURATION)}
        style={styles.background}
      />
      <Animated.View
        entering={reducedMotion ? undefined : iconKeyframe.duration(DURATION)}
        style={styles.imageContainer}>
        <KlippMark size={76} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: KlippColors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashBrand: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandName: { color: KlippColors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -1.2 },
  iconContainer: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  background: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    backgroundColor: KlippColors.surfaceBlue,
  },
  imageContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
