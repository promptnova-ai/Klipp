import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KlippColors } from '@/lib/brand';

const DOMINICAN_PREFIXES = ['809', '829', '849'] as const;

export function DominicanPhoneField({
  label = 'Teléfono móvil',
  value,
  onChangeText,
  error,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const digits = value.replace(/\D/g, '');
  const prefix = DOMINICAN_PREFIXES.includes(digits.slice(0, 3) as typeof DOMINICAN_PREFIXES[number])
    ? digits.slice(0, 3)
    : '809';
  const local = digits.startsWith(prefix) ? digits.slice(3, 10) : digits.slice(-7);
  const valid = digits.length === 10 && DOMINICAN_PREFIXES.includes(digits.slice(0, 3) as typeof DOMINICAN_PREFIXES[number]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.phoneShell, error && styles.phoneShellError, disabled && styles.disabled]}>
        <View style={styles.country}>
          <Text style={styles.countryCode}>🇩🇴  +1</Text>
        </View>
        <View style={styles.prefixGroup}>
          {DOMINICAN_PREFIXES.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ selected: prefix === item }}
              disabled={disabled}
              onPress={() => onChangeText(item + local)}
              style={[styles.prefixOption, prefix === item && styles.prefixSelected]}>
              <Text style={[styles.prefixText, prefix === item && styles.prefixTextSelected]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="Siete dígitos restantes del teléfono"
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={7}
          onChangeText={(text) => onChangeText(prefix + text.replace(/\D/g, '').slice(0, 7))}
          placeholder="555 0123"
          placeholderTextColor="#98A5B5"
          style={styles.phoneInput}
          value={local}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : (
        <Text style={styles.helper}>{valid ? 'Número dominicano completo' : 'Selecciona tu prefijo y escribe los 7 dígitos restantes.'}</Text>
      )}
    </View>
  );
}

export function OnboardingProgress({
  steps,
  current,
  accent = KlippColors.blue,
}: {
  steps: string[];
  current: number;
  accent?: string;
}) {
  const progress = useMemo(() => Math.round(((current + 1) / steps.length) * 100), [current, steps.length]);
  return (
    <View style={styles.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: current + 1 }}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressCurrent}>{steps[current]}</Text>
        <Text style={styles.progressCount}>{String(current + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: accent }]} />
      </View>
      <View style={styles.stepLabels}>
        {steps.map((step, index) => (
          <View key={step} style={styles.stepLabel}>
            <View style={[styles.stepDot, index <= current && { backgroundColor: accent }, index === current && styles.stepDotCurrent]} />
            <Text numberOfLines={1} style={[styles.stepText, index === current && styles.stepTextCurrent]}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function OnboardingChoiceCard({
  title,
  description,
  selected,
  onPress,
  icon,
  accent = KlippColors.blue,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  icon: string;
  accent?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && { borderColor: accent, backgroundColor: '#F4F9FC' }, pressed && styles.pressed]}>
      <View style={[styles.choiceIcon, { backgroundColor: selected ? '#E6F3F8' : '#F0F3F7' }]}>
        <Text style={styles.choiceIconText}>{icon}</Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
      <View style={[styles.radio, selected && { borderColor: accent }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: '#344054', fontSize: 12, fontWeight: '800' },
  phoneShell: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#DCE5EC', borderRadius: 16, backgroundColor: '#FFFFFF', gap: 8 },
  phoneShellError: { borderColor: '#B42318' },
  country: { paddingRight: 8, borderRightWidth: 1, borderRightColor: '#E4EAF0' },
  countryCode: { color: KlippColors.navy, fontSize: 13, fontWeight: '800' },
  prefixGroup: { flexDirection: 'row', gap: 3 },
  prefixOption: { paddingHorizontal: 6, paddingVertical: 7, borderRadius: 8 },
  prefixSelected: { backgroundColor: '#E8F0F7' },
  prefixText: { color: '#718096', fontSize: 10, fontWeight: '700' },
  prefixTextSelected: { color: KlippColors.navy, fontWeight: '900' },
  phoneInput: { flex: 1, minWidth: 60, color: KlippColors.navy, fontSize: 16, fontWeight: '600', paddingVertical: 10 },
  helper: { color: '#718096', fontSize: 11, lineHeight: 16 },
  error: { color: '#B42318', fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.55 },
  progressWrap: { gap: 10 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCurrent: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  progressCount: { color: '#718096', fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 5, overflow: 'hidden', borderRadius: 99, backgroundColor: '#E5EBF1' },
  progressFill: { height: 5, borderRadius: 99 },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  stepLabel: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: '#D4DCE5' },
  stepDotCurrent: { width: 8, height: 8 },
  stepText: { color: '#98A5B5', fontSize: 9, fontWeight: '600' },
  stepTextCurrent: { color: KlippColors.navy, fontWeight: '900' },
  choice: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderWidth: 1, borderColor: '#E0E7EF', borderRadius: 18, backgroundColor: '#FFFFFF' },
  choiceIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  choiceIconText: { fontSize: 20 },
  choiceCopy: { flex: 1, gap: 4 },
  choiceTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  choiceDescription: { color: '#718096', fontSize: 12, lineHeight: 17 },
  radio: { width: 20, height: 20, borderWidth: 1.5, borderColor: '#C8D2DE', borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 99 },
  pressed: { opacity: 0.86 },
});
