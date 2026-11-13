import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { RoleGuard } from '@/components/role-guard';
import { KlippTabBar, type KlippTabItem } from '@/components/klipp-tab-bar';

const primaryTabs = [
  { name: 'index', href: '/(client)', label: 'Inicio', icon: { ios: 'house.fill', android: 'home', web: 'home' } },
  { name: 'bookings', href: '/(client)/bookings', label: 'Reservas', icon: { ios: 'calendar', android: 'event_note', web: 'event_note' } },
  { name: 'notifications', href: '/(client)/notifications', label: 'Avisos', icon: { ios: 'bell', android: 'notifications', web: 'notifications' } },
  { name: 'account', href: '/(client)/account', label: 'Cuenta', icon: { ios: 'person.crop.circle', android: 'person', web: 'person' } },
] satisfies KlippTabItem[];

const workflowTabs = [
  { name: 'addresses', href: '/(client)/addresses' },
  { name: 'new-booking', href: '/(client)/new-booking' },
  { name: 'tracking', href: '/(client)/tracking' },
] as const;

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs>
        <TabList style={{ display: 'none' }}>
          {primaryTabs.map((item) => <TabTrigger key={item.name} name={item.name} href={item.href} />)}
          {workflowTabs.map((item) => <TabTrigger key={item.name} name={item.name} href={item.href} />)}
        </TabList>
        <TabSlot detachInactiveScreens={false} />
        <KlippTabBar items={primaryTabs} actionHref="/(client)/new-booking" actionLabel="Reservar un servicio" />
      </Tabs>
    </RoleGuard>
  );
}
