import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { NotificationTabIcon } from '@/components/notification-tab-icon';
import { KlippTabBar } from '@/components/klipp-tab-bar';
import { KlippColors, RoleThemes } from '@/lib/brand';

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        tabBar={(props) => <KlippTabBar {...props} actionLabel="Ir a solicitudes de Klipp PRO" actionHref="/(pro)" />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: true,
          animation: 'none',
          tabBarActiveTintColor: RoleThemes.pro.accent,
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
          sceneStyle: { backgroundColor: RoleThemes.pro.canvas },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.1, marginTop: 4 },
          tabBarItemStyle: { paddingVertical: 3 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Solicitudes', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'tray.full.fill', android: 'inbox', web: 'inbox' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={String(color)} size={21} /> }} />
        <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color }) => <NotificationTabIcon color={String(color)} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={String(color)} size={21} /> }} />
      </Tabs>
    </RoleGuard>
  );
}
