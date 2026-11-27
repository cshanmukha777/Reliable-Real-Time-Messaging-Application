import { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { searchQuerySchema, type SearchResult } from '@chatapp/contracts';
import { AppButton, AppText, Divider } from '../components/primitives';
import { TextField } from '../components/fields';
import { EmptyState, LoadingState } from '../components/feedback';
import { space } from '../design/tokens';
import { MessagingScreen, RequestError } from './screen';
import { mergeMessages } from './draft';
import { requestMessage, useMessaging } from './use-api';

export function SearchScreen({ id }: { id: string }) {
  const { api } = useMessaging();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const valid = searchQuerySchema.safeParse({ q: query });

  async function search(after?: string) {
    if (!valid.success) return;
    const run = ++epoch.current;
    setLoading(true);
    setError('');
    try {
      const page = await api.search(id, valid.data.q, after);
      if (epoch.current !== run) return;
      setResults((current) =>
        after ? mergeMessages(current ?? [], page.items) : page.items,
      );
      setCursor(page.nextCursor);
    } catch (error) {
      if (epoch.current === run) {
        setResults(null);
        setCursor(null);
        setError(requestMessage(error, 'Couldn’t search messages. Try again.'));
      }
    } finally {
      if (epoch.current === run) setLoading(false);
    }
  }

  return (
    <MessagingScreen title="Search messages">
      <TextField
        label="Search this conversation"
        value={query}
        maxLength={80}
        autoCorrect={false}
        hint="Enter a word or phrase with at least two characters."
        returnKeyType="search"
        onSubmitEditing={() => {
          if (!loading) void search();
        }}
        onChangeText={(text) => {
          epoch.current++;
          setQuery(text);
          setCursor(null);
          setResults(null);
          setError('');
          setLoading(false);
        }}
      />
      <AppButton
        label="Search"
        icon="Search"
        kind="secondary"
        loading={loading}
        disabled={!valid.success}
        onPress={() => void search()}
      />
      {error && <RequestError message={error} />}
      {loading && !results && <LoadingState label="Searching messages…" />}
      {!loading && results?.length === 0 && (
        <EmptyState
          title="No matching messages"
          detail="Try a different word or phrase."
        />
      )}
      {results?.map((message) => (
        <View key={message.id} style={styles.row}>
          <AppText variant="section">{message.sender.displayName}</AppText>
          <AppText variant="secondary" numberOfLines={4}>
            {message.preview}
          </AppText>
          <AppText variant="time" tone="muted">
            {new Date(message.createdAt).toLocaleString()}
          </AppText>
          <Divider />
        </View>
      ))}
      {cursor && (
        <AppButton
          label="More results"
          kind="quiet"
          loading={loading}
          onPress={() => void search(cursor)}
        />
      )}
    </MessagingScreen>
  );
}

const styles = StyleSheet.create({ row: { gap: space.xs } });
