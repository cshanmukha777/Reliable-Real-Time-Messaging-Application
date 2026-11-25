import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, AvatarGroup, type Person } from '../../chat/avatar';
import { SearchField, TextField } from '../../components/fields';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  Divider,
  IconButton,
  SectionHeader,
  PressTarget,
} from '../../components/primitives';
import { SettingsRow } from '../../settings/settings-view';
import { space } from '../../design/tokens';

export function PreviewPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <AppScreen scroll inset={false}>
      <AppHeader
        title={title}
        leading={<IconButton icon="ArrowLeft" label="Back" onPress={onBack} />}
      />
      <Divider />
      <View style={styles.page}>{children}</View>
    </AppScreen>
  );
}

export function ProfilePreview({
  person,
  onBack,
}: {
  person: Person;
  onBack: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [draft, setDraft] = useState(person.name);
  const [editing, setEditing] = useState(false);
  return (
    <PreviewPage title={editing ? 'Edit profile' : 'Profile'} onBack={onBack}>
      <View style={styles.profile}>
        <Avatar person={{ ...person, name }} size={72} />
        <AppText variant="heading" accessibilityRole="header">
          {name}
        </AppText>
        <AppText variant="secondary" tone="muted">
          Fixture profile
        </AppText>
      </View>
      {editing ? (
        <>
          <TextField
            label="Display name"
            value={draft}
            onChangeText={setDraft}
          />
          <AppButton
            label="Save preview profile"
            disabled={!draft.trim()}
            onPress={() => {
              setName(draft.trim());
              setEditing(false);
            }}
          />
        </>
      ) : (
        <AppButton
          kind="secondary"
          label="Edit profile"
          onPress={() => {
            setDraft(name);
            setEditing(true);
          }}
        />
      )}
    </PreviewPage>
  );
}

export function DirectoryPreview({
  people,
  group,
  onBack,
  onSelect,
}: {
  people: Person[];
  group: boolean;
  onBack: () => void;
  onSelect: (person: Person) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  return (
    <PreviewPage
      title={group ? 'New group' : 'New conversation'}
      onBack={onBack}
    >
      {group && (
        <TextField
          label="Group name"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Name the conversation"
        />
      )}
      <SearchField value={query} onChange={setQuery} />
      {people
        .filter((person) =>
          person.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .map((person) => (
          <PressTarget
            key={person.name}
            accessibilityRole={group ? 'checkbox' : 'button'}
            accessibilityLabel={person.name}
            {...(group && {
              accessibilityState: { checked: selected.includes(person.name) },
            })}
            onPress={() =>
              group
                ? setSelected((items) =>
                    items.includes(person.name)
                      ? items.filter((name) => name !== person.name)
                      : [...items, person.name],
                  )
                : onSelect(person)
            }
            style={({ pressed }) => [
              styles.contact,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Avatar person={person} size={36} />
            <AppText variant="section" style={{ flex: 1 }}>
              {person.name}
            </AppText>
            {group && selected.includes(person.name) && (
              <AppText variant="caption" tone="accent">
                Selected
              </AppText>
            )}
          </PressTarget>
        ))}
      {group && (
        <AppText variant="caption" tone="muted">
          Group creation is shown for design review
        </AppText>
      )}
    </PreviewPage>
  );
}

export function DetailsPreview({
  title,
  people,
  onBack,
}: {
  title: string;
  people: readonly Person[];
  onBack: () => void;
}) {
  return (
    <PreviewPage title="Conversation details" onBack={onBack}>
      <View style={styles.profile}>
        <AvatarGroup people={people} />
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      <SectionHeader
        title={people.length === 1 ? 'Participant' : 'Participants'}
      />
      {people.map((person) => (
        <SettingsRow key={person.name} icon="Users" label={person.name} />
      ))}
    </PreviewPage>
  );
}

export function AuthPreview({
  signup,
  onBack,
}: {
  signup: boolean;
  onBack: () => void;
}) {
  return (
    <PreviewPage
      title={signup ? 'Create an account' : 'Sign in'}
      onBack={onBack}
    >
      <AppText variant="display" accessibilityRole="header">
        ChatApp
      </AppText>
      {signup && <TextField label="Display name" autoComplete="name" />}
      <TextField
        label="Email"
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
      />
      <TextField
        label="Password"
        secureTextEntry
        autoComplete={signup ? 'new-password' : 'current-password'}
      />
      <AppButton disabled label={signup ? 'Create account' : 'Sign in'} />
      <AppText variant="caption" tone="muted">
        Visual preview. Account actions are disabled.
      </AppText>
    </PreviewPage>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.gutter, gap: space.md },
  profile: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  contact: {
    minHeight: space.touch,
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
});
