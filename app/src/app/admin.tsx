import { ScreenEntrance } from '@/components/ui-primitives';
import { AdminScreen } from '@/components/admin-screen';

export default function AdminRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><AdminScreen /></ScreenEntrance>;
}
