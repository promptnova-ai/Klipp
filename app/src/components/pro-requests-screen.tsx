import { useCallback, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
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
  const { session, profile } = useAuth();
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

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#0F987A" /><Text style={styles.body}>Preparando tu bandeja...</Text></View>;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#0F987A" />}>
      <BrandScreenHeader role="pro" eyebrow="TU ESPACIO PROFESIONAL" title="Oportunidades" subtitle="Gestiona solicitudes y convierte tu disponibilidad en trabajo." />
      <View style={styles.inboxHero}>
        <View style={styles.heroTop}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>TU NEGOCIO EN KLIPP</Text>
            <Text style={styles.heroTitle}>{firstName ? 'Hola, ' + firstName : 'Tu próxima oportunidad empieza aquí'}</Text>
            <Text style={styles.heroBody}>Revisa cada solicitud, valora los detalles y confirma los servicios que puedes atender.</Text>
          </View>
          <View style={styles.inboxCount}>
            <Text style={styles.inboxCountValue}>{requests.length}</Text>
            <Text style={styles.inboxCountLabel}>PENDIENTES</Text>
          </View>
        </View>
        <View style={styles.heroFooter}>
          <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} tintColor="#BDEDDD" size={16} />
          <Text style={styles.heroFooterText}>Acepta solo los servicios que puedes cumplir.</Text>
        </View>
      </View>
      <View style={styles.listHeader}>
        <View><Text style={styles.sectionEyebrow}>BANDEJA DE ENTRADA</Text><Text style={styles.sectionTitle}>Solicitudes nuevas</Text></View>
        <View style={styles.listCount}><Text style={styles.listCountText}>{requests.length}</Text></View>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && requests.length === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><SymbolView name={{ ios: 'tray', android: 'inbox', web: 'inbox' }} tintColor="#0F987A" size={26} /></View>
          <Text style={styles.emptyTitle}>Todo al día</Text>
          <Text style={styles.body}>Todavía no tienes solicitudes pendientes. Cuando un cliente te elija, recibirás aquí los detalles para responder.</Text>
          <Text style={styles.emptyHint}>Mantén tu perfil y disponibilidad actualizados para recibir oportunidades.</Text>
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
                <Text style={styles.warning}>No es posible consultar los detalles de esta reserva. No la aceptes sin poder revisar servicio, ubicación y horario.</Text>
              </>
            ) : (
              <>
                <View style={styles.requestHeader}>
                  <View style={styles.requestIcon}><SymbolView name={{ ios: 'sparkles', android: 'cleaning_services', web: 'cleaning_services' }} tintColor="#0F987A" size={23} /></View>
                  <View style={styles.requestTitleCopy}>
                    <Text style={styles.cardTitle}>{booking.service_types?.name ?? 'Servicio a domicilio'}</Text>
                    <Text style={styles.requestSubtitle}>{booking.pricing_tiers?.label ?? booking.est_minutes + ' minutos de servicio'}</Text>
                  </View>
                  <View style={styles.newPill}><Text style={styles.newPillText}>NUEVA</Text></View>
                </View>
                <View style={styles.requestDetails}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor="#64748B" size={15} /></View>
                    <View style={styles.detailCopy}><Text style={styles.detailLabel}>FECHA Y HORA</Text><Text style={styles.detailValue}>{formatBusinessDate(booking.scheduled_start)}</Text></View>
                  </View>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor="#64748B" size={15} /></View>
                    <View style={styles.detailCopy}><Text style={styles.detailLabel}>DIRECCIÓN DEL SERVICIO</Text><Text style={styles.detailValue}>{booking.address_text ?? 'No disponible'}</Text></View>
                  </View>
                </View>
                {!!booking.landmark_notes && <Text style={styles.landmark}>Referencia: {booking.landmark_notes}</Text>}
                <View style={styles.payoutPanel}>
                  <View><Text style={styles.payoutLabel}>RECIBIRÍAS</Text><Text style={styles.payout}> {formatDop(booking.pro_payout_dop)}</Text></View>
                  <View style={styles.durationBadge}><SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} tintColor="#087A63" size={14} /><Text style={styles.durationText}>{booking.est_minutes} min</Text></View>
                </View>
              </>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.expiration}>Expira: {formatBusinessDate(request.expires_at)}</Text>
              <View style={styles.actions}>
                <ResponseButton disabled={unavailable || busyId === request.id} label={busyId === request.id ? 'Enviando...' : 'Aceptar servicio'} onPress={() => void respond(request.id, true)} />
                <ResponseButton secondary disabled={busyId === request.id} label="Rechazar" onPress={() => void respond(request.id, false)} />
              </View>
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
  page: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 54, gap: 20, backgroundColor: '#F3F8F6', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#F3F8F6' },
  body: { color: '#64766F', fontSize: 13, lineHeight: 20 },
  inboxHero: { padding: 21, borderRadius: 24, backgroundColor: '#123F36', gap: 16, shadowColor: '#124B3E', shadowOpacity: 0.17, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 5 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroCopy: { flex: 1, gap: 7 },
  heroEyebrow: { color: '#A5DCCB', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.6 },
  heroBody: { color: '#D4E8E1', fontSize: 12, lineHeight: 18 },
  inboxCount: { width: 70, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFFFFF18' },
  inboxCountValue: { color: '#FFFFFF', fontSize: 29, fontWeight: '900' },
  inboxCountLabel: { color: '#B8DCD0', fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginTop: 1 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#FFFFFF24' },
  heroFooterText: { color: '#D4E8E1', fontSize: 11, fontWeight: '600' },
  listHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionEyebrow: { color: '#0F987A', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#173B34', fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  listCount: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E2F4EC' },
  listCountText: { color: '#087A63', fontSize: 12, fontWeight: '900' },
  empty: { marginTop: 1, padding: 24, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', gap: 11 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#E8F6F1', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#173B34', fontSize: 19, fontWeight: '900' },
  emptyHint: { color: '#0F987A', fontSize: 11, lineHeight: 16, textAlign: 'center', fontWeight: '700' },
  card: { padding: 18, borderWidth: 1, borderColor: '#DCECE6', borderRadius: 22, backgroundColor: '#FFFFFF', gap: 14, shadowColor: '#124B3E', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 3 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  requestIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#E8F6F1', alignItems: 'center', justifyContent: 'center' },
  requestTitleCopy: { flex: 1, gap: 3 },
  cardTitle: { color: '#173B34', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  requestSubtitle: { color: '#72827B', fontSize: 11, fontWeight: '600' },
  newPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#E8F6F1' },
  newPillText: { color: '#087A63', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  requestDetails: { gap: 11, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ECF1EE' },
  detailItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { color: '#8A9992', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  detailValue: { color: '#334B42', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  landmark: { color: '#72827B', fontSize: 11, lineHeight: 17 },
  payoutPanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, borderRadius: 15, backgroundColor: '#EFF8F3' },
  payoutLabel: { color: '#728A7D', fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  payout: { color: '#087A63', fontSize: 21, fontWeight: '900', marginTop: 1 },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF' },
  durationText: { color: '#087A63', fontSize: 10, fontWeight: '800' },
  cardFooter: { gap: 10 },
  expiration: { color: '#96A39D', fontSize: 10, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 9 },
  button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderRadius: 13, backgroundColor: '#0F987A' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCECE6' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  secondaryText: { color: '#60736B' },
  disabled: { opacity: 0.45 },
  warning: { color: '#8A5B00', fontSize: 13, lineHeight: 19, padding: 11, borderRadius: 12, backgroundColor: '#FFF5D9' },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 },
});