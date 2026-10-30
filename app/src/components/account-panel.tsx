import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';

export function AccountPanel({ roleLabel }: { roleLabel: string }) {
  const { profile, signOut } = useAuth();
  const router = useRouter();

  const initials = profile?.full_name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'K';

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <BrandScreenHeader role="client" eyebrow="TU ESPACIO PERSONAL" title="Mi cuenta" subtitle="Administra tus datos y tus lugares habituales." />
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.identity}>
          <Text style={styles.profileEyebrow}>CUENTA KLIPP</Text>
          <Text style={styles.name}>{profile?.full_name || 'Tu perfil'}</Text>
          <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{roleLabel}</Text></View>
        </View>
        <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} tintColor="#0F987A" size={21} />
      </View>
      <Text style={styles.sectionTitle}>Accesos rápidos</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(client)/bookings')} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
        <View style={[styles.menuIcon, styles.menuBlue]}><SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor="#315BFF" size={20} /></View>
        <View style={styles.menuCopy}><Text style={styles.menuTitle}>Mis reservas</Text><Text style={styles.menuBody}>Consulta el estado y seguimiento de tus servicios.</Text></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#9AA5B5" size={17} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(client)/addresses')} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
        <View style={[styles.menuIcon, styles.menuMint]}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#0F987A" size={20} /></View>
        <View style={styles.menuCopy}><Text style={styles.menuTitle}>Mis direcciones</Text><Text style={styles.menuBody}>Guarda casa, trabajo y otros lugares habituales.</Text></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#9AA5B5" size={17} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/(client)')} style={({ pressed }) => [styles.menuCard, pressed && styles.pressed]}>
        <View style={[styles.menuIcon, styles.menuLavender]}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor="#7051C8" size={20} /></View>
        <View style={styles.menuCopy}><Text style={styles.menuTitle}>Descubrir servicios</Text><Text style={styles.menuBody}>Encuentra ayuda para lo que necesitas hoy.</Text></View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#9AA5B5" size={17} />
      </Pressable>
      <View style={styles.securityNote}>
        <SymbolView name={{ ios: 'lock.shield.fill', android: 'security', web: 'security' }} tintColor="#0F987A" size={18} />
        <Text style={styles.securityText}>Tus datos de cuenta se gestionan de forma segura.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor="#B42318" size={17} />
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: 48, gap: 14, backgroundColor: '#F7F8FC' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13, marginHorizontal: 20, marginTop: 2, padding: 18, borderRadius: 21, borderWidth: 1, borderColor: '#E3E8F2', backgroundColor: '#FFFFFF' },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#315BFF' },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  identity: { flex: 1, gap: 3 },
  profileEyebrow: { color: '#8792A5', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  name: { color: '#15213B', fontSize: 17, fontWeight: '900' },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#EEF2FF', marginTop: 2 },
  roleBadgeText: { color: '#315BFF', fontSize: 9, fontWeight: '900' },
  sectionTitle: { color: '#15213B', fontSize: 19, fontWeight: '900', marginHorizontal: 22, marginTop: 10 },
  menuCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF' },
  menuIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuBlue: { backgroundColor: '#EEF2FF' },
  menuMint: { backgroundColor: '#E8F6F1' },
  menuLavender: { backgroundColor: '#F1EDFA' },
  menuCopy: { flex: 1, gap: 3 },
  menuTitle: { color: '#15213B', fontSize: 13, fontWeight: '900' },
  menuBody: { color: '#748096', fontSize: 10, lineHeight: 15 },
  securityNote: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 20, marginTop: 6, padding: 13, borderRadius: 14, backgroundColor: '#EAF7F1' },
  securityText: { flex: 1, color: '#47816C', fontSize: 10, lineHeight: 15, fontWeight: '600' },
  signOut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, marginTop: 5, borderWidth: 1, borderColor: '#F3D8D6', borderRadius: 13, backgroundColor: '#FFF8F7' },
  signOutText: { color: '#B42318', fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.82 },
});