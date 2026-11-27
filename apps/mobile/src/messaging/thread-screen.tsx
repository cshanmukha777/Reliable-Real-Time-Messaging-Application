import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import type { Attachment, Conversation } from '@chatapp/contracts';
import { ThreadScreen } from '../chat/thread';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  IconButton,
} from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback';
import { space } from '../design/tokens';
import { BackButton, RequestError } from './screen';
import { conversationPeople, fileSize, threadEntries } from './view-model';
import { discardFile, downloadFile, pickFile, shareFile } from './native-files';
import { useOffline } from '../offline/provider';
import type { Draft, LocalMessage } from '../offline/store';
import type { ThreadEntry } from '../chat/thread';
import { requestMessage, useMessaging } from './use-api';

type OpenedFile = { uri: string; file: Attachment };

export function ConnectedThread({ id }: { id: string }) {
  const { api, accountScope } = useMessaging();
  const {
    store,
    drafts,
    files,
    worker,
    version,
    progress,
    storageError,
    clean,
  } = useOffline();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [locals, setLocals] = useState<LocalMessage[]>([]);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [draft, setDraft] = useState<Draft>({ body: '', file: null });
  const [sending, setSending] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [sendError, setSendError] = useState('');
  const busy = useRef(false);
  const epoch = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (opened) void discardFile(opened.uri);
    },
    [opened],
  );

  useEffect(() => {
    let current = true;
    void store
      .thread(id)
      .then((cached) => {
        if (!current || !cached) return;
        setConversation(cached.conversation);
        setLocals(cached.rows);
        setActive(cached.active);
      })
      .catch(() => {
        if (current) setLoadError('Couldn’t read saved messages.');
      });
    return () => {
      current = false;
    };
  }, [store, id, version]);

  useFocusEffect(
    useCallback(() => {
      setReady(false);
      let current = true;
      void store
        .getDraft(id)
        .then((saved) => {
          if (current) {
            setDraft(saved);
            setReady(true);
          }
        })
        .catch(() => {
          if (current) setSendError('Couldn’t read your draft.');
        });
      return () => {
        current = false;
      };
    }, [store, id]),
  );

  const load = useCallback(
    async (after?: string) => {
      const run = ++epoch.current;
      setLoading(true);
      setLoadError('');
      try {
        const [detail, page] = await Promise.all([
          api.details(id),
          api.reconcile(id, after),
        ]);
        if (epoch.current !== run) return;
        await store.applyHistory(id, page, Date.now(), detail);
        await store.connectionRecovered(Date.now());
        worker.wake();
        await clean().catch(() => undefined);
        if (epoch.current === run) setCursor(page.nextCursor);
      } catch (error) {
        if (epoch.current !== run) return;
        if (
          error instanceof Error &&
          'status' in error &&
          [403, 404].includes(Number(error.status))
        ) {
          await store.revoke(id).catch(() => undefined);
        }
        if (epoch.current === run)
          setLoadError(
            requestMessage(
              error,
              'Couldn’t refresh. Saved messages are available offline.',
            ),
          );
      } finally {
        if (epoch.current === run) setLoading(false);
      }
    },
    [api, id, store, clean, worker],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
        void drafts.flush(id).catch(() => undefined);
      };
    }, [load, drafts, id]),
  );

  function edit(next: Draft) {
    setDraft(next);
    drafts.edit(id, next);
    setSendError('');
  }

  async function send() {
    const person = conversation?.members.find(
      (member) => member.id === accountScope?.userId,
    );
    if (
      busy.current ||
      !person ||
      !active ||
      (!draft.body.trim() && !draft.file)
    )
      return;
    busy.current = true;
    setSending(true);
    setSendError('');
    try {
      await drafts.flush(id);
      await store.enqueue(id, randomUUID(), person);
      setDraft({ body: '', file: null });
      worker.wake();
    } catch {
      setSendError('Couldn’t save this message. Your draft is still here.');
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function select(photo: boolean) {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      const selection = await pickFile(photo);
      if (!selection) return;
      const file = await files.stage(selection);
      if (!alive.current) return;
      await drafts.flush(id);
      const next = { ...draft, file };
      await store.saveDraft(id, next);
      if (alive.current) {
        setDraft(next);
        setSendError('');
      }
      await clean().catch(() => undefined);
    } catch (error) {
      setSendError(
        error instanceof Error && error.message.startsWith('Choose a ')
          ? error.message
          : 'Couldn’t save this attachment. Check device storage and try again.',
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function remove(messageId: string) {
    setActionError('');
    try {
      await api.remove(id, messageId);
      const message = locals.find(
        (entry) => entry.message.id === messageId,
      )?.message;
      if (message) await store.removeCached(message);
    } catch (error) {
      setActionError(requestMessage(error, 'Couldn’t delete this message.'));
    }
  }

  async function open(attachmentId?: string) {
    const attachment = locals
      .flatMap(({ message }) => message.attachments)
      .find((item) => item.id === attachmentId);
    if (!attachment || openingFile) return;
    setActionError('');
    setOpeningFile(true);
    let unloaded: string | undefined;
    try {
      unloaded = await downloadFile(api, id, attachment);
      if (!alive.current) return;
      if (attachment.mimeType.startsWith('image/')) {
        setOpened({ uri: unloaded, file: attachment });
        unloaded = undefined;
      } else {
        await shareFile(unloaded, attachment);
      }
    } catch (error) {
      setActionError(requestMessage(error, 'Couldn’t open the attachment.'));
    } finally {
      if (unloaded) await discardFile(unloaded);
      setOpeningFile(false);
    }
  }

  if (!conversation || !accountScope)
    return (
      <AppScreen>
        <AppHeader title="Conversation" leading={<BackButton />} />
        {loading ? (
          <LoadingState label="Loading conversation…" />
        ) : (
          <ErrorState detail={loadError} onRetry={() => void load()} />
        )}
      </AppScreen>
    );

  const group = conversation.kind === 'GROUP';
  const byId = new Map(locals.map((entry) => [entry.message.id, entry]));
  const entries: ThreadEntry[] = threadEntries(
    locals.map((entry) => entry.message),
    accountScope.userId,
    group,
  ).map((entry) => {
    if ('divider' in entry) return entry;
    const local = byId.get(entry.id);
    if (!local?.state || local.state === 'CONFIRMED') return entry;
    const failed = ['FAILED', 'BLOCKED_AUTH', 'BLOCKED_ACCESS'].includes(
      local.state,
    );
    const uploading = progress(entry.id);
    return {
      ...entry,
      status: failed
        ? 'failed'
        : ['QUEUED', 'RETRY_WAIT'].includes(local.state)
          ? 'queued'
          : 'sending',
      ...(local.file && {
        attachments: [
          {
            name: local.file.input.fileName,
            detail: fileSize(local.file.input.size),
          },
        ],
      }),
      ...(local.state === 'RETRY_WAIT' && {
        retryable: local.error !== 'RATE_LIMITED',
      }),
      ...(uploading !== undefined && {
        stateDetail: `Uploading ${Math.round(Math.min(100, uploading))}%`,
      }),
      ...(local.error && { stateDetail: failureLabel(local.error) }),
    };
  });
  const file = draft.file;
  return (
    <>
      <ThreadScreen
        name={conversation.title}
        subtitle={
          group
            ? `${conversation.members.length} members`
            : 'Direct conversation'
        }
        people={conversationPeople(conversation, accountScope.userId)}
        group={group}
        entries={entries}
        offline={!!loadError && active}
        onRetry={(operation) => {
          void store
            .retry(operation, Date.now())
            .then(worker.wake)
            .catch(() => setActionError('Couldn’t schedule the retry.'));
        }}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace('/')
        }
        {...(active && {
          onDetails: () =>
            router.push({
              pathname: '/conversation/[id]/members',
              params: { id },
            }),
        })}
        {...(active && {
          onSearch: () =>
            router.push({
              pathname: '/conversation/[id]/search',
              params: { id },
            }),
        })}
        onDelete={(messageId) =>
          Alert.alert(
            'Delete message?',
            'This removes the message for everyone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void remove(messageId),
              },
            ],
          )
        }
        onOpenAttachment={(item) => void open(item.id)}
        beforeHistory={
          <View style={styles.toolbar}>
            <AppButton
              kind="quiet"
              icon="RotateCcw"
              label="Refresh"
              disabled={loading || sending}
              onPress={() => void load()}
            />
            {cursor && (
              <AppButton
                kind="quiet"
                label="Older messages"
                disabled={loading || sending}
                onPress={() => void load(cursor)}
              />
            )}
          </View>
        }
        afterHistory={
          <>
            {loading && <LoadingState label="Loading messages…" />}
            {!!loadError && (
              <ErrorState detail={loadError} onRetry={() => void load()} />
            )}
            {!loading && !loadError && !locals.length && (
              <EmptyState
                title="No messages yet"
                detail="Start the conversation with a message."
              />
            )}
            {!!actionError && <RequestError message={actionError} />}
            {openingFile && (
              <AppText variant="caption" accessibilityLiveRegion="polite">
                Opening attachment…
              </AppText>
            )}
          </>
        }
        composer={{
          value: draft.body,
          onChange: (body) => edit({ ...draft, body }),
          onSend: () => void send(),
          onAttach: () =>
            Alert.alert('Add an attachment', undefined, [
              { text: 'Photo library', onPress: () => void select(true) },
              { text: 'Browse files', onPress: () => void select(false) },
              { text: 'Cancel', style: 'cancel' },
            ]),
          onRemoveAttachment: () => {
            edit({ ...draft, file: null });
            void drafts
              .flush(id)
              .then(clean)
              .catch(() =>
                setSendError('Couldn’t remove the saved attachment.'),
              );
          },
          sending,
          disabled: !ready || !active,
          offline: !!loadError && active,
          error: sendError || storageError,
          ...(file && {
            attachment: {
              name: file.input.fileName,
              detail: fileSize(file.input.size),
              ...(file.input.mimeType.startsWith('image/') && {
                image: {
                  source: { uri: files.path(file.id) },
                  description: file.input.fileName,
                },
              }),
            },
          }),
        }}
      />
      {opened && (
        <Modal onRequestClose={() => setOpened(null)} animationType="none">
          <AppScreen>
            <AppHeader
              title={opened.file.fileName}
              leading={
                <IconButton
                  icon="X"
                  label="Close image"
                  onPress={() => setOpened(null)}
                />
              }
            />
            <Image
              source={{ uri: opened.uri }}
              accessibilityLabel={opened.file.fileName}
              resizeMode="contain"
              style={styles.photo}
            />
          </AppScreen>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photo: { flex: 1, width: '100%' },
});

function failureLabel(code: string) {
  const messages: Record<string, string> = {
    ACCESS_REVOKED: 'Access changed. Your unsent message is kept here.',
    FILE_MISSING: 'The saved file is missing.',
    FILE_CHANGED: 'The saved file is damaged.',
    FILE_TOO_LARGE: 'The file exceeds the server limit.',
    CONFLICT: 'The server rejected this operation identity.',
    SIGN_IN: 'Sign in again to resume.',
    RATE_LIMITED: 'Waiting for the server’s retry window.',
    REJECTED: 'The server rejected this message.',
    CONNECTION: 'Waiting for a connection.',
    TEMPORARY: 'The server will be retried.',
  };
  return messages[code] ?? 'Waiting to retry.';
}
