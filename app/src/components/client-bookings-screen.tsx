import { useCallback, useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { TrackingMap } from '@/components/tracking-map';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';
import type { Booking, BookingStatus, ProCard, Review } from '@/lib/types';

type ClientBooking = Booking & {
  service_types: { name: string } | null;
  pricing_tiers: { label: string } | null;
  addresses: { label: string | null; street: string | null; references_text: string | null } | null;
};
type LocationPoint = { latitude: number; longitude: number };
type QueueInfo = { previous_stops: number; previous_service_in_progress: boolean; departure_window: string };
type BookingMessage = { id: number; booking_id: string; sender_id: string; body: string; created_at: string };

const statusLabels: Record<BookingStatus, string> = {
  requested: 'Solicitud enviada',
  awaiting_payment: 'Pago pendiente',
  scheduled: 'Programada',
  en_route: 'En camino',
  arrived: 'Profesional en el lugar',
  in_progress: 'Servicio en curso',
  completed: 'Servicio terminado',
  confirmed: 'Servicio confirmado',
  cancelled: 'Cancelada',
  disputed: 'En revisión',
  expired: 'Expirada',
};

export function ClientBookingsScreen() {
  const { session } = useAuth();
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [pros, setPros] = useState<Record<string, ProCard>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [tracking, setTracking] = useState<Record<string, LocationPoint>>({});
  const [queueInfo, setQueueInfo] = useState<Record<string, QueueInfo>>({});
  const [proPhones, setProPhones] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, BookingMessage[]>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('id, client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id, client_lat, client_lng, address_text, landmark_notes, assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct, commission_dop, pro_payout_dop, notes, created_at, accepted_at, en_route_at, arrived_at, started_at, completed_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason, service_types(name), pricing_tiers(label), addresses(label, street, references_text)')
      .eq('client_id', session.user.id)
      .order('scheduled_start', { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    const bookingRows = (data ?? []) as unknown as ClientBooking[];
    setBookings(bookingRows);
    if (bookingRows.length) {
      const bookingIds = bookingRows.map((booking) => booking.id);
      const proIds = [...new Set(bookingRows.flatMap((booking) => booking.pro_id ? [booking.pro_id] : []))];
      const [reviewResult, proResult] = await Promise.all([
        supabase.from('reviews').select('id, booking_id, client_id, pro_id, rating, comment, created_at').in('booking_id', bookingIds),
        proIds.length ? supabase.from('pro_cards').select('pro_id, full_name, avatar_url, bio, years_experience, base_sector_id, rating_avg, rating_count, jobs_completed, transport_type').in('pro_id', proIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (reviewResult.error || proResult.error) setError(reviewResult.error?.message ?? proResult.error?.message ?? 'No pudimos cargar los detalles.');
      else {
        setReviews(Object.fromEntries(((reviewResult.data ?? []) as Review[]).map((review) => [review.booking_id, review])));
        setPros(Object.fromEntries(((proResult.data ?? []) as ProCard[]).map((pro) => [pro.pro_id, pro])));
      }
    } else {
      setReviews({});
      setPros({});
    }
    const scheduledBookings = bookingRows.filter((booking) => booking.status === 'scheduled' && booking.pro_id);
    const queueResults = await Promise.all(scheduledBookings.map(async (booking) => {
      const { data, error: queueError } = await supabase.rpc('get_booking_queue_info', { p_booking_id: booking.id });
      if (queueError) return { bookingId: booking.id, error: queueError.message };
      const first = (data ?? [])[0] as QueueInfo | undefined;
      return { bookingId: booking.id, info: first };
    }));
    const queueErrors = queueResults.flatMap((result) => 'error' in result ? [result.error] : []);
    const firstQueueError = queueErrors[0];
    if (firstQueueError) setError(firstQueueError);
    setQueueInfo(Object.fromEntries(queueResults.flatMap((result) =>
      'info' in result && result.info ? [[result.bookingId, result.info]] : [],
    )));
    const enRouteBookings = bookingRows.filter((booking) => booking.status === 'en_route');
    const phoneResults = await Promise.all(enRouteBookings.map(async (booking) => {
      const { data, error: phoneError } = await supabase.rpc('get_tracking_pro_phone', { p_booking_id: booking.id });
      if (phoneError) return { bookingId: booking.id, error: phoneError.message };
      const contact = (data ?? [])[0] as { phone: string | null } | undefined;
      return { bookingId: booking.id, phone: contact?.phone };
    }));
    const firstPhoneError = phoneResults.find((result) => 'error' in result)?.error;
    if (firstPhoneError) setError(firstPhoneError);
    setProPhones(Object.fromEntries(phoneResults.flatMap((result) =>
      'phone' in result && result.phone ? [[result.bookingId, result.phone]] : [],
    )));
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadBookings(); }, [loadBookings]));

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`client-bookings:${session.user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `client_id=eq.${session.user.id}`,
      }, () => { void loadBookings(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, loadBookings]);

  useEffect(() => {
    const activeBookings = bookings.filter((booking) => booking.status === 'en_route');
    if (activeBookings.length === 0) {
      setTracking({});
      return;
    }
    const channels = activeBookings.map((booking) => {
      const channel = supabase
        .channel(`tracking:${booking.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pro_locations',
          filter: `booking_id=eq.${booking.id}`,
        }, (payload) => {
          if (payload.eventType === 'DELETE') {
            setTracking((current) => {
              const next = { ...current };
              delete next[booking.id];
              return next;
            });
            return;
          }
          const row = payload.new as { latitude?: number; longitude?: number };
          if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
            setTracking((current) => ({ ...current, [booking.id]: { latitude: row.latitude!, longitude: row.longitude! } }));
          }
        })
        .subscribe();
      void supabase
        .from('pro_locations')
        .select('latitude, longitude')
        .eq('booking_id', booking.id)
        .maybeSingle()
        .then(({ data, error: locationError }) => {
          if (locationError) setError(locationError.message);
          else if (typeof data?.latitude === 'number' && typeof data.longitude === 'number') {
            setTracking((current) => ({ ...current, [booking.id]: { latitude: data.latitude, longitude: data.longitude } }));
          }
        });
      return channel;
    });
    return () => { channels.forEach((channel) => { void supabase.removeChannel(channel); }); };
  }, [bookings]);

  useEffect(() => {
    const activeBookings = bookings.filter((booking) => booking.status === 'en_route');
    const channels = activeBookings.map((booking) => supabase
      .channel(`booking-messages:${booking.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${booking.id}`,
      }, (payload) => {
        const message = payload.new as BookingMessage;
        setMessages((current) => {
          const currentMessages = current[booking.id] ?? [];
          if (currentMessages.some((item) => item.id === message.id)) return current;
          return { ...current, [booking.id]: [...currentMessages, message].slice(-20) };
        });
      })
      .subscribe());
    return () => { channels.forEach((channel) => { void supabase.removeChannel(channel); }); };
  }, [bookings]);

  useEffect(() => {
    if (!bookings.some((booking) => booking.status === 'in_progress')) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [bookings]);

  async function refresh() {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }

  async function confirmService(bookingId: string) {
    setBusyId(bookingId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('advance_booking', { p_booking_id: bookingId, p_new_status: 'confirmed' });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice('Servicio confirmado.');
      await loadBookings();
    }
    setBusyId(null);
  }

  async function submitReview(booking: ClientBooking) {
    if (!session?.user.id || !booking.pro_id) return;
    const rating = ratings[booking.id] ?? 5;
    setBusyId(booking.id);
    setError(null);
    const { error: reviewError } = await supabase.from('reviews').insert({
      booking_id: booking.id,
      client_id: session.user.id,
      pro_id: booking.pro_id,
      rating,
      comment: comments[booking.id]?.trim() || null,
    });
    if (reviewError) setError(reviewError.message);
    else {
      setNotice('Gracias por compartir tu reseña.');
      await loadBookings();
    }
    setBusyId(null);
  }

  async function callProfessional(bookingId: string) {
    const phone = proPhones[bookingId]?.replace(/[^\d+]/g, '');
    if (!phone || !/^\+?\d{7,15}$/.test(phone)) {
      setError('Este profesional no tiene un teléfono disponible para llamadas.');
      return;
    }
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos abrir la aplicación de llamadas.');
    }
  }

  async function toggleChat(bookingId: string) {
    if (openChatId === bookingId) {
      setOpenChatId(null);
      return;
    }
    setOpenChatId(bookingId);
    const { data, error: messagesError } = await supabase
      .from('messages')
      .select('id, booking_id, sender_id, body, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(20);
    if (messagesError) setError(messagesError.message);
    else setMessages((current) => ({ ...current, [bookingId]: (data ?? []) as BookingMessage[] }));
  }

  async function sendMessage(bookingId: string) {
    if (!session?.user.id) return;
    const body = messageDrafts[bookingId]?.trim();
    if (!body) return;
    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({ booking_id: bookingId, sender_id: session.user.id, body })
      .select('id, booking_id, sender_id, body, created_at')
      .single();
    if (sendError) setError(sendError.message);
    else {
      setMessageDrafts((current) => ({ ...current, [bookingId]: '' }));
      setMessages((current) => {
        const currentMessages = current[bookingId] ?? [];
        if (currentMessages.some((item) => item.id === data.id)) return current;
        return { ...current, [bookingId]: [...currentMessages, data as BookingMessage].slice(-20) };
      });
    }
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando reservas...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader eyebrow="SERVICIOS" title="Mis reservas" subtitle="Consulta el estado de tus servicios." />
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && bookings.length === 0 && <View style={styles.empty}><Text style={styles.cardTitle}>Todavía no tienes reservas</Text><Text style={styles.body}>Cuando solicites un servicio, podrás seguirlo aquí.</Text></View>}
      {bookings.map((booking) => {
        const pro = booking.pro_id ? pros[booking.pro_id] : undefined;
        const review = reviews[booking.id];
        const searching = booking.assignment_mode === 'auto' && booking.status === 'requested';
        const canReview = ['completed', 'confirmed'].includes(booking.status) && !!booking.pro_id && !review;
        const statusLabel = searching ? 'Buscando profesional' : statusLabels[booking.status];
        const livePoint = tracking[booking.id];
        const hasDestination = typeof booking.client_lat === 'number' && typeof booking.client_lng === 'number';
        const queue = queueInfo[booking.id];
        const eta = livePoint && hasDestination
          ? Math.max(1, Math.round(distanceInKm(livePoint, { latitude: booking.client_lat!, longitude: booking.client_lng! }) / 25 * 60))
          : null;
        const startedAt = booking.started_at ? new Date(booking.started_at).getTime() : null;
        const elapsedMinutes = startedAt ? Math.max(0, Math.floor((currentTime - startedAt) / 60_000)) : 0;
        const statusPillTone = ['completed', 'confirmed'].includes(booking.status)
          ? styles.statusPillSuccess
          : ['cancelled', 'disputed', 'expired'].includes(booking.status)
            ? styles.statusPillNeutral
            : styles.statusPillActive;
        const statusTextTone = ['completed', 'confirmed'].includes(booking.status)
          ? styles.statusTextSuccess
          : ['cancelled', 'disputed', 'expired'].includes(booking.status)
            ? styles.statusTextNeutral
            : styles.statusTextActive;
        const statusDotTone = ['completed', 'confirmed'].includes(booking.status)
          ? styles.statusDotSuccess
          : ['cancelled', 'disputed', 'expired'].includes(booking.status)
            ? styles.statusDotNeutral
            : styles.statusDotActive;
        return (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.serviceHeading}>
                <View style={styles.serviceIcon}>
                  <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={KlippColors.blueDark} size={19} />
                </View>
                <View style={styles.serviceHeadingCopy}>
                  <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio de limpieza'}</Text>
                  <Text style={styles.tier}>{booking.pricing_tiers?.label ?? `${booking.est_minutes} min`}</Text>
                </View>
              </View>
              <View style={[styles.statusPill, statusPillTone]}>
                <View style={[styles.statusDot, statusDotTone]} />
                <Text style={[styles.status, statusTextTone]}>{statusLabel}</Text>
              </View>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.detailRow}>
              <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={KlippColors.muted} size={17} />
              <Text style={styles.body}>{formatBusinessDate(booking.scheduled_start)}</Text>
            </View>
            <View style={styles.detailRow}>
              <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={KlippColors.muted} size={17} />
              <Text style={styles.body}>{booking.address_text || booking.addresses?.label || booking.addresses?.street || 'Dirección no disponible'}</Text>
            </View>
            {!!(booking.landmark_notes || booking.addresses?.references_text) && <Text style={styles.reference}>{booking.landmark_notes || booking.addresses?.references_text}</Text>}
            {pro && <View style={styles.proChip}><View style={styles.proAvatar}><Text style={styles.proAvatarText}>{pro.full_name?.[0] ?? 'K'}</Text></View><Text style={styles.proText}>Con {pro.full_name ?? 'Profesional Klipp'}</Text></View>}
            {booking.status === 'scheduled' && queue && (
              <View style={styles.queueBanner}>
                <Text style={styles.queueTitle}>
                  {queue.previous_service_in_progress
                    ? 'El profesional está completando un servicio previo'
                    : `El profesional se está preparando (${queue.previous_stops} paradas previas)`}
                </Text>
                <Text style={styles.body}>Salida estimada: {new Date(queue.departure_window).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santo_Domingo' })}</Text>
              </View>
            )}
            {booking.status === 'en_route' && (
              <View style={styles.trackingPanel}>
                <Text style={styles.etaBadge}>{eta === null ? 'Buscando ubicación en vivo...' : `Llega en ~${eta} min`}</Text>
                {livePoint && hasDestination && (
                  <TrackingMap
                    clientCoordinate={{ latitude: booking.client_lat!, longitude: booking.client_lng! }}
                    proCoordinate={livePoint}
                  />
                )}
                {pro && <View style={styles.trackingPro}>
                  <View style={styles.proAvatar}><Text style={styles.proAvatarText}>{pro.full_name?.[0] ?? 'K'}</Text></View>
                  <View style={styles.serviceHeadingCopy}>
                    <Text style={styles.cardTitle}>{pro.full_name ?? 'Profesional Klipp'}</Text>
                    <Text style={styles.tier}>★ {Number(pro.rating_avg).toFixed(1)} · {pro.transport_type || 'En camino'}</Text>
                  </View>
                </View>}
                <View style={styles.contactActions}>
                  {proPhones[booking.id] && <Pressable accessibilityRole="button" onPress={() => void callProfessional(booking.id)} style={({ pressed }) => [styles.contactButton, pressed && styles.buttonPressed]}>
                    <Text style={styles.contactButtonText}>Llamar</Text>
                  </Pressable>}
                  <Pressable accessibilityRole="button" onPress={() => void toggleChat(booking.id)} style={({ pressed }) => [styles.contactButton, styles.messageButton, pressed && styles.buttonPressed]}>
                    <Text style={styles.contactButtonText}>{openChatId === booking.id ? 'Cerrar chat' : 'Mensaje'}</Text>
                  </Pressable>
                </View>
                {openChatId === booking.id && (
                  <View style={styles.chatPanel}>
                    {(messages[booking.id] ?? []).map((message) => (
                      <View key={message.id} style={[styles.chatMessage, message.sender_id === session?.user.id && styles.chatMessageOwn]}>
                        <Text style={styles.chatMessageText}>{message.body}</Text>
                      </View>
                    ))}
                    <TextInput
                      accessibilityLabel="Escribe un mensaje al profesional"
                      maxLength={2000}
                      onChangeText={(value) => setMessageDrafts((current) => ({ ...current, [booking.id]: value }))}
                      placeholder="Escribe un mensaje..."
                      placeholderTextColor={KlippColors.muted}
                      style={styles.messageInput}
                      value={messageDrafts[booking.id] ?? ''}
                    />
                    <Pressable accessibilityRole="button" onPress={() => void sendMessage(booking.id)} style={({ pressed }) => [styles.sendMessageButton, pressed && styles.buttonPressed]}>
                      <Text style={styles.sendMessageText}>Enviar mensaje</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            {booking.status === 'in_progress' && (
              <View style={styles.queueBanner}>
                <Text style={styles.queueTitle}>Servicio en curso</Text>
                <Text style={styles.body}>Tiempo transcurrido: {Math.floor(elapsedMinutes / 60)} h {elapsedMinutes % 60} min</Text>
              </View>
            )}
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Total</Text>
              <Text style={styles.price}>{formatDop(booking.price_dop)}</Text>
            </View>
            {booking.status === 'awaiting_payment' && <View style={styles.payment}><Text style={styles.paymentTitle}>Pago pendiente</Text><Text style={styles.body}>La integración de pagos estará disponible más adelante.</Text></View>}
            {booking.status === 'completed' && <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => void confirmService(booking.id)} style={[styles.button, busyId === booking.id && styles.disabled]}><Text style={styles.buttonText}>{busyId === booking.id ? 'Confirmando...' : 'Confirmar servicio'}</Text></Pressable>}
            {canReview && (
              <View style={styles.reviewForm}>
                <Text style={styles.reviewTitle}>¿Cómo fue el servicio?</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((rating) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: (ratings[booking.id] ?? 5) === rating }} key={rating} onPress={() => setRatings((current) => ({ ...current, [booking.id]: rating }))} style={styles.star}><Text style={styles.starText}>{(ratings[booking.id] ?? 5) >= rating ? '★' : '☆'}</Text></Pressable>)}
                </View>
                <TextInput multiline onChangeText={(value) => setComments((current) => ({ ...current, [booking.id]: value }))} placeholder="Comentario (opcional)" placeholderTextColor="#85918b" style={styles.commentInput} value={comments[booking.id] ?? ''} />
                <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => void submitReview(booking)} style={styles.reviewButton}><Text style={styles.buttonText}>Enviar reseña</Text></Pressable>
              </View>
            )}
            {review && <Text style={styles.reviewDone}>Tu reseña: {'★'.repeat(review.rating)} {review.comment ?? ''}</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

function distanceInKm(from: LocationPoint, to: LocationPoint) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const styles = StyleSheet.create({
  page: { paddingBottom: 35, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '700' },
  empty: { marginTop: 4, marginHorizontal: 20, padding: 20, borderRadius: 18, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, gap: 8 },
  card: { marginHorizontal: 20, padding: 18, borderRadius: 20, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, gap: 13, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 3 },
  cardHeader: { gap: 12 },
  serviceHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  serviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  serviceHeadingCopy: { flex: 1, gap: 3 },
  cardTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  tier: { color: KlippColors.muted, fontSize: 13 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillActive: { backgroundColor: '#EEF4FF' },
  statusPillSuccess: { backgroundColor: '#ECFDF5' },
  statusPillNeutral: { backgroundColor: '#F1F5F9' },
  statusTextActive: { color: KlippColors.blueDark },
  statusTextSuccess: { color: '#047857' },
  statusTextNeutral: { color: KlippColors.muted },
  statusDotActive: { backgroundColor: KlippColors.blueDark },
  statusDotSuccess: { backgroundColor: '#047857' },
  statusDotNeutral: { backgroundColor: KlippColors.muted },
  status: { fontSize: 11, fontWeight: '700' },
  cardDivider: { height: 1, backgroundColor: KlippColors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  reference: { color: KlippColors.muted, fontSize: 12, lineHeight: 18, marginLeft: 26 },
  queueBanner: { padding: 14, borderRadius: 14, backgroundColor: '#F4F7FF', gap: 5 },
  queueTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  trackingPanel: { gap: 12 },
  etaBadge: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: '#ECFDF5', color: '#047857', fontSize: 14, fontWeight: '800' },
  trackingPro: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14 },
  contactActions: { flexDirection: 'row', gap: 9 },
  contactButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.blue },
  messageButton: { backgroundColor: KlippColors.navy },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  contactButtonText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  chatPanel: { padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', gap: 8 },
  chatMessage: { alignSelf: 'flex-start', maxWidth: '85%', padding: 9, borderRadius: 12, backgroundColor: KlippColors.white },
  chatMessageOwn: { alignSelf: 'flex-end', backgroundColor: '#EAF2FF' },
  chatMessageText: { color: KlippColors.slate, fontSize: 13, lineHeight: 18 },
  messageInput: { minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 10, backgroundColor: KlippColors.white, color: KlippColors.navy, fontSize: 13 },
  sendMessageButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: KlippColors.blue },
  sendMessageText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  proChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  proAvatarText: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  proText: { color: KlippColors.slate, fontSize: 13, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 13, backgroundColor: '#F4F7FF' },
  priceLabel: { color: KlippColors.muted, fontSize: 13, fontWeight: '600' },
  price: { color: KlippColors.blueDark, fontSize: 15, fontWeight: '800' },
  payment: { padding: 14, borderRadius: 14, backgroundColor: KlippColors.goldLight, gap: 4 },
  paymentTitle: { color: '#8A5B00', fontSize: 14, fontWeight: '700' },
  button: { minHeight: 48, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.blue },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.55 },
  reviewForm: { marginTop: 3, paddingTop: 15, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 10 },
  reviewTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', gap: 8 },
  star: { paddingVertical: 2, paddingHorizontal: 3 },
  starText: { color: '#A46D00', fontSize: 28 },
  commentInput: { minHeight: 74, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 12, padding: 12, color: KlippColors.navy, textAlignVertical: 'top' },
  reviewButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: KlippColors.blue },
  reviewDone: { color: KlippColors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  notice: { color: '#067647', fontSize: 14 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});