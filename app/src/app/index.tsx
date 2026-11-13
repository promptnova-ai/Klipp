import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const { session, profile, loading, profileError, refreshProfile } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/(auth)/login');
      return;
    }
    if (profileError || !profile) return;
    if (profile.role === 'client') router.replace('/(client)');
    else if (profile.role === 'pro') router.replace('/(pro)');
    else router.replace('/admin');
  }, [loading, session, profile, profileError, router]);

  if (loading || (session && !profileError && !profile)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={KlippColors.cobalt} />
        <Text style={styles.message}>Cargando tu cuenta...</Text>
      </View>
    );
  }

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

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={KlippColors.cobalt} />
      <Text style={styles.message}>Abriendo tu espacio...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: KlippColors.ivory,
  },
  message: { color: KlippColors.muted, fontSize: 15, textAlign: 'center' },
  title: { color: KlippColors.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  retry: { color: KlippColors.cobalt, fontSize: 16, fontWeight: '700', padding: 12 },
});
