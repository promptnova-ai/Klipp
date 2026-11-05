import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  ImageBackground,
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
  { eyebrow: 'TUS DATOS', title: 'Empecemos por ti', subtitle: 'Primero, tus datos de contacto.' },
  { eyebrow: 'TU PERFIL', title: 'Cuéntanos de tu talento', subtitle: 'Completa los detalles que te ayudarán a destacar.' },
  { eyebrow: 'TUS SERVICIOS', title: '¿Qué sabes hacer?', subtitle: 'Elige tus especialidades y define tus tarifas.' },
  { eyebrow: 'TU COBERTURA', title: '¿Dónde trabajas?', subtitle: 'Define tu ubicación y el radio donde puedes atender.' },
  { eyebrow: 'TU HORARIO', title: '¿Cuándo estás disponible?', subtitle: 'Indica los días y las horas en que puedes recibir solicitudes.' },
  { eyebrow: 'TU CUENTA', title: 'Ya casi está', subtitle: 'Crea tus credenciales para terminar.' },
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
  const [transition] = useState(() => new Animated.Value(1));
  const [transitionOffset] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));
  const progressWidth = progress.interpolate({ inputRange: [0, steps.length - 1], outputRange: ['8%', '100%'] });

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
    const direction = nextStep > step ? 1 : -1;
    const nativeDriver = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(transition, { toValue: 0, duration: 130, useNativeDriver: nativeDriver }),
      Animated.timing(transitionOffset, { toValue: direction * -18, duration: 130, useNativeDriver: nativeDriver }),
    ]).start(() => {
      setStep(nextStep);
      transition.setValue(0);
      transitionOffset.setValue(direction * 18);
      Animated.parallel([
        Animated.spring(transition, { toValue: 1, speed: 18, bounciness: 3, useNativeDriver: nativeDriver }),
        Animated.spring(transitionOffset, { toValue: 0, speed: 18, bounciness: 3, useNativeDriver: nativeDriver }),
        Animated.timing(progress, { toValue: nextStep, duration: 420, useNativeDriver: false }),
      ]).start();
    });
  }

  function validateStep() {
    if (step === 0) {
      if (fullName.trim().length < 2) return 'Escribe tu nombre completo para continuar.';
      if (phone.replace(/\D/g, '').length < 10) return 'Escribe un número de teléfono válido de 10 dígitos.';
    }
    if (step === 1) {
      if (years.trim() && (!Number.isInteger(Number(years)) || Number(years) < 0)) return 'Los años de experiencia deben ser un número entero válido.';
      if (transportType === 'Otro' && !otherTransportType.trim()) return 'Especifica cómo te trasladas para llegar a tus clientes.';
    }
    if (step === 2) {
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
    if (step === 3 && !center) return 'Define el centro de tu área de trabajo con tu ubicación o ajustando el mapa.';
    if (step === 4) {
      if (selectedWeekdays.length === 0) return 'Selecciona al menos un día de trabajo.';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) {
        return 'Indica un horario válido en formato de 24 horas y asegúrate de que la hora final sea posterior.';
      }
    }
    if (step === 5) {
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

  async function locateCurrentPosition() {
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

  function setTestLocation() {
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
        <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1500&q=86' }} imageStyle={styles.headerHeroImage} style={styles.headerHero}>
          <View style={styles.headerScrim} />
          <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => step === 0 ? router.back() : animateToStep(step - 1)} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
            <Text style={styles.brand}>Klipp <Text style={styles.proWord}>PRO</Text></Text>
          </View>
          <Text style={styles.headerCaption}>CREA TU PERFIL PROFESIONAL</Text>
          </View>
        </ImageBackground>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <View style={styles.scrollContent}>
          <Animated.View style={[styles.stepContent, { opacity: transition, transform: [{ translateX: transitionOffset }] }]}>
            <View style={styles.stepRail}>
              {steps.map((item, index) => (
                <View key={item.eyebrow} style={styles.stepRailItem}>
                  <View style={[styles.stepRailDot, index === step && styles.stepRailDotActive, index < step && styles.stepRailDotDone]}>
                    <Text style={[styles.stepRailNumber, (index === step || index < step) && styles.stepRailNumberActive]}>{index < step ? '✓' : String(index + 1)}</Text>
                  </View>
                  <Text style={[styles.stepRailLabel, index === step && styles.stepRailLabelActive]}>{item.eyebrow}</Text>
                  {index < steps.length - 1 && <View style={[styles.stepRailLine, index < step && styles.stepRailLineDone]} />}
                </View>
              ))}
            </View>
            <View style={styles.heading}>
              <View style={styles.headingTopline}>
                <Text style={styles.eyebrow}>{currentStep.eyebrow}</Text>
                <Text style={styles.headingStep}>{String(step + 1).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.title}>{currentStep.title}</Text>
              <Text style={styles.subtitle}>{currentStep.subtitle}</Text>
            </View>

            {step === 0 && (
              <View style={styles.card}>
                <Field label="Nombre completo">
                  <TextInput autoComplete="name" autoCapitalize="words" returnKeyType="next" onChangeText={setFullName} placeholder="¿Cómo te llamas?" placeholderTextColor={KlippColors.muted} style={styles.input} value={fullName} />
                </Field>
                <Field label="Teléfono de contacto">
                  <TextInput autoComplete="tel" keyboardType="phone-pad" returnKeyType="done" onChangeText={setPhone} placeholder="809 555 0123" placeholderTextColor={KlippColors.muted} style={styles.input} value={phone} />
                </Field>
              </View>
            )}

            {step === 1 && (
              <View style={styles.card}>
                <View style={styles.twoColumns}>
                  <Field label="Años de experiencia">
                    <TextInput keyboardType="number-pad" onChangeText={setYears} placeholder="Ej. 4" placeholderTextColor={KlippColors.muted} style={styles.input} value={years} />
                  </Field>
                  <View style={styles.experienceBadge}><Text style={styles.badgeIcon}>✦</Text><Text style={styles.badgeText}>Tu talento merece crecer</Text></View>
                </View>
                <Field label="Una breve presentación">
                  <TextInput multiline maxLength={240} onChangeText={setBio} placeholder="¿Qué te hace especial en tu trabajo?" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={bio} />
                </Field>
                <View style={styles.transportSection}>
                  <Text style={styles.label}>¿Cómo te trasladas al domicilio?</Text>
                  <View style={styles.chips}>
                    {transportOptions.map((option) => <Chip key={option} label={option} selected={transportType === option} onPress={() => setTransportType(option)} />)}
                  </View>
                  {transportType === 'Otro' && <TextInput accessibilityLabel="Especifica tu medio de transporte" maxLength={50} onChangeText={setOtherTransportType} placeholder="Tu medio de transporte" placeholderTextColor={KlippColors.muted} style={styles.input} value={otherTransportType} />}
                </View>
              </View>
            )}

            {step === 2 && (
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

            {step === 3 && (
              <View style={styles.card}>
                <View style={styles.locationIntro}>
                  <View style={styles.locationIcon}><Text style={styles.locationPin}>⌖</Text></View>
                  <View style={styles.locationCopy}>
                    <Text style={styles.cardTitle}>Tu punto de partida</Text>
                    <Text style={styles.helper}>Clientes dentro del círculo podrán encontrarte.</Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" disabled={locating} onPress={() => void locateCurrentPosition()} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
                  {locating ? <ActivityIndicator color={KlippColors.blueDark} /> : <Text style={styles.locationButtonText}>{center ? 'Actualizar con mi ubicación' : 'Usar mi ubicación actual'}</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" onPress={setTestLocation} style={({ pressed }) => [styles.testLocationButton, pressed && styles.pressed]}>
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

              </View>
            )}

            {step === 4 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Selecciona tus días de trabajo</Text>
                <View style={styles.chips}>
                  {weekdays.map((day, index) => <Chip key={day} label={day} selected={selectedWeekdays.includes(index + 1)} onPress={() => toggleWeekday(index + 1)} />)}
                </View>
                <View style={styles.timeRow}>
                  <Field label="Desde"><TextInput keyboardType="numbers-and-punctuation" onChangeText={setStartTime} placeholder="08:00" placeholderTextColor={KlippColors.muted} style={styles.input} value={startTime} /></Field>
                  <Field label="Hasta"><TextInput keyboardType="numbers-and-punctuation" onChangeText={setEndTime} placeholder="17:00" placeholderTextColor={KlippColors.muted} style={styles.input} value={endTime} /></Field>
                </View>
              </View>
            )}

            {step === 5 && (
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
        </View>
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
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  
  headerHero: { height: 104, minHeight: 104, justifyContent: 'center', backgroundColor: '#222222', overflow: 'hidden' },
  headerHeroImage: { opacity: 0.9 },
  headerScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 14, 16, 0.58)' },
  header: { minHeight: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  backText: { color: '#FFFFFF', fontSize: 29, lineHeight: 32, marginTop: -3 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoMark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FF5A5F', borderWidth: 1, borderColor: '#FF5A5F' },
  logoLetter: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  brand: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', letterSpacing: -0.8 },
  proWord: { color: '#FFD5D7', fontSize: 10, letterSpacing: 1.5 },
  headerCaption: { color: 'rgba(255,255,255,0.86)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, maxWidth: 112, textAlign: 'right', lineHeight: 14 },
  progressTrack: { height: 5, marginHorizontal: 22, overflow: 'hidden', borderRadius: 999, backgroundColor: '#EBEBEB' },
  progressFill: { height: 5, borderRadius: 999, backgroundColor: '#FF5A5F' },
  scrollContent: { flex: 1, minHeight: 0, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6, justifyContent: 'center' },
  stepContent: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 8 },
  stepRail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingVertical: 2, marginBottom: 0 },
  stepRailItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepRailDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#DDDDDD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  stepRailDotActive: { borderColor: '#FF5A5F', backgroundColor: '#FFF0F1' },
  stepRailDotDone: { borderColor: '#00A699', backgroundColor: '#E8F6F4' },
  stepRailNumber: { color: '#999999', fontSize: 10, fontWeight: '900' },
  stepRailNumberActive: { color: '#E31C5F' },
  stepRailLabel: { color: '#999999', fontSize: 7, fontWeight: '800', letterSpacing: 0.4 },
  stepRailLabelActive: { color: '#222222' },
  stepRailLine: { height: 1, flex: 1, backgroundColor: '#EBEBEB', marginHorizontal: 4 },
  stepRailLineDone: { backgroundColor: '#00A699' },
  heading: { position: 'relative', overflow: 'hidden', gap: 4, marginBottom: 0, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'transparent' },
  headingTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingStep: { color: '#717171', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  eyebrow: { color: '#FF5A5F', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#222222', fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -1.1 },
  subtitle: { maxWidth: 520, color: '#717171', fontSize: 14, lineHeight: 21 },
  card: { padding: 16, borderWidth: 1, borderColor: '#EBEBEB', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 20, shadowColor: '#222222', shadowOpacity: 0.035, shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, elevation: 1 },
  field: { flex: 1, gap: 7 },
  label: { color: '#484848', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 54, paddingHorizontal: 16, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 14, backgroundColor: '#F7F7F7', color: '#222222', fontSize: 15, fontWeight: '500' },
  multiline: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  transportSection: { gap: 9, paddingTop: 2 },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  experienceBadge: { flex: 1, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#FFF0F1' },
  badgeIcon: { color: KlippColors.blue, fontSize: 16 },
  badgeText: { color: '#E31C5F', fontSize: 11, fontWeight: '700' },
  serviceList: { gap: 12 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  catalogErrorCard: { padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, gap: 10 },
  catalogErrorTitle: { color: '#222222', fontSize: 15, fontWeight: '700' },
  retryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF0F1' },
  retryButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  serviceCard: { padding: 19, borderWidth: 1, borderColor: '#EBEBEB', borderRadius: 20, backgroundColor: '#FFFFFF', gap: 15, shadowColor: KlippColors.navy, shadowOpacity: 0.05, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 1 },
  serviceCardSelected: { borderColor: KlippColors.blue, backgroundColor: '#FFF0F1' },
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#DDDDDD', borderRadius: 7 },
  checkboxSelected: { borderColor: KlippColors.blue, backgroundColor: KlippColors.blue },
  checkmark: { color: KlippColors.white, fontSize: 14, fontWeight: '800' },
  serviceCopy: { flex: 1, gap: 4 },
  serviceName: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  serviceDescription: { color: '#717171', fontSize: 12, lineHeight: 17 },
  serviceFields: { flexDirection: 'row', gap: 10, paddingLeft: 34 },
  helper: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  selectionNote: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  locationIntro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFF0F1' },
  locationPin: { color: KlippColors.blue, fontSize: 25, fontWeight: '700' },
  locationCopy: { flex: 1, gap: 3 },
  cardTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  locationButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFF0F1', borderWidth: 1, borderColor: '#FFD5D7' },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  testLocationButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 12, backgroundColor: '#F7F7F7' },
  testLocationButtonText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  noLocation: { minHeight: 118, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: '#F7F7F7', gap: 5 },
  noLocationTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 999, backgroundColor: KlippColors.white },
  chipSelected: { borderColor: KlippColors.blue, backgroundColor: '#FFF0F1' },
  chipText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: KlippColors.blueDark, fontWeight: '700' },
  divider: { height: 1, backgroundColor: KlippColors.border },
  timeRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: '#FFD5D7', borderRadius: 16, backgroundColor: '#FFF0F1' },
  summaryIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFD5D7' },
  summaryIconText: { color: KlippColors.blueDark, fontSize: 17, fontWeight: '800' },
  summaryCopy: { flex: 1, gap: 3 },
  privacyNote: { color: KlippColors.muted, fontSize: 11, lineHeight: 17 },
  footer: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#EBEBEB', backgroundColor: '#FFFFFF' },
  primaryButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, backgroundColor: '#FF5A5F', shadowColor: '#FF5A5F', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12, elevation: 2 },
  primaryPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#09090B', fontSize: 15, fontWeight: '900', letterSpacing: 0.1 },
  primaryArrow: { color: '#09090B', fontSize: 19, fontWeight: '600' },
  footerText: { marginTop: 12, color: '#717171', fontSize: 12, textAlign: 'center' },
  footerLink: { color: '#E31C5F', fontWeight: '700' },
  pressed: { opacity: 0.85 },
  error: { padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  noticeCard: { alignItems: 'center', padding: 20, borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 19, backgroundColor: '#ECFDF5', gap: 10 },
  noticeIcon: { color: '#047857', fontSize: 22 },
  noticeText: { color: '#065F46', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  loginButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 11, backgroundColor: '#D1FAE5' },
  loginButtonText: { color: '#047857', fontSize: 13, fontWeight: '700' },
});
