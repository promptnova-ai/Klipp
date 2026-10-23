import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';

export default function ClientHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  function openBooking() {
    router.push('/(client)/new-booking');
  }

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
          <Text style={styles.brand}>klipp</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver mis direcciones"
          onPress={() => router.push('/(client)/addresses')}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={KlippColors.blueDark} size={17} />
          <View>
            <Text style={styles.locationLabel}>TU ZONA</Text>
            <Text style={styles.locationText}>Santo Domingo</Text>
          </View>
          <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} tintColor={KlippColors.muted} size={14} />
        </Pressable>
      </View>

      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>¡Hola{firstName ? `, ${firstName}` : ''}! <Text style={styles.wave}>✦</Text></Text>
        <Text style={styles.greetingSubtitle}>Un hogar cuidado se siente diferente.</Text>
      </View>

      <View style={styles.searchBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar un servicio de limpieza"
          onPress={openBooking}
          style={({ pressed }) => [styles.searchAction, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={KlippColors.muted} size={20} />
          <View style={styles.searchCopy}>
            <Text style={styles.searchTitle}>Buscar un servicio</Text>
            <Text style={styles.searchSubtitle}>Limpieza para tu hogar</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver opciones de servicio"
          onPress={openBooking}
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
          <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} tintColor={KlippColors.navy} size={19} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroAccent} />
        <View style={styles.heroTopline}>
          <View style={styles.heroBadge}>
            <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.teal} size={14} />
            <Text style={styles.heroBadgeText}>KLIPP EN SANTO DOMINGO</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Tu hogar,{'\n'}en buenas manos.</Text>
        <Text style={styles.heroText}>Profesionales verificados para que disfrutes más de tu tiempo.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={openBooking}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
          <Text style={styles.primaryButtonText}>Reservar limpieza</Text>
          <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={KlippColors.navy} size={17} />
        </Pressable>
      </View>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionEyebrow}>HECHO PARA TU HOGAR</Text>
          <Text style={styles.sectionTitle}>Una buena limpieza, fácil</Text>
        </View>
        <View style={styles.serviceIcon}>
          <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.blueDark} size={21} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={openBooking}
        style={({ pressed }) => [styles.serviceCard, pressed && styles.cardPressed]}>
        <View style={styles.serviceCardIcon}>
          <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={KlippColors.blueDark} size={23} />
        </View>
        <View style={styles.serviceCopy}>
          <Text style={styles.serviceTitle}>Limpieza del hogar</Text>
          <Text style={styles.serviceDescription}>Elige el tamaño, tu horario y quién te ayudará.</Text>
          <Text style={styles.serviceLink}>Explorar opciones  <Text style={styles.linkArrow}>›</Text></Text>
        </View>
      </Pressable>

      <View style={styles.trustRow}>
        <View style={styles.trustIcon}>
          <SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} tintColor="#047857" size={19} />
        </View>
        <View style={styles.trustCopy}>
          <Text style={styles.trustTitle}>Tu tranquilidad es primero</Text>
          <Text style={styles.trustText}>Profesionales verificados en tu sector.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 58, paddingBottom: 32, gap: 24, backgroundColor: KlippColors.canvas },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: KlippColors.navy, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: KlippColors.white, fontSize: 21, fontWeight: '800' },
  brand: { color: KlippColors.navy, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 },
  locationLabel: { color: KlippColors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  locationText: { color: KlippColors.navy, fontSize: 13, fontWeight: '600', marginTop: 2 },
  greetingBlock: { gap: 5, marginTop: 2 },
  greeting: { color: KlippColors.navy, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  wave: { color: KlippColors.gold, fontSize: 20 },
  greetingSubtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22 },
  searchBar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 9, borderRadius: 16, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 3 },
  searchAction: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchCopy: { flex: 1, gap: 3 },
  searchTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '600' },
  searchSubtitle: { color: KlippColors.muted, fontSize: 12 },
  filterButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  hero: { overflow: 'hidden', padding: 22, borderRadius: 24, backgroundColor: KlippColors.navy, gap: 13 },
  heroAccent: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#14294B', right: -75, top: -85 },
  heroTopline: { flexDirection: 'row', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#1B2A42' },
  heroBadgeText: { color: '#D4E1F4', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  heroTitle: { color: KlippColors.white, fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
  heroText: { maxWidth: 290, color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  primaryButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 3, borderRadius: 13, backgroundColor: KlippColors.teal, shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 2 },
  primaryButtonText: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionEyebrow: { color: KlippColors.blueDark, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: KlippColors.navy, fontSize: 19, fontWeight: '700', marginTop: 5 },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  serviceCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 15, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 3 },
  serviceCardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  serviceCopy: { flex: 1, gap: 6 },
  serviceTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  serviceDescription: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  serviceLink: { color: KlippColors.blueDark, fontSize: 13, fontWeight: '700', marginTop: 4 },
  linkArrow: { fontSize: 18 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: '#ECFDF5' },
  trustIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  trustCopy: { flex: 1, gap: 3 },
  trustTitle: { color: '#065F46', fontSize: 14, fontWeight: '700' },
  trustText: { color: '#047857', fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.9 },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
