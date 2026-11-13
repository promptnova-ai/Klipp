import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/theme/tokens';
import type { KlippRole } from '@/theme/themes';

export function AccountPanel({ roleLabel }: { roleLabel: string }) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const role: KlippRole = profile?.role === 'pro' ? 'pro' : profile?.role === 'admin' ? 'admin' : 'client';
  const displayName = profile?.full_name?.trim() || 'Tu cuenta';
  const initials = displayName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  return (
    <View style={styles.screen}>
      <BrandScreenHeader role={role} eyebrow="TU CUENTA" title="Mi cuenta" />
      <View style={styles.identity}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials || 'K'}</Text></View>
        <View style={styles.identityCopy}>
          <Text style={styles.identityName}>{displayName}</Text>
          <Text style={styles.identityRole}>{roleLabel}</Text>
        </View>
        <View style={styles.accountMark}><SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} tintColor="#3D5AFE" size={20} /></View>
      </View>
      <View style={styles.details}>
        <View style={styles.detailRow}><Text style={styles.label}>Nombre completo</Text><Text style={styles.value}>{profile?.full_name || 'Pendiente de completar'}</Text></View>
        <View style={styles.detailDivider} />
        <View style={styles.detailRow}><Text style={styles.label}>Tipo de cuenta</Text><Text style={styles.value}>{roleLabel}</Text></View>
      </View>
      {role === 'client' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/(client)/addresses')}
          style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
          <View style={styles.menuIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#3D5AFE" size={20} /></View>
          <View style={styles.menuCopy}>
            <Text style={styles.menuTitle}>Direcciones guardadas</Text>
            <Text style={styles.menuSubtitle}>Gestiona tus lugares de servicio</Text>
          </View>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#85899A" size={17} />
        </Pressable>
      )}
            <Text style={styles.securityNote}>Tus datos de cuenta se gestionan de forma segura en Klipp.</Text>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: KlippColors.canvas, paddingBottom: 36 },
  identity: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 20 },
  avatar: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.ink },
  avatarText: { color: KlippColors.white, fontSize: 19, fontWeight: '900' },
  identityCopy: { flex: 1, gap: 4 },
  identityName: { color: KlippColors.ink, fontSize: 19, fontWeight: '900' },
  identityRole: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  accountMark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', maxWidth: 676, alignSelf: 'center', marginTop: 4, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 21, gap: 0 },
  detailRow: { paddingVertical: 14, gap: 5 },
  detailDivider: { height: 1, backgroundColor: KlippColors.border },
  menuRow: { width: '100%', maxWidth: 676, minHeight: 70, alignSelf: 'center', marginTop: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white },
  menuIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E9EDFF', alignItems: 'center', justifyContent: 'center' },
  menuCopy: { flex: 1, gap: 3 },
  menuTitle: { color: KlippColors.ink, fontSize: 14, fontWeight: '800' },
  menuSubtitle: { color: KlippColors.muted, fontSize: 11 },
  securityNote: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 16, color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: KlippColors.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  value: { color: KlippColors.navy, fontSize: 16 },
  signOut: { width: '100%', maxWidth: 676, alignSelf: 'center', marginHorizontal: 22, minHeight: 52, borderWidth: 1, borderColor: KlippColors.coral, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24, backgroundColor: KlippColors.whiteCoral },
  signOutText: { color: KlippColors.danger, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.75 },
});