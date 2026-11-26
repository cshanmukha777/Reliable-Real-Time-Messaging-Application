import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { displayNameSchema } from '@chatapp/contracts';
import { Avatar } from '../../src/chat/avatar';
import { TextField } from '../../src/components/fields';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  Divider,
  IconButton,
  SectionHeader,
} from '../../src/components/primitives';
import { useSession } from '../../src/auth/session-provider';
import { space } from '../../src/design/tokens';

export default function Profile() {
  const { manager, state } = useSession();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const operation = useRef(false);
  if (state.phase !== 'authenticated') return null;
  const { user } = state;
  const name = displayNameSchema.safeParse(draft);

  async function save() {
    if (!name.success || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await manager.updateProfile({ displayName: name.data });
      setEditing(false);
      setNotice({ text: 'Profile saved.', failed: false });
    } catch {
      setNotice({
        text: 'Couldn’t save your profile. Try again.',
        failed: true,
      });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function signOut(all: boolean) {
    if (operation.current) return;
    Alert.alert(all ? 'Sign out on every device?' : 'Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          operation.current = true;
          setBusy(true);
          void manager
            .signOut(all)
            .catch(() =>
              setNotice({
                text: 'Couldn’t complete sign-out. Try again.',
                failed: true,
              }),
            )
            .finally(() => {
              operation.current = false;
              setBusy(false);
            });
        },
      },
    ]);
  }

  return (
    <AppScreen scroll>
      <AppHeader
        title={editing ? 'Edit profile' : 'Profile'}
        leading={
          <IconButton
            label="Back to conversations"
            icon="ArrowLeft"
            onPress={() => router.replace('/')}
            disabled={busy}
          />
        }
      />
      <Divider />
      <View style={styles.content}>
        <View style={styles.identity}>
          <Avatar
            person={{ name: user.displayName, tint: 'avatarFern' }}
            size={72}
          />
          <AppText variant="heading">{user.displayName}</AppText>
          <AppText tone="secondary" selectable>
            {user.email}
          </AppText>
        </View>
        {editing ? (
          <>
            <TextField
              label="Display name"
              value={draft}
              onChangeText={setDraft}
              editable={!busy}
              autoComplete="name"
              maxLength={60}
              {...(!name.success && { error: 'Enter a display name.' })}
            />
            <AppButton
              label="Save profile"
              disabled={!name.success}
              loading={busy}
              onPress={save}
            />
            <AppButton
              kind="quiet"
              label="Cancel editing"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
          </>
        ) : (
          <AppButton
            kind="secondary"
            label="Edit profile"
            disabled={busy}
            onPress={() => {
              setNotice(null);
              setDraft(user.displayName);
              setEditing(true);
            }}
          />
        )}
        {notice && (
          <AppText
            tone={notice.failed ? 'error' : 'accent'}
            accessibilityLiveRegion="polite"
          >
            {notice.text}
          </AppText>
        )}
        <Divider />
        <SectionHeader title="Account" />
        <AppText variant="secondary" tone="muted">
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </AppText>
        <AppButton
          kind="quiet"
          label="Sign out"
          disabled={busy}
          onPress={() => signOut(false)}
        />
        <AppButton
          kind="quiet"
          label="Sign out on all devices"
          disabled={busy}
          onPress={() => signOut(true)}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.gutter, gap: space.md },
  identity: { alignItems: 'center', paddingVertical: space.md, gap: space.xs },
});
