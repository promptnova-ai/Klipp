import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { useAuth } from '@/components/auth-provider';
import { supabase } from '../../lib/supabase';

export function NotificationTabIcon({ color }: { color: string }) {
  const { session } = useAuth();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    if (!session?.user.id) {
      setUnread(0);
      return;
    }
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('show_in_app', true)
      .is('read_at', null);
    if (!error) setUnread(count ?? 0);
  }, [session?.user.id]);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`notification-tab-badge:${session.user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, () => { void loadUnread(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, loadUnread]);

  return (
    <View style={styles.container}>
      <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={color} size={20} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -7, right: -9, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E11D48', borderWidth: 1, borderColor: '#FFFFFF' },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});
