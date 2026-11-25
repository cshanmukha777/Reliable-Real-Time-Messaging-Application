import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Icon, type IconName } from './icons';
import { AppButton, AppText } from './primitives';

function Feedback({
  title,
  detail,
  icon,
  action,
}: {
  title: string;
  detail: string;
  icon: IconName;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <View style={[styles.symbol, { backgroundColor: colors.elevated }]}>
        <Icon name={icon} size={24} />
      </View>
      <AppText accessibilityRole="header" variant="heading">
        {title}
      </AppText>
      <AppText variant="secondary" tone="secondary" style={styles.center}>
        {detail}
      </AppText>
      {action && (
        <AppButton
          label={action.label}
          kind="secondary"
          onPress={action.onPress}
        />
      )}
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Feedback
      title={title}
      detail={detail}
      icon="Inbox"
      {...(action && { action })}
    />
  );
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
}: {
  title?: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <Feedback
      title={title}
      detail={detail}
      icon="CircleAlert"
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

export function LoadingState({
  label = 'Opening ChatApp…',
}: {
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.state}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={colors.accent} />
      <AppText variant="secondary" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

export type ConnectionState =
  | 'online'
  | 'offline'
  | 'checking'
  | 'unavailable'
  | 'untested';
const connectionLabels: Record<ConnectionState, string> = {
  online: 'Connected',
  offline: 'Offline',
  checking: 'Checking connection…',
  unavailable: 'Connection unavailable',
  untested: 'Connection untested',
};

export function ConnectionIndicator({
  state,
  label = connectionLabels[state],
}: {
  state: ConnectionState;
  label?: string;
}) {
  const { colors } = useTheme();
  const isWarning = state === 'offline' || state === 'unavailable';
  const color = isWarning
    ? colors.warning
    : state === 'online'
      ? colors.success
      : colors.muted;
  return (
    <View style={styles.indicator}>
      <Icon
        name={isWarning ? 'WifiOff' : state === 'checking' ? 'Clock3' : 'Wifi'}
        color={color}
        size={16}
      />
      <AppText
        accessibilityLiveRegion="polite"
        variant="caption"
        style={{ color, flexShrink: 1 }}
      >
        {label}
      </AppText>
    </View>
  );
}

export function OfflineBanner({
  detail = 'Messages will send when you reconnect',
}: {
  detail?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: colors.warningSurface }]}>
      <ConnectionIndicator state="offline" />
      <AppText
        variant="caption"
        tone="warning"
        style={{ flex: 1 }}
        accessibilityLiveRegion="polite"
      >
        {detail}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingHorizontal: space.section,
    paddingVertical: space.section,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  symbol: {
    width: space.touch,
    height: space.touch,
    borderRadius: radius.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  indicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.xs,
    flexShrink: 1,
  },
  banner: {
    borderRadius: radius.control,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
