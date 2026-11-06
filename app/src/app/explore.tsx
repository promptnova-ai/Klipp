import { Redirect } from 'expo-router';

// Legacy Expo starter route. Klipp routes users through the role-aware home screen.
export default function ExploreRedirect() {
  return <Redirect href="/" />;
}
