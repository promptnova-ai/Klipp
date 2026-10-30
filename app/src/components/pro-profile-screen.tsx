import { useCallback, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { CoverageRadiusPicker, type CoverageCoordinate } from '@/components/coverage-radius-picker';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import type { ProAvailability, ProProfile, ServiceType, VerificationStatus } from '@/lib/types';

type EquipmentRequirement = { id: number; service_type_id: number; item_name: string; details: string; required: boolean; sort_order: number };
type ProfessionalService = {
  service_type_id: number;
  base_price_dop: number;
  est_minutes: number;
};

type RegistrationDraft = {
  phone: string;
  bio: string;
  years_experience: number | null;
  transport_type?: string | null;
  services: ProfessionalService[];
  coverage: { latitude: number; longitude: number; radius_km: number } | null;
  availability: { weekday: number; start_time: string; end_time: string }[];
};

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const serviceRadiiKm = [5, 10, 15, 20, 30, 50];

function getRegistrationDraft(value: unknown): RegistrationDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<RegistrationDraft>;
  return {
    phone: typeof draft.phone === 'string' ? draft.phone : '',
    bio: typeof draft.bio === 'string' ? draft.bio : '',
    years_experience: typeof draft.years_experience === 'number' ? draft.years_experience : null,
    transport_type: typeof draft.transport_type === 'string' ? draft.transport_type : null,
    services: Array.isArray(draft.services) ? draft.services.filter((service) =>
      Number.isInteger(service.service_type_id)
      && Number.isFinite(service.base_price_dop)
      && Number.isInteger(service.est_minutes),
    ) : [],
    coverage: draft.coverage
      && Number.isFinite(draft.coverage.latitude)
      && Number.isFinite(draft.coverage.longitude)
      && Number.isFinite(draft.coverage.radius_km)
      ? draft.coverage
      : null,
    availability: Array.isArray(draft.availability) ? draft.availability.filter((slot) =>
      Number.isInteger(slot.weekday)
      && slot.weekday >= 1
      && slot.weekday <= 7
      && typeof slot.start_time === 'string'
      && typeof slot.end_time === 'string',
    ) : [],
  };
}

function verificationLabel(status: VerificationStatus) {
  if (status === 'approved') return 'Verificado';
  if (status === 'rejected') return 'Verificación rechazada';
  return 'Verificación pendiente';
}

export function ProProfileScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proProfile, setProProfile] = useState<ProProfile | null>(null);
  const [coverageCenter, setCoverageCenter] = useState<CoverageCoordinate | null>(null);
  const [coverageRadiusKm, setCoverageRadiusKm] = useState(10);
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [transportType, setTransportType] = useState('');
  const [availability, setAvailability] = useState<ProAvailability[]>([]);
  const [catalog, setCatalog] = useState<ServiceType[]>([]);
  const [equipmentByService, setEquipmentByService] = useState<Record<number, EquipmentRequirement[]>>({});
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [servicePrices, setServicePrices] = useState<Record<number, string>>({});
  const [serviceDurations, setServiceDurations] = useState<Record<number, string>>({});
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [addingAvailability, setAddingAvailability] = useState(false);
  const [uploadingVerification, setUploadingVerification] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const [profileResult, availabilityResult, catalogResult, offeredResult, equipmentResult] = await Promise.all([
      supabase.from('pro_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('pro_availability').select('id, pro_id, weekday, start_time, end_time').eq('pro_id', userId).order('weekday'),
      supabase.from('service_types').select('id, code, name, description, active, category_id, service_categories(name)').eq('active', true).order('name'),
      supabase.from('pro_services').select('service_type_id, base_price_dop, est_minutes').eq('pro_id', userId).eq('active', true),
      supabase.from('service_equipment_requirements').select('id, service_type_id, item_name, details, required, sort_order').eq('active', true).order('sort_order'),
    ]);
    if (profileResult.error || availabilityResult.error || catalogResult.error || offeredResult.error || equipmentResult.error) {
      setError(
        profileResult.error?.message ?? availabilityResult.error?.message ?? catalogResult.error?.message ?? offeredResult.error?.message ?? equipmentResult.error?.message ?? 'No pudimos cargar tu perfil.',
      );
      setLoading(false);
      return;
    }
    const savedProfile = profileResult.data as ProProfile;
    const registrationDraft = getRegistrationDraft(session?.user.user_metadata?.pro_onboarding);
    setProProfile(savedProfile);
    setPhone(typeof session?.user.user_metadata?.phone === 'string' ? session.user.user_metadata.phone : '');
    setBio(savedProfile.bio ?? registrationDraft?.bio ?? '');
    setYears(savedProfile.years_experience?.toString() ?? registrationDraft?.years_experience?.toString() ?? '');
    setTransportType(savedProfile.transport_type ?? registrationDraft?.transport_type ?? '');
    setCoverageCenter(
      typeof savedProfile.service_area_latitude === 'number' && typeof savedProfile.service_area_longitude === 'number'
        ? { latitude: savedProfile.service_area_latitude, longitude: savedProfile.service_area_longitude }
        : registrationDraft?.coverage
          ? { latitude: registrationDraft.coverage.latitude, longitude: registrationDraft.coverage.longitude }
          : null,
    );
    setCoverageRadiusKm(
      typeof savedProfile.service_area_radius_m === 'number'
        ? savedProfile.service_area_radius_m / 1000
        : registrationDraft?.coverage?.radius_km ?? 10,
    );
    const savedAvailability = (availabilityResult.data ?? []) as ProAvailability[];
    setAvailability(savedAvailability.length
      ? savedAvailability
      : (registrationDraft?.availability ?? []).map((slot) => ({
          ...slot,
          id: -slot.weekday,
          pro_id: userId,
        })));
    const services = (catalogResult.data ?? []) as ServiceType[];
    const offered = (offeredResult.data ?? []) as ProfessionalService[];
    const configuredServices = offered.length ? offered : registrationDraft?.services ?? [];
    setCatalog(services);
    const equipment = (equipmentResult.data ?? []) as EquipmentRequirement[];
    setEquipmentByService(Object.fromEntries(services.map((service) => [service.id, equipment.filter((item) => item.service_type_id === service.id)])));
    setSelectedServices(configuredServices.map((service) => service.service_type_id));
    setServicePrices(Object.fromEntries(configuredServices.map((service) => [service.service_type_id, String(service.base_price_dop)])));
    setServiceDurations(Object.fromEntries(configuredServices.map((service) => [service.service_type_id, String(service.est_minutes)])));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void Promise.resolve().then(loadProfile);
  }, [loadProfile]);

  async function confirmEquipmentPolicy() {
    if (!userId || !proProfile || proProfile.equipment_policy_accepted_at) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const { data, error: policyError } = await supabase.rpc('confirm_pro_equipment_policy');
    if (policyError) {
      setError(policyError.message);
    } else {
      setProProfile({ ...proProfile, equipment_policy_accepted_at: data as string });
      setNotice('Compromiso de equipamiento confirmado. Ya puedes recibir solicitudes si cumples los demás requisitos.');
    }
    setSaving(false);
  }

  async function uploadVerificationDocument() {
    if (!userId || !proProfile) return;
    setError(null);
    setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const document = result.assets[0];
      if (!document) throw new Error('No se seleccionó ningún documento.');
      if (document.size !== undefined && document.size > 10 * 1024 * 1024) {
        throw new Error('El archivo no puede superar los 10 MB.');
      }
      const contentType = document.mimeType;
      if (!contentType || !['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) {
        throw new Error('Selecciona un documento PDF, JPG o PNG.');
      }

      setUploadingVerification(true);
      const response = await fetch(document.uri);
      if (!response.ok) throw new Error('No pudimos leer el archivo seleccionado.');
      const file = await response.blob();
      const safeName = document.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'document';
      const objectPath = `${userId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('pro-verification-documents')
        .upload(objectPath, file, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { error: submitError } = await supabase.rpc('submit_pro_verification_document', {
        p_object_path: objectPath,
      });
      if (submitError) {
        const { error: cleanupError } = await supabase.storage
          .from('pro-verification-documents')
          .remove([objectPath]);
        if (cleanupError) {
          throw new Error(`${submitError.message}. Además, no pudimos limpiar el archivo cargado: ${cleanupError.message}`);
        }
        throw submitError;
      }

      setNotice('Documento enviado. El equipo de Klipp revisará tu perfil.');
      await loadProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos enviar tu documento de verificación.');
    } finally {
      setUploadingVerification(false);
    }
  }

  async function saveProfile() {
    if (!userId || !proProfile) return;
    const parsedYears = years.trim() ? Number(years) : null;
    if (parsedYears !== null && (!Number.isInteger(parsedYears) || parsedYears < 0)) {
      setError('Los años de experiencia deben ser un número entero igual o mayor que cero.');
      return;
    }

    const invalidService = selectedServices.find((serviceId) => {
      const price = Number(servicePrices[serviceId]);
      const duration = Number(serviceDurations[serviceId]);
      return !Number.isFinite(price) || price <= 0 || !Number.isInteger(duration) || duration <= 0;
    });
    if (invalidService !== undefined) {
      setError('Cada servicio elegido necesita un precio mayor que cero y una duración válida en minutos.');
      return;
    }
    if (selectedServices.length > 0 && !coverageCenter) {
      setError('Define el centro y el radio de tu área de trabajo antes de publicar tus servicios.');
      return;
    }
    if (!Number.isInteger(coverageRadiusKm) || coverageRadiusKm < 1 || coverageRadiusKm > 100) {
      setError('El radio de cobertura debe estar entre 1 y 100 kilómetros.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: updateError } = await supabase
      .from('pro_profiles')
      .update({ bio: bio.trim() || null, years_experience: parsedYears, transport_type: transportType.trim() || null })
      .eq('user_id', userId);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    if (phone.trim()) {
      const { error: phoneError } = await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', userId);
      if (phoneError) {
        setError(`El perfil se guardó, pero no se pudo guardar el teléfono: ${phoneError.message}`);
        setSaving(false);
        return;
      }
    }

    if (coverageCenter) {
      const { error: areaError } = await supabase.rpc('save_pro_service_area', {
        p_latitude: coverageCenter.latitude,
        p_longitude: coverageCenter.longitude,
        p_radius_m: coverageRadiusKm * 1000,
      });
      if (areaError) {
        setError(`El perfil se guardó, pero no se pudo guardar el área de trabajo: ${areaError.message}`);
        setSaving(false);
        return;
      }
    }
    {
      const offeredResult = await supabase.from('pro_services').select('id, service_type_id').eq('pro_id', userId);
      if (offeredResult.error) {
        setError(`El perfil se guardó, pero no se pudieron consultar tus servicios: ${offeredResult.error.message}`);
        setSaving(false);
        return;
      }
      const offeredRows = (offeredResult.data ?? []) as { id: string; service_type_id: number }[];
      const selectedIds = new Set(selectedServices);
      const toRemove = offeredRows.filter((service) => !selectedIds.has(service.service_type_id)).map((service) => service.id);
      if (toRemove.length) {
        const { error: removeServicesError } = await supabase.from('pro_services').update({ active: false }).eq('pro_id', userId).in('id', toRemove);
        if (removeServicesError) {
          setError(`El perfil se guardó, pero no se pudieron desactivar servicios: ${removeServicesError.message}`);
          setSaving(false);
          return;
        }
      }
      if (selectedServices.length) {
        const { error: serviceError } = await supabase.from('pro_services').upsert(
          selectedServices.map((service_type_id) => ({
            pro_id: userId,
            service_type_id,
            base_price_dop: Number(servicePrices[service_type_id]),
            est_minutes: Number(serviceDurations[service_type_id]),
            active: true,
          })),
          { onConflict: 'pro_id,service_type_id' },
        );
        if (serviceError) {
          setError(`El perfil se guardó, pero no se pudieron guardar tus servicios: ${serviceError.message}`);
          setSaving(false);
          return;
        }
      }
      const draftAvailability = availability.filter((slot) => slot.id < 0);
      if (draftAvailability.length) {
        const { error: availabilityError } = await supabase.from('pro_availability').insert(
          draftAvailability.map(({ weekday: day, start_time, end_time }) => ({
            pro_id: userId,
            weekday: day,
            start_time,
            end_time,
          })),
        );
        if (availabilityError) {
          setError(`El perfil se guardó, pero no se pudieron guardar los horarios iniciales: ${availabilityError.message}`);
          setSaving(false);
          return;
        }
        setAvailability((current) => current.filter((slot) => slot.id >= 0));
      }
      setNotice('Perfil, área de trabajo y servicios actualizados.');
    }
    setProProfile({
      ...proProfile,
      bio: bio.trim() || null,
      years_experience: parsedYears,
      transport_type: transportType.trim() || null,
      service_area_latitude: coverageCenter?.latitude ?? null,
      service_area_longitude: coverageCenter?.longitude ?? null,
      service_area_radius_m: coverageCenter ? coverageRadiusKm * 1000 : null,
    });
    setSaving(false);
  }

  async function setCoverageFromCurrentLocation() {
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Permite el acceso a la ubicación para establecer el centro de tu área de trabajo.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoverageCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación actual.');
    }
  }

  function toggleService(serviceId: number) {
    setSelectedServices((current) => {
      if (current.includes(serviceId)) return current.filter((id) => id !== serviceId);
      setServicePrices((prices) => ({ ...prices, [serviceId]: prices[serviceId] ?? '' }));
      setServiceDurations((durations) => ({ ...durations, [serviceId]: durations[serviceId] ?? '60' }));
      return [...current, serviceId];
    });
  }

  async function addAvailability() {
    if (!userId) return;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
      setError('Usa horas válidas en formato HH:MM y asegúrate de que el fin sea posterior al inicio.');
      return;
    }
    setAddingAvailability(true);
    setError(null);
    const { error: addError } = await supabase.from('pro_availability').insert({
      pro_id: userId,
      weekday,
      start_time: startTime,
      end_time: endTime,
    });
    if (addError) setError(addError.message);
    else await loadProfile();
    setAddingAvailability(false);
  }

  async function removeAvailability(id: number) {
    if (!userId) return;
    setError(null);
    const { error: removeError } = await supabase.from('pro_availability').delete().eq('id', id).eq('pro_id', userId);
    if (removeError) setError(removeError.message);
    else setAvailability((current) => current.filter((slot) => slot.id !== id));
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cerrar tu sesión. Inténtalo de nuevo.');
      setSigningOut(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando perfil...</Text></View>;
  }

  if (!proProfile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.sectionTitle}>No pudimos cargar tu perfil</Text>
        <Text style={styles.body}>{error ?? 'Intenta de nuevo.'}</Text>
        <ActionButton label="Reintentar" onPress={() => void loadProfile()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <BrandScreenHeader eyebrow="ESPACIO PROFESIONAL" title="Mi perfil" subtitle="Mantén al día tu experiencia y disponibilidad." />
      <View style={[styles.statusBanner, proProfile.verification_status === 'approved' && styles.statusApproved]}>
        <Text style={styles.statusTitle}>{verificationLabel(proProfile.verification_status)}</Text>
        {proProfile.verification_status !== 'approved' && (
          <Text style={styles.body}>Debes completar la verificación antes de recibir solicitudes.</Text>
        )}
        {proProfile.verification_note && <Text style={styles.body}>Nota del equipo: {proProfile.verification_note}</Text>}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={signingOut}
        onPress={() => void handleSignOut()}
        style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed, signingOut && styles.buttonDisabled]}>
        <Text style={styles.signOutText}>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</Text>
      </Pressable>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

      <Section title="Herramientas y materiales propios">
        <Text style={styles.body}>
          Klipp exige que acudas con tus propias herramientas, equipos, productos y materiales necesarios para completar cada servicio. No debes depender de herramientas, productos, utensilios ni equipos del cliente. Antes de aceptar cada solicitud, comprueba que llevas todo lo necesario.
        </Text>
        {proProfile.equipment_policy_accepted_at ? (
          <Text style={styles.success}>Compromiso confirmado. Recuerda que debes llevar el equipamiento necesario para cada trabajo.</Text>
        ) : (
          <>
            <Text style={styles.warning}>
              Todavía no has confirmado esta política. No podrás aceptar reservas hasta hacerlo.
            </Text>
            <ActionButton
              disabled={saving}
              label={saving ? 'Guardando confirmación...' : 'Confirmo que llevaré mis propias herramientas'}
              onPress={() => void confirmEquipmentPolicy()}
            />
          </>
        )}
      </Section>

      <Section title="Verificación de identidad">
        <Text style={styles.body}>Sube una imagen JPG/PNG o un PDF de tu documento de identidad. El archivo es privado y solo tú y el equipo autorizado pueden verlo. Máximo 10 MB.</Text>
        {proProfile.id_document_path && <Text style={styles.success}>Ya enviaste un documento para revisión.</Text>}
        <ActionButton
          disabled={uploadingVerification}
          label={uploadingVerification ? 'Enviando documento...' : proProfile.id_document_path ? 'Reemplazar documento' : 'Subir documento'}
          onPress={() => void uploadVerificationDocument()}
        />
      </Section>

      <Section title="Sobre ti">
        <Text style={styles.label}>Teléfono de contacto</Text>
        <TextInput autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhone} placeholder="809 555 0123" style={styles.input} value={phone} />
        <Text style={styles.label}>Biografía</Text>
        <TextInput multiline onChangeText={setBio} placeholder="Cuéntales a tus clientes sobre tu experiencia" style={[styles.input, styles.multiline]} value={bio} />
        <Text style={styles.label}>Años de experiencia</Text>
        <TextInput keyboardType="number-pad" onChangeText={setYears} placeholder="Ej. 5" style={styles.input} value={years} />
        <Text style={styles.label}>Tipo de transporte</Text>
        <TextInput maxLength={50} onChangeText={setTransportType} placeholder="Ej. Motor, automóvil o transporte público" style={styles.input} value={transportType} />
        <Text style={styles.label}>Área de trabajo</Text>
        <Text style={styles.body}>Elige el centro de tu zona y hasta dónde puedes desplazarte. Los clientes verán tu perfil cuando estén dentro de esta cobertura.</Text>
        <Pressable accessibilityRole="button" onPress={() => void setCoverageFromCurrentLocation()} style={styles.locationButton}>
          <Text style={styles.locationButtonText}>Usar mi ubicación actual</Text>
        </Pressable>
        {coverageCenter ? (
          <>
            <CoverageRadiusPicker center={coverageCenter} onChange={setCoverageCenter} radiusMeters={coverageRadiusKm * 1000} />
            <Text style={styles.label}>Radio de cobertura</Text>
            <View style={styles.choiceList}>
              {serviceRadiiKm.map((radius) => (
                <Choice
                  key={radius}
                  selected={coverageRadiusKm === radius}
                  label={`${radius} km`}
                  onPress={() => setCoverageRadiusKm(radius)}
                />
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.empty}>Aún no has configurado el centro de tu área de trabajo.</Text>
        )}
      </Section>

      <Section title="Servicios y tarifas">
        <Text style={styles.body}>Elige las especialidades que ofreces y define tu precio base en pesos dominicanos.</Text>
        {catalog.map((service) => {
          const selected = selectedServices.includes(service.id);
          const requirements = equipmentByService[service.id] ?? [];
          const category = (service as ServiceType & { service_categories?: { name: string } | null }).service_categories?.name;
          return (
            <View key={service.id} style={styles.serviceEditor}>
              <Choice selected={selected} label={`${service.name}${category ? ` · ${category}` : ''}`} onPress={() => toggleService(service.id)} />
              {selected && requirements.length > 0 && (
                <View style={styles.serviceRequirements}>
                  <Text style={styles.requirementsTitle}>Equipamiento que debes llevar:</Text>
                  {requirements.map((item) => (
                    <View key={item.id} style={styles.requirementRow}>
                      <Text style={styles.requirementBullet}>✓</Text>
                      <View style={styles.requirementCopy}>
                        <Text style={styles.requirementName}>{item.item_name}</Text>
                        {!!item.details && <Text style={styles.requirementDetails}>{item.details}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {selected && (
                <View style={styles.serviceFields}>
                  <View style={styles.priceField}>
                    <Text style={styles.label}>Precio base (RD$)</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={(value) => setServicePrices((current) => ({ ...current, [service.id]: value }))}
                      placeholder="1500"
                      style={styles.input}
                      value={servicePrices[service.id] ?? ''}
                    />
                  </View>
                  <View style={styles.durationField}>
                    <Text style={styles.label}>Duración (min)</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => setServiceDurations((current) => ({ ...current, [service.id]: value }))}
                      placeholder="60"
                      style={styles.input}
                      value={serviceDurations[service.id] ?? ''}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </Section>

      <Section title="Disponibilidad semanal">
        <Text style={styles.body}>Indica los horarios en que puedes recibir servicios.</Text>
        <View style={styles.weekdays}>
          {weekdayLabels.map((label, index) => (
            <Choice key={label} selected={weekday === index + 1} label={label} onPress={() => setWeekday(index + 1)} />
          ))}
        </View>
        <View style={styles.timeRow}>
          <View style={styles.timeField}><Text style={styles.label}>Desde</Text><TextInput keyboardType="numbers-and-punctuation" onChangeText={setStartTime} style={styles.input} value={startTime} /></View>
          <View style={styles.timeField}><Text style={styles.label}>Hasta</Text><TextInput keyboardType="numbers-and-punctuation" onChangeText={setEndTime} style={styles.input} value={endTime} /></View>
        </View>
        <ActionButton disabled={addingAvailability} label={addingAvailability ? 'Añadiendo...' : 'Añadir horario'} onPress={() => void addAvailability()} />
        {availability.length === 0 ? (
          <Text style={styles.empty}>Todavía no has añadido horarios.</Text>
        ) : (
          availability.map((slot) => (
            <View key={slot.id} style={styles.slotRow}>
              <Text style={styles.slotText}>{weekdayLabels[slot.weekday - 1]} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void removeAvailability(slot.id)} style={styles.removeButton}>
                <Text style={styles.removeText}>Eliminar</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityRole="status" style={styles.success}>{notice}</Text>}
      <ActionButton disabled={saving} label={saving ? 'Guardando...' : 'Guardar perfil'} onPress={() => void saveProfile()} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.buttonDisabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 40, gap: 16, backgroundColor: KlippColors.canvas },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: KlippColors.navy, fontSize: 27, fontWeight: '700' },
  section: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, gap: 11, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 2 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700' },
  statusBanner: { padding: 16, borderRadius: 8, backgroundColor: KlippColors.goldLight, gap: 5 },
  signOutButton: { minHeight: 46, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, backgroundColor: '#FFF7F7' },
  signOutPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  signOutText: { color: KlippColors.danger, fontSize: 14, fontWeight: '700' },
  statusApproved: { backgroundColor: '#E6F8F0' },
  statusTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 7, paddingHorizontal: 12, color: KlippColors.navy, backgroundColor: KlippColors.white, fontSize: 15 },
  multiline: { minHeight: 92, paddingVertical: 10, textAlignVertical: 'top' },
  choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FF' },
  locationButtonText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  choice: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  choiceSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  choiceText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: KlippColors.blueDark },
  serviceRequirements: { paddingHorizontal: 10, gap: 6 },
  requirementsTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  requirementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  requirementBullet: { color: '#047857', fontSize: 13, fontWeight: '800' },
  requirementCopy: { flex: 1, gap: 1 },
  requirementName: { color: KlippColors.slate, fontSize: 11, fontWeight: '700' },
  requirementDetails: { color: KlippColors.muted, fontSize: 10, lineHeight: 14 },
  serviceEditor: { gap: 9 },
  serviceFields: { flexDirection: 'row', gap: 12, paddingHorizontal: 5 },
  priceField: { flex: 1 },
  durationField: { flex: 1 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 6 },
  actionButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.blue },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.55 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e7eeea' },
  slotText: { color: '#263b34', fontSize: 14 },
  removeButton: { padding: 8 },
  removeText: { color: '#a32f27', fontSize: 13, fontWeight: '600' },
  empty: { color: '#68756f', fontSize: 14, paddingVertical: 6 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: '#067647', fontSize: 14, lineHeight: 20 },
  warning: { color: '#8A5B00', fontSize: 13, lineHeight: 19, padding: 11, borderRadius: 6, backgroundColor: KlippColors.goldLight },
});