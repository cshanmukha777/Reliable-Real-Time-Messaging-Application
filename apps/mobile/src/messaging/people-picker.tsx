import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { discoverySchema, type Person } from '@chatapp/contracts';
import { AppButton, AppText, PressTarget } from '../components/primitives';
import { TextField } from '../components/fields';
import { Avatar } from '../chat/avatar';
import { Icon } from '../components/icons';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import type { MessagingApi } from './api';
import { requestMessage } from './use-api';
import { avatar } from './view-model';
import { RequestError } from './screen';

export function PeoplePicker({
  api,
  selected,
  onSelect,
  exclude = [],
  disabled = false,
}: {
  api: MessagingApi;
  selected: Person[];
  onSelect: (person: Person) => void;
  exclude?: readonly string[];
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const visible = results?.filter((person) => !exclude.includes(person.id));

  async function search() {
    const parsed = discoverySchema.safeParse({ q: query });
    if (!parsed.success) return;
    const run = ++operation.current;
    setLoading(true);
    setError('');
    try {
      const people = await api.discover(parsed.data.q);
      if (operation.current === run) setResults(people);
    } catch (error) {
      if (operation.current === run)
        setError(requestMessage(error, 'Couldn’t search for people.'));
    } finally {
      if (operation.current === run) setLoading(false);
    }
  }

  return (
    <>
      <TextField
        label="Find by display name"
        value={query}
        maxLength={50}
        autoCorrect={false}
        editable={!disabled}
        returnKeyType="search"
        onSubmitEditing={() => {
          if (!disabled && !loading) void search();
        }}
        onChangeText={(text) => {
          operation.current++;
          setLoading(false);
          setQuery(text);
          setError('');
          setResults(null);
        }}
      />
      <AppButton
        kind="secondary"
        label="Search people"
        icon="Search"
        loading={loading}
        disabled={disabled || !discoverySchema.safeParse({ q: query }).success}
        onPress={() => void search()}
      />
      {!!error && <RequestError message={error} />}
      {selected.length > 0 && (
        <View style={styles.people}>
          <AppText variant="section">Selected</AppText>
          {selected.map((person) => (
            <PersonChoice
              key={person.id}
              person={person}
              selected
              disabled={disabled}
              onPress={() => onSelect(person)}
            />
          ))}
        </View>
      )}
      {visible?.length === 0 && (
        <AppText tone="muted">No matching people available.</AppText>
      )}
      {visible
        ?.filter((person) => !selected.some((known) => known.id === person.id))
        .map((person) => (
          <PersonChoice
            key={person.id}
            person={person}
            disabled={disabled}
            onPress={() => onSelect(person)}
          />
        ))}
    </>
  );
}

function PersonChoice({
  person,
  selected,
  disabled,
  onPress,
}: {
  person: Person;
  selected?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressTarget
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={person.displayName}
      accessibilityState={{ checked: !!selected, disabled }}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor:
            pressed || selected ? colors.elevated : colors.surface,
        },
      ]}
    >
      <Avatar person={avatar(person)} size={36} />
      <AppText style={styles.name}>{person.displayName}</AppText>
      <Icon name={selected ? 'Check' : 'Plus'} />
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  people: { gap: space.xs },
  choice: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    minHeight: space.touch,
    padding: space.xs,
    borderRadius: radius.control,
  },
  name: { flex: 1 },
});
