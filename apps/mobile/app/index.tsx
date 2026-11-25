import { router } from 'expo-router';
import { AppButton } from '../src/components/primitives';
import { InboxScreen } from '../src/chat/inbox';
import { useFoundation } from '../src/foundation';

export default function Home() {
  const { ignoredStoredBackend } = useFoundation();
  return (
    <InboxScreen
      conversations={[]}
      onOpen={() => undefined}
      onSettings={() => router.push('/settings')}
      {...(ignoredStoredBackend && {
        notice:
          'The saved server is incompatible with this build. Review the default server in Settings.',
      })}
      {...(__DEV__ && {
        previewLink: (
          <AppButton
            label="Open design preview"
            kind="secondary"
            icon="ArrowRight"
            onPress={() => router.push('/design-preview')}
          />
        ),
      })}
    />
  );
}
