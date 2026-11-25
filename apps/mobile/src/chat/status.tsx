import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '../components/icons';
import { AppText } from '../components/primitives';
import { useTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

const statusSpec = {
  queued: {
    label: 'Queued',
    description: 'Saved on this device, waiting for a connection',
    stop: 0,
    icon: 'Clock3',
  },
  sending: {
    label: 'Sending',
    description: 'Sending to the server',
    stop: 1,
    icon: 'LoaderCircle',
  },
  sent: {
    label: 'Sent',
    description: 'Saved by the server',
    stop: 1,
    icon: 'Check',
  },
  delivered: {
    label: 'Delivered',
    description: 'Received by the recipient',
    stop: 2,
    icon: 'CheckCheck',
  },
  read: {
    label: 'Read',
    description: 'Opened by the recipient',
    stop: 3,
    icon: 'CheckCheck',
  },
  failed: {
    label: 'Failed',
    description:
      'Couldn’t send. Retry is available when supported by the conversation.',
    stop: 0,
    icon: 'CircleAlert',
  },
} satisfies Record<
  string,
  { label: string; description: string; stop: number; icon: IconName }
>;
export type DeliveryStatus = keyof typeof statusSpec;
export const deliveryStates = Object.keys(statusSpec) as DeliveryStatus[];

export function MessageStatus({ status }: { status: DeliveryStatus }) {
  const { colors } = useTheme();
  const { label, description, stop, icon } = statusSpec[status];
  const color = colors[status];
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== status && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(`${label}. ${description}`);
    }
    previous.current = status;
  }, [description, label, status]);

  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${description}`}
      style={styles.status}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rail}
      >
        <View style={[styles.track, { backgroundColor: colors.signalTrack }]} />
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.stop,
              {
                borderColor: index <= stop ? color : colors.signalTrack,
                backgroundColor:
                  index <= stop &&
                  !(status === 'sending' && index === stop) &&
                  status !== 'failed'
                    ? color
                    : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      <Icon name={icon} size={14} color={color} />
      <AppText
        variant="caption"
        style={{ color }}
        accessibilityLiveRegion="polite"
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    flexWrap: 'wrap',
  },
  rail: {
    width: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginRight: space.xxs,
  },
  track: {
    position: 'absolute',
    left: 2,
    right: 2,
    height: StyleSheet.hairlineWidth,
  },
  stop: { width: 6, height: 6, borderWidth: 1, borderRadius: radius.small },
});
