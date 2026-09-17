import { Redirect } from 'expo-router';
import { useApp } from '@/store/AppProvider';

export default function Index() {
  const { ready, user } = useApp();
  if (!ready) return null;
  return <Redirect href={user ? '/(tabs)' : '/onboarding'} />;
}
