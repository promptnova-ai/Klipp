import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { KlippColors, RoleThemes } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import {
  isPushDeviceRegisteredAsync,
  registerPushDeviceAsync,
  unregisterPushDeviceAsync,
} from '@/lib/push-notifications';

type EventPreference = { in_app_enabled: boolean; push_enabled: boolean };
type PreferenceMap = Record<'booking_updates' | 'chat_messages' | 'reminders', EventPreference>;
type PreferenceChannel = keyof EventPreference;
type PushStatus = 'checking' | 'registered' | 'not_registered' | 'unknown';

type AppNotification = {
  id: string;
  user_id: string;
  booking_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const defaultPreferences: PreferenceMap = {
  booking_updates: { in_app_enabled: true, push_enabled: true },
  chat_messages: { in_app_enabled: true, push_enabled: true },
  reminders: { in_app_enabled: true, push_enabled: true },
};

const preferenceOptions = [
  {
    eventType: 'booking_updates',
    title: 'Reservas y servicios',
    description: 'Nuevas solicitudes, cambios de estado y confirmaciones.',
  },
  {
    eventType: 'chat_messages',
    title: 'Mensajes',
    description: 'Avisos cuando recibes un mensaje relacionado con un servicio.',
  },
  {
    eventType: 'reminders',
    title: 'Recordatorios',
    description: 'Avisos antes de una reserva programada.',
  },
] as const;

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return 'Ahora';
  if (elapsed < 60 * 60_000) return 'Hace ' + Math.floor(elapsed / 60_000) + ' min';
  if (elapsed < 24 * 60 * 60_000) return 'Hace ' + Math.floor(elapsed / (60 * 60_000)) + ' h';
  return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

function notificationIcon(type: string) {
  if (type === 'chat_message') {
    return { ios: 'message.fill', android: 'chat', web: 'chat' };
  }
  if (type === 'booking_request' || type === 'booking_reassignment_request') {
    return { ios: 'calendar.badge.clock', android: 'event', web: 'event' };
  }
  if (type.includes('payment')) {
    return { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' };
  }
  return { ios: 'bell.fill', android: 'notifications', web: 'notifications' };
}

export function NotificationsScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const isPro = profile?.role === 'pro';
  const roleTheme = isPro ? RoleThemes.pro : RoleThemes.client;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<PreferenceMap>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState<Record<string, boolean>>({});
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>(Platform.OS === 'web' ? 'unknown' : 'checking');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id, user_id, booking_id, type, title, body, data, read_at, created_at')
      .eq('user_id', userId)
      .eq('show_in_app', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (queryError) setError(queryError.message);
    else {
      setItems((data ?? []) as AppNotification[]);
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  const loadPreferences = useCallback(async () => {
    if (!userId) return;
    const { data, error: preferenceError } = await supabase
      .from('notification_preferences')
      .select('event_type, in_app_enabled, push_enabled')
      .eq('user_id', userId);
    if (preferenceError) {
      setError(preferenceError.message);
      return;
    }
    const next: PreferenceMap = {
      booking_updates: { ...defaultPreferences.booking_updates },
      chat_messages: { ...defaultPreferences.chat_messages },
      reminders: { ...defaultPreferences.reminders },
    };
    for (const row of data ?? []) {
      if (row.event_type === 'booking_updates' || row.event_type === 'chat_messages' || row.event_type === 'reminders') {
        next[row.event_type as keyof PreferenceMap] = {
          in_app_enabled: row.in_app_enabled,
          push_enabled: row.push_enabled,
        };
      }
    }
    setPreferences(next);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadNotifications();
      return undefined;
    });
    return () => { active = false; };
  }, [loadNotifications]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadPreferences();
      return undefined;
    });
    return () => { active = false; };
  }, [loadPreferences]);

  useEffect(() => {
    let active = true;
    if (!userId || Platform.OS === 'web') {
      void Promise.resolve().then(() => {
        if (active) setPushStatus('unknown');
      });
      return () => { active = false; };
    }
    void Promise.resolve().then(() => {
      if (active) setPushStatus('checking');
      return isPushDeviceRegisteredAsync(userId);
    })
      .then((registered) => {
        if (active) setPushStatus(registered ? 'registered' : 'not_registered');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setPushStatus('unknown');
        setError(cause instanceof Error ? cause.message : 'No pudimos comprobar el registro de este dispositivo.');
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('notifications-inbox:' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + userId,
      }, () => { void loadNotifications(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, loadNotifications]);

  const unreadCount = items.filter((item) => !item.read_at).length;

  async function updatePreference(eventType: keyof PreferenceMap, channel: PreferenceChannel, enabled: boolean) {
    if (!userId) return;
    const lockKey = eventType + ':' + channel;
    if (savingPreferences[lockKey]) return;

    const previous = preferences[eventType];
    const next = { ...previous, [channel]: enabled };
    setSavingPreferences((current) => ({ ...current, [lockKey]: true }));
    setError(null);
    setNotice(null);
    setPreferences((current) => ({ ...current, [eventType]: next }));
    try {
      const { error: updateError } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          event_type: eventType,
          in_app_enabled: next.in_app_enabled,
          push_enabled: next.push_enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,event_type' });
      if (updateError) {
        setPreferences((current) => ({ ...current, [eventType]: previous }));
        setError(updateError.message);
      } else {
        setNotice('Preferencias guardadas.');
      }
    } catch (cause) {
      setPreferences((current) => ({ ...current, [eventType]: previous }));
      setError(cause instanceof Error ? cause.message : 'No pudimos guardar tus preferencias.');
    } finally {
      setSavingPreferences((current) => ({ ...current, [lockKey]: false }));
    }
  }

  async function registerPushDevice() {
    if (!userId) return;
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await registerPushDeviceAsync(userId);
      setPushStatus(token ? 'registered' : 'not_registered');
      if (token) setNotice('Este dispositivo ya puede recibir notificaciones push.');
    } catch (cause) {
      setPushStatus('unknown');
      setError(cause instanceof Error ? cause.message : 'No pudimos activar las notificaciones push.');
    } finally {
      setPushBusy(false);
    }
  }

  async function unregisterCurrentDevice() {
    if (!userId) return;
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      await unregisterPushDeviceAsync(userId);
      setPushStatus('not_registered');
      setNotice('Las notificaciones push se han desactivado en este dispositivo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos desactivar las notificaciones de este dispositivo.');
    } finally {
      setPushBusy(false);
    }
  }

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    const previous = items;
    const timestamp = new Date().toISOString();
    setBusy(true);
    setError(null);
    setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: timestamp }));
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read_at: timestamp })
        .eq('user_id', userId)
        .is('read_at', null);
      if (updateError) {
        setItems(previous);
        setError(updateError.message);
      }
    } catch (cause) {
      setItems(previous);
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tus notificaciones.');
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(item: AppNotification) {
    if (openingId) return;
    setOpeningId(item.id);
    setError(null);
    if (!item.read_at && userId) {
      const timestamp = new Date().toISOString();
      const previous = items;
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: timestamp } : row));
      try {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ read_at: timestamp })
          .eq('id', item.id)
          .eq('user_id', userId);
        if (updateError) {
          setItems(previous);
          setError(updateError.message);
        }
      } catch (cause) {
        setItems(previous);
        setError(cause instanceof Error ? cause.message : 'No pudimos marcar el aviso como leído.');
      }
    }

    if (isPro) {
      if (item.type === 'booking_request' || item.type === 'booking_reassignment_request') {
        router.push('/(pro)');
      } else if (item.booking_id) {
        router.push({ pathname: '/(pro)/agenda', params: { bookingId: item.booking_id } });
      } else {
        router.push('/(pro)/agenda');
      }
    } else if (item.type === 'chat_message' && item.booking_id) {
      router.push({ pathname: '/(client)/bookings', params: { bookingId: item.booking_id } });
    } else if (item.booking_id) {
      router.push({ pathname: '/(client)/tracking', params: { bookingId: item.booking_id } });
    } else {
      router.push('/(client)/bookings');
    }
    setOpeningId(null);
  }

  const pushStatusText = pushStatus === 'checking'
    ? 'Comprobando este dispositivo…'
    : pushStatus === 'registered'
      ? 'Este dispositivo está registrado para recibir avisos.'
      : pushStatus === 'not_registered'
        ? 'Este dispositivo todavía no está registrado.'
        : 'No hemos podido comprobar el estado de este dispositivo.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: roleTheme.accentStrong }]}>TU ESPACIO · KLIPP</Text>
            <Text style={styles.title}>Notificaciones</Text>
            <Text style={styles.subtitle}>
              {unreadCount > 0 ? unreadCount + (unreadCount === 1 ? ' aviso sin leer' : ' avisos sin leer') : 'Todo está al día'}
            </Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: roleTheme.accentSoft }]}>
            <SymbolView name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }} tintColor={roleTheme.accentStrong} size={25} />
          </View>
        </View>

        {unreadCount > 0 && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void markAllRead()}
            style={({ pressed }) => [styles.markAllButton, { backgroundColor: roleTheme.accentSoft }, (busy || pressed) && styles.pressed]}>
            {busy ? <ActivityIndicator color={roleTheme.accentStrong} size="small" /> : null}
            <Text style={[styles.markAllText, { color: roleTheme.accentStrong }]}>{busy ? 'Actualizando…' : 'Marcar todas como leídas'}</Text>
          </Pressable>
        )}

        <View style={styles.preferencesCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Tus preferencias</Text>
              <Text style={styles.preferencesHint}>Decide qué avisos quieres recibir y por qué canal.</Text>
            </View>
            <View style={[styles.sectionIcon, { backgroundColor: roleTheme.accentSoft }]}>
              <SymbolView name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} tintColor={roleTheme.accentStrong} size={19} />
            </View>
          </View>
          {preferenceOptions.map(({ eventType, title, description }) => {
            const inAppKey = eventType + ':in_app_enabled';
            const pushKey = eventType + ':push_enabled';
            const rowSaving = Boolean(savingPreferences[inAppKey] || savingPreferences[pushKey]);
            return (
              <View key={eventType} style={styles.preferenceRow}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceLabel}>{title}</Text>
                  <Text style={styles.preferenceDescription}>{description}</Text>
                </View>
                <View style={styles.preferenceControls}>
                  <View style={styles.preferenceChannel}>
                    <View style={styles.preferenceChannelCopy}>
                      <Text style={styles.preferenceChannelLabel}>En la app</Text>
                      <Switch
                        accessibilityLabel={title + ': avisos en la app'}
                        disabled={rowSaving}
                        value={preferences[eventType].in_app_enabled}
                        onValueChange={(value) => void updatePreference(eventType, 'in_app_enabled', value)}
                        trackColor={{ true: roleTheme.accent }}
                      />
                    </View>
                  </View>
                  <View style={styles.preferenceChannel}>
                    <View style={styles.preferenceChannelCopy}>
                      <Text style={styles.preferenceChannelLabel}>Push</Text>
                      <Switch
                        accessibilityLabel={title + ': avisos push'}
                        disabled={rowSaving || Platform.OS === 'web'}
                        value={preferences[eventType].push_enabled}
                        onValueChange={(value) => void updatePreference(eventType, 'push_enabled', value)}
                        trackColor={{ true: roleTheme.accent }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
          {Platform.OS === 'web' && (
            <Text style={styles.webPushHint}>Los avisos push se pueden activar desde la aplicación instalada en iOS o Android. En esta web seguirás viendo los avisos dentro de Klipp.</Text>
          )}
        </View>

        {Platform.OS !== 'web' && (
          <View style={styles.pushCard}>
            <View style={styles.pushHeader}>
              <View style={[styles.pushIcon, { backgroundColor: roleTheme.accentSoft }]}>
                <SymbolView name={{ ios: 'iphone.gen3.radiowaves.left.and.right', android: 'smartphone', web: 'smartphone' }} tintColor={roleTheme.accentStrong} size={21} />
              </View>
              <View style={styles.pushCopy}>
                <Text style={styles.preferencesTitle}>Este dispositivo</Text>
                <Text style={styles.preferencesHint}>{pushStatusText}</Text>
              </View>
              {pushStatus === 'registered' && (
                <View style={[styles.deviceStatus, { backgroundColor: roleTheme.accentSoft }]}>
                  <Text style={[styles.deviceStatusText, { color: roleTheme.accentStrong }]}>ACTIVO</Text>
                </View>
              )}
            </View>
            <View style={styles.pushActions}>
              <Pressable
                accessibilityRole="button"
                disabled={pushBusy || pushStatus === 'checking'}
                onPress={() => void registerPushDevice()}
                style={({ pressed }) => [
                  styles.pushButton,
                  { backgroundColor: roleTheme.accentStrong },
                  (pushBusy || pushStatus === 'checking' || pressed) && styles.pressed,
                ]}>
                {pushBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                <Text style={styles.pushButtonText}>
                  {pushBusy ? 'Guardando…' : pushStatus === 'registered' ? 'Actualizar registro' : 'Activar notificaciones'}
                </Text>
              </Pressable>
              {pushStatus === 'registered' && (
                <Pressable
                  accessibilityRole="button"
                  disabled={pushBusy}
                  onPress={() => void unregisterCurrentDevice()}
                  style={({ pressed }) => [styles.removePushButton, pressed && styles.pressed]}>
                  <Text style={styles.removePushText}>Desactivar en este dispositivo</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {notice && <Text accessibilityRole="status" style={styles.notice}>{notice}</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        <View style={styles.listHeading}>
          <View style={styles.listHeadingCopy}>
            <Text style={styles.sectionTitle}>Actividad reciente</Text>
            <Text style={styles.preferencesHint}>Tus últimas actualizaciones y movimientos.</Text>
          </View>
          <Text style={styles.itemCount}>{items.length ? items.length + ' avisos' : ''}</Text>
        </View>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={roleTheme.accentStrong} />
            <Text style={styles.emptyText}>Cargando notificaciones…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: roleTheme.accentSoft }]}>
              <SymbolView name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }} tintColor={roleTheme.accentStrong} size={28} />
            </View>
            <Text style={styles.emptyTitle}>Todavía no tienes avisos</Text>
            <Text style={styles.emptyText}>Aquí aparecerán las novedades de tus reservas, los mensajes y los recordatorios.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                disabled={openingId !== null}
                onPress={() => void openNotification(item)}
                style={({ pressed }) => [
                  styles.notification,
                  !item.read_at && [styles.unreadNotification, { borderColor: roleTheme.accent, backgroundColor: roleTheme.accentSoft }],
                  (pressed || openingId === item.id) && styles.pressed,
                ]}>
                <View style={[styles.itemIcon, { backgroundColor: roleTheme.accentSoft }]}>
                  <SymbolView name={notificationIcon(item.type)} tintColor={roleTheme.accentStrong} size={19} />
                </View>
                <View style={styles.itemCopy}>
                  <View style={styles.itemHeading}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {!item.read_at && <View style={[styles.unreadDot, { backgroundColor: roleTheme.accent }]} />}
                  </View>
                  <Text style={styles.itemBody}>{item.body}</Text>
                  <Text style={styles.itemDate}>{relativeDate(item.created_at)}</Text>
                </View>
                {openingId === item.id
                  ? <ActivityIndicator color={roleTheme.accentStrong} size="small" />
                  : <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={KlippColors.muted} size={15} />}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: KlippColors.canvas },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 42, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 16 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: KlippColors.muted, fontSize: 13, lineHeight: 19 },
  headerIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  markAllButton: { minHeight: 38, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12 },
  markAllText: { fontSize: 12, fontWeight: '800' },
  preferencesCard: { padding: 21, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border, gap: 15, shadowColor: KlippColors.navy, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 3 },
  sectionCopy: { flex: 1, gap: 5 },
  sectionTitle: { color: KlippColors.navy, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: -0.25 },
  sectionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  preferencesTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '900' },
  preferencesHint: { color: KlippColors.muted, fontSize: 12, lineHeight: 18 },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 15, borderTopWidth: 1, borderTopColor: KlippColors.border },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceLabel: { color: KlippColors.navy, fontSize: 13, fontWeight: '900' },
  preferenceDescription: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  preferenceControls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  preferenceChannel: { minWidth: 88, alignItems: 'center' },
  preferenceChannelCopy: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  preferenceChannelLabel: { color: KlippColors.slate, fontSize: 11, fontWeight: '700' },
  webPushHint: { color: KlippColors.muted, fontSize: 11, lineHeight: 17, paddingTop: 10 },
  pushCard: { padding: 20, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border, gap: 15, shadowColor: KlippColors.navy, shadowOpacity: 0.035, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 },
  pushHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pushIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pushCopy: { flex: 1, gap: 4 },
  deviceStatus: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  deviceStatusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  pushActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  pushButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 14 },
  pushButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  removePushButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, backgroundColor: '#F8FAFC' },
  removePushText: { color: KlippColors.muted, fontSize: 11, fontWeight: '800' },
  notice: { padding: 12, borderWidth: 1, borderColor: '#B7E4D1', borderRadius: 13, backgroundColor: '#ECFDF5', color: '#067647', fontSize: 12, lineHeight: 18 },
  error: { padding: 12, borderWidth: 1, borderColor: '#FECACA', borderRadius: 13, backgroundColor: '#FEF2F2', color: KlippColors.danger, fontSize: 12, lineHeight: 18 },
  listHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 3 },
  listHeadingCopy: { flex: 1, gap: 4 },
  itemCount: { color: KlippColors.muted, fontSize: 10, fontWeight: '800' },
  list: { gap: 10 },
  notification: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border, shadowColor: KlippColors.navy, shadowOpacity: 0.025, shadowOffset: { width: 0, height: 5 }, shadowRadius: 14, elevation: 1 },
  unreadNotification: { borderWidth: 1.2 },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 4 },
  itemHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemTitle: { flex: 1, color: KlippColors.navy, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  itemBody: { color: KlippColors.slate, fontSize: 12, lineHeight: 18 },
  itemDate: { color: KlippColors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  empty: { minHeight: 210, alignItems: 'center', justifyContent: 'center', paddingVertical: 38, paddingHorizontal: 24, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 22, backgroundColor: '#FFFFFF', gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '900' },
  emptyText: { maxWidth: 390, color: KlippColors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
