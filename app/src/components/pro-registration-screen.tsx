import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { useReducedMotion } from '@/components/ui-primitives';
import { CoverageRadiusPicker, type CoverageCoordinate } from '@/components/coverage-radius-picker';
import { KlippColors, RoleThemes } from '@/lib/brand';
import { serviceArt } from '@/lib/service-art';
import type { ServiceType } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type PricingTier = { id: number; service_type_id: number; label: string; est_minutes: number };
type EquipmentRequirement = { id: number; item_name: string; details: string; required: boolean; sort_order: number };
type TierDraft = { price: string; minutes: string };

function parseDopPrice(value: string): number {
  const normalized = value.trim().replace(/[\s,]/g, '');
  return normalized ? Number(normalized) : Number.NaN;
}
type AvailabilityDraft = { weekday: number; start_time: string; end_time: string };
type ProOnboardingDraft = {
  phone: string;
  bio: string;
  years_experience: number | null;
  transport_type: string | null;
  equipment_confirmed: boolean;
  services: { service_type_id: number; details: Record<string, string>; tier_prices: { pricing_tier_id: number; price_dop: number; est_minutes: number }[] }[];
  coverage: { latitude: number; longitude: number; radius_km: number } | null;
  availability: AvailabilityDraft[];
};

const steps = [
  { eyebrow: 'TU PERFIL', title: 'Cuéntanos sobre ti', subtitle: 'Un buen perfil genera confianza y te ayuda a destacar.' },
  { eyebrow: 'TU PROFESIÓN', title: 'Elige tu profesión', subtitle: 'Selecciona una profesión principal y configura sus modalidades y tarifas.' },
  { eyebrow: 'TU COBERTURA', title: 'Define dónde trabajas', subtitle: 'Te conectaremos con clientes dentro de tu radio.' },
  { eyebrow: 'TU CUENTA', title: 'Ya casi está', subtitle: 'Crea tus credenciales. Te enviaremos un correo para confirmar.' },
];
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const radiusOptions = [5, 10, 15, 20, 30, 50];
const transportOptions = ['Motor', 'Automóvil', 'Transporte público', 'Bicicleta', 'A pie', 'Otro'];

const professionVisuals: Record<string, { icon: string; tint: string; accent: string; caption: string }> = {
  barberia: { icon: '✂️', tint: '#E9EDFF', accent: '#3D5AFE', caption: 'Cortes y arreglo de barba' },
  peluqueria: { icon: '💇', tint: '#FFF0EC', accent: '#FF7058', caption: 'Cabello y peinados' },
  estetica: { icon: '✨', tint: '#E7F7F0', accent: '#247A5A', caption: 'Cuidado y belleza' },
  carwash: { icon: '🚘', tint: '#E9EDFF', accent: '#3D5AFE', caption: 'Lavado de vehículos' },
  detailing: { icon: '🧽', tint: '#E7F7F0', accent: '#247A5A', caption: 'Detalle y acabado automotriz' },
  limpieza_regular: { icon: '🧹', tint: '#FFF0EC', accent: '#FF7058', caption: 'Limpieza del hogar' },
  limpieza_profunda: { icon: '🧼', tint: '#E9EDFF', accent: '#3D5AFE', caption: 'Limpieza a fondo' },
  'limpieza-oficinas': { icon: '🏢', tint: '#E7F7F0', accent: '#247A5A', caption: 'Espacios de trabajo' },
  mantenimiento: { icon: '🛠️', tint: '#FFF0EC', accent: '#FF7058', caption: 'Reparaciones y montaje' },
};
function getProfessionVisual(code: string) {
  return professionVisuals[code] ?? { icon: '✦', tint: '#E9EDFF', accent: '#3D5AFE', caption: 'Servicio profesional' };
}


export function ProRegistrationScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 540;
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [catalog, setCatalog] = useState<ServiceType[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [equipmentRequirements, setEquipmentRequirements] = useState<EquipmentRequirement[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [tierDrafts, setTierDrafts] = useState<Record<number, TierDraft>>({});
  const [serviceDetails, setServiceDetails] = useState<Record<string, string>>({});
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(false);
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
  const reducedMotion = useReducedMotion();
  const tierRequestId = useRef(0);
  const [progress] = useState(() => new Animated.Value(0));
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
    if (reducedMotion) {
      setStep(nextStep);
      transition.setValue(1);
      progress.setValue(nextStep);
      return;
    }
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
      if (servicesLoading) return 'Espera un momento mientras cargamos las profesiones.';
      if (catalog.length === 0) return 'No hay profesiones disponibles ahora mismo.';
      if (selectedServiceId === null) return 'Selecciona una profesión para continuar.';
      if (tiersLoading || equipmentLoading) return 'Espera mientras cargamos las modalidades y el equipamiento de esta profesión.';
      if (equipmentRequirements.length === 0) return 'No pudimos cargar el equipamiento de esta profesión. Reintenta o vuelve a seleccionar la profesión.';
      if (pricingTiers.length === 0) return 'Esta profesión no tiene modalidades configuradas. No podemos completar el registro todavía.';
      if (pricingTiers.some((tier) => {
        const draft = tierDrafts[tier.id];
        return !draft || !Number.isFinite(parseDopPrice(draft.price)) || parseDopPrice(draft.price) <= 0
          || !Number.isInteger(Number(draft.minutes)) || Number(draft.minutes) <= 0;
      })) return 'Indica un precio y una duración válidos para cada modalidad.';
      const selectedProfession = catalog.find((item) => item.id === selectedServiceId);
      if (!serviceDetails.specialty?.trim()) return 'Indica tu especialidad o el trabajo que realizas.';
      const requiredDetail = selectedProfession?.code === 'peluqueria' ? 'hair_lengths'
        : selectedProfession?.code === 'estetica' ? 'hygiene'
        : selectedProfession?.code === 'carwash' ? 'utilities'
        : selectedProfession?.code === 'detailing' ? 'vehicle_types'
        : ['limpieza_regular', 'limpieza-oficinas'].includes(selectedProfession?.code ?? '') ? 'frequency'
        : selectedProfession?.code === 'limpieza_profunda' ? 'extras'
        : selectedProfession?.code === 'mantenimiento' ? 'tools' : null;
      if (requiredDetail && !serviceDetails[requiredDetail]?.trim()) return 'Completa el dato específico que necesita esta profesión.';
      if (!equipmentConfirmed) return 'Confirma que llevarás tus propias herramientas y materiales.';

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

  function chooseProfession(serviceId: number) {
    const requestId = ++tierRequestId.current;
    setSelectedServiceId(serviceId);
    setPricingTiers([]);
    setTiersLoading(true);
    setEquipmentRequirements([]);
    setEquipmentLoading(true);
    setTierDrafts({});
    setServiceDetails({});
    setError(null);
    void supabase.from('pricing_tiers')
      .select('id, service_type_id, label, est_minutes')
      .eq('service_type_id', serviceId)
      .order('id')
      .then(({ data, error: queryError }) => {
        if (requestId !== tierRequestId.current) return;
        if (queryError) {
          setError('No pudimos cargar las modalidades de esta profesión.');
          setTiersLoading(false);
          return;
        }
        const tiers = (data ?? []) as PricingTier[];
        setPricingTiers(tiers);
        setTiersLoading(false);
        setTierDrafts(Object.fromEntries(tiers.map((tier) => [tier.id, {
          price: '',
          minutes: String(tier.est_minutes || 60),
        }])));
      });
    void supabase.from('service_equipment_requirements')
      .select('id, item_name, details, required, sort_order')
      .eq('service_type_id', serviceId)
      .eq('active', true)
      .order('sort_order')
      .then(({ data, error: queryError }) => {
        if (requestId !== tierRequestId.current) return;
        if (queryError) {
          setError('No pudimos cargar la lista de herramientas recomendadas.');
          setEquipmentLoading(false);
          return;
        }
        setEquipmentRequirements((data ?? []) as EquipmentRequirement[]);
        setEquipmentLoading(false);
      });
  }

  function toggleWeekday(weekday: number) {
    setSelectedWeekdays((current) => current.includes(weekday)
      ? current.filter((day) => day !== weekday)
      : [...current, weekday].sort((a, b) => a - b));
  }

  async function requestCurrentLocation() {
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
      equipment_confirmed: equipmentConfirmed,
      services: selectedServiceId === null ? [] : [{
        service_type_id: selectedServiceId,
        details: serviceDetails,
        tier_prices: pricingTiers.map((tier) => ({
          pricing_tier_id: tier.id,
          price_dop: parseDopPrice(tierDrafts[tier.id]?.price ?? ''),
          est_minutes: Number(tierDrafts[tier.id]?.minutes),
        })),
      }],
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
  const selectedProfession = catalog.find((item) => item.id === selectedServiceId) ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => step === 0 ? router.back() : animateToStep(step - 1)} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
            <View style={styles.brandCopy}>
              <Text style={styles.brand}>KLIPP</Text>
              <Text style={styles.brandRole}>PROFESIONAL</Text>
            </View>
          </View>
          <Text style={styles.stepCount}>{String(step + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <ImageBackground
              source={{ uri: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=1400&q=85' }}
              resizeMode="cover"
              imageStyle={styles.proHeroImage}
              style={styles.proHero}>
              <View style={styles.proHeroShade} />
              <View style={styles.proHeroCopy}>
                <Text style={styles.proHeroEyebrow}>KLIPP PRO · SANTO DOMINGO</Text>
                <Text style={styles.proHeroTitle}>Tu trabajo, más cerca de nuevos clientes.</Text>
                <Text style={styles.proHeroSubtitle}>Crea tu perfil profesional y recibe solicitudes en tu zona.</Text>
              </View>
            </ImageBackground>
          )}
          <Animated.View
            style={[
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
                <View style={[styles.twoColumns, compact && styles.stackedColumns]}>
                  <Field label="Años de experiencia">
                    <TextInput keyboardType="number-pad" onChangeText={setYears} placeholder="Ej. 4" placeholderTextColor={KlippColors.muted} style={styles.input} value={years} />
                  </Field>
                  <View style={styles.experienceHint}>
                    <Text style={styles.helper}>Puedes dejar este dato vacío y completarlo más adelante.</Text>
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
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Elige tu profesión principal</Text>
                  <Text style={styles.helper}>Tu cuenta profesional se especializa en una sola actividad. Después podrás completar tu perfil y publicar sus modalidades.</Text>
                  {servicesLoading ? (
                    <View style={styles.loading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.helper}>Cargando profesiones...</Text></View>
                  ) : catalogError ? (
                    <View style={styles.catalogErrorCard}>
                      <Text style={styles.catalogErrorTitle}>No pudimos cargar las profesiones</Text>
                      <Text style={styles.helper}>{catalogError}</Text>
                      <Pressable accessibilityRole="button" onPress={retryCatalog} style={styles.retryButton}><Text style={styles.retryButtonText}>Reintentar</Text></Pressable>
                    </View>
                  ) : catalog.map((service) => {
                    const selected = selectedServiceId === service.id;
                    return (
                      <Pressable key={service.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => chooseProfession(service.id)} style={[styles.professionOption, selected && styles.professionOptionSelected]}>
                        <Image source={serviceArt(service.code)} contentFit="cover" style={styles.professionPhoto} />
                        <View style={styles.serviceCopy}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                          <Text style={styles.serviceDescription}>{service.description || getProfessionVisual(service.code).caption}</Text>
                          <Text style={styles.professionHint}>{getProfessionVisual(service.code).caption}</Text>
                        </View>
                        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>{selected && <View style={styles.radioInner} />}</View>
                      </Pressable>
                    );
                  })}
                </View>
                {selectedProfession && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Detalles de {selectedProfession.name.toLowerCase()}</Text>
                    <Field label="Especialidad o trabajo principal">
                      <TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, specialty: value }))} placeholder="Ej. cortes clásicos y degradados" placeholderTextColor={KlippColors.muted} style={styles.input} value={serviceDetails.specialty ?? ''} />
                    </Field>
                    {selectedProfession.code === 'peluqueria' && (
                      <Field label="Tipos y largos de cabello que atiendes">
                        <TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, hair_lengths: value }))} placeholder="Ej. corto, medio, largo y rizado" placeholderTextColor={KlippColors.muted} style={styles.input} value={serviceDetails.hair_lengths ?? ''} />
                      </Field>
                    )}
                    {selectedProfession.code === 'estetica' && (
                      <Field label="Higiene y desinfección de instrumentos">
                        <TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, hygiene: value }))} placeholder="Describe cómo limpias y desinfectas tus instrumentos" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={serviceDetails.hygiene ?? ''} />
                      </Field>
                    )}
                    {selectedProfession.code === 'carwash' && (
                      <Field label="Agua y energía en el lugar del servicio">
                        <TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, utilities: value }))} placeholder="Indica qué necesitas del lugar y cómo trabajas si no hay toma de agua" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={serviceDetails.utilities ?? ''} />
                      </Field>
                    )}
                    {selectedProfession.code === 'detailing' && (
                      <Field label="Tipos de vehículos que atiendes">
                        <TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, vehicle_types: value }))} placeholder="Ej. sedanes, SUV y camionetas" placeholderTextColor={KlippColors.muted} style={styles.input} value={serviceDetails.vehicle_types ?? ''} />
                      </Field>
                    )}
                    {['limpieza_regular', 'limpieza-oficinas'].includes(selectedProfession.code) && (
                      <Field label="Frecuencia y disponibilidad">
                        <TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, frequency: value }))} placeholder="Ej. servicios puntuales, semanales o quincenales" placeholderTextColor={KlippColors.muted} style={styles.input} value={serviceDetails.frequency ?? ''} />
                      </Field>
                    )}
                    {selectedProfession.code === 'limpieza_profunda' && (
                      <Field label="Alcance y tareas adicionales">
                        <TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, extras: value }))} placeholder="Indica qué tareas profundas o adicionales realizas" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={serviceDetails.extras ?? ''} />
                      </Field>
                    )}
                    {selectedProfession.code === 'mantenimiento' && (
                      <Field label="Herramientas y trabajos que puedes realizar">
                        <TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, tools: value }))} placeholder="Ej. herramientas propias para plomería y montaje" placeholderTextColor={KlippColors.muted} style={[styles.input, styles.multiline]} value={serviceDetails.tools ?? ''} />
                      </Field>
                    )}
                  </View>
                )}
                {selectedProfession && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Precios por modalidad</Text>
                    <Text style={styles.helper}>Define cuánto cobras y cuánto tiempo necesitas para cada modalidad. El cliente verá estos importes al reservar.</Text>
                    {tiersLoading ? (
                      <View style={styles.loading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.helper}>Cargando modalidades...</Text></View>
                    ) : pricingTiers.length === 0 ? (
                      <Text style={styles.emptyState}>Esta profesión todavía no tiene modalidades publicadas. No es posible continuar con el registro.</Text>
                    ) : pricingTiers.map((tier) => {
                      const draft = tierDrafts[tier.id] ?? { price: '', minutes: String(tier.est_minutes || 60) };
                      return (
                        <View key={tier.id} style={styles.tierCard}>
                          <Text style={styles.serviceName}>{tier.label}</Text>
                          <View style={[styles.serviceFields, compact && styles.stackedServiceFields]}>
                            <Field label="Precio · RD$">
                              <TextInput keyboardType="decimal-pad" onChangeText={(price) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...draft, price } }))} placeholder="1500" placeholderTextColor={KlippColors.muted} style={styles.input} value={draft.price} />
                            </Field>
                            <Field label="Duración · min">
                              <TextInput keyboardType="number-pad" onChangeText={(minutes) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...draft, minutes } }))} placeholder="60" placeholderTextColor={KlippColors.muted} style={styles.input} value={draft.minutes} />
                            </Field>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {equipmentLoading ? (
                  <View style={styles.card}><View style={styles.loading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.helper}>Cargando herramientas y materiales...</Text></View></View>
                ) : equipmentRequirements.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Herramientas y materiales que debes llevar</Text>
                    <Text style={styles.helper}>Esta es la lista orientativa para tu profesión. Todo el equipo y los productos necesarios corren por cuenta del profesional.</Text>
                    {equipmentRequirements.map((item) => (
                      <View key={item.id} style={styles.equipmentItem}>
                        <Text style={styles.equipmentBullet}>✓</Text>
                        <View style={styles.serviceCopy}>
                          <Text style={styles.serviceName}>{item.item_name}</Text>
                          {!!item.details && <Text style={styles.helper}>{item.details}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: equipmentConfirmed }} onPress={() => setEquipmentConfirmed((value) => !value)} style={styles.equipmentConsent}>
                  <View style={[styles.checkbox, equipmentConfirmed && styles.checkboxSelected]}>{equipmentConfirmed && <Text style={styles.checkmark}>✓</Text>}</View>
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceName}>Llevaré mis propias herramientas y materiales</Text>
                    <Text style={styles.helper}>Klipp no proporciona herramientas ni materiales. El profesional debe acudir con todo lo necesario para realizar el servicio. No se utilizarán los materiales del cliente.</Text>
                  </View>
                </Pressable>
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
                <Pressable accessibilityRole="button" disabled={locating} onPress={() => void requestCurrentLocation()} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
                  {locating ? <ActivityIndicator color={KlippColors.blueDark} /> : <Text style={styles.locationButtonText}>{center ? 'Actualizar con mi ubicación' : 'Usar mi ubicación actual'}</Text>}
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
                <View style={[styles.timeRow, compact && styles.stackedColumns]}>
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
                    <Text style={styles.cardTitle}>{selectedProfession?.name ?? 'Profesión pendiente'} · {radiusKm} km</Text>
                    <Text style={styles.helper}>{selectedWeekdays.length} días disponibles · {startTime}–{endTime}</Text>
                  </View>
                </View>
                <View style={styles.card}>
                  <Field label="Correo electrónico">
                    <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="nombre@correo.com" placeholderTextColor={KlippColors.muted} style={styles.input} value={email} />
                  </Field>
                  <Field label="Contraseña">
                    <View style={styles.passwordField}>
                      <TextInput autoComplete="new-password" onChangeText={setPassword} placeholder="Al menos 8 caracteres" placeholderTextColor={KlippColors.muted} secureTextEntry={!showPassword} style={styles.passwordInput} value={password} />
                      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} hitSlop={10} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordVisibility}>
                        <Text style={styles.passwordVisibilityText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                      </Pressable>
                    </View>
                  </Field>
                  <Field label="Confirma tu contraseña">
                    <View style={styles.passwordField}>
                      <TextInput autoComplete="new-password" onChangeText={setConfirmPassword} placeholder="Repite tu contraseña" placeholderTextColor={KlippColors.muted} secureTextEntry={!showConfirmPassword} style={styles.passwordInput} value={confirmPassword} />
                      <Pressable accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'} hitSlop={10} onPress={() => setShowConfirmPassword((visible) => !visible)} style={styles.passwordVisibility}>
                        <Text style={styles.passwordVisibilityText}>{showConfirmPassword ? 'Ocultar' : 'Mostrar'}</Text>
                      </Pressable>
                    </View>
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
  header: { width: '100%', maxWidth: 920, minHeight: 92, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingVertical: 18, backgroundColor: '#17213B', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backButton: { width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.1)', paddingLeft: 8 },
  backText: { color: '#FFFFFF', fontSize: 34, lineHeight: 38 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: KlippColors.coral },
  logoLetter: { color: KlippColors.white, fontSize: 20, fontWeight: '900' },
  brandCopy: { gap: 1 },
  brand: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 1 },
  brandRole: { color: '#FFB7A8', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  stepCount: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  progressTrack: { width: '100%', maxWidth: 920, height: 5, alignSelf: 'center', marginHorizontal: 0, overflow: 'hidden', borderRadius: 0, backgroundColor: '#D8D9E1' },
  progressFill: { height: 5, borderRadius: 0, backgroundColor: KlippColors.coral },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 36 },
  proHero: { width: '100%', maxWidth: 920, minHeight: 245, alignSelf: 'center', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 16, backgroundColor: '#27334B', marginBottom: 22 },
  proHeroImage: { borderRadius: 16 },
  proHeroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,22,39,0.43)' },
  proHeroCopy: { padding: 24, gap: 8, maxWidth: 620 },
  proHeroEyebrow: { color: '#FFB7A8', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  proHeroTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.6 },
  proHeroSubtitle: { color: '#F5F5F5', fontSize: 13, lineHeight: 19, maxWidth: 460 },
  stepContent: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 26 },
  heading: { gap: 8, marginBottom: 2 },
  eyebrow: { color: RoleThemes.pro.accentStrong, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.ink, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1 },
  subtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, maxWidth: 620 },
  card: { paddingVertical: 19, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: 1, borderColor: '#EAE7E0', borderRadius: 0, backgroundColor: 'transparent', gap: 18, shadowOpacity: 0, elevation: 0 },
  field: { flex: 1, gap: 8, minWidth: 0 },
  label: { color: KlippColors.slate, fontSize: 12, fontWeight: '800' },
  passwordField: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, borderWidth: 1, borderColor: '#DFE1E8', borderRadius: 16, backgroundColor: '#FCFCFD' },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 54, color: KlippColors.ink, fontSize: 15 },
  passwordVisibility: { minWidth: 64, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 11, backgroundColor: KlippColors.surfaceBlue },
  passwordVisibilityText: { color: KlippColors.cobaltDark, fontSize: 11, fontWeight: '800' },
  input: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DFE1E8', borderRadius: 10, backgroundColor: '#FFFFFF', color: KlippColors.ink, fontSize: 15 },
  multiline: { minHeight: 112, paddingTop: 13, textAlignVertical: 'top' },
  transportSection: { gap: 10, paddingTop: 3 },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  stackedColumns: { flexDirection: 'column', alignItems: 'stretch' },
  experienceHint: { flex: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 8 },
  serviceList: { gap: 16 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  catalogErrorCard: { padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white, gap: 11 },
  catalogErrorTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: KlippColors.whiteTeal },
  retryButtonText: { color: RoleThemes.pro.accentStrong, fontSize: 13, fontWeight: '800' },
  serviceCard: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white, gap: 14, shadowColor: KlippColors.ink, shadowOpacity: 0.025, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 2 },
  serviceCardSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.whiteBlue },
  professionOption: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 1, borderColor: '#EAE7E0', borderRadius: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  professionIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  professionPhoto: { width: 76, height: 66, borderRadius: 10, backgroundColor: KlippColors.surfaceMuted },
  professionIconText: { fontSize: 25 },
  professionHint: { color: KlippColors.slate, fontSize: 10, fontWeight: '700', marginTop: 2 },
  professionOptionSelected: { borderColor: RoleThemes.pro.accent, backgroundColor: 'rgba(255,112,88,0.055)' },
  radioOuter: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 99 },
  radioOuterSelected: { borderColor: RoleThemes.pro.accent },
  radioInner: { width: 10, height: 10, borderRadius: 99, backgroundColor: RoleThemes.pro.accent },
  tierCard: { gap: 11, paddingTop: 13, borderTopWidth: 1, borderTopColor: KlippColors.border },
  equipmentConsent: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 17, borderWidth: 1, borderColor: KlippColors.mint, borderRadius: 18, backgroundColor: KlippColors.whiteMint },
  equipmentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 8 },
  emptyState: { color: KlippColors.muted, fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  equipmentBullet: { color: RoleThemes.pro.accentStrong, fontSize: 15, fontWeight: '900' },
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 7 },
  checkboxSelected: { borderColor: RoleThemes.pro.accent, backgroundColor: RoleThemes.pro.accent },
  checkmark: { color: KlippColors.white, fontSize: 14, fontWeight: '900' },
  serviceCopy: { flex: 1, minWidth: 0, gap: 4 },
  serviceName: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  serviceDescription: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  serviceFields: { flexDirection: 'row', gap: 12, paddingLeft: 34 },
  stackedServiceFields: { flexDirection: 'column', paddingLeft: 0 },
  helper: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  selectionNote: { color: RoleThemes.pro.accentStrong, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  locationIntro: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  locationIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: KlippColors.whiteTeal },
  locationPin: { color: RoleThemes.pro.accent, fontSize: 25, fontWeight: '800' },
  locationCopy: { flex: 1, gap: 3 },
  cardTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  locationButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.whiteTeal },
  locationButtonText: { color: RoleThemes.pro.accentStrong, fontSize: 13, fontWeight: '800' },
  testLocationButtonText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  noLocation: { minHeight: 122, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16, backgroundColor: '#F8FAFC', gap: 6 },
  noLocationTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 39, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 999, backgroundColor: KlippColors.white },
  chipSelected: { borderColor: RoleThemes.pro.accent, backgroundColor: KlippColors.whiteTeal },
  chipText: { color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: RoleThemes.pro.accentStrong, fontWeight: '800' },
  divider: { height: 1, backgroundColor: KlippColors.border },
  timeRow: { flexDirection: 'row', gap: 14 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, borderWidth: 1, borderColor: KlippColors.mint, borderRadius: 18, backgroundColor: KlippColors.whiteMint },
  summaryIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#D9F0E7' },
  summaryIconText: { color: RoleThemes.pro.accentStrong, fontSize: 17, fontWeight: '900' },
  summaryCopy: { flex: 1, gap: 4 },
  privacyNote: { color: KlippColors.muted, fontSize: 11, lineHeight: 17 },
  footer: { width: '100%', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: KlippColors.border, backgroundColor: KlippColors.white },
  primaryButton: { width: '100%', maxWidth: 720, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, backgroundColor: RoleThemes.pro.accentStrong },
  primaryPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: KlippColors.white, fontSize: 14, fontWeight: '900' },
  primaryArrow: { color: KlippColors.white, fontSize: 19, fontWeight: '700' },
  footerText: { marginTop: 12, color: KlippColors.muted, fontSize: 12, textAlign: 'center' },
  footerLink: { color: RoleThemes.pro.accentStrong, fontWeight: '900' },
  pressed: { opacity: 0.88 },
  error: { padding: 13, borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, backgroundColor: '#FEF2F2', color: KlippColors.danger, fontSize: 13, lineHeight: 19 },
  noticeCard: { alignItems: 'center', padding: 20, borderWidth: 1, borderColor: '#B7E4D1', borderRadius: 18, backgroundColor: '#ECFDF5', gap: 10 },
  noticeIcon: { color: '#047857', fontSize: 22 },
  noticeText: { color: '#065F46', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  loginButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 19, borderRadius: 13, backgroundColor: '#D1FAE5' },
  loginButtonText: { color: '#047857', fontSize: 13, fontWeight: '800' },
});
