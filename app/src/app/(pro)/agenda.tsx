import { ScreenEntrance } from '@/components/ui-primitives';
import { ProAgendaScreen } from '@/components/pro-agenda-screen';

export default function ProAgendaRoute() {
  return <ScreenEntrance style={{ flex: 1 }}><ProAgendaScreen /></ScreenEntrance>;
}