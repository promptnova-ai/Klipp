import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { formatBusinessDate, formatDop } from '@/lib/format';

type IncomingRequest = {
  id: string;
  booking_id: string;
  pro_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  client_name: string;
  client_avatar_url: string | null;
  service_name: string;
  pricing_tier_label: string | null;
  scheduled_start: string;
  est_minutes: number;
  pro_payout_dop: number;
  address_text: string | null;
  landmark_notes: string | null;
};
type IncomingReassignment = { request_id: string; booking_id: string; original_professional_name: string | null; scheduled_start: string; est_minutes: number; pro_payout_dop: number; address_text: string | null; landmark_notes: string | null; service_name: string | null; pricing_tier_label: string | null; expires_at: string };

export function ProRequestsScreen() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [reassignments, setReassignments] = useState<IncomingReassignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const activeRequest = requests[0] ?? null;
  const secondsLeft = activeRequest ? Math.max(0, Math.ceil((new Date(activeRequest.expires_at).getTime() - nowMs) / 1000)) : 0;

  const loadRequests = useCallback(async () => {
    if (!session?.user.id) return;
    setError(null);
    const [requestResult, reassignmentResult] = await Promise.all([
      supabase.rpc('pro_list_incoming_booking_requests'),
      supabase.rpc('pro_list_pending_booking_reassignments'),
    ]);
    if (requestResult.error) setError(requestResult.error.message);
    else setRequests((requestResult.data ?? []) as IncomingRequest[]);
    if (reassignmentResult.error) setError(reassignmentResult.error.message);
    else setReassignments((reassignmentResult.data ?? []) as IncomingReassignment[]);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeRequest || secondsLeft > 0) return;
    const timeout = setTimeout(() => { void loadRequests(); }, 0);
    return () => clearTimeout(timeout);
  }, [activeRequest?.id, secondsLeft, loadRequests]);

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

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel(`pro-reassignment-inbox:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const notification = payload.new as { type?: string };
        if (notification.type === 'booking_reassignment') void loadRequests();
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

  async function respondReassignment(requestId: string, accept: boolean) {
    setBusyId(requestId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('pro_respond_booking_reassignment', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (rpcError) setError(rpcError.message);
    else await loadRequests();
    setBusyId(null);
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#16766c" /><Text style={styles.body}>Cargando solicitudes...</Text></View>;

  return (
    <>
      <Modal
        visible={Boolean(activeRequest)}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => undefined}>
        {activeRequest && (
          <View style={styles.offerScreen}>
            <View style={styles.offerHeader}>
              <Text style={styles.offerBrand}>KLIPP PRO</Text>
              <Text style={styles.offerEyebrow}>NUEVA SOLICITUD DE SERVICIO</Text>
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>{secondsLeft > 0 ? `${secondsLeft}s` : 'EXPIRADA'}</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.offerContent}>
              <Text style={styles.offerTitle}>¡Tienes un nuevo servicio cerca!</Text>
              <Text style={styles.offerSubtitle}>Revisa los datos y desliza para aceptar antes de que termine el tiempo.</Text>

              <View style={styles.customerCard}>
                {activeRequest.client_avatar_url ? (
                  <Image source={{ uri: activeRequest.client_avatar_url }} style={styles.avatarCircle} />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitial}>{(activeRequest.client_name || 'C').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.customerInfo}>
                  <Text style={styles.detailLabel}>CLIENTE</Text>
                  <Text style={styles.customerName}>{activeRequest.client_name || 'Cliente Klipp'}</Text>
                  <Text style={styles.detailMuted}>Solicitud nueva · Cliente Klipp</Text>
                </View>
              </View>

              <View style={styles.offerDetailsCard}>
                <Text style={styles.detailLabel}>SERVICIO SOLICITADO</Text>
                <Text style={styles.serviceName}>{activeRequest.service_name}</Text>
                {!!activeRequest.pricing_tier_label && <Text style={styles.detailValue}>{activeRequest.pricing_tier_label}</Text>}
                <View style={styles.detailDivider} />
                <Text style={styles.detailLabel}>DÓNDE</Text>
                <Text style={styles.detailValue}>{activeRequest.address_text || 'Ubicación compartida en la reserva'}</Text>
                {!!activeRequest.landmark_notes && <Text style={styles.detailMuted}>Referencia: {activeRequest.landmark_notes}</Text>}
                <View style={styles.detailDivider} />
                <Text style={styles.detailLabel}>CUÁNDO</Text>
                <Text style={styles.detailValue}>{formatBusinessDate(activeRequest.scheduled_start)}</Text>
                <Text style={styles.detailMuted}>Duración estimada: {activeRequest.est_minutes} min</Text>
              </View>

              <View style={styles.earningCard}>
                <Text style={styles.earningLabel}>GANARÍAS POR ESTE SERVICIO</Text>
                <Text style={styles.earningAmount}>{formatDop(activeRequest.pro_payout_dop)}</Text>
                <Text style={styles.earningNote}>Importe estimado para ti, después de la comisión de Klipp.</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={busyId === activeRequest.id || secondsLeft <= 0}
                onPress={() => void respond(activeRequest.id, false)}
                style={[styles.declineButton, (busyId === activeRequest.id || secondsLeft <= 0) && styles.disabled]}>
                <Text style={styles.declineText}>Rechazar solicitud</Text>
              </Pressable>

              <SlideToAccept
                disabled={busyId === activeRequest.id || secondsLeft <= 0}
                label={busyId === activeRequest.id ? 'Enviando respuesta…' : secondsLeft <= 0 ? 'Solicitud expirada' : 'Desliza para aceptar'}
                onAccept={() => void respond(activeRequest.id, true)}
              />
              <Text style={styles.offerFootnote}>Si otro profesional acepta primero, esta solicitud dejará de estar disponible.</Text>
            </ScrollView>
          </View>
        )}
      </Modal>
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#16766c" />}>
      <BrandScreenHeader eyebrow="ESPACIO PROFESIONAL" title="Solicitudes" subtitle="Solicitudes nuevas y sustituciones de reservas confirmadas." />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && requests.length === 0 && reassignments.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No tienes solicitudes pendientes</Text>
          <Text style={styles.body}>Cuando llegue una solicitud, aparecerá aquí.</Text>
        </View>
      )}
      {reassignments.map((request) => (
        <View key={request.request_id} style={styles.card}>
          <Text style={styles.cardTitle}>Solicitud de sustitución</Text>
          <Text style={styles.body}>Klipp te propone asumir una reserva confirmada que actualmente tiene otro profesional.</Text>
          <Text style={styles.body}>Servicio: {request.service_name ?? 'Servicio Klipp'} · {request.pricing_tier_label ?? `${request.est_minutes} min`}</Text>
          <Text style={styles.body}>Fecha: {formatBusinessDate(request.scheduled_start)}</Text>
          <Text style={styles.body}>Ubicación: {request.address_text ?? 'No disponible'}</Text>
          {!!request.landmark_notes && <Text style={styles.body}>Referencia: {request.landmark_notes}</Text>}
          <Text style={styles.body}>Profesional actual: {request.original_professional_name ?? 'No disponible'}</Text>
          <Text style={styles.payout}>Recibirías {formatDop(request.pro_payout_dop)}</Text>
          <Text style={styles.expiration}>Debes responder antes de: {formatBusinessDate(request.expires_at)}</Text>
          <View style={styles.actions}>
            <ResponseButton disabled={busyId === request.request_id} label={busyId === request.request_id ? 'Enviando...' : 'Aceptar sustitución'} onPress={() => void respondReassignment(request.request_id, true)} />
            <ResponseButton secondary disabled={busyId === request.request_id} label="Rechazar" onPress={() => void respondReassignment(request.request_id, false)} />
          </View>
        </View>
      ))}
      {requests.length > 0 && reassignments.length > 0 && <Text style={styles.sectionTitle}>Otras solicitudes</Text>}
      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <Text style={styles.cardTitle}>{request.service_name}</Text>
          {!!request.pricing_tier_label && <Text style={styles.body}>{request.pricing_tier_label}</Text>}
          <Text style={styles.body}>Cliente: {request.client_name}</Text>
          <Text style={styles.body}>Ubicación: {request.address_text ?? 'No disponible'}</Text>
          {!!request.landmark_notes && <Text style={styles.body}>Referencia: {request.landmark_notes}</Text>}
          <Text style={styles.body}>Fecha: {formatBusinessDate(request.scheduled_start)} · {request.est_minutes} min</Text>
          <Text style={styles.payout}>Recibirías {formatDop(request.pro_payout_dop)}</Text>
          <Text style={styles.expiration}>Expira: {formatBusinessDate(request.expires_at)}</Text>
          <View style={styles.actions}>
            <ResponseButton disabled={busyId === request.id || new Date(request.expires_at).getTime() <= nowMs} label={busyId === request.id ? 'Enviando...' : 'Aceptar'} onPress={() => void respond(request.id, true)} />
            <ResponseButton secondary disabled={busyId === request.id || new Date(request.expires_at).getTime() <= nowMs} label="Rechazar" onPress={() => void respond(request.id, false)} />
          </View>
        </View>
      ))}
    </ScrollView>
    </>
  );
}

// PanResponder requires mutable refs for gesture state; refs are only read in gesture callbacks.
/* eslint-disable react-hooks/refs */
function SlideToAccept({ disabled, label, onAccept }: { disabled: boolean; label: string; onAccept: () => void }) {
  // eslint-disable-next-line react-hooks/refs
  const translateX = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef(0);
  const acceptRef = useRef(onAccept);
  useEffect(() => {
    acceptRef.current = onAccept;
  }, [onAccept]);
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gesture) => !disabled && Math.abs(gesture.dx) > 4,
    onPanResponderMove: (_, gesture) => {
      const max = Math.max(0, trackWidth.current - 58);
      translateX.setValue(Math.max(0, Math.min(max, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const max = Math.max(0, trackWidth.current - 58);
      if (max > 0 && gesture.dx >= max * 0.72) {
        acceptRef.current();
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [disabled, translateX]);

  useEffect(() => {
    if (disabled) translateX.setValue(0);
  }, [disabled, translateX]);

  return (
    <View style={[styles.slideTrack, disabled && styles.slideDisabled]} onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}>
      <Text style={styles.slideLabel}>{label}</Text>
      <Animated.View
        // eslint-disable-next-line react-hooks/refs
        {...responder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={label}
        pointerEvents={disabled ? 'none' : 'auto'}
        style={[styles.slideThumb, { transform: [{ translateX }] }]}>
        <Text style={styles.slideArrow}>››</Text>
      </Animated.View>
    </View>
  );
}

/* eslint-enable react-hooks/refs */

function ResponseButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  offerScreen: { flex: 1, backgroundColor: '#0b1f2a' },
  offerHeader: { paddingTop: 58, paddingHorizontal: 24, paddingBottom: 24, backgroundColor: '#0b1f2a', alignItems: 'center', gap: 8 },
  offerBrand: { color: '#a8d8d1', fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  offerEyebrow: { color: '#ffffff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  countdownPill: { marginTop: 5, minWidth: 76, paddingHorizontal: 17, paddingVertical: 8, borderRadius: 22, backgroundColor: '#e45d42' },
  countdownText: { color: '#ffffff', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  offerContent: { padding: 22, paddingBottom: 40, gap: 16, backgroundColor: '#f4f7f5', flexGrow: 1 },
  offerTitle: { color: '#142c36', fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' },
  offerSubtitle: { color: '#64747a', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 4 },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, borderRadius: 18, backgroundColor: '#ffffff' },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#d7eee8', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#126b60', fontSize: 24, fontWeight: '900' },
  customerInfo: { flex: 1, gap: 3 },
  customerName: { color: '#142c36', fontSize: 19, fontWeight: '800' },
  detailLabel: { color: '#75858a', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  detailMuted: { color: '#69797e', fontSize: 12, lineHeight: 18 },
  offerDetailsCard: { padding: 18, borderRadius: 18, backgroundColor: '#ffffff', gap: 7 },
  serviceName: { color: '#142c36', fontSize: 22, fontWeight: '900' },
  detailValue: { color: '#344950', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  detailDivider: { height: 1, backgroundColor: '#e8eeee', marginVertical: 7 },
  earningCard: { padding: 19, borderRadius: 18, backgroundColor: '#e0f3eb', alignItems: 'center', gap: 5 },
  earningLabel: { color: '#36745f', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  earningAmount: { color: '#126b50', fontSize: 32, fontWeight: '900' },
  earningNote: { color: '#4e7868', fontSize: 11, textAlign: 'center' },
  declineButton: { minHeight: 52, borderWidth: 1.5, borderColor: '#b42318', borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b42318' },
  declineText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  slideTrack: { height: 64, borderRadius: 18, backgroundColor: '#126b60', justifyContent: 'center', padding: 4, overflow: 'hidden' },
  slideDisabled: { opacity: 0.5 },
  slideLabel: { position: 'absolute', left: 65, right: 12, textAlign: 'center', color: '#ffffff', fontSize: 14, fontWeight: '900' },
  slideThumb: { width: 56, height: 56, borderRadius: 15, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  slideArrow: { color: '#126b60', fontSize: 27, fontWeight: '900', letterSpacing: -4, marginRight: 4 },
  offerFootnote: { color: '#718187', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  page: { paddingBottom: 35, gap: 14, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f4f7f5' },
  title: { color: '#18332d', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52615b', fontSize: 15, marginTop: -8 },
  body: { color: '#52615b', fontSize: 14, lineHeight: 21 },
  empty: { marginTop: 20, padding: 18, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 8, backgroundColor: KlippColors.white, gap: 7 },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  sectionTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '800', marginTop: 6 },
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