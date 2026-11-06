import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

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
  const { bookingId: requestedBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const deepLinkChatHandled = useRef<string | null>(null);
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [reassignmentLockedIds, setReassignmentLockedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AgendaMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [equipmentConfirmationBooking, setEquipmentConfirmationBooking] = useState<AgendaBooking | null>(null);
  const activeTripKey = bookings
    .filter((booking) => booking.status === 'en_route')
    .map((booking) => booking.id)
    .join(',');

  const loadBookings = useCallback(async () => {
    if (!userId) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('id, client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id, client_lat, client_lng, address_text, landmark_notes, assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct, commission_dop, pro_payout_dop, notes, created_at, accepted_at, en_route_at, arrived_at, started_at, completed_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason, service_types(name), pricing_tiers(label), addresses(label, street, references_text)')
      .eq('pro_id', userId)
      .in('status', ['scheduled', 'en_route', 'arrived', 'in_progress'])
      .order('scheduled_start');
    if (queryError) setError(queryError.message);
    else setBookings((data ?? []) as unknown as AgendaBooking[]);
    const { data: lockedData, error: lockedError } = await supabase.rpc('pro_list_pending_reassignment_locks');
    if (lockedError) setError(lockedError.message);
    else setReassignmentLockedIds((lockedData ?? []).map((row: { booking_id: string }) => row.booking_id));
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadBookings();
    if (!userId) return;
    let active = true;
    const refreshPresence = async () => {
      const { data, error: presenceError } = await supabase.from('pro_presence')
        .select('is_online, last_seen_at')
        .eq('pro_id', userId)
        .maybeSingle();
      if (!active) return;
      if (presenceError) setError(presenceError.message);
      else setIsOnline(Boolean(data?.is_online && data.last_seen_at && Date.now() - new Date(data.last_seen_at).getTime() < 90000));
    };
    void refreshPresence();
    const channel = supabase.channel(`pro-presence-status:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pro_presence',
        filter: `pro_id=eq.${userId}`,
      }, (payload) => {
        const presence = payload.new as { is_online?: boolean; last_seen_at?: string | null };
        setIsOnline(Boolean(presence.is_online && presence.last_seen_at && Date.now() - new Date(presence.last_seen_at).getTime() < 90000));
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [loadBookings, userId]));

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel(`pro-reassignment-notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const notification = payload.new as { type?: string };
        if (notification.type === 'booking_reassignment') void loadBookings();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadBookings, session?.user.id]);

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
  }, [activeTripKey, loading, loadBookings]);

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
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !requestedBookingId || deepLinkChatHandled.current === requestedBookingId) return;
      if (!bookings.some((booking) => booking.id === requestedBookingId)) return;

      deepLinkChatHandled.current = requestedBookingId;
      setChatBookingId(requestedBookingId);
      void supabase
        .from('messages')
        .select('id, booking_id, sender_id, body, created_at')
        .eq('booking_id', requestedBookingId)
        .order('created_at', { ascending: true })
        .limit(20)
        .then(({ data, error: messagesError }) => {
          if (!active) return;
          if (messagesError) setError(messagesError.message);
          else setChatMessages((data ?? []) as AgendaMessage[]);
        });
    });
    return () => { active = false; };
  }, [requestedBookingId, bookings]);

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

  async function togglePresence() {
    if (presenceBusy) return;
    setPresenceBusy(true);
    setError(null);
    try {
      if (isOnline) {
        const { error: offlineError } = await supabase.rpc('set_pro_presence', {
          p_online: false, p_latitude: null, p_longitude: null,
        });
        if (offlineError) throw offlineError;
        setIsOnline(false);
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Permite el acceso a tu ubicación para conectarte y recibir solicitudes cercanas.');
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { error: onlineError } = await supabase.rpc('set_pro_presence', {
          p_online: true,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
        });
        if (onlineError) throw onlineError;
        setIsOnline(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tu disponibilidad.');
    } finally {
      setPresenceBusy(false);
    }
  }

  useEffect(() => {
    if (!isOnline) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    async function startPresenceHeartbeat() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('No podemos mantenerte disponible sin permiso de ubicación.');
        subscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 25,
          timeInterval: 15000,
        }, async ({ coords }) => {
          const { error: heartbeatError } = await supabase.rpc('heartbeat_pro_presence', {
            p_latitude: coords.latitude,
            p_longitude: coords.longitude,
          });
          if (heartbeatError && active) setError(heartbeatError.message);
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos mantener tu conexión activa.');
      }
    }
    void startPresenceHeartbeat();
    return () => { active = false; subscription?.remove(); };
  }, [isOnline]);

  async function refresh() {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }

  async function advance(booking: AgendaBooking) {
    const step = nextStep[booking.status];
    if (!step) return;
    if (reassignmentLockedIds.includes(booking.id)) {
      setError('Esta reserva está temporalmente bloqueada mientras Klipp espera la respuesta del profesional sustituto.');
      return;
    }
    if (booking.status === 'arrived') {
      setEquipmentConfirmationBooking(booking);
      return;
    }
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

  async function confirmEquipmentAndStart() {
    const booking = equipmentConfirmationBooking;
    if (!booking) return;
    setBusyId(booking.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc('confirm_booking_equipment_and_start', {
      p_booking_id: booking.id,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setEquipmentConfirmationBooking(null);
      setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, status: 'in_progress' } : item));
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
      .insert({ booking_id: bookingId, sender_id: userId, body })
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
    <>
      <Modal
        animationType="fade"
        transparent
        visible={equipmentConfirmationBooking !== null}
        onRequestClose={() => { if (!busyId) setEquipmentConfirmationBooking(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.equipmentModal}>
            <Text style={styles.modalTitle}>Confirmar equipamiento</Text>
            <Text style={styles.modalMessage}>¿Confirmas que tienes contigo todas las herramientas, equipos, productos y materiales necesarios para realizar este servicio? Klipp no espera que utilices materiales del cliente.</Text>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={busyId !== null} onPress={() => setEquipmentConfirmationBooking(null)} style={styles.modalSecondary}>
                <Text style={styles.modalSecondaryText}>Ahora no</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busyId !== null} onPress={() => void confirmEquipmentAndStart()} style={[styles.modalPrimary, busyId !== null && styles.disabled]}>
                <Text style={styles.modalPrimaryText}>{busyId === equipmentConfirmationBooking?.id ? 'Confirmando…' : 'Sí, confirmo'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader role="pro" eyebrow="ESPACIO PROFESIONAL" title="Mi agenda" subtitle="Servicios confirmados y en curso." />
      <View style={styles.presenceCard}>
        <View style={styles.presenceCopy}>
          <View style={styles.presenceStatusRow}>
            <View style={[styles.presenceDot, isOnline ? styles.presenceDotOnline : styles.presenceDotOffline]} />
            <Text style={styles.presenceTitle}>{isOnline ? 'ONLINE · Estás disponible' : 'OFFLINE · No recibirás solicitudes'}</Text>
          </View>
          <Text style={styles.body}>{isOnline ? 'Klipp puede enviarte solicitudes inmediatas mientras tu ubicación siga activa. Si dejas vencer una solicitud sin responder, pasarás automáticamente a OFFLINE.' : 'Conéctate cuando quieras recibir solicitudes inmediatas. Tus reservas programadas no cambian.'}</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: isOnline }} disabled={presenceBusy} onPress={() => void togglePresence()} style={[styles.presenceButton, isOnline && styles.presenceButtonOnline, presenceBusy && styles.disabled]}>
          <Text style={styles.presenceButtonText}>{presenceBusy ? 'Actualizando…' : isOnline ? 'Desconectarme' : 'Conectarme'}</Text>
        </Pressable>
      </View>
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
            {reassignmentLockedIds.includes(booking.id) && <Text style={styles.reassignmentNotice}>Klipp está gestionando un posible cambio de profesional. No avances esta reserva hasta que se resuelva la solicitud.</Text>}
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
            {step && <Pressable accessibilityRole="button" disabled={busyId === booking.id || reassignmentLockedIds.includes(booking.id)} onPress={() => void advance(booking)} style={[styles.button, busyId === booking.id && styles.disabled]}><Text style={styles.buttonText}>{busyId === booking.id ? 'Actualizando...' : step.label}</Text></Pressable>}
          </View>
        );
      })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 44, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  equipmentModal: { width: '100%', maxWidth: 440, padding: 22, borderRadius: 18, backgroundColor: KlippColors.white, gap: 14 },
  modalTitle: { color: KlippColors.navy, fontSize: 20, fontWeight: '800' },
  modalMessage: { color: KlippColors.slate, fontSize: 15, lineHeight: 23 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalSecondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 10 },
  modalSecondaryText: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  modalPrimary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: KlippColors.teal },
  modalPrimaryText: { color: KlippColors.white, fontSize: 14, fontWeight: '800' },
  presenceCard: { marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.white, gap: 14 },
  presenceCopy: { gap: 7 },
  presenceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  presenceDot: { width: 11, height: 11, borderRadius: 6 },
  presenceDotOnline: { backgroundColor: '#15966f' },
  presenceDotOffline: { backgroundColor: '#b42318' },
  presenceTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '900' },
  presenceButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: KlippColors.blue },
  presenceButtonOnline: { backgroundColor: '#475569' },
  presenceButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, marginTop: -8 },
  card: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white, gap: 10 },
  empty: { marginTop: 20, padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 7 },
  cardTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  payout: { color: KlippColors.tealDark, fontSize: 15, fontWeight: '800', marginTop: 3 },
  reassignmentNotice: { color: '#8A5B00', backgroundColor: '#FFF4D6', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  locationNotice: { color: '#047857', fontSize: 13, fontWeight: '700' },
  chatButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: KlippColors.navy },
  chatButtonText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  chatPanel: { padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', gap: 8 },
  chatMessage: { alignSelf: 'flex-start', maxWidth: '85%', padding: 9, borderRadius: 12, backgroundColor: KlippColors.white },
  chatMessageOwn: { alignSelf: 'flex-end', backgroundColor: '#EAF2FF' },
  chatMessageText: { color: KlippColors.slate, fontSize: 13, lineHeight: 18 },
  messageInput: { minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 10, backgroundColor: KlippColors.white, color: KlippColors.navy, fontSize: 13 },
  button: { minHeight: 46, marginTop: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.teal },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});