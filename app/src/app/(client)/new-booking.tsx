import { ScreenEntrance } from '@/components/ui-primitives';
import { NewBookingScreen } from '@/components/new-booking-screen';

export default function NewBookingRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><NewBookingScreen /></ScreenEntrance>;
}