import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useAuth } from '@/components/auth-provider';

type NotificationResponse = Notifications.NotificationResponse;

export function NotificationResponseHandler() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [pendingResponse, setPendingResponse] = useState<NotificationResponse | null>(null);
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) setPendingResponse(response);
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      setPendingResponse(response);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingResponse || !session || !profile) return;
    const request = pendingResponse.notification.request;
    const responseKey = `${request.identifier}:${pendingResponse.actionIdentifier}`;
    if (handledKey.current === responseKey) return;
    handledKey.current = responseKey;

    const data = request.content.data as Record<string, unknown>;
    const bookingId = typeof data.bookingId === 'string' ? data.bookingId : null;
    if (profile.role === 'pro') {
      if (data.target === 'pro' && typeof data.requestId === 'string') router.push('/(pro)');
      else router.push('/(pro)/agenda');
    } else if (bookingId) {
      router.push({ pathname: '/tracking', params: { bookingId } });
    } else {
      router.push('/(client)/bookings');
    }
    setPendingResponse(null);
    void Notifications.clearLastNotificationResponseAsync();
  }, [pendingResponse, session, profile, router]);

  return null;
}
