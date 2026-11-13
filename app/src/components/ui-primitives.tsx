import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  type AccessibilityState,
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

import { KlippColors, KlippLayout, KlippMotion, KlippShadows, KlippSpacing, KlippTypography } from '@/theme/tokens';
import { RoleThemes, type KlippRole } from '@/theme/themes';

/** One shared OS preference subscription avoids a listener per button or screen. */
let reducedMotionSnapshot = false;
let motionPreferenceInitialized = false;
let motionPreferenceSubscription: { remove: () => void } | null = null;
const motionPreferenceListeners = new Set<() => void>();

function subscribeToMotionPreference(listener: () => void) {
  motionPreferenceListeners.add(listener);
  if (!motionPreferenceInitialized) {
    motionPreferenceInitialized = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reducedMotionSnapshot = enabled;
        motionPreferenceListeners.forEach((notify) => notify());
      })
      .catch(() => undefined);
    motionPreferenceSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotionSnapshot = enabled;
      motionPreferenceListeners.forEach((notify) => notify());
    });
  }
  return () => {
    motionPreferenceListeners.delete(listener);
    if (motionPreferenceListeners.size === 0) {
      motionPreferenceSubscription?.remove();
      motionPreferenceSubscription = null;
      motionPreferenceInitialized = false;
    }
  };
}

function getReducedMotionSnapshot() {
  return reducedMotionSnapshot;
}

/** Respect the operating system's reduced-motion accessibility preference. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeToMotionPreference, getReducedMotionSnapshot, getReducedMotionSnapshot);
}

type ScreenEntranceProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
};

/** Small, consistent entrance motion for routed screens and important panels. */
export function ScreenEntrance({ children, style, delay = 0 }: ScreenEntranceProps) {
  const progress = useMemo(() => new Animated.Value(0), []);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return undefined;
    }
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
  accessibilityState?: AccessibilityState;
};

/** Tactile press feedback that behaves the same in the web and native clients. */
export function MotionPressable({
  children,
  onPress,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: MotionPressableProps) {
  const scale = useMemo(() => new Animated.Value(1), []);
  const reducedMotion = useReducedMotion();

  function animateScale(value: number) {
    if (reducedMotion) return;
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
      accessibilityState={accessibilityState}
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
  success: { backgroundColor: KlippColors.surfaceSuccess, color: KlippColors.success },
  warning: { backgroundColor: KlippColors.surfaceWarning, color: KlippColors.warning },
  danger: { backgroundColor: KlippColors.surfaceDanger, color: KlippColors.danger },
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
  role?: KlippRole;
};

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  role = 'client',
}: PrimaryButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const roleTheme = RoleThemes[role];
  return (
    <MotionPressable
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        isPrimary && { backgroundColor: roleTheme.accent },
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        isDanger && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary || isDanger ? KlippColors.white : KlippColors.ink} />
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
    padding: KlippSpacing[5],
    borderWidth: 1,
    borderColor: KlippColors.border,
    borderRadius: KlippLayout.radiusCard,
    backgroundColor: KlippColors.white,
    ...KlippShadows.card,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: KlippSpacing[4],
  },
  sectionCopy: { flex: 1, gap: KlippSpacing[1] },
  eyebrow: { color: KlippColors.cobaltDark, fontSize: KlippTypography.size.caption, fontWeight: '800', letterSpacing: KlippTypography.tracking.eyebrow },
  sectionTitle: { color: KlippColors.ink, fontSize: KlippTypography.size.title, lineHeight: KlippTypography.lineHeight.title, fontWeight: '800', letterSpacing: KlippTypography.tracking.tight },
  sectionSubtitle: { color: KlippColors.muted, fontSize: KlippTypography.size.bodySmall, lineHeight: KlippTypography.lineHeight.bodySmall },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: KlippSpacing[3], paddingVertical: KlippSpacing[2], borderRadius: KlippLayout.radiusPill },
  statusPillText: { fontSize: KlippTypography.size.micro, fontWeight: '800', letterSpacing: KlippTypography.tracking.normal },
  button: {
    minHeight: KlippLayout.controlHeight,
    paddingHorizontal: KlippSpacing[5],
    borderRadius: KlippLayout.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: { backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border },
  buttonQuiet: { backgroundColor: KlippColors.surfaceMuted },
  buttonDanger: { backgroundColor: KlippColors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: KlippColors.navy, fontSize: KlippTypography.size.bodySmall, fontWeight: '800' },
  buttonTextOnColor: { color: KlippColors.white },
  buttonTextQuiet: { color: KlippColors.blueDark },
});
