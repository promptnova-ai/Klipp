import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
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

function distanceInKm(from: Coordinate, to: Coordinate) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
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
  const [professionalPhone, setProfessionalPhone] = useState<string | null>(null);
  const [professionalCoordinate, setProfessionalCoordinate] = useState<Coordinate | null>(null);
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
    if (bookingRow.pro_id) {
      const [proResult, phoneResult] = await Promise.all([
        supabase.from('pro_cards')
          .select('pro_id, full_name, avatar_url, bio, years_experience, base_sector_id, rating_avg, rating_count, jobs_completed, transport_type')
          .eq('pro_id', bookingRow.pro_id)
          .maybeSingle(),
        bookingRow.status === 'en_route'
          ? supabase.rpc('get_tracking_pro_phone', { p_booking_id: bookingRow.id })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (proResult.error || phoneResult.error) {
        setError(proResult.error?.message ?? phoneResult.error?.message ?? 'No pudimos cargar los datos del profesional.');
      } else {
        setProfessional(proResult.data as ProCard | null);
        const contact = (phoneResult.data ?? [])[0] as { phone: string | null } | undefined;
        setProfessionalPhone(contact?.phone ?? null);
      }
    }

    if (bookingRow.status === 'en_route') {
      const { data: location, error: locationError } = await supabase
        .from('pro_locations')
        .select('latitude, longitude')
        .eq('booking_id', bookingRow.id)
        .maybeSingle();
      if (locationError) setError(locationError.message);
      else if (typeof location?.latitude === 'number' && typeof location.longitude === 'number') {
        setProfessionalCoordinate({ latitude: location.latitude, longitude: location.longitude });
      }
    } else {
      setProfessionalCoordinate(null);
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
          return;
        }
        const row = payload.new as { latitude?: number; longitude?: number };
        if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
          setProfessionalCoordinate({ latitude: row.latitude, longitude: row.longitude });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [booking?.id, booking?.status]);

  async function callProfessional() {
    const phone = professionalPhone?.replace(/[^\d+]/g, '');
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

  const destination = booking && typeof booking.client_lat === 'number' && typeof booking.client_lng === 'number'
    ? { latitude: booking.client_lat, longitude: booking.client_lng }
    : null;
  const etaMinutes = professionalCoordinate && destination
    ? Math.max(1, Math.round(distanceInKm(professionalCoordinate, destination) / 25 * 60))
    : null;

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
                  <Text style={styles.etaLabel}>LLEGADA ESTIMADA</Text>
                  <Text style={styles.etaValue}>{etaMinutes === null ? 'Calculando…' : `~${etaMinutes} min`}</Text>
                  <Text style={styles.etaHint}>{professionalCoordinate ? 'La ubicación se actualiza en vivo.' : 'Esperando la primera actualización de ubicación del profesional.'}</Text>
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
                  {professionalPhone && <Pressable accessibilityRole="button" onPress={() => void callProfessional()} style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}>
                    <Text style={styles.callButtonText}>Llamar</Text>
                  </Pressable>}
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
              <Text style={styles.stepsTitle}>Tu servicio, paso a paso</Text>
              <View style={styles.stepRow}><Text style={styles.stepDone}>✓</Text><Text style={styles.stepText}>Reserva confirmada</Text></View>
              <View style={styles.stepRow}><Text style={booking.status === 'en_route' || ['arrived', 'in_progress', 'completed'].includes(booking.status) ? styles.stepDone : styles.stepPending}>{booking.status === 'en_route' || ['arrived', 'in_progress', 'completed'].includes(booking.status) ? '✓' : '2'}</Text><Text style={styles.stepText}>Profesional en camino</Text></View>
              <View style={styles.stepRow}><Text style={booking.status === 'arrived' || ['in_progress', 'completed'].includes(booking.status) ? styles.stepDone : styles.stepPending}>{booking.status === 'arrived' || ['in_progress', 'completed'].includes(booking.status) ? '✓' : '3'}</Text><Text style={styles.stepText}>Llegada al domicilio</Text></View>
              <View style={styles.stepRow}><Text style={booking.status === 'completed' ? styles.stepDone : styles.stepPending}>{booking.status === 'completed' ? '✓' : '4'}</Text><Text style={styles.stepText}>Servicio completado</Text></View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FC' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 19 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F7F8FC' },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: '#315BFF', fontSize: 13, fontWeight: '900' },
  heading: { gap: 7, paddingTop: 4 },
  eyebrow: { color: '#315BFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#15213B', fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: '#748096', fontSize: 12, lineHeight: 18 },
  etaCard: { padding: 22, borderRadius: 24, backgroundColor: '#1C3479', gap: 6, shadowColor: '#1C3479', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 11 }, shadowRadius: 20, elevation: 5 },
  etaLabel: { color: '#C0CFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  etaValue: { color: '#FFFFFF', fontSize: 44, lineHeight: 52, fontWeight: '900', letterSpacing: -1.2 },
  etaHint: { color: '#D5DFF0', fontSize: 11, lineHeight: 17 },
  mapPlaceholder: { height: 290, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#E7ECF5', gap: 10, borderWidth: 1, borderColor: '#DDE4F0' },
  professionalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: '#E3E8F2', borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#182B55', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 7 }, shadowRadius: 15, elevation: 2 },
  avatar: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#EEF2FF' },
  avatarText: { color: '#315BFF', fontSize: 21, fontWeight: '900' },
  professionalDetails: { flex: 1, gap: 3 },
  professionalName: { color: '#15213B', fontSize: 15, fontWeight: '900' },
  callButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#315BFF' },
  callButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  destinationCard: { padding: 17, borderWidth: 1, borderColor: '#E3E8F2', borderRadius: 19, backgroundColor: '#FFFFFF', gap: 7 },
  destinationLabel: { color: '#8792A5', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  destinationText: { color: '#15213B', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  statusCard: { alignItems: 'center', padding: 25, borderWidth: 1, borderColor: '#DDECE4', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 10 },
  statusIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#E8F6F1' },
  statusIconText: { color: '#0F987A', fontSize: 20, fontWeight: '900' },
  statusMessage: { color: '#15213B', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stepsCard: { padding: 20, borderWidth: 1, borderColor: '#E3E8F2', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 14 },
  stepsTitle: { color: '#15213B', fontSize: 16, fontWeight: '900', marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stepDone: { width: 26, height: 26, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 13, backgroundColor: '#DDF3E8', color: '#087A63', fontSize: 13, fontWeight: '900' },
  stepPending: { width: 26, height: 26, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 13, backgroundColor: '#F0F2F7', color: '#8490A5', fontSize: 11, fontWeight: '800' },
  stepText: { color: '#44516A', fontSize: 12, fontWeight: '700' },
  error: { padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', color: '#B42318', fontSize: 12 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});