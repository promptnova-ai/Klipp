import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';

import { MotionPressable, PrimaryButton, useReducedMotion } from '@/components/ui-primitives';
import { KlippColors, KlippLayout, KlippSpacing, KlippTypography } from '@/theme/tokens';
import { RoleThemes, type KlippRole } from '@/theme/themes';

/** Pulsing placeholder; static when the OS asks for reduced motion. */
export function Skeleton({ width = '100%', height = 16, radius = 10, style }: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0.7), []);
  useEffect(() => {
    if (reduced) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: KlippColors.border, opacity }, style]}
    />
  );
}

/** Skeleton shaped like a service/professional card. */
export function CardSkeleton() {
  return (
    <View style={kit.skeletonCard}>
      <Skeleton height={120} radius={16} />
      <Skeleton width="60%" height={18} />
      <Skeleton width="85%" height={12} />
    </View>
  );
}

type EmptyStateProps = {
  title: string;
  message?: string;
  art?: number;
  actionLabel?: string;
  onAction?: () => void;
  role?: KlippRole;
};

/** Empty or error state: illustration, short copy and, only when useful, one real action. */
export function EmptyState({ title, message, art, actionLabel, onAction, role = 'client' }: EmptyStateProps) {
  return (
    <View style={kit.empty} accessibilityRole="summary">
      {art ? <Image source={art} contentFit="cover" style={kit.emptyArt} /> : null}
      <Text style={kit.emptyTitle}>{title}</Text>
      {message ? <Text style={kit.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} variant="secondary" role={role} /> : null}
    </View>
  );
}

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  role?: KlippRole;
  leading?: ReactNode;
  disabled?: boolean;
};

/** Selectable chip; the 44pt minimum height keeps it comfortable to tap. */
export function Chip({ label, selected = false, onPress, role = 'client', leading, disabled }: ChipProps) {
  const theme = RoleThemes[role];
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress ?? (() => undefined)}
      style={[
        kit.chip,
        selected && { backgroundColor: theme.accent, borderColor: theme.accent },
        disabled && { opacity: 0.5 },
      ]}>
      {leading}
      <Text style={[kit.chipText, selected && { color: KlippColors.white }]}>{label}</Text>
    </MotionPressable>
  );
}

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  appRole?: KlippRole;
};

/** Labeled input with visible focus and error states. */
export function TextField({ label, error, hint, appRole = 'client', style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const theme = RoleThemes[appRole];
  return (
    <View style={kit.field}>
      <Text style={kit.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={KlippColors.muted}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          kit.input,
          focused && { borderColor: theme.accent, borderWidth: 2 },
          !!error && { borderColor: KlippColors.danger, borderWidth: 2 },
          style,
        ]}
        {...rest}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={kit.fieldError}>{error}</Text> : hint ? <Text style={kit.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const kit = StyleSheet.create({
  skeletonCard: { gap: KlippSpacing[2], padding: KlippSpacing[3], borderRadius: KlippLayout.radiusCard, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border },
  empty: { alignItems: 'center', gap: KlippSpacing[3], padding: KlippSpacing[6] },
  emptyArt: { width: 220, height: 165, borderRadius: KlippLayout.radiusCardLarge },
  emptyTitle: { color: KlippColors.ink, fontSize: KlippTypography.size.titleSmall, lineHeight: KlippTypography.lineHeight.titleSmall, fontWeight: '800', textAlign: 'center' },
  emptyMessage: { color: KlippColors.muted, fontSize: KlippTypography.size.bodySmall, lineHeight: KlippTypography.lineHeight.bodyLarge, textAlign: 'center', maxWidth: 320 },
  chip: { minHeight: KlippLayout.minTapTarget, flexDirection: 'row', alignItems: 'center', gap: KlippSpacing[2], paddingHorizontal: KlippSpacing[4], borderRadius: KlippLayout.radiusPill, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  chipText: { color: KlippColors.ink, fontSize: KlippTypography.size.bodySmall, fontWeight: '700' },
  field: { gap: KlippSpacing[2] },
  fieldLabel: { color: KlippColors.ink, fontSize: KlippTypography.size.bodySmall, fontWeight: '700' },
  input: { minHeight: KlippLayout.controlHeight, paddingHorizontal: KlippSpacing[4], borderRadius: KlippLayout.radiusControl, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, color: KlippColors.ink, fontSize: KlippTypography.size.body },
  fieldError: { color: KlippColors.danger, fontSize: KlippTypography.size.caption, lineHeight: KlippTypography.lineHeight.caption },
  fieldHint: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
});
