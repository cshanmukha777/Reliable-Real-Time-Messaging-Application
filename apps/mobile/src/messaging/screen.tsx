import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppHeader, AppScreen, AppText, IconButton } from '../components/primitives';
import { space } from '../design/tokens';

export function BackButton() {
  return <IconButton icon="ArrowLeft" label="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />;
}

export function MessagingScreen({ title, children, trailing }: { title: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <AppScreen scroll>
      <AppHeader title={title} leading={<BackButton />} trailing={trailing} />
      <View style={styles.content}>{children}</View>
    </AppScreen>
  );
}

export function RequestError({ message }: { message: string }) {
  return <AppText variant="secondary" tone="error" accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</AppText>;
}

const styles = StyleSheet.create({ content: { padding: space.gutter, gap: space.md } });
