import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { TrackingMap } from '@/components/tracking-map';
import { KlippColors, KlippLayout } from '@/theme/tokens';
import { formatBusinessDate } from '@/lib/format';
import type { Booking, BookingStatus, ProCard } from '@/lib/types';
import { supabase } from '../../lib/supabase';

type TrackingBooking = Pick<Booking,
  'id' | 'pro_id' | 'client_lat' | 'client_lng' | 'address_text' | 'landmark_notes' | 'status'
  | 'scheduled_start' | 'est_minutes' | 'service_type_id' | 'started_at' | 'assignment_mode'
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

function statusMessage(status: BookingStatus, assignmentMode: 'manual' | 'auto') {
  if (status === 'requested') {
    return assignmentMode === 'auto'
      ? 'Klipp está buscando un profesional disponible para tu servicio. Te avisaremos en cuanto alguien acepte.'
      : 'Tu solicitud está pendiente de respuesta del profesional. Te avisaremos cuando acepte o rechace.';
  }
  if (status === 'awaiting_payment') {
    return 'El profesional ha aceptado, pero el pago integrado todavía no está habilitado. No realices transferencias ni pagos fuera de Klipp; la reserva aún no está confirmada.';
  }
  if (status === 'scheduled') {
    return 'Tu reserva está confirmada. El profesional se está preparando y te avisaremos cuando comience el desplazamiento.';
  }
  if (status === 'arrived') return 'Tu profesional llegó al punto de servicio. Puedes comunicarte con él desde el chat de Klipp.';
  if (status === 'in_progress') return 'Tu servicio ya está en curso. Cuando termine, podrás revisar el resultado, confirmar la finalización y dejar una reseña.';
  if (status === 'completed') return 'El profesional ha marcado el servicio como terminado. Revisa el resultado y confirma la finalización desde Mis reservas.';
  if (status === 'confirmed') return 'Has confirmado que el servicio terminó correctamente. Gracias por elegir Klipp.';
  if (status === 'cancelled') return 'Esta reserva fue cancelada. Puedes revisar los detalles en Mis reservas.';
  if (status === 'disputed') return 'Esta reserva está en revisión por el equipo de Klipp. Conservaremos aquí las actualizaciones del caso.';
  return 'La solicitud expiró y ya no está activa. Puedes revisar Mis reservas para solicitar el servicio nuevamente.';
}

export function ClientTrackingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const trackingRequestId = useRef(0);
  const [booking, setBooking] = useState<TrackingBooking | null>(null);
  const [professional, setProfessional] = useState<ProCard | null>(null);
  const [professionalCoordinate, setProfessionalCoordinate] = useState<Coordinate | null>(null);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [statusEvents, setStatusEvents] = useState<BookingStatusEvent[]>([]);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [routeEtaUpdatedAt, setRouteEtaUpdatedAt] = useState<string | null>(null);
  const [professionalAcceptanceRate, setProfessionalAcceptanceRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrackingDetails = useCallback(async () => {
    const requestId = ++trackingRequestId.current;
    const isLatestRequest = () => trackingRequestId.current === requestId;
    if (!userId || !bookingId) {
      if (isLatestRequest()) {
        setError('No encontramos la reserva que quieres seguir.');
        setLoading(false);
      }
      return;
    }

    setError(null);
    const { data, error: bookingError } = await supabase
      .from('bookings')
      .select('id, pro_id, client_lat, client_lng, address_text, landmark_notes, status, scheduled_start, est_minutes, service_type_id, started_at, assignment_mode, service_types(name)')
      .eq('id', bookingId)
      .eq('client_id', userId)
      .single();
    if (!isLatestRequest()) return;
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
    if (!isLatestRequest()) return;
    if (eventsError) setError(eventsError.message);
    else setStatusEvents((eventRows ?? []) as BookingStatusEvent[]);
    if (bookingRow.pro_id) {
      const { data: acceptanceData, error: acceptanceError } = await supabase.rpc('get_client_visible_pro_acceptance_rate', { p_booking_id: bookingRow.id });
      if (!isLatestRequest()) return;
      if (acceptanceError) setError(acceptanceError.message);
      else {
        const metric = Array.isArray(acceptanceData) ? acceptanceData[0] : acceptanceData;
        setProfessionalAcceptanceRate(metric && typeof metric.acceptance_rate === 'number' ? metric.acceptance_rate : metric?.acceptance_rate == null ? null : Number(metric.acceptance_rate));
      }
      const { data: proData, error: proError } = await supabase.rpc('get_client_booking_pro_cards', {
        p_booking_ids: [bookingRow.id],
      });
      if (!isLatestRequest()) return;
      if (proError) setError(proError.message);
      else setProfessional(((proData ?? []) as ProCard[])[0] ?? null);
    }

    if (bookingRow.status === 'en_route') {
      const { data: location, error: locationError } = await supabase
        .from('pro_locations')
        .select('latitude, longitude, updated_at')
        .eq('booking_id', bookingRow.id)
        .maybeSingle();
      if (!isLatestRequest()) return;
      if (locationError) setError(locationError.message);
      else if (typeof location?.latitude === 'number' && typeof location.longitude === 'number') {
        setProfessionalCoordinate({ latitude: location.latitude, longitude: location.longitude });
        setLocationUpdatedAt(location.updated_at ?? null);
      }
    } else {
      setProfessionalCoordinate(null);
      setLocationUpdatedAt(null);
    }
    if (!bookingRow.pro_id) {
      setProfessional(null);
      setProfessionalAcceptanceRate(null);
    }
    setLoading(false);
  }, [bookingId, userId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadTrackingDetails();
    });
    return () => {
      active = false;
      trackingRequestId.current += 1;
    };
  }, [loadTrackingDetails]);

  useEffect(() => {
    if (!booking?.id) return;
    let active = true;
    const refresh = () => { if (active) void loadTrackingDetails(); };
    const channel = supabase
      .channel(`tracking-booking-status:${booking.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${booking.id}`,
      }, refresh)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_status_events',
        filter: `booking_id=eq.${booking.id}`,
      }, refresh)
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
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

  useEffect(() => {
    if (!booking?.id || booking.status !== 'en_route') {
      let active = true;
      void Promise.resolve().then(() => {
        if (!active) return;
        setRouteEtaMinutes(null);
        setRouteDistanceMeters(null);
        setRoutePolyline(null);
        setRouteEtaUpdatedAt(null);
      });
      return () => { active = false; };
    }

    let active = true;
    const refreshRouteEta = async () => {
      const { data, error: routeError } = await supabase.functions.invoke('booking-route-eta', {
        body: { bookingId: booking.id },
      });
      if (!active) return;
      if (routeError || !data || typeof data.etaMinutes !== 'number') {
        setRouteEtaMinutes(null);
        setRouteDistanceMeters(null);
        setRoutePolyline(null);
        return;
      }
      setRouteEtaMinutes(data.etaMinutes);
      setRouteDistanceMeters(typeof data.distanceMeters === 'number' ? data.distanceMeters : null);
      setRoutePolyline(typeof data.encodedPolyline === 'string' ? data.encodedPolyline : null);
      setRouteEtaUpdatedAt(typeof data.calculatedAt === 'string' ? data.calculatedAt : null);
    };

    void refreshRouteEta();
    const interval = setInterval(() => { void refreshRouteEta(); }, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [booking?.id, booking?.status, professionalCoordinate?.latitude, professionalCoordinate?.longitude]);

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
    return <SafeAreaView style={styles.centered}><ActivityIndicator color={KlippColors.cobalt} /><Text style={styles.body}>Cargando seguimiento...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹  Volver a mis reservas</Text>
        </Pressable>
        <BrandScreenHeader
          inset={false}
          role="client"
          eyebrow="SEGUIMIENTO DE TU SERVICIO"
          title={!booking ? 'Seguimiento' : booking.status === 'en_route' ? 'Tu profesional va en camino' : 'Estado de tu servicio'}
          subtitle={booking ? `${booking.service_types?.name ?? 'Servicio Klipp'} · ${formatBusinessDate(booking.scheduled_start)}` : 'Consulta el estado de tu reserva.'}
        />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!booking ? (
          <View style={styles.statusCard}><Text style={styles.title}>No disponible</Text><Text style={styles.body}>No pudimos cargar esta reserva.</Text></View>
        ) : (
          <>

            {booking.status === 'en_route' ? (
              <>
                <View style={styles.etaCard}>
                  <Text style={styles.etaLabel}>ESTIMACIÓN INICIAL DE LLEGADA</Text>
                  <Text style={styles.etaValue}>{routeEtaMinutes !== null ? `~${routeEtaMinutes} min` : etaMinutes === null ? 'Calculando…' : `~${etaMinutes} min`}</Text>
                  <Text style={styles.etaHint}>{locationFreshnessLabel} {routeEtaMinutes !== null ? `Ruta por carretera con tráfico estimado · ${routeDistanceMeters !== null ? (routeDistanceMeters / 1000).toFixed(1) + ' km' : ''} · Actualizado ${routeEtaUpdatedAt ? new Date(routeEtaUpdatedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : ''}.` : 'Mostrando una estimación provisional en línea recta; la ruta con tráfico todavía no está disponible.'}</Text>
                </View>
                {professionalCoordinate && destination ? (
                  <TrackingMap clientCoordinate={destination} proCoordinate={professionalCoordinate} routePolyline={routePolyline} />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator color={KlippColors.cobalt} />
                    <Text style={styles.body}>Preparando el mapa de seguimiento…</Text>
                  </View>
                )}
                <View style={[styles.professionalCard, compact && styles.professionalCardCompact]}>
                  <View style={styles.professionalIdentity}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{professional?.full_name?.[0] ?? 'K'}</Text></View>
                    <View style={styles.professionalDetails}>
                      <Text style={styles.professionalName}>{professional?.full_name ?? 'Profesional Klipp'}</Text>
                      <Text style={styles.body}>★ {Number(professional?.rating_avg ?? 0).toFixed(1)} · {professional?.transport_type || 'Medio de transporte no indicado'}</Text>
                      <Text style={styles.acceptanceRate}>Tasa de aceptación: {professionalAcceptanceRate === null ? 'Aún sin datos' : `${Math.round(professionalAcceptanceRate)}%`}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(client)/bookings', params: { bookingId: booking.id } })} style={({ pressed }) => [styles.callButton, compact && styles.callButtonCompact, pressed && styles.pressed]}>
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
                <Text style={styles.statusMessage}>{statusMessage(booking.status, booking.assignment_mode)}</Text>
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
  safeArea: { flex: 1, backgroundColor: KlippColors.ivory },
  page: { width: '100%', maxWidth: KlippLayout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: KlippLayout.pageGutter, paddingTop: 12, paddingBottom: 52, gap: 17 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: KlippColors.ivory },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: KlippColors.cobaltDark, fontSize: 14, fontWeight: '700' },
  title: { color: KlippColors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  etaCard: { padding: 21, borderRadius: 22, backgroundColor: KlippColors.ink, gap: 6, shadowOpacity: 0, elevation: 0 },
  etaLabel: { color: KlippColors.surfaceBlue, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  etaValue: { color: KlippColors.white, fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1 },
  etaHint: { color: KlippColors.surfaceBlue, fontSize: 12, lineHeight: 18 },
  mapPlaceholder: { height: 360, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: KlippColors.surfaceBlue, gap: 10 },
  professionalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.white },
  professionalCardCompact: { flexDirection: 'column', alignItems: 'stretch' },
  professionalIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: KlippColors.surfaceBlue },
  avatarText: { color: KlippColors.cobaltDark, fontSize: 20, fontWeight: '800' },
  professionalDetails: { flex: 1, gap: 3 },
  professionalName: { color: KlippColors.ink, fontSize: 15, fontWeight: '800' },
  acceptanceRate: { color: KlippColors.cobaltDark, fontSize: 12, fontWeight: '700' },
  callButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: KlippColors.cobalt },
  callButtonCompact: { width: '100%' },
  callButtonText: { color: KlippColors.white, fontSize: 13, fontWeight: '700' },
  destinationCard: { padding: 17, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 19, backgroundColor: KlippColors.white, gap: 6 },
  destinationLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  destinationText: { color: KlippColors.ink, fontSize: 14, fontWeight: '700' },
  statusCard: { alignItems: 'flex-start', paddingVertical: 24, paddingHorizontal: 0, backgroundColor: 'transparent', gap: 10 },
  statusIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: KlippColors.surfaceBlue },
  statusIconText: { color: KlippColors.cobalt, fontSize: 20, fontWeight: '800' },
  statusMessage: { color: KlippColors.ink, fontSize: 18, lineHeight: 25, fontWeight: '800', textAlign: 'left' },
  stepsCard: { padding: 19, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 21, backgroundColor: KlippColors.white, gap: 15 },
  stepsTitle: { color: KlippColors.ink, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDone: { width: 24, height: 24, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 12, backgroundColor: KlippColors.surfaceMint, color: KlippColors.success, fontSize: 13, fontWeight: '800' },
  stepText: { color: KlippColors.slate, fontSize: 13, fontWeight: '600' },
  eventDetails: { flex: 1, gap: 2 },
  eventTime: { color: KlippColors.muted, fontSize: 11 },
  error: { padding: 12, borderRadius: 12, backgroundColor: KlippColors.surfaceCoral, color: KlippColors.danger, fontSize: 13 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
