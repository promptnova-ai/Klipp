import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';
import { KlippColors } from '@/theme/tokens';

const REGISTERED_TOKEN_KEY = 'klipp.registered-expo-push-token';

export async function configureNotificationChannelsAsync() {
  if (Platform.OS !== 'android') return;
  await Promise.all([
      Notifications.setNotificationChannelAsync('klipp-updates', {
        name: 'Actualizaciones de Klipp',
        importance: AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
        lightColor: KlippColors.cobalt,
      }),
      Notifications.setNotificationChannelAsync('klipp-requests', {
        name: 'Solicitudes de servicios',
        description: 'Alertas urgentes para aceptar o rechazar nuevos servicios.',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 400, 180, 400, 180, 700],
        lightColor: '#E45D42',
        sound: 'default',
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
      }),
  ]);
}

export async function registerPushDeviceAsync(userId: string) {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) throw new Error('Las notificaciones push requieren un dispositivo físico.');

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    throw new Error('Falta configurar el identificador EAS del proyecto para registrar las notificaciones push.');
  }

  await configureNotificationChannelsAsync();

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('No has permitido las notificaciones. Puedes activarlas en los ajustes del dispositivo.');

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult.data;
  const { error } = await supabase.from('notification_devices').upsert({
    user_id: userId,
    expo_push_token: token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    device_name: Device.deviceName ?? null,
    last_registered_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;

  await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, token);
  return token;
}

export async function isPushDeviceRegisteredAsync(userId: string) {
  if (Platform.OS === 'web') return false;
  const token = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
  if (!token) return false;

  const { data, error } = await supabase
    .from('notification_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('expo_push_token', token)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function unregisterPushDeviceAsync(userId: string) {
  if (Platform.OS === 'web') return;
  await Notifications.clearLastNotificationResponseAsync();
  const token = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase
    .from('notification_devices')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', token);
  if (error) throw error;
  await AsyncStorage.removeItem(REGISTERED_TOKEN_KEY);
}
