import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { styles, useFoundation, usePalette } from '../src/foundation';

export default function Home() {
  const { configuration, ignoredStoredBackend } = useFoundation();
  const palette = usePalette(configuration.appearance);

  return (
    <View style={styles.content}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: palette.foreground }]}
      >
        ChatApp
      </Text>
      <Text style={[styles.text, { color: palette.muted }]}>
        Choose a backend and verify your connection in Settings.
      </Text>
      {ignoredStoredBackend && (
        <Text
          accessibilityRole="alert"
          style={[styles.text, { color: palette.foreground }]}
        >
          The saved server is incompatible with this build. Review the default
          server in Settings.
        </Text>
      )}
      <Link
        href="/settings"
        style={[styles.button, styles.label, { color: palette.accent }]}
      >
        Open settings
      </Link>
    </View>
  );
}
