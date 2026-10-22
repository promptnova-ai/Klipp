import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';

export default function ProHomeScreen() {
  const { profile } = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>Klipp</Text>
        <Text style={styles.location}>ESPACIO PROFESIONAL</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>
          HOLA{profile?.full_name ? `, ${profile.full_name.split(' ')[0].toUpperCase()}` : ''}
        </Text>
        <Text style={styles.title}>Tu trabajo, a tu manera.</Text>
        <Text style={styles.body}>Aquí aparecerán tus solicitudes y próximas reservas.</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Verificación profesional</Text>
          <Text style={styles.body}>Completa tu perfil para prepararte para recibir solicitudes.</Text>
        </View>
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
  title: { color: '#18332d', fontSize: 31, lineHeight: 38, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 15, lineHeight: 23 },
  notice: { marginTop: 14, padding: 18, borderRadius: 8, backgroundColor: '#e7f1ed', gap: 6 },
  noticeTitle: { color: '#18332d', fontSize: 16, fontWeight: '700' },
});