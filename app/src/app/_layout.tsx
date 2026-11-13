import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

import { AuthProvider } from '@/components/auth-provider';
import { NotificationResponseHandler } from '@/components/notification-response-handler';
import { configureNotificationChannelsAsync } from '@/lib/push-notifications';

function NativeNotificationBootstrap() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return configureNotificationChannelsAsync();
    }).catch(() => undefined);
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NativeNotificationBootstrap />
      <NotificationResponseHandler />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(client)" />
        <Stack.Screen name="(pro)" />
      </Stack>
    </AuthProvider>
  );
}
