import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { TrackingMap } from '@/components/tracking-map';
import { KlippColors } from '@/lib/brand';
import { formatBusinessDate } from '@/lib/format';
import type { Booking, BookingStatus, ProCard } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type TrackingBooking = Pick<Booking,
  'id' | 'pro_id' | 'client_lat' | 'client_lng' | 'address_text' | 'landmark_notes' | 'status'
  | 'scheduled_start' | 'est_minutes' | 'service_type_id' | 'started_at'
> & { service_types: { name: string } | null };
type Coordinate = { latitude: number; longitude: number };
type BookingStatusEvent = { id: number; from_status: BookingStatus | null; to_status: BookingStatus; occurred_at: string };

function distanceInKm(from: Coordinate, to: Coordinate) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function statusLabel(status: BookingStatus) {
  const labels: Record<BookingStatus, string> = {
    requested: 'Solicitud creada',
    awaiting_payment: 'Pago pendiente',
    scheduled: 'Reserva confirmada',
    en_route: 'Profesional en camino',
    arrived: 'Profesional llegó al domicilio',
    in_progress: 'Servicio iniciado',
    completed: 'Servicio terminado',
    confirmed: 'Servicio confirmado por el cliente',
    cancelled: 'Reserva cancelada',
    disputed: 'Reserva en revisión',
    expired: 'Solicitud expirada',
  };
  return labels[status];
}

function statusMessage(status: BookingStatus) {
  if (status === 'arrived') return 'Tu profesional llegó al punto de servicio.';
  if (status === 'in_progress') return 'Tu servicio ya está en curso.';
  if (status === 'completed') return 'El servicio fue completado. ¡Gracias por elegir Klipp!';
  if (status === 'cancelled') return 'Esta reserva fue cancelada.';
  return 'El profesional todavía no ha iniciado el traslado. Te avisaremos cuando esté en camino.';
}

export function ClientTrackingScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<TrackingBooking | null>(null);
  const [professional, setProfessional] = useState<ProCard | null>(null);
  const [professionalCoordinate, setProfessionalCoordinate] = useState<Coordinate | null>(null);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [statusEvents, setStatusEvents] = useState<BookingStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrackingDetails = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId || !bookingId) {
      setError('No encontramos la reserva que quieres seguir.');
      setLoading(false);
      return;
    }

    setError(null);
    const { data, error: bookingError } = await supabase
      .from('bookings')
      .select('id, pro_id, client_lat, client_lng, address_text, landmark_notes, status, scheduled_start, est_minutes, service_type_id, started_at, service_types(name)')
      .eq('id', bookingId)
      .eq('client_id', userId)
      .single();
    if (bookingError) {
      setError(bookingError.message);
      setLoading(false);
      return;
    }

    const bookingRow = data as unknown as TrackingBooking;
    setBooking(bookingRow);
    const { data: eventRows, error: eventsError } = await supabase
      .from('booking_status_events')
      .select('id, from_status, to_status, occurred_at')
      .eq('booking_id', bookingRow.id)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true });
    if (eventsError) setError(eventsError.message);
    else setStatusEvents((eventRows ?? []) as BookingStatusEvent[]);
    if (bookingRow.pro_id) {
      const { data: proData, error: proError } = await supabase.from('pro_cards')
        .select('pro_id, full_name, avatar_url, bio, years_experience, base_sector_id, rating_avg, rating_count, jobs_completed, transport_type')
        .eq('pro_id', bookingRow.pro_id)
        .maybeSingle();
      if (proError) setError(proError.message);
      else setProfessional(proData as ProCard | null);
    }

    if (bookingRow.status === 'en_route') {
      const { data: location, error: locationError } = await supabase
        .from('pro_locations')
        .select('latitude, longitude, updated_at')
        .eq('booking_id', bookingRow.id)
        .maybeSingle();
      if (locationError) setError(locationError.message);
      else if (typeof location?.latitude === 'number' && typeof location.longitude === 'number') {
        setProfessionalCoordinate({ latitude: location.latitude, longitude: location.longitude });
        setLocationUpdatedAt(location.updated_at ?? null);
      }
    } else {
      setProfessionalCoordinate(null);
      setLocationUpdatedAt(null);
    }
    setLoading(false);
  }, [bookingId, session]);

  useEffect(() => {
    void Promise.resolve().then(loadTrackingDetails);
  }, [loadTrackingDetails]);

  useEffect(() => {
    if (!booking?.id) return;
    const channel = supabase
      .channel(`tracking-booking-status:${booking.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${booking.id}`,
      }, () => { void loadTrackingDetails(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_status_events',
        filter: `booking_id=eq.${booking.id}`,
      }, () => { void loadTrackingDetails(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [booking?.id, loadTrackingDetails]);

  useEffect(() => {
    if (!booking?.id || booking.status !== 'en_route') return;
    const channel = supabase
      .channel(`tracking-location:${booking.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pro_locations',
        filter: `booking_id=eq.${booking.id}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setProfessionalCoordinate(null);
          setLocationUpdatedAt(null);
          return;
        }
        const row = payload.new as { latitude?: number; longitude?: number; updated_at?: string };
        if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
          setProfessionalCoordinate({ latitude: row.latitude, longitude: row.longitude });
          setLocationUpdatedAt(row.updated_at ?? new Date().toISOString());
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [booking?.id, booking?.status]);

  useEffect(() => {
    const interval = setInterval(() => setClockNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  const destination = booking && typeof booking.client_lat === 'number' && typeof booking.client_lng === 'number'
    ? { latitude: booking.client_lat, longitude: booking.client_lng }
    : null;
  const etaMinutes = professionalCoordinate && destination
    ? Math.max(1, Math.round(distanceInKm(professionalCoordinate, destination) / 25 * 60))
    : null;
  const locationAgeSeconds = locationUpdatedAt
    ? Math.max(0, Math.floor((clockNow - new Date(locationUpdatedAt).getTime()) / 1000))
    : null;
  const locationIsStale = locationAgeSeconds !== null && locationAgeSeconds > 30;
  const locationFreshnessLabel = locationAgeSeconds === null
    ? 'Esperando la primera ubicación del profesional.'
    : locationIsStale
      ? `Última ubicación recibida hace ${Math.floor(locationAgeSeconds / 60)} min. Puede estar desactualizada.`
      : `Ubicación actualizada hace ${locationAgeSeconds} s.`;

  if (loading) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.body}>Cargando seguimiento...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹  Volver a mis reservas</Text>
        </Pressable>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!booking ? (
          <View style={styles.statusCard}><Text style={styles.title}>No disponible</Text><Text style={styles.body}>No pudimos cargar esta reserva.</Text></View>
        ) : (
          <>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>SEGUIMIENTO DE TU SERVICIO</Text>
              <Text style={styles.title}>{booking.status === 'en_route' ? 'Tu profesional va en camino' : 'Estado de tu servicio'}</Text>
              <Text style={styles.body}>{booking.service_types?.name ?? 'Servicio Klipp'} · {formatBusinessDate(booking.scheduled_start)}</Text>
            </View>

            {booking.status === 'en_route' ? (
              <>
                <View style={styles.etaCard}>
                  <Text style={styles.etaLabel}>ESTIMACIÓN INICIAL DE LLEGADA</Text>
                  <Text style={styles.etaValue}>{etaMinutes === null ? 'Calculando…' : `~${etaMinutes} min`}</Text>
                  <Text style={styles.etaHint}>{locationFreshnessLabel} El cálculo actual es aproximado y todavía no incorpora ruta vial ni tráfico.</Text>
                </View>
                {professionalCoordinate && destination ? (
                  <TrackingMap clientCoordinate={destination} proCoordinate={professionalCoordinate} />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator color={KlippColors.blue} />
                    <Text style={styles.body}>Preparando el mapa de seguimiento…</Text>
                  </View>
                )}
                <View style={styles.professionalCard}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{professional?.full_name?.[0] ?? 'K'}</Text></View>
                  <View style={styles.professionalDetails}>
                    <Text style={styles.professionalName}>{professional?.full_name ?? 'Profesional Klipp'}</Text>
                    <Text style={styles.body}>★ {Number(professional?.rating_avg ?? 0).toFixed(1)} · {professional?.transport_type || 'Medio de transporte no indicado'}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => router.push('/(client)/bookings')} style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}>
                    <Text style={styles.callButtonText}>Contactar por el chat de Klipp</Text>
                  </Pressable>
                </View>
                <View style={styles.destinationCard}>
                  <Text style={styles.destinationLabel}>DESTINO</Text>
                  <Text style={styles.destinationText}>{booking.address_text || 'Dirección guardada en la reserva'}</Text>
                  {!!booking.landmark_notes && <Text style={styles.body}>{booking.landmark_notes}</Text>}
                </View>
              </>
            ) : (
              <View style={styles.statusCard}>
                <View style={styles.statusIcon}><Text style={styles.statusIconText}>{booking.status === 'in_progress' ? '✓' : 'i'}</Text></View>
                <Text style={styles.statusMessage}>{statusMessage(booking.status)}</Text>
                <Text style={styles.body}>Servicio: {booking.service_types?.name ?? 'Servicio Klipp'}</Text>
                <Text style={styles.body}>Dirección: {booking.address_text || 'Dirección guardada en la reserva'}</Text>
              </View>
            )}
            <View style={styles.stepsCard}>
              <Text style={styles.stepsTitle}>Historial de tu orden</Text>
              {statusEvents.length === 0 ? (
                <Text style={styles.body}>Todavía no hay eventos registrados para esta reserva.</Text>
              ) : statusEvents.map((event) => (
                <View key={event.id} style={styles.stepRow}>
                  <Text style={styles.stepDone}>✓</Text>
                  <View style={styles.eventDetails}>
                    <Text style={styles.stepText}>{statusLabel(event.to_status)}</Text>
                    <Text style={styles.eventTime}>{new Date(event.occurred_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 36, gap: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F8FAFC' },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: KlippColors.blueDark, fontSize: 14, fontWeight: '700' },
  heading: { gap: 6 },
  eyebrow: { color: KlippColors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: KlippColors.navy, fontSize: 26, lineHeight: 32, fontWeight: '800' },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  etaCard: { padding: 18, borderRadius: 18, backgroundColor: KlippColors.navy, gap: 3 },
  etaLabel: { color: '#B9C9E6', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  etaValue: { color: KlippColors.white, fontSize: 32, fontWeight: '800' },
  etaHint: { color: '#D5DFF0', fontSize: 12, lineHeight: 18 },
  mapPlaceholder: { height: 280, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#E8EEF7', gap: 10 },
  professionalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#EEF4FF' },
  avatarText: { color: KlippColors.blueDark, fontSize: 20, fontWeight: '800' },
  professionalDetails: { flex: 1, gap: 3 },
  professionalName: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  callButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: KlippColors.blue },
  callButtonText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  destinationCard: { padding: 15, borderRadius: 16, backgroundColor: KlippColors.white, gap: 5 },
  destinationLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  destinationText: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  statusCard: { alignItems: 'center', padding: 22, borderRadius: 18, backgroundColor: KlippColors.white, gap: 10 },
  statusIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#EEF4FF' },
  statusIconText: { color: KlippColors.blue, fontSize: 20, fontWeight: '800' },
  statusMessage: { color: KlippColors.navy, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stepsCard: { padding: 17, borderRadius: 18, backgroundColor: KlippColors.white, gap: 13 },
  stepsTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDone: { width: 24, height: 24, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 12, backgroundColor: '#DCFCE7', color: '#047857', fontSize: 13, fontWeight: '800' },
  stepPending: { width: 24, height: 24, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 12, backgroundColor: '#F1F5F9', color: KlippColors.slate, fontSize: 12, fontWeight: '700' },
  stepText: { color: KlippColors.slate, fontSize: 13, fontWeight: '600' },
  eventDetails: { flex: 1, gap: 2 },
  eventTime: { color: KlippColors.muted, fontSize: 11 },
  error: { padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', color: KlippColors.danger, fontSize: 13 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
