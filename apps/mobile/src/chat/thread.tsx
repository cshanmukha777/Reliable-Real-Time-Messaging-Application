import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion, useTheme } from '../design/theme';
import { measure, motion, radius, space } from '../design/tokens';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  Divider,
  IconButton,
} from '../components/primitives';
import { visibleRows } from '../realtime/visibility';
import { OfflineBanner } from '../components/feedback';
import { Avatar, AvatarGroup, type Person } from './avatar';
import { AttachmentPreview, type Attachment } from './attachments';
import { MessageComposer, type ComposerProps } from './composer';
import { MessageStatus, type DeliveryStatus } from './status';

export type MessageViewModel = {
  id: string;
  direction: 'incoming' | 'outgoing';
  text?: string;
  time: string;
  author?: string;
  status?: DeliveryStatus;
  attachment?: Attachment;
  attachments?: Attachment[];
  animate?: boolean;
  retryable?: boolean;
  stateDetail?: string;
};
export type ThreadEntry =
  | MessageViewModel
  | { id: string; divider: 'date' | 'unread'; label: string };

export function DateSeparator({
  label,
  unread = false,
}: {
  label: string;
  unread?: boolean;
}) {
  return (
    <View style={styles.separator}>
      <Divider style={styles.rule} />
      <AppText variant="time" tone={unread ? 'accent' : 'muted'}>
        {label}
      </AppText>
      <Divider style={styles.rule} />
    </View>
  );
}

export function TypingIndicator({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.typing}>
      <View aria-hidden style={styles.inkDots}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[styles.inkDot, { backgroundColor: colors.signalTrack }]}
          />
        ))}
      </View>
      <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {name} is typing
      </AppText>
    </View>
  );
}

export function MessageBubble({
  message,
  grouped = false,
  showMeta = true,
  onRetry,
  onDelete,
  onOpenAttachment,
}: {
  message: MessageViewModel;
  grouped?: boolean;
  showMeta?: boolean;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenAttachment?: (attachment: Attachment) => void;
}) {
  const { colors } = useTheme();
  const outgoing = message.direction === 'outgoing';
  const failed = message.status === 'failed';
  const attachments =
    message.attachments ?? (message.attachment ? [message.attachment] : []);
  const body = (
    <View
      style={[
        styles.message,
        outgoing ? styles.outgoing : styles.incoming,
        { marginTop: grouped ? space.xxs : space.sm },
      ]}
    >
      {message.author && !grouped && (
        <AppText variant="caption" tone="secondary">
          {message.author}
        </AppText>
      )}
      <View
        style={[
          styles.bubble,
          attachments.length > 0 && styles.attachmentBubble,
          outgoing ? styles.outgoingShape : styles.incomingShape,
          {
            backgroundColor: failed
              ? colors.errorSurface
              : outgoing
                ? colors.outgoing
                : colors.incoming,
            borderColor: failed ? colors.error : colors.border,
          },
        ]}
      >
        {!!message.text && (
          <AppText variant="message" selectable>
            {message.text}
          </AppText>
        )}
        {attachments.map((attachment) => (
          <AttachmentPreview
            key={attachment.id ?? attachment.name}
            attachment={attachment}
            {...(onOpenAttachment && {
              onOpen: () => onOpenAttachment(attachment),
            })}
          />
        ))}
      </View>
      {(showMeta || failed) && (
        <View style={[styles.messageMeta, outgoing && styles.metaRight]}>
          <AppText variant="time" tone="muted">
            {message.time}
          </AppText>
          {message.status && <MessageStatus status={message.status} />}
          {outgoing &&
            (!message.status || ['sent','delivered','read'].includes(message.status)) &&
            onDelete && (
              <IconButton
                icon="Trash2"
                label="Delete message"
                onPress={() => onDelete(message.id)}
              />
            )}
        </View>
      )}
      {message.stateDetail && (
        <AppText
          variant="caption"
          tone="muted"
          accessibilityLiveRegion="polite"
        >
          {message.stateDetail}
        </AppText>
      )}
      {(message.retryable ?? (failed && !message.stateDetail)) && onRetry && (
        <AppButton
          kind="quiet"
          label="Retry message"
          icon="RotateCcw"
          onPress={() => onRetry(message.id)}
        />
      )}
    </View>
  );
  return message.animate ? <MessageEntrance>{body}</MessageEntrance> : body;
}

function MessageEntrance({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.5);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.enter,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function ThreadScreen({
  name,
  subtitle,
  people,
  group = false,
  online = false,
  offline = false,
  typing,
  entries,
  composer,
  onBack,
  onDetails,
  onRetry,
  onDelete,
  onOpenAttachment,
  beforeHistory,
  afterHistory,
  onSearch,
  onVisible,
  inset = true,
}: {
  name: string;
  subtitle: string;
  people: readonly [Person, ...Person[]];
  group?: boolean;
  online?: boolean;
  offline?: boolean;
  typing?: string;
  entries: readonly ThreadEntry[];
  composer: ComposerProps;
  onBack: () => void;
  onDetails?: () => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenAttachment?: (attachment: Attachment) => void;
  beforeHistory?: React.ReactNode;
  afterHistory?: React.ReactNode;
  onSearch?: () => void;
  onVisible?: (ids:string[])=>void;
  inset?: boolean;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const bounds=useRef(new Map<string,{y:number;height:number}>());
  const viewport=useRef({offset:0,height:0});
  const incoming=useRef<string[]>([]);
  incoming.current=entries.flatMap((entry)=>!('divider'in entry)&&entry.direction==='incoming'?[entry.id]:[]);
  const report=useCallback(()=>{
    if(!onVisible)return;
    const {offset,height}=viewport.current;
    const visible=visibleRows(bounds.current,offset,height,incoming.current);
    if(visible.length)onVisible(visible);
  },[onVisible]);
  const newest=entries.at(-1);
  const last = newest?.id;
  const nearEnd=useRef(true);
  const scrollPending = useRef(true);
  useEffect(()=>{
    const keys=new Set(incoming.current);
    for(const key of bounds.current.keys())if(!keys.has(key))bounds.current.delete(key);
    report();
  },[entries,report]);
  useEffect(() => {
    if (last && nearEnd.current) scrollPending.current = true;
  }, [last]);
  return (
    <AppScreen inset={inset}>
      <KeyboardAvoidingView
        style={styles.thread}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AppHeader
          title={name}
          subtitle={subtitle}
          leading={
            <View style={styles.headerLeft}>
              <IconButton
                icon="ArrowLeft"
                label="Back to conversations"
                onPress={onBack}
              />
              {group ? (
                <AvatarGroup people={people} />
              ) : (
                <Avatar
                  person={people[0]}
                  size={40}
                  online={online && !offline}
                />
              )}
            </View>
          }
          trailing={
            <View style={styles.headerLeft}>
              {onSearch && (
                <IconButton
                  icon="Search"
                  label="Search messages"
                  onPress={onSearch}
                />
              )}
              {onDetails && (
                <IconButton
                  icon="Info"
                  label="Conversation details"
                  onPress={onDetails}
                />
              )}
            </View>
          }
        />
        <Divider />
        {offline && (
          <View style={styles.offline}>
            <OfflineBanner />
          </View>
        )}
        <ScrollView
          ref={scroll}
          style={styles.thread}
          contentContainerStyle={styles.history}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={100}
          onLayout={({nativeEvent})=>{viewport.current.height=nativeEvent.layout.height;report();}}
          onScroll={({nativeEvent})=>{
            viewport.current={offset:nativeEvent.contentOffset.y,height:nativeEvent.layoutMeasurement.height};
            nearEnd.current=nativeEvent.contentSize.height-nativeEvent.contentOffset.y-nativeEvent.layoutMeasurement.height<100;
            report();
          }}
          onContentSizeChange={() => {
            if (scrollPending.current) {
              scrollPending.current = false;
              scroll.current?.scrollToEnd({ animated: false });
            }
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        >
          {beforeHistory}
          {entries.map((entry, index) => {
            if ('divider' in entry)
              return (
                <DateSeparator
                  key={entry.id}
                  label={entry.label}
                  unread={entry.divider === 'unread'}
                />
              );
            const previous = entries[index - 1];
            const next = entries[index + 1];
            const grouped =
              previous !== undefined &&
              !('divider' in previous) &&
              previous.direction === entry.direction &&
              previous.author === entry.author;
            const showMeta =
              !!entry.status ||
              !next ||
              'divider' in next ||
              next.direction !== entry.direction ||
              next.author !== entry.author;
            return (
              <View key={entry.id} onLayout={({nativeEvent})=>{
                if(!onVisible)return;
                bounds.current.set(entry.id,nativeEvent.layout);
                report();
              }}>
              <MessageBubble
                message={entry}
                grouped={grouped}
                showMeta={showMeta}
                {...(onRetry && { onRetry })}
                {...(onDelete && { onDelete })}
                {...(onOpenAttachment && { onOpenAttachment })}
              />
              </View>
            );
          })}
          {afterHistory}
          {typing && !offline && <TypingIndicator name={typing} />}
        </ScrollView>
        <MessageComposer
          {...composer}
          onSend={() => {
            composer.onSend();
            requestAnimationFrame(() =>
              scroll.current?.scrollToEnd({ animated: false }),
            );
          }}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  thread: { flex: 1, minHeight: 0 },
  history: {
    width: '100%',
    maxWidth: measure.thread,
    alignSelf: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  headerLeft: { flexDirection: 'row', gap: space.xxs, alignItems: 'center' },
  offline: { paddingHorizontal: space.md, paddingTop: space.xs },
  separator: {
    marginVertical: space.sm,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  rule: { flex: 1 },
  message: { maxWidth: '86%', gap: space.xxs, minWidth: 0 },
  incoming: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  outgoing: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.bubble,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  attachmentBubble: { width: 260, maxWidth: '100%' },
  incomingShape: { borderBottomLeftRadius: radius.small },
  outgoingShape: { borderBottomRightRadius: radius.small },
  messageMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xxs,
  },
  metaRight: { justifyContent: 'flex-end' },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  inkDots: { flexDirection: 'row', gap: space.xxs },
  inkDot: { width: 4, height: 4, borderRadius: radius.small },
});
