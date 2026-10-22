import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useAuth } from '@/components/auth-provider';
import type { ExtractRole } from '@/lib/types';

export function RoleGuard({ role, children }: { role: ExtractRole; children: ReactNode }) {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#16766c" />
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
        <Pressable onPress={() => void refreshProfile()} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
        <Pressable onPress={() => void signOut()} style={styles.link}>
          <Text style={styles.linkText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { color: '#52615b', fontSize: 14, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 7, backgroundColor: '#16766c' },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { padding: 10 },
  linkText: { color: '#125e56', fontWeight: '700' },
});