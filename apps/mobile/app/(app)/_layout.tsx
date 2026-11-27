import { OfflineProvider } from '../../src/offline/provider';
import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <OfflineProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
    </Stack>
    </OfflineProvider>
  );
}
