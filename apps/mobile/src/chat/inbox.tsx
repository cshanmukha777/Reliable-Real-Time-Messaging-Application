import { memo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Icon } from '../components/icons';
import {
  AppScreen,
  AppText,
  Divider,
  IconButton,
  SectionHeader,
  PressTarget,
} from '../components/primitives';
import { EmptyState } from '../components/feedback';
import { SearchField } from '../components/fields';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Avatar, AvatarGroup, type Person } from './avatar';

export type ConversationSummary = {
  id: string;
  name: string;
  people: readonly [Person, ...Person[]];
  preview: string;
  time: string;
  unread?: number;
  online?: boolean;
  group?: boolean;
  needsAttention?: boolean;
};

export function UnreadIndicator({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={[styles.unread, { backgroundColor: colors.accent }]}
    >
      <AppText variant="time" tone="accentText">
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onOpen,
}: {
  conversation: ConversationSummary;
  onOpen: (id: string) => void;
}) {
  const { colors } = useTheme();
  const {
    name,
    people,
    preview,
    time,
    unread = 0,
    online = false,
    group = false,
    needsAttention = false,
  } = conversation;
  const accessibilityLabel = [
    name,
    group && 'Group',
    online && 'Online',
    preview,
    time,
    unread > 0 && `${unread} unread`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <PressTarget
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => onOpen(conversation.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.pressed : 'transparent' },
      ]}
    >
      {group ? (
        <AvatarGroup people={people} />
      ) : (
        <Avatar person={people[0]} {...(online && { online })} />
      )}
      <View style={styles.rowContent}>
        <View style={styles.titleLine}>
          <AppText variant="section" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
          {group && <Icon name="Users" size={14} />}
        </View>
        <AppText
          variant="secondary"
          numberOfLines={2}
          tone={needsAttention ? 'error' : 'secondary'}
        >
          {preview}
        </AppText>
      </View>
      <View style={styles.rowMeta}>
        <AppText variant="time" tone={unread > 0 ? 'accent' : 'muted'}>
          {time}
        </AppText>
        {unread > 0 && <UnreadIndicator count={unread} />}
      </View>
    </PressTarget>
  );
});

const filters = ['All', 'Unread', 'Groups'] as const;

export function InboxScreen({
  conversations,
  onOpen,
  onSettings,
  onProfile,
  profile,
  onNew,
  previewLink,
  notice,
  inset = true,
}: {
  conversations: readonly ConversationSummary[];
  onOpen: (id: string) => void;
  onSettings: () => void;
  profile?: Person;
  onProfile?: () => void;
  onNew?: () => void;
  previewLink?: React.ReactNode;
  notice?: string;
  inset?: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const term = query.trim().toLocaleLowerCase();
  const displayed = conversations.filter(
    (item) =>
      (filter !== 'Unread' || !!item.unread) &&
      (filter !== 'Groups' || !!item.group) &&
      (!term ||
        `${item.name} ${item.preview}`.toLocaleLowerCase().includes(term)),
  );
  return (
    <AppScreen inset={inset}>
      <View style={styles.top}>
        <View style={styles.wordmark}>
          <View aria-hidden style={styles.brandMark}>
            <View
              style={[styles.markLine, { backgroundColor: colors.accent }]}
            />
            <View
              style={[
                styles.markLine,
                styles.markShort,
                { backgroundColor: colors.accent },
              ]}
            />
          </View>
          <AppText variant="section">ChatApp</AppText>
        </View>
        {onProfile && profile && (
          <PressTarget
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={onProfile}
            style={({ pressed }) => [
              styles.profile,
              { backgroundColor: pressed ? colors.elevated : 'transparent' },
            ]}
          >
            <Avatar person={profile} size={36} />
          </PressTarget>
        )}
        <IconButton icon="Settings2" label="Settings" onPress={onSettings} />
      </View>
      <View style={styles.inboxIntro}>
        <View style={styles.titleLine}>
          <AppText
            accessibilityRole="header"
            variant="display"
            style={styles.name}
          >
            Conversations
          </AppText>
          {onNew && (
            <IconButton
              label="New conversation"
              icon="Plus"
              filled
              onPress={onNew}
            />
          )}
        </View>
        {notice && (
          <AppText accessibilityRole="alert" variant="secondary" tone="warning">
            {notice}
          </AppText>
        )}
        <SearchField value={query} onChange={setQuery} />
        {conversations.length > 0 && (
          <View style={styles.filters}>
            {filters.map((item) => (
              <PressTarget
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item }}
                onPress={() => setFilter(item)}
                style={({ pressed }) => [
                  styles.filter,
                  {
                    backgroundColor:
                      filter === item
                        ? colors.selected
                        : pressed
                          ? colors.pressed
                          : 'transparent',
                  },
                ]}
              >
                <AppText
                  variant="secondary"
                  tone={filter === item ? 'accent' : 'secondary'}
                >
                  {item}
                </AppText>
              </PressTarget>
            ))}
          </View>
        )}
        {previewLink}
      </View>
      {displayed.length > 0 && (
        <View style={styles.listLabel}>
          <SectionHeader
            title={
              term ? 'Search results' : filter === 'All' ? 'Recent' : filter
            }
          />
        </View>
      )}
      <FlatList
        data={displayed}
        keyExtractor={(entry) => entry.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onOpen={onOpen} />
        )}
        ListEmptyComponent={
          term ? (
            <EmptyState
              title="No results"
              detail={`Nothing matched “${query.trim()}”. Try a name or a word from a message.`}
              action={{ label: 'Clear search', onPress: () => setQuery('') }}
            />
          ) : (
            <EmptyState
              title={
                filter === 'Unread'
                  ? 'You’re all caught up'
                  : filter === 'Groups'
                    ? 'No group conversations'
                    : 'No conversations yet'
              }
              detail={
                filter === 'All'
                  ? 'Your conversations will appear here.'
                  : 'Switch to All to see the rest of your inbox.'
              }
              {...(filter !== 'All' && {
                action: { label: 'Show all', onPress: () => setFilter('All') },
              })}
            />
          )
        }
      />
    </AppScreen>
  );
}

function Separator() {
  return <Divider style={styles.separator} />;
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: space.nav,
    paddingHorizontal: space.gutter,
    gap: space.xs,
  },
  wordmark: {
    flex: 1,
    gap: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandMark: {
    gap: 3,
    justifyContent: 'center',
    width: 18,
    transform: [{ rotate: '-11deg' }],
  },
  markLine: { width: 15, height: 2, borderRadius: 1 },
  markShort: { width: 10 },
  profile: {
    width: space.touch,
    height: space.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.avatar,
  },
  inboxIntro: {
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.md,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flex: 1, minWidth: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  filter: {
    minHeight: space.touch,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
  },
  listLabel: { paddingHorizontal: space.gutter, paddingBottom: space.xxs },
  list: { flex: 1, minHeight: 0 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: space.gutter,
    paddingVertical: space.sm,
    minHeight: 76,
    gap: space.sm,
    alignItems: 'center',
  },
  rowContent: { flex: 1, minWidth: 0, gap: space.xxs },
  rowMeta: { minWidth: 44, gap: space.xxs, alignItems: 'flex-end' },
  separator: { marginLeft: 84, marginRight: space.gutter },
  unread: {
    minWidth: 23,
    minHeight: 21,
    paddingHorizontal: space.xxs,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
