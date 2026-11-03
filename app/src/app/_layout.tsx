import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { AuthProvider } from '@/components/auth-provider';
import { NotificationResponseHandler } from '@/components/notification-response-handler';
import '@/lib/pro-location-task';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationResponseHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(client)" />
        <Stack.Screen name="(pro)" />
      </Stack>
    </AuthProvider>
  );
}
