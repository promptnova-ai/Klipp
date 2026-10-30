import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { RoleGuard } from '@/components/role-guard';
import { RoleThemes } from '@/lib/brand';

const theme = RoleThemes.pro;

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: '#8792A5',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E3ECE8',
            borderTopWidth: 1,
            height: 76,
            paddingTop: 10,
            paddingBottom: 12,
            elevation: 12,
            shadowColor: '#173B34',
            shadowOpacity: 0.06,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -5 },
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 3 },
          tabBarItemStyle: { paddingVertical: 1 },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Oportunidades', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'tray.full.fill', android: 'inbox', web: 'inbox' }} tintColor={color} size={21} /> }} />
        <Tabs.Screen name="agenda" options={{ title: 'Mi agenda', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event_note', web: 'event_note' }} tintColor={color} size={21} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Mi negocio', tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={color} size={21} /> }} />
      </Tabs>
    </RoleGuard>
  );
}
