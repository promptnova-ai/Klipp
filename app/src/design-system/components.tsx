import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { getKlippPalette, KlippTokens, type KlippColorMode } from './tokens';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'large' | 'medium';
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  mode?: KlippColorMode;
  accessibilityHint?: string;
};

export function KlippButton({ label, onPress, variant = 'primary', size = 'large', disabled = false, loading = false, fullWidth = true, mode = 'light', accessibilityHint }: ButtonProps) {
  const p = getKlippPalette(mode);
  const backgroundColor = variant === 'primary' ? p.primary : variant === 'secondary' ? p.secondary : variant === 'danger' ? p.danger : 'transparent';
  const foregroundColor = variant === 'primary' || variant === 'secondary' || variant === 'danger' ? (mode === 'dark' && variant !== 'danger' ? '#0C1724' : '#FFFFFF') : variant === 'outline' ? p.primary : p.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, size === 'medium' && styles.buttonMedium, fullWidth && styles.fullWidth, { backgroundColor, borderColor: variant === 'outline' ? p.border : backgroundColor, borderWidth: variant === 'outline' ? 1 : 0, opacity: disabled ? 0.48 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? KlippTokens.motion.pressScale : 1 }] }]}>
      {loading ? <ActivityIndicator color={foregroundColor} /> : <Text style={[styles.buttonText, { color: foregroundColor }]}>{label}</Text>}
    </Pressable>
  );
}

export function KlippCard({ children, mode = 'light', style }: { children: ReactNode; mode?: KlippColorMode; style?: ViewStyle }) {
  const p = getKlippPalette(mode);
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

type FieldProps = TextInputProps & { label: string; helper?: string; error?: string; mode?: KlippColorMode };
export function KlippField({ label, helper, error, mode = 'light', style, ...props }: FieldProps) {
  const p = getKlippPalette(mode);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: p.text }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={p.textTertiary} {...props} style={[styles.input, { color: p.text, backgroundColor: p.surface, borderColor: error ? p.danger : p.border }, style]} />
      {error ? <Text accessibilityRole="alert" style={[styles.helper, { color: p.danger }]}>{error}</Text> : helper ? <Text style={[styles.helper, { color: p.textSecondary }]}>{helper}</Text> : null}
    </View>
  );
}

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export function KlippStatus({ label, tone = 'neutral', mode = 'light' }: { label: string; tone?: StatusTone; mode?: KlippColorMode }) {
  const p = getKlippPalette(mode);
  const pair = tone === 'success' ? [p.successSoft, p.success] : tone === 'warning' ? [p.warningSoft, p.warning] : tone === 'danger' ? [p.dangerSoft, p.danger] : tone === 'info' ? [p.infoSoft, p.info] : [p.primarySoft, p.textSecondary];
  return <View style={[styles.status, { backgroundColor: pair[0] }]}><Text style={[styles.statusText, { color: pair[1] }]}>{label}</Text></View>;
}

type ScreenStateKind = 'loading' | 'empty' | 'error' | 'offline';
export function KlippScreenState({ kind, title, description, actionLabel, onAction, mode = 'light' }: { kind: ScreenStateKind; title: string; description: string; actionLabel?: string; onAction?: () => void; mode?: KlippColorMode }) {
  const p = getKlippPalette(mode);
  return (
    <View accessibilityLiveRegion="polite" style={styles.state}>
      {kind === 'loading' ? <ActivityIndicator size="large" color={p.primary} /> : <View style={[styles.stateMark, { backgroundColor: kind === 'error' ? p.dangerSoft : kind === 'offline' ? p.warningSoft : p.primarySoft }]}><Text style={[styles.stateMarkText, { color: kind === 'error' ? p.danger : kind === 'offline' ? p.warning : p.primary }]}>{kind === 'offline' ? '!' : kind === 'error' ? '×' : '•'}</Text></View>}
      <Text style={[styles.stateTitle, { color: p.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: p.textSecondary }]}>{description}</Text>
      {actionLabel && onAction ? <KlippButton label={actionLabel} onPress={onAction} variant="outline" size="medium" mode={mode} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: KlippTokens.size.button, borderRadius: KlippTokens.radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonMedium: { minHeight: KlippTokens.size.buttonCompact, paddingHorizontal: 16 },
  fullWidth: { width: '100%' },
  buttonText: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: 0.1 },
  card: { borderWidth: 1, borderRadius: KlippTokens.radius.md, padding: 16, gap: 12, ...KlippTokens.elevation.card },
  fieldWrap: { gap: 7 },
  fieldLabel: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  input: { minHeight: KlippTokens.size.input, borderWidth: 1, borderRadius: KlippTokens.radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  helper: { fontSize: 12, lineHeight: 16 },
  status: { alignSelf: 'flex-start', minHeight: 28, borderRadius: KlippTokens.radius.pill, paddingHorizontal: 10, paddingVertical: 5, justifyContent: 'center' },
  statusText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateMark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stateMarkText: { fontSize: 26, fontWeight: '700' },
  stateTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  stateDescription: { maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
