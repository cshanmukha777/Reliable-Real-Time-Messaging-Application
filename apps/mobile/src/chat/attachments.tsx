import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Icon } from '../components/icons';
import { PressTarget, AppText, IconButton } from '../components/primitives';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export type Attachment = {
  id?: string;
  photo?: boolean;
  name: string;
  detail: string;
  image?: { source: ImageSourcePropType; description: string };
};

export function AttachmentPreview({
  attachment,
  compact = false,
  progress,
  onOpen,
  onRemove,
}: {
  attachment: Attachment;
  compact?: boolean;
  progress?: number;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  const percent =
    progress === undefined
      ? undefined
      : Math.round(Math.max(0, Math.min(100, progress)));
  const metadata = (
    <View style={styles.metadata}>
      <Icon name={attachment.image || attachment.photo ? 'Image' : 'FileText'} />
      <View style={styles.metadataText}>
        <AppText variant="caption" numberOfLines={2}>
          {attachment.name}
        </AppText>
        <AppText variant="caption" tone="muted">
          {attachment.detail}
        </AppText>
      </View>
      {onOpen && !onRemove && <Icon name="ChevronRight" size={16} />}
    </View>
  );
  const content = (
    <>
      {!compact && attachment.image && (
        <View style={styles.photoFrame}>
          <Image
            source={attachment.image.source}
            accessibilityLabel={attachment.image.description}
            accessible
            style={styles.photoFill}
            resizeMode="cover"
          />
        </View>
      )}
      {metadata}
    </>
  );
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.fileRow}>
        {onOpen ? (
          <PressTarget
            accessibilityRole="button"
            accessibilityLabel={`Open ${attachment.name}, ${attachment.detail}${attachment.image ? `, ${attachment.image.description}` : ''}`}
            style={({ pressed }) => [styles.fill, pressed && { opacity: 0.8 }]}
            onPress={onOpen}
          >
            {content}
          </PressTarget>
        ) : (
          <View style={styles.fill}>{content}</View>
        )}
        {onRemove && (
          <IconButton
            icon="X"
            label={`Remove ${attachment.name}`}
            onPress={onRemove}
          />
        )}
      </View>
      {percent !== undefined && (
        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel="Attachment upload"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View style={[styles.track, { backgroundColor: colors.elevated }]}>
            <View
              style={[
                styles.bar,
                { backgroundColor: colors.accent, width: `${percent}%` },
              ]}
            />
          </View>
          <AppText variant="time" tone="secondary">
            {percent}%
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1, minWidth: 0 },
  photoFrame: { width: '100%', aspectRatio: 2.05, overflow: 'hidden' },
  photoFill: { width: '100%', height: '100%' },
  metadata: {
    minHeight: space.touch,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.xs,
    gap: space.xs,
  },
  metadataText: { flex: 1, minWidth: 0 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
  },
  track: { flex: 1, height: 4, borderRadius: radius.small, overflow: 'hidden' },
  bar: { height: '100%' },
});
