import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Appearance } from '@chatapp/contracts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttachmentPreview, type Attachment } from '../../chat/attachments';
import { InboxScreen, type ConversationSummary } from '../../chat/inbox';
import { deliveryStates, MessageStatus } from '../../chat/status';
import { ThreadScreen, type MessageViewModel } from '../../chat/thread';
import { ErrorState, LoadingState } from '../../components/feedback';
import {
  AppButton,
  AppText,
  IconButton,
  Surface,
  PressTarget,
} from '../../components/primitives';
import { ThemeProvider, useTheme } from '../../design/theme';
import { measure, radius, space } from '../../design/tokens';
import { SettingsView } from '../../settings/settings-view';
import {
  AuthPreview,
  DetailsPreview,
  DirectoryPreview,
  PreviewPage,
  ProfilePreview,
} from './extra-screens';
import {
  cafePhoto,
  contacts,
  conversations,
  groupThread,
  mira,
  note,
  self,
  thread,
} from './fixtures';

const scenes = {
  inbox: 'Inbox',
  thread: 'Conversation',
  failed: 'Failed message',
  offline: 'Offline',
  composer: 'Composer',
  delivery: 'Delivery states',
  empty: 'Empty inbox',
  unavailable: 'Connection unavailable',
  loading: 'Loading',
  settings: 'Settings',
  profile: 'Profile',
  directory: 'New conversation',
  group: 'New group',
  details: 'Group details',
  attachment: 'Attachment',
  signin: 'Sign in',
  register: 'Registration',
} as const;
type Scene = keyof typeof scenes;
const sceneNames = Object.keys(scenes) as Scene[];
const fallbackConversation: ConversationSummary = {
  id: 'mira',
  name: mira.name,
  people: [mira],
  preview: '',
  time: '',
  online: true,
};
const previewOrigin = 'https://chat.example.com';

export function DesignPreview({ onClose }: { onClose?: () => void }) {
  const [appearance, setAppearance] = useState<Appearance>('light');
  return (
    <ThemeProvider appearance={appearance}>
      <PreviewBody
        appearance={appearance}
        onAppearance={setAppearance}
        {...(onClose && { onClose })}
      />
    </ThemeProvider>
  );
}

function PreviewBody({
  appearance,
  onAppearance,
  onClose,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
  onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const [scene, setScene] = useState<Scene>('inbox');
  const [menu, setMenu] = useState(false);
  const [conversation, setConversation] = useState(
    conversations[0] ?? fallbackConversation,
  );
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<MessageViewModel[]>([]);
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [opened, setOpened] = useState<Attachment>(cafePhoto);
  const [retrying, setRetrying] = useState(false);
  const [composerMode, setComposerMode] = useState<
    'ready' | 'uploading' | 'failed'
  >('ready');

  const selectScene = (next: Scene) => {
    setMenu(false);
    setScene(next);
    setSent([]);
    setRetrying(false);
    setComposerMode('ready');
    setSelected(next === 'composer' ? note : null);
    setDraft(
      next === 'composer'
        ? 'Here’s the note for tomorrow.\nMeet at the blue gate.'
        : '',
    );
    if (next === 'details')
      setConversation(conversations[1] ?? fallbackConversation);
    else if (
      next === 'thread' ||
      next === 'failed' ||
      next === 'offline' ||
      next === 'composer'
    )
      setConversation(conversations[0] ?? fallbackConversation);
  };
  const back = () => selectScene('inbox');

  function open(id: string) {
    selectScene(id === 'dev' ? 'failed' : 'thread');
    setConversation(
      conversations.find((item) => item.id === id) ?? fallbackConversation,
    );
  }

  function send() {
    if (!draft.trim() && !selected) return;
    const message: MessageViewModel = {
      id: `preview-${sent.length}`,
      direction: 'outgoing',
      time: 'Now',
      status: scene === 'offline' ? 'queued' : 'sent',
      animate: true,
      ...(draft.trim() && { text: draft.trim() }),
      ...(selected && { attachment: selected }),
    };
    setSent((items) => [...items, message]);
    setDraft('');
    setSelected(null);
  }

  let content;
  switch (scene) {
    case 'inbox':
    case 'empty':
      content = (
        <InboxScreen
          key={scene}
          inset={false}
          conversations={scene === 'inbox' ? conversations : []}
          onOpen={open}
          onSettings={() => selectScene('settings')}
          profile={self}
          onProfile={() => selectScene('profile')}
          onNew={() => selectScene('directory')}
        />
      );
      break;
    case 'thread':
    case 'failed':
    case 'offline':
    case 'composer': {
      const failedEntries = [
        ...thread.slice(0, 3),
        {
          id: 'failed-preview',
          direction: 'outgoing' as const,
          text: 'I’m under the awning by the front door.',
          time: '9:45',
          status: retrying ? ('sending' as const) : ('failed' as const),
        },
      ];
      const offlineEntries = [
        ...thread.slice(0, 3),
        {
          id: 'offline-preview',
          direction: 'outgoing' as const,
          text: 'I’m inside. I’ll wait by the counter.',
          time: '9:49',
          status: 'queued' as const,
        },
      ];
      const directEntries =
        conversation.id === 'mira'
          ? thread
          : [
              {
                id: 'direct-today',
                divider: 'date' as const,
                label: 'Today, 25 November',
              },
              {
                id: 'direct-preview',
                direction: 'incoming' as const,
                text:
                  conversation.preview || 'I’ll send you the details in a bit.',
                time: conversation.time,
              },
            ];
      const entries =
        scene === 'failed'
          ? failedEntries
          : scene === 'offline'
            ? offlineEntries
            : scene === 'composer'
              ? thread.slice(0, 3)
              : conversation.group
                ? groupThread
                : directEntries;
      const offline = scene === 'offline';
      const sending = scene === 'composer' && composerMode === 'uploading';
      content = (
        <ThreadScreen
          inset={false}
          name={conversation.name}
          subtitle={
            offline
              ? 'Last seen recently'
              : conversation.group
                ? `${conversation.people.length + 1} members`
                : conversation.online
                  ? 'Online now'
                  : 'Away'
          }
          people={conversation.people}
          {...(conversation.online && { online: true })}
          {...(conversation.group && { group: true })}
          offline={offline}
          {...(scene === 'thread' &&
            conversation.id === 'mira' && { typing: 'Mira' })}
          entries={[...entries, ...sent]}
          onBack={back}
          onDetails={() => setScene('details')}
          onRetry={() => setRetrying(true)}
          onOpenAttachment={(attachment) => {
            setOpened(attachment);
            setScene('attachment');
          }}
          composer={{
            value: draft,
            onChange: setDraft,
            onSend: send,
            onAttach: () => setSelected(note),
            onRemoveAttachment: () => setSelected(null),
            offline,
            sending,
            ...(selected && { attachment: selected }),
            ...(sending && selected && { progress: 64 }),
            ...(scene === 'composer' &&
              composerMode === 'failed' && {
                error:
                  'The attachment couldn’t upload. Remove it or try again.',
              }),
          }}
        />
      );
      break;
    }
    case 'delivery':
      content = (
        <PreviewPage title="Delivery states" onBack={back}>
          <AppText variant="secondary" tone="secondary">
            Follow a message from this device to the recipient.
          </AppText>
          {deliveryStates.map((status) => (
            <Surface key={status}>
              <MessageStatus status={status} />
            </Surface>
          ))}
        </PreviewPage>
      );
      break;
    case 'unavailable':
      content = (
        <PreviewPage title="Connection" onBack={back}>
          <ErrorState
            title="Can’t reach the server"
            detail="Check your connection or review the server URL in Settings."
            onRetry={() => selectScene('loading')}
          />
          <AppButton
            kind="quiet"
            label="Open settings"
            onPress={() => selectScene('settings')}
          />
        </PreviewPage>
      );
      break;
    case 'loading':
      content = (
        <PreviewPage title="Conversations" onBack={back}>
          <LoadingState label="Opening conversations…" />
        </PreviewPage>
      );
      break;
    case 'settings':
      content = (
        <PreviewSettings
          appearance={appearance}
          onAppearance={onAppearance}
          onBack={back}
        />
      );
      break;
    case 'profile':
      content = <ProfilePreview person={self} onBack={back} />;
      break;
    case 'group':
    case 'directory':
      content = (
        <DirectoryPreview
          group={scene === 'group'}
          people={contacts}
          onBack={back}
          onSelect={(person) => {
            const matched = conversations.find(
              (item) => item.name === person.name,
            );
            selectScene('thread');
            setConversation(
              matched ?? {
                ...fallbackConversation,
                name: person.name,
                people: [person],
                online: false,
              },
            );
          }}
        />
      );
      break;
    case 'details':
      content = (
        <DetailsPreview
          title={conversation.name}
          people={conversation.people}
          onBack={() => setScene('thread')}
        />
      );
      break;
    case 'attachment':
      content = (
        <PreviewPage
          title={opened.image ? 'Photo preview' : 'File preview'}
          onBack={() => setScene('thread')}
        >
          <AttachmentPreview attachment={opened} />
        </PreviewPage>
      );
      break;
    case 'signin':
    case 'register':
      content = <AuthPreview signup={scene === 'register'} onBack={back} />;
      break;
  }

  return (
    <SafeAreaView
      style={[styles.frame, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.toolbar,
          { backgroundColor: colors.elevated, borderColor: colors.border },
        ]}
      >
        <View style={styles.toolbarText}>
          <AppText variant="caption">Design preview</AppText>
          <AppText variant="time" tone="muted">
            Sample data
          </AppText>
        </View>
        <IconButton
          label={isDark ? 'Use light preview' : 'Use dark preview'}
          icon={isDark ? 'Sun' : 'Moon'}
          onPress={() => onAppearance(isDark ? 'light' : 'dark')}
        />
        <PressTarget
          accessibilityRole="button"
          accessibilityState={{ expanded: menu }}
          onPress={() => setMenu((value) => !value)}
          style={({ pressed }) => [
            styles.control,
            pressed && { backgroundColor: colors.pressed },
          ]}
        >
          <AppText variant="caption" tone="accent">
            {menu ? 'Hide scenes' : 'Scenes'}
          </AppText>
        </PressTarget>
        {onClose && (
          <IconButton label="Close preview" icon="X" onPress={onClose} />
        )}
      </View>
      {menu && (
        <ScrollView
          style={[styles.sceneMenu, { borderColor: colors.border }]}
          contentContainerStyle={styles.sceneOptions}
          keyboardShouldPersistTaps="handled"
        >
          {sceneNames.map((name) => (
            <PressTarget
              key={name}
              onPress={() => selectScene(name)}
              accessibilityRole="button"
              accessibilityState={{ selected: scene === name }}
              style={({ pressed }) => [
                styles.control,
                {
                  backgroundColor:
                    scene === name
                      ? colors.selected
                      : pressed
                        ? colors.pressed
                        : colors.surface,
                },
              ]}
            >
              <AppText variant="caption">{scenes[name]}</AppText>
            </PressTarget>
          ))}
        </ScrollView>
      )}
      {scene === 'composer' && (
        <View style={styles.composerOptions}>
          {(['ready', 'uploading', 'failed'] as const).map((mode) => (
            <AppButton
              key={mode}
              label={
                mode === 'ready'
                  ? 'Ready'
                  : mode === 'uploading'
                    ? 'Uploading'
                    : 'Upload failed'
              }
              kind={composerMode === mode ? 'secondary' : 'quiet'}
              onPress={() => {
                setComposerMode(mode);
                if (mode !== 'ready') setSelected(note);
              }}
            />
          ))}
        </View>
      )}
      <View style={styles.content}>{content}</View>
    </SafeAreaView>
  );
}

function PreviewSettings({
  appearance,
  onAppearance,
  onBack,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
  onBack: () => void;
}) {
  const [candidate, setCandidate] = useState(previewOrigin);
  const [note, setNote] = useState('');
  return (
    <SettingsView
      inset={false}
      appearance={appearance}
      onAppearance={onAppearance}
      activeOrigin={previewOrigin}
      candidate={candidate}
      onCandidate={setCandidate}
      connection="online"
      connectionDetail={note}
      onTest={() => setNote('This preview uses a sample connection.')}
      onSave={() => undefined}
      onReset={() => setCandidate(previewOrigin)}
      probeReady
      storageNote="Sample diagnostic status"
      onProbe={() =>
        setNote('The storage probe runs in the native settings screen.')
      }
      onBack={onBack}
    />
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  toolbar: {
    width: '100%',
    maxWidth: measure.screen,
    alignSelf: 'center',
    minHeight: space.touch,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarText: { flex: 1, minWidth: 0 },
  control: {
    minHeight: space.touch,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
  },
  sceneMenu: {
    width: '100%',
    maxWidth: measure.screen,
    alignSelf: 'center',
    flexGrow: 0,
    maxHeight: 240,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sceneOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    padding: space.sm,
  },
  composerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'center',
    padding: space.xs,
  },
  content: { flex: 1, minHeight: 0 },
});
