import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import type { Attachment, Conversation, Message } from '@chatapp/contracts';
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
import {
  discardFile,
  downloadFile,
  pickFile,
  shareFile,
  uploadFile,
} from './native-files';
import { type PickedFile } from './picker-input';
import { requestMessage, useMessaging } from './use-api';
import { mergeMessages, SendAttempt } from './draft';

type OpenedFile = { uri: string; file: Attachment };

export function ConnectedThread({ id }: { id: string }) {
  const { api, accountScope } = useMessaging();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [rows, setRows] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sending, setSending] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [progress, setProgress] = useState<number | undefined>();
  const [sendError, setSendError] = useState('');
  const pending = useRef(new SendAttempt(randomUUID)).current;
  const uploaded = useRef<Attachment | null>(null);
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

  const load = useCallback(
    async (after?: string) => {
      const run = ++epoch.current;
      setLoading(true);
      setLoadError('');
      try {
        const [detail, page] = await Promise.all([
          api.details(id),
          api.history(id, after),
        ]);
        if (epoch.current !== run) return;
        setConversation(detail);
        setCursor(page.nextCursor);
        setRows((current) =>
          after ? mergeMessages(current, page.items) : page.items,
        );
      } catch (error) {
        if (epoch.current === run) {
          if (
            error instanceof Error &&
            'status' in error &&
            [403, 404].includes(Number(error.status))
          ) {
            setConversation(null);
            setRows([]);
          }
          setLoadError(requestMessage(error, 'Couldn’t load messages.'));
        }
      } finally {
        if (epoch.current === run) setLoading(false);
      }
    },
    [api, id],
  );

  useFocusEffect(
    useCallback(() => {
      if (!busy.current) void load();
      return () => {
        epoch.current++;
      };
    }, [load]),
  );

  async function send() {
    if (busy.current || (!text.trim() && !file)) return;
    busy.current = true;
    setSending(true);
    setSendError('');
    try {
      if (file && !uploaded.current)
        uploaded.current = await uploadFile(api, id, file, setProgress);
      const payload = pending.payload(
        text,
        uploaded.current ? [uploaded.current.id] : [],
      );
      const result = await api.send(id, payload);
      setRows((current) => mergeMessages(current, [result]));
      pending.confirmed();
      uploaded.current = null;
      setText('');
      setFile(null);
    } catch (error) {
      setSendError(
        requestMessage(
          error,
          'Couldn’t confirm your message. Tap Send to retry.',
        ),
      );
    } finally {
      busy.current = false;
      setSending(false);
      setProgress(undefined);
    }
  }

  async function select(photo: boolean) {
    if (busy.current) return;
    busy.current = true;
    try {
      const selection = await pickFile(photo);
      if (selection) {
        uploaded.current = null;
        setFile(selection);
        setSendError('');
      }
    } catch (error) {
      setSendError(
        error instanceof Error && error.message.startsWith('Choose a ')
          ? error.message
          : 'Couldn’t open the picker.',
      );
    } finally {
      busy.current = false;
    }
  }

  async function remove(messageId: string) {
    setActionError('');
    try {
      await api.remove(id, messageId);
      setRows((current) =>
        current.filter((message) => message.id !== messageId),
      );
    } catch (error) {
      setActionError(requestMessage(error, 'Couldn’t delete this message.'));
    }
  }

  async function open(attachmentId?: string) {
    const attachment = rows
      .flatMap((row) => row.attachments)
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
        entries={threadEntries(rows, accountScope.userId, group)}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace('/')
        }
        onDetails={() =>
          router.push({
            pathname: '/conversation/[id]/members',
            params: { id },
          })
        }
        onSearch={() =>
          router.push({ pathname: '/conversation/[id]/search', params: { id } })
        }
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
            {!loading && !loadError && !rows.length && (
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
          value: text,
          onChange: (value) => {
            setText(value);
            setSendError('');
          },
          onSend: () => void send(),
          onAttach: () =>
            Alert.alert('Add an attachment', undefined, [
              { text: 'Photo library', onPress: () => void select(true) },
              { text: 'Browse files', onPress: () => void select(false) },
              { text: 'Cancel', style: 'cancel' },
            ]),
          onRemoveAttachment: () => {
            uploaded.current = null;
            setFile(null);
            setSendError('');
          },
          sending,
          disabled: loading,
          error: sendError,
          ...(progress !== undefined && { progress }),
          ...(file && {
            attachment: {
              name: file.input.fileName,
              detail: fileSize(file.input.size),
              ...(file.input.mimeType.startsWith('image/') && {
                image: {
                  source: { uri: file.uri },
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
