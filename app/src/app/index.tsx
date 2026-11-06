import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';

export default function HomeScreen() {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#16766c" />
        <Text style={styles.message}>Cargando tu cuenta...</Text>
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  if (profileError || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No pudimos cargar tu perfil</Text>
        <Text style={styles.message}>{profileError ?? 'Intenta de nuevo en unos segundos.'}</Text>
        <Text accessibilityRole="button" onPress={() => void refreshProfile()} style={styles.retry}>
          Reintentar
        </Text>
      </View>
    );
  }

  if (profile.role === 'client') return <Redirect href="/(client)" />;
  if (profile.role === 'pro') return <Redirect href="/(pro)" />;

  return <Redirect href="/admin" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: '#f4f7f5',
  },
  message: { color: '#52615b', fontSize: 15, textAlign: 'center' },
  title: { color: '#18332d', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  retry: { color: '#126e64', fontSize: 16, fontWeight: '700', padding: 12 },
});
