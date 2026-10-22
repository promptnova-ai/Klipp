import { Tabs } from 'expo-router';

import { RoleGuard } from '@/components/role-guard';

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#16766c',
          tabBarInactiveTintColor: '#68756f',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e2e9e5' },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="addresses" options={{ title: 'Direcciones' }} />
        <Tabs.Screen name="bookings" options={{ title: 'Reservas' }} />
        <Tabs.Screen name="new-booking" options={{ href: null }} />
        <Tabs.Screen name="account" options={{ title: 'Mi cuenta' }} />
      </Tabs>
    </RoleGuard>
  );
}