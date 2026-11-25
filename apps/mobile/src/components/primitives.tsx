import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../design/theme';
import {
  measure,
  radius,
  space,
  type,
  type TextVariant,
} from '../design/tokens';
import { Icon, type IconName } from './icons';

type TextTone =
  | 'text'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'accentText'
  | 'warning'
  | 'error';
export function AppText({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & { variant?: TextVariant; tone?: TextTone }) {
  const { colors } = useTheme();
  return (
    <Text {...props} style={[type[variant], { color: colors[tone] }, style]} />
  );
}

export function AppScreen({
  children,
  scroll = false,
  inset = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  inset?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={inset ? ['top', 'bottom', 'left', 'right'] : []}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.page, styles.screen]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function PressTarget({
  style,
  onFocus,
  onBlur,
  ...props
}: PressableProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused &&
          Platform.OS === 'web' && {
            outlineWidth: 2,
            outlineOffset: -2,
            outlineColor: colors.accent,
            outlineStyle: 'solid',
          },
      ]}
    />
  );
}

type Action = Pick<PressableProps, 'onPress' | 'testID'> & {
  label: string;
  disabled?: boolean;
  loading?: boolean;
};
export function AppButton({
  label,
  disabled = false,
  loading = false,
  kind = 'primary',
  icon,
  onPress,
  testID,
}: Action & { kind?: 'primary' | 'secondary' | 'quiet'; icon?: IconName }) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const foreground = inactive
    ? colors.muted
    : kind === 'primary'
      ? colors.accentText
      : colors.accent;
  return (
    <PressTarget
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: inactive
            ? colors.elevated
            : pressed
              ? kind === 'primary'
                ? colors.success
                : colors.pressed
              : kind === 'primary'
                ? colors.accent
                : 'transparent',
          borderColor: kind === 'secondary' ? colors.control : 'transparent',
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        icon && <Icon name={icon} color={foreground} />
      )}
      <AppText
        variant="section"
        style={{ color: foreground, flexShrink: 1, textAlign: 'center' }}
      >
        {label}
      </AppText>
    </PressTarget>
  );
}

export function IconButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  filled = false,
  testID,
}: Action & { icon: IconName; filled?: boolean }) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const color = inactive
    ? colors.muted
    : filled
      ? colors.accentText
      : colors.accent;
  return (
    <PressTarget
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: inactive
            ? colors.elevated
            : pressed && !filled
              ? colors.pressed
              : filled
                ? colors.accent
                : 'transparent',
          opacity: pressed && filled ? 0.82 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Icon name={icon} color={color} />
      )}
    </PressTarget>
  );
}

export function AppHeader({
  title,
  subtitle,
  leading,
  trailing,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {leading}
      <View style={styles.headerCopy}>
        <AppText accessibilityRole="header" variant="heading">
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      {trailing}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={[styles.rule, { backgroundColor: colors.border }, style]}
    />
  );
}

export function Surface({
  children,
  elevated = false,
  style,
}: {
  children: ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: elevated ? colors.elevated : colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.section}>
      <AppText accessibilityRole="header" variant="section">
        {title}
      </AppText>
      {detail && (
        <AppText variant="caption" tone="muted">
          {detail}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  page: {
    width: '100%',
    maxWidth: measure.screen,
    alignSelf: 'center',
    flexGrow: 1,
  },
  button: {
    minHeight: space.touch,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  iconButton: {
    width: space.touch,
    height: space.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    flexShrink: 0,
  },
  header: {
    minHeight: space.nav,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'center',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  rule: { height: StyleSheet.hairlineWidth },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.surface,
    padding: space.md,
    gap: space.sm,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: space.sm,
    rowGap: space.xxs,
  },
});
