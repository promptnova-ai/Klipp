import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors, type KlippRole } from '@/lib/brand';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
type AccountLink = {
  title: string;
  description: string;
  icon: SymbolName;
  route: '/(client)/addresses' | '/(client)/bookings' | '/(client)/notifications';
};

const accountLinks: AccountLink[] = [
  {
    title: 'Mis direcciones',
    description: 'Gestiona tus ubicaciones y referencias',
    icon: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' },
    route: '/(client)/addresses',
  },
  {
    title: 'Mis reservas',
    description: 'Consulta servicios activos e historial',
    icon: { ios: 'calendar', android: 'event_note', web: 'event_note' },
    route: '/(client)/bookings',
  },
  {
    title: 'Notificaciones',
    description: 'Avisos y preferencias de comunicación',
    icon: { ios: 'bell', android: 'notifications', web: 'notifications' },
    route: '/(client)/notifications',
  },
];

export function AccountPanel({ roleLabel }: { roleLabel: string }) {
  const router = useRouter();
  const { profile, session, signOut } = useAuth();
  const role: KlippRole = profile?.role === 'pro' ? 'pro' : profile?.role === 'admin' ? 'admin' : 'client';
  const fullName = profile?.full_name?.trim() || 'Tu cuenta Klipp';
  const initials = fullName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'K';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <BrandScreenHeader role={role} eyebrow="TU CUENTA" title="Mi cuenta" subtitle="Tus datos y preferencias en un solo lugar." />
        <View style={styles.content}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{fullName}</Text>
              <Text style={styles.profileEmail}>{session?.user.email || 'Correo no disponible'}</Text>
              <View style={styles.rolePill}><Text style={styles.roleText}>{roleLabel.toUpperCase()}</Text></View>
            </View>
            <SymbolView name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }} tintColor={KlippColors.blueDark} size={23} />
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Tu información</Text>
            <Text style={styles.sectionCaption}>Acceso rápido</Text>
          </View>
          <View style={styles.linkGroup}>
            {accountLinks.map((item, index) => (
              <Pressable
                key={item.route}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => router.push(item.route)}
                style={({ pressed }) => [styles.linkRow, index < accountLinks.length - 1 && styles.linkDivider, pressed && styles.pressed]}>
                <View style={styles.linkIcon}>
                  <SymbolView name={item.icon} tintColor={KlippColors.blueDark} size={20} />
                </View>
                <View style={styles.linkCopy}>
                  <Text style={styles.linkTitle}>{item.title}</Text>
                  <Text style={styles.linkDescription}>{item.description}</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#98A5B5" size={17} />
              </Pressable>
            ))}
          </View>

          <View style={styles.securityNote}>
            <SymbolView name={{ ios: 'lock.shield', android: 'shield', web: 'shield' }} tintColor={KlippColors.tealDark} size={19} />
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Tu cuenta, protegida</Text>
              <Text style={styles.securityDescription}>No compartas códigos de acceso ni realices pagos fuera de Klipp.</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor={KlippColors.danger} size={19} />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </Pressable>
          <Text style={styles.version}>KLIPP · REPÚBLICA DOMINICANA</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: KlippColors.canvas },
  page: { flexGrow: 1, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, gap: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  avatar: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0F8' },
  avatarText: { color: KlippColors.blueDark, fontSize: 19, fontWeight: '800' },
  profileCopy: { flex: 1, gap: 3 },
  profileName: { color: KlippColors.navy, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  profileEmail: { color: KlippColors.muted, fontSize: 12, lineHeight: 17 },
  rolePill: { alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#EAF5F1' },
  roleText: { color: KlippColors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5 },
  sectionTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '800' },
  sectionCaption: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  linkGroup: { overflow: 'hidden', borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white },
  linkRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  linkDivider: { borderBottomWidth: 1, borderBottomColor: '#EDF1F5' },
  linkIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F4F9' },
  linkCopy: { flex: 1, gap: 3 },
  linkTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  linkDescription: { color: KlippColors.muted, fontSize: 11, lineHeight: 15 },
  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, borderRadius: 16, backgroundColor: '#EAF5F1' },
  securityCopy: { flex: 1, gap: 3 },
  securityTitle: { color: '#175B50', fontSize: 12, fontWeight: '800' },
  securityDescription: { color: '#3F6F68', fontSize: 11, lineHeight: 16 },
  signOut: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, borderWidth: 1, borderColor: '#F0C9C6', backgroundColor: KlippColors.white },
  signOutText: { color: KlippColors.danger, fontSize: 13, fontWeight: '800' },
  version: { color: '#97A2AF', fontSize: 9, fontWeight: '700', letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
