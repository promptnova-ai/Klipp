import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useAuth } from '@/components/auth-provider';
import type { ExtractRole } from '@/lib/types';
import { KlippColors } from '@/theme/tokens';

export function RoleGuard({ role, children }: { role: ExtractRole; children: ReactNode }) {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={KlippColors.cobalt} />
        <Text style={styles.message}>Cargando tu cuenta...</Text>
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile?.role && profile.role !== role) {
    return <Redirect href={profile.role === 'pro' ? '/(pro)' : profile.role === 'client' ? '/(client)' : '/'} />;
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No pudimos cargar tu perfil</Text>
        <Text style={styles.message}>{profileError ?? 'Intenta de nuevo en unos segundos.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => void refreshProfile()} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.link}>
          <Text style={styles.linkText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: KlippColors.ivory },
  title: { color: KlippColors.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  message: { color: KlippColors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { minHeight: 52, minWidth: 140, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 16, backgroundColor: KlippColors.cobalt },
  buttonText: { color: KlippColors.white, fontWeight: '800' },
  link: { padding: 10 },
  linkText: { color: KlippColors.cobalt, fontWeight: '800' },
});