import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { Person } from '@chatapp/contracts';
import { AppButton } from '../components/primitives';
import { TextField } from '../components/fields';
import { PeoplePicker } from './people-picker';
import { MessagingScreen, RequestError } from './screen';
import { requestMessage, useMessaging } from './use-api';
import { SendAttempt } from './draft';

export function NewConversationScreen() {
  const { api } = useMessaging();
  const [group, setGroup] = useState(false);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(new SendAttempt(randomUUID)).current;
  const active = useRef(false);

  async function create() {
    const first = selected[0];
    if (!first || active.current) return;
    active.current = true;
    setSaving(true);
    setError('');
    try {
      const ids = selected.map(({ id }) => id).sort();
      const row = group
        ? await api.group({
            title: title.trim(),
            userIds: ids,
            clientGroupId: pending.payload(title, ids).clientMessageId,
          })
        : await api.direct(first.id);
      router.replace({
        pathname: '/conversation/[id]',
        params: { id: row.id },
      });
    } catch (error) {
      setError(
        requestMessage(error, 'Couldn’t create the conversation. Try again.'),
      );
    } finally {
      active.current = false;
      setSaving(false);
    }
  }

  return (
    <MessagingScreen title={group ? 'New group' : 'New conversation'}>
      <AppButton
        label={group ? 'Start a direct conversation' : 'Create a group instead'}
        kind="quiet"
        disabled={saving}
        onPress={() => {
          setGroup(!group);
          setSelected([]);
          setError('');
        }}
      />
      {group && (
        <TextField
          label="Group name"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          editable={!saving}
        />
      )}
      <PeoplePicker
        api={api}
        selected={selected}
        disabled={saving}
        onSelect={(person) => {
          setSelected((current) =>
            current.some(({ id }) => id === person.id)
              ? current.filter(({ id }) => id !== person.id)
              : group
                ? current.length < 31
                  ? [...current, person]
                  : current
                : [person],
          );
        }}
      />
      {error && <RequestError message={error} />}
      <AppButton
        label={group ? 'Create group' : 'Open conversation'}
        disabled={!selected.length || (group && !title.trim())}
        loading={saving}
        onPress={() => void create()}
      />
    </MessagingScreen>
  );
}
