import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { KlippColors, KlippLayout, KlippMotion } from '@/lib/brand';

/** Respect the operating system's reduced-motion accessibility preference. */
function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

type ScreenEntranceProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
};

/** Small, consistent entrance motion for routed screens and important panels. */
export function ScreenEntrance({ children, style, delay = 0 }: ScreenEntranceProps) {
  const progress = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: KlippMotion.screen,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [KlippMotion.screenOffset, 0],
  });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'radio' | 'checkbox';
};

/** Tactile press feedback that behaves the same in the web and native clients. */
export function MotionPressable({
  children,
  onPress,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
}: MotionPressableProps) {
  const scale = useMemo(() => new Animated.Value(1), []);

  function animateScale(value: number) {
    Animated.spring(scale, {
      toValue: value,
      speed: 32,
      bounciness: 2,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateScale(KlippMotion.pressScale)}
      onPressOut={() => animateScale(1)}
      style={[style, { transform: [{ scale }] }]}>
      {children}
    </AnimatedPressable>
  );
}

type SurfaceCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Standard Klipp surface for content groups, forms and booking cards. */
export function SurfaceCard({ children, style }: SurfaceCardProps) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function SectionHeading({ eyebrow, title, subtitle, trailing }: SectionHeadingProps) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

type StatusPillProps = {
  label: string;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
};

const toneStyles = {
  info: { backgroundColor: KlippColors.surfaceBlue, color: KlippColors.cobaltDark },
  success: { backgroundColor: KlippColors.surfaceMint, color: KlippColors.success },
  warning: { backgroundColor: KlippColors.surfaceCoral, color: KlippColors.warning },
  danger: { backgroundColor: KlippColors.surfaceCoral, color: KlippColors.danger },
  neutral: { backgroundColor: KlippColors.surfaceMuted, color: KlippColors.slate },
} as const;

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.statusPill, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.statusPillText, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
};

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: PrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <MotionPressable
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        isDanger && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary || isDanger ? '#FFFFFF' : KlippColors.navy} />
      ) : (
        <Text style={[
          styles.buttonText,
          (isPrimary || isDanger) && styles.buttonTextOnColor,
          variant === 'quiet' && styles.buttonTextQuiet,
        ]}>
          {title}
        </Text>
      )}
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 20,
    borderWidth: 1,
    borderColor: KlippColors.border,
    borderRadius: KlippLayout.radiusCard,
    backgroundColor: KlippColors.white,
    shadowColor: KlippColors.navy,
    shadowOpacity: 0.035,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 20,
    elevation: 2,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  sectionCopy: { flex: 1, gap: 5 },
  eyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  sectionTitle: { color: KlippColors.navy, fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.35 },
  sectionSubtitle: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.25 },
  button: {
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: KlippColors.blue },
  buttonSecondary: { backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border },
  buttonQuiet: { backgroundColor: KlippColors.surfaceMuted },
  buttonDanger: { backgroundColor: KlippColors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  buttonTextOnColor: { color: '#FFFFFF' },
  buttonTextQuiet: { color: KlippColors.blueDark },
});
