import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { KlippColors } from '@/lib/brand';
import { supabase } from '../../lib/supabase';
import { registerPushDeviceAsync } from '@/lib/push-notifications';

type EventPreference = { in_app_enabled: boolean; push_enabled: boolean };
type PreferenceMap = Record<'booking_updates' | 'chat_messages', EventPreference>;

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

function relativeDate(value: string) {
  const date = new Date(value);
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return 'Ahora';
  if (elapsed < 60 * 60_000) return `Hace ${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 24 * 60 * 60_000) return `Hace ${Math.floor(elapsed / (60 * 60_000))} h`;
  return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

export function NotificationsScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<PreferenceMap>({
    booking_updates: { in_app_enabled: true, push_enabled: true },
    chat_messages: { in_app_enabled: true, push_enabled: true },
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!session?.user.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id, user_id, booking_id, type, title, body, data, read_at, created_at')
      .eq('user_id', session.user.id)
      .eq('show_in_app', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (queryError) setError(queryError.message);
    else {
      setItems((data ?? []) as AppNotification[]);
      setError(null);
    }
    setLoading(false);
  }, [session?.user.id]);

  const loadPreferences = useCallback(async () => {
    if (!session?.user.id) return;
    const { data, error: preferenceError } = await supabase
      .from('notification_preferences')
      .select('event_type, in_app_enabled, push_enabled')
      .eq('user_id', session.user.id);
    if (preferenceError) {
      setError(preferenceError.message);
      return;
    }
    const next: PreferenceMap = {
      booking_updates: { in_app_enabled: true, push_enabled: true },
      chat_messages: { in_app_enabled: true, push_enabled: true },
    };
    for (const row of data ?? []) {
      if (row.event_type === 'booking_updates' || row.event_type === 'chat_messages') {
        next[row.event_type] = { in_app_enabled: row.in_app_enabled, push_enabled: row.push_enabled };
      }
    }
    setPreferences(next);
  }, [session?.user.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`notifications-inbox:${session.user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => { void loadNotifications(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, loadNotifications]);

  const unreadCount = items.filter((item) => !item.read_at).length;



  async function updatePreference(eventType: keyof PreferenceMap, channel: keyof EventPreference, enabled: boolean) {
    if (!session?.user.id) return;
    const previous = preferences[eventType];
    const next = { ...previous, [channel]: enabled };
    setPreferences((current) => ({ ...current, [eventType]: next }));
    const { error: updateError } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: session.user.id,
        event_type: eventType,
        in_app_enabled: next.in_app_enabled,
        push_enabled: next.push_enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,event_type' });
    if (updateError) {
      setPreferences((current) => ({ ...current, [eventType]: previous }));
      setError(updateError.message);
    }
  }

  async function registerPushDevice() {
    if (!session?.user.id) return;
    setPushBusy(true);
    setError(null);
    try {
      const token = await registerPushDeviceAsync(session.user.id);
      setPushRegistered(Boolean(token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos activar las notificaciones push.');
    } finally {
      setPushBusy(false);
    }
  }

  async function markAllRead() {
    if (!session?.user.id || unreadCount === 0) return;
    setBusy(true);
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    if (updateError) setError(updateError.message);
    else await loadNotifications();
    setBusy(false);
  }

  async function openNotification(item: AppNotification) {
    if (!item.read_at) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('user_id', session?.user.id ?? '');
      if (updateError) setError(updateError.message);
      else setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }

    if (profile?.role === 'pro') {
      if (item.type === 'booking_request') router.push('/(pro)');
      else router.push('/(pro)/agenda');
      return;
    }
    if (item.booking_id) {
      router.push({ pathname: '/tracking', params: { bookingId: item.booking_id } });
    } else {
      router.push('/(client)/bookings');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>KLIPP</Text>
            <Text style={styles.title}>Notificaciones</Text>
            <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} sin leer` : 'Estás al día'}</Text>
          </View>
          <View style={styles.headerIcon}>
            <SymbolView name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }} tintColor={KlippColors.blue} size={25} />
          </View>
        </View>

        {unreadCount > 0 && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void markAllRead()} style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}>
            <Text style={styles.markAllText}>{busy ? 'Actualizando…' : 'Marcar todas como leídas'}</Text>
          </Pressable>
        )}

        <View style={styles.preferencesCard}>
          <Text style={styles.preferencesTitle}>Preferencias de avisos</Text>
          <Text style={styles.preferencesHint}>Elige cómo quieres recibir las actualizaciones de Klipp.</Text>
          {([
            ['booking_updates', 'Reservas y servicios'],
            ['chat_messages', 'Mensajes del chat'],
          ] as const).map(([eventType, label]) => (
            <View key={eventType} style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>{label}</Text>
              <View style={styles.preferenceChannel}>
                <Text style={styles.preferenceChannelLabel}>En la app</Text>
                <Switch
                  value={preferences[eventType].in_app_enabled}
                  onValueChange={(value) => void updatePreference(eventType, 'in_app_enabled', value)}
                  trackColor={{ true: KlippColors.blue }}
                />
              </View>
              <View style={styles.preferenceChannel}>
                <Text style={styles.preferenceChannelLabel}>Push</Text>
                <Switch
                  value={preferences[eventType].push_enabled}
                  onValueChange={(value) => void updatePreference(eventType, 'push_enabled', value)}
                  trackColor={{ true: KlippColors.blue }}
                />
              </View>
            </View>
          ))}
        </View>

        {Platform.OS !== 'web' && (
          <View style={styles.pushCard}>
            <View style={styles.pushCopy}>
              <Text style={styles.preferencesTitle}>Notificaciones en tu dispositivo</Text>
              <Text style={styles.preferencesHint}>Activa los avisos push para recibir actualizaciones aunque Klipp esté cerrado.</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={pushBusy} onPress={() => void registerPushDevice()} style={({ pressed }) => [styles.pushButton, pressed && styles.pressed]}>
              <Text style={styles.pushButtonText}>{pushBusy ? 'Activando…' : pushRegistered ? 'Actualizar este dispositivo' : 'Activar notificaciones push'}</Text>
            </Pressable>
          </View>
        )}

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.empty}><ActivityIndicator color={KlippColors.blue} /><Text style={styles.emptyText}>Cargando notificaciones…</Text></View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><SymbolView name={{ ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }} tintColor={KlippColors.muted} size={28} /></View>
            <Text style={styles.emptyTitle}>Todavía no tienes avisos</Text>
            <Text style={styles.emptyText}>Aquí aparecerán las actualizaciones de tus reservas y mensajes de Klipp.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => void openNotification(item)} style={({ pressed }) => [styles.notification, !item.read_at && styles.unreadNotification, pressed && styles.pressed]}>
                <View style={styles.itemIcon}>
                  <SymbolView name={{ ios: item.type === 'chat_message' ? 'message.fill' : 'bell.fill', android: item.type === 'chat_message' ? 'chat' : 'notifications', web: item.type === 'chat_message' ? 'chat' : 'notifications' }} tintColor={KlippColors.blue} size={19} />
                </View>
                <View style={styles.itemCopy}>
                  <View style={styles.itemHeading}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {!item.read_at && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.itemBody}>{item.body}</Text>
                  <Text style={styles.itemDate}>{relativeDate(item.created_at)}</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={KlippColors.muted} size={15} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 36, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  headerCopy: { gap: 4 },
  eyebrow: { color: KlippColors.blue, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 27, fontWeight: '800' },
  subtitle: { color: KlippColors.muted, fontSize: 13 },
  headerIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  markAllButton: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#EAF2FF' },
  markAllText: { color: KlippColors.blueDark, fontSize: 12, fontWeight: '700' },
  preferencesCard: { padding: 15, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border, gap: 9 },
  pushCard: { padding: 15, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border, gap: 12 },
  pushCopy: { gap: 4 },
  pushButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: KlippColors.blue, paddingHorizontal: 14 },
  pushButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  preferencesTitle: { color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  preferencesHint: { color: KlippColors.muted, fontSize: 11, lineHeight: 16 },
  preferenceRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: KlippColors.border, gap: 6 },
  preferenceLabel: { color: KlippColors.navy, fontSize: 13, fontWeight: '700' },
  preferenceChannel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preferenceChannelLabel: { color: KlippColors.slate, fontSize: 12 },
  list: { gap: 10 },
  notification: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: KlippColors.border },
  unreadNotification: { borderColor: '#BBD4FF', backgroundColor: '#F5F9FF' },
  itemIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 4 },
  itemHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemTitle: { flex: 1, color: KlippColors.navy, fontSize: 14, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: KlippColors.blue },
  itemBody: { color: KlippColors.slate, fontSize: 12, lineHeight: 18 },
  itemDate: { color: KlippColors.muted, fontSize: 10, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 58, paddingHorizontal: 24, borderRadius: 18, backgroundColor: '#FFFFFF', gap: 10 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: KlippColors.navy, fontSize: 16, fontWeight: '800' },
  emptyText: { color: KlippColors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: { color: '#B91C1C', fontSize: 12 },
  pressed: { opacity: 0.8 },
});
