import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { CoverageRadiusPicker, type CoverageCoordinate } from '@/components/coverage-radius-picker';
import { KlippColors } from '@/lib/brand';
import { serviceArt } from '@/lib/service-art';
import { supabase } from '../../lib/supabase';
import type { ProAvailability, ProProfile, PricingTier, ServiceType, VerificationStatus } from '@/lib/types';

type PortfolioPhoto = { id: string; pro_id: string; object_path: string; caption: string | null; sort_order: number; created_at: string };
type EquipmentRequirement = { id: number; service_type_id: number; item_name: string; details: string; required: boolean; sort_order: number };
function parseDopPrice(value: string | undefined): number {
  const normalized = (value ?? '').trim().replace(/[\s,]/g, '');
  return normalized ? Number(normalized) : Number.NaN;
}

type ProfessionalService = {
  id?: string;
  service_type_id: number;
  base_price_dop: number;
  est_minutes: number;
  details?: Record<string, string>;
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
  const [serviceDetails, setServiceDetails] = useState<Record<number, Record<string, string>>>({});
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [tierDurations, setTierDurations] = useState<Record<string, string>>({});
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [addingAvailability, setAddingAvailability] = useState(false);
  const [uploadingVerification, setUploadingVerification] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioPhoto[]>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const [profileResult, accountProfileResult, availabilityResult, catalogResult, offeredResult, equipmentResult, portfolioResult, tiersResult] = await Promise.all([
      supabase.from('pro_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('profiles').select('phone').eq('id', userId).single(),
      supabase.from('pro_availability').select('id, pro_id, weekday, start_time, end_time').eq('pro_id', userId).order('weekday'),
      supabase.from('service_types').select('id, code, name, description, active, category_id, service_categories(name)').eq('active', true).order('name'),
      supabase.from('pro_services').select('id, service_type_id, base_price_dop, est_minutes, details').eq('pro_id', userId).eq('active', true),
      supabase.from('service_equipment_requirements').select('id, service_type_id, item_name, details, required, sort_order').eq('active', true).order('sort_order'),
      supabase.from('pro_portfolio').select('id, pro_id, object_path, caption, sort_order, created_at').eq('pro_id', userId).order('sort_order').order('created_at', { ascending: false }),
      supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('id'),
    ]);
    if (profileResult.error || accountProfileResult.error || availabilityResult.error || catalogResult.error || offeredResult.error || equipmentResult.error || portfolioResult.error || tiersResult.error) {
      setError(
        profileResult.error?.message ?? accountProfileResult.error?.message ?? availabilityResult.error?.message ?? catalogResult.error?.message ?? offeredResult.error?.message ?? equipmentResult.error?.message ?? portfolioResult.error?.message ?? tiersResult.error?.message ?? 'No pudimos cargar tu perfil.',
      );
      setLoading(false);
      return;
    }
    setPortfolio((portfolioResult.data ?? []) as PortfolioPhoto[]);
    const savedProfile = profileResult.data as ProProfile;
    const registrationDraft = getRegistrationDraft(session?.user.user_metadata?.pro_onboarding);
    setProProfile(savedProfile);
    setPhone(typeof accountProfileResult.data?.phone === 'string' ? accountProfileResult.data.phone : '');
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
    const tiers = (tiersResult.data ?? []) as PricingTier[];
    setPricingTiers(tiers);
    const offeredIds = offered.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (offeredIds.length) {
      const tierPriceResult = await supabase.from('pro_service_tier_prices')
        .select('pro_service_id, pricing_tier_id, price_dop, est_minutes')
        .in('pro_service_id', offeredIds);
      if (tierPriceResult.error) {
        setError(tierPriceResult.error.message);
        setLoading(false);
        return;
      }
      const serviceIdByOfferId = new Map(offered.map((item) => [item.id, item.service_type_id]));
      const savedTierPrices = (tierPriceResult.data ?? []) as { pro_service_id: string; pricing_tier_id: number; price_dop: number; est_minutes: number }[];
      setTierPrices(Object.fromEntries(savedTierPrices.map((item) => [`${serviceIdByOfferId.get(item.pro_service_id)}:${item.pricing_tier_id}`, String(item.price_dop)])));
      setTierDurations(Object.fromEntries(savedTierPrices.map((item) => [`${serviceIdByOfferId.get(item.pro_service_id)}:${item.pricing_tier_id}`, String(item.est_minutes)])));
    } else {
      setTierPrices({});
      setTierDurations({});
    }
    const configuredServices = offered.length ? offered : registrationDraft?.services ?? [];
    setCatalog(services);
    const equipment = (equipmentResult.data ?? []) as EquipmentRequirement[];
    setEquipmentByService(Object.fromEntries(services.map((service) => [service.id, equipment.filter((item) => item.service_type_id === service.id)])));
    setSelectedServices(configuredServices.map((service) => service.service_type_id).slice(0, 1));
    setServiceDetails(Object.fromEntries(configuredServices.map((service) => [service.service_type_id, service.details ?? {}])));
    setLoading(false);
  }, [userId, session?.user.user_metadata?.pro_onboarding]);

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

  async function uploadPortfolioPhoto() {
    if (!userId) return;
    if (portfolio.length >= 6) {
      setError('Puedes mostrar hasta 6 fotos de trabajos en tu perfil.');
      return;
    }
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size !== undefined && asset.size > 8 * 1024 * 1024) {
        throw new Error('Cada foto debe pesar como máximo 8 MB.');
      }
      const mimeType = asset.mimeType;
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        throw new Error('Selecciona una foto JPG, PNG o WEBP.');
      }
      setUploadingPortfolio(true);
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('No pudimos leer la foto seleccionada.');
      const file = await response.blob();
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
      const objectPath = `${userId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('pro-portfolio').upload(objectPath, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase.from('pro_portfolio').insert({
        pro_id: userId,
        object_path: objectPath,
        sort_order: portfolio.length,
      }).select('id, pro_id, object_path, caption, sort_order, created_at').single();
      if (insertError) {
        await supabase.storage.from('pro-portfolio').remove([objectPath]);
        throw insertError;
      }
      setPortfolio((current) => [...current, data as PortfolioPhoto]);
      setNotice('Foto añadida a tu perfil público.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos subir la foto.');
    } finally {
      setUploadingPortfolio(false);
    }
  }

  async function deletePortfolioPhoto(photo: PortfolioPhoto) {
    if (!userId) return;
    setError(null);
    const { error: rowError } = await supabase.from('pro_portfolio').delete().eq('id', photo.id).eq('pro_id', userId);
    if (rowError) {
      setError(rowError.message);
      return;
    }
    const { error: fileError } = await supabase.storage.from('pro-portfolio').remove([photo.object_path]);
    if (fileError) setError(`La foto se quitó del perfil, pero no se pudo borrar el archivo: ${fileError.message}`);
    setPortfolio((current) => current.filter((item) => item.id !== photo.id));
  }

  async function saveProfile() {
    if (!userId || !proProfile) return;
    const parsedYears = years.trim() ? Number(years) : null;
    if (parsedYears !== null && (!Number.isInteger(parsedYears) || parsedYears < 0)) {
      setError('Los años de experiencia deben ser un número entero igual o mayor que cero.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Introduce un teléfono de contacto válido con al menos 10 dígitos.');
      return;
    }

    if (selectedServices.length !== 1) {
      setError('Tu perfil debe tener exactamente una profesión principal.');
      return;
    }

    const invalidTierPrice = selectedServices.some((serviceId) => {
      const serviceTiers = pricingTiers.filter((tier) => tier.service_type_id === serviceId);
      return serviceTiers.length === 0 || serviceTiers.some((tier) => {
      const key = `${serviceId}:${tier.id}`;
      const price = parseDopPrice(tierPrices[key]);
      const duration = Number(tierDurations[key]);
      return !Number.isFinite(price) || price <= 0 || !Number.isInteger(duration) || duration <= 0;
      });
    });
    if (invalidTierPrice) {
      setError('Configura un precio y una duración válidos para cada variante del servicio.');
      return;
    }

    const invalidDetails = selectedServices.some((serviceId) => {
      const service = catalog.find((item) => item.id === serviceId);
      const details = serviceDetails[serviceId] ?? {};
      if (!details.specialty?.trim()) return true;
      const requiredKey = service?.code === 'peluqueria' ? 'hair_lengths'
        : service?.code === 'estetica' ? 'hygiene'
        : service?.code === 'carwash' ? 'utilities'
        : service?.code === 'detailing' ? 'vehicle_types'
        : ['limpieza_regular', 'limpieza-oficinas'].includes(service?.code ?? '') ? 'frequency'
        : service?.code === 'limpieza_profunda' ? 'extras'
        : service?.code === 'mantenimiento' ? 'tools' : null;
      return requiredKey ? !details[requiredKey]?.trim() : false;
    });
    if (invalidDetails) {
      setError('Completa la especialidad y los detalles específicos de tu profesión antes de guardar.');
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
          selectedServices.map((service_type_id) => {
            const serviceTiers = pricingTiers.filter((tier) => tier.service_type_id === service_type_id);
            const baseTier = [...serviceTiers].sort((a, b) => {
              const priceDifference = parseDopPrice(tierPrices[`${service_type_id}:${a.id}`]) - parseDopPrice(tierPrices[`${service_type_id}:${b.id}`]);
              return priceDifference || Number(tierDurations[`${service_type_id}:${a.id}`]) - Number(tierDurations[`${service_type_id}:${b.id}`]);
            })[0];
            return {
              pro_id: userId,
              service_type_id,
              base_price_dop: parseDopPrice(tierPrices[`${service_type_id}:${baseTier.id}`]),
              est_minutes: Number(tierDurations[`${service_type_id}:${baseTier.id}`]),
              details: serviceDetails[service_type_id] ?? {},
              active: true,
            };
          }),
          { onConflict: 'pro_id,service_type_id' },
        );
        if (serviceError) {
          setError(`El perfil se guardó, pero no se pudieron guardar tus servicios: ${serviceError.message}`);
          setSaving(false);
          return;
        }
        const savedOffersResult = await supabase.from('pro_services').select('id, service_type_id').eq('pro_id', userId).eq('active', true);
        if (savedOffersResult.error) {
          setError(`Servicios guardados, pero no pudimos preparar sus variantes: ${savedOffersResult.error.message}`);
          setSaving(false);
          return;
        }
        const offerIdByServiceId = new Map(((savedOffersResult.data ?? []) as { id: string; service_type_id: number }[]).map((item) => [item.service_type_id, item.id]));
        const tierPriceRows = selectedServices.flatMap((serviceId) => {
          const proServiceId = offerIdByServiceId.get(serviceId);
          if (!proServiceId) return [];
          return pricingTiers
            .filter((tier) => tier.service_type_id === serviceId)
            .map((tier) => {
              const key = `${serviceId}:${tier.id}`;
              return {
                pro_service_id: proServiceId,
                pricing_tier_id: tier.id,
                price_dop: parseDopPrice(tierPrices[key]),
                est_minutes: Number(tierDurations[key]),
                active: true,
              };
            });
        });
        if (tierPriceRows.length) {
          const { error: tierPriceError } = await supabase.from('pro_service_tier_prices').upsert(
            tierPriceRows,
            { onConflict: 'pro_service_id,pricing_tier_id' },
          );
          if (tierPriceError) {
            setError(`Servicios guardados, pero no se pudieron guardar los precios por variante: ${tierPriceError.message}`);
            setSaving(false);
            return;
          }
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
      if (current.includes(serviceId)) return [];
      setServiceDetails((details) => ({ ...details, [serviceId]: details[serviceId] ?? {} }));
      return [serviceId];
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
    return <View style={styles.centered}><ActivityIndicator color={KlippColors.cobalt} /><Text style={styles.body}>Cargando perfil...</Text></View>;
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
      <BrandScreenHeader role="pro" eyebrow="ESPACIO PROFESIONAL" title="Mi perfil" subtitle="Mantén al día tu experiencia y disponibilidad." />
      {selectedServices.length > 0 && (() => {
        const selectedService = catalog.find((service) => service.id === selectedServices[0]);
        return selectedService ? (
          <View style={styles.professionHero}>
            <View style={styles.professionHeroCopy}>
              <Text style={styles.professionHeroEyebrow}>TU PROFESIÓN EN KLIPP</Text>
              <Text style={styles.professionHeroTitle}>{selectedService.name}</Text>
              <Text style={styles.professionHeroBody}>Tu perfil, tarifas y trabajos publicados se mostrarán a los clientes que busquen este servicio.</Text>
            </View>
            <Image source={serviceArt(selectedService.code)} contentFit="cover" style={styles.professionHeroArt} />
          </View>
        ) : null;
      })()}
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

      <Section title="Fotos de tus trabajos">
        <Text style={styles.body}>Muestra hasta 6 fotos reales de tus trabajos. No incluyas rostros, matrículas, direcciones, teléfonos ni datos que identifiquen a clientes.</Text>
        <View style={styles.portfolioGrid}>
          {portfolio.map((photo) => {
            const imageUrl = supabase.storage.from('pro-portfolio').getPublicUrl(photo.object_path).data.publicUrl;
            return (
              <View key={photo.id} style={styles.portfolioItem}>
                <Image source={{ uri: imageUrl }} contentFit="cover" style={styles.portfolioImage} />
                <Pressable accessibilityRole="button" onPress={() => void deletePortfolioPhoto(photo)} style={styles.portfolioDelete}>
                  <Text style={styles.portfolioDeleteText}>Eliminar</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <ActionButton disabled={uploadingPortfolio || portfolio.length >= 6} label={uploadingPortfolio ? 'Subiendo foto...' : portfolio.length >= 6 ? 'Límite de 6 fotos alcanzado' : 'Añadir foto de un trabajo'} onPress={() => void uploadPortfolioPhoto()} />
      </Section>

      <Section title="Profesión y tarifas">
        <Text style={styles.body}>Mantén una sola profesión principal y publica sus tarifas en pesos dominicanos. Klipp retiene una comisión del 7% del precio del servicio; recibirás el 93% restante antes de posibles impuestos o costes de pago.</Text>
        {catalog.map((service) => {
          const selected = selectedServices.includes(service.id);
          const requirements = equipmentByService[service.id] ?? [];
          const category = (service as ServiceType & { service_categories?: { name: string } | null }).service_categories?.name;
          return (
            <View key={service.id} style={styles.serviceEditor}>
              <Choice selected={selected} label={`${service.name}${category ? ` · ${category}` : ''}`} onPress={() => toggleService(service.id)} />
              {selected && (
                <View style={styles.serviceRequirements}>
                  <Text style={styles.requirementsTitle}>Detalles de tu profesión</Text>
                  <Text style={styles.label}>Especialidad o trabajo principal</Text>
                  <TextInput
                    onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), specialty: value } }))}
                    placeholder="Describe el trabajo que realizas"
                    style={styles.input}
                    value={serviceDetails[service.id]?.specialty ?? ''}
                  />
                  {service.code === 'peluqueria' && <><Text style={styles.label}>Tipos y largos de cabello</Text><TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), hair_lengths: value } }))} placeholder="Ej. corto, medio, largo y rizado" style={styles.input} value={serviceDetails[service.id]?.hair_lengths ?? ''} /></>}
                  {service.code === 'estetica' && <><Text style={styles.label}>Higiene y desinfección de instrumentos</Text><TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), hygiene: value } }))} placeholder="Describe tu protocolo de higiene" style={[styles.input, styles.multiline]} value={serviceDetails[service.id]?.hygiene ?? ''} /></>}
                  {service.code === 'carwash' && <><Text style={styles.label}>Agua y energía en el lugar del servicio</Text><TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), utilities: value } }))} placeholder="Explica cómo resuelves el agua y la energía con tu propio equipo" style={[styles.input, styles.multiline]} value={serviceDetails[service.id]?.utilities ?? ''} /></>}
                  {service.code === 'detailing' && <><Text style={styles.label}>Tipos de vehículos que atiendes</Text><TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), vehicle_types: value } }))} placeholder="Ej. sedanes, SUV y camionetas" style={styles.input} value={serviceDetails[service.id]?.vehicle_types ?? ''} /></>}
                  {['limpieza_regular', 'limpieza-oficinas'].includes(service.code) && <><Text style={styles.label}>Frecuencia de servicio</Text><TextInput onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), frequency: value } }))} placeholder="Ej. puntual, semanal o quincenal" style={styles.input} value={serviceDetails[service.id]?.frequency ?? ''} /></>}
                  {service.code === 'limpieza_profunda' && <><Text style={styles.label}>Alcance y tareas adicionales</Text><TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), extras: value } }))} placeholder="Describe las tareas profundas que realizas" style={[styles.input, styles.multiline]} value={serviceDetails[service.id]?.extras ?? ''} /></>}
                  {service.code === 'mantenimiento' && <><Text style={styles.label}>Herramientas y trabajos que realizas</Text><TextInput multiline onChangeText={(value) => setServiceDetails((current) => ({ ...current, [service.id]: { ...(current[service.id] ?? {}), tools: value } }))} placeholder="Describe herramientas propias y trabajos" style={[styles.input, styles.multiline]} value={serviceDetails[service.id]?.tools ?? ''} /></>}
                </View>
              )}
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
              {selected && <Text style={styles.body}>Configura cada modalidad por separado. Klipp calculará la tarifa general a partir de los precios publicados, sin pedirte un precio base adicional.</Text>}
              {selected && pricingTiers.some((tier) => tier.service_type_id === service.id) && (
                <View style={styles.serviceRequirements}>
                  <Text style={styles.requirementsTitle}>Precios por variante (RD$):</Text>
                  {pricingTiers.filter((tier) => tier.service_type_id === service.id).map((tier) => {
                    const key = `${service.id}:${tier.id}`;
                    return (
                      <View key={tier.id} style={styles.serviceFields}>
                        <View style={styles.priceField}>
                          <Text style={styles.label}>{tier.label}</Text>
                          <TextInput keyboardType="decimal-pad" onChangeText={(value) => setTierPrices((current) => ({ ...current, [key]: value }))} placeholder="Precio RD$" style={styles.input} value={tierPrices[key] ?? ''} />
                        </View>
                        <View style={styles.durationField}>
                          <Text style={styles.label}>Minutos</Text>
                          <TextInput keyboardType="number-pad" onChangeText={(value) => setTierDurations((current) => ({ ...current, [key]: value }))} placeholder="60" style={styles.input} value={tierDurations[key] ?? ''} />
                        </View>
                      </View>
                    );
                  })}
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
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 56, gap: 18, backgroundColor: KlippColors.canvas },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: KlippColors.canvas },
  title: { color: KlippColors.navy, fontSize: 27, fontWeight: '700' },
  section: { paddingVertical: 19, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: 1, borderColor: '#EAE7E0', borderRadius: 0, backgroundColor: 'transparent', gap: 16, shadowOpacity: 0, elevation: 0 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, fontWeight: '700' },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portfolioItem: { width: '47%', gap: 5 },
  portfolioImage: { width: '100%', height: 160, borderRadius: 10, backgroundColor: KlippColors.canvas },
  portfolioDelete: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: KlippColors.whiteCoral },
  portfolioDeleteText: { color: KlippColors.coral, fontSize: 12, fontWeight: '700' },
  professionHero: { minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, borderRadius: 14, overflow: 'hidden', backgroundColor: KlippColors.surfaceBlue, borderWidth: 0, borderColor: 'transparent' },
  professionHeroCopy: { flex: 1, gap: 6 },
  professionHeroEyebrow: { color: KlippColors.cobaltDark, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  professionHeroTitle: { color: KlippColors.navy, fontSize: 20, fontWeight: '800' },
  professionHeroBody: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  professionHeroArt: { width: 112, height: 104, borderRadius: 16, backgroundColor: KlippColors.white },
  statusBanner: { padding: 16, borderRadius: 18, backgroundColor: KlippColors.surfaceBlue, borderWidth: 1, borderColor: '#DCE3FF', gap: 7 },
  signOutButton: { minHeight: 46, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: KlippColors.coral, borderRadius: 12, backgroundColor: KlippColors.whiteCoral },
  signOutPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  signOutText: { color: KlippColors.danger, fontSize: 14, fontWeight: '700' },
  statusApproved: { backgroundColor: KlippColors.whiteMint },
  statusTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  label: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#DFE1E8', borderRadius: 9, paddingHorizontal: 13, color: KlippColors.ink, backgroundColor: '#FFFFFF', fontSize: 15 },
  multiline: { minHeight: 92, paddingVertical: 10, textAlignVertical: 'top' },
  choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.whiteMint },
  locationButtonText: { color: KlippColors.cobaltDark, fontSize: 14, fontWeight: '700' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  choice: { minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.white },
  choiceSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.whiteMint },
  choiceText: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: KlippColors.cobaltDark },
  serviceRequirements: { paddingHorizontal: 10, gap: 6 },
  requirementsTitle: { color: KlippColors.navy, fontSize: 12, fontWeight: '800' },
  requirementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  requirementBullet: { color: KlippColors.success, fontSize: 13, fontWeight: '800' },
  requirementCopy: { flex: 1, gap: 1 },
  requirementName: { color: KlippColors.slate, fontSize: 11, fontWeight: '700' },
  requirementDetails: { color: KlippColors.muted, fontSize: 10, lineHeight: 14 },
  serviceEditor: { gap: 9 },
  serviceFields: { flexDirection: 'row', gap: 12, paddingHorizontal: 5 },
  priceField: { flex: 1 },
  durationField: { flex: 1 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1, gap: 6 },
  actionButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.cobalt },
  actionText: { color: KlippColors.white, fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.55 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: KlippColors.border },
  slotText: { color: KlippColors.navy, fontSize: 14 },
  removeButton: { padding: 8 },
  removeText: { color: KlippColors.coral, fontSize: 13, fontWeight: '600' },
  empty: { color: KlippColors.muted, fontSize: 14, paddingVertical: 6 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: KlippColors.success, fontSize: 14, lineHeight: 20 },
  warning: { color: KlippColors.warning, fontSize: 13, lineHeight: 19, padding: 11, borderRadius: 12, backgroundColor: KlippColors.goldLight },
});