import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { NotificationTabIcon } from '@/components/notification-tab-icon';
import { KlippColors, RoleThemes } from '@/lib/brand';

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: RoleThemes.client.accent,
          tabBarInactiveTintColor: KlippColors.muted,
          tabBarStyle: { height: 82, paddingTop: 11, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 0, elevation: 0, shadowColor: '#171B2D', shadowOpacity: 0.075, shadowOffset: { width: 0, height: -8 }, shadowRadius: 24 },
          sceneStyle: { backgroundColor: RoleThemes.client.canvas },
          animation: 'shift',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.15, marginTop: 4 },
          tabBarItemStyle: { paddingVertical: 3 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={String(color)} size={20} /> }} />
        <Tabs.Screen name="addresses" options={{ title: 'Direcciones', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'place' }} tintColor={String(color)} size={20} /> }} />
        <Tabs.Screen name="bookings" options={{ title: 'Reservas', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={String(color)} size={20} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <NotificationTabIcon color={String(color)} /> }} />
        <Tabs.Screen name="new-booking" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="tracking" options={{ tabBarButton: () => null }} />
        <Tabs.Screen name="account" options={{ title: 'Mi cuenta', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={String(color)} size={20} /> }} />
      </Tabs>
    </RoleGuard>
  );
}
