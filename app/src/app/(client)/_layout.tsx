import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { RoleGuard } from '@/components/role-guard';
import { KlippTabBar, type KlippTabItem } from '@/components/klipp-tab-bar';

const clientTabs = [
  { name: 'home', href: '/(client)', label: 'Inicio', icon: { ios: 'house.fill', android: 'home', web: 'home' } },
  { name: 'bookings', href: '/(client)/bookings', label: 'Reservas', icon: { ios: 'calendar', android: 'event_note', web: 'event_note' } },
  { name: 'notifications', href: '/(client)/notifications', label: 'Avisos', icon: { ios: 'bell', android: 'notifications', web: 'notifications' } },
  { name: 'account', href: '/(client)/account', label: 'Cuenta', icon: { ios: 'person.crop.circle', android: 'person', web: 'person' } },
  { name: 'addresses', href: '/(client)/addresses', label: 'Direcciones', icon: { ios: 'mappin.and.ellipse', android: 'place', web: 'place' } },
  { name: 'new-booking', href: '/(client)/new-booking', label: 'Reservar un servicio', icon: { ios: 'plus', android: 'add', web: 'add' } },
  { name: 'tracking', href: '/(client)/tracking', label: 'Seguimiento', icon: { ios: 'location', android: 'location_on', web: 'location_on' } },
] satisfies KlippTabItem[];

export default function ClientLayout() {
  return (
    <RoleGuard role="client">
      <Tabs>
        <TabList style={{ display: 'none' }}>
          {clientTabs.map((item) => <TabTrigger key={item.name} name={item.name} href={item.href} />)}
        </TabList>
        <TabSlot detachInactiveScreens={false} />
        <KlippTabBar items={clientTabs} actionName="new-booking" actionLabel="Reservar un servicio" />
      </Tabs>
    </RoleGuard>
  );
}
