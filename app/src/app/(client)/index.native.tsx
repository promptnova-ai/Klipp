import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors as C, KlippLayout } from '@/theme/tokens';
import { serviceArt } from '@/lib/service-art';
import type { ServiceType } from '@/lib/types';
import { supabase } from '../../../lib/supabase';

type CatalogCategory = { id: number; name: string };
type CatalogService = ServiceType & { category_name: string | null };

export default function ClientHomeNative() {
  const { width } = useWindowDimensions();
  const categoryTileWidth = width >= 1180 ? '23%' : width >= 760 ? '31.5%' : '48%';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [locationLabel, setLocationLabel] = useState('Añadir dirección');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [serviceResult, categoryResult] = await Promise.all([
        supabase.from('service_types').select('id, code, name, description, active, category_id, service_categories(name)').eq('active', true).order('name'),
        supabase.from('service_categories').select('id, name').eq('active', true).order('id'),
      ]);
      if (!active) return;
      const failure = serviceResult.error ?? categoryResult.error;
      if (failure) {
        setError(failure.message);
      } else {
        const rows = (serviceResult.data ?? []) as (ServiceType & { service_categories: { name: string } | { name: string }[] | null })[];
        setServices(rows.map((service) => ({
          ...service,
          category_name: (Array.isArray(service.service_categories) ? service.service_categories[0]?.name : service.service_categories?.name) ?? null,
        })));
        setCategories((categoryResult.data ?? []) as CatalogCategory[]);
        setError(null);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const visibleServices = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return services.filter((service) => {
      const matchesCategory = selectedCategory === 'Todos' || service.category_name === selectedCategory;
      const matchesSearch = !term || `${service.name} ${service.description ?? ''} ${service.category_name ?? ''}`.toLocaleLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory, services]);

  async function chooseLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      router.push('/(client)/addresses');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      setLocationLabel([place?.district || place?.subregion, place?.city || place?.region].filter(Boolean).join(', ') || 'Ubicación actual');
    } catch {
      router.push('/(client)/addresses');
    }
  }

  function startBooking(service: CatalogService) {
    router.push({ pathname: '/new-booking', params: { serviceId: String(service.id) } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={visibleServices}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 96 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.topLine}>
              <View style={styles.brandLockup}>
                <KlippMark size={34} />
                <View><Text style={styles.brand}>klipp</Text><Text style={styles.brandSub}>REPÚBLICA DOMINICANA</Text></View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Notificaciones" onPress={() => router.push('/(client)/notifications')} style={styles.iconButton}>
                <SymbolView name={{ ios: 'bell', android: 'notifications_none', web: 'notifications_none' }} tintColor={C.ink} size={21} />
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" onPress={() => void chooseLocation()} style={styles.locationPill}>
              <View style={styles.locationGlyph}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={C.cobalt} size={19} /></View>
              <View style={styles.locationCopy}><Text style={styles.microLabel}>SERVICIO EN</Text><Text numberOfLines={1} style={styles.locationValue}>{locationLabel}</Text></View>
              <SymbolView name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} tintColor={C.muted} size={17} />
            </Pressable>

            <View style={styles.greeting}>
              <Text style={styles.greetingEyebrow}>TU DÍA, MÁS FÁCIL</Text>
              <Text style={styles.greetingTitle}>Hola{firstName ? `, ${firstName}` : ''}.<Text style={styles.greetingAccent}> ¿Qué necesitas?</Text></Text>
              <Text style={styles.greetingSub}>Servicios de confianza, directamente donde estés.</Text>
            </View>

            <View style={styles.searchBox}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={C.muted} size={20} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Busca un servicio" placeholderTextColor={C.muted} style={styles.searchInput} returnKeyType="search" accessibilityLabel="Buscar servicios" />
              {search.length > 0 && <Pressable onPress={() => setSearch('')} accessibilityLabel="Borrar búsqueda"><SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={C.muted} size={18} /></Pressable>}
            </View>

            <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Categorías</Text><Text style={styles.sectionAside}>{categories.length} opciones</Text></View>
            <View style={styles.categoryGrid}>
              {categories.map((category) => {
                const active = selectedCategory === category.name;
                const categoryService = services.find((service) => service.category_name === category.name);
                return (
                  <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setSelectedCategory(active ? 'Todos' : category.name)} style={({ pressed }) => [styles.categoryTile, { width: categoryTileWidth }, active && styles.categoryTileSelected, pressed && styles.servicePressed]}>
                    <Image source={serviceArt(categoryService?.code ?? category.name)} contentFit="cover" transition={220} style={styles.categoryTileImage} />
                    <View style={styles.categoryTileShade} />
                    <View style={styles.categoryTileFooter}>
                      <Text numberOfLines={2} style={styles.categoryTileTitle}>{category.name}</Text>
                      <View style={[styles.categoryTileArrow, active && styles.categoryTileArrowSelected]}>
                        <SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor={active ? C.white : C.ink} size={14} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{search || selectedCategory !== 'Todos' ? 'Resultados' : 'Servicios disponibles'}</Text><Text style={styles.sectionAside}>{visibleServices.length} opciones</Text></View>
            {loading && <View style={styles.loadingRow}><ActivityIndicator color={C.cobalt} /><Text style={styles.loadingText}>Cargando servicios…</Text></View>}
            {!!error && <View style={styles.errorCard}><Text style={styles.errorTitle}>No pudimos cargar los servicios</Text><Text style={styles.errorText}>{error}</Text></View>}
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Reservar ${item.name}`} onPress={() => startBooking(item)} style={({ pressed }) => [styles.serviceCard, pressed && styles.servicePressed]}>
            <Image source={serviceArt(item.code)} contentFit="cover" transition={180} style={styles.serviceImage} />
            <View style={styles.serviceInfo}>
              <View style={styles.serviceTop}><Text style={styles.serviceCategory}>{item.category_name ?? 'KLIPP'}</Text><SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} tintColor={C.cobalt} size={17} /></View>
              <Text style={styles.serviceName}>{item.name}</Text>
              <Text numberOfLines={2} style={styles.serviceDescription}>{item.description || 'Reserva con profesionales verificados y recibe el servicio en tu ubicación.'}</Text>
              <View style={styles.serviceFooter}><Text style={styles.serviceCta}>Ver disponibilidad</Text><View style={styles.serviceArrow}><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={C.white} size={15} /></View></View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!loading && !error ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aún no hay servicios aquí</Text><Text style={styles.emptyText}>Prueba otra categoría o cambia tu búsqueda.</Text><Pressable onPress={() => { setSelectedCategory('Todos'); setSearch(''); }}><Text style={styles.resetText}>Ver todos los servicios</Text></Pressable></View> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ivory },
  content: { width: '100%', maxWidth: KlippLayout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { color: C.ink, fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  brandSub: { color: C.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  locationPill: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  locationGlyph: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1, gap: 2 },
  microLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  locationValue: { color: C.ink, fontSize: 14, fontWeight: '700' },
  greeting: { paddingTop: 28, paddingBottom: 20, gap: 7 },
  greetingEyebrow: { color: C.cobalt, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  greetingTitle: { color: C.ink, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -1.1 },
  greetingAccent: { color: C.cobalt },
  greetingSub: { color: C.muted, fontSize: 14, lineHeight: 20 },
  searchBox: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, minHeight: 54, color: C.ink, fontSize: 15 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 28, marginBottom: 13 },
  sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.5 },
  sectionAside: { color: C.muted, fontSize: 12, fontWeight: '700' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryTile: { minHeight: 120, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceBlue },
  categoryTileSelected: { borderWidth: 2, borderColor: C.cobalt },
  categoryTileImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  categoryTileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,27,45,0.30)' },
  categoryTileFooter: { flex: 1, minHeight: 118, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, padding: 12 },
  categoryTileTitle: { flex: 1, color: C.white, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  categoryTileArrow: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  categoryTileArrowSelected: { backgroundColor: C.cobalt },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 22 },
  loadingText: { color: C.muted, fontSize: 13 },
  errorCard: { padding: 16, borderRadius: 16, backgroundColor: C.surfaceCoral, gap: 5 },
  errorTitle: { color: C.danger, fontWeight: '800', fontSize: 14 },
  errorText: { color: C.ink, fontSize: 12, lineHeight: 18 },
  serviceCard: { flexDirection: 'row', minHeight: 156, padding: 10, marginBottom: 12, gap: 13, backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  servicePressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  serviceImage: { width: 112, minHeight: 136, borderRadius: 14, backgroundColor: C.surfaceMuted },
  serviceInfo: { flex: 1, justifyContent: 'center', paddingVertical: 5 },
  serviceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceCategory: { color: C.cobalt, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  serviceName: { color: C.ink, fontSize: 16, fontWeight: '900', marginTop: 6, letterSpacing: -0.3 },
  serviceDescription: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  serviceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  serviceCta: { color: C.cobalt, fontSize: 11, fontWeight: '900' },
  serviceArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.cobalt, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 9 },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '900' },
  emptyText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  resetText: { color: C.cobalt, fontSize: 13, fontWeight: '900', padding: 10 },
});
