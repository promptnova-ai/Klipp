import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Vibration, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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
  client_lat: number | null;
  client_lng: number | null;
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
  const [materialsConfirmed, setMaterialsConfirmed] = useState(false);
  const [materialsError, setMaterialsError] = useState(false);
  const [materialsShake] = useState(() => new Animated.Value(0));
  const activeRequest = requests[0] ?? null;
  useEffect(() => {
    setMaterialsConfirmed(false);
    setMaterialsError(false);
    materialsShake.setValue(0);
  }, [activeRequest?.id, materialsShake]);

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
    if (accept && !materialsConfirmed) {
      setMaterialsError(true);
      Vibration.vibrate(90);
      Animated.sequence([
        Animated.timing(materialsShake, { toValue: 1, duration: 55, useNativeDriver: true }),
        Animated.timing(materialsShake, { toValue: -1, duration: 55, useNativeDriver: true }),
        Animated.timing(materialsShake, { toValue: 1, duration: 55, useNativeDriver: true }),
        Animated.timing(materialsShake, { toValue: 0, duration: 70, useNativeDriver: true }),
      ]).start();
      return;
    }
    setBusyId(requestId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('respond_to_request', {
      p_request_id: requestId,
      p_accept: accept,
      p_materials_confirmed: accept ? materialsConfirmed : false,
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

              <View style={styles.mapCard}>
                <View style={styles.mapHeading}>
                  <View style={styles.mapHeadingCopy}>
                    <Text style={styles.detailLabel}>PUNTO DEL SERVICIO</Text>
                    <Text style={styles.mapAddress}>{activeRequest.address_text || 'Ubicación del cliente'}</Text>
                    {!!activeRequest.landmark_notes && <Text style={styles.detailMuted}>Referencia: {activeRequest.landmark_notes}</Text>}
                  </View>
                  <View style={styles.mapPinBadge}><Text style={styles.mapPinGlyph}>⌖</Text></View>
                </View>
                {activeRequest.client_lat != null && activeRequest.client_lng != null && Platform.OS !== 'web' ? (
                  <MapView
                    style={styles.offerMap}
                    initialRegion={{
                      latitude: activeRequest.client_lat,
                      longitude: activeRequest.client_lng,
                      latitudeDelta: 0.006,
                      longitudeDelta: 0.006,
                    }}
                    scrollEnabled={false}
                    zoomEnabled
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}>
                    <Marker
                      coordinate={{ latitude: activeRequest.client_lat, longitude: activeRequest.client_lng }}
                      title="Lugar del servicio"
                      description={activeRequest.address_text || 'Punto indicado por el cliente'}
                      pinColor="#15966f"
                    />
                  </MapView>
                ) : (
                  <View style={styles.mapUnavailable}>
                    <Text style={styles.mapUnavailableTitle}>{Platform.OS === 'web' ? 'Mapa disponible en la app móvil' : 'Ubicación exacta no disponible'}</Text>
                    <Text style={styles.mapUnavailableText}>{Platform.OS === 'web' ? 'Consulta el punto del servicio desde Klipp PRO en tu móvil.' : 'El cliente no ha compartido coordenadas para esta solicitud. Usa la dirección y referencia indicadas.'}</Text>
                  </View>
                )}
                {activeRequest.client_lat != null && activeRequest.client_lng != null && (
                  <Text style={styles.mapCoordinates}>Punto exacto compartido por el cliente</Text>
                )}
              </View>

              <View style={styles.earningCard}>
                <Text style={styles.earningLabel}>GANARÍAS POR ESTE SERVICIO</Text>
                <Text style={styles.earningAmount}>{formatDop(activeRequest.pro_payout_dop)}</Text>
                <Text style={styles.earningNote}>Importe estimado para ti, después de la comisión de Klipp.</Text>
              </View>

              <Animated.View style={{ transform: [{ translateX: materialsShake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] }) }] }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: materialsConfirmed }}
                  onPress={() => {
                    setMaterialsConfirmed((current) => !current);
                    setMaterialsError(false);
                    Vibration.vibrate(18);
                  }}
                  style={[styles.materialsCard, materialsError && styles.materialsCardError, materialsConfirmed && styles.materialsCardConfirmed]}>
                  <View style={[styles.materialsCheck, materialsConfirmed && styles.materialsCheckSelected, materialsError && styles.materialsCheckError]}>
                    {materialsConfirmed && <Text style={styles.materialsCheckmark}>✓</Text>}
                  </View>
                  <View style={styles.materialsCopy}>
                    <Text style={styles.materialsTitle}>Llevo mis herramientas y materiales</Text>
                    <Text style={styles.materialsDescription}>Confirmo que cuento con todo lo necesario para realizar este servicio. No utilizaré materiales ni herramientas del cliente.</Text>
                    {materialsError && <Text accessibilityRole="alert" style={styles.materialsErrorText}>Marca esta casilla para confirmar que llevas todo lo necesario.</Text>}
                    {materialsConfirmed && <Text style={styles.materialsSuccess}>Confirmación lista</Text>}
                  </View>
                </Pressable>
              </Animated.View>

              <SlideToAccept
                disabled={busyId === activeRequest.id || secondsLeft <= 0}
                label={busyId === activeRequest.id ? 'Enviando…' : secondsLeft <= 0 ? 'Solicitud expirada' : 'Desliza para aceptar'}
                onAccept={() => void respond(activeRequest.id, true)}
              />
              <HoldToReject
                disabled={busyId === activeRequest.id || secondsLeft <= 0}
                onReject={() => void respond(activeRequest.id, false)}
              />
              <Text style={styles.offerFootnote}>Para aceptar, confirma primero que llevas tus propias herramientas y materiales.</Text>
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
  const translateX = useRef(new Animated.Value(0)).current;
  const fillProgress = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef(0);
  const [ready, setReady] = useState(false);
  const acceptRef = useRef(onAccept);
  useEffect(() => { acceptRef.current = onAccept; }, [onAccept]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gesture) => !disabled && Math.abs(gesture.dx) > 4,
    onPanResponderMove: (_, gesture) => {
      const max = Math.max(0, trackWidth.current - 58);
      const x = Math.max(0, Math.min(max, gesture.dx));
      translateX.setValue(x);
      const progress = max > 0 ? x / max : 0;
      fillProgress.setValue(progress);
      setReady(progress >= 0.72);
    },
    onPanResponderRelease: (_, gesture) => {
      const max = Math.max(0, trackWidth.current - 58);
      if (max > 0 && gesture.dx >= max * 0.72) {
        Vibration.vibrate(35);
        acceptRef.current();
      }
      setReady(false);
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 5 }),
        Animated.timing(fillProgress, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    },
    onPanResponderTerminate: () => {
      setReady(false);
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
        Animated.timing(fillProgress, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]).start();
    },
  }), [disabled, fillProgress, translateX]);
  useEffect(() => {
    if (disabled) {
      translateX.setValue(0);
      fillProgress.setValue(0);
      setReady(false);
    }
  }, [disabled, fillProgress, translateX]);
  const fillWidth = fillProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.slideTrack, disabled && styles.slideDisabled]} onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}>
      <Animated.View pointerEvents="none" style={[styles.slideFill, { width: fillWidth }]} />
      <Text style={styles.slideLabel}>{ready ? 'ACEPTAR TRABAJO' : label}</Text>
      <Animated.View {...responder.panHandlers} accessibilityRole="button" accessibilityLabel={ready ? 'Aceptar trabajo' : label} pointerEvents={disabled ? 'none' : 'auto'} style={[styles.slideThumb, { transform: [{ translateX }] }]}>
        <Text style={styles.slideArrow}>››</Text>
      </Animated.View>
    </View>
  );
}

function HoldToReject({ disabled, onReject }: { disabled: boolean; onReject: () => void }) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rejectRef = useRef(onReject);
  useEffect(() => { rejectRef.current = onReject; }, [onReject]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const cancel = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCountdown(null);
  };
  const begin = () => {
    if (disabled) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCountdown(2);
    Vibration.vibrate(70);
    timers.current.push(setTimeout(() => {
      setCountdown(1);
      Vibration.vibrate(70);
    }, 1000));
    timers.current.push(setTimeout(() => {
      setCountdown(0);
      Vibration.vibrate(120);
      rejectRef.current();
      timers.current = [];
      setTimeout(() => setCountdown(null), 350);
    }, 2000));
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Mantén presionado dos segundos para rechazar el trabajo" accessibilityHint="Suelta antes de tiempo para cancelar" disabled={disabled} onPressIn={begin} onPressOut={cancel} style={[styles.holdReject, disabled && styles.slideDisabled]}>
      <Text style={styles.holdRejectTitle}>{countdown === null ? 'MANTÉN PRESIONADO PARA RECHAZAR' : countdown === 0 ? 'RECHAZANDO…' : `MANTÉN · ${countdown}`}</Text>
      <Text style={styles.holdRejectSubtitle}>{countdown === null ? '2 segundos · Suelta para cancelar' : countdown === 0 ? 'Solicitud en proceso' : 'No sueltes todavía'}</Text>
    </Pressable>
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
  mapCard: { padding: 14, borderRadius: 18, backgroundColor: '#ffffff', gap: 10 },
  mapHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapHeadingCopy: { flex: 1, gap: 4 },
  mapAddress: { color: '#142c36', fontSize: 14, fontWeight: '800', lineHeight: 20 },
  mapPinBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e0f3eb', alignItems: 'center', justifyContent: 'center' },
  mapPinGlyph: { color: '#126b50', fontSize: 25, fontWeight: '900' },
  offerMap: { height: 190, borderRadius: 14, overflow: 'hidden' },
  mapUnavailable: { minHeight: 110, borderRadius: 14, backgroundColor: '#eef3f1', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 },
  mapUnavailableTitle: { color: '#344950', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  mapUnavailableText: { color: '#64747a', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  mapCoordinates: { color: '#16836f', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  earningCard: { padding: 19, borderRadius: 18, backgroundColor: '#e0f3eb', alignItems: 'center', gap: 5 },
  earningLabel: { color: '#36745f', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  earningAmount: { color: '#126b50', fontSize: 32, fontWeight: '900' },
  earningNote: { color: '#4e7868', fontSize: 11, textAlign: 'center' },
  materialsCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 17, borderRadius: 18, borderWidth: 1.5, borderColor: '#cbd8d5', backgroundColor: '#ffffff' },
  materialsCardError: { borderColor: '#d94841', backgroundColor: '#fff4f2' },
  materialsCardConfirmed: { borderColor: '#16836f', backgroundColor: '#effaf6' },
  materialsCheck: { width: 27, height: 27, borderRadius: 8, borderWidth: 2, borderColor: '#93a5a2', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  materialsCheckSelected: { borderColor: '#126b60', backgroundColor: '#126b60' },
  materialsCheckError: { borderColor: '#d94841' },
  materialsCheckmark: { color: '#ffffff', fontSize: 19, fontWeight: '900', lineHeight: 22 },
  materialsCopy: { flex: 1, gap: 5 },
  materialsTitle: { color: '#142c36', fontSize: 15, fontWeight: '900', lineHeight: 21 },
  materialsDescription: { color: '#64747a', fontSize: 12, lineHeight: 18 },
  materialsErrorText: { color: '#b42318', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  materialsSuccess: { color: '#126b50', fontSize: 12, fontWeight: '800' },
  declineButton: { minHeight: 52, borderWidth: 1.5, borderColor: '#b42318', borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b42318' },
  declineText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  slideTrack: { height: 66, borderRadius: 18, backgroundColor: '#111820', justifyContent: 'center', padding: 4, overflow: 'hidden' },
  slideFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 18, backgroundColor: '#15966f' },
  slideDisabled: { opacity: 0.5 },
  slideLabel: { position: 'absolute', left: 65, right: 12, textAlign: 'center', color: '#ffffff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  slideThumb: { width: 56, height: 56, borderRadius: 15, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  slideArrow: { color: '#111820', fontSize: 27, fontWeight: '900', letterSpacing: -4, marginRight: 4 },
  holdReject: { minHeight: 58, borderWidth: 1.5, borderColor: '#b42318', borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b42318', gap: 3, paddingHorizontal: 12 },
  holdRejectTitle: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 0.45, textAlign: 'center' },
  holdRejectSubtitle: { color: '#ffe3df', fontSize: 11, fontWeight: '700' },
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