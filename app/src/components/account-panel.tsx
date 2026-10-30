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
  details: { marginHorizontal: 22, marginTop: 16, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, padding: 20, gap: 9 },
  label: { color: KlippColors.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  value: { color: KlippColors.navy, fontSize: 16 },
  signOut: { marginHorizontal: 22, minHeight: 50, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20, backgroundColor: KlippColors.white },
  signOutText: { color: KlippColors.danger, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.75 },
});