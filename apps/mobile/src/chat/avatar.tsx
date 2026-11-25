import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { AppText } from '../components/primitives';

type AvatarTint = 'avatarFern' | 'avatarClay' | 'avatarSlate' | 'avatarPaper';
export type Person = {
  name: string;
  tint: AvatarTint;
  image?: ImageSourcePropType;
};

export function Avatar({
  person,
  size = 48,
  online = false,
}: {
  person: Person;
  size?: number;
  online?: boolean;
}) {
  const { colors } = useTheme();
  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { width: size, height: size, backgroundColor: colors[person.tint] },
      ]}
    >
      {person.image ? (
        <Image
          source={person.image}
          style={[
            StyleSheet.absoluteFill,
            { width: size, height: size, borderRadius: radius.avatar },
          ]}
        />
      ) : (
        <AppText
          variant={size < 40 ? 'caption' : 'section'}
          allowFontScaling={false}
        >
          {initials}
        </AppText>
      )}
      {online && (
        <View
          style={[
            styles.online,
            { backgroundColor: colors.success, borderColor: colors.background },
          ]}
        />
      )}
    </View>
  );
}

export function AvatarGroup({ people }: { people: readonly Person[] }) {
  const [first, second] = people;
  if (!first) return null;
  if (!second) return <Avatar person={first} />;
  return (
    <View style={styles.group}>
      <Avatar person={first} size={36} />
      <View style={styles.offset}>
        <Avatar person={second} size={32} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  online: {
    position: 'absolute',
    width: 13,
    height: 13,
    right: 0,
    bottom: 0,
    borderRadius: radius.avatar,
    borderWidth: 2,
  },
  group: { width: space.touch, height: space.touch, flexShrink: 0 },
  offset: { position: 'absolute', bottom: 0, right: 0 },
});
