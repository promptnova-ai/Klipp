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
          <Text style={styles.brand}>klipp</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver mis direcciones"
          onPress={() => coordinate ? router.push('/(client)/addresses') : void requestLocation()}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={KlippColors.blueDark} size={17} />
          <View>
            <Text style={styles.locationLabel}>TU UBICACIÓN</Text>
            <Text style={styles.locationText}>{locationLabel}</Text>
          </View>
          {locationError && <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text>}
          <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} tintColor={KlippColors.muted} size={14} />
        </Pressable>
      </View>

      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>¡Hola{firstName ? `, ${firstName}` : ''}! <Text style={styles.wave}>✦</Text></Text>
        <Text style={styles.greetingSubtitle}>Un hogar cuidado se siente diferente.</Text>
      </View>

      <View style={styles.searchBar}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={KlippColors.muted} size={20} />
        <TextInput
          accessibilityLabel="Buscar servicios o profesionales"
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Buscar limpieza, profesionales..."
          placeholderTextColor={KlippColors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
        {!!search && (
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setSearch('')} style={styles.clearSearch}>
            <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={KlippColors.muted} size={18} />
          </Pressable>
        )}
      </View>

      {!search && (
        <View style={styles.hero}>
          <View style={styles.heroAccent} />
          <View style={styles.heroBadge}>
            <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.teal} size={14} />
            <Text style={styles.heroBadgeText}>KLIPP EN SANTO DOMINGO</Text>
          </View>
          <Text style={styles.heroTitle}>Tu hogar,{'\n'}en buenas manos.</Text>
          <Text style={styles.heroText}>Encuentra profesionales de confianza y reserva en pocos pasos.</Text>
          {featuredService && (
            <Pressable
              accessibilityRole="button"
              onPress={() => showServiceDetails(featuredService)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.primaryButtonText}>Explorar servicios</Text>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={KlippColors.navy} size={17} />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.catalogHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>CATÁLOGO KLIPP</Text>
          <Text style={styles.sectionTitle}>Servicios para ti</Text>
        </View>
        <View style={styles.serviceIcon}>
          <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.blueDark} size={21} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {categories.map((category) => {
          const selected = selectedCategory === category;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={({ pressed }) => [styles.categoryPill, selected && styles.categorySelected, pressed && styles.pressed]}>
              <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{category}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.serviceList}><ServiceSkeleton /><ServiceSkeleton /></View>
      ) : loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No pudimos cargar el catálogo</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadCatalog()} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Intentar de nuevo</Text>
          </Pressable>
        </View>
      ) : visibleServices.length === 0 && visiblePros.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={KlippColors.blueDark} size={25} />
          </View>
          <Text style={styles.emptyTitle}>No encontramos resultados</Text>
          <Text style={styles.emptyText}>
            {selectedCategory !== 'Todos'
              ? 'No encontramos servicios en esta categoría. Prueba otra búsqueda o limpia los filtros.'
              : 'Prueba otra búsqueda para descubrir servicios y profesionales.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Limpiar filtros</Text>
          </Pressable>
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
              <Pressable
                accessibilityRole="button"
                key={service.id}
                onPress={() => showServiceDetails(service)}
                style={({ pressed }) => [styles.serviceCard, pressed && styles.cardPressed]}>
                <View style={styles.serviceCardIcon}>
                  <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={KlippColors.blueDark} size={23} />
                </View>
                <View style={styles.serviceCopy}>
                  <View style={styles.serviceCardTop}>
                    <Text style={styles.serviceTitle}>{service.name}</Text>
                    <View style={styles.categoryTag}><Text style={styles.categoryTagText}>{getCategory(service)}</Text></View>
                  </View>
                  <Text style={styles.serviceDescription}>{service.description || 'Un servicio cuidado por profesionales verificados.'}</Text>
                  <View style={styles.serviceMeta}>
                    {lowestOption && <Text style={styles.servicePrice}>Desde {formatDop(lowestOption.price)}</Text>}
                    {lowestOption && <Text style={styles.metaDot}>·</Text>}
                    {lowestOption && <Text style={styles.serviceDuration}>{lowestOption.duration} min aprox.</Text>}
                  </View>
                  <Text style={styles.serviceLink}>Ver detalles  <Text style={styles.linkArrow}>›</Text></Text>
                </View>
              </Pressable>
            );
          })}
          {visiblePros.length > 0 && (
            <View style={styles.proResults}>
              <Text style={styles.proResultsTitle}>Profesionales</Text>
              {visiblePros.map((pro) => (
                <View key={pro.pro_id} style={styles.proResult}>
                  <View style={styles.proAvatar}><Text style={styles.proAvatarText}>{pro.full_name?.[0] ?? 'K'}</Text></View>
                  <View style={styles.proResultCopy}>
                    <Text style={styles.proResultName}>{pro.full_name ?? 'Profesional Klipp'}</Text>
                    <Text numberOfLines={2} style={styles.proResultBio}>{pro.bio || 'Profesional de limpieza verificado'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.trustRow}>
        <View style={styles.trustIcon}>
          <SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor="#047857" size={19} />
        </View>
        <View style={styles.trustCopy}>
          <Text style={styles.trustTitle}>Tu tranquilidad es primero</Text>
          <Text style={styles.trustText}>Profesionales verificados cerca de ti.</Text>
        </View>
      </View>

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
                  <View style={styles.detailIllustrationIcon}>
                    <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={KlippColors.blueDark} size={34} />
                  </View>
                  <Text style={styles.detailCategory}>{getCategory(selectedService)}</Text>
                </View>
                <Text style={styles.detailTitle}>{selectedService.name}</Text>
                <Text style={styles.detailDescription}>{selectedService.description || 'Un servicio de calidad para que disfrutes de un hogar limpio y cuidado.'}</Text>
                <View style={styles.benefitList}>
                  {['Profesionales verificados', 'Precio cerrado según el tamaño', 'Reserva en el horario que prefieras'].map((benefit) => (
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
                {selectedService.tiers.length > 0 && <Text style={styles.tierHeading}>Elige el tamaño de tu hogar</Text>}
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
                    <Text style={styles.tierPrice}>{formatDop(tier.price_dop)}</Text>
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
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 48, gap: 25, backgroundColor: '#F7F8FC' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#315BFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#315BFF', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 5 },
  logoLetter: { color: KlippColors.white, fontSize: 21, fontWeight: '800' },
  brand: { color: '#15213B', fontSize: 27, fontWeight: '900', letterSpacing: -1 },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 },
  locationLabel: { color: KlippColors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  locationText: { color: KlippColors.navy, fontSize: 13, fontWeight: '600', marginTop: 2 },
  locationError: { color: KlippColors.danger, fontSize: 12, lineHeight: 18 },
  greetingBlock: { gap: 5, marginTop: 2 },
  greeting: { color: '#14213D', fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  wave: { color: KlippColors.gold, fontSize: 20 },
  greetingSubtitle: { color: '#66738A', fontSize: 15, lineHeight: 23 },
  searchBar: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E8F2', shadowColor: '#182B55', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 7 }, shadowRadius: 15, elevation: 3 },
  searchInput: { flex: 1, height: 52, color: KlippColors.navy, fontSize: 14 },
  clearSearch: { padding: 5 },
  hero: { overflow: 'hidden', minHeight: 285, justifyContent: 'center', padding: 25, borderRadius: 28, backgroundColor: '#244BDE', gap: 15, shadowColor: '#244BDE', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 12 }, shadowRadius: 22, elevation: 7 },
  heroAccent: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: '#4168F0', right: -95, top: -95 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF20' },
  heroBadgeText: { color: '#D4E1F4', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  heroTitle: { color: '#FFFFFF', fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1, marginTop: 5 },
  heroText: { maxWidth: 300, color: '#E4EAFF', fontSize: 15, lineHeight: 23 },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 5, paddingHorizontal: 20, borderRadius: 15, backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  primaryButtonText: { color: '#244BDE', fontSize: 14, fontWeight: '800' },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionEyebrow: { color: KlippColors.blueDark, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: '#14213D', fontSize: 23, fontWeight: '800', marginTop: 5, letterSpacing: -0.5 },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  categories: { gap: 9, paddingVertical: 1 },
  categoryPill: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: '#E2E7F0', backgroundColor: '#FFFFFF' },
  categorySelected: { borderColor: '#315BFF', backgroundColor: '#315BFF' },
  categoryText: { color: KlippColors.slate, fontSize: 13, fontWeight: '600' },
  categoryTextSelected: { color: KlippColors.white },
  serviceList: { gap: 14 },
  serviceCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 19, borderRadius: 22, borderWidth: 1, borderColor: '#E6EAF2', backgroundColor: '#FFFFFF', shadowColor: '#182B55', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 4 },
  serviceCardIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#EDF2FF', alignItems: 'center', justifyContent: 'center' },
  serviceCopy: { flex: 1, gap: 7 },
  serviceCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  serviceTitle: { flex: 1, color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  categoryTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F5F9' },
  categoryTagText: { color: KlippColors.muted, fontSize: 10, fontWeight: '700' },
  serviceDescription: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  servicePrice: { color: '#315BFF', fontSize: 14, fontWeight: '800' },
  metaDot: { color: KlippColors.muted },
  serviceDuration: { color: KlippColors.muted, fontSize: 12 },
  serviceLink: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700', marginTop: 2 },
  linkArrow: { fontSize: 18 },
  proResults: { padding: 16, borderRadius: 18, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, gap: 12 },
  proResultsTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  proResult: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FF' },
  proAvatarText: { color: KlippColors.blueDark, fontSize: 16, fontWeight: '700' },
  proResultCopy: { flex: 1, gap: 3 },
  proResultName: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  proResultBio: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: 'center', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FF' },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: KlippColors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  clearButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 2, borderRadius: 12, backgroundColor: '#EEF4FF' },
  clearButtonText: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700' },
  skeletonCard: { flexDirection: 'row', gap: 14, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  skeletonIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E2E8F0' },
  skeletonCopy: { flex: 1, gap: 10, paddingVertical: 2 },
  skeletonLine: { width: '90%', height: 10, borderRadius: 5, backgroundColor: '#E2E8F0' },
  skeletonTitle: { width: '55%', height: 13 },
  skeletonShort: { width: '40%' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: '#ECFDF5' },
  trustIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  trustCopy: { flex: 1, gap: 3 },
  trustTitle: { color: '#065F46', fontSize: 14, fontWeight: '700' },
  trustText: { color: '#047857', fontSize: 12, lineHeight: 18 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.42)' },
  modalBackdrop: { ...StyleSheet.absoluteFill },
  detailSheet: { maxHeight: '92%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: KlippColors.canvas },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 8 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  detailIllustration: { minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 20, backgroundColor: '#EEF4FF' },
  detailIllustrationIcon: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: KlippColors.white },
  detailCategory: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  detailTitle: { color: KlippColors.navy, fontSize: 23, fontWeight: '700' },
  detailDescription: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  benefitList: { gap: 10, paddingVertical: 3 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  benefitText: { color: KlippColors.slate, fontSize: 13, fontWeight: '500' },
  tierHeading: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', marginTop: 4 },
  tierCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  tierCardSelected: { borderColor: '#B8CBFF', backgroundColor: '#F4F7FF' },
  tierCopy: { gap: 4 },
  tierTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  tierMeta: { color: KlippColors.muted, fontSize: 12 },
  tierPrice: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '800' },
  bookButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 7, borderRadius: 16, backgroundColor: '#315BFF' },
  bookButtonText: { color: KlippColors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
