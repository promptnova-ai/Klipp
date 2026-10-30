import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { LocationPicker } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatDop } from '@/lib/format';
import type { ProCard, PricingTier, Review, ServiceType } from '@/lib/types';

type BookingCoordinate = { latitude: number; longitude: number };
type ServiceOffer = {
  id: string;
  pro_id: string;
  service_type_id: number;
  base_price_dop: number;
  est_minutes: number;
  pro_name: string | null;
  avatar_url: string | null;
  rating_avg: number;
  rating_count: number;
  bio: string | null;
  years_experience?: number | null;
  jobs_completed?: number;
  distance_m?: number;
};
type BookingDateOption = { key: string; weekday: string; day: string; month: string };

function getBusinessDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function getDateOptions(): BookingDateOption[] {
  const today = new Date(`${getBusinessDateKey(new Date())}T12:00:00.000Z`);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      weekday: new Intl.DateTimeFormat('es-DO', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', ''),
      day: new Intl.DateTimeFormat('es-DO', { day: '2-digit', timeZone: 'UTC' }).format(date),
      month: new Intl.DateTimeFormat('es-DO', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', ''),
    };
  });
}

function formatSlotTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

export function NewBookingScreen() {
  const router = useRouter();
  const { serviceId: serviceIdParam, tierId: tierIdParam, offerId: offerIdParam } = useLocalSearchParams<{ serviceId?: string; tierId?: string; offerId?: string }>();
  const { session } = useAuth();
  const [services, setServices] = useState<ServiceType[]>([]);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [coordinate, setCoordinate] = useState<BookingCoordinate | null>(null);
  const [addressText, setAddressText] = useState('');
  const [landmarkNotes, setLandmarkNotes] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState(() => getDateOptions()[0]?.key ?? '');
  const [scheduledTime, setScheduledTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [pros, setPros] = useState<ProCard[]>([]);
  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [expandedProId, setExpandedProId] = useState<string | null>(null);
  const [proReviews, setProReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPros, setLoadingPros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dateOptions = useMemo(() => getDateOptions(), []);
  const slotOptions = useMemo(
    () => Array.from({ length: 21 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`),
    [],
  );
  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;
  const getScheduledStart = useCallback(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) return null;
    const value = new Date(`${scheduledDate}T${scheduledTime}:00-04:00`);
    return Number.isNaN(value.getTime()) || value.getTime() <= Date.now() ? null : value.toISOString();
  }, [scheduledDate, scheduledTime]);

  const resetAppointmentSelection = useCallback(() => {
    setError(null);
    setAvailableSlots([]);
    setScheduledTime('');
    setLoadingSlots(false);
    setPros([]);
    setSelectedProId(null);
    setLoadingPros(false);
  }, []);

  const updateCoordinate = useCallback((nextCoordinate: BookingCoordinate) => {
    resetAppointmentSelection();
    setCoordinate(nextCoordinate);
  }, [resetAppointmentSelection]);

  const requestCurrentLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Necesitamos permiso de ubicación para mostrar tu punto de servicio.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateCoordinate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación actual.');
    } finally {
      setLocationLoading(false);
    }
  }, [updateCoordinate]);


  useEffect(() => {
    if (!coordinate) return;
    let active = true;
    void Location.reverseGeocodeAsync(coordinate)
      .then((places) => {
        if (!active) return;
        const place = places[0];
        if (!place) {
          setAddressText(`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`);
          return;
        }
        const street = [place.street, place.streetNumber].filter(Boolean).join(' ');
        setAddressText([street, place.district || place.subregion, place.city || place.region].filter(Boolean).join(', '));
      })
      .catch((cause: unknown) => {
        if (active) setLocationError(cause instanceof Error ? cause.message : 'No pudimos encontrar la dirección de este punto.');
      });
    return () => { active = false; };
  }, [coordinate]);

  useEffect(() => {
    async function loadOptions() {
      if (!session?.user.id) return;
      const [serviceResult, tierResult] = await Promise.all([
        supabase.from('service_types').select('id, code, name, description, active, category_id').eq('active', true).order('name'),
        supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('price_dop'),
      ]);
      const loadError = serviceResult.error ?? tierResult.error;
      if (loadError) setError(loadError.message);
      else {
        const serviceRows = (serviceResult.data ?? []) as ServiceType[];
        setServices(serviceRows);
        setServiceIds(serviceRows.map((service) => service.id));
        const tierRows = (tierResult.data ?? []) as PricingTier[];
        setTiers(tierRows);
        const requestedServiceId = Number(serviceIdParam);
        const initialServiceId = serviceRows.some((service) => service.id === requestedServiceId)
          ? requestedServiceId
          : serviceRows[0]?.id ?? null;
        const requestedTierId = Number(tierIdParam);
        const initialTier = tierRows.find((tier) => tier.id === requestedTierId && tier.service_type_id === initialServiceId);
        setSelectedServiceId(initialServiceId);
        setSelectedTierId(initialTier?.id ?? null);
        setSelectedOfferId(null);
      }
      setLoading(false);
    }
    void loadOptions();
  }, [session?.user.id, serviceIdParam, tierIdParam, offerIdParam]);

  useEffect(() => {
    if (!coordinate || serviceIds.length === 0) {
      return;
    }
    let active = true;
    void Promise.all(serviceIds.map((serviceId) => supabase.rpc('get_nearby_service_offers', {
      p_service_type_id: serviceId,
      p_latitude: coordinate.latitude,
      p_longitude: coordinate.longitude,
    }))).then((results) => {
      if (!active) return;
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setError(failed.error.message);
        setOffers([]);
        return;
      }
      const nearby = results.flatMap((result) => (result.data ?? []) as (ServiceOffer & {
        years_experience: number | null;
        jobs_completed: number;
        distance_m: number;
      })[]);
      setOffers(nearby);
      if (offerIdParam && nearby.some((offer) => offer.id === offerIdParam)) setSelectedOfferId(offerIdParam);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No pudimos buscar profesionales cercanos.');
    });
    return () => { active = false; };
  }, [coordinate, serviceIds, offerIdParam]);

  const visibleTiers = tiers.filter((tier) => tier.service_type_id === selectedServiceId);
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId) ?? visibleTiers[0] ?? null;
  const selectedDuration = selectedOffer?.est_minutes ?? selectedTier?.est_minutes;
  const selectedPrice = selectedOffer?.base_price_dop ?? selectedTier?.price_dop;

  useEffect(() => {
    if (!coordinate || (!selectedTier && !selectedOffer) || !scheduledDate) {
      return;
    }

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoadingSlots(true);
    });
    const result = selectedOffer
      ? supabase.rpc('get_available_service_slots', {
          p_pro_service_id: selectedOffer.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_date: scheduledDate,
        })
      : supabase.rpc('get_available_booking_slots_at_location', {
          p_pricing_tier_id: selectedTier?.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_date: scheduledDate,
          p_mode: mode,
        });
    void Promise.resolve(result)
      .then(({ data, error: slotsError }) => {
        if (!active) return;
        if (slotsError) {
          setError(slotsError.message);
          setAvailableSlots([]);
        } else {
          setAvailableSlots(((data ?? []) as { slot_time: string }[]).map((slot) => slot.slot_time.slice(0, 5)));
        }
        setLoadingSlots(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'No pudimos consultar los horarios disponibles.');
        setAvailableSlots([]);
        setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [coordinate, selectedTier, selectedOffer, scheduledDate, mode]);

  useEffect(() => {
    if (!coordinate || !scheduledTime || !selectedDuration) return;
    const currentCoordinate = coordinate;
    let active = true;
    async function loadPros() {
      setLoadingPros(true);
      setError(null);
      if (selectedOffer) {
        if (active) {
          setPros([{
            pro_id: selectedOffer.pro_id,
            full_name: selectedOffer.pro_name,
            avatar_url: selectedOffer.avatar_url,
            bio: selectedOffer.bio,
            years_experience: selectedOffer.years_experience ?? null,
            base_sector_id: null,
            rating_avg: selectedOffer.rating_avg,
            rating_count: selectedOffer.rating_count,
            jobs_completed: selectedOffer.jobs_completed ?? 0,
          }]);
          setSelectedProId(selectedOffer.pro_id);
        }
      } else if (mode === 'manual') {
        const scheduledStart = getScheduledStart();
        if (!scheduledStart) {
          setPros([]);
          setSelectedProId(null);
        } else {
          const { data, error: prosError } = await supabase.rpc('get_available_pros_at_location', {
            p_lat: currentCoordinate.latitude,
            p_lng: currentCoordinate.longitude,
            p_scheduled_start: scheduledStart,
            p_est_minutes: selectedDuration,
            p_service_type_id: selectedTier?.service_type_id,
          });
          if (active && prosError) setError(prosError.message);
          else if (active) {
            setPros((data ?? []) as ProCard[]);
            setSelectedProId(null);
          }
        }
      } else {
        setPros([]);
        setSelectedProId(null);
      }
      if (active) setLoadingPros(false);
    }
    void loadPros();
    return () => { active = false; };
  }, [coordinate, scheduledDate, scheduledTime, selectedDuration, selectedOffer, selectedTier?.service_type_id, mode, getScheduledStart]);

  async function showProProfile(pro: ProCard) {
    setExpandedProId((current) => current === pro.pro_id ? null : pro.pro_id);
    setSelectedProId(pro.pro_id);
    const { data, error: reviewError } = await supabase
      .from('reviews')
      .select('id, booking_id, client_id, pro_id, rating, comment, created_at')
      .eq('pro_id', pro.pro_id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (reviewError) setError(reviewError.message);
    else setProReviews((data ?? []) as Review[]);
  }

  async function createBooking() {
    if ((!selectedTier && !selectedOffer) || !coordinate || !session?.user.id) {
      setError('Selecciona el servicio y permite confirmar tu ubicación.');
      return;
    }
    const scheduledStart = getScheduledStart();
    if (!scheduledStart) {
      setError('Elige una fecha y hora futura válidas.');
      return;
    }
    if (!selectedOffer && mode === 'manual' && !selectedProId) {
      setError('Selecciona un profesional disponible para continuar.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { data: bookingId, error: rpcError } = selectedOffer
      ? await supabase.rpc('create_booking_at_location', {
          p_pro_service_id: selectedOffer.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
        })
      : await supabase.rpc('create_tier_booking_at_location', {
          p_pricing_tier_id: selectedTier!.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
          p_mode: mode,
          p_pro_id: mode === 'manual' ? selectedProId : null,
        });
    if (rpcError) setError(rpcError.message);
    else if (typeof bookingId !== 'string') setError('La reserva no devolvió un identificador válido.');
    else {
      if (!selectedOffer && mode === 'auto') {
        const { error: assignmentError } = await supabase.functions.invoke('auto-assign-booking', {
          body: { bookingId },
        });
        if (assignmentError) {
          setError('La reserva se creó, pero no pudimos iniciar la búsqueda automática. Puedes verla en Mis reservas.');
          setSuccess('Solicitud creada.');
        } else {
          setSuccess('Buscando profesional. Sigue el estado en Mis reservas.');
        }
      } else {
        setSuccess('Solicitud enviada al profesional. Te avisaremos cuando responda.');
      }
    }
    setSaving(false);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando opciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹  Volver</Text></Pressable>
      <BrandScreenHeader eyebrow="RESERVAS" title="Nueva reserva" subtitle="Elige servicio, horario y profesional." />
      {success && <View style={styles.successBanner}><Text style={styles.successTitle}>{success}</Text><Pressable onPress={() => router.replace('/(client)/bookings')} style={({ pressed }) => pressed && styles.pressed}><Text style={styles.successLink}>Ver mis reservas</Text></Pressable></View>}
      {services.length === 0 && <Text style={styles.empty}>No hay servicios disponibles ahora mismo.</Text>}

      <Section title="1. Servicio">
        {services.map((service) => <Choice key={service.id} selected={selectedServiceId === service.id} label={service.name} onPress={() => { resetAppointmentSelection(); setSelectedServiceId(service.id); setSelectedTierId(null); setSelectedOfferId(null); }} />)}
      </Section>
      {visibleTiers.length > 0 && <Section title="2. Tamaño / modalidad">
        {visibleTiers.map((tier) => (
          <Choice key={tier.id} selected={(selectedTier?.id ?? null) === tier.id} label={tier.label} secondary={formatDop(tier.price_dop)} onPress={() => { resetAppointmentSelection(); setSelectedTierId(tier.id); }} />
        ))}
      </Section>}
      {visibleTiers.length === 0 && <Section title="2. Servicio y profesional">
        {offers.filter((offer) => offer.service_type_id === selectedServiceId).length === 0
          ? <Text style={styles.body}>Aún no hay profesionales con este servicio disponible.</Text>
          : offers.filter((offer) => offer.service_type_id === selectedServiceId).map((offer) => (
            <Choice
              key={offer.id}
              selected={selectedOfferId === offer.id}
              label={offer.pro_name ?? 'Profesional Klipp'}
              secondary={`${formatDop(offer.base_price_dop)} · ${offer.est_minutes} min`}
              onPress={() => { resetAppointmentSelection(); setSelectedOfferId(offer.id); setMode('manual'); }}
            />
          ))}
      </Section>}
      <Section title="3. Ubicación del servicio">
        {locationLoading ? (
          <View style={styles.slotsLoading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.body}>Obteniendo tu ubicación...</Text></View>
        ) : coordinate ? (
          <>
            <LocationPicker coordinate={coordinate} onChange={updateCoordinate} />
            <Text style={styles.label}>Dirección aproximada</Text>
            <TextInput
              accessibilityLabel="Dirección aproximada"
              onChangeText={setAddressText}
              placeholder="Calle, barrio y ciudad"
              placeholderTextColor={KlippColors.muted}
              style={styles.addressInput}
              value={addressText}
            />
            <Pressable accessibilityRole="button" onPress={() => void requestCurrentLocation()} style={({ pressed }) => [styles.adjustLocation, pressed && styles.pressed]}>
              <Text style={styles.adjustLocationText}>Actualizar a mi ubicación actual</Text>
            </Pressable>
            <Text style={styles.label}>Indicaciones / Punto de referencia</Text>
            <TextInput
              accessibilityLabel="Indicaciones / Punto de referencia"
              multiline
              onChangeText={setLandmarkNotes}
              placeholder="Apto 4B, frente al colmado, portón blanco"
              placeholderTextColor={KlippColors.muted}
              style={styles.notesInput}
              value={landmarkNotes}
            />
          </>
        ) : (
          <View style={styles.locationIntro}>
            <Text style={styles.locationIntroTitle}>Indica dónde necesitas el servicio</Text>
            <Text style={styles.body}>Usaremos tu ubicación solo para localizar profesionales disponibles en tu zona. No se comparte hasta que continúes con la reserva.</Text>
            <Pressable accessibilityRole="button" onPress={() => void requestCurrentLocation()} style={({ pressed }) => [styles.retryLocation, pressed && styles.pressed]}>
              <Text style={styles.adjustLocationText}>Usar mi ubicación actual</Text>
            </Pressable>
          </View>
        )}
        {locationError && <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text>}
      </Section>
      <Section title="4. Fecha y hora">
        <Text style={styles.label}>Elige el día</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
          {dateOptions.map((option) => {
            const selected = scheduledDate === option.key;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option.key}
                onPress={() => { resetAppointmentSelection(); setScheduledDate(option.key); }}
                style={({ pressed }) => [styles.dateOption, selected && styles.dateOptionSelected, pressed && styles.choicePressed]}>
                <Text style={[styles.dateWeekday, selected && styles.dateTextSelected]}>{option.weekday}</Text>
                <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{option.day}</Text>
                <Text style={[styles.dateMonth, selected && styles.dateTextSelected]}>{option.month}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.slotHeading}>
          <Text style={styles.label}>Horarios disponibles</Text>
          {scheduledDate && !loadingSlots && availableSlots.length > 0 && <Text style={styles.slotCount}>{availableSlots.length} horarios</Text>}
        </View>
        {!coordinate || (!selectedTier && !selectedOffer) || !scheduledDate ? (
          <Text style={styles.body}>Selecciona un servicio, ubicación y día para consultar horarios disponibles.</Text>
        ) : loadingSlots ? (
          <View style={styles.slotsLoading}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.body}>Buscando horarios disponibles...</Text></View>
        ) : availableSlots.length === 0 ? (
          <View style={styles.noSlots}><Text style={styles.noSlotsTitle}>No hay horarios disponibles</Text><Text style={styles.body}>Prueba otro día o ajusta el punto del mapa.</Text></View>
        ) : (
          <View style={styles.slotGrid}>
            {slotOptions.map((slot) => {
              const available = availableSlots.includes(slot);
              const selected = scheduledTime === slot;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ disabled: !available, selected }}
                  disabled={!available}
                  key={slot}
                  onPress={() => setScheduledTime(slot)}
                  style={({ pressed }) => [styles.slotOption, selected && styles.slotOptionSelected, !available && styles.slotUnavailable, pressed && available && styles.choicePressed]}>
                  <Text style={[styles.slotText, selected && styles.slotTextSelected, !available && styles.slotTextUnavailable]}>{formatSlotTime(slot)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Section>
      <Section title="5. Profesional">
        {!selectedOffer && <View style={styles.modeOptions}>
          <ModeOption label="Elegir profesional" selected={mode === 'manual'} onPress={() => { resetAppointmentSelection(); setMode('manual'); }} />
          <ModeOption label="Asignar automáticamente" selected={mode === 'auto'} onPress={() => { resetAppointmentSelection(); setMode('auto'); }} />
        </View>}
        {selectedOffer && <Text style={styles.body}>Has seleccionado a {selectedOffer.pro_name ?? 'un profesional'} para este servicio.</Text>}
        {!coordinate && <Text style={styles.body}>Comparte tu ubicación para validar la cobertura.</Text>}
        {!selectedOffer && mode === 'manual' && coordinate && (!scheduledTime || !selectedDuration) && <Text style={styles.body}>Elige fecha y horario para ver profesionales disponibles en tu zona.</Text>}
        {!selectedOffer && mode === 'manual' && coordinate && loadingPros && <ActivityIndicator color="#16766c" />}
        {!selectedOffer && mode === 'manual' && coordinate && scheduledTime && !loadingPros && pros.length === 0 && <Text style={styles.body}>No hay profesionales verificados disponibles en esta zona y horario.</Text>}
        {!selectedOffer && mode === 'manual' && pros.map((pro) => (
          <View key={pro.pro_id} style={[styles.proCard, selectedProId === pro.pro_id && styles.proCardSelected]}>
            <Pressable onPress={() => void showProProfile(pro)} style={({ pressed }) => [styles.proSummary, pressed && styles.choicePressed]}>
              {pro.avatar_url ? <Image source={{ uri: pro.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{pro.full_name?.[0] ?? 'K'}</Text></View>}
              <View style={styles.proMain}>
                <Text style={styles.proName}>{pro.full_name ?? 'Profesional Klipp'}</Text>
                <Text style={styles.body}>{pro.years_experience ?? 0} años de experiencia</Text>
                <Text style={styles.rating}>★ {Number(pro.rating_avg).toFixed(1)} · {pro.rating_count} reseñas</Text>
              </View>
              <Text style={styles.profileLink}>{expandedProId === pro.pro_id ? 'Cerrar' : 'Ver perfil'}</Text>
            </Pressable>
            {expandedProId === pro.pro_id && (
              <View style={styles.profileDetails}>
                <Text style={styles.body}>{pro.bio || 'Este profesional aún no ha añadido una biografía.'}</Text>
                <Text style={styles.reviewHeading}>Reseñas recientes</Text>
                {proReviews.length === 0 ? <Text style={styles.body}>Todavía no hay reseñas.</Text> : proReviews.map((review) => <Text key={review.id} style={styles.reviewText}>★ {review.rating} {review.comment || ''}</Text>)}
                <Pressable accessibilityRole="button" onPress={() => setSelectedProId(pro.pro_id)} style={({ pressed }) => [styles.selectPro, pressed && styles.choicePressed]}><Text style={styles.selectProText}>{selectedProId === pro.pro_id ? 'Profesional seleccionado' : 'Elegir este profesional'}</Text></Pressable>
              </View>
            )}
          </View>
        ))}
        {!selectedOffer && mode === 'auto' && <Text style={styles.body}>Buscaremos un profesional disponible para este servicio y horario en tu zona.</Text>}
      </Section>

      {(selectedTier || selectedOffer) && coordinate && scheduledDate && scheduledTime && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeading}>
            <View>
              <Text style={styles.totalLabel}>RESUMEN DE TU RESERVA</Text>
              <Text style={styles.summaryTitle}>{services.find((service) => service.id === selectedServiceId)?.name ?? 'Servicio'}</Text>
            </View>
            <View style={styles.summaryIcon}>
              <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#047857" size={18} />
            </View>
          </View>
          {selectedTier && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Tamaño</Text><Text style={styles.summaryValue}>{selectedTier.label}</Text></View>}
          {selectedOffer && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Duración</Text><Text style={styles.summaryValue}>{selectedOffer.est_minutes} min</Text></View>}
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Fecha y hora</Text><Text style={styles.summaryValue}>{scheduledDate} · {formatSlotTime(scheduledTime)}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Dirección</Text><Text numberOfLines={2} style={styles.summaryValue}>{addressText || 'Ubicación seleccionada'}</Text></View>
          {landmarkNotes.trim().length > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Referencia</Text><Text numberOfLines={2} style={styles.summaryValue}>{landmarkNotes}</Text></View>}
          {selectedOffer && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Profesional</Text><Text style={styles.summaryValue}>{selectedOffer.pro_name ?? 'Profesional seleccionado'}</Text></View>}
          {mode === 'manual' && selectedProId && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Profesional</Text><Text style={styles.summaryValue}>{pros.find((pro) => pro.pro_id === selectedProId)?.full_name ?? 'Profesional seleccionado'}</Text></View>}
          {mode === 'auto' && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Asignación</Text><Text style={styles.summaryValue}>Profesional disponible</Text></View>}
          <View style={styles.summaryDivider} />
          <View style={styles.priceRow}><Text style={styles.priceLabel}>Total del servicio</Text><Text style={styles.priceLine}>{formatDop(selectedPrice ?? 0)}</Text></View>
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={[styles.error, styles.horizontalMargin]}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving || !coordinate || locationLoading} onPress={() => void createBooking()} style={({ pressed }) => [styles.submit, (saving || !coordinate || locationLoading) && styles.disabled, pressed && !saving && styles.buttonPressed]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Solicitar servicio</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Choice({ selected, label, secondary, onPress }: { selected: boolean; label: string; secondary?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.choicePressed]}>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
        {secondary && <Text style={styles.choiceSecondary}>{secondary}</Text>}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
    </Pressable>
  );
}

function ModeOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.modeOption, selected && styles.choiceSelected, pressed && styles.choicePressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 40, gap: 24, backgroundColor: KlippColors.canvas },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  back: { alignSelf: 'flex-start', paddingVertical: 8, marginHorizontal: 20, marginTop: 8 },
  pressed: { opacity: 0.88 },
  backText: { color: KlippColors.blueDark, fontSize: 15, fontWeight: '700' },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '700' },
  section: { marginHorizontal: 20, padding: 18, borderRadius: 20, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 3 },
  sectionTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  addressInput: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, color: KlippColors.navy, fontSize: 14, backgroundColor: KlippColors.white },
  notesInput: { minHeight: 84, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, color: KlippColors.navy, fontSize: 14, textAlignVertical: 'top', backgroundColor: KlippColors.white },
  adjustLocation: { alignSelf: 'flex-start', paddingVertical: 7 },
  locationIntro: { gap: 10, padding: 15, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: KlippColors.border },
  locationIntroTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  retryLocation: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: '#F8FAFC' },
  adjustLocationText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 5 },
  dateList: { gap: 8, paddingVertical: 2 },
  dateOption: { width: 62, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 15, backgroundColor: KlippColors.white },
  dateOptionSelected: { borderColor: KlippColors.navy, backgroundColor: KlippColors.navy },
  dateWeekday: { color: KlippColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  dateDay: { color: KlippColors.navy, fontSize: 19, fontWeight: '700' },
  dateMonth: { color: KlippColors.muted, fontSize: 10, textTransform: 'capitalize' },
  dateTextSelected: { color: KlippColors.white },
  slotHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  slotCount: { color: '#047857', fontSize: 12, fontWeight: '700' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotOption: { width: '31%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: KlippColors.white },
  slotOptionSelected: { borderColor: KlippColors.blue, backgroundColor: '#EEF4FF' },
  slotUnavailable: { borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' },
  slotText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  slotTextSelected: { color: KlippColors.blueDark },
  slotTextUnavailable: { color: '#A8B2C0' },
  slotsLoading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  noSlots: { padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', gap: 4 },
  noSlotsTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  choice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.white },
  choiceSelected: { borderColor: '#B8CBFF', backgroundColor: '#F4F7FF' },
  choicePressed: { opacity: 0.9 },
  choiceCopy: { flex: 1, gap: 3 },
  choiceText: { color: KlippColors.slate, fontSize: 14, fontWeight: '600' },
  choiceTextSelected: { color: KlippColors.blueDark },
  choiceSecondary: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: KlippColors.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: KlippColors.blue },
  empty: { color: KlippColors.muted, fontSize: 14, padding: 16, marginHorizontal: 20, borderRadius: 16, backgroundColor: KlippColors.white },
  emptyInline: { gap: 6 },
  modeOptions: { flexDirection: 'row', gap: 9 },
  modeOption: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, backgroundColor: KlippColors.white },
  proCard: { padding: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white, gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 2 },
  proCardSelected: { borderColor: '#B8CBFF', backgroundColor: '#F8FAFF' },
  proSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EEF4FF' },
  avatarFallback: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FF' },
  avatarInitial: { color: KlippColors.blueDark, fontSize: 20, fontWeight: '700' },
  proMain: { flex: 1, gap: 2 },
  proName: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  rating: { color: '#946200', fontSize: 13, fontWeight: '700' },
  profileLink: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  profileDetails: { paddingTop: 12, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 9 },
  reviewHeading: { color: KlippColors.navy, fontSize: 13, fontWeight: '700', marginTop: 4 },
  reviewText: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  selectPro: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EEF4FF' },
  selectProText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  totalCard: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#EEF4FF' },
  totalLabel: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  totalHint: { color: KlippColors.muted, fontSize: 12, marginTop: 4 },
  priceLine: { color: KlippColors.blueDark, fontSize: 17, fontWeight: '800' },
  summaryCard: { marginHorizontal: 20, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 13, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 3 },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', marginTop: 4 },
  summaryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF5' },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { color: KlippColors.muted, fontSize: 12 },
  summaryValue: { flex: 1, color: KlippColors.slate, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: KlippColors.border },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  submit: { minHeight: 54, marginHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.blue, shadowColor: KlippColors.blue, shadowOpacity: 0.18, shadowOffset: { width: 0, height: 7 }, shadowRadius: 14, elevation: 3 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  horizontalMargin: { marginHorizontal: 20 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  successBanner: { padding: 16, marginHorizontal: 20, borderRadius: 16, backgroundColor: '#ECFDF5', gap: 7 },
  successTitle: { color: '#067647', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  successLink: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
});