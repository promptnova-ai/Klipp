import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';

export default function ClientHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>Klipp</Text>
        <Text style={styles.location}>SANTO DOMINGO, RD</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>LIMPIEZA A DOMICILIO</Text>
        <Text style={styles.title}>Tu hogar, en buenas manos.</Text>
        <Text style={styles.greeting}>
          Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Encuentra una ayuda
          confiable para tu hogar en Santo Domingo.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(client)/new-booking')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Reservar un servicio</Text>
        </Pressable>
        <Text style={styles.noteText}>Precios claros, profesionales verificados y atención en tu sector.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7f5' },
  header: {
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4ebe7',
  },
  brand: { color: '#125e56', fontSize: 25, fontWeight: '800' },
  location: { color: '#68756f', fontSize: 11, fontWeight: '700', marginTop: 5 },
  content: { padding: 24, gap: 14 },
  eyebrow: { color: '#16766c', fontSize: 11, fontWeight: '800' },
  title: { color: '#18332d', fontSize: 32, lineHeight: 38, fontWeight: '700' },
  greeting: { color: '#52615b', fontSize: 16, lineHeight: 24 },
  primaryButton: { minHeight: 54, marginTop: 10, borderRadius: 7, backgroundColor: '#16766c', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  noteText: { color: '#52615b', fontSize: 14, lineHeight: 21, marginTop: 5 },
});