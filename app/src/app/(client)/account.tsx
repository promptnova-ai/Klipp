import { ScreenEntrance } from '@/components/ui-primitives';
import { AccountPanel } from '@/components/account-panel';

export default function ClientAccountScreen() {
  return <ScreenEntrance style={{ flex: 1 }}><AccountPanel roleLabel="Cliente" /></ScreenEntrance>;
}