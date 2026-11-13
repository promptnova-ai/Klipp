import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { NotificationTabIcon } from '@/components/notification-tab-icon';
import { KlippTabBar } from '@/components/klipp-tab-bar';
import { KlippColors, RoleThemes } from '@/lib/brand';

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs
        tabBar={(props) => <KlippTabBar {...props} actionLabel="Reservar un servicio" actionHref="/(client)/new-booking" />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: true,
          animation: 'none',
          tabBarActiveTintColor: RoleThemes.client.accent,
          tabBarInactiveTintColor: KlippColors.muted,
          tabBarStyle: {
            height: 84,
            paddingTop: 10,
            paddingBottom: 12,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#EEECE6',
            elevation: 0,
            shadowColor: '#171B2D',
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: -5 },
            shadowRadius: 16,
          },
          sceneStyle: { backgroundColor: RoleThemes.client.canvas },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.1, marginTop: 4 },
          tabBarItemStyle: { paddingVertical: 3 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="bookings" options={{ title: 'Reservas', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <NotificationTabIcon color={String(color)} /> }} />
        <Tabs.Screen name="account" options={{ title: 'Cuenta', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="addresses" options={{ href: null }} />
        <Tabs.Screen name="new-booking" options={{ href: null }} />
        <Tabs.Screen name="tracking" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
