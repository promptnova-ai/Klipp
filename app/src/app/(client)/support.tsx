import { ScreenEntrance } from '@/components/ui-primitives';
import { ClientSupportScreen } from '@/components/client-support-screen';

export default function SupportRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><ClientSupportScreen /></ScreenEntrance>;
}
