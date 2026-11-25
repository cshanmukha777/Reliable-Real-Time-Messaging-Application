import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import {
  FoundationProvider,
  styles,
  usePalette,
  type Foundation,
} from '../src/foundation';
import { openPreferences } from '../src/preferences';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const palette = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: palette.foreground }]}
      >
        ChatApp couldn’t open
      </Text>
      <Text style={[styles.text, { color: palette.muted }]}>
        Check your local storage and build configuration, then try again.
      </Text>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const [state, setState] = useState<Omit<
    Foundation,
    'updateConfiguration'
  > | null>(null);
  const [failed, setFailed] = useState(false);
  const palette = usePalette(state?.configuration.appearance);

  useEffect(() => {
    let active = true;
    openPreferences().then(
      (preferences) => {
        if (active) setState(preferences);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (failed) throw new Error('Application initialization failed.');
  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator
          accessibilityLabel="Opening local storage"
          color={palette.accent}
        />
        <Text style={{ color: palette.foreground }}>Opening ChatApp…</Text>
      </View>
    );
  }

  return (
    <FoundationProvider
      value={{
        ...state,
        updateConfiguration: (update) =>
          setState(
            (current) =>
              current && {
                ...current,
                configuration: { ...current.configuration, ...update },
                ignoredStoredBackend: update.apiBaseUrl
                  ? false
                  : current.ignoredStoredBackend,
              },
          ),
      }}
    >
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          contentStyle: { backgroundColor: palette.background },
          headerTintColor: palette.foreground,
          statusBarStyle: palette.dark ? 'light' : 'dark',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'ChatApp' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </FoundationProvider>
  );
}
