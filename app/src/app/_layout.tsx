import { Stack } from 'expo-router';

import { AuthProvider } from '@/components/auth-provider';
import '@/lib/pro-location-task';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(client)" />
        <Stack.Screen name="(pro)" />
      </Stack>
    </AuthProvider>
  );
}
