import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import {
  KlippRadius,
  KlippSpace,
  KlippTouch,
  KlippType,
  useKlippTheme,
  type KlippTheme,
} from '@/lib/design-tokens';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  accessibilityHint?: string;
};

export function KlippButton({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  accessibilityHint,
}: ButtonProps) {
  const theme = useKlippTheme();
  const blocked = disabled || loading;
  const backgroundColor =
    variant === 'primary' ? theme.primary :
    variant === 'secondary' ? theme.secondary :
    variant === 'danger' ? theme.danger :
    variant === 'outline' ? 'transparent' : 'transparent';
  const foreground =
    variant === 'primary' ? theme.onPrimary :
    variant === 'secondary' ? '#083B3A' :
    variant === 'danger' ? '#FFFFFF' : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: variant === 'outline' ? theme.border : backgroundColor },
        size === 'small' && styles.buttonSmall,
        size === 'medium' && styles.buttonMedium,
        size === 'large' && styles.buttonLarge,
        fullWidth && styles.fullWidth,
        variant === 'outline' && { borderWidth: 1, backgroundColor: theme.surface },
        variant === 'ghost' && { borderWidth: 0 },
        blocked && styles.disabled,
        pressed && !blocked && styles.pressed,
      ]}>
      {loading ? <ActivityIndicator color={foreground} /> : (
        <View style={styles.buttonContent}>
          {icon}
          <Text style={[styles.buttonText, { color: foreground }, size === 'small' && styles.buttonTextSmall]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function KlippCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useKlippTheme();
  return (
    <View style={[
      styles.card,
      { backgroundColor: theme.surface, borderColor: theme.border },
      style,
    ]}>
      {children}
    </View>
  );
}

type BadgeTone = 'verified' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function KlippBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useKlippTheme();
  const colors = badgeColors(theme)[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

export function KlippChip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useKlippTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.primarySoft : theme.surface, borderColor: selected ? theme.primary : theme.border },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, { color: selected ? theme.primary : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function KlippField({
  label,
  error,
  hint,
  ...inputProps
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const theme = useKlippTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border },
          inputProps.style,
        ]}
      />
      {error ? <Text accessibilityRole="alert" style={[styles.helperText, { color: theme.danger }]}>{error}</Text> :
        hint ? <Text style={[styles.helperText, { color: theme.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

type ScreenStateKind = 'loading' | 'empty' | 'error' | 'offline';

export function KlippScreenState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
}: {
  kind: ScreenStateKind;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useKlippTheme();
  return (
    <View style={styles.state}>
      {kind === 'loading' ? <ActivityIndicator size="large" color={theme.primary} /> : (
        <View style={[styles.stateMark, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.stateMarkText, { color: theme.primary }]}>
            {kind === 'offline' ? '⌁' : kind === 'error' ? '!' : '·'}
          </Text>
        </View>
      )}
      <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>{description}</Text>
      {actionLabel && onAction ? <KlippButton label={actionLabel} onPress={onAction} size="medium" /> : null}
    </View>
  );
}

export function KlippBottomAction({
  label,
  onPress,
  disabled = false,
  loading = false,
  caption,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  caption?: string;
}) {
  const theme = useKlippTheme();
  return (
    <View style={[styles.bottomAction, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      {caption ? <Text style={[styles.bottomCaption, { color: theme.textSecondary }]}>{caption}</Text> : null}
      <KlippButton label={label} onPress={onPress} disabled={disabled} loading={loading} />
    </View>
  );
}

function badgeColors(theme: KlippTheme): Record<BadgeTone, { background: string; foreground: string }> {
  return {
    verified: { background: theme.secondarySoft, foreground: theme.secondary },
    success: { background: theme.successSoft, foreground: theme.success },
    warning: { background: theme.warningSoft, foreground: theme.warning },
    danger: { background: theme.dangerSoft, foreground: theme.danger },
    neutral: { background: theme.surfaceSecondary, foreground: theme.textSecondary },
    info: { background: theme.primarySoft, foreground: theme.primary },
  };
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  button: {
    minHeight: KlippTouch.button,
    borderRadius: KlippRadius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: KlippSpace[4],
  },
  buttonSmall: { minHeight: KlippTouch.minimum, paddingHorizontal: KlippSpace[3] },
  buttonMedium: { minHeight: 52 },
  buttonLarge: { minHeight: KlippTouch.bottomAction },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KlippSpace[2] },
  buttonText: { fontSize: KlippType.bodyLarge, fontWeight: '700' },
  buttonTextSmall: { fontSize: KlippType.body },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  card: {
    borderWidth: 1,
    borderRadius: KlippRadius.card,
    padding: KlippSpace[4],
    gap: KlippSpace[3],
  },
  badge: { alignSelf: 'flex-start', borderRadius: KlippRadius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: KlippType.caption, fontWeight: '700' },
  chip: {
    minHeight: KlippTouch.minimum,
    borderWidth: 1,
    borderRadius: KlippRadius.pill,
    paddingHorizontal: KlippSpace[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: KlippType.body, fontWeight: '600' },
  fieldWrap: { gap: KlippSpace[2] },
  fieldLabel: { fontSize: KlippType.body, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: KlippRadius.control,
    paddingHorizontal: KlippSpace[4],
    paddingVertical: KlippSpace[3],
    fontSize: KlippType.bodyLarge,
  },
  helperText: { fontSize: KlippType.caption, lineHeight: 18 },
  state: { alignItems: 'center', justifyContent: 'center', gap: KlippSpace[3], padding: KlippSpace[6], minHeight: 220 },
  stateMark: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  stateMarkText: { fontSize: 28, fontWeight: '800' },
  stateTitle: { fontSize: KlippType.title, fontWeight: '800', textAlign: 'center' },
  stateDescription: { fontSize: KlippType.body, lineHeight: 21, textAlign: 'center' },
  bottomAction: {
    paddingHorizontal: KlippSpace[4],
    paddingTop: KlippSpace[3],
    paddingBottom: KlippSpace[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: KlippSpace[2],
  },
  bottomCaption: { fontSize: KlippType.caption, textAlign: 'center' },
});
