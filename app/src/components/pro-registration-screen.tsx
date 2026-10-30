import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { CoverageRadiusPicker, type CoverageCoordinate } from '@/components/coverage-radius-picker';
import { KlippColors } from '@/lib/brand';
import type { ServiceType } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type ProServiceDraft = { price: string; minutes: string };
type AvailabilityDraft = { weekday: number; start_time: string; end_time: string };
type ProOnboardingDraft = {
  phone: string;
  bio: string;
  years_experience: number | null;
  transport_type: string | null;
  services: { service_type_id: number; base_price_dop: number; est_minutes: number }[];
  coverage: { latitude: number; longitude: number; radius_km: number } | null;
  availability: AvailabilityDraft[];
};

const steps = [
  { eyebrow: 'TU PERFIL', title: 'Cuéntanos sobre ti', subtitle: 'Un buen perfil genera confianza y te ayuda a destacar.' },
  { eyebrow: 'TUS SERVICIOS', title: '¿Qué sabes hacer?', subtitle: 'Elige tus especialidades y define tu tarifa inicial.' },
  { eyebrow: 'TU COBERTURA', title: 'Define dónde trabajas', subtitle: 'Te conectaremos con clientes dentro de tu radio.' },
  { eyebrow: 'TU CUENTA', title: 'Ya casi está', subtitle: 'Crea tus credenciales. Te enviaremos un correo para confirmar.' },
];
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const radiusOptions = [5, 10, 15, 20, 30, 50];
const transportOptions = ['Motor', 'Automóvil', 'Transporte público', 'Bicicleta', 'A pie', 'Otro'];
const districtNationalTestLocation: CoverageCoordinate = { latitude: 18.479, longitude: -69.941 };

export function ProRegistrationScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [transportType, setTransportType] = useState('');
  const [otherTransportType, setOtherTransportType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [catalog, setCatalog] = useState<ServiceType[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [serviceDrafts, setServiceDrafts] = useState<Record<number, ProServiceDraft>>({});
  const [center, setCenter] = useState<CoverageCoordinate | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const transition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const progressWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, steps.length - 1], outputRange: ['8%', '100%'] }),
    [progress],
  );

  const fetchCatalog = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('service_types')
      .select('id, code, name, description, active, category_id')
      .eq('active', true)
      .order('name');
    if (queryError) throw queryError;
    return (data ?? []) as ServiceType[];
  }, []);

  function retryCatalog() {
    setServicesLoading(true);
    setCatalogError(null);
    void fetchCatalog()
      .then(setCatalog)
      .catch((cause: unknown) => setCatalogError(
        cause instanceof Error ? cause.message : 'No pudimos cargar las especialidades.',
      ))
      .finally(() => setServicesLoading(false));
  }

  useEffect(() => {
    let active = true;
    void fetchCatalog()
      .then((services) => {
        if (active) setCatalog(services);
      })
      .catch((cause: unknown) => {
        if (active) setCatalogError(
          cause instanceof Error ? cause.message : 'No pudimos cargar las especialidades.',
        );
      })
      .finally(() => {
        if (active) setServicesLoading(false);
      });
    return () => { active = false; };
  }, [fetchCatalog]);

  function animateToStep(nextStep: number) {
    setError(null);
    setNotice(null);
    Animated.timing(transition, { toValue: 0, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      setStep(nextStep);
      transition.setValue(0);
      Animated.parallel([
        Animated.timing(transition, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(progress, { toValue: nextStep, duration: 350, useNativeDriver: false }),
      ]).start();
    });
  }

  function validateStep() {
    if (step === 0) {
      if (fullName.trim().length < 2) return 'Escribe tu nombre completo para continuar.';
      if (phone.replace(/\D/g, '').length < 10) return 'Escribe un número de teléfono válido de 10 dígitos.';
      if (years.trim() && (!Number.isInteger(Number(years)) || Number(years) < 0)) return 'Los años de experiencia deben ser un número entero válido.';
      if (transportType === 'Otro' && !otherTransportType.trim()) return 'Especifica cómo te trasladas para llegar a tus clientes.';
    }
    if (step === 1) {
      if (servicesLoading) return 'Espera un momento mientras cargamos las especialidades.';
      if (catalog.length === 0) return 'No hay especialidades disponibles ahora mismo.';
      if (selectedServices.length === 0) return 'Elige al menos un servicio para continuar.';
      const invalid = selectedServices.some((id) => {
        const draft = serviceDrafts[id];
        return !draft || !Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0
          || !Number.isInteger(Number(draft.minutes)) || Number(draft.minutes) <= 0;
      });
      if (invalid) return 'Completa un precio y una duración válidos para cada servicio elegido.';
    }
    if (step === 2) {
      if (!center) return 'Define el centro de tu área de trabajo con tu ubicación o ajustando el mapa.';
      if (selectedWeekdays.length === 0) return 'Selecciona al menos un día de trabajo.';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) {
        return 'Indica un horario válido en formato de 24 horas y asegúrate de que la hora final sea posterior.';
      }
    }
    if (step === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Escribe un correo electrónico válido.';
      if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
    }
    return null;
  }

  function continueRegistration() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    animateToStep(step + 1);
  }

  function toggleService(serviceId: number) {
    setSelectedServices((current) => current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId]);
    setServiceDrafts((current) => ({
      ...current,
      [serviceId]: current[serviceId] ?? { price: '', minutes: '60' },
    }));
  }

  function toggleWeekday(weekday: number) {
    setSelectedWeekdays((current) => current.includes(weekday)
      ? current.filter((day) => day !== weekday)
      : [...current, weekday].sort((a, b) => a - b));
  }

  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Permite el acceso a la ubicación para definir tu área de trabajo.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación actual.');
    } finally {
      setLocating(false);
    }
  }

  function useDistrictNationalTestLocation() {
    setCenter(districtNationalTestLocation);
    setError(null);
  }

  async function createProfessionalAccount() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!center) {
      setError('Vuelve al paso de cobertura y define el centro de tu área.');
      return;
    }
    const onboarding: ProOnboardingDraft = {
      phone: phone.trim(),
      bio: bio.trim(),
      years_experience: years.trim() ? Number(years) : null,
      transport_type: transportType === 'Otro'
        ? otherTransportType.trim()
        : transportType || null,
      services: selectedServices.map((service_type_id) => ({
        service_type_id,
        base_price_dop: Number(serviceDrafts[service_type_id]?.price),
        est_minutes: Number(serviceDrafts[service_type_id]?.minutes),
      })),
      coverage: { ...center, radius_km: radiusKm },
      availability: selectedWeekdays.map((weekday) => ({
        weekday,
        start_time: startTime,
        end_time: endTime,
      })),
    };

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const hasSession = await signUp(
        email.trim(),
        password,
        fullName.trim(),
        'pro',
        { phone: phone.trim(), pro_onboarding: onboarding },
      );
      if (hasSession) {
        router.replace('/');
      } else {
        setNotice('¡Tu solicitud está lista! Confirma tu correo y luego inicia sesión. Tu perfil y configuración quedarán preparados para terminar.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos crear tu cuenta profesional.');
    } finally {
      setBusy(false);
    }
  }

  const currentStep = steps[step];
  const selectedCount = selectedServices.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => step === 0 ? router.back() : animateToStep(step - 1)} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
            <Text style={styles.brand}>klipp</Text>
          </View>
          <Text style={styles.stepCount}>{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Animated.View
            style={Platform.OS === 'web'
              ? styles.stepContent
              : [
                  styles.stepContent,
                  { opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
                ]}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>{currentStep.eyebrow}</Text>
              <Text style={styles.title}>{currentStep.title}</Text>
              <Text style={styles.subtitle}>{currentStep.subtitle}</Text>
            </View>

            {step === 0 && (
              <View style={styles.card}>
                <Field label="Nombre completo">
                  <TextInput autoComplete="name" autoCapitalize="words" onChangeText={setFullName} placeholder="¿Cómo te llamas?" placeholderTextColor={KlippColors.muted} style={styles.input} value={fullName} />
                </Field>
                <Field label="Teléfono de contacto">
                  <TextInput autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhone} placeholder="809 555 0123" placeholderTextColor={KlippColors.muted} style={styles.input} value={phone} />
                </Field>
                <View style={styles.twoColumns}>
                  <Field label="Años de experiencia">
                    <TextInput keyboardType="number-pad" onChangeText={setYears} placeholder="Ej. 4" placeholderTextColor={KlippColors.muted} style={styles.input} value={years} />
                  </Field>
                  <View style={styles.experienceBadge}>
                    <Text style={styles.badgeIcon}>✦</Text>
                    <Text style={styles.badgeText}>Tu talento merece crecer</Text>
                  </View>
                </View>
                <Field label="Una breve presentación">
                  <TextInput multiline onChangeText={setBio} placeholder="Cuéntales a tus futuros clientes qué te hace especial..." placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={bio} />
                </Field>
                <View style={styles.transportSection}>
                  <Text style={styles.label}>¿Cómo te trasladas al domicilio?</Text>
                  <Text style={styles.helper}>Ayuda a tus clientes a saber cómo llegarás a su servicio.</Text>
                  <View style={styles.chips}>
                    {transportOptions.map((option) => (
                      <Chip
                        key={option}
                        label={option}
                        selected={transportType === option}
                        onPress={() => setTransportType(option)}
                      />
                    ))}
                  </View>
                  {transportType === 'Otro' && (
                    <TextInput
                      accessibilityLabel="Especifica tu medio de transporte"
                      maxLength={50}
                      onChangeText={setOtherTransportType}
                      placeholder="Especifica tu medio de transporte"
                      placeholderTextColor={KlippColors.muted}
                      style={styles.input}
                      value={otherTransportType}
                    />
                  )}
                </View>
              </View>
            )}

            {step === 1 && (
              <View style={styles.serviceList}>
                {servicesLoading ? (
                  <View style={styles.loading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.helper}>Cargando especialidades...</Text></View>
                ) : catalogError ? (
                  <View style={styles.catalogErrorCard}>
                    <Text style={styles.catalogErrorTitle}>No pudimos cargar las especialidades</Text>
                    <Text style={styles.helper}>{catalogError}</Text>
                    <Text style={styles.helper}>Si el problema continúa, verifica que el catálogo público esté habilitado en Supabase.</Text>
                    <Pressable accessibilityRole="button" onPress={retryCatalog} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                      <Text style={styles.retryButtonText}>Reintentar</Text>
                    </Pressable>
                  </View>
                ) : catalog.length === 0 ? (
                  <View style={styles.catalogErrorCard}>
                    <Text style={styles.catalogErrorTitle}>Aún no hay especialidades disponibles</Text>
                    <Text style={styles.helper}>Intenta cargar el catálogo nuevamente.</Text>
                    <Pressable accessibilityRole="button" onPress={retryCatalog} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                      <Text style={styles.retryButtonText}>Actualizar catálogo</Text>
                    </Pressable>
                  </View>
                ) : catalog.map((service) => {
                  const selected = selectedServices.includes(service.id);
                  const draft = serviceDrafts[service.id] ?? { price: '', minutes: '60' };
                  return (
                    <View key={service.id} style={[styles.serviceCard, selected && styles.serviceCardSelected]}>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleService(service.id)} style={styles.serviceRow}>
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected && <Text style={styles.checkmark}>✓</Text>}</View>
                        <View style={styles.serviceCopy}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                          {!!service.description && <Text style={styles.serviceDescription}>{service.description}</Text>}
                        </View>
                      </Pressable>
                      {selected && (
                        <View style={styles.serviceFields}>
                          <Field label="Precio base · RD$">
                            <TextInput keyboardType="decimal-pad" onChangeText={(price) => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, price } }))} placeholder="1,500" placeholderTextColor={KlippColors.muted} style={styles.input} value={draft.price} />
                          </Field>
                          <Field label="Duración · min">
                            <TextInput keyboardType="number-pad" onChangeText={(minutes) => setServiceDrafts((current) => ({ ...current, [service.id]: { ...draft, minutes } }))} placeholder="60" placeholderTextColor={KlippColors.muted} style={styles.input} value={draft.minutes} />
                          </Field>
                        </View>
                      )}
                    </View>
                  );
                })}
                {!servicesLoading && selectedCount > 0 && <Text style={styles.selectionNote}>{selectedCount} {selectedCount === 1 ? 'especialidad elegida' : 'especialidades elegidas'}</Text>}
              </View>
            )}

            {step === 2 && (
              <View style={styles.card}>
                <View style={styles.locationIntro}>
                  <View style={styles.locationIcon}><Text style={styles.locationPin}>⌖</Text></View>
                  <View style={styles.locationCopy}>
                    <Text style={styles.cardTitle}>Tu punto de partida</Text>
                    <Text style={styles.helper}>Clientes dentro del círculo podrán encontrarte.</Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" disabled={locating} onPress={() => void useCurrentLocation()} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
                  {locating ? <ActivityIndicator color={KlippColors.blueDark} /> : <Text style={styles.locationButtonText}>{center ? 'Actualizar con mi ubicación' : 'Usar mi ubicación actual'}</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" onPress={useDistrictNationalTestLocation} style={({ pressed }) => [styles.testLocationButton, pressed && styles.pressed]}>
                  <Text style={styles.testLocationButtonText}>Usar ubicación de prueba · Piantini, Distrito Nacional</Text>
                </Pressable>
                {center ? (
                  <CoverageRadiusPicker center={center} onChange={setCenter} radiusMeters={radiusKm * 1000} />
                ) : (
                  <View style={styles.noLocation}><Text style={styles.noLocationTitle}>Tu cobertura empieza aquí</Text><Text style={styles.helper}>Comparte tu ubicación para colocar el pin en el mapa.</Text></View>
                )}
                <Text style={styles.label}>Radio de servicio</Text>
                <View style={styles.chips}>
                  {radiusOptions.map((radius) => (
                    <Chip key={radius} label={`${radius} km`} selected={radiusKm === radius} onPress={() => setRadiusKm(radius)} />
                  ))}
                </View>
                <View style={styles.divider} />
                <Text style={styles.cardTitle}>¿Qué días estás disponible?</Text>
                <View style={styles.chips}>
                  {weekdays.map((day, index) => (
                    <Chip key={day} label={day} selected={selectedWeekdays.includes(index + 1)} onPress={() => toggleWeekday(index + 1)} />
                  ))}
                </View>
                <View style={styles.timeRow}>
                  <Field label="Desde">
                    <TextInput keyboardType="numbers-and-punctuation" onChangeText={setStartTime} placeholder="08:00" placeholderTextColor={KlippColors.muted} style={styles.input} value={startTime} />
                  </Field>
                  <Field label="Hasta">
                    <TextInput keyboardType="numbers-and-punctuation" onChangeText={setEndTime} placeholder="17:00" placeholderTextColor={KlippColors.muted} style={styles.input} value={endTime} />
                  </Field>
                </View>
              </View>
            )}

            {step === 3 && (
              <>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryIcon}><Text style={styles.summaryIconText}>✓</Text></View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.cardTitle}>{selectedCount} {selectedCount === 1 ? 'servicio' : 'servicios'} · {radiusKm} km</Text>
                    <Text style={styles.helper}>{selectedWeekdays.length} días disponibles · {startTime}–{endTime}</Text>
                  </View>
                </View>
                <View style={styles.card}>
                  <Field label="Correo electrónico">
                    <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor={KlippColors.muted} style={styles.input} value={email} />
                  </Field>
                  <Field label="Contraseña">
                    <TextInput autoComplete="new-password" onChangeText={setPassword} placeholder="Al menos 8 caracteres" placeholderTextColor={KlippColors.muted} secureTextEntry style={styles.input} value={password} />
                  </Field>
                  <Field label="Confirma tu contraseña">
                    <TextInput autoComplete="new-password" onChangeText={setConfirmPassword} placeholder="Repite tu contraseña" placeholderTextColor={KlippColors.muted} secureTextEntry style={styles.input} value={confirmPassword} />
                  </Field>
                  <Text style={styles.privacyNote}>🔒 Tus datos se usan para crear y proteger tu cuenta profesional.</Text>
                </View>
              </>
            )}

            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {notice && (
              <View accessibilityRole="status" style={styles.noticeCard}>
                <Text style={styles.noticeIcon}>✉</Text>
                <Text style={styles.noticeText}>{notice}</Text>
                <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/login')} style={styles.loginButton}>
                  <Text style={styles.loginButtonText}>Ir a iniciar sesión</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </ScrollView>
        <View style={styles.footer}>
          {step < steps.length - 1 ? (
            <Pressable accessibilityRole="button" onPress={continueRegistration} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
              <Text style={styles.primaryButtonText}>Continuar</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" disabled={busy || Boolean(notice)} onPress={() => void createProfessionalAccount()} style={({ pressed }) => [styles.primaryButton, (busy || notice) && styles.buttonDisabled, pressed && !busy && styles.primaryPressed]}>
              {busy ? <ActivityIndicator color={KlippColors.white} /> : <Text style={styles.primaryButtonText}>Crear cuenta profesional</Text>}
              {!busy && <Text style={styles.primaryArrow}>→</Text>}
            </Pressable>
          )}
          <Text style={styles.footerText}>¿Ya tienes una cuenta? <Text onPress={() => router.replace('/(auth)/login')} style={styles.footerLink}>Inicia sesión</Text></Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: KlippColors.canvas },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  backText: { color: KlippColors.navy, fontSize: 34, lineHeight: 38 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: KlippColors.navy },
  logoLetter: { color: KlippColors.white, fontSize: 19, fontWeight: '900' },
  brand: { color: KlippColors.navy, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  stepCount: { color: KlippColors.muted, fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 4, marginHorizontal: 20, overflow: 'hidden', borderRadius: 999, backgroundColor: '#E2E8F0' },
  progressFill: { height: 4, borderRadius: 999, backgroundColor: KlippColors.blue },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 20 },
  stepContent: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  heading: { gap: 7, marginBottom: 2 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: KlippColors.navy, fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22 },
  card: { padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.white, gap: 15, shadowColor: '#0F172A', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 3 },
  field: { flex: 1, gap: 7 },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 49, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DCE3EB', borderRadius: 12, backgroundColor: '#FFFFFF', color: KlippColors.navy, fontSize: 15 },
  multiline: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  transportSection: { gap: 9, paddingTop: 2 },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  experienceBadge: { flex: 1, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#EEF4FF' },
  badgeIcon: { color: KlippColors.blue, fontSize: 16 },
  badgeText: { color: KlippColors.blueDark, fontSize: 11, fontWeight: '700' },
  serviceList: { gap: 12 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  catalogErrorCard: { padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, gap: 10 },
  catalogErrorTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  retryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EEF4FF' },
  retryButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  serviceCard: { padding: 15, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, gap: 13, shadowColor: '#0F172A', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12, elevation: 2 },
  serviceCardSelected: { borderColor: '#9AB9FF', backgroundColor: '#FBFDFF' },
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 7 },
  checkboxSelected: { borderColor: KlippColors.blue, backgroundColor: KlippColors.blue },
  checkmark: { color: KlippColors.white, fontSize: 14, fontWeight: '800' },
  serviceCopy: { flex: 1, gap: 4 },
  serviceName: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  serviceDescription: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  serviceFields: { flexDirection: 'row', gap: 10, paddingLeft: 34 },
  helper: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  selectionNote: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  locationIntro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#EEF4FF' },
  locationPin: { color: KlippColors.blue, fontSize: 25, fontWeight: '700' },
  locationCopy: { flex: 1, gap: 3 },
  cardTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  locationButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EEF4FF' },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  testLocationButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#DCE3EB', borderRadius: 12, backgroundColor: KlippColors.white },
  testLocationButtonText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  noLocation: { minHeight: 118, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', gap: 5 },
  noLocationTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: '#DCE3EB', borderRadius: 999, backgroundColor: KlippColors.white },
  chipSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  chipText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: KlippColors.blueDark, fontWeight: '700' },
  divider: { height: 1, backgroundColor: KlippColors.border },
  timeRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: '#D8E7FF', borderRadius: 16, backgroundColor: '#F3F7FF' },
  summaryIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#DCEAFF' },
  summaryIconText: { color: KlippColors.blueDark, fontSize: 17, fontWeight: '800' },
  summaryCopy: { flex: 1, gap: 3 },
  privacyNote: { color: KlippColors.muted, fontSize: 11, lineHeight: 17 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: KlippColors.border, backgroundColor: KlippColors.canvas },
  primaryButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 15, backgroundColor: KlippColors.navy },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: KlippColors.white, fontSize: 15, fontWeight: '700' },
  primaryArrow: { color: KlippColors.white, fontSize: 19, fontWeight: '600' },
  footerText: { marginTop: 12, color: KlippColors.muted, fontSize: 12, textAlign: 'center' },
  footerLink: { color: KlippColors.blueDark, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  error: { padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  noticeCard: { alignItems: 'center', padding: 18, borderRadius: 16, backgroundColor: '#ECFDF5', gap: 9 },
  noticeIcon: { color: '#067647', fontSize: 22 },
  noticeText: { color: '#065F46', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  loginButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 11, backgroundColor: '#D1FAE5' },
  loginButtonText: { color: '#067647', fontSize: 13, fontWeight: '700' },
});
