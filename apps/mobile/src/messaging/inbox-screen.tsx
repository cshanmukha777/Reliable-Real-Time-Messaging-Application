import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState, useRef } from 'react';
import type { Conversation } from '@chatapp/contracts';
import { InboxScreen } from '../chat/inbox';
import { AppButton } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/feedback';
import { useSession } from '../auth/session-provider';
import { useFoundation } from '../foundation';
import { avatar, inboxRow } from './view-model';
import { mergeMessages } from './draft';
import { requestMessage, useMessaging } from './use-api';

export function ConnectedInbox() {
  const { ignoredStoredBackend } = useFoundation();
  const { state } = useSession();
  const { api } = useMessaging();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const epoch = useRef(0);

  const load = useCallback(async (after?: string) => {
    const run = ++epoch.current;
    setLoading(true);
    setError('');
    try {
      const page = await api.list(after);
      if (epoch.current !== run) return;
      setRows((current) => after ? mergeMessages(current, page.items) : page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      if (epoch.current === run) setError(requestMessage(error, 'Couldn’t load conversations.'));
    } finally {
      if (epoch.current === run) setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { epoch.current++; };
  }, [load]));

  if (state.phase !== 'authenticated') return null;
  const id = state.user.id;
  return (
    <InboxScreen
      conversations={[...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((row) => inboxRow(row, id))}
      profile={avatar(state.user)}
      onOpen={(id) => router.push({ pathname: '/conversation/[id]', params: { id } })}
      onNew={() => router.push('/new-conversation')}
      onProfile={() => router.push('/profile')}
      onSettings={() => router.push('/settings')}
      onRefresh={() => void load()}
      refreshing={loading && rows.length > 0}
      live
      {...(ignoredStoredBackend && { notice: 'The saved server is incompatible with this build. Review the default server in Settings.' })}
      emptyOverride={loading ? <LoadingState label="Loading conversations…" /> : error ? <ErrorState detail={error} onRetry={() => void load()} /> : undefined}
      listFooter={rows.length > 0 ? (
        error ? <ErrorState detail={error} onRetry={() => void load()} />
          : cursor ? <AppButton kind="quiet" loading={loading} label="Show more conversations" onPress={() => void load(cursor)} />
          : undefined
      ) : undefined}
    />
  );
}
