import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';
import type { BookingRequest } from '@/lib/types';

type RequestBooking = {
  id: string;
  scheduled_start: string;
  est_minutes: number;
  pro_payout_dop: number;
  address_text: string | null;
  landmark_notes: string | null;
  service_types: { name: string } | null;
  pricing_tiers: { label: string } | null;
};

type IncomingRequest = BookingRequest & { bookings: RequestBooking | null };

export function ProRequestsScreen() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from('booking_requests')
      .select('id, booking_id, pro_id, status, created_at, expires_at, responded_at, bookings(id, scheduled_start, est_minutes, pro_payout_dop, address_text, landmark_notes, service_types(name), pricing_tiers(label))')
      .eq('pro_id', session.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setRequests((data ?? []) as unknown as IncomingRequest[]);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  useEffect(() => {
    const proId = session?.user.id;
    if (!proId) return;
    const channel = supabase
      .channel(`pro-booking-requests:${proId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'booking_requests',
        filter: `pro_id=eq.${proId}`,
      }, () => {
        void loadRequests();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadRequests, session?.user.id]);

  async function refresh() {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }

  async function respond(requestId: string, accept: boolean) {
    setBusyId(requestId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('respond_to_request', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (rpcError) setError(rpcError.message);
    else await loadRequests();
    setBusyId(null);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando solicitudes...</Text></View>;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader eyebrow="ESPACIO PROFESIONAL" title="Solicitudes" subtitle="Nuevas oportunidades para tu agenda." />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && requests.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No tienes solicitudes pendientes</Text>
          <Text style={styles.body}>Cuando llegue una solicitud, aparecerá aquí.</Text>
        </View>
      )}
      {requests.map((request) => {
        const booking = request.bookings;
        const unavailable = !booking;
        return (
          <View key={request.id} style={styles.card}>
            {unavailable ? (
              <>
                <Text style={styles.cardTitle}>Solicitud recibida</Text>
                <Text style={styles.warning}>
                  La base de datos no permite leer los detalles de esta reserva antes de aceptarla. No la aceptes sin poder revisar servicio, ubicación y horario.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio de limpieza'}</Text>
                <Text style={styles.body}>{booking.pricing_tiers?.label ?? 'Tamaño no disponible'}</Text>
                <Text style={styles.body}>Ubicación: {booking.address_text ?? 'No disponible'}</Text>
                {!!booking.landmark_notes && <Text style={styles.body}>Referencia: {booking.landmark_notes}</Text>}
                <Text style={styles.body}>Fecha: {formatBusinessDate(booking.scheduled_start)}</Text>
                <Text style={styles.payout}>Recibirías {formatDop(booking.pro_payout_dop)}</Text>
              </>
            )}
            <Text style={styles.expiration}>Expira: {formatBusinessDate(request.expires_at)}</Text>
            <View style={styles.actions}>
              <ResponseButton disabled={unavailable || busyId === request.id} label={busyId === request.id ? 'Enviando...' : 'Aceptar'} onPress={() => void respond(request.id, true)} />
              <ResponseButton secondary disabled={busyId === request.id} label="Rechazar" onPress={() => void respond(request.id, false)} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ResponseButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 35, gap: 14, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, marginTop: -8 },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  empty: { marginTop: 20, padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 7 },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  card: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 8 },
  cardTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '700' },
  payout: { color: KlippColors.blueDark, fontSize: 15, fontWeight: '700' },
  expiration: { color: KlippColors.muted, fontSize: 12, marginTop: 4 },
  warning: { color: '#8A5B00', fontSize: 13, lineHeight: 19, padding: 11, borderRadius: 6, backgroundColor: KlippColors.goldLight },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: KlippColors.blue },
  secondaryButton: { backgroundColor: KlippColors.white, borderWidth: 1, borderColor: '#CBD5E1' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryText: { color: KlippColors.muted },
  disabled: { opacity: 0.45 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});