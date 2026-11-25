import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { radius, space, type } from '../design/tokens';
import { useTheme } from '../design/theme';
import { AppText, IconButton } from './primitives';
import { Icon } from './icons';

export function TextField({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText variant="caption">{label}</AppText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error
              ? colors.error
              : focused
                ? colors.accent
                : colors.control,
          },
          input.style,
        ]}
      />
      {error ? (
        <AppText variant="caption" tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      ) : (
        hint && (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        )
      )}
    </View>
  );
}

export function SearchField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.search,
        {
          backgroundColor: colors.elevated,
          borderColor: focused ? colors.accent : 'transparent',
        },
      ]}
    >
      <Icon name="Search" />
      <TextInput
        accessibilityLabel="Search conversations"
        placeholder="Search conversations"
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.searchInput, { color: colors.text }]}
      />
      {value !== '' && (
        <IconButton
          icon="X"
          label="Clear search"
          onPress={() => onChange('')}
          disabled={disabled}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  input: {
    ...type.input,
    ...Platform.select({ web: { outlineWidth: 0 } }),
    padding: space.sm,
    minHeight: space.touch,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingLeft: space.sm,
  },
  searchInput: {
    ...type.input,
    ...Platform.select({ web: { outlineWidth: 0 } }),
    flex: 1,
    minWidth: 0,
    minHeight: space.touch,
    paddingRight: space.sm,
  },
});
