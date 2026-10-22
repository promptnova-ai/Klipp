import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';
import type { Booking, BookingStatus } from '@/lib/types';

type AgendaBooking = Booking & {
  service_types: { name: string } | null;
  pricing_tiers: { label: string } | null;
  addresses: { label: string | null; references_text: string | null; sectors: { name: string } | null } | null;
};

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

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('id, client_id, pro_id, service_type_id, pricing_tier_id, address_id, assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct, commission_dop, pro_payout_dop, notes, created_at, accepted_at, en_route_at, arrived_at, started_at, completed_at, confirmed_at, cancelled_at, cancelled_by, cancel_reason, service_types(name), pricing_tiers(label), addresses(label, references_text, sectors(name))')
      .eq('pro_id', session.user.id)
      .in('status', ['scheduled', 'en_route', 'arrived', 'in_progress'])
      .order('scheduled_start');
    if (queryError) setError(queryError.message);
    else setBookings((data ?? []) as unknown as AgendaBooking[]);
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadBookings(); }, [loadBookings]));

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
    else await loadBookings();
    setBusyId(null);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando agenda...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader eyebrow="ESPACIO PROFESIONAL" title="Mi agenda" subtitle="Servicios confirmados y en curso." />
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
            <Text style={styles.body}>{booking.pricing_tiers?.label ?? 'Tamaño no disponible'}</Text>
            <Text style={styles.body}>Fecha: {formatBusinessDate(booking.scheduled_start)}</Text>
            <Text style={styles.body}>Sector: {booking.addresses?.sectors?.name ?? 'No disponible'}</Text>
            {booking.addresses?.references_text && <Text style={styles.body}>Referencia: {booking.addresses.references_text}</Text>}
            <Text style={styles.payout}>Pago al profesional: {formatDop(booking.pro_payout_dop)}</Text>
            {step && <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => void advance(booking)} style={[styles.button, busyId === booking.id && styles.disabled]}><Text style={styles.buttonText}>{busyId === booking.id ? 'Actualizando...' : step.label}</Text></Pressable>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 35, gap: 14, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, marginTop: -8 },
  card: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 8 },
  empty: { marginTop: 20, padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 7 },
  cardTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '700' },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  payout: { color: KlippColors.blueDark, fontSize: 15, fontWeight: '700', marginTop: 3 },
  button: { minHeight: 46, marginTop: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: KlippColors.blue },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});