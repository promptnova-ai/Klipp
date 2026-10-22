import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#D49700',
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#E2E8F0' },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Solicitudes', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'tray.full.fill', android: 'inbox', web: 'inbox' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Mi perfil', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={color} size={20} /> }} />
      </Tabs>
    </RoleGuard>
  );
}