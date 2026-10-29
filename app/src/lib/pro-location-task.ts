import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';

export const PRO_LOCATION_TASK = 'KLIPP_PRO_LOCATION_TRACKING';
const ACTIVE_BOOKINGS_KEY = 'klipp.active-pro-location-bookings';
const LOCATION_TASK_ERROR_KEY = 'klipp.pro-location-task-error';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(PRO_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(PRO_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      await AsyncStorage.setItem(LOCATION_TASK_ERROR_KEY, error.message);
      return;
    }
    const latestLocation = data?.locations[data.locations.length - 1];
    if (!latestLocation) return;

    const storedBookings = await AsyncStorage.getItem(ACTIVE_BOOKINGS_KEY);
    let bookingIds: unknown;
    try {
      bookingIds = JSON.parse(storedBookings ?? '[]');
    } catch {
      await AsyncStorage.setItem(LOCATION_TASK_ERROR_KEY, 'No se pudo leer la lista de reservas en seguimiento.');
      return;
    }
    if (!isStringArray(bookingIds) || bookingIds.length === 0) return;

    for (const bookingId of bookingIds) {
      const { data: published, error: publishError } = await supabase.rpc('publish_pro_location', {
        p_booking_id: bookingId,
        p_latitude: latestLocation.coords.latitude,
        p_longitude: latestLocation.coords.longitude,
      });
      if (publishError) {
        await AsyncStorage.setItem(LOCATION_TASK_ERROR_KEY, publishError.message);
        return;
      }
      if (published === false) {
        const currentValue = await AsyncStorage.getItem(ACTIVE_BOOKINGS_KEY);
        let currentIds: unknown;
        try {
          currentIds = JSON.parse(currentValue ?? '[]');
        } catch {
          await AsyncStorage.setItem(LOCATION_TASK_ERROR_KEY, 'No se pudo leer la lista de reservas en seguimiento.');
          return;
        }
        if (!isStringArray(currentIds)) return;
        const remainingIds = currentIds.filter((id) => id !== bookingId);
        await AsyncStorage.setItem(ACTIVE_BOOKINGS_KEY, JSON.stringify(remainingIds));
        if (remainingIds.length === 0 && await Location.hasStartedLocationUpdatesAsync(PRO_LOCATION_TASK)) {
          await Location.stopLocationUpdatesAsync(PRO_LOCATION_TASK);
        }
        return;
      }
    }
    await AsyncStorage.removeItem(LOCATION_TASK_ERROR_KEY);
  });
}

export async function updateActiveProTrackingBookings(bookingIds: string[]) {
  if (Platform.OS === 'web') return;
  await AsyncStorage.setItem(ACTIVE_BOOKINGS_KEY, JSON.stringify(bookingIds));
  const taskStarted = await Location.hasStartedLocationUpdatesAsync(PRO_LOCATION_TASK);
  if (bookingIds.length === 0) {
    if (taskStarted) await Location.stopLocationUpdatesAsync(PRO_LOCATION_TASK);
    await AsyncStorage.removeItem(LOCATION_TASK_ERROR_KEY);
    return;
  }
  if (!taskStarted) {
    await Location.startLocationUpdatesAsync(PRO_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.OtherNavigation,
      distanceInterval: 10,
      timeInterval: 5000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Klipp está en camino',
        notificationBody: 'Tu ubicación se comparte durante este servicio.',
        notificationColor: '#208AEF',
      },
    });
  }
}

export async function getProLocationTaskError() {
  const message = await AsyncStorage.getItem(LOCATION_TASK_ERROR_KEY);
  if (message) await AsyncStorage.removeItem(LOCATION_TASK_ERROR_KEY);
  return message;
}
