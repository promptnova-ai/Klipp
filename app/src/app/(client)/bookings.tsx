import { ScreenEntrance } from '@/components/ui-primitives';
import { ClientBookingsScreen } from '@/components/client-bookings-screen';

export default function BookingsRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><ClientBookingsScreen /></ScreenEntrance>;
}