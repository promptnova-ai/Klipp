import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';

export function AccountPanel({ roleLabel }: { roleLabel: string }) {
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Mi cuenta</Text>
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
  screen: { flex: 1, backgroundColor: '#f4f7f5', paddingTop: 62, paddingHorizontal: 24 },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700', marginBottom: 22 },
  details: { backgroundColor: '#fff', borderRadius: 8, padding: 18, gap: 7 },
  label: { color: '#68756f', fontSize: 12, fontWeight: '700', marginTop: 6 },
  value: { color: '#18332d', fontSize: 16 },
  signOut: { minHeight: 50, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 20, backgroundColor: '#fff' },
  signOutText: { color: '#a32f27', fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.75 },
});