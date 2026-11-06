import { ScreenEntrance } from '@/components/ui-primitives';
import { ClientTrackingScreen } from '@/components/client-tracking-screen';

export default function TrackingRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><ClientTrackingScreen /></ScreenEntrance>;
}
