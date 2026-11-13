import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KlippColors } from '@/theme/tokens';
import { AdminOperationsMap } from '@/components/admin-operations-map';
import { supabase } from '../../lib/supabase';

type OpsBooking = {
  booking_id: string;
  pro_id: string | null;
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
type BookingCandidate = { pro_id: string; professional_name: string | null; rating_avg: number | null; jobs_completed: number | null; distance_km: number | null; is_online: boolean; last_seen_at: string | null };
type ReassignmentCandidate = BookingCandidate;

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
  if (booking.status === 'en_route' && (!booking.pro_location_updated_at || minutesSince(booking.pro_location_updated_at) >= 2)) return 'GPS sin actualizar en más de 2 min';
  if (booking.status === 'in_progress' && booking.started_at && minutesSince(booking.started_at) > booking.est_minutes + 30) return 'Servicio supera la duración estimada en más de 30 min';
  return null;
}

export function AdminOperationsPanel({ canManage = false }: { canManage?: boolean }) {
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
  const [candidates, setCandidates] = useState<BookingCandidate[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [interventionReason, setInterventionReason] = useState('');
  const [interventionBusy, setInterventionBusy] = useState(false);
  const [interventionError, setInterventionError] = useState<string | null>(null);
  const [reassignmentCandidates, setReassignmentCandidates] = useState<ReassignmentCandidate[]>([]);
  const [reassignmentCandidatesLoaded, setReassignmentCandidatesLoaded] = useState(false);
  const [reassignmentCandidateLoading, setReassignmentCandidateLoading] = useState(false);
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [reassignmentBusy, setReassignmentBusy] = useState(false);
  const [reassignmentError, setReassignmentError] = useState<string | null>(null);
  const [reassignmentNotice, setReassignmentNotice] = useState<string | null>(null);

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
    void Promise.resolve().then(() => loadBookings()).finally(() => { if (active) setLoading(false); });
    const interval = setInterval(() => { void loadBookings(); }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [loadBookings]);

  const selectedBooking = bookings.find((item) => item.booking_id === selectedId) ?? null;

  const openTimeline = useCallback(async (bookingId: string) => {
    setSelectedId(bookingId);
    setCandidates([]);
    setCandidatesLoaded(false);
    setInterventionReason('');
    setInterventionError(null);
    setReassignmentCandidates([]);
    setReassignmentCandidatesLoaded(false);
    setReassignmentReason('');
    setReassignmentError(null);
    setReassignmentNotice(null);
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

  const loadCandidates = useCallback(async (bookingId: string) => {
    setCandidateLoading(true);
    setInterventionError(null);
    const { data, error: candidateError } = await supabase.rpc('admin_list_booking_candidates', {
      p_booking_id: bookingId,
    });
    if (candidateError) setInterventionError(candidateError.message);
    else setCandidates((data ?? []) as BookingCandidate[]);
    setCandidateLoading(false);
  }, []);

  const loadReassignmentCandidates = useCallback(async (bookingId: string) => {
    setReassignmentCandidateLoading(true);
    setReassignmentCandidatesLoaded(false);
    setReassignmentError(null);
    const { data, error: candidateError } = await supabase.rpc('admin_list_booking_reassignment_candidates', {
      p_booking_id: bookingId,
    });
    if (candidateError) setReassignmentError(candidateError.message);
    else setReassignmentCandidates((data ?? []) as ReassignmentCandidate[]);
    setReassignmentCandidatesLoaded(true);
    setReassignmentCandidateLoading(false);
  }, []);

  const requestBookingReassignment = useCallback(async (bookingId: string, proId: string) => {
    if (reassignmentReason.trim().length < 5) {
      setReassignmentError('Indica el motivo operativo de la sustitución (mínimo 5 caracteres).');
      return;
    }
    setReassignmentBusy(true);
    setReassignmentError(null);
    const { error: requestError } = await supabase.rpc('admin_create_booking_reassignment', {
      p_booking_id: bookingId,
      p_replacement_pro_id: proId,
      p_reason: reassignmentReason.trim(),
    });
    if (requestError) setReassignmentError(requestError.message);
    else {
      setReassignmentCandidates([]);
      setReassignmentReason('');
      await loadBookings();
      await openTimeline(bookingId);
      setReassignmentNotice('Solicitud enviada. El profesional actual conserva la asignación hasta que el sustituto acepte.');
    }
    setReassignmentBusy(false);
  }, [reassignmentReason, loadBookings, openTimeline]);

  const dispatchToProfessional = useCallback(async (bookingId: string, proId: string) => {
    if (interventionReason.trim().length < 5) {
      setInterventionError('Explica brevemente por qué se envía esta solicitud manual.');
      return;
    }
    setInterventionBusy(true);
    setInterventionError(null);
    const { error: dispatchError } = await supabase.rpc('admin_dispatch_booking_request', {
      p_booking_id: bookingId,
      p_pro_id: proId,
      p_reason: interventionReason.trim(),
    });
    if (dispatchError) setInterventionError(dispatchError.message);
    else {
      setCandidates([]);
      setInterventionReason('');
      await loadBookings();
      await openTimeline(bookingId);
    }
    setInterventionBusy(false);
  }, [interventionReason, loadBookings, openTimeline]);

  const cancelUnassignedBooking = useCallback((bookingId: string) => {
    if (interventionReason.trim().length < 5) {
      setInterventionError('Indica un motivo de cancelación de al menos 5 caracteres.');
      return;
    }
    Alert.alert(
      'Cancelar solicitud sin asignar',
      'La reserva se cancelará. Esta acción quedará registrada y no se puede deshacer desde este panel.',
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Confirmar cancelación', style: 'destructive', onPress: () => {
          void (async () => {
            setInterventionBusy(true);
            setInterventionError(null);
            const { error: cancelError } = await supabase.rpc('admin_cancel_unassigned_booking', {
              p_booking_id: bookingId,
              p_reason: interventionReason.trim(),
            });
            if (cancelError) setInterventionError(cancelError.message);
            else {
              setInterventionReason('');
              setSelectedId(null);
              setTimeline([]);
              await loadBookings();
            }
            setInterventionBusy(false);
          })();
        } },
      ],
    );
  }, [interventionReason, loadBookings]);

  const attentionCount = useMemo(() => bookings.filter((item) => attentionReason(item)).length, [bookings]);
  const visibleBookings = useMemo(() => bookings.filter((item) => {
    if (filter === 'attention') return Boolean(attentionReason(item));
    if (filter === 'active') return item.status !== 'disputed';
    return true;
  }), [bookings, filter]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={KlippColors.cobalt} /><Text style={styles.body}>Cargando órdenes activas...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.grow}>
          <Text style={styles.title}>Centro de operaciones</Text>
          <Text style={styles.body}>Supervisión de reservas, profesionales y tiempos de servicio.</Text>
          <Text style={styles.caption}>Actualización automática cada 15 segundos{updatedAt ? ` · Última consulta ${new Date(updatedAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</Text>
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
          {canManage && selectedBooking.status === 'requested' && selectedBooking.pro_id === null && (
            <View style={styles.interventionBox}>
              <Text style={styles.locationTitle}>Intervención administrativa</Text>
              <Text style={styles.body}>Esta solicitud todavía no tiene profesional asignado. Puedes enviar una oferta a un profesional elegible; deberá aceptarla desde su aplicación.</Text>
              <TextInput
                value={interventionReason}
                onChangeText={setInterventionReason}
                placeholder="Motivo de la intervención (mínimo 5 caracteres)"
                multiline
                style={styles.reasonInput}
                accessibilityLabel="Motivo de la intervención administrativa"
              />
              {interventionError && <Text accessibilityRole="alert" style={styles.error}>{interventionError}</Text>}
              <Pressable accessibilityRole="button" disabled={candidateLoading || interventionBusy} onPress={() => void loadCandidates(selectedBooking.booking_id)} style={styles.etaButton}>
                <Text style={styles.refreshText}>{candidateLoading ? 'Buscando…' : 'Buscar profesionales elegibles'}</Text>
              </Pressable>
              {candidates.map((candidate) => (
                <View key={candidate.pro_id} style={styles.candidateRow}>
                  <View style={styles.grow}>
                    <Text style={styles.eventTitle}>{candidate.professional_name || 'Profesional Klipp'}</Text>
                    <Text style={styles.caption}>
                      {candidate.distance_km !== null ? `Zona de cobertura: ${candidate.distance_km} km aprox.` : 'Zona de cobertura no disponible'}
                      {candidate.rating_avg !== null ? ` · ★ ${Number(candidate.rating_avg).toFixed(1)}` : ''}
                      {candidate.jobs_completed !== null ? ` · ${candidate.jobs_completed} servicios` : ''}
                    </Text>
                    <Text style={styles.caption}>{candidate.is_online ? 'Conectado ahora' : 'Disponible según agenda'}</Text>
                  </View>
                  <Pressable accessibilityRole="button" disabled={interventionBusy || interventionReason.trim().length < 5} onPress={() => void dispatchToProfessional(selectedBooking.booking_id, candidate.pro_id)} style={[styles.dispatchButton, (interventionBusy || interventionReason.trim().length < 5) && styles.disabled]}>
                    <Text style={styles.refreshText}>{interventionBusy ? 'Enviando…' : 'Enviar solicitud'}</Text>
                  </Pressable>
                </View>
              ))}
              {!candidateLoading && candidatesLoaded && candidates.length === 0 && <Text style={styles.caption}>No hay profesionales elegibles para esta reserva en este momento.</Text>}
              <Pressable accessibilityRole="button" disabled={interventionBusy || interventionReason.trim().length < 5} onPress={() => cancelUnassignedBooking(selectedBooking.booking_id)} style={[styles.cancelButton, (interventionBusy || interventionReason.trim().length < 5) && styles.disabled]}>
                <Text style={styles.cancelButtonText}>{interventionBusy ? 'Procesando…' : 'Cancelar solicitud sin asignar'}</Text>
              </Pressable>
              <Text style={styles.caption}>Por seguridad, esta herramienta no cancela reservas con pagos retenidos ni reasigna servicios ya aceptados o en curso.</Text>
            </View>
          )}
          {canManage && selectedBooking.status === 'scheduled' && selectedBooking.pro_id !== null && (
            <View style={styles.interventionBox}>
              <Text style={styles.locationTitle}>Reasignar profesional</Text>
              <Text style={styles.body}>Profesional actual: {selectedBooking.professional_name || 'Asignado'}. La reserva solo cambiará cuando el sustituto acepte. Mientras tanto, el profesional actual no podrá avanzar el servicio.</Text>
              <Text style={styles.body}>El pago permanece ligado a la reserva. Klipp solo cambia el destinatario de un pago al profesional si el payout sigue pendiente.</Text>
              <TextInput
                value={reassignmentReason}
                onChangeText={setReassignmentReason}
                placeholder="Motivo de la sustitución (mínimo 5 caracteres)"
                multiline
                style={styles.reasonInput}
                accessibilityLabel="Motivo de la reasignación administrativa"
              />
              {reassignmentError && <Text accessibilityRole="alert" style={styles.error}>{reassignmentError}</Text>}
              {reassignmentNotice && <Text style={styles.reassignmentSuccess}>{reassignmentNotice}</Text>}
              <Pressable accessibilityRole="button" disabled={reassignmentCandidateLoading || reassignmentBusy} onPress={() => void loadReassignmentCandidates(selectedBooking.booking_id)} style={styles.etaButton}>
                <Text style={styles.refreshText}>{reassignmentCandidateLoading ? 'Buscando…' : 'Buscar sustitutos elegibles'}</Text>
              </Pressable>
              {reassignmentCandidates.map((candidate) => (
                <View key={candidate.pro_id} style={styles.candidateRow}>
                  <View style={styles.grow}>
                    <Text style={styles.eventTitle}>{candidate.professional_name || 'Profesional Klipp'}</Text>
                    <Text style={styles.caption}>
                      {candidate.distance_km !== null ? `Zona de cobertura: ${candidate.distance_km} km aprox.` : 'Zona de cobertura no disponible'}
                      {candidate.rating_avg !== null ? ` · ★ ${Number(candidate.rating_avg).toFixed(1)}` : ''}
                      {candidate.jobs_completed !== null ? ` · ${candidate.jobs_completed} servicios` : ''}
                    </Text>
                    <Text style={styles.caption}>{candidate.is_online ? 'Conectado ahora' : 'Disponible según agenda'}</Text>
                  </View>
                  <Pressable accessibilityRole="button" disabled={reassignmentBusy || reassignmentReason.trim().length < 5} onPress={() => void requestBookingReassignment(selectedBooking.booking_id, candidate.pro_id)} style={[styles.dispatchButton, (reassignmentBusy || reassignmentReason.trim().length < 5) && styles.disabled]}>
                    <Text style={styles.refreshText}>{reassignmentBusy ? 'Enviando…' : 'Solicitar sustitución'}</Text>
                  </Pressable>
                </View>
              ))}
              {!reassignmentCandidateLoading && reassignmentCandidatesLoaded && reassignmentCandidates.length === 0 && <Text style={styles.caption}>No hay sustitutos elegibles en este momento.</Text>}
              <Text style={styles.caption}>Solo se permite antes de iniciar el desplazamiento. No se cambia una reserva en camino, llegada o servicio.</Text>
            </View>
          )}
          {timelineLoading ? <ActivityIndicator color={KlippColors.cobalt} /> : timeline.length === 0 ? <Text style={styles.body}>No hay eventos disponibles.</Text> : timeline.map((event) => (
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
  title: { color: KlippColors.ink, fontSize: 19, fontWeight: '800' },
  body: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  caption: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  refresh: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, backgroundColor: KlippColors.ink },
  refreshText: { color: KlippColors.white, fontSize: 12, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { minWidth: '47%', flexGrow: 1, padding: 15, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 16, backgroundColor: KlippColors.white, gap: 4 },
  metricValue: { color: KlippColors.ink, fontSize: 23, fontWeight: '800' },
  metricLabel: { color: KlippColors.muted, fontSize: 11, fontWeight: '600' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  filterSelected: { backgroundColor: KlippColors.ink, borderColor: KlippColors.ink },
  filterText: { color: KlippColors.slate, fontSize: 12, fontWeight: '600' },
  filterTextSelected: { color: KlippColors.white },
  bookingCard: { padding: 17, gap: 9, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 18, backgroundColor: KlippColors.white },
  bookingTitle: { flex: 1, color: KlippColors.ink, fontSize: 14, fontWeight: '800' },
  status: { color: KlippColors.cobaltDark, fontSize: 11, fontWeight: '800' },
  detailCard: { padding: 15, gap: 10, borderWidth: 1, borderColor: KlippColors.cobalt, borderRadius: 14, backgroundColor: KlippColors.surfaceBlue },
  locationBox: { padding: 12, gap: 5, borderRadius: 10, backgroundColor: KlippColors.surfaceBlue },
  interventionBox: { padding: 12, gap: 9, borderRadius: 10, borderWidth: 1, borderColor: KlippColors.border, backgroundColor: KlippColors.white },
  reasonInput: { minHeight: 84, padding: 13, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 14, color: KlippColors.ink, backgroundColor: KlippColors.white, textAlignVertical: 'top', fontSize: 13 },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: KlippColors.border },
  dispatchButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 13, backgroundColor: KlippColors.cobalt },
  cancelButton: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: KlippColors.danger, alignItems: 'center' },
  cancelButtonText: { color: KlippColors.danger, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  reassignmentSuccess: { color: KlippColors.success, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  locationTitle: { color: KlippColors.ink, fontSize: 13, fontWeight: '800' },
  etaValue: { color: KlippColors.ink, fontSize: 22, fontWeight: '800' },
  etaButton: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: KlippColors.ink },
  event: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 3 },
  eventTitle: { color: KlippColors.slate, fontSize: 13, fontWeight: '700' },
  link: { color: KlippColors.cobaltDark, fontSize: 12, fontWeight: '800' },
  warning: { flex: 1, color: KlippColors.warning, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  ok: { color: KlippColors.success, fontSize: 11, fontWeight: '700' },
  empty: { color: KlippColors.muted, fontSize: 14, paddingVertical: 8 },
  error: { color: KlippColors.danger, fontSize: 13 },
});
