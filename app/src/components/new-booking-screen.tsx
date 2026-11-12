import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { LocationPicker } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';
import { serviceArt } from '@/lib/service-art';
import { supabase } from '../../lib/supabase';
import { formatDop } from '@/lib/format';
import type { ProCard, PricingTier, Review, ServiceType } from '@/lib/types';

type BookingCoordinate = { latitude: number; longitude: number };
type PublicProService = { service_type_id: number; service_name: string; base_price_dop: number; est_minutes: number };
type PublicPortfolioPhoto = { id: string; object_path: string; caption: string | null };
type EquipmentRequirement = { id: number; service_type_id: number; item_name: string; details: string; required: boolean; sort_order: number };
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

function isAmbiguousBookingRpcError(error: { code?: string; status?: number }) {
  if (typeof error.status === 'number') return error.status >= 500;
  return !error.code || !/^[0-9A-Z]{5}$/.test(error.code);
}

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
  const bookingSubmissionLock = useRef(false);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [equipmentByService, setEquipmentByService] = useState<Record<number, EquipmentRequirement[]>>({});
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [autoPriceRange, setAutoPriceRange] = useState<{ min_price_dop: number; max_price_dop: number; professional_count: number } | null>(null);
  const [autoPriceLoading, setAutoPriceLoading] = useState(false);
  const [manualProPrice, setManualProPrice] = useState<number | null>(null);
  const [manualProDuration, setManualProDuration] = useState<number | null>(null);
  const [manualPriceLoading, setManualPriceLoading] = useState(false);
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
  const [timing, setTiming] = useState<'now' | 'scheduled'>('scheduled');
  const [pros, setPros] = useState<ProCard[]>([]);
  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [expandedProId, setExpandedProId] = useState<string | null>(null);
  const [proReviews, setProReviews] = useState<Review[]>([]);
  const [proServices, setProServices] = useState<PublicProService[]>([]);
  const [proPortfolio, setProPortfolio] = useState<PublicPortfolioPhoto[]>([]);
  const [loadingProDetails, setLoadingProDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingPros, setLoadingPros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const wizardSteps = ['Servicio', 'Modalidad', 'Cuándo', 'Ubicación', 'Fecha y hora', 'Profesional', 'Resumen'];
  const visibleWizardSteps = timing === 'now' ? wizardSteps.filter((_, index) => index !== 4) : wizardSteps;
  const visibleStepIndex = timing === 'now' && activeStep > 4 ? activeStep - 1 : activeStep;
  const dateOptions = useMemo(() => getDateOptions(), []);
  const slotOptions = useMemo(
    () => Array.from({ length: 21 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`),
    [],
  );
  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) ?? null;
  const getScheduledStart = useCallback(() => {
    if (timing === 'now') return new Date(Date.now() + 15 * 60 * 1000).toISOString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) return null;
    const value = new Date(`${scheduledDate}T${scheduledTime}:00-04:00`);
    return Number.isNaN(value.getTime()) || value.getTime() <= Date.now() ? null : value.toISOString();
  }, [scheduledDate, scheduledTime, timing]);

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
      const [serviceResult, tierResult, equipmentResult] = await Promise.all([
        supabase.from('service_types').select('id, code, name, description, active, category_id').eq('active', true).order('name'),
        supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('price_dop'),
        supabase.from('service_equipment_requirements').select('id, service_type_id, item_name, details, required, sort_order').eq('active', true).order('sort_order'),
      ]);
      const loadError = serviceResult.error ?? tierResult.error ?? equipmentResult.error;
      if (loadError) setError(loadError.message);
      else {
        const serviceRows = (serviceResult.data ?? []) as ServiceType[];
        const equipment = (equipmentResult.data ?? []) as EquipmentRequirement[];
        setEquipmentByService(Object.fromEntries(serviceRows.map((service) => [service.id, equipment.filter((item) => item.service_type_id === service.id)])));
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
  const selectedTierIdForQuery = selectedTier?.id ?? null;
  const selectedDuration = mode === 'manual'
    ? manualProDuration ?? selectedOffer?.est_minutes ?? selectedTier?.est_minutes
    : selectedOffer?.est_minutes ?? selectedTier?.est_minutes;
  const selectedPrice = mode === 'manual'
    ? manualProPrice ?? selectedOffer?.base_price_dop ?? undefined
    : selectedOffer?.base_price_dop ?? selectedTier?.price_dop;

  useEffect(() => {
    let active = true;
    if (mode !== 'auto' || selectedOffer || !coordinate || !selectedServiceId) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setAutoPriceRange(null);
        setAutoPriceLoading(false);
      });
      return () => { active = false; };
    }
    void Promise.resolve().then(() => {
      if (active) setAutoPriceLoading(true);
    });
    void Promise.resolve(supabase.rpc('get_auto_service_price_estimate', {
      p_service_type_id: selectedServiceId,
      p_pricing_tier_id: selectedTier?.id ?? null,
      p_lat: coordinate.latitude,
      p_lng: coordinate.longitude,
    })).then(({ data, error: estimateError }) => {
      if (!active) return;
      if (estimateError) {
        setAutoPriceRange(null);
        setError(estimateError.message);
      } else {
        const row = (data?.[0] ?? null) as { min_price_dop: number; max_price_dop: number; professional_count: number } | null;
        setAutoPriceRange(row && Number(row.professional_count) > 0 ? {
          min_price_dop: Number(row.min_price_dop),
          max_price_dop: Number(row.max_price_dop),
          professional_count: Number(row.professional_count),
        } : null);
      }
      setAutoPriceLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setAutoPriceRange(null);
      setAutoPriceLoading(false);
      setError(cause instanceof Error ? cause.message : 'No pudimos calcular el precio estimado.');
    });
    return () => { active = false; };
  }, [mode, selectedOffer, coordinate, selectedServiceId, selectedTier?.id]);

  useEffect(() => {
    let active = true;
    if (mode !== 'manual' || !selectedProId || !selectedServiceId || selectedOffer) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setManualProPrice(null);
        setManualProDuration(null);
        setManualPriceLoading(false);
      });
      return () => { active = false; };
    }
    void Promise.resolve().then(() => {
      if (active) setManualPriceLoading(true);
    });
    void Promise.resolve(supabase.from('pro_services')
      .select('id, base_price_dop, est_minutes')
      .eq('pro_id', selectedProId)
      .eq('service_type_id', selectedServiceId)
      .eq('active', true)
      .maybeSingle())
      .then(async ({ data: proService, error: serviceError }) => {
        if (!active) return;
        if (serviceError || !proService) {
          setManualProPrice(null);
          setManualProDuration(null);
          setError(serviceError?.message ?? 'Este profesional no tiene una tarifa activa para el servicio.');
          setManualPriceLoading(false);
          return;
        }
        if (!selectedTierIdForQuery) {
          setManualProPrice(Number(proService.base_price_dop));
          setManualProDuration(Number(proService.est_minutes));
          setError(null);
          setManualPriceLoading(false);
          return;
        }
        const { data: tierPrice, error: tierPriceError } = await supabase.from('pro_service_tier_prices')
          .select('price_dop, est_minutes')
          .eq('pro_service_id', proService.id)
          .eq('pricing_tier_id', selectedTierIdForQuery)
          .eq('active', true)
          .maybeSingle();
        if (!active) return;
        if (tierPriceError || !tierPrice) {
          setManualProPrice(null);
          setManualProDuration(null);
          setError(tierPriceError?.message ?? 'Este profesional todavía no ha configurado el precio de esta variante.');
        } else {
          setManualProPrice(Number(tierPrice.price_dop));
          setManualProDuration(Number(tierPrice.est_minutes));
          setError(null);
        }
        setManualPriceLoading(false);
      }).catch((cause: unknown) => {
        if (!active) return;
        setManualProPrice(null);
        setManualProDuration(null);
        setManualPriceLoading(false);
        setError(cause instanceof Error ? cause.message : 'No pudimos consultar la tarifa del profesional.');
      });
    return () => { active = false; };
  }, [mode, selectedProId, selectedServiceId, selectedTierIdForQuery, selectedOffer]);

  useEffect(() => {
    let active = true;
    if (timing === 'now') {
      void Promise.resolve().then(() => {
        if (!active) return;
        setAvailableSlots([]);
        setScheduledTime('');
        setLoadingSlots(false);
      });
      return () => { active = false; };
    }
    if (!coordinate || (!selectedTier && !selectedOffer && !(selectedServiceId && (mode === 'auto' || selectedProId))) || !scheduledDate) {
      return () => { active = false; };
    }

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
      : selectedTier
        ? supabase.rpc('get_available_booking_slots_at_location', {
          p_pricing_tier_id: selectedTier.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_date: scheduledDate,
          p_mode: mode,
          p_pro_id: mode === 'manual' ? selectedProId : null,
        })
        : mode === 'auto'
          ? supabase.rpc('get_available_auto_service_slots_at_location', {
              p_service_type_id: selectedServiceId!,
              p_lat: coordinate.latitude,
              p_lng: coordinate.longitude,
              p_date: scheduledDate,
            })
          : (async () => {
              const { data: proService, error: lookupError } = await supabase.from('pro_services')
                .select('id')
                .eq('pro_id', selectedProId!)
                .eq('service_type_id', selectedServiceId!)
                .eq('active', true)
                .maybeSingle();
              if (lookupError) throw lookupError;
              if (!proService) throw new Error('El profesional no tiene publicado este servicio.');
              return await supabase.rpc('get_available_service_slots', {
                p_pro_service_id: proService.id,
                p_lat: coordinate.latitude,
                p_lng: coordinate.longitude,
                p_date: scheduledDate,
              });
            })();
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
  }, [coordinate, selectedTier, selectedOffer, selectedServiceId, selectedProId, scheduledDate, mode, timing]);

  useEffect(() => {
    if (!coordinate || !selectedDuration || (timing === 'scheduled' && !scheduledTime)) return;
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
            p_pricing_tier_id: selectedTier?.id ?? null,
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
  }, [coordinate, scheduledDate, scheduledTime, selectedDuration, selectedOffer, selectedTier?.id, selectedTier?.service_type_id, mode, timing, getScheduledStart]);

  async function showProProfile(pro: ProCard) {
    if (expandedProId === pro.pro_id) {
      setExpandedProId(null);
      return;
    }
    setExpandedProId(pro.pro_id);
    setProReviews([]);
    setProServices([]);
    setProPortfolio([]);
    setLoadingProDetails(true);
    const [reviewResult, serviceResult, portfolioResult] = await Promise.all([
      supabase.from('reviews')
        .select('id, booking_id, client_id, pro_id, rating, comment, created_at')
        .eq('pro_id', pro.pro_id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('pro_services')
        .select('service_type_id, base_price_dop, est_minutes')
        .eq('pro_id', pro.pro_id)
        .eq('active', true)
        .order('base_price_dop'),
      supabase.from('pro_portfolio')
        .select('id, object_path, caption')
        .eq('pro_id', pro.pro_id)
        .order('sort_order')
        .order('created_at', { ascending: false })
        .limit(6),
    ]);
    if (reviewResult.error || serviceResult.error || portfolioResult.error) {
      setError(reviewResult.error?.message ?? serviceResult.error?.message ?? portfolioResult.error?.message ?? 'No pudimos cargar el perfil profesional.');
    } else {
      const serviceRows = serviceResult.data ?? [];
      const serviceIds = serviceRows.map((item) => item.service_type_id);
      const { data: serviceTypes, error: serviceTypesError } = serviceIds.length
        ? await supabase.from('service_types').select('id, name').in('id', serviceIds)
        : { data: [], error: null };
      if (serviceTypesError) setError(serviceTypesError.message);
      else {
        const names = new Map((serviceTypes ?? []).map((item) => [item.id, item.name]));
        setProServices(serviceRows.map((item) => ({
          service_type_id: item.service_type_id,
          service_name: names.get(item.service_type_id) ?? 'Servicio Klipp',
          base_price_dop: item.base_price_dop,
          est_minutes: item.est_minutes,
        })));
      }
      setProReviews((reviewResult.data ?? []) as Review[]);
      setProPortfolio((portfolioResult.data ?? []) as PublicPortfolioPhoto[]);
    }
    setLoadingProDetails(false);
  }

  async function createBooking() {
    if (bookingSubmissionLock.current || success || submissionUncertain) return;
    if ((!selectedTier && !selectedOffer && !(mode === 'auto' && selectedServiceId)) || !coordinate || !session?.user.id) {
      setError('Selecciona el servicio y permite confirmar tu ubicación.');
      return;
    }
    const scheduledStart = getScheduledStart();
    if (!scheduledStart) {
      setError('Elige una fecha y hora futura válidas.');
      return;
    }
    if (mode === 'auto' && !selectedOffer && (!autoPriceRange || autoPriceLoading)) {
      setError('Todavía no hay tarifas publicadas suficientes para estimar este servicio en la zona seleccionada.');
      return;
    }
    if (timing === 'scheduled' && !selectedOffer && mode === 'manual' && !selectedProId) {
      setError('Selecciona un profesional disponible para continuar.');
      return;
    }
    if (timing === 'scheduled' && mode === 'manual' && !selectedOffer && (!manualProPrice || manualPriceLoading)) {
      setError('El profesional seleccionado no tiene un precio publicado para esta variante. Elige otro profesional.');
      return;
    }

    bookingSubmissionLock.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setSubmissionUncertain(false);
    let bookingCreationAttempted = false;

    try {
      let bookingId: unknown = null;
      let rpcError: { message: string; code?: string; status?: number } | null = null;

      if (selectedOffer) {
        bookingCreationAttempted = true;
        const result = await supabase.rpc('create_booking_at_location', {
          p_pro_service_id: selectedOffer.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
        });
        bookingId = result.data;
        rpcError = result.error;
      } else if (selectedTier) {
        bookingCreationAttempted = true;
        const result = await supabase.rpc('create_tier_booking_at_location', {
          p_pricing_tier_id: selectedTier.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
          p_mode: mode,
          p_pro_id: mode === 'manual' ? selectedProId : null,
        });
        bookingId = result.data;
        rpcError = result.error;
      } else if (mode === 'auto') {
        bookingCreationAttempted = true;
        const result = await supabase.rpc('create_auto_service_booking_at_location', {
          p_service_type_id: selectedServiceId!,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
        });
        bookingId = result.data;
        rpcError = result.error;
      } else {
        const { data: proService, error: serviceLookupError } = await supabase.from('pro_services')
          .select('id')
          .eq('pro_id', selectedProId!)
          .eq('service_type_id', selectedServiceId!)
          .eq('active', true)
          .maybeSingle();
        if (serviceLookupError || !proService) {
          setError(serviceLookupError?.message ?? 'El profesional no tiene publicado este servicio.');
          return;
        }
        bookingCreationAttempted = true;
        const result = await supabase.rpc('create_booking_at_location', {
          p_pro_service_id: proService.id,
          p_lat: coordinate.latitude,
          p_lng: coordinate.longitude,
          p_address_text: addressText,
          p_landmark_notes: landmarkNotes,
          p_scheduled_start: scheduledStart,
        });
        bookingId = result.data;
        rpcError = result.error;
      }

      if (rpcError) {
        if (isAmbiguousBookingRpcError(rpcError)) {
          setSubmissionUncertain(true);
          setError('No pudimos confirmar si la solicitud llegó a registrarse. Revisa Mis reservas antes de volver a intentarlo para evitar duplicarla.');
        } else {
          setError(rpcError.message);
        }
        return;
      }
      if (typeof bookingId !== 'string') {
        setSubmissionUncertain(true);
        setError('No recibimos la confirmación de la reserva. Revisa Mis reservas antes de volver a intentarlo.');
        return;
      }

      if (!selectedOffer && mode === 'auto' && timing === 'now') {
        try {
          const { error: assignmentError } = await supabase.functions.invoke('auto-assign-booking', { body: { bookingId } });
          setSuccess(assignmentError
            ? 'Solicitud creada. Klipp continuará buscando un profesional; consulta el estado en Mis reservas.'
            : 'Buscando un profesional conectado y disponible ahora mismo. Sigue el estado en Mis reservas.');
        } catch {
          setSuccess('Solicitud creada. Klipp continuará buscando un profesional; consulta el estado en Mis reservas.');
        }
      } else if (!selectedOffer && mode === 'auto') {
        setSuccess('Reserva creada. Quedará en espera y Klipp buscará un profesional disponible cuando se acerque la hora acordada. Puedes seguirla en Mis reservas.');
      } else {
        setSuccess('Solicitud enviada al profesional. Te avisaremos cuando responda.');
      }
    } catch (cause) {
      if (bookingCreationAttempted) {
        setSubmissionUncertain(true);
        setError('No pudimos confirmar si la solicitud llegó a registrarse. Revisa Mis reservas antes de intentarlo otra vez para evitar duplicarla.');
      } else {
        setError(cause instanceof Error ? cause.message : 'No pudimos consultar la información necesaria para crear la reserva.');
      }
    } finally {
      bookingSubmissionLock.current = false;
      setSaving(false);
    }
  }

  function continueWizard() {
    if (activeStep === 0 && selectedServiceId === null) { setError('Selecciona un servicio para continuar.'); return; }
    if (activeStep === 3 && !coordinate) { setError('Indica el lugar donde se realizará el servicio.'); return; }
    if (activeStep === 4 && timing === 'scheduled' && (!scheduledTime || !getScheduledStart())) { setError('Selecciona una fecha y un horario futuro disponible.'); return; }
    if (activeStep === 5 && timing === 'scheduled' && !selectedOffer && mode === 'manual' && !selectedProId) { setError('Elige un profesional o cambia a asignación automática.'); return; }
    setError(null);
    const nextStep = activeStep === 3 && timing === 'now' ? 5 : Math.min(6, activeStep + 1);
    setActiveStep(nextStep);
  }

  function previousWizardStep() {
    setError(null);
    const previousStep = activeStep === 5 && timing === 'now' ? 3 : Math.max(0, activeStep - 1);
    setActiveStep(previousStep);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando opciones...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹  Volver</Text></Pressable>
      <BrandScreenHeader eyebrow="RESERVAS" title="Nueva reserva" subtitle="Unos pasos y queda organizado." />
      <View style={styles.wizardHeader}>
        <View style={styles.wizardHeading}><Text style={styles.wizardEyebrow}>PASO {visibleStepIndex + 1} DE {visibleWizardSteps.length}</Text><Text style={styles.wizardCurrent}>{visibleWizardSteps[visibleStepIndex]}</Text></View>
        <View style={styles.wizardTrack}><View style={[styles.wizardFill, { width: `${((visibleStepIndex + 1) / visibleWizardSteps.length) * 100}%` }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wizardLabels}>{visibleWizardSteps.map((label, index) => <Text key={label} style={[styles.wizardLabel, index === visibleStepIndex && styles.wizardLabelActive]}>{String(index + 1).padStart(2, '0')} {label}</Text>)}</ScrollView>
      </View>
      {success && <View style={styles.successBanner}><Text style={styles.successTitle}>{success}</Text><Pressable onPress={() => router.replace('/(client)/bookings')} style={({ pressed }) => pressed && styles.pressed}><Text style={styles.successLink}>Ver mis reservas</Text></Pressable></View>}
      {services.length === 0 && <Text style={styles.empty}>No hay servicios disponibles ahora mismo.</Text>}

      {activeStep === 0 && (<>

      <Section title="1. Servicio">
        {services.map((service) => {
          const selected = selectedServiceId === service.id;
          return (
            <Pressable key={service.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { resetAppointmentSelection(); setSelectedServiceId(service.id); setSelectedTierId(null); setSelectedOfferId(null); }} style={[styles.serviceTile, selected && styles.serviceTileSelected]}>
              <View style={styles.serviceTileIcon}><Image source={serviceArt(service.code)} contentFit="cover" style={styles.serviceTileArt} /></View>
              <View style={styles.serviceTileCopy}>
                <Text style={styles.serviceTileTitle}>{service.name}</Text>
                {!!service.description && <Text style={styles.serviceTileDescription}>{service.description}</Text>}
              </View>
              <View style={[styles.serviceTileRadio, selected && styles.serviceTileRadioSelected]}>{selected && <View style={styles.serviceTileRadioInner} />}</View>
            </Pressable>
          );
        })}
      </Section>
      {selectedServiceId !== null && (
        <Section title="Equipamiento del servicio">
          <Text style={styles.equipmentNotice}>
            El profesional debe llevar sus propias herramientas, equipos, productos y consumibles. No tendrá que pedirte prestado material para realizar el trabajo.
          </Text>
          {(equipmentByService[selectedServiceId] ?? []).map((item) => (
            <View key={item.id} style={styles.equipmentRow}>
              <Text style={styles.equipmentBullet}>✓</Text>
              <View style={styles.equipmentCopy}>
                <Text style={styles.equipmentName}>{item.item_name}</Text>
                {!!item.details && <Text style={styles.equipmentDetails}>{item.details}</Text>}
              </View>
            </View>
          ))}
        </Section>
      )}
      </>)}

      {activeStep === 1 && (<>

      {visibleTiers.length > 0 && <Section title="2. Tamaño / modalidad">
        {visibleTiers.map((tier) => (
          <Choice key={tier.id} selected={(selectedTier?.id ?? null) === tier.id} label={tier.label} secondary="Tarifa del profesional" onPress={() => { resetAppointmentSelection(); setSelectedTierId(tier.id); }} />
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
              onPress={() => { resetAppointmentSelection(); setSelectedOfferId(offer.id); setMode('manual'); setTiming('scheduled'); }}
            />
          ))}
      </Section>}
      </>)}

      {activeStep === 2 && (<>

      <Section title="3. ¿Cuándo necesitas el servicio?">
        {selectedOffer ? <Text style={styles.body}>Has elegido a {selectedOffer.pro_name ?? 'un profesional'} para este servicio. La reserva se programará según su disponibilidad.</Text> : <View style={styles.modeOptions}>
          <ModeOption label="Solicitar ahora" selected={timing === 'now'} onPress={() => { resetAppointmentSelection(); setTiming('now'); setMode('auto'); }} />
          <ModeOption label="Programar servicio" selected={timing === 'scheduled'} onPress={() => { resetAppointmentSelection(); setTiming('scheduled'); if (!selectedTier) setMode('auto'); }} />
        </View>}
        {timing === 'now' && <Text style={styles.body}>Buscaremos inmediatamente un profesional conectado y disponible cerca de tu ubicación.</Text>}
      </Section>
      </>)}

      {activeStep === 3 && (<>

      <Section title="4. Ubicación del servicio">
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
          <View style={styles.locationPermissionPrompt}>
            <Text style={styles.body}>Para calcular distancias y mostrar profesionales disponibles, Klipp necesita conocer el punto del servicio. Solo solicitaremos tu ubicación cuando tú lo decidas.</Text>
            <Pressable accessibilityRole="button" onPress={() => void requestCurrentLocation()} style={({ pressed }) => [styles.retryLocation, pressed && styles.pressed]}>
              <Text style={styles.adjustLocationText}>Usar mi ubicación actual</Text>
            </Pressable>
          </View>
        )}
        {locationError && <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text>}
      </Section>
      </>)}

      {activeStep === 4 && timing === 'scheduled' && (<>

      {timing === 'scheduled' && <Section title="5. Fecha y hora">
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
      </Section>}
      </>)}

      {activeStep === 5 && (<>

      <Section title={timing === 'now' ? "5. Profesional" : "6. Profesional"}>
        {timing === 'scheduled' && !selectedOffer && <View style={styles.modeOptions}>
          <ModeOption label="Cerca de mí" selected={mode === 'manual'} onPress={() => { resetAppointmentSelection(); setMode('manual'); }} />
          <ModeOption label="Asignar automáticamente" selected={mode === 'auto'} onPress={() => { resetAppointmentSelection(); setMode('auto'); }} />
        </View>}
        {selectedOffer && <Text style={styles.body}>Has seleccionado a {selectedOffer.pro_name ?? 'un profesional'} para este servicio.</Text>}
        {!coordinate && <Text style={styles.body}>Comparte tu ubicación para validar la cobertura.</Text>}
        {!selectedOffer && timing === 'scheduled' && mode === 'manual' && coordinate && (!scheduledTime || !selectedDuration) && <Text style={styles.body}>Elige fecha y horario para descubrir profesionales cercanos, revisar sus perfiles y seleccionar a quién contratar.</Text>}
        {!selectedOffer && mode === 'manual' && coordinate && loadingPros && <ActivityIndicator color="#16766c" />}
        {!selectedOffer && timing === 'scheduled' && mode === 'manual' && coordinate && scheduledTime && !loadingPros && pros.length === 0 && <Text style={styles.body}>No hay profesionales verificados disponibles en esta zona y horario.</Text>}
        {!selectedOffer && timing === 'scheduled' && mode === 'manual' && pros.map((pro) => (
          <View key={pro.pro_id} style={[styles.proCard, selectedProId === pro.pro_id && styles.proCardSelected]}>
            <Pressable onPress={() => void showProProfile(pro)} style={({ pressed }) => [styles.proSummary, pressed && styles.choicePressed]}>
              {pro.avatar_url ? <Image source={{ uri: pro.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{pro.full_name?.[0] ?? 'K'}</Text></View>}
              <View style={styles.proMain}>
                <Text style={styles.proName}>{pro.full_name ?? 'Profesional Klipp'}</Text>
                <Text style={styles.body}>{pro.years_experience ?? 0} años de experiencia</Text>
                {typeof pro.distance_km === 'number' && <Text style={styles.body}>Zona de cobertura a {pro.distance_km.toFixed(1)} km aprox.</Text>}
                <Text style={styles.rating}>★ {Number(pro.rating_avg).toFixed(1)} · {pro.rating_count} reseñas</Text>
              </View>
              <Text style={styles.profileLink}>{expandedProId === pro.pro_id ? 'Cerrar' : 'Ver perfil'}</Text>
            </Pressable>
            {expandedProId === pro.pro_id && (
              <View style={styles.profileDetails}>
                {loadingProDetails ? <ActivityIndicator color="#16766c" /> : <>
                  <Text style={styles.body}>{pro.bio || 'Este profesional aún no ha añadido una biografía.'}</Text>
                  <View style={styles.proStats}>
                    <View style={styles.proStat}><Text style={styles.proStatValue}>{pro.jobs_completed}</Text><Text style={styles.proStatLabel}>Trabajos</Text></View>
                    <View style={styles.proStat}><Text style={styles.proStatValue}>{pro.years_experience ?? 0}</Text><Text style={styles.proStatLabel}>Años exp.</Text></View>
                    <View style={styles.proStat}><Text style={styles.proStatValue}>{Number(pro.rating_avg).toFixed(1)} ★</Text><Text style={styles.proStatLabel}>{pro.rating_count} opiniones</Text></View>
                  </View>
                  <Text style={styles.reviewHeading}>Servicios y precios</Text>
                  {proServices.length === 0 ? <Text style={styles.body}>No hay servicios publicados.</Text> : proServices.map((service) => (
                    <View key={service.service_type_id} style={styles.publicServiceRow}>
                      <View style={styles.publicServiceCopy}><Text style={styles.publicServiceName}>{service.service_name}</Text><Text style={styles.body}>{service.est_minutes} min aprox.</Text></View>
                      <Text style={styles.publicServicePrice}>{formatDop(service.base_price_dop)}</Text>
                    </View>
                  ))}
                  {proPortfolio.length > 0 && <>
                    <Text style={styles.reviewHeading}>Fotos de sus trabajos</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.portfolioList}>
                      {proPortfolio.map((photo) => (
                        <Image key={photo.id} source={{ uri: supabase.storage.from('pro-portfolio').getPublicUrl(photo.object_path).data.publicUrl }} contentFit="cover" style={styles.publicPortfolioImage} />
                      ))}
                    </ScrollView>
                  </>}
                  <Text style={styles.reviewHeading}>Reseñas recientes</Text>
                  {proReviews.length === 0 ? <Text style={styles.body}>Todavía no hay reseñas.</Text> : proReviews.map((review) => <Text key={review.id} style={styles.reviewText}>★ {review.rating} {review.comment || ''}</Text>)}
                  <Pressable accessibilityRole="button" onPress={() => setSelectedProId(pro.pro_id)} style={({ pressed }) => [styles.selectPro, pressed && styles.choicePressed]}><Text style={styles.selectProText}>{selectedProId === pro.pro_id ? 'Profesional seleccionado' : 'Elegir este profesional'}</Text></Pressable>
                </>}
              </View>
            )}
          </View>
        ))}
        {!selectedOffer && mode === 'auto' && timing === 'now' && <Text style={styles.body}>Klipp enviará la solicitud a profesionales conectados y disponibles. Si uno acepta, podrás seguir su llegada desde la app.</Text>}
        {!selectedOffer && mode === 'auto' && timing === 'scheduled' && <Text style={styles.body}>Tu reserva quedará en espera. Cerca de la hora acordada, Klipp buscará profesionales conectados, disponibles y con el equipamiento necesario para llegar a tiempo.</Text>}
      </Section>

      </>)}

      {activeStep === 6 && (selectedTier || selectedOffer || (mode === 'auto' && selectedServiceId)) && coordinate && (timing === 'now' || (scheduledDate && scheduledTime)) && (
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
          {selectedTier && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Modalidad</Text><Text style={styles.summaryValue}>{selectedTier.label}</Text></View>}
          {selectedOffer && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Duración</Text><Text style={styles.summaryValue}>{selectedOffer.est_minutes} min</Text></View>}
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Fecha y hora</Text><Text style={styles.summaryValue}>{timing === 'now' ? 'Lo antes posible' : `${scheduledDate} · ${formatSlotTime(scheduledTime)}`}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Dirección</Text><Text numberOfLines={2} style={styles.summaryValue}>{addressText || 'Ubicación seleccionada'}</Text></View>
          {landmarkNotes.trim().length > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Referencia</Text><Text numberOfLines={2} style={styles.summaryValue}>{landmarkNotes}</Text></View>}
          {selectedOffer && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Profesional</Text><Text style={styles.summaryValue}>{selectedOffer.pro_name ?? 'Profesional seleccionado'}</Text></View>}
          {mode === 'manual' && selectedProId && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Profesional</Text><Text style={styles.summaryValue}>{pros.find((pro) => pro.pro_id === selectedProId)?.full_name ?? 'Profesional seleccionado'}</Text></View>}
          {mode === 'auto' && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Asignación</Text><Text style={styles.summaryValue}>{timing === 'now' ? 'Solicitar ahora' : 'Asignación automática'}</Text></View>}
          <View style={styles.summaryDivider} />
          {mode === 'auto' && !selectedOffer ? (
            <View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Precio estimado</Text>
                <Text style={styles.priceLine}>{autoPriceLoading ? 'Calculando…' : autoPriceRange ? `${formatDop(autoPriceRange.min_price_dop)} – ${formatDop(autoPriceRange.max_price_dop)}` : 'Sin tarifas disponibles'}</Text>
              </View>
              <Text style={styles.body}>Estimación basada en las tarifas publicadas por profesionales de la zona. El precio definitivo será el del profesional que acepte y se mostrará antes del pago.</Text>
            </View>
          ) : (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{mode === 'manual' && !selectedOffer ? 'Precio del profesional' : 'Total del servicio'}</Text>
              <Text style={styles.priceLine}>{mode === 'manual' && !selectedOffer && !selectedProId ? 'Elige profesional' : manualPriceLoading ? 'Consultando…' : selectedPrice ? formatDop(selectedPrice) : mode === 'manual' && !selectedOffer ? 'Tarifa no disponible' : formatDop(0)}</Text>
            </View>
          )}
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={[styles.error, styles.horizontalMargin]}>{error}</Text>}
      <View style={styles.wizardNavigation}>
        {activeStep > 0 ? <Pressable accessibilityRole="button" onPress={previousWizardStep} style={({ pressed }) => [styles.wizardBack, pressed && styles.buttonPressed]}><Text style={styles.wizardBackText}>Volver</Text></Pressable> : <View style={styles.wizardBackSpacer} />}
        {activeStep < 6 ? <Pressable accessibilityRole="button" onPress={continueWizard} style={({ pressed }) => [styles.wizardNext, pressed && styles.buttonPressed]}><Text style={styles.wizardNextText}>Continuar</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={17} /></Pressable> : null}
      </View>
      {activeStep === 6 && (submissionUncertain ? (
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(client)/bookings')} style={({ pressed }) => [styles.submit, pressed && styles.buttonPressed]}>
          <Text style={styles.submitText}>Revisar Mis reservas</Text>
        </Pressable>
      ) : !success && (
        <Pressable accessibilityRole="button" disabled={saving || !coordinate || locationLoading} onPress={() => void createBooking()} style={({ pressed }) => [styles.submit, (saving || !coordinate || locationLoading) && styles.disabled, pressed && !saving && styles.buttonPressed]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{timing === 'now' ? 'Solicitar ahora' : 'Solicitar servicio'}</Text>}
        </Pressable>
      )}
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const step = /^(\d+)\.\s*(.*)$/.exec(title);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        {step ? <View style={styles.sectionStep}><Text style={styles.sectionStepText}>{step[1].padStart(2, '0')}</Text></View> : null}
        <Text style={styles.sectionTitle}>{step?.[2] ?? title}</Text>
      </View>
      {children}
    </View>
  );
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
  equipmentNotice: { color: KlippColors.slate, fontSize: 13, lineHeight: 19, padding: 12, borderRadius: 10, backgroundColor: KlippColors.whiteBlue, borderWidth: 1, borderColor: KlippColors.border },
  equipmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  equipmentBullet: { color: KlippColors.success, fontSize: 14, fontWeight: '800' },
  equipmentCopy: { flex: 1, gap: 2 },
  equipmentName: { color: KlippColors.navy, fontSize: 12, fontWeight: '700' },
  equipmentDetails: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  serviceTile: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, paddingHorizontal: 0, borderBottomWidth: 1, borderColor: '#E8E5DE', borderRadius: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  serviceTileSelected: { borderColor: '#3D5AFE', backgroundColor: 'rgba(61,90,254,0.045)' },
  serviceTileIcon: { width: 88, height: 66, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(23,27,45,0.04)', backgroundColor: '#F7F5F0' },
  serviceTileArt: { width: '100%', height: '100%' },
  serviceTileCopy: { flex: 1, gap: 4 },
  serviceTileTitle: { color: '#171B2D', fontSize: 16, lineHeight: 21, fontWeight: '900', letterSpacing: -0.35 },
  serviceTileDescription: { color: '#72778A', fontSize: 12, lineHeight: 18 },
  serviceTileRadio: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: KlippColors.border, borderRadius: 99 },
  serviceTileRadioSelected: { borderColor: KlippColors.cobalt },
  serviceTileRadioInner: { width: 10, height: 10, borderRadius: 99, backgroundColor: KlippColors.cobalt },
  page: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 72, gap: 18, backgroundColor: '#F7F5F0', flexGrow: 1 },
  wizardHeader: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: 11 },
  wizardHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  wizardEyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  wizardCurrent: { color: KlippColors.ink, fontSize: 16, fontWeight: '900' },
  wizardTrack: { height: 4, overflow: 'hidden', borderRadius: 4, backgroundColor: '#E5E2DA' },
  wizardFill: { height: 4, borderRadius: 4, backgroundColor: KlippColors.cobalt },
  wizardLabels: { flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 2 },
  wizardLabel: { color: '#9295A0', fontSize: 10, fontWeight: '700' },
  wizardLabelActive: { color: KlippColors.ink, fontWeight: '900' },
  wizardNavigation: { width: '100%', maxWidth: 1080, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 3 },
  wizardBack: { minHeight: 54, minWidth: 104, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: 'transparent' },
  wizardBackText: { color: KlippColors.slate, fontSize: 14, fontWeight: '800' },
  wizardBackSpacer: { width: 104 },
  wizardNext: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, backgroundColor: KlippColors.cobalt },
  wizardNextText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  back: { alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, marginHorizontal: 0, marginTop: 2, borderRadius: 999, backgroundColor: '#E9EDFF' },
  pressed: { opacity: 0.88 },
  backText: { color: '#3048D8', fontSize: 13, fontWeight: '900' },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '700' },
  section: { width: '100%', maxWidth: 1080, alignSelf: 'center', marginHorizontal: 0, paddingVertical: 19, paddingHorizontal: 0, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: 1, borderColor: '#E8E5DE', gap: 16, shadowOpacity: 0, elevation: 0 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  sectionStep: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#3D5AFE', alignItems: 'center', justifyContent: 'center' },
  sectionStepText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  sectionTitle: { flex: 1, color: '#171B2D', fontSize: 20, lineHeight: 26, fontWeight: '900', letterSpacing: -0.55 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  addressInput: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 13, color: KlippColors.navy, fontSize: 14, backgroundColor: KlippColors.white },
  notesInput: { minHeight: 84, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, color: KlippColors.navy, fontSize: 14, textAlignVertical: 'top', backgroundColor: KlippColors.white },
  locationPermissionPrompt: { gap: 12 },
  adjustLocation: { alignSelf: 'flex-start', paddingVertical: 7 },
  retryLocation: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, backgroundColor: KlippColors.whiteMuted },
  adjustLocationText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700', marginTop: 5 },
  dateList: { gap: 8, paddingVertical: 2 },
  dateOption: { width: 68, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#E8E5DE', borderRadius: 17, backgroundColor: '#FFFFFF' },
  dateOptionSelected: { borderColor: '#3D5AFE', backgroundColor: '#3D5AFE' },
  dateWeekday: { color: KlippColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  dateDay: { color: KlippColors.navy, fontSize: 19, fontWeight: '700' },
  dateMonth: { color: KlippColors.muted, fontSize: 10, textTransform: 'capitalize' },
  dateTextSelected: { color: KlippColors.white },
  slotHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  slotCount: { color: KlippColors.success, fontSize: 12, fontWeight: '700' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotOption: { width: '31%', minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E8E5DE', borderRadius: 14, backgroundColor: '#FFFFFF' },
  slotOptionSelected: { borderColor: '#3D5AFE', backgroundColor: '#E9EDFF' },
  slotUnavailable: { borderColor: KlippColors.surfaceMuted, backgroundColor: KlippColors.whiteMuted },
  slotText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  slotTextSelected: { color: KlippColors.blueDark },
  slotTextUnavailable: { color: KlippColors.muted },
  slotsLoading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  noSlots: { padding: 14, borderRadius: 14, backgroundColor: KlippColors.whiteMuted, gap: 4 },
  noSlotsTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  choice: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingHorizontal: 17, paddingVertical: 12, borderWidth: 1, borderColor: '#E8E5DE', borderRadius: 17, backgroundColor: '#FFFFFF' },
  choiceSelected: { borderColor: '#3D5AFE', backgroundColor: '#F1F3FF' },
  choicePressed: { opacity: 0.9 },
  choiceCopy: { flex: 1, gap: 3 },
  choiceText: { color: '#3D4358', fontSize: 14, fontWeight: '800' },
  choiceTextSelected: { color: '#3048D8' },
  choiceSecondary: { color: '#3048D8', fontSize: 13, fontWeight: '900' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: KlippColors.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: KlippColors.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: KlippColors.blue },
  empty: { color: KlippColors.muted, fontSize: 14, padding: 16, marginHorizontal: 20, borderRadius: 16, backgroundColor: KlippColors.white },
  emptyInline: { gap: 6 },
  modeOptions: { flexDirection: 'row', gap: 9 },
  modeOption: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E8E5DE', borderRadius: 17, backgroundColor: '#FFFFFF' },
  proCard: { padding: 17, borderWidth: 1, borderColor: '#E8E5DE', borderRadius: 21, backgroundColor: '#FFFFFF', gap: 13, shadowColor: '#171B2D', shadowOpacity: 0.035, shadowOffset: { width: 0, height: 7 }, shadowRadius: 17, elevation: 2 },
  proCardSelected: { borderColor: '#3D5AFE', backgroundColor: '#F1F3FF' },
  proSummary: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: KlippColors.whiteBlue },
  avatarFallback: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.whiteBlue },
  avatarInitial: { color: KlippColors.blueDark, fontSize: 20, fontWeight: '700' },
  proMain: { flex: 1, gap: 2 },
  proName: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  rating: { color: KlippColors.warning, fontSize: 13, fontWeight: '700' },
  profileLink: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  proStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 8 },
  proStat: { flex: 1, padding: 9, borderRadius: 10, backgroundColor: KlippColors.whiteMuted, alignItems: 'center', gap: 3 },
  proStatValue: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  proStatLabel: { color: KlippColors.muted, fontSize: 11 },
  publicServiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: KlippColors.border },
  publicServiceCopy: { flex: 1, gap: 2 },
  publicServiceName: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  publicServicePrice: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '800' },
  portfolioList: { gap: 9, paddingVertical: 4 },
  publicPortfolioImage: { width: 150, height: 112, borderRadius: 12, backgroundColor: KlippColors.canvas },
  profileDetails: { paddingTop: 12, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 9 },
  reviewHeading: { color: KlippColors.navy, fontSize: 13, fontWeight: '700', marginTop: 4 },
  reviewText: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  selectPro: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.whiteBlue },
  selectProText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  totalCard: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 18, backgroundColor: KlippColors.whiteBlue },
  totalLabel: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  totalHint: { color: KlippColors.muted, fontSize: 12, marginTop: 4 },
  priceLine: { color: '#3048D8', fontSize: 22, fontWeight: '900' },
  summaryCard: { width: '100%', maxWidth: 1080, alignSelf: 'center', marginHorizontal: 0, padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#DDE2FF', backgroundColor: '#FFFFFF', gap: 16, shadowColor: '#3048D8', shadowOpacity: 0.055, shadowOffset: { width: 0, height: 10 }, shadowRadius: 22, elevation: 3 },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: '#171B2D', fontSize: 20, fontWeight: '900', marginTop: 5 },
  summaryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF5' },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { color: '#72778A', fontSize: 12 },
  summaryValue: { flex: 1, color: '#171B2D', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: '#E8E5DE' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: '#555B6F', fontSize: 13, fontWeight: '800' },
  submit: { width: '100%', maxWidth: 1080, alignSelf: 'center', minHeight: 60, marginHorizontal: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#3D5AFE', shadowColor: '#3048D8', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 9 }, shadowRadius: 16, elevation: 4 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.1 },
  disabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  horizontalMargin: { marginHorizontal: 20 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  successBanner: { padding: 16, marginHorizontal: 20, borderRadius: 16, backgroundColor: '#ECFDF5', gap: 7 },
  successTitle: { color: '#067647', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  successLink: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
});