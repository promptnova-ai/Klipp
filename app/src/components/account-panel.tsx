import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';

export function AccountPanel({ roleLabel }: { roleLabel: string }) {
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.screen}>
      <BrandScreenHeader eyebrow="TU CUENTA" title="Mi cuenta" />
      <View style={styles.details}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{profile?.full_name || 'Sin nombre'}</Text>
        <Text style={styles.label}>Tipo de cuenta</Text>
        <Text style={styles.value}>{roleLabel}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: KlippColors.canvas },
  details: { width: '100%', maxWidth: 760, alignSelf: 'center', marginTop: 18, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 22, padding: 22, gap: 9, shadowColor: KlippColors.navy, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 1 },
  label: { color: KlippColors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.3, marginTop: 8 },
  value: { color: KlippColors.navy, fontSize: 17, fontWeight: '700' },
  signOut: { width: '100%', maxWidth: 760, alignSelf: 'center', minHeight: 50, borderWidth: 1, borderColor: '#FECACA', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18, backgroundColor: '#FFF7F7' },
  signOutText: { color: KlippColors.danger, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.75 },
});