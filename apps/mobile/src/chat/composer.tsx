import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, IconButton } from '../components/primitives';
import { useTheme } from '../design/theme';
import { radius, space, type } from '../design/tokens';
import { AttachmentPreview, type Attachment } from './attachments';

export type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onRemoveAttachment?: () => void;
  attachment?: Attachment;
  offline?: boolean;
  sending?: boolean;
  progress?: number;
  error?: string;
  disabled?: boolean;
};

export function MessageComposer({
  value,
  onChange,
  onSend,
  onAttach,
  onRemoveAttachment,
  attachment,
  offline = false,
  sending = false,
  progress,
  error,
  disabled = false,
}: ComposerProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const occupied = !!value.trim() || !!attachment;
  return (
    <View
      style={[
        styles.composer,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      {attachment && (
        <AttachmentPreview
          compact
          attachment={attachment}
          {...(progress !== undefined && { progress })}
          {...(!sending && !disabled && onRemoveAttachment
            ? { onRemove: onRemoveAttachment }
            : {})}
        />
      )}
      {error && (
        <AppText
          variant="caption"
          tone="error"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </AppText>
      )}
      <View style={styles.controls}>
        <IconButton
          icon="Paperclip"
          label="Add attachment"
          onPress={onAttach}
          disabled={disabled || sending}
        />
        <TextInput
          accessibilityLabel="Message"
          value={value}
          onChangeText={onChange}
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          editable={!disabled && !sending}
          multiline
          textAlignVertical="center"
          maxLength={4000}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
          ]}
        />
        <IconButton
          icon="ArrowUp"
          label={offline ? 'Queue message' : 'Send message'}
          filled
          onPress={onSend}
          disabled={disabled || !occupied}
          loading={sending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
  },
  controls: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  input: {
    ...type.input,
    minWidth: 0,
    flex: 1,
    minHeight: space.touch,
    maxHeight: 128,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
  },
});
