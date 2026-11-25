import { StyleSheet, View } from 'react-native';
import type { Appearance } from '@chatapp/contracts';
import {
  ConnectionIndicator,
  type ConnectionState,
} from '../components/feedback';
import { TextField } from '../components/fields';
import { Icon, type IconName } from '../components/icons';
import {
  AppButton,
  AppHeader,
  AppScreen,
  AppText,
  Divider,
  IconButton,
  SectionHeader,
  Surface,
  PressTarget,
} from '../components/primitives';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export function SettingsRow({
  label,
  detail,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  icon: IconName;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <Icon name={icon} />
      <View style={styles.rowCopy}>
        <AppText variant="section">{label}</AppText>
        {detail && (
          <AppText variant="caption" tone="muted">
            {detail}
          </AppText>
        )}
      </View>
      {onPress && <Icon name="ChevronRight" size={16} />}
    </>
  );
  return onPress ? (
    <PressTarget
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      {content}
    </PressTarget>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

const themeOptions = [
  { value: 'system', label: 'System', icon: 'Monitor' },
  { value: 'light', label: 'Light', icon: 'Sun' },
  { value: 'dark', label: 'Dark', icon: 'Moon' },
] as const;

export function ThemeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.themeOptions}
      accessibilityRole="radiogroup"
      accessibilityLabel="Appearance"
    >
      {themeOptions.map(({ value: option, label, icon }) => (
        <PressTarget
          key={option}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ checked: value === option, disabled }}
          disabled={disabled}
          onPress={() => onChange(option)}
          style={({ pressed }) => [
            styles.theme,
            {
              backgroundColor:
                value === option
                  ? colors.selected
                  : pressed
                    ? colors.pressed
                    : colors.surface,
              borderColor: value === option ? colors.accent : colors.border,
            },
          ]}
        >
          <Icon
            name={icon}
            color={value === option ? colors.accent : colors.secondary}
          />
          <AppText
            variant="secondary"
            tone={value === option ? 'accent' : 'text'}
          >
            {label}
          </AppText>
        </PressTarget>
      ))}
    </View>
  );
}

export type SettingsViewProps = {
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
  activeOrigin: string;
  candidate: string;
  onCandidate: (text: string) => void;
  connection: ConnectionState;
  connectionDetail?: string;
  busy?: boolean;
  verified?: boolean;
  notice?: boolean;
  onTest: () => void;
  onSave: () => void;
  onReset: () => void;
  probeId?: string;
  storageNote?: string;
  probeReady?: boolean;
  onProbe: () => void;
  onBack: () => void;
  inset?: boolean;
};

export function SettingsView({
  appearance,
  onAppearance,
  activeOrigin,
  candidate,
  onCandidate,
  connection,
  connectionDetail,
  busy = false,
  verified = false,
  notice = false,
  onTest,
  onSave,
  onReset,
  probeId,
  storageNote,
  probeReady = false,
  onProbe,
  onBack,
  inset = true,
}: SettingsViewProps) {
  return (
    <AppScreen scroll inset={inset}>
      <AppHeader
        title="Settings"
        leading={<IconButton label="Back" icon="ArrowLeft" onPress={onBack} />}
      />
      <Divider />
      <View style={styles.body}>
        <View style={styles.group}>
          <SectionHeader title="Appearance" />
          <ThemeSelector
            value={appearance}
            onChange={onAppearance}
            disabled={busy}
          />
        </View>
        <View style={styles.group}>
          <SectionHeader title="Backend" />
          <Surface>
            <SettingsRow
              label="Active server"
              detail={activeOrigin}
              icon="Wifi"
            />
            <ConnectionIndicator state={connection} />
            {notice && (
              <AppText
                variant="caption"
                tone="warning"
                accessibilityRole="alert"
              >
                The saved server is incompatible with this build. The default is
                active.
              </AppText>
            )}
            <Divider />
            <TextField
              label="Server URL"
              placeholder="https://api.example.com"
              value={candidate}
              onChangeText={onCandidate}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {connectionDetail && (
              <AppText
                variant="caption"
                tone={connection === 'unavailable' ? 'error' : 'secondary'}
                accessibilityLiveRegion="polite"
                {...(connection === 'unavailable' && {
                  accessibilityRole: 'alert' as const,
                })}
              >
                {connectionDetail}
              </AppText>
            )}
            <View style={styles.actions}>
              <AppButton
                label="Test connection"
                kind="secondary"
                loading={connection === 'checking'}
                disabled={busy}
                onPress={onTest}
              />
              <AppButton
                label="Save tested server"
                disabled={busy || !verified}
                onPress={onSave}
              />
            </View>
            <AppButton
              label="Reset to default"
              kind="quiet"
              onPress={onReset}
              disabled={busy}
            />
          </Surface>
        </View>
        <View style={styles.group}>
          <SectionHeader title="Local storage" />
          <Surface>
            <SettingsRow
              label="SQLite"
              detail="Preferences and diagnostic probe"
              icon="FileText"
            />
            {storageNote && (
              <AppText
                variant="caption"
                tone="secondary"
                accessibilityLiveRegion="polite"
              >
                {storageNote}
              </AppText>
            )}
            {probeId && (
              <AppText variant="caption" tone="muted" selectable>
                Probe ID: {probeId}
              </AppText>
            )}
            <AppButton
              label="Run SQLite check"
              onPress={onProbe}
              kind="secondary"
              disabled={busy || !probeReady}
            />
          </Surface>
        </View>
        <View style={styles.group}>
          <SectionHeader title="About" />
          <SettingsRow label="ChatApp" detail="Version 0.2.0" icon="Info" />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.gutter,
    paddingTop: space.lg,
    paddingBottom: space.section,
    gap: space.section,
  },
  group: { gap: space.sm },
  row: {
    flexDirection: 'row',
    minHeight: space.touch,
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.control,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: space.xxs },
  themeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  theme: {
    flexGrow: 1,
    flexBasis: 80,
    minHeight: space.touch,
    padding: space.xs,
    gap: space.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.control,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
