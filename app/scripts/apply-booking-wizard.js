const fs = require('fs');
const file = 'src/components/new-booking-screen.tsx';
let src = fs.readFileSync(file, 'utf8');

function swap(from, to) {
  const parts = src.split(from);
  if (parts.length !== 2) throw new Error('Ancla no encontrada exactamente una vez: ' + from.slice(0, 70) + ' (' + (parts.length - 1) + ')');
  src = parts.join(to);
}
function cut(startMarker, endMarker, replacement, includeEnd) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('Inicio no encontrado: ' + startMarker.slice(0, 70));
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('Fin no encontrado: ' + endMarker.slice(0, 70));
  src = src.slice(0, a) + replacement + src.slice(b + (includeEnd ? endMarker.length : 0));
}

// 1. imports
swap("import { useCallback, useEffect, useMemo, useState } from 'react';",
  "import * as Haptics from 'expo-haptics';\nimport { useCallback, useEffect, useMemo, useRef, useState } from 'react';");
swap("import { SymbolView } from 'expo-symbols';\n",
  "import { SymbolView } from 'expo-symbols';\nimport Animated, { FadeInRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';\n");
swap("import { BrandScreenHeader } from '@/components/brand-screen-header';\n", "import { Button } from '@/components/ui/button';\n");

swap("import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';",
  "import { ActivityIndicator, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from 'react-native';");

// 2. estado
swap("  const [success, setSuccess] = useState<string | null>(null);\n",
  "  const [success, setSuccess] = useState<string | null>(null);\n  const insets = useSafeAreaInsets();\n  const scrollRef = useRef<ScrollViewInstance>(null);\n  const [step, setStep] = useState(0);\n");

// 3. lógica de navegación
swap("  if (loading) return <View style={styles.centered}>",
`  const canContinue =
    step === 0 ? !!selectedServiceId && !!(selectedTier || selectedOffer)
    : step === 1 ? !!coordinate && !locationLoading
    : step === 2 ? !!scheduledDate && !!scheduledTime
    : step === 3 ? !!selectedOffer || mode === 'auto' || !!selectedProId
    : true;

  function goNext() {
    if (!canContinue) return;
    void Haptics.selectionAsync();
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function goBack() {
    if (step === 0 || success) {
      router.back();
      return;
    }
    setError(null);
    setStep((current) => current - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  if (loading) return <View style={styles.centered}>`);

// 4. contenedor + cabecera del asistente
swap('    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">',
  '    <View style={styles.root}>\n    <ScrollView ref={scrollRef} contentContainerStyle={[styles.page, { paddingTop: insets.top + 8 }]} keyboardShouldPersistTaps="handled">');
cut('<Pressable accessibilityRole="button" onPress={() => router.back()}',
  '<BrandScreenHeader eyebrow="RESERVAS" title="Nueva reserva" subtitle="Elige servicio, horario y profesional." />',
`<View style={styles.wizardHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={12} onPress={goBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>{step > 0 && !success ? '‹  Atrás' : '✕  Cerrar'}</Text>
        </Pressable>
        <Text style={styles.stepCounter}>Paso {step + 1} de {STEPS.length}</Text>
      </View>
      <ProgressBar step={step} total={STEPS.length} />
      <Text style={styles.wizardTitle}>{STEPS[step]}</Text>`, true);

// 5. un bloque por paso
swap('<Section title="1. Servicio">', '<Animated.View key={step} entering={FadeInRight.duration(220)} style={styles.stepBody}>\n      {step === 0 && <>\n      <Section title="Servicio">');
swap('<Section title="2. Tamaño / modalidad">', '<Section title="Tamaño / modalidad">');
swap('<Section title="2. Servicio y profesional">', '<Section title="Servicio y profesional">');
swap('<Section title="3. Ubicación del servicio">', '</>}\n      {step === 1 && <>\n      <Section title="Ubicación del servicio">');
swap('<Section title="4. Fecha y hora">', '</>}\n      {step === 2 && <>\n      <Section title="Fecha y hora">');
swap('<Section title="5. Profesional">', '</>}\n      {step === 3 && <>\n      <Section title="Profesional">');
swap('{(selectedTier || selectedOffer) && coordinate && scheduledDate && scheduledTime && (',
  '</>}\n      {step === 4 && <>\n      {(selectedTier || selectedOffer) && coordinate && scheduledDate && scheduledTime && (');
swap('      {error && <Text accessibilityRole="alert" style={[styles.error, styles.horizontalMargin]}>{error}</Text>}',
  '      </>}\n      </Animated.View>\n      {error && <Text accessibilityRole="alert" style={[styles.error, styles.horizontalMargin]}>{error}</Text>}');

// 6. quitar el botón antiguo y añadir el pie fijo
cut('<Pressable accessibilityRole="button" disabled={saving || !coordinate || locationLoading}', '    </ScrollView>', '', false);
swap('    </ScrollView>\n  );\n}\n\nfunction Section(',
`    </ScrollView>
    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
      {step >= 2 && !!selectedPrice && (
        <View style={styles.footerPrice}>
          <Text style={styles.footerPriceLabel}>Total</Text>
          <Text style={styles.footerPriceValue}>{formatDop(selectedPrice)}</Text>
        </View>
      )}
      {!canContinue && !success && <Text style={styles.footerHint}>{HINTS[step]}</Text>}
      {success ? (
        <Button label="Ver mis reservas" onPress={() => router.replace('/(client)/bookings')} />
      ) : step < STEPS.length - 1 ? (
        <Button label="Continuar" disabled={!canContinue} onPress={goNext} />
      ) : (
        <Button label="Solicitar servicio" loading={saving} disabled={!coordinate || locationLoading} onPress={() => void createBooking()} />
      )}
    </View>
    </View>
  );
}

const STEPS = ['¿Qué servicio necesitas?', '¿Dónde lo hacemos?', '¿Cuándo te viene bien?', 'Elige tu profesional', 'Revisa y confirma'];
const HINTS = ['Elige un servicio para continuar.', 'Confirma tu ubicación para continuar.', 'Elige un horario disponible.', 'Elige un profesional o la asignación automática.', ''];

function ProgressBar({ step, total }: { step: number; total: number }) {
  const progress = useSharedValue((step + 1) / total);
  useEffect(() => {
    progress.value = withTiming((step + 1) / total, { duration: 280 });
  }, [step, total, progress]);
  const fill = useAnimatedStyle(() => ({ flexGrow: progress.value }));
  const rest = useAnimatedStyle(() => ({ flexGrow: 1 - progress.value }));
  return (
    <View accessibilityRole="progressbar" style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fill]} />
      <Animated.View style={[styles.progressRest, rest]} />
    </View>
  );
}

function Section(`);

// 7. estilos
swap('  page: { paddingBottom: 40, gap: 24, backgroundColor: KlippColors.canvas },',
`  root: { flex: 1, backgroundColor: KlippColors.canvas },
  page: { paddingBottom: 24, gap: 20, backgroundColor: KlippColors.canvas },
  stepBody: { gap: 24 },
  wizardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepCounter: { marginRight: 20, color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  wizardTitle: { marginHorizontal: 20, color: KlippColors.navy, fontSize: 26, lineHeight: 32, fontWeight: '800' },
  progressTrack: { flexDirection: 'row', height: 6, marginHorizontal: 20, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  progressFill: { flexBasis: 0, backgroundColor: KlippColors.blue, borderRadius: 3 },
  progressRest: { flexBasis: 0 },
  footer: { paddingTop: 12, paddingHorizontal: 20, gap: 10, backgroundColor: KlippColors.white, borderTopWidth: 1, borderTopColor: KlippColors.border },
  footerPrice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerPriceLabel: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  footerPriceValue: { color: KlippColors.navy, fontSize: 18, fontWeight: '800' },
  footerHint: { color: KlippColors.muted, fontSize: 13, textAlign: 'center' },`);

fs.writeFileSync(file, src);
console.log('Listo: asistente aplicado a ' + file);
