import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import { formatDop } from '@/lib/format';
import type { PricingTier, ProCard, ServiceType } from '@/lib/types';
import { supabase } from '../../../lib/supabase';

type CatalogService = ServiceType & {
  tiers: PricingTier[];
  category_name: string | null;
  offers: ServiceOffer[];
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

function getCategory(service: ServiceType & { category_name?: string | null }) {
  if (service.category_name) return service.category_name;
  const description = `${service.code} ${service.name}`.toLocaleLowerCase();
  if (description.includes('barber')) return 'Barbería';
  if (description.includes('estet') || description.includes('belleza') || description.includes('uña')) return 'Estética';
  if (description.includes('limpieza') || description.includes('clean')) return 'Limpieza';
  return 'Otros';
}

function getCategoryGlyph(category: string) {
  const value = category.toLocaleLowerCase();
  if (value.includes('todos')) return '✦';
  if (value.includes('limpieza')) return '✧';
  if (value.includes('belleza') || value.includes('estét') || value.includes('barber')) return '✂';
  if (value.includes('plomer') || value.includes('agua')) return '◉';
  if (value.includes('electric')) return 'ϟ';
  if (value.includes('jard')) return '❋';
  if (value.includes('hogar') || value.includes('casa')) return '⌂';
  return '✳';
}

function getServiceSymbol(service: Pick<ServiceType, 'name' | 'code'> & { category_name?: string | null }) {
  const value = (service.category_name ?? '') + ' ' + service.name + ' ' + service.code;
  const normalized = value.toLocaleLowerCase();
  if (normalized.includes('limpieza') || normalized.includes('clean')) return { ios: 'sparkles', android: 'cleaning_services', web: 'cleaning_services' };
  if (normalized.includes('barber') || normalized.includes('belleza') || normalized.includes('estét') || normalized.includes('uña')) return { ios: 'scissors', android: 'content_cut', web: 'content_cut' };
  if (normalized.includes('plomer') || normalized.includes('agua')) return { ios: 'drop.fill', android: 'water_drop', web: 'water_drop' };
  if (normalized.includes('electric')) return { ios: 'bolt.fill', android: 'bolt', web: 'bolt' };
  if (normalized.includes('jard')) return { ios: 'leaf.fill', android: 'yard', web: 'yard' };
  if (normalized.includes('repar') || normalized.includes('manten')) return { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' };
  return { ios: 'house.fill', android: 'home', web: 'home' };
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
    const [serviceResult, tierResult, categoryResult] = await Promise.all([
      supabase.from('service_types').select('id, code, name, description, active, category_id, service_categories(name)').eq('active', true).order('name'),
      supabase.from('pricing_tiers').select('id, service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes').order('price_dop'),
      supabase.from('service_categories').select('id, name').eq('active', true).order('id'),
    ]);
    const error = serviceResult.error ?? tierResult.error ?? categoryResult.error;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const tiers = (tierResult.data ?? []) as PricingTier[];
    const serviceRows = (serviceResult.data ?? []) as (ServiceType & {
      service_categories: { name: string } | { name: string }[] | null;
    })[];
    setServices(
      serviceRows.map((service) => ({
        ...service,
        category_name: (Array.isArray(service.service_categories) ? service.service_categories[0]?.name : service.service_categories?.name) ?? null,
        tiers: tiers.filter((tier) => tier.service_type_id === service.id),
        offers: [],
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

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
          <View>
            <Text style={styles.brand}>klipp</Text>
            <Text style={styles.brandCaption}>SERVICIOS A DOMICILIO</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar ubicación" onPress={() => coordinate ? router.push('/(client)/addresses') : void requestLocation()} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
          <View style={styles.locationPin}>
            <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#315BFF" size={17} />
          </View>
          <View style={styles.locationCopy}>
            <Text style={styles.locationLabel}>SERVICIO EN</Text>
            <Text numberOfLines={1} style={styles.locationText}>{locationLabel}</Text>
          </View>
          <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} tintColor="#64748B" size={14} />
        </Pressable>
      </View>
      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>Hola{firstName ? ', ' + firstName : ''} <Text style={styles.wave}>✦</Text></Text>
        <Text style={styles.greetingSubtitle}>¿Qué necesitas resolver hoy?</Text>
      </View>
      <View style={styles.searchBar}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor="#64748B" size={20} />
        <TextInput accessibilityLabel="Buscar servicios o profesionales" autoCapitalize="none" onChangeText={setSearch} placeholder="Ej. limpieza, plomería, belleza..." placeholderTextColor="#8792A5" returnKeyType="search" style={styles.searchInput} value={search} />
        {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setSearch('')} style={styles.clearSearch}><SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor="#8792A5" size={18} /></Pressable>}
      </View>
      {!coordinate && !search && (
        <Pressable accessibilityRole="button" onPress={() => void requestLocation()} style={({ pressed }) => [styles.locationPrompt, pressed && styles.pressed]}>
          <View style={styles.locationPromptIcon}><SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} tintColor="#315BFF" size={19} /></View>
          <View style={styles.locationPromptCopy}>
            <Text style={styles.locationPromptTitle}>Encuentra profesionales cerca de ti</Text>
            <Text style={styles.locationPromptBody}>Indica dónde necesitas el servicio para consultar disponibilidad y precios.</Text>
          </View>
          <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#315BFF" size={18} />
        </Pressable>
      )}
      {locationError && <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text>}
      {!search && (
        <View style={styles.hero}>
          <View style={styles.heroDecorOne} />
          <View style={styles.heroDecorTwo} />
          <View style={styles.heroBadge}>
            <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} tintColor="#C7D4FF" size={14} />
            <Text style={styles.heroBadgeText}>TU DÍA, MÁS FÁCIL</Text>
          </View>
          <Text style={styles.heroTitle}>Tu hogar en buenas manos.</Text>
          <Text style={styles.heroText}>Servicios confiables, profesionales verificados y reservas sin complicaciones.</Text>
          <View style={styles.heroFooter}>
            <Pressable accessibilityRole="button" onPress={() => featuredService && showServiceDetails(featuredService)} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.primaryButtonText}>Descubrir servicios</Text>
              <SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor="#2348D9" size={16} />
            </Pressable>
            <View style={styles.heroTrust}>
              <SymbolView name={{ ios: 'shield.lefthalf.filled', android: 'verified_user', web: 'verified_user' }} tintColor="#D6E0FF" size={15} />
              <Text style={styles.heroTrustText}>Confiables</Text>
            </View>
          </View>
        </View>
      )}
      <View style={styles.sectionHeadingRow}>
        <View><Text style={styles.sectionEyebrow}>EXPLORA POR CATEGORÍA</Text><Text style={styles.sectionTitle}>¿Qué estás buscando?</Text></View>
        {selectedCategory !== 'Todos' && <Pressable accessibilityRole="button" onPress={() => setSelectedCategory('Todos')} style={styles.resetCategory}><Text style={styles.resetCategoryText}>Ver todas</Text></Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTiles}>
        {categories.map((category) => {
          const selected = selectedCategory === category;
          const serviceCount = category === 'Todos' ? services.length : services.filter((service) => getCategory(service) === category).length;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={category} onPress={() => setSelectedCategory(category)} style={({ pressed }) => [styles.categoryTile, selected && styles.categoryTileSelected, pressed && styles.pressed]}>
              <View style={[styles.categoryIcon, selected && styles.categoryIconSelected]}><Text style={styles.categoryGlyph}>{getCategoryGlyph(category)}</Text></View>
              <Text numberOfLines={1} style={[styles.categoryTileTitle, selected && styles.categoryTileTitleSelected]}>{category}</Text>
              <Text style={[styles.categoryTileCount, selected && styles.categoryTileCountSelected]}>{serviceCount} {serviceCount === 1 ? 'servicio' : 'servicios'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.sectionHeadingRow}>
        <View><Text style={styles.sectionEyebrow}>{coordinate ? 'DISPONIBLES PARA TU ZONA' : 'CATÁLOGO KLIPP'}</Text><Text style={styles.sectionTitle}>Servicios para ti</Text></View>
        <View style={styles.catalogCount}><Text style={styles.catalogCountText}>{visibleServices.length}</Text></View>
      </View>
      {loading ? (
        <View style={styles.serviceList}><ServiceSkeleton /><ServiceSkeleton /></View>
      ) : loadError ? (
        <View style={styles.emptyState}><Text style={styles.emptyTitle}>No pudimos cargar el catálogo</Text><Text style={styles.emptyText}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => void loadCatalog()} style={styles.clearButton}><Text style={styles.clearButtonText}>Intentar de nuevo</Text></Pressable></View>
      ) : visibleServices.length === 0 && visiblePros.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor="#315BFF" size={25} /></View>
          <Text style={styles.emptyTitle}>No encontramos resultados</Text>
          <Text style={styles.emptyText}>{selectedCategory !== 'Todos' ? 'No encontramos servicios en esta categoría. Prueba otra o limpia los filtros.' : 'Prueba otra búsqueda para descubrir servicios y profesionales.'}</Text>
          <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><Text style={styles.clearButtonText}>Limpiar filtros</Text></Pressable>
        </View>
      ) : (
        <View style={styles.serviceList}>
          {visibleServices.map((service) => {
            const priceOptions = [
              ...service.offers.map((offer) => ({ price: offer.base_price_dop, duration: offer.est_minutes })),
              ...service.tiers.map((tier) => ({ price: tier.price_dop, duration: tier.est_minutes })),
            ].sort((left, right) => left.price - right.price);
            const lowestOption = priceOptions[0];
            return (
              <Pressable accessibilityRole="button" key={service.id} onPress={() => showServiceDetails(service)} style={({ pressed }) => [styles.serviceCard, pressed && styles.cardPressed]}>
                <View style={styles.serviceCardVisual}>
                  <View style={styles.serviceCardIcon}><SymbolView name={getServiceSymbol(service)} tintColor="#315BFF" size={25} /></View>
                  <View style={styles.serviceVisualCaption}><Text style={styles.serviceVisualCaptionText}>{getCategory(service)}</Text></View>
                </View>
                <View style={styles.serviceCopy}>
                  <View style={styles.serviceCardTop}><Text style={styles.serviceTitle}>{service.name}</Text><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#98A3B5" size={16} /></View>
                  <Text numberOfLines={2} style={styles.serviceDescription}>{service.description || 'Un servicio cuidado por profesionales verificados.'}</Text>
                  <View style={styles.serviceFooter}>
                    {lowestOption ? <View><Text style={styles.priceCaption}>DESDE</Text><Text style={styles.servicePrice}>{formatDop(lowestOption.price)}</Text></View> : <Text style={styles.servicePrice}>Consultar disponibilidad</Text>}
                    {lowestOption && <View style={styles.durationPill}><SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} tintColor="#64748B" size={12} /><Text style={styles.serviceDuration}>{lowestOption.duration} min</Text></View>}
                  </View>
                </View>
              </Pressable>
            );
          })}
          {visiblePros.length > 0 && (
            <View style={styles.proResults}>
              <View style={styles.sectionHeadingRow}><View><Text style={styles.sectionEyebrow}>COINCIDENCIAS</Text><Text style={styles.proResultsTitle}>Profesionales</Text></View><Text style={styles.catalogCountText}>{visiblePros.length}</Text></View>
              {visiblePros.map((pro) => (
                <View key={pro.pro_id} style={styles.proResult}>
                  <View style={styles.proAvatar}><Text style={styles.proAvatarText}>{pro.full_name?.[0] ?? 'K'}</Text></View>
                  <View style={styles.proResultCopy}><Text style={styles.proResultName}>{pro.full_name ?? 'Profesional Klipp'}</Text><Text numberOfLines={2} style={styles.proResultBio}>{pro.bio || 'Profesional verificado de Klipp'}</Text></View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <View style={styles.trustRow}>
        <View style={styles.trustIcon}><SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor="#0F987A" size={20} /></View>
        <View style={styles.trustCopy}><Text style={styles.trustTitle}>Reserva con tranquilidad</Text><Text style={styles.trustText}>Consulta profesionales, precios y horarios antes de confirmar.</Text></View>
      </View>
      <Modal animationType="slide" onRequestClose={() => setSelectedService(null)} transparent visible={!!selectedService}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalles" onPress={() => setSelectedService(null)} style={styles.modalBackdrop} />
          {selectedService && (
            <View style={styles.detailSheet}>
              <View style={styles.sheetHandle} />
              <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailIllustration}><View style={styles.detailIllustrationIcon}><SymbolView name={getServiceSymbol(selectedService)} tintColor="#315BFF" size={34} /></View><Text style={styles.detailCategory}>{getCategory(selectedService)}</Text></View>
                <Text style={styles.detailTitle}>{selectedService.name}</Text>
                <Text style={styles.detailDescription}>{selectedService.description || 'Un servicio de calidad para que disfrutes de un hogar cuidado.'}</Text>
                <View style={styles.benefitList}>
                  {['Profesionales verificados', 'Precio claro antes de reservar', 'Elige el horario que prefieras'].map((benefit) => (
                    <View key={benefit} style={styles.benefit}><SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} tintColor="#0F987A" size={18} /><Text style={styles.benefitText}>{benefit}</Text></View>
                  ))}
                </View>
                {selectedService.offers.length > 0 && <Text style={styles.tierHeading}>Profesionales y precios</Text>}
                {selectedService.offers.map((offer) => (
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: offer.id === selectedOfferId }} key={offer.id} onPress={() => { setSelectedOfferId(offer.id); setSelectedDetailTierId(null); }} style={({ pressed }) => [styles.tierCard, offer.id === selectedOfferId && styles.tierCardSelected, pressed && styles.pressed]}>
                    <View style={styles.tierCopy}><Text style={styles.tierTitle}>{offer.pro?.full_name ?? 'Profesional Klipp'}</Text><Text style={styles.tierMeta}>{offer.est_minutes} min · servicio a domicilio</Text></View><Text style={styles.tierPrice}>{formatDop(offer.base_price_dop)}</Text>
                  </Pressable>
                ))}
                {selectedService.tiers.length > 0 && <Text style={styles.tierHeading}>Elige el tamaño de tu hogar</Text>}
                {selectedService.tiers.map((tier) => (
                  <Pressable accessibilityRole="radio" accessibilityState={{ selected: tier.id === selectedDetailTierId }} key={tier.id} onPress={() => { setSelectedDetailTierId(tier.id); setSelectedOfferId(null); }} style={({ pressed }) => [styles.tierCard, !selectedDetailOffer && tier.id === selectedDetailTierId && styles.tierCardSelected, pressed && styles.pressed]}>
                    <View style={styles.tierCopy}><Text style={styles.tierTitle}>{tier.label}</Text><Text style={styles.tierMeta}>{tier.est_minutes} min aprox.</Text></View><Text style={styles.tierPrice}>{formatDop(tier.price_dop)}</Text>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" disabled={!selectedDetailOffer && !selectedDetailTier} onPress={() => { if (selectedDetailOffer) openBooking(selectedService, undefined, selectedDetailOffer); else if (selectedDetailTier) openBooking(selectedService, selectedDetailTier); }} style={({ pressed }) => [styles.bookButton, pressed && styles.buttonPressed, !selectedDetailOffer && !selectedDetailTier && styles.disabled]}>
                  <Text style={styles.bookButtonText}>Continuar con la reserva</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={17} />
                </Pressable>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 48, gap: 22, backgroundColor: '#F7F8FC' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#315BFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#315BFF', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 4 },
  logoLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  brand: { color: '#15213B', fontSize: 26, lineHeight: 29, fontWeight: '900', letterSpacing: -1 },
  brandCaption: { color: '#8A94A6', fontSize: 8, fontWeight: '800', letterSpacing: 1.1, marginTop: 1 },
  locationButton: { maxWidth: '56%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingLeft: 7, paddingRight: 9, borderRadius: 14, borderWidth: 1, borderColor: '#E3E8F2', backgroundColor: '#FFFFFF' },
  locationPin: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1, minWidth: 0 },
  locationLabel: { color: '#8994A7', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  locationText: { color: '#24324D', fontSize: 11, fontWeight: '700', marginTop: 2 },
  locationError: { color: '#B42318', fontSize: 12, lineHeight: 18 },
  greetingBlock: { gap: 5, marginTop: 5 },
  greeting: { color: '#14213D', fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  wave: { color: '#E7A927', fontSize: 21 },
  greetingSubtitle: { color: '#68758B', fontSize: 15, lineHeight: 22 },
  searchBar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E9F2', shadowColor: '#182B55', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 3 },
  searchInput: { flex: 1, height: 52, color: '#15213B', fontSize: 14 },
  clearSearch: { padding: 5 },
  locationPrompt: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderWidth: 1, borderColor: '#D9E3FF', borderRadius: 17, backgroundColor: '#F0F4FF' },
  locationPromptIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  locationPromptCopy: { flex: 1, gap: 3 },
  locationPromptTitle: { color: '#203B85', fontSize: 13, fontWeight: '800' },
  locationPromptBody: { color: '#62749E', fontSize: 11, lineHeight: 16 },
  hero: { overflow: 'hidden', minHeight: 260, justifyContent: 'center', padding: 23, borderRadius: 27, backgroundColor: '#244BDE', gap: 14, shadowColor: '#244BDE', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 12 }, shadowRadius: 20, elevation: 6 },
  heroDecorOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#4168F0', right: -70, top: -90 },
  heroDecorTwo: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 22, borderColor: '#FFFFFF12', right: 30, bottom: -65 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF20' },
  heroBadgeText: { color: '#E1E8FF', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { maxWidth: 300, color: '#FFFFFF', fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  heroText: { maxWidth: 295, color: '#E1E8FF', fontSize: 14, lineHeight: 21 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 1 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  primaryButtonText: { color: '#244BDE', fontSize: 13, fontWeight: '900' },
  heroTrust: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroTrustText: { color: '#E1E8FF', fontSize: 11, fontWeight: '700' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 3 },
  sectionEyebrow: { color: '#315BFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#14213D', fontSize: 22, fontWeight: '900', marginTop: 5, letterSpacing: -0.6 },
  resetCategory: { paddingVertical: 6, paddingHorizontal: 9 },
  resetCategoryText: { color: '#315BFF', fontSize: 12, fontWeight: '800' },
  categoryTiles: { gap: 11, paddingVertical: 2, paddingRight: 5 },
  categoryTile: { width: 112, minHeight: 126, padding: 12, alignItems: 'flex-start', justifyContent: 'space-between', borderRadius: 19, borderWidth: 1, borderColor: '#E5EAF3', backgroundColor: '#FFFFFF' },
  categoryTileSelected: { borderColor: '#315BFF', backgroundColor: '#315BFF' },
  categoryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  categoryIconSelected: { backgroundColor: '#FFFFFF24' },
  categoryGlyph: { color: '#315BFF', fontSize: 23, fontWeight: '800' },
  categoryTileTitle: { color: '#24324D', fontSize: 12, fontWeight: '800', marginTop: 8 },
  categoryTileTitleSelected: { color: '#FFFFFF' },
  categoryTileCount: { color: '#8792A5', fontSize: 9, fontWeight: '600', marginTop: 2 },
  categoryTileCountSelected: { color: '#E0E7FF' },
  catalogCount: { minWidth: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EEF2FF' },
  catalogCountText: { color: '#315BFF', fontSize: 12, fontWeight: '900' },
  serviceList: { gap: 13 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 21, borderWidth: 1, borderColor: '#E5EAF3', backgroundColor: '#FFFFFF', shadowColor: '#182B55', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 7 }, shadowRadius: 15, elevation: 3 },
  serviceCardVisual: { width: 91, alignItems: 'center', justifyContent: 'center', gap: 7 },
  serviceCardIcon: { width: 78, height: 78, borderRadius: 22, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  serviceVisualCaption: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F4FA' },
  serviceVisualCaptionText: { color: '#6D7890', fontSize: 8, fontWeight: '800' },
  serviceCopy: { flex: 1, gap: 7 },
  serviceCardTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  serviceTitle: { flex: 1, color: '#18243E', fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  serviceDescription: { color: '#748096', fontSize: 11, lineHeight: 16 },
  serviceFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  priceCaption: { color: '#8994A7', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  servicePrice: { color: '#315BFF', fontSize: 15, fontWeight: '900', marginTop: 2 },
  durationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F4F6FA' },
  serviceDuration: { color: '#748096', fontSize: 10, fontWeight: '700' },
  proResults: { padding: 17, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5EAF3', gap: 13 },
  proResultsTitle: { color: '#18243E', fontSize: 18, fontWeight: '900' },
  proResult: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 6 },
  proAvatar: { width: 43, height: 43, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  proAvatarText: { color: '#315BFF', fontSize: 17, fontWeight: '900' },
  proResultCopy: { flex: 1, gap: 3 },
  proResultName: { color: '#18243E', fontSize: 13, fontWeight: '800' },
  proResultBio: { color: '#748096', fontSize: 11, lineHeight: 16 },
  emptyState: { alignItems: 'center', padding: 24, borderRadius: 21, borderWidth: 1, borderColor: '#E5EAF3', backgroundColor: '#FFFFFF', gap: 11 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  emptyTitle: { color: '#18243E', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#748096', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  clearButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, marginTop: 2, borderRadius: 12, backgroundColor: '#EEF2FF' },
  clearButtonText: { color: '#315BFF', fontSize: 12, fontWeight: '900' },
  skeletonCard: { flexDirection: 'row', gap: 14, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: '#E5EAF3', backgroundColor: '#FFFFFF' },
  skeletonIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#E7ECF5' },
  skeletonCopy: { flex: 1, gap: 10, paddingVertical: 2 },
  skeletonLine: { width: '90%', height: 10, borderRadius: 5, backgroundColor: '#E7ECF5' },
  skeletonTitle: { width: '55%', height: 13 },
  skeletonShort: { width: '40%' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#EAF7F1' },
  trustIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#D5F0E2', alignItems: 'center', justifyContent: 'center' },
  trustCopy: { flex: 1, gap: 3 },
  trustTitle: { color: '#14634D', fontSize: 13, fontWeight: '900' },
  trustText: { color: '#47816C', fontSize: 11, lineHeight: 16 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.46)' },
  modalBackdrop: { ...StyleSheet.absoluteFill },
  detailSheet: { maxHeight: '92%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F7F8FC' },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 8 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  detailIllustration: { minHeight: 142, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, backgroundColor: '#EAF0FF' },
  detailIllustrationIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#FFFFFF' },
  detailCategory: { color: '#315BFF', fontSize: 12, fontWeight: '900' },
  detailTitle: { color: '#15213B', fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  detailDescription: { color: '#68758B', fontSize: 14, lineHeight: 21 },
  benefitList: { gap: 10, paddingVertical: 3 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  benefitText: { color: '#334155', fontSize: 13, fontWeight: '600' },
  tierHeading: { color: '#15213B', fontSize: 17, fontWeight: '900', marginTop: 5 },
  tierCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#E3E8F2', backgroundColor: '#FFFFFF' },
  tierCardSelected: { borderColor: '#AFC2FF', backgroundColor: '#F0F4FF' },
  tierCopy: { gap: 4 },
  tierTitle: { color: '#15213B', fontSize: 14, fontWeight: '800' },
  tierMeta: { color: '#748096', fontSize: 11 },
  tierPrice: { color: '#315BFF', fontSize: 15, fontWeight: '900' },
  bookButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 7, borderRadius: 15, backgroundColor: '#315BFF' },
  bookButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});