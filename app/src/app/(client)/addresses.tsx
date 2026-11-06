import { ScreenEntrance } from '@/components/ui-primitives';
import { ClientAddressesScreen } from '@/components/client-addresses-screen';

export default function AddressesRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><ClientAddressesScreen /></ScreenEntrance>;
}