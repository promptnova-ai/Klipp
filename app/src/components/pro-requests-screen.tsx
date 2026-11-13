import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Vibration, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/components/auth-provider';
import { BrandScreenHeader } from '@/components/brand-screen-header';
import { KlippColors } from '@/lib/brand';
import { serviceArt } from '@/lib/service-art';
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
  const [materialsConfirmedFor, setMaterialsConfirmedFor] = useState<string | null>(null);
  const [materialsErrorFor, setMaterialsErrorFor] = useState<string | null>(null);
  const [materialsShake] = useState(() => new Animated.Value(0));
  const activeRequest = requests[0] ?? null;
  const materialsConfirmed = Boolean(activeRequest && materialsConfirmedFor === activeRequest.id);
  const materialsError = Boolean(activeRequest && materialsErrorFor === activeRequest.id);

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

  const expiryHandledRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeRequest || secondsLeft > 0 || expiryHandledRef.current.has(activeRequest.id)) return;
    expiryHandledRef.current.add(activeRequest.id);
    let cancelled = false;
    void (async () => {
      const { error: expiryError } = await supabase.rpc('pro_expire_booking_request', {
        p_request_id: activeRequest.id,
      });
      if (cancelled) return;
      if (expiryError) {
        setError(expiryError.message);
        return;
      }
      await loadRequests();
    })();
    return () => { cancelled = true; };
  }, [activeRequest, secondsLeft, loadRequests]);

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
    if (activeRequest && secondsLeft <= 0) expiryHandledRef.current.delete(activeRequest.id);
    setRefreshing(true);
    try {
      await loadRequests();
    } finally {
      setRefreshing(false);
    }
  }

  async function respond(requestId: string, accept: boolean) {
    if (accept && !materialsConfirmed) {
      setMaterialsErrorFor(requestId);
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
    try {
      const { error: rpcError } = await supabase.rpc('respond_to_request', {
        p_request_id: requestId,
        p_accept: accept,
        p_materials_confirmed: accept ? materialsConfirmed : false,
      });
      if (rpcError) setError(rpcError.message);
      else await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos enviar tu respuesta. Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  }

  async function respondReassignment(requestId: string, accept: boolean) {
    setBusyId(requestId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('pro_respond_booking_reassignment', {
        p_request_id: requestId,
        p_accept: accept,
      });
      if (rpcError) setError(rpcError.message);
      else await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos responder a la sustitución. Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color={KlippColors.cobalt} /><Text style={styles.body}>Cargando solicitudes...</Text></View>;

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
                      pinColor={KlippColors.cobalt}
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
                    setMaterialsConfirmedFor((current) => current === activeRequest.id ? null : activeRequest.id);
                    setMaterialsErrorFor(null);
                    materialsShake.setValue(0);
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
      refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={KlippColors.cobalt} />}>
      <BrandScreenHeader role="pro" eyebrow="ESPACIO PROFESIONAL" title="Solicitudes" subtitle="Solicitudes nuevas y sustituciones de reservas confirmadas." />
      <View style={styles.proHero}>
        <View style={styles.proHeroTop}>
          <Text style={styles.proHeroEyebrow}>KLIPP PRO · TU ESPACIO DE TRABAJO</Text>
          <View style={styles.proHeroLive}><View style={styles.proHeroLiveDot} /><Text style={styles.proHeroLiveText}>ACTIVIDAD</Text></View>
        </View>
        <View style={styles.proHeroMain}>
          <View style={styles.proHeroCopy}>
            <Text style={styles.proHeroTitle}>Tu próximo servicio empieza aquí.</Text>
            <Text style={styles.proHeroDescription}>Revisa cada oportunidad, conoce los detalles y decide qué trabajos aceptar.</Text>
          </View>
          <View style={styles.proHeroCount}><Text style={styles.proHeroCountValue}>{requests.length + reassignments.length}</Text><Text style={styles.proHeroCountLabel}>PENDIENTES</Text></View>
        </View>
        <View style={styles.proHeroStats}>
          <View style={styles.proHeroStat}><Text style={styles.proHeroStatValue}>{requests.length}</Text><Text style={styles.proHeroStatLabel}>Nuevas solicitudes</Text></View>
          <View style={styles.proHeroStatDivider} />
          <View style={styles.proHeroStat}><Text style={styles.proHeroStatValue}>{reassignments.length}</Text><Text style={styles.proHeroStatLabel}>Sustituciones</Text></View>
        </View>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!error && requests.length === 0 && reassignments.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No tienes solicitudes pendientes</Text>
          <Text style={styles.body}>Cuando llegue una solicitud, aparecerá aquí.</Text>
        </View>
      )}
      {reassignments.map((request) => (
        <View key={request.request_id} style={styles.requestCard}>
          <View style={styles.requestCardTop}>
            <View style={styles.requestArt}><Image source={serviceArt(request.service_name ?? '')} contentFit="cover" style={styles.requestArtImage} /></View>
            <View style={styles.requestCardHeading}><Text style={styles.requestEyebrow}>OPORTUNIDAD DE SUSTITUCIÓN</Text><Text style={styles.cardTitle}>{request.service_name ?? 'Servicio Klipp'}</Text></View>
            <View style={styles.requestTag}><Text style={styles.requestTagText}>NUEVA</Text></View>
          </View>
          <Text style={styles.body}>Klipp te propone asumir una reserva confirmada que actualmente tiene otro profesional.</Text>
          <View style={styles.requestFacts}>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>FECHA Y HORA</Text><Text style={styles.requestFactValue}>{formatBusinessDate(request.scheduled_start)}</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>DURACIÓN</Text><Text style={styles.requestFactValue}>{request.est_minutes} min</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>UBICACIÓN</Text><Text numberOfLines={2} style={styles.requestFactValue}>{request.address_text ?? 'No disponible'}</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>PROFESIONAL ACTUAL</Text><Text style={styles.requestFactValue}>{request.original_professional_name ?? 'No disponible'}</Text></View>
          </View>
          {!!request.landmark_notes && <Text style={styles.body}>Referencia: {request.landmark_notes}</Text>}
          <View style={styles.requestEarnings}><View><Text style={styles.requestEarningsLabel}>RECIBIRÍAS</Text><Text style={styles.requestEarningsHint}>Importe después de la comisión</Text></View><Text style={styles.payout}>{formatDop(request.pro_payout_dop)}</Text></View>
          <Text style={styles.expiration}>Responde antes de: {formatBusinessDate(request.expires_at)}</Text>
          <View style={styles.actions}>
            <ResponseButton disabled={busyId === request.request_id} label={busyId === request.request_id ? 'Enviando...' : 'Aceptar sustitución'} onPress={() => void respondReassignment(request.request_id, true)} />
            <ResponseButton secondary disabled={busyId === request.request_id} label="Rechazar" onPress={() => void respondReassignment(request.request_id, false)} />
          </View>
        </View>
      ))}
      {requests.length > 0 && reassignments.length > 0 && <Text style={styles.sectionTitle}>Otras solicitudes</Text>}
      {requests.map((request) => (
        <View key={request.id} style={styles.requestCard}>
          <View style={styles.requestCardTop}>
            <View style={styles.requestArt}><Image source={serviceArt(request.service_name)} contentFit="cover" style={styles.requestArtImage} /></View>
            <View style={styles.requestCardHeading}><Text style={styles.requestEyebrow}>NUEVA OPORTUNIDAD</Text><Text style={styles.cardTitle}>{request.service_name}</Text>{!!request.pricing_tier_label && <Text style={styles.requestTier}>{request.pricing_tier_label}</Text>}</View>
            <View style={styles.requestTag}><Text style={styles.requestTagText}>NUEVA</Text></View>
          </View>
          <View style={styles.requestFacts}>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>CLIENTE</Text><Text style={styles.requestFactValue}>{request.client_name || 'Cliente Klipp'}</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>FECHA Y HORA</Text><Text style={styles.requestFactValue}>{formatBusinessDate(request.scheduled_start)}</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>DURACIÓN</Text><Text style={styles.requestFactValue}>{request.est_minutes} min</Text></View>
            <View style={styles.requestFact}><Text style={styles.requestFactLabel}>UBICACIÓN</Text><Text numberOfLines={2} style={styles.requestFactValue}>{request.address_text ?? 'No disponible'}</Text></View>
          </View>
          {!!request.landmark_notes && <Text style={styles.body}>Referencia: {request.landmark_notes}</Text>}
          <View style={styles.requestEarnings}><View><Text style={styles.requestEarningsLabel}>TU INGRESO ESTIMADO</Text><Text style={styles.requestEarningsHint}>Después de la comisión de Klipp</Text></View><Text style={styles.payout}>{formatDop(request.pro_payout_dop)}</Text></View>
          <Text style={styles.expiration}>La solicitud expira: {formatBusinessDate(request.expires_at)}</Text>
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
  const fillWidth = fillProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.slideTrack, disabled && styles.slideDisabled]} onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}>
      <Animated.View pointerEvents="none" style={[styles.slideFill, { width: fillWidth }]} />
      <Text style={styles.slideLabel}>{ready && !disabled ? 'ACEPTAR TRABAJO' : label}</Text>
      <Animated.View {...responder.panHandlers} accessibilityRole="button" accessibilityLabel={ready && !disabled ? 'Aceptar trabajo' : label} pointerEvents={disabled ? 'none' : 'auto'} style={[styles.slideThumb, { transform: [{ translateX }] }]}>
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
  proHero: { width: '100%', maxWidth: 1080, alignSelf: 'center', marginHorizontal: 22, marginTop: 8, paddingVertical: 22, paddingHorizontal: 20, borderRadius: 16, backgroundColor: '#171B2D', gap: 17, overflow: 'hidden', shadowOpacity: 0, elevation: 0 },
  proHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  proHeroEyebrow: { color: 'rgba(255,255,255,0.82)', fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  proHeroLive: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  proHeroLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFB19F' },
  proHeroLiveText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  proHeroMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  proHeroCopy: { flex: 1, gap: 8 },
  proHeroTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.9 },
  proHeroDescription: { color: '#FFF0EC', fontSize: 13, lineHeight: 20, maxWidth: 440 },
  proHeroCount: { width: 78, height: 78, borderRadius: 16, backgroundColor: '#FF7058', alignItems: 'center', justifyContent: 'center', shadowOpacity: 0, elevation: 0 },
  proHeroCountValue: { color: '#FFFFFF', fontSize: 31, lineHeight: 34, fontWeight: '900' },
  proHeroCountLabel: { color: '#FFFFFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  proHeroStats: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.28)' },
  proHeroStat: { flex: 1, gap: 2 },
  proHeroStatValue: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  proHeroStatLabel: { color: '#FFF0EC', fontSize: 10, fontWeight: '700' },
  proHeroStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.34)' },
  requestCard: { width: '100%', maxWidth: 1080, alignSelf: 'center', marginHorizontal: 22, paddingVertical: 20, paddingHorizontal: 0, borderRadius: 0, borderBottomWidth: 1, borderColor: '#E8E5DE', backgroundColor: 'transparent', gap: 15, shadowOpacity: 0, elevation: 0 },
  requestArt: { width: 76, height: 62, overflow: 'hidden', borderRadius: 15, backgroundColor: '#F1EFE9' },
  requestArtImage: { width: '100%', height: '100%' },
  requestCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  requestIconText: { color: KlippColors.coral, fontSize: 23, fontWeight: '900' },
  requestCardHeading: { flex: 1, gap: 3 },
  requestEyebrow: { color: '#E65C45', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  requestTier: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  requestTag: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF0EC' },
  requestTagText: { color: '#E65C45', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  requestFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  requestFact: { width: '47%', minHeight: 54, paddingVertical: 5, paddingHorizontal: 0, borderRadius: 0, backgroundColor: 'transparent', gap: 5 },
  requestFactLabel: { color: '#85899A', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  requestFactValue: { color: '#171B2D', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  requestEarnings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FFF0EC', borderWidth: 0, borderColor: 'transparent' },
  requestEarningsLabel: { color: '#E65C45', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  requestEarningsHint: { color: '#8D6D69', fontSize: 10, marginTop: 3 },
  offerScreen: { flex: 1, backgroundColor: KlippColors.canvas },
  offerHeader: { width: '100%', paddingTop: 26, paddingHorizontal: 24, paddingBottom: 18, backgroundColor: '#171B2D', alignItems: 'flex-start', gap: 9, borderBottomWidth: 4, borderBottomColor: '#FF7058' },
  offerBrand: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 2.2 },
  offerEyebrow: { color: KlippColors.white, fontSize: 11, fontWeight: '800', letterSpacing: 1.15 },
  countdownPill: { marginTop: 3, minWidth: 82, paddingHorizontal: 17, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' },
  countdownText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  offerContent: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 28, paddingBottom: 56, gap: 20, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  offerTitle: { color: KlippColors.navy, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'left' },
  offerSubtitle: { color: KlippColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'left', marginBottom: 4 },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 0, borderBottomWidth: 1, borderColor: '#EAE7E0', borderRadius: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: KlippColors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: KlippColors.coral, fontSize: 24, fontWeight: '900' },
  customerInfo: { flex: 1, gap: 3 },
  customerName: { color: KlippColors.navy, fontSize: 18, fontWeight: '800' },
  detailLabel: { color: KlippColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.05 },
  detailMuted: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  offerDetailsCard: { paddingVertical: 18, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: 1, borderColor: '#EAE7E0', borderRadius: 0, backgroundColor: 'transparent', gap: 10, shadowOpacity: 0, elevation: 0 },
  serviceName: { color: KlippColors.navy, fontSize: 22, fontWeight: '900' },
  detailValue: { color: KlippColors.slate, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  detailDivider: { height: 1, backgroundColor: KlippColors.border, marginVertical: 8 },
  mapCard: { paddingVertical: 14, paddingHorizontal: 0, borderWidth: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: KlippColors.border, borderRadius: 0, backgroundColor: 'transparent', gap: 11 },
  mapHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapHeadingCopy: { flex: 1, gap: 4 },
  mapAddress: { color: KlippColors.navy, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  mapPinBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: KlippColors.surfaceBlue, alignItems: 'center', justifyContent: 'center' },
  mapPinGlyph: { color: KlippColors.coral, fontSize: 25, fontWeight: '900' },
  offerMap: { height: 190, borderRadius: 14, overflow: 'hidden' },
  mapUnavailable: { minHeight: 110, borderRadius: 14, backgroundColor: KlippColors.whiteMuted, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 },
  mapUnavailableTitle: { color: KlippColors.navy, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  mapUnavailableText: { color: KlippColors.slate, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  mapCoordinates: { color: KlippColors.coral, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  earningCard: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#FFF0EC', alignItems: 'flex-start', gap: 7, borderWidth: 0, borderColor: 'transparent' },
  earningLabel: { color: '#E65C45', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  earningAmount: { color: '#E65C45', fontSize: 34, fontWeight: '900' },
  earningNote: { color: KlippColors.slate, fontSize: 11, textAlign: 'center' },
  materialsCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 18, borderRadius: 20, borderWidth: 1.5, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  materialsCardError: { borderColor: KlippColors.danger, backgroundColor: KlippColors.whiteCoral },
  materialsCardConfirmed: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.surfaceBlue },
  materialsCheck: { width: 27, height: 27, borderRadius: 8, borderWidth: 2, borderColor: KlippColors.border, backgroundColor: KlippColors.white, alignItems: 'center', justifyContent: 'center' },
  materialsCheckSelected: { borderColor: KlippColors.cobalt, backgroundColor: KlippColors.cobalt },
  materialsCheckError: { borderColor: KlippColors.danger },
  materialsCheckmark: { color: KlippColors.white, fontSize: 19, fontWeight: '900', lineHeight: 22 },
  materialsCopy: { flex: 1, gap: 5 },
  materialsTitle: { color: KlippColors.navy, fontSize: 15, fontWeight: '900', lineHeight: 21 },
  materialsDescription: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  materialsErrorText: { color: KlippColors.danger, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  materialsSuccess: { color: KlippColors.coral, fontSize: 12, fontWeight: '800' },
  declineButton: { minHeight: 52, borderWidth: 1.5, borderColor: KlippColors.coral, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.white },
  declineText: { color: KlippColors.danger, fontSize: 14, fontWeight: '900' },
  slideTrack: { height: 66, borderRadius: 18, backgroundColor: KlippColors.ink, justifyContent: 'center', padding: 4, overflow: 'hidden' },
  slideFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 18, backgroundColor: KlippColors.cobalt },
  slideDisabled: { opacity: 0.5 },
  slideLabel: { position: 'absolute', left: 65, right: 12, textAlign: 'center', color: KlippColors.white, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  slideThumb: { width: 56, height: 56, borderRadius: 15, backgroundColor: KlippColors.white, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  slideArrow: { color: '#111820', fontSize: 27, fontWeight: '900', letterSpacing: -4, marginRight: 4 },
  holdReject: { minHeight: 58, borderWidth: 1.5, borderColor: KlippColors.danger, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.danger, gap: 3, paddingHorizontal: 12 },
  holdRejectTitle: { color: KlippColors.white, fontSize: 12, fontWeight: '900', letterSpacing: 0.45, textAlign: 'center' },
  holdRejectSubtitle: { color: KlippColors.surfaceCoral, fontSize: 11, fontWeight: '700' },
  offerFootnote: { color: KlippColors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  page: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 44, gap: 18, backgroundColor: KlippColors.canvas, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: KlippColors.canvas },
  title: { color: KlippColors.navy, fontSize: 28, fontWeight: '800' },
  subtitle: { color: KlippColors.slate, fontSize: 15, marginTop: -8 },
  body: { color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
  empty: { width: '100%', maxWidth: 760, alignSelf: 'center', marginTop: 12, paddingVertical: 22, paddingHorizontal: 2, borderTopWidth: 1, borderColor: KlippColors.border, borderRadius: 0, backgroundColor: 'transparent', gap: 8 },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '700' },
  sectionTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '800', marginTop: 6 },
  card: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 20, backgroundColor: KlippColors.white, gap: 12 },
  cardTitle: { color: KlippColors.navy, fontSize: 17, fontWeight: '700' },
  payout: { color: '#E65C45', fontSize: 19, fontWeight: '900' },
  expiration: { color: KlippColors.muted, fontSize: 12, marginTop: 4 },
  warning: { color: '#8A5B00', fontSize: 13, lineHeight: 19, padding: 11, borderRadius: 12, backgroundColor: KlippColors.goldLight },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: KlippColors.cobalt },
  secondaryButton: { backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border },
  buttonText: { color: KlippColors.white, fontWeight: '700' },
  secondaryText: { color: KlippColors.muted },
  disabled: { opacity: 0.45 },
  error: { color: KlippColors.danger, fontSize: 14, lineHeight: 20 },
});