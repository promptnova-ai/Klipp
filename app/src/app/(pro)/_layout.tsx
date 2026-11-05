import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { NotificationTabIcon } from '@/components/notification-tab-icon';
import { KlippColors } from '@/lib/brand';

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: KlippColors.violet,
          tabBarInactiveTintColor: KlippColors.muted,
          tabBarStyle: {
            backgroundColor: KlippColors.white,
            borderTopColor: KlippColors.border,
            borderTopWidth: 1,
            height: 70,
            paddingTop: 8,
            paddingBottom: 8,
            elevation: 12,
            shadowColor: KlippColors.navy,
            shadowOpacity: 0.07,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -5 },
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
          tabBarItemStyle: { paddingVertical: 1 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Solicitudes', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'tray.full.fill', android: 'inbox', web: 'inbox' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <NotificationTabIcon color={String(color)} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Mi perfil', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={String(color)} size={21} /> }} />
      </Tabs>
    </RoleGuard>
  );
}
