import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';

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
    if (loading) return <View style={styles.centered}><ActivityIndicator color="#0F987A" /><Text style={styles.body}>Organizando tu agenda...</Text></View>;

  const onRoute = bookings.filter((booking) => booking.status === 'en_route').length;
  const inProgress = bookings.filter((booking) => booking.status === 'in_progress' || booking.status === 'arrived').length;

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#0F987A" />}>
      <BrandScreenHeader role="pro" eyebrow="TU OPERACIÓN DIARIA" title="Mi agenda" subtitle="Planifica tus servicios y mantén a tus clientes al tanto de cada paso." />
      <View style={styles.dayHero}>
        <View style={styles.dayHeroTop}>
          <View style={styles.dayHeroCopy}>
            <Text style={styles.dayEyebrow}>RESUMEN DE ACTIVIDAD</Text>
            <Text style={styles.dayTitle}>Tu trabajo, organizado.</Text>
            <Text style={styles.daySubtitle}>Aquí tienes los servicios aceptados que requieren tu atención.</Text>
          </View>
          <View style={styles.totalBadge}><Text style={styles.totalValue}>{bookings.length}</Text><Text style={styles.totalLabel}>ACTIVOS</Text></View>
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metric}><Text style={styles.metricValue}>{bookings.length - onRoute - inProgress}</Text><Text style={styles.metricLabel}>Próximos</Text></View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}><Text style={styles.metricValue}>{onRoute}</Text><Text style={styles.metricLabel}>En camino</Text></View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}><Text style={styles.metricValue}>{inProgress}</Text><Text style={styles.metricLabel}>En servicio</Text></View>
        </View>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.listHeader}>
        <View><Text style={styles.sectionEyebrow}>SERVICIOS CONFIRMADOS</Text><Text style={styles.sectionTitle}>Tus próximos trabajos</Text></View>
        <View style={styles.listCount}><Text style={styles.listCountText}>{bookings.length}</Text></View>
      </View>
      {!error && bookings.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><SymbolView name={{ ios: 'calendar.badge.checkmark', android: 'event_available', web: 'event_available' }} tintColor="#0F987A" size={26} /></View>
          <Text style={styles.cardTitle}>Tu agenda está despejada</Text>
          <Text style={styles.body}>Cuando aceptes una solicitud, el servicio aparecerá aquí con su dirección, horario y pasos para completarlo.</Text>
        </View>
      )}
      {bookings.map((booking) => {
        const step = nextStep[booking.status];
        const statusLabel = booking.status === 'scheduled' ? 'CONFIRMADO' : booking.status === 'en_route' ? 'EN CAMINO' : booking.status === 'arrived' ? 'EN EL LUGAR' : 'EN SERVICIO';
        const statusStyle = booking.status === 'scheduled' ? styles.statusScheduled : booking.status === 'en_route' ? styles.statusTravel : styles.statusWork;
        return (
          <View key={booking.id} style={styles.card}>
            <View style={styles.bookingTop}>
              <View style={styles.bookingIcon}><SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor="#0F987A" size={22} /></View>
              <View style={styles.bookingTitleCopy}>
                <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio a domicilio'}</Text>
                <Text style={styles.bodySmall}>{booking.pricing_tiers?.label ?? booking.est_minutes + ' min'}</Text>
              </View>
              <View style={[styles.statusPill, statusStyle]}><Text style={styles.statusPillText}>{statusLabel}</Text></View>
            </View>
            <View style={styles.bookingDetails}>
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor="#6C7D74" size={15} /></View>
                <View style={styles.detailCopy}><Text style={styles.detailLabel}>FECHA Y HORA</Text><Text style={styles.detailValue}>{formatBusinessDate(booking.scheduled_start)}</Text></View>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#6C7D74" size={15} /></View>
                <View style={styles.detailCopy}><Text style={styles.detailLabel}>DIRECCIÓN</Text><Text style={styles.detailValue}>{booking.address_text || booking.addresses?.label || booking.addresses?.street || 'No disponible'}</Text></View>
              </View>
            </View>
            {(booking.landmark_notes || booking.addresses?.references_text) && <Text style={styles.landmark}>Referencia: {booking.landmark_notes || booking.addresses?.references_text}</Text>}
            {booking.status === 'en_route' && <View style={styles.liveNotice}><SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} tintColor="#087A63" size={15} /><Text style={styles.liveNoticeText}>Tu ubicación se comparte en vivo con el cliente.</Text></View>}
            {booking.status === 'en_route' && (
              <>
                <Pressable accessibilityRole="button" onPress={() => void toggleChat(booking.id)} style={({ pressed }) => [styles.chatButton, pressed && styles.disabled]}>
                  <SymbolView name={{ ios: 'message.fill', android: 'chat', web: 'chat' }} tintColor="#0F987A" size={15} />
                  <Text style={styles.chatButtonText}>{chatBookingId === booking.id ? 'Cerrar chat con cliente' : 'Escribir al cliente'}</Text>
                </Pressable>
                {chatBookingId === booking.id && (
                  <View style={styles.chatPanel}>
                    {chatMessages.map((message) => (
                      <View key={message.id} style={[styles.chatMessage, message.sender_id === session?.user.id && styles.chatMessageOwn]}><Text style={styles.chatMessageText}>{message.body}</Text></View>
                    ))}
                    <TextInput accessibilityLabel="Escribe un mensaje al cliente" maxLength={2000} onChangeText={setMessageDraft} placeholder="Escribe un mensaje..." placeholderTextColor="#87958E" style={styles.messageInput} value={messageDraft} />
                    <Pressable accessibilityRole="button" onPress={() => void sendMessage(booking.id)} style={styles.chatSendButton}><Text style={styles.chatSendText}>Enviar mensaje</Text></Pressable>
                  </View>
                )}
              </>
            )}
            <View style={styles.payoutPanel}><View><Text style={styles.payoutLabel}>TU INGRESO</Text><Text style={styles.payout}>{formatDop(booking.pro_payout_dop)}</Text></View><Text style={styles.durationText}>{booking.est_minutes} min</Text></View>
            {step && <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => void advance(booking)} style={[styles.button, busyId === booking.id && styles.disabled]}><Text style={styles.buttonText}>{busyId === booking.id ? 'Actualizando...' : step.label}</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor="#FFFFFF" size={17} /></Pressable>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 54, gap: 20, backgroundColor: '#F3F8F6', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#F3F8F6' },
  body: { color: '#65776F', fontSize: 13, lineHeight: 20 },
  bodySmall: { color: '#83918A', fontSize: 11, fontWeight: '600' },
  dayHero: { padding: 21, borderRadius: 24, backgroundColor: '#123F36', gap: 18, shadowColor: '#124B3E', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 5 },
  dayHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dayHeroCopy: { flex: 1, gap: 6 },
  dayEyebrow: { color: '#A5DCCB', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  dayTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.6 },
  daySubtitle: { color: '#D4E8E1', fontSize: 12, lineHeight: 18 },
  totalBadge: { width: 67, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFFFFF18' },
  totalValue: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' },
  totalLabel: { color: '#B8DCD0', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#FFFFFF24' },
  metric: { flex: 1, gap: 2 },
  metricValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  metricLabel: { color: '#C8E2D8', fontSize: 10, fontWeight: '700' },
  metricDivider: { width: 1, height: 30, backgroundColor: '#FFFFFF30', marginHorizontal: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionEyebrow: { color: '#0F987A', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#173B34', fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  listCount: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E2F4EC' },
  listCountText: { color: '#087A63', fontSize: 12, fontWeight: '900' },
  empty: { padding: 25, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', gap: 11 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#E8F6F1', alignItems: 'center', justifyContent: 'center' },
  card: { padding: 18, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 14, shadowColor: '#124B3E', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 3 },
  bookingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookingIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#E8F6F1', alignItems: 'center', justifyContent: 'center' },
  bookingTitleCopy: { flex: 1, gap: 3 },
  cardTitle: { color: '#173B34', fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusScheduled: { backgroundColor: '#EEF2FF' },
  statusTravel: { backgroundColor: '#E7F2FF' },
  statusWork: { backgroundColor: '#E8F6F1' },
  statusPillText: { color: '#087A63', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  bookingDetails: { gap: 10, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ECF1EE' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { color: '#8A9992', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  detailValue: { color: '#334B42', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  landmark: { color: '#718179', fontSize: 11, lineHeight: 17 },
  liveNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, backgroundColor: '#E8F6F1' },
  liveNoticeText: { color: '#087A63', fontSize: 11, fontWeight: '700', flex: 1 },
  chatButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: '#EFF8F3' },
  chatButtonText: { color: '#087A63', fontSize: 12, fontWeight: '800' },
  chatPanel: { padding: 12, borderRadius: 14, backgroundColor: '#F5F8F6', gap: 8 },
  chatMessage: { alignSelf: 'flex-start', maxWidth: '85%', padding: 9, borderRadius: 12, backgroundColor: '#FFFFFF' },
  chatMessageOwn: { alignSelf: 'flex-end', backgroundColor: '#E4F5EC' },
  chatMessageText: { color: '#334B42', fontSize: 13, lineHeight: 18 },
  messageInput: { minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 10, backgroundColor: '#FFFFFF', color: '#173B34', fontSize: 13 },
  chatSendButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#0F987A' },
  chatSendText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  payoutPanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderRadius: 15, backgroundColor: '#EFF8F3' },
  payoutLabel: { color: '#728A7D', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  payout: { color: '#087A63', fontSize: 19, fontWeight: '900', marginTop: 2 },
  durationText: { color: '#087A63', fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF' },
  button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: '#0F987A' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 },
});