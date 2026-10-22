import * as Device from 'expo-device';
import { Redirect } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Text, View } from 'react-native';

import { AnimatedIcon } from '@/components/animated-icon';
import { AccountPanel } from '@/components/account-panel';
import { useAuth } from '@/components/auth-provider';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();

  if (loading) {
    return (
      <View style={authStyles.centered}>
        <ActivityIndicator color="#16766c" />
        <Text style={authStyles.message}>Cargando tu cuenta...</Text>
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  if (profileError || !profile) {
    return (
      <View style={authStyles.centered}>
        <Text style={authStyles.title}>No pudimos cargar tu perfil</Text>
        <Text style={authStyles.message}>{profileError ?? 'Intenta de nuevo en unos segundos.'}</Text>
        <Text accessibilityRole="button" onPress={() => void refreshProfile()} style={authStyles.retry}>
          Reintentar
        </Text>
      </View>
    );
  }

  if (profile.role === 'client') return <Redirect href="/(client)" />;
  if (profile.role === 'pro') return <Redirect href="/(pro)" />;

  return <AccountPanel roleLabel="Administrador" />;

  /* Original starter screen retained below until the client and pro home screens are built. */
  /*
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Welcome to&nbsp;Expo
          </ThemedText>
        </ThemedView>

        <ThemedText type="code" style={styles.code}>
          get started
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
  */
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});

const authStyles = StyleSheet.create({
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
