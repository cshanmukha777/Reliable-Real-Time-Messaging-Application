/* eslint-disable @typescript-eslint/no-require-imports -- Metro drops this fixture branch from release bundles. */
import { useEffect, useState } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppScreen, AppText } from '../src/components/primitives';
import { ErrorState, LoadingState } from '../src/components/feedback';
import { ThemeProvider, useReducedMotion, useTheme } from '../src/design/theme';
import { FoundationProvider, type Foundation } from '../src/foundation';
import { openPreferences } from '../src/preferences';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppScreen>
          <ErrorState
            title="ChatApp couldn’t open"
            detail="Check your local storage and build configuration, then try again."
            onRetry={retry}
          />
        </AppScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function NativeRoutes() {
  const { colors, isDark } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        statusBarStyle: isDark ? 'light' : 'dark',
        animation: reduced ? 'none' : 'fade',
      }}
    />
  );
}

function NativeFoundation() {
  const [state, setState] = useState<Omit<
    Foundation,
    'updateConfiguration'
  > | null>(null);
  const [failed, setFailed] = useState(false);
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
  if (!state)
    return (
      <ThemeProvider>
        <AppScreen>
          <LoadingState />
        </AppScreen>
      </ThemeProvider>
    );
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
      <ThemeProvider appearance={state.configuration.appearance}>
        <NativeRoutes />
      </ThemeProvider>
    </FoundationProvider>
  );
}

export default function RootLayout() {
  if (process.env.EXPO_OS === 'web') {
    if (__DEV__ && process.env.EXPO_PUBLIC_DESIGN_PREVIEW === '1') {
      const { DesignPreview } =
        require('../src/previews/design-system/preview') as typeof import('../src/previews/design-system/preview');
      return (
        <SafeAreaProvider>
          <DesignPreview />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <AppScreen scroll>
            <AppText accessibilityRole="header" variant="heading">
              ChatApp for iOS and Android
            </AppText>
          </AppScreen>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <NativeFoundation />
    </SafeAreaProvider>
  );
}
