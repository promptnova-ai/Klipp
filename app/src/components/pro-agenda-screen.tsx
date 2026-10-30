import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';
import { getProLocationTaskError, updateActiveProTrackingBookings } from '@/lib/pro-location-task';
import type { Booking, BookingStatus } from '@/lib/types';

type AgendaBooking = Booking & {
  service_types: { name: string } | null;
  pricing_tiers: { label: string } | null;
  addresses: { label: string | null; street: string | null; references_text: string | null } | null;
};
type AgendaMessage = { id: number; booking_id: string; sender_id: string; body: string; created_at: string };

const nextStep: Partial<Record<BookingStatus, { status: BookingStatus; label: string }>> = {
  scheduled: { status: 'en_route', label: 'Marcar en camino' },
  en_route: { status: 'arrived', label: 'Marcar llegada' },
  arrived: { status: 'in_progress', label: 'Iniciar servicio' },
  in_progress: { status: 'completed', label: 'Terminar servicio' },
};

export function ProAgendaScreen() {
  const { session } = useAuth();
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AgendaMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const activeTripKey = bookings
    .filter((booking) => booking.status === 'en_route')
    .map((booking) => booking.id)
    .join(',');

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('id, client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id, client_lat, client_lng, address_text, landmark_notes, assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct, commission_dop, pro_payout_dop, notes, created_at, accepted_at, en_route_at, arrived_at, started_at, completed_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason, service_types(name), pricing_tiers(label), addresses(label, street, references_text)')
      .eq('pro_id', session.user.id)
      .in('status', ['scheduled', 'en_route', 'arrived', 'in_progress'])
      .order('scheduled_start');
    if (queryError) setError(queryError.message);
    else setBookings((data ?? []) as unknown as AgendaBooking[]);
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadBookings(); }, [loadBookings]));

  useEffect(() => {
    if (loading) return;
    const activeTripIds = activeTripKey ? activeTripKey.split(',') : [];
    let active = true;
    const subscriptions: Location.LocationSubscription[] = [];

    async function startLocationUpdates() {
      try {
        if (activeTripIds.length === 0) {
          if (Platform.OS !== 'web') {
            await updateActiveProTrackingBookings([]);
          }
          return;
        }
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (active) setError('Permite el acceso a tu ubicación para compartirla mientras estás en camino.');
          return;
        }
        if (Platform.OS !== 'web') {
          const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
          if (backgroundPermission.granted) {
            try {
              await updateActiveProTrackingBookings(activeTripIds);
              const taskError = await getProLocationTaskError();
              if (taskError && active) setError(taskError);
              return;
            } catch (cause) {
              if (active) setError(cause instanceof Error ? cause.message : 'No pudimos iniciar el seguimiento en segundo plano.');
            }
          } else if (active) {
            setError('La ubicación en segundo plano no está permitida; el seguimiento funcionará mientras la app esté abierta.');
          }
        }
        for (const bookingId of activeTripIds) {
          let subscription: Location.LocationSubscription | null = null;
          subscription = await Location.watchPositionAsync({
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 5000,
          }, async ({ coords }) => {
            const { data: published, error: publishError } = await supabase.rpc('publish_pro_location', {
              p_booking_id: bookingId,
              p_latitude: coords.latitude,
              p_longitude: coords.longitude,
            });
            if (publishError && active) setError(publishError.message);
            if (published === false) {
              subscription?.remove();
              if (active) await loadBookings();
            }
          });
          if (active) subscriptions.push(subscription);
          else subscription.remove();
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos iniciar el seguimiento de ubicación.');
      }
    }

    void startLocationUpdates();
    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [activeTripKey, loading]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void getProLocationTaskError().then((taskError) => {
          if (taskError) setError(taskError);
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'No pudimos revisar el estado del seguimiento de ubicación.');
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const channels = bookings
      .filter((booking) => booking.status === 'en_route')
      .map((booking) => supabase
        .channel(`pro-booking-messages:${booking.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${booking.id}`,
        }, (payload) => {
          const message = payload.new as AgendaMessage;
          if (chatBookingId === booking.id) {
            setChatMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-20));
          }
        })
        .subscribe());
    return () => { channels.forEach((channel) => { void supabase.removeChannel(channel); }); };
  }, [bookings, chatBookingId]);

  async function refresh() {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }

  async function advance(booking: AgendaBooking) {
    const step = nextStep[booking.status];
    if (!step) return;
    setBusyId(booking.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('advance_booking', {
      p_booking_id: booking.id,
      p_new_status: step.status,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, status: step.status } : item));
      await loadBookings();
    }
    setBusyId(null);
  }

  async function toggleChat(bookingId: string) {
    if (chatBookingId === bookingId) {
      setChatBookingId(null);
      return;
    }
    setChatBookingId(bookingId);
    const { data, error: messagesError } = await supabase
      .from('messages')
      .select('id, booking_id, sender_id, body, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(20);
    if (messagesError) setError(messagesError.message);
    else setChatMessages((data ?? []) as AgendaMessage[]);
  }

  async function sendMessage(bookingId: string) {
    if (!session?.user.id) return;
    const body = messageDraft.trim();
    if (!body) return;
    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({ booking_id: bookingId, sender_id: session.user.id, body })
      .select('id, booking_id, sender_id, body, created_at')
      .single();
    if (sendError) setError(sendError.message);
    else {
      setMessageDraft('');
      setChatMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as AgendaMessage].slice(-20));
    }
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando agenda...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader eyebrow="ESPACIO PROFESIONAL" title="Mi agenda" subtitle="Servicios confirmados y en curso." role="pro" />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && bookings.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.cardTitle}>No tienes servicios próximos</Text>
          <Text style={styles.body}>Las reservas aceptadas aparecerán aquí.</Text>
        </View>
      )}
      {bookings.map((booking) => {
        const step = nextStep[booking.status];
        return (
          <View key={booking.id} style={styles.card}>
            <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio de limpieza'}</Text>
            <Text style={styles.body}>{booking.pricing_tiers?.label ?? `${booking.est_minutes} min`}</Text>
            <Text style={styles.body}>Fecha: {formatBusinessDate(booking.scheduled_start)}</Text>
            <Text style={styles.body}>Ubicación: {booking.address_text || booking.addresses?.label || booking.addresses?.street || 'No disponible'}</Text>
            {(booking.landmark_notes || booking.addresses?.references_text) && <Text style={styles.body}>Referencia: {booking.landmark_notes || booking.addresses?.references_text}</Text>}
            {booking.status === 'en_route' && <Text style={styles.locationNotice}>Compartiendo ubicación en vivo con el cliente.</Text>}
            {booking.status === 'en_route' && (
              <>
                <Pressable accessibilityRole="button" onPress={() => void toggleChat(booking.id)} style={({ pressed }) => [styles.chatButton, pressed && styles.disabled]}>
                  <Text style={styles.chatButtonText}>{chatBookingId === booking.id ? 'Cerrar chat con cliente' : 'Mensaje del cliente'}</Text>
                </Pressable>
                {chatBookingId === booking.id && (
                  <View style={styles.chatPanel}>
                    {chatMessages.map((message) => (
                      <View key={message.id} style={[styles.chatMessage, message.sender_id === session?.user.id && styles.chatMessageOwn]}>
                        <Text style={styles.chatMessageText}>{message.body}</Text>
                      </View>
                    ))}
                    <TextInput
                      accessibilityLabel="Escribe un mensaje al cliente"
                      maxLength={2000}
                      onChangeText={setMessageDraft}
                      placeholder="Escribe un mensaje..."
                      placeholderTextColor={KlippColors.muted}
                      style={styles.messageInput}
                      value={messageDraft}
                    />
                    <Pressable accessibilityRole="button" onPress={() => void sendMessage(booking.id)} style={({ pressed }) => [styles.chatButton, pressed && styles.disabled]}>
                      <Text style={styles.chatButtonText}>Enviar mensaje</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
            <Text style={styles.payout}>Pago al profesional: {formatDop(booking.pro_payout_dop)}</Text>
            {step && <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => void advance(booking)} style={[styles.button, busyId === booking.id && styles.disabled]}><Text style={styles.buttonText}>{busyId === booking.id ? 'Actualizando...' : step.label}</Text></Pressable>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 18, backgroundColor: '#F3F8F6', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, marginTop: -8 },
  card: { padding: 21, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 12, shadowColor: '#124B3E', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 9 }, shadowRadius: 18, elevation: 3 },
  empty: { marginTop: 12, padding: 24, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 10 },
  cardTitle: { color: '#173B34', fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  payout: { color: KlippColors.blueDark, fontSize: 15, fontWeight: '700', marginTop: 3 },
  locationNotice: { color: '#047857', fontSize: 13, fontWeight: '700' },
  chatButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: KlippColors.navy },
  chatButtonText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  chatPanel: { padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', gap: 8 },
  chatMessage: { alignSelf: 'flex-start', maxWidth: '85%', padding: 9, borderRadius: 12, backgroundColor: KlippColors.white },
  chatMessageOwn: { alignSelf: 'flex-end', backgroundColor: '#EAF2FF' },
  chatMessageText: { color: KlippColors.slate, fontSize: 13, lineHeight: 18 },
  messageInput: { minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 10, backgroundColor: KlippColors.white, color: KlippColors.navy, fontSize: 13 },
  button: { minHeight: 50, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#0F987A' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});