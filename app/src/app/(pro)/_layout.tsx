import { Tabs } from 'expo-router';

import { RoleGuard } from '@/components/role-guard';

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#16766c',
          tabBarInactiveTintColor: '#68756f',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e2e9e5' },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Solicitudes' }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
        <Tabs.Screen name="profile" options={{ title: 'Mi perfil' }} />
      </Tabs>
    </RoleGuard>
  );
}