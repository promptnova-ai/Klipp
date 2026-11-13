import { Tabs, TabSlot } from 'expo-router/ui';

import { RoleGuard } from '@/components/role-guard';
import { KlippTabBar } from '@/components/klipp-tab-bar';

const proTabs = [
  { name: 'requests', href: '/(pro)', label: 'Solicitudes', icon: { ios: 'tray.full.fill', android: 'inbox', web: 'inbox' } },
  { name: 'agenda', href: '/(pro)/agenda', label: 'Agenda', icon: { ios: 'calendar', android: 'event_note', web: 'event_note' } },
  { name: 'notifications', href: '/(pro)/notifications', label: 'Avisos', icon: { ios: 'bell', android: 'notifications', web: 'notifications' } },
  { name: 'profile', href: '/(pro)/profile', label: 'Perfil', icon: { ios: 'person.crop.circle', android: 'person', web: 'person' } },
];

export default function ProLayout() {
  return (
    <RoleGuard role="pro">
      <Tabs>
        <TabSlot detachInactiveScreens={false} />
        <KlippTabBar items={proTabs} actionName="requests" actionLabel="Ir a solicitudes de Klipp PRO" />
      </Tabs>
    </RoleGuard>
  );
}
