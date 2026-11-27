import { useCallback, useState, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import type { Conversation, Member, Person } from '@chatapp/contracts';
import { AppButton, AppText, Divider } from '../components/primitives';
import { LoadingState } from '../components/feedback';
import { Avatar } from '../chat/avatar';
import { space } from '../design/tokens';
import { avatar } from './view-model';
import { PeoplePicker } from './people-picker';
import { MessagingScreen, RequestError } from './screen';
import { requestMessage, useMessaging } from './use-api';

type ManagedRole = 'ADMIN' | 'MEMBER' | null;

export function MembersScreen({ id }: { id: string }) {
  const { api } = useMessaging();
  const [row, setRow] = useState<Conversation | null>(null);
  const [selected, setSelected] = useState<Person[]>([]);
  const [waiting, setWaiting] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const run = ++epoch.current;
    setWaiting(true);
    setError('');
    try {
      const result = await api.details(id);
      if (epoch.current === run) setRow(result);
    } catch (error) {
      if (epoch.current === run) {
        setRow(null);
        setError(requestMessage(error, 'Couldn’t load members.'));
      }
    } finally {
      if (epoch.current === run) setWaiting(false);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
      };
    }, [load]),
  );

  async function change(person: Person, role: ManagedRole) {
    if (waiting || busy.current) return;
    busy.current = true;
    setWaiting(true);
    setError('');
    try {
      setRow(await api.member(id, person.id, role));
      setSelected([]);
      setAdding(false);
    } catch (error) {
      setError(requestMessage(error, 'Couldn’t update this member.'));
    } finally {
      busy.current = false;
      setWaiting(false);
    }
  }

  const manage =
    row?.kind === 'GROUP' && (row.role === 'OWNER' || row.role === 'ADMIN');
  function canChange(member: Member) {
    return (
      manage &&
      member.role !== 'OWNER' &&
      (row?.role === 'OWNER' || member.role === 'MEMBER')
    );
  }

  return (
    <MessagingScreen title={row?.title ?? 'Members'}>
      {waiting && !row && <LoadingState label="Loading members…" />}
      {!!error && <RequestError message={error} />}
      {!!error && !row && (
        <AppButton
          kind="secondary"
          label="Try again"
          onPress={() => void load()}
        />
      )}
      {row?.members.map((member) => (
        <View key={member.id} style={styles.member}>
          <View style={styles.line}>
            <Avatar person={avatar(member)} size={36} />
            <View style={styles.name}>
              <AppText>{member.displayName}</AppText>
              {row.kind === 'GROUP' && (
                <AppText variant="caption" tone="muted">
                  {
                    {
                      OWNER: 'Owner',
                      ADMIN: 'Administrator',
                      MEMBER: 'Member',
                    }[member.role]
                  }
                </AppText>
              )}
            </View>
          </View>
          {canChange(member) && (
            <View style={styles.line}>
              {row.role === 'OWNER' && (
                <AppButton
                  kind="quiet"
                  disabled={waiting}
                  label={member.role === 'ADMIN' ? 'Make member' : 'Make admin'}
                  onPress={() =>
                    void change(
                      member,
                      member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                    )
                  }
                />
              )}
              <AppButton
                label="Remove"
                kind="quiet"
                disabled={waiting}
                onPress={() =>
                  Alert.alert(
                    'Remove member?',
                    `${member.displayName} will lose access to this conversation.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => void change(member, null),
                      },
                    ],
                  )
                }
              />
            </View>
          )}
          <Divider />
        </View>
      ))}
      {manage && (
        <>
          <AppButton
            kind="secondary"
            label={adding ? 'Cancel adding member' : 'Add member'}
            disabled={waiting}
            onPress={() => {
              setSelected([]);
              setAdding(!adding);
            }}
          />
          {adding && (
            <>
              <PeoplePicker
                api={api}
                selected={selected}
                disabled={waiting}
                exclude={row.members.map(({ id }) => id)}
                onSelect={(person) =>
                  setSelected(selected[0]?.id === person.id ? [] : [person])
                }
              />
              <AppButton
                label="Add to group"
                loading={waiting}
                disabled={!selected.length}
                onPress={() => {
                  const target = selected[0];
                  if (target) void change(target, 'MEMBER');
                }}
              />
            </>
          )}
        </>
      )}
    </MessagingScreen>
  );
}

const styles = StyleSheet.create({
  member: { gap: space.xs },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  name: { flex: 1 },
});
