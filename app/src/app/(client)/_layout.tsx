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
          tabBarStyle: { height: 76, paddingTop: 9, paddingBottom: 10, backgroundColor: '#18181B', borderTopWidth: 1, borderTopColor: KlippColors.border, elevation: 0, shadowColor: KlippColors.navy, shadowOpacity: 0.055, shadowOffset: { width: 0, height: -5 }, shadowRadius: 18 },
          sceneStyle: { backgroundColor: RoleThemes.client.canvas },
          animation: 'fade',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
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