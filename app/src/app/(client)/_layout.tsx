import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#0052FF',
          tabBarInactiveTintColor: '#64748B',
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#E2E8F0' },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="addresses" options={{ title: 'Direcciones', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="bookings" options={{ title: 'Reservas', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={color} size={20} /> }} />
        <Tabs.Screen name="new-booking" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="tracking" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="account" options={{ title: 'Mi cuenta', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={color} size={20} /> }} />
      </Tabs>
    </RoleGuard>
  );
}