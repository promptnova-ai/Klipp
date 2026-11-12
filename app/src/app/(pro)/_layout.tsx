import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { NotificationTabIcon } from '@/components/notification-tab-icon';
import { KlippColors, RoleThemes } from '@/lib/brand';

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: RoleThemes.pro.accent,
          tabBarInactiveTintColor: KlippColors.muted,
          tabBarStyle: { height: 82, paddingTop: 11, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 0, elevation: 0, shadowColor: '#171B2D', shadowOpacity: 0.075, shadowOffset: { width: 0, height: -8 }, shadowRadius: 24 },
          sceneStyle: { backgroundColor: RoleThemes.pro.canvas },
          animation: 'shift',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.15, marginTop: 4 },
          tabBarItemStyle: { paddingVertical: 3 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Solicitudes', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'tray.full.fill', android: 'inbox', web: 'inbox' }} tintColor={String(color)} size={20} /> }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={String(color)} size={20} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <NotificationTabIcon color={String(color)} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Mi perfil', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={String(color)} size={20} /> }} />
      </Tabs>
    </RoleGuard>
  );
}
