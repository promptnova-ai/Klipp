import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';
import type { Booking, BookingStatus, ProCard, Review } from '@/lib/types';

type ClientBooking = Booking & {
  service_types: { name: string } | null;
  pricing_tiers: { label: string } | null;
  addresses: { label: string | null; street: string | null; references_text: string | null; sectors: { name: string } | null } | null;
};

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
      .select('id, client_id, pro_id, service_type_id, pricing_tier_id, address_id, assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct, commission_dop, pro_payout_dop, notes, created_at, accepted_at, en_route_at, arrived_at, started_at, completed_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason, service_types(name), pricing_tiers(label), addresses(label, street, references_text, sectors(name))')
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
        proIds.length ? supabase.from('pro_cards').select('pro_id, full_name, avatar_url, bio, years_experience, base_sector_id, rating_avg, rating_count, jobs_completed').in('pro_id', proIds) : Promise.resolve({ data: [], error: null }),
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
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadBookings(); }, [loadBookings]));

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

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando reservas...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <Text style={styles.title}>Mis reservas</Text>
      {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && bookings.length === 0 && <View style={styles.empty}><Text style={styles.cardTitle}>Todavía no tienes reservas</Text><Text style={styles.body}>Cuando solicites un servicio, podrás seguirlo aquí.</Text></View>}
      {bookings.map((booking) => {
        const pro = booking.pro_id ? pros[booking.pro_id] : undefined;
        const review = reviews[booking.id];
        const searching = booking.assignment_mode === 'auto' && booking.status === 'requested';
        const canReview = ['completed', 'confirmed'].includes(booking.status) && !!booking.pro_id && !review;
        return (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio de limpieza'}</Text>
              <Text style={styles.status}>{searching ? 'Buscando profesional' : statusLabels[booking.status]}</Text>
            </View>
            <Text style={styles.body}>{booking.pricing_tiers?.label ?? 'Tamaño no disponible'}</Text>
            <Text style={styles.body}>Fecha: {formatBusinessDate(booking.scheduled_start)}</Text>
            <Text style={styles.body}>Dirección: {booking.addresses?.label || booking.addresses?.street || booking.addresses?.sectors?.name || 'No disponible'}</Text>
            {!!booking.addresses?.references_text && <Text style={styles.body}>Referencias: {booking.addresses.references_text}</Text>}
            <Text style={styles.price}>{formatDop(booking.price_dop)}</Text>
            {booking.status === 'awaiting_payment' && <View style={styles.payment}><Text style={styles.paymentTitle}>Pago pendiente</Text><Text style={styles.body}>La integración de pagos estará disponible más adelante.</Text></View>}
            {pro && <Text style={styles.body}>Profesional: {pro.full_name ?? 'Profesional Klipp'}</Text>}
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

const styles = StyleSheet.create({
  page: { padding: 22, paddingTop: 58, paddingBottom: 35, gap: 14, backgroundColor: '#f4f7f5', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  empty: { marginTop: 20, padding: 18, borderRadius: 8, backgroundColor: '#fff', gap: 7 },
  card: { padding: 17, borderRadius: 8, backgroundColor: '#fff', gap: 8 },
  cardHeader: { gap: 5 },
  cardTitle: { color: '#18332d', fontSize: 17, fontWeight: '700' },
  status: { color: '#126e64', fontSize: 13, fontWeight: '700' },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  price: { color: '#18332d', fontSize: 16, fontWeight: '700', marginTop: 3 },
  payment: { padding: 12, borderRadius: 6, backgroundColor: '#fff1dd', gap: 4 },
  paymentTitle: { color: '#8a4d00', fontSize: 14, fontWeight: '700' },
  button: { minHeight: 46, marginTop: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#16766c' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.55 },
  reviewForm: { marginTop: 10, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#e6ede9', gap: 9 },
  reviewTitle: { color: '#18332d', fontSize: 15, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', gap: 8 },
  star: { paddingVertical: 2, paddingHorizontal: 3 },
  starText: { color: '#a46d00', fontSize: 28 },
  commentInput: { minHeight: 70, borderWidth: 1, borderColor: '#cbd7d1', borderRadius: 7, padding: 10, color: '#18332d', textAlignVertical: 'top' },
  reviewButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: '#16766c' },
  reviewDone: { color: '#52615b', fontSize: 13, lineHeight: 20, marginTop: 8 },
  paymentNotice: { color: '#8a4d00' },
  notice: { color: '#126e64', fontSize: 14 },
  error: { color: '#a32f27', fontSize: 14, lineHeight: 20 },
});