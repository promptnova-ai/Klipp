import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { heroArt, serviceArt } from '@/lib/service-art';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import * as Location from 'expo-location';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import { MotionPressable, ScreenEntrance } from '@/components/ui-primitives';
import { formatDop } from '@/lib/format';
import type { PricingTier, ProCard, ServiceType } from '@/lib/types';
import { supabase } from '../../../lib/supabase';

type EquipmentRequirement = { id: number; service_type_id: number; item_name: string; details: string; required: boolean; sort_order: number };
type CatalogService = ServiceType & {
  tiers: PricingTier[];
  category_name: string | null;
  offers: ServiceOffer[];
  equipmentRequirements: EquipmentRequirement[];
};
type SearchablePro = Pick<ProCard, 'pro_id' | 'full_name' | 'bio'>;
type ServiceOffer = {
  id: string;
  pro_id: string;
  service_type_id: number;
  base_price_dop: number;
  est_minutes: number;
  pro?: SearchablePro;
};
type CatalogCategory = { id: number; name: string };
type NearbyOffer = ServiceOffer & {
  pro_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  years_experience: number | null;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  distance_m: number;
};
type HomeCoordinate = { latitude: number; longitude: number };

function serviceIcon(code: string): ComponentProps<typeof SymbolView>['name'] {
  if (code.includes('barber') || code.includes('peluquer')) return { ios: 'scissors', android: 'content_cut', web: 'content_cut' };
  if (code.includes('estetica')) return { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' };
  if (code.includes('carwash') || code.includes('detailing')) return { ios: 'car.side.fill', android: 'directions_car', web: 'directions_car' };
  if (code.includes('mantenimiento')) return { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' };
  if (code.includes('oficinas')) return { ios: 'building.2.fill', android: 'business', web: 'business' };
  return { ios: 'sparkles', android: 'cleaning_services', web: 'cleaning_services' };
}

function serviceAccent(code: string) {
  if (code.includes('barber')) return '#3D5AFE';
  if (code.includes('peluquer')) return '#FF7058';
  if (code.includes('estetica')) return '#B879D9';
  if (code.includes('carwash')) return '#2799C7';
  if (code.includes('detailing')) return '#2C7A9B';
  if (code.includes('mantenimiento')) return '#D18A36';
  if (code.includes('oficinas')) return '#52708C';
  return '#398B70';
}

function serviceSurface(code: string) {
  if (code.includes('barber')) return '#E9EDFF';
  if (code.includes('peluquer')) return '#FFF0EC';
  if (code.includes('estetica')) return '#F5ECFA';
  if (code.includes('carwash')) return '#EAF6FB';
  if (code.includes('detailing')) return '#E8F2F6';
  if (code.includes('mantenimiento')) return '#FBF1E5';
  if (code.includes('oficinas')) return '#EDF2F7';
  return '#E7F7F0';
}

function getCategory(service: ServiceType & { category_name?: string | null }) {
  if (service.category_name) return service.category_name;
  const description = `${service.code} ${service.name}`.toLocaleLowerCase();
  if (description.includes('barber')) return 'Barbería';
  if (description.includes('estet') || description.includes('belleza') || description.includes('uña')) return 'Estética';
  if (description.includes('limpieza') || description.includes('clean')) return 'Limpieza';
  return 'Otros';
}

function ServiceSkeleton() {
  const opacity = useMemo(() => new Animated.Value(0.45), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={styles.skeletonCard}>
      <Animated.View style={[styles.skeletonIcon, { opacity }]} />
      <View style={styles.skeletonCopy}>
        <Animated.View style={[styles.skeletonLine, styles.skeletonTitle, { opacity }]} />
        <Animated.View style={[styles.skeletonLine, { opacity }]} />
        <Animated.View style={[styles.skeletonLine, styles.skeletonShort, { opacity }]} />
      </View>
    </View>
  );
}

export default function ClientHomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wideLayout = width >= 900;
  const { profile } = useAuth();
  const [services, setServices] = useState<CatalogService[]>([]);
  const [pros, setPros] = useState<SearchablePro[]>([]);
  const [categoriesData, setCategoriesData] = useState<CatalogCategory[]>([]);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [coordinate, setCoordinate] = useState<HomeCoordinate | null>(null);
  const [locationLabel, setLocationLabel] = useState('Activa tu ubicación');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [selectedService, setSelectedService] = useState<CatalogService | null>(null);
  const [selectedDetailTierId, setSelectedDetailTierId] = useState<number | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadCatalog() {
    setLoading(true);
    setLoadError(null);
    const [serviceResult, tierResult, categoryResult, equipmentResult] = await Promise.all([
      supabase.from('service_types').select('id, code, name, description, active, category_id, service_categories(name)').eq('active', true).order('name'),
      supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('price_dop'),
      supabase.from('service_categories').select('id, name').eq('active', true).order('id'),
      supabase.from('service_equipment_requirements').select('id, service_type_id, item_name, details, required, sort_order').eq('active', true).order('sort_order'),
    ]);
    const error = serviceResult.error ?? tierResult.error ?? categoryResult.error ?? equipmentResult.error;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const tiers = (tierResult.data ?? []) as PricingTier[];
    const equipment = (equipmentResult.data ?? []) as EquipmentRequirement[];
    const serviceRows = (serviceResult.data ?? []) as (ServiceType & {
      service_categories: { name: string } | { name: string }[] | null;
    })[];
    setServices(
      serviceRows.map((service) => ({
        ...service,
        category_name: (Array.isArray(service.service_categories) ? service.service_categories[0]?.name : service.service_categories?.name) ?? null,
        tiers: tiers.filter((tier) => tier.service_type_id === service.id),
        offers: [],
        equipmentRequirements: equipment.filter((item) => item.service_type_id === service.id),
      })),
    );
    setServiceIds(serviceRows.map((service) => service.id));
    setPros([]);
    setCategoriesData((categoryResult.data ?? []) as CatalogCategory[]);
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(loadCatalog);
  }, []);

  async function requestLocation() {
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Permite el acceso a tu ubicación para mostrar profesionales que trabajan cerca de ti.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoordinate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación.');
    }
  }


  useEffect(() => {
    if (!coordinate) return;
    let active = true;
    void Location.reverseGeocodeAsync(coordinate)
      .then((places) => {
        if (!active) return;
        const place = places[0];
        setLocationLabel(place ? [place.district || place.subregion, place.city || place.region].filter(Boolean).join(', ') || 'Ubicación actual' : 'Ubicación actual');
      })
      .catch((cause: unknown) => {
        if (active) {
          setLocationLabel('Ubicación actual');
          setLocationError(cause instanceof Error ? cause.message : 'No pudimos encontrar el nombre de tu ubicación.');
        }
      });
    void Promise.all(serviceIds.map((serviceId) => supabase.rpc('get_nearby_service_offers', {
      p_service_type_id: serviceId,
      p_latitude: coordinate.latitude,
      p_longitude: coordinate.longitude,
    }))).then((results) => {
      if (!active) return;
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setLoadError(failed.error.message);
        return;
      }
      const nearby = results.flatMap((result) => (result.data ?? []) as NearbyOffer[]);
      const nearbyPros = new Map<string, SearchablePro>();
      const enrichedOffers: ServiceOffer[] = nearby.map((offer) => {
        nearbyPros.set(offer.pro_id, { pro_id: offer.pro_id, full_name: offer.pro_name, bio: offer.bio });
        return {
          ...offer,
          pro: { pro_id: offer.pro_id, full_name: offer.pro_name, bio: offer.bio },
        };
      });
      setServices((current) => current.map((service) => ({
        ...service,
        offers: enrichedOffers.filter((offer) => offer.service_type_id === service.id),
      })));
      setPros([...nearbyPros.values()]);
      setLoadError(null);
    }).catch((cause: unknown) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : 'No pudimos buscar profesionales cercanos.');
    });
    return () => { active = false; };
  }, [coordinate, serviceIds]);

  const categories = useMemo(
    () => ['Todos', ...categoriesData.map((category) => category.name)],
    [categoriesData],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleServices = services.filter((service) => {
    const matchesCategory = selectedCategory === 'Todos' || getCategory(service) === selectedCategory;
    const matchesSearch =
      !normalizedSearch ||
      `${service.name} ${service.description ?? ''} ${service.tiers.map((tier) => tier.label).join(' ')} ${service.offers.map((offer) => offer.pro?.full_name ?? '').join(' ')}`
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });
  const matchingProIds = new Set(
    services
      .filter((service) => selectedCategory === 'Todos' || getCategory(service) === selectedCategory)
      .flatMap((service) => service.offers.map((offer) => offer.pro_id)),
  );
  const visiblePros = normalizedSearch
    ? pros.filter((pro) => matchingProIds.has(pro.pro_id) && `${pro.full_name ?? ''} ${pro.bio ?? ''}`.toLocaleLowerCase().includes(normalizedSearch))
    : [];

  function openBooking(service: CatalogService, tier?: PricingTier, offer?: ServiceOffer) {
    setSelectedService(null);
    router.push({
      pathname: '/new-booking',
      params: {
        serviceId: String(service.id),
        ...(tier ? { tierId: String(tier.id) } : {}),
        ...(offer ? { offerId: offer.id } : {}),
      },
    });
  }

  function showServiceDetails(service: CatalogService) {
    setSelectedService(service);
    setSelectedDetailTierId(service.offers.length > 0 ? null : service.tiers[0]?.id ?? null);
    setSelectedOfferId(service.offers[0]?.id ?? null);
  }

  function clearFilters() {
    setSearch('');
    setSelectedCategory('Todos');
  }

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const featuredService = services[0];
  const selectedDetailTier = selectedService?.tiers.find((tier) => tier.id === selectedDetailTierId);
  const selectedDetailOffer = selectedService?.offers.find((offer) => offer.id === selectedOfferId);
  const serviceCardWidth = width >= 1180 ? '31.8%' : width >= 760 ? '48.6%' : '100%';

  return (
    <ScreenEntrance style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
            <View style={styles.brandCopy}><Text style={styles.brand}>klipp</Text><Text style={styles.brandCaption}>SERVICIOS A DOMICILIO</Text></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar ubicación" onPress={() => coordinate ? router.push('/(client)/addresses') : void requestLocation()} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
            <View style={styles.locationPin}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={KlippColors.cobalt} size={18} /></View>
            <View style={styles.locationCopy}><Text style={styles.locationLabel}>SERVICIO EN</Text><Text numberOfLines={1} style={styles.locationText}>{locationLabel}</Text>{!!locationError && <Text numberOfLines={1} style={styles.locationError}>{locationError}</Text>}</View>
            <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} tintColor={KlippColors.muted} size={15} />
          </Pressable>
        </View>

        {!search && (
          <View style={[styles.hero, !wideLayout && styles.heroCompact]}>
            <View style={styles.heroCopy}>
              <View style={styles.heroBadge}><View style={styles.heroBadgeDot} /><Text style={styles.heroBadgeText}>KLIPP · REPÚBLICA DOMINICANA</Text></View>
              <Text style={styles.heroTitle}>Hola{firstName ? `, ${firstName}` : ''}.{ '\n' }Tu día fluye mejor con Klipp.</Text>
              <Text style={styles.heroText}>Encuentra profesionales verificados para tu hogar, tu vehículo y tu cuidado personal. Reserva en minutos y sigue cada paso desde la app.</Text>
              <View style={styles.heroBenefits}>
                <View style={styles.heroBenefit}><SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} tintColor="#BCEBD8" size={16} /><Text style={styles.heroBenefitText}>Perfiles verificados</Text></View>
                <View style={styles.heroBenefit}><SymbolView name={{ ios: 'location.fill', android: 'near_me', web: 'near_me' }} tintColor="#BCEBD8" size={16} /><Text style={styles.heroBenefitText}>Seguimiento en vivo</Text></View>
              </View>
              {featuredService && <MotionPressable accessibilityLabel="Explorar servicios" onPress={() => showServiceDetails(featuredService)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Explorar servicios</Text><SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor={KlippColors.cobaltDark} size={17} /></MotionPressable>}
            </View>
            <View style={[styles.heroVisual, !wideLayout && styles.heroVisualCompact]}>
              <Image source={heroArt} contentFit="cover" transition={350} style={styles.heroImage} />
              <View style={styles.heroVisualScrim} />
              <View style={styles.heroVisualNote}><View style={styles.heroVisualIcon}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.cobaltDark} size={17} /></View><View style={styles.heroVisualCopy}><Text style={styles.heroVisualTitle}>Todo resuelto, en un solo lugar</Text><Text style={styles.heroVisualText}>De la reserva al seguimiento.</Text></View></View>
              <View style={styles.heroVisualOrb} />
            </View>
          </View>
        )}

        <View style={styles.searchBar}>
          <View style={styles.searchIcon}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={KlippColors.cobalt} size={19} /></View>
          <TextInput accessibilityLabel="Buscar servicios o profesionales" autoCapitalize="none" onChangeText={setSearch} placeholder="¿Qué servicio necesitas hoy?" placeholderTextColor={KlippColors.muted} returnKeyType="search" style={styles.searchInput} value={search} />
          {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setSearch('')} style={styles.clearSearch}><SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={KlippColors.muted} size={18} /></Pressable>}
          <View style={styles.searchAction}><SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} tintColor="#FFFFFF" size={17} /></View>
        </View>

        <View style={styles.catalogHeader}>
          <View style={styles.catalogHeadingCopy}><Text style={styles.sectionEyebrow}>DESCUBRE KLIPP</Text><Text style={styles.sectionTitle}>¿Qué necesitas resolver?</Text><Text style={styles.sectionIntro}>Elige un servicio. Nosotros conectamos contigo al profesional adecuado.</Text></View>
          <View style={styles.catalogIcon}><SymbolView name={{ ios: 'square.grid.2x2.fill', android: 'grid_view', web: 'grid_view' }} tintColor={KlippColors.cobalt} size={20} /></View>
        </View>

        <View style={styles.categoryGrid}>
          {categoriesData.map((category) => {
            const selected = selectedCategory === category.name;
            const categoryService = services.find((service) => getCategory(service) === category.name);
            const art = categoryService ? serviceArt(categoryService.code) : heroArt;
            return (
              <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={category.id} onPress={() => setSelectedCategory(selected ? 'Todos' : category.name)} style={({ pressed }) => [styles.categoryTile, selected && styles.categoryTileSelected, pressed && styles.pressed]}>
                <Image source={art} contentFit="cover" transition={250} style={styles.categoryTileImage} />
                <View style={styles.categoryTileShade} />
                <View style={styles.categoryTileFooter}>
                  <Text numberOfLines={2} style={styles.categoryTileTitle}>{category.name}</Text>
                  <View style={[styles.categoryTileArrow, selected && styles.categoryTileArrowSelected]}><SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor={selected ? '#FFFFFF' : KlippColors.ink} size={14} /></View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {loading ? <View style={[styles.serviceList, width >= 760 && styles.serviceListWide]}><ServiceSkeleton /><ServiceSkeleton /></View>
        : loadError ? <View style={styles.emptyState}><Text style={styles.emptyTitle}>No pudimos cargar el catálogo</Text><Text style={styles.emptyText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void loadCatalog()} style={styles.clearButton}><Text style={styles.clearButtonText}>Intentar de nuevo</Text></Pressable></View>
        : visibleServices.length === 0 && visiblePros.length === 0 ? <View style={styles.emptyState}><View style={styles.emptyIcon}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={KlippColors.cobalt} size={25} /></View><Text style={styles.emptyTitle}>No encontramos resultados</Text><Text style={styles.emptyText}>{selectedCategory !== 'Todos' ? 'No encontramos servicios en esta categoría. Prueba otra búsqueda o limpia los filtros.' : 'Prueba otra búsqueda para descubrir servicios y profesionales.'}</Text><Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><Text style={styles.clearButtonText}>Limpiar filtros</Text></Pressable></View>
        : <View style={[styles.serviceList, width >= 760 && styles.serviceListWide]}>
            {visibleServices.map((service) => {
              const priceOptions = service.offers.filter((offer) => offer.base_price_dop > 0).map((offer) => ({ price: offer.base_price_dop, duration: offer.est_minutes })).sort((a,b) => a.price-b.price);
              const lowestOption = priceOptions[0];
              return <MotionPressable accessibilityLabel={`Ver detalles de ${service.name}`} key={service.id} onPress={() => showServiceDetails(service)} style={[styles.serviceCard, { width: serviceCardWidth }]}>
                <View style={styles.servicePhotoWrap}><Image source={serviceArt(service.code)} contentFit="cover" transition={280} style={styles.servicePhoto} /><View style={styles.servicePhotoWash} /><View style={[styles.servicePhotoBadge, { backgroundColor: serviceSurface(service.code) }]}><SymbolView name={serviceIcon(service.code)} tintColor={serviceAccent(service.code)} size={21} /></View><View style={styles.photoLabel}><Text style={styles.photoLabelText}>{getCategory(service)}</Text></View></View>
                <View style={styles.serviceCopy}><View style={styles.serviceCardTop}><Text numberOfLines={2} style={styles.serviceTitle}>{service.name}</Text><SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor={KlippColors.cobalt} size={17} /></View><Text numberOfLines={2} style={styles.serviceDescription}>{service.description || 'Un servicio cuidado por profesionales verificados.'}</Text><View style={styles.serviceMeta}>{lowestOption ? <Text style={styles.servicePrice}>Desde {formatDop(lowestOption.price)}</Text> : <Text style={styles.servicePriceHint}>Tarifa según modalidad</Text>}{lowestOption && <Text style={styles.metaDot}>·</Text>}{lowestOption && <Text style={styles.serviceDuration}>{lowestOption.duration} min aprox.</Text>}</View><Text style={styles.serviceLink}>Ver servicio</Text></View>
              </MotionPressable>;
            })}
            {visiblePros.length > 0 && <View style={styles.proResults}><Text style={styles.proResultsTitle}>Profesionales</Text>{visiblePros.map((pro) => <View key={pro.pro_id} style={styles.proResult}><View style={styles.proAvatar}><Text style={styles.proAvatarText}>{pro.full_name?.[0] ?? 'K'}</Text></View><View style={styles.proResultCopy}><Text style={styles.proResultName}>{pro.full_name ?? 'Profesional Klipp'}</Text><Text numberOfLines={2} style={styles.proResultBio}>{pro.bio || 'Profesional verificado de Klipp'}</Text></View></View>)}</View>}
          </View>}

        <View style={styles.trustRow}><View style={styles.trustIcon}><SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor="#247A5A" size={19} /></View><View style={styles.trustCopy}><Text style={styles.trustTitle}>Una experiencia cuidada de principio a fin</Text><Text style={styles.trustText}>Tarifas visibles, profesionales verificados y seguimiento desde Klipp.</Text></View><View style={styles.trustArrow}><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#247A5A" size={17} /></View></View>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedService(null)}
        transparent
        visible={!!selectedService}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalles" onPress={() => setSelectedService(null)} style={styles.modalBackdrop} />
          {selectedService && (
            <View style={styles.detailSheet}>
              <View style={styles.sheetHandle} />
              <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailIllustration}>
                  <Image source={serviceArt(selectedService.code)} contentFit="cover" transition={260} style={styles.detailArt} />
                </View>
                <Text style={styles.detailCategory}>{getCategory(selectedService)}</Text>
                <Text style={styles.detailTitle}>{selectedService.name}</Text>
                <Text style={styles.detailDescription}>{selectedService.description || 'Un servicio profesional, con tarifa y duración claras antes de confirmar.'}</Text>
                <View style={styles.equipmentNotice}>
                  <Text style={styles.equipmentNoticeTitle}>El profesional lleva sus propias herramientas</Text>
                  <Text style={styles.equipmentNoticeBody}>No tendrás que prestar herramientas, equipos ni productos. El profesional acudirá con sus propios materiales para realizar el servicio contratado.</Text>
                  {selectedService.equipmentRequirements.length > 0 && (
                    <View style={styles.equipmentItems}>
                      <Text style={styles.equipmentItemsTitle}>Equipamiento previsto para este servicio</Text>
                      {selectedService.equipmentRequirements.map((item) => (
                        <View key={item.id} style={styles.equipmentItem}>
                          <Text style={styles.equipmentBullet}>✓</Text>
                          <View style={styles.equipmentItemCopy}>
                            <Text style={styles.equipmentItemName}>{item.item_name}</Text>
                            {!!item.details && <Text style={styles.equipmentItemDetails}>{item.details}</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.benefitList}>
                  {['Profesionales verificados', 'Precio confirmado antes del pago', 'Seguimiento desde Klipp'].map((benefit) => (
                    <View key={benefit} style={styles.benefit}>
                      <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor="#047857" size={18} />
                      <Text style={styles.benefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>
                {selectedService.offers.length > 0 && <Text style={styles.tierHeading}>Profesionales y precios</Text>}
                {selectedService.offers.map((offer) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: offer.id === selectedOfferId }}
                    key={offer.id}
                    onPress={() => { setSelectedOfferId(offer.id); setSelectedDetailTierId(null); }}
                    style={({ pressed }) => [styles.tierCard, offer.id === selectedOfferId && styles.tierCardSelected, pressed && styles.pressed]}>
                    <View style={styles.tierCopy}>
                      <Text style={styles.tierTitle}>{offer.pro?.full_name ?? 'Profesional Klipp'}</Text>
                      <Text style={styles.tierMeta}>{offer.est_minutes} min · precio base</Text>
                    </View>
                    <Text style={styles.tierPrice}>{formatDop(offer.base_price_dop)}</Text>
                  </Pressable>
                ))}
                {selectedService.tiers.length > 0 && <Text style={styles.tierHeading}>Elige la modalidad del servicio</Text>}
                {selectedService.tiers.map((tier) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: tier.id === selectedDetailTierId }}
                    key={tier.id}
                    onPress={() => { setSelectedDetailTierId(tier.id); setSelectedOfferId(null); }}
                    style={({ pressed }) => [styles.tierCard, !selectedDetailOffer && tier.id === selectedDetailTierId && styles.tierCardSelected, pressed && styles.pressed]}>
                    <View style={styles.tierCopy}>
                      <Text style={styles.tierTitle}>{tier.label}</Text>
                      <Text style={styles.tierMeta}>{tier.est_minutes} min aprox.</Text>
                    </View>
                    <Text style={styles.tierPrice}>{tier.price_dop > 0 ? formatDop(tier.price_dop) : 'Precio del profesional'}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  disabled={!selectedDetailOffer && !selectedDetailTier}
                  onPress={() => {
                    if (selectedDetailOffer) openBooking(selectedService, undefined, selectedDetailOffer);
                    else if (selectedDetailTier) openBooking(selectedService, selectedDetailTier);
                  }}
                  style={({ pressed }) => [styles.bookButton, pressed && styles.buttonPressed, !selectedDetailOffer && !selectedDetailTier && styles.disabled]}>
                  <Text style={styles.bookButtonText}>Reservar cita</Text>
                  <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={KlippColors.white} size={17} />
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </ScrollView>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  brandCopy: { gap: 1 },
  brandCaption: { color: '#72778A', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  locationPin: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E9EDFF', alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1, minWidth: 0 },
  heroCompact: { flexDirection: 'column' },
  heroCopy: { flex: 1.05, justifyContent: 'center', alignItems: 'flex-start', padding: 30, gap: 16 },
  heroBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#BCEBD8' },
  heroBenefits: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  heroBenefit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroBenefitText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  heroVisual: { flex: 0.95, minHeight: 314, position: 'relative', overflow: 'hidden', margin: 9, borderRadius: 23, backgroundColor: '#DCE3F6' },
  heroVisualCompact: { flex: undefined, minHeight: 190, marginTop: 0 },
  heroVisualScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', backgroundColor: 'rgba(17,27,58,0.28)' },
  heroVisualNote: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)' },
  heroVisualIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E9EDFF', alignItems: 'center', justifyContent: 'center' },
  heroVisualCopy: { flex: 1, gap: 3 },
  heroVisualTitle: { color: '#171B2D', fontSize: 11, fontWeight: '900' },
  heroVisualText: { color: '#72778A', fontSize: 10 },
  heroVisualOrb: { position: 'absolute', right: -45, top: -45, width: 135, height: 135, borderRadius: 70, borderWidth: 18, borderColor: 'rgba(255,255,255,0.25)' },
  searchIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#E9EDFF', alignItems: 'center', justifyContent: 'center' },
  searchAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#3D5AFE', alignItems: 'center', justifyContent: 'center' },
  catalogHeadingCopy: { flex: 1, gap: 2 },
  sectionIntro: { color: '#72778A', fontSize: 12, lineHeight: 18, marginTop: 4 },
  catalogIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#E9EDFF', alignItems: 'center', justifyContent: 'center' },
  servicePhotoWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,27,45,0.035)' },
  trustArrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  page: { width: '100%', maxWidth: 1320, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 76, gap: 23, backgroundColor: '#F7F5F0' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#3D5AFE', alignItems: 'center', justifyContent: 'center', shadowColor: '#3048D8', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 3 },
  logoLetter: { color: KlippColors.white, fontSize: 21, fontWeight: '800' },
  brand: { color: '#171B2D', fontSize: 25, lineHeight: 27, fontWeight: '900', letterSpacing: -1 },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 310, minWidth: 180, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E8E5DE', backgroundColor: '#FFFFFF' },
  locationLabel: { color: '#72778A', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  locationText: { color: '#171B2D', fontSize: 12, fontWeight: '800', marginTop: 3 },
  locationError: { color: KlippColors.danger, fontSize: 12, lineHeight: 18 },
  greetingBlock: { gap: 5, marginTop: 2 },
  greeting: { color: KlippColors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.9 },
  wave: { color: KlippColors.gold, fontSize: 20 },
  greetingSubtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22 },
  searchBar: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: -2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E5DE', shadowColor: '#171B2D', shadowOpacity: 0.055, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 3 },
  searchInput: { flex: 1, height: 54, color: '#171B2D', fontSize: 15, fontWeight: '600' },
  clearSearch: { padding: 5 },
  hero: { minHeight: 330, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden', borderRadius: 30, backgroundColor: '#3048D8', shadowColor: '#3048D8', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 16 }, shadowRadius: 28, elevation: 6 },
  heroImage: { width: '100%', height: '100%' },
  heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17,24,45,0.56)' },
  heroAccent: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', right: -100, top: -120, opacity: 0.8 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 39, lineHeight: 45, fontWeight: '900', letterSpacing: -1.7, maxWidth: 520 },
  heroText: { maxWidth: 510, color: '#E7EAFF', fontSize: 14, lineHeight: 22 },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 2, paddingHorizontal: 19, alignSelf: 'flex-start', borderRadius: 15, backgroundColor: '#FFFFFF' },
  primaryButtonText: { color: '#3048D8', fontSize: 14, fontWeight: '900' },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionEyebrow: { color: '#3048D8', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { color: '#171B2D', fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.9, marginTop: 5 },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryTile: { width: '48.5%', minHeight: 142, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E9EDFF', borderWidth: 1, borderColor: '#E8E5DE' },
  categoryTileSelected: { borderWidth: 2, borderColor: '#3D5AFE' },
  categoryTileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  categoryTileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23,27,45,0.18)' },
  categoryTileFooter: { flex: 1, minHeight: 142, padding: 13, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  categoryTileTitle: { flex: 1, color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  categoryTileArrow: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  categoryTileArrowSelected: { backgroundColor: '#3D5AFE' },
  categories: { gap: 9, paddingVertical: 2 },
  categoryPill: { minHeight: 41, justifyContent: 'center', paddingHorizontal: 17, borderRadius: 999, borderWidth: 1, borderColor: '#E3E0D9', backgroundColor: '#FFFFFF' },
  categorySelected: { borderColor: '#3D5AFE', backgroundColor: '#3D5AFE' },
  categoryText: { color: '#555B6F', fontSize: 12, fontWeight: '800' },
  categoryTextSelected: { color: KlippColors.white },
  serviceList: { flexDirection: 'column', gap: 18 },
  serviceListWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: '1.7%', rowGap: 20 },
  serviceCard: { flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 9, borderRadius: 25, borderWidth: 1, borderColor: '#E8E5DE', backgroundColor: '#FFFFFF', shadowColor: '#171B2D', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 3 },
  serviceCardWide: { width: '48.5%' },
  serviceCardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  servicePhotoWrap: { height: 190, overflow: 'hidden', borderRadius: 18, backgroundColor: '#E9EDFF' },
  servicePhoto: { width: '100%', height: '100%' },
  servicePhotoBadge: { position: 'absolute', left: 12, bottom: 12, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  photoLabel: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(23,27,45,0.78)' },
  photoLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.35 },
  serviceCopy: { gap: 9, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 13 },
  serviceCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  serviceTitle: { flex: 1, color: '#171B2D', fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: -0.4 },
  categoryTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: KlippColors.surfaceMuted },
  categoryTagText: { color: KlippColors.muted, fontSize: 10, fontWeight: '700' },
  serviceDescription: { color: '#72778A', fontSize: 12, lineHeight: 18 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  servicePrice: { color: '#3048D8', fontSize: 13, fontWeight: '900' },
  servicePriceHint: { color: KlippColors.muted, fontSize: 12, fontWeight: '600' },
  metaDot: { color: KlippColors.muted },
  serviceDuration: { color: KlippColors.muted, fontSize: 12 },
  serviceLink: { color: '#3048D8', fontSize: 12, fontWeight: '900', marginTop: 3 },
  linkArrow: { fontSize: 18 },
  proResults: { padding: 16, borderRadius: 18, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, gap: 12 },
  proResultsTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  proResult: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.surfaceBlue },
  proAvatarText: { color: KlippColors.blueDark, fontSize: 16, fontWeight: '700' },
  proResultCopy: { flex: 1, gap: 3 },
  proResultName: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  proResultBio: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: 'center', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.surfaceBlue },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: KlippColors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  clearButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 2, borderRadius: 12, backgroundColor: KlippColors.surfaceBlue },
  clearButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  skeletonCard: { flexDirection: 'row', gap: 14, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  skeletonIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E9EDFF' },
  skeletonCopy: { flex: 1, gap: 10, paddingVertical: 2 },
  skeletonLine: { width: '90%', height: 10, borderRadius: 5, backgroundColor: '#E8E5DE' },
  skeletonTitle: { width: '55%', height: 13 },
  skeletonShort: { width: '40%' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 19, backgroundColor: '#E7F7F0', borderWidth: 1, borderColor: '#BCEBD8' },
  trustIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  trustCopy: { flex: 1, gap: 3 },
  trustTitle: { color: '#171B2D', fontSize: 14, fontWeight: '900' },
  trustText: { color: '#596477', fontSize: 12, lineHeight: 18 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.42)' },
  modalBackdrop: { ...StyleSheet.absoluteFill },
  detailSheet: { maxHeight: '92%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: KlippColors.canvas },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 8 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  detailIllustration: { height: 174, overflow: 'hidden', borderRadius: 20, backgroundColor: KlippColors.surfaceBlue },
  detailIllustrationIcon: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: KlippColors.white },
  detailArt: { width: '100%', height: '100%' },
  detailCategory: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  detailTitle: { color: KlippColors.navy, fontSize: 23, fontWeight: '700' },
  equipmentNotice: { padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#3F3F46', backgroundColor: KlippColors.surfaceMuted, gap: 8 },
  equipmentNoticeTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  equipmentNoticeBody: { color: KlippColors.slate, fontSize: 13, lineHeight: 19 },
  equipmentItems: { marginTop: 4, gap: 9 },
  equipmentItemsTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  equipmentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  equipmentBullet: { color: KlippColors.slate, fontSize: 15, fontWeight: '800' },
  equipmentItemCopy: { flex: 1, gap: 2 },
  equipmentItemName: { color: KlippColors.navy, fontSize: 12, fontWeight: '700' },
  equipmentItemDetails: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  detailDescription: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  benefitList: { gap: 10, paddingVertical: 3 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  benefitText: { color: KlippColors.slate, fontSize: 13, fontWeight: '500' },
  tierHeading: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', marginTop: 4 },
  tierCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  tierCardSelected: { borderColor: '#B8CBFF', backgroundColor: KlippColors.surfaceBlue },
  tierCopy: { gap: 4 },
  tierTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  tierMeta: { color: KlippColors.muted, fontSize: 12 },
  tierPrice: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '800' },
  bookButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 5, borderRadius: 14, backgroundColor: KlippColors.blue },
  bookButtonText: { color: KlippColors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
