import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { KlippColors } from '@/lib/brand';
import { AdminOperationsMap } from '@/components/admin-operations-map';
import { supabase } from '../../lib/supabase';

type OpsBooking = {
  booking_id: string;
  status: string;
  assignment_mode: string;
  scheduled_start: string;
  created_at: string;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  service_name: string | null;
  client_name: string | null;
  professional_name: string | null;
  address_text: string | null;
  price_dop: number;
  est_minutes: number;
  pro_latitude: number | null;
  pro_longitude: number | null;
  pro_location_updated_at: string | null;
  current_eta_minutes: number | null;
  eta_updated_at: string | null;
  status_event_count: number;
};
type TimelineEvent = { event_id: number; from_status: string | null; to_status: string; occurred_at: string; actor_name: string | null };
type StatusFilter = 'active' | 'attention' | 'all';
type RouteEta = { etaMinutes: number; distanceMeters: number; trafficAware: boolean };

const statusNames: Record<string, string> = {
  requested: 'Buscando profesional',
  awaiting_payment: 'Pendiente de pago',
  scheduled: 'Programada',
  en_route: 'En camino',
  arrived: 'Ha llegado',
  in_progress: 'En servicio',
  disputed: 'En disputa',
  completed: 'Completada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
}

function minutesSince(value: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function attentionReason(booking: OpsBooking): string | null {
  if (booking.status === 'disputed') return 'Reserva en disputa';
  if (booking.status === 'requested' && minutesSince(booking.created_at) >= 10) return 'Lleva más de 10 min buscando profesional';
  if (booking.status === 'awaiting_payment' && minutesSince(booking.accepted_at ?? booking.created_at) >= 15) return 'Aceptada hace más de 15 min; revisar pago';
  if (booking.status === 'scheduled' && Date.now() > new Date(booking.scheduled_start).getTime() + 15 * 60000) return 'La hora programada pasó hace más de 15 min';
  if (booking.status === 'en_route' && minutesSince(booking.en_route_at) >= 45) return 'Profesional en camino durante más de 45 min';
  if (booking.status === 'en_route' && minutesSince(booking.pro_location_updated_at) >= 2) return 'GPS sin actualizar en más de 2 min';
  if (booking.status === 'in_progress' && booking.started_at && minutesSince(booking.started_at) > booking.est_minutes + 30) return 'Servicio supera la duración estimada en más de 30 min';
  return null;
}

export function AdminOperationsPanel() {
  const [bookings, setBookings] = useState<OpsBooking[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [routeEta, setRouteEta] = useState<RouteEta | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setError(null);
    const { data, error: requestError } = await supabase.rpc('admin_list_operational_bookings', { p_limit: 150 });
    if (requestError) {
      setError(requestError.message);
      return;
    }
    setBookings((data ?? []) as OpsBooking[]);
    setUpdatedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadBookings().finally(() => { if (active) setLoading(false); });
    const interval = setInterval(() => { void loadBookings(); }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [loadBookings]);

  const selectedBooking = bookings.find((item) => item.booking_id === selectedId) ?? null;

  const openTimeline = useCallback(async (bookingId: string) => {
    setSelectedId(bookingId);
    setRouteEta(null);
    setEtaError(null);
    setTimelineLoading(true);
    setTimeline([]);
    const { data, error: requestError } = await supabase.rpc('admin_get_booking_timeline', { p_booking_id: bookingId });
    if (requestError) setError(requestError.message);
    else setTimeline((data ?? []) as TimelineEvent[]);
    setTimelineLoading(false);
  }, []);

  const calculateEta = useCallback(async (bookingId: string) => {
    setEtaLoading(true);
    setEtaError(null);
    setRouteEta(null);
    const { data, error: invokeError } = await supabase.functions.invoke('booking-route-eta', {
      body: { bookingId, notifyDelay: false },
    });
    if (invokeError) {
      setEtaError(invokeError.message);
    } else if (data && typeof data.etaMinutes === 'number') {
      setRouteEta({ etaMinutes: data.etaMinutes, distanceMeters: data.distanceMeters, trafficAware: data.trafficAware === true });
    } else {
      setEtaError(data?.error || 'ETA no disponible. Comprueba que el GPS sea reciente y que el servicio esté en camino.');
    }
    setEtaLoading(false);
  }, []);

  const attentionCount = useMemo(() => bookings.filter((item) => attentionReason(item)).length, [bookings]);
  const visibleBookings = useMemo(() => bookings.filter((item) => {
    if (filter === 'attention') return Boolean(attentionReason(item));
    if (filter === 'active') return item.status !== 'disputed';
    return true;
  }), [bookings, filter]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.body}>Cargando órdenes activas...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.grow}>
          <Text style={styles.title}>Centro de operaciones</Text>
          <Text style={styles.body}>Supervisión de reservas, profesionales y tiempos de servicio.</Text>
          <Text style={styles.caption}>Actualización automática cada 30 segundos{updatedAt ? ` · Última consulta ${new Date(updatedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void loadBookings()} style={styles.refresh}><Text style={styles.refreshText}>Actualizar</Text></Pressable>
      </View>

      <View style={styles.metrics}>
        <Metric label="Órdenes abiertas" value={bookings.length} />
        <Metric label="Requieren revisión" value={attentionCount} />
        <Metric label="En camino" value={bookings.filter((item) => item.status === 'en_route').length} />
        <Metric label="En servicio" value={bookings.filter((item) => item.status === 'in_progress').length} />
      </View>

      <AdminOperationsMap
        points={bookings
          .filter((booking) => booking.status === 'en_route'
            && booking.pro_latitude !== null && booking.pro_longitude !== null)
          .map((booking) => ({
            bookingId: booking.booking_id,
            professionalName: booking.professional_name,
            serviceName: booking.service_name,
            status: booking.status,
            latitude: booking.pro_latitude as number,
            longitude: booking.pro_longitude as number,
            updatedAt: booking.pro_location_updated_at,
            selected: selectedId === booking.booking_id,
            onSelect: () => void openTimeline(booking.booking_id),
          }))}
      />

      <View style={styles.filters}>
        {([
          ['active', 'Activas'],
          ['attention', 'Requieren atención'],
          ['all', 'Todas'],
        ] as [StatusFilter, string][]).map(([value, label]) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterSelected]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

      {selectedBooking && (
        <View style={styles.detailCard}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Detalle de orden · {selectedBooking.booking_id.slice(0, 8)}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setSelectedId(null); setTimeline([]); }}><Text style={styles.link}>Cerrar</Text></Pressable>
          </View>
          <Text style={styles.body}>Cliente: {selectedBooking.client_name || 'Sin nombre'} · Profesional: {selectedBooking.professional_name || 'Sin asignar'}</Text>
          <Text style={styles.body}>Servicio: {selectedBooking.service_name || 'Servicio Klipp'} · DOP {Number(selectedBooking.price_dop).toLocaleString('es-DO')}</Text>
          <Text style={styles.body}>Dirección: {selectedBooking.address_text || 'No disponible'}</Text>
          <Text style={styles.body}>Programada: {dateLabel(selectedBooking.scheduled_start)} · Estado: {statusNames[selectedBooking.status] ?? selectedBooking.status}</Text>
          <Text style={styles.body}>Creada: {dateLabel(selectedBooking.created_at)} · Eventos registrados: {selectedBooking.status_event_count}</Text>
          {selectedBooking.current_eta_minutes !== null && (
            <View style={styles.locationBox}>
              <Text style={styles.locationTitle}>ETA automático de Klipp</Text>
              <Text style={styles.etaValue}>~{selectedBooking.current_eta_minutes} min</Text>
              <Text style={styles.caption}>Último cálculo: {dateLabel(selectedBooking.eta_updated_at)}{minutesSince(selectedBooking.eta_updated_at) > 5 ? ' · Dato posiblemente desactualizado' : ' · Actualizado recientemente'}</Text>
            </View>
          )}
          {selectedBooking.status === 'en_route' && (
            <View style={styles.locationBox}>
              <Text style={styles.locationTitle}>ETA por carretera</Text>
              {routeEta ? <Text style={styles.etaValue}>~{routeEta.etaMinutes} min · {(routeEta.distanceMeters / 1000).toFixed(1)} km</Text> : <Text style={styles.body}>Calcula el tiempo estimado con tráfico cuando la ubicación GPS tenga menos de 2 minutos.</Text>}
              {etaError && <Text style={styles.warning}>{etaError}</Text>}
              <Pressable accessibilityRole="button" disabled={etaLoading} onPress={() => void calculateEta(selectedBooking.booking_id)} style={styles.etaButton}>
                <Text style={styles.refreshText}>{etaLoading ? 'Calculando…' : 'Calcular ETA actualizado'}</Text>
              </Pressable>
            </View>
          )}
          {selectedBooking.pro_latitude !== null && selectedBooking.pro_longitude !== null ? (
            <View style={styles.locationBox}>
              <Text style={styles.locationTitle}>Última ubicación GPS del profesional</Text>
              <Text style={styles.body}>{selectedBooking.pro_latitude.toFixed(5)}, {selectedBooking.pro_longitude.toFixed(5)}</Text>
              <Text style={styles.caption}>Actualizada: {dateLabel(selectedBooking.pro_location_updated_at)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selectedBooking.pro_latitude},${selectedBooking.pro_longitude}`)}><Text style={styles.link}>Abrir ubicación en mapa</Text></Pressable>
            </View>
          ) : <Text style={styles.caption}>Todavía no hay ubicación GPS registrada para esta reserva.</Text>}
          <Text style={styles.sectionTitle}>Historial de estados</Text>
          {timelineLoading ? <ActivityIndicator color={KlippColors.blue} /> : timeline.length === 0 ? <Text style={styles.body}>No hay eventos disponibles.</Text> : timeline.map((event) => (
            <View key={event.event_id} style={styles.event}>
              <Text style={styles.eventTitle}>{event.from_status ? (statusNames[event.from_status] ?? event.from_status) + ' → ' : ''}{statusNames[event.to_status] ?? event.to_status}</Text>
              <Text style={styles.caption}>{dateLabel(event.occurred_at)} · {event.actor_name || 'Sistema'}</Text>
            </View>
          ))}
        </View>
      )}

      {visibleBookings.length === 0 ? <Text style={styles.empty}>No hay órdenes en este filtro.</Text> : visibleBookings.map((booking) => {
        const reason = attentionReason(booking);
        const locationAge = minutesSince(booking.pro_location_updated_at);
        return (
          <Pressable key={booking.booking_id} accessibilityRole="button" onPress={() => void openTimeline(booking.booking_id)} style={styles.bookingCard}>
            <View style={styles.headerRow}>
              <Text style={styles.bookingTitle}>#{booking.booking_id.slice(0, 8)} · {booking.service_name || 'Servicio Klipp'}</Text>
              <Text style={styles.status}>{statusNames[booking.status] ?? booking.status}</Text>
            </View>
            <Text style={styles.body}>{booking.client_name || 'Cliente'} · {booking.professional_name || 'Buscando profesional'}</Text>
            <Text style={styles.body}>{dateLabel(booking.scheduled_start)} · {booking.address_text || 'Dirección no disponible'}</Text>
            <View style={styles.headerRow}>
              <Text style={styles.caption}>GPS: {booking.pro_location_updated_at ? `hace ${locationAge} min` : 'sin señal'} · ETA: {booking.current_eta_minutes !== null ? `~${booking.current_eta_minutes} min` : 'pendiente'}</Text>
              {reason ? <Text style={styles.warning}>{reason}</Text> : <Text style={styles.ok}>Sin alertas detectadas</Text>}
            </View>
            <Text style={styles.link}>Ver detalle e historial →</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  centered: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  grow: { flex: 1, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: KlippColors.navy, fontSize: 19, fontWeight: '800' },
  sectionTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '800', marginTop: 5 },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  caption: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  refresh: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, backgroundColor: KlippColors.navy },
  refreshText: { color: KlippColors.white, fontSize: 12, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { minWidth: '47%', flexGrow: 1, padding: 12, borderRadius: 11, backgroundColor: '#F1F5F9', gap: 3 },
  metricValue: { color: KlippColors.navy, fontSize: 23, fontWeight: '800' },
  metricLabel: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: KlippColors.border },
  filterSelected: { backgroundColor: KlippColors.navy, borderColor: KlippColors.navy },
  filterText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  filterTextSelected: { color: KlippColors.white },
  bookingCard: { padding: 14, gap: 7, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 13, backgroundColor: KlippColors.white },
  bookingTitle: { flex: 1, color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  status: { color: KlippColors.blueDark, fontSize: 11, fontWeight: '800' },
  detailCard: { padding: 15, gap: 10, borderWidth: 1, borderColor: KlippColors.blue, borderRadius: 14, backgroundColor: '#F8FBFF' },
  locationBox: { padding: 12, gap: 5, borderRadius: 10, backgroundColor: '#EEF4FF' },
  locationTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '800' },
  etaValue: { color: KlippColors.navy, fontSize: 22, fontWeight: '800' },
  etaButton: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: KlippColors.navy },
  event: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 3 },
  eventTitle: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  link: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '800' },
  warning: { flex: 1, color: '#946200', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  ok: { color: '#067647', fontSize: 11, fontWeight: '700' },
  empty: { color: KlippColors.muted, fontSize: 14, paddingVertical: 8 },
  error: { color: KlippColors.danger, fontSize: 13 },
});
