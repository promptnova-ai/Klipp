import { ScreenEntrance } from '@/components/ui-primitives';
import { NotificationsScreen } from '@/components/notifications-screen';

export default function ClientNotificationsRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><NotificationsScreen /></ScreenEntrance>;
}
