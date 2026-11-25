import { Platform, type TextStyle } from 'react-native';

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  gutter: 24,
  section: 32,
  xl: 40,
  touch: 48,
  nav: 64,
} as const;
export const radius = {
  small: 6,
  control: 10,
  surface: 16,
  bubble: 18,
  avatar: 40,
} as const;
export const motion = { feedback: 120, enter: 160 } as const;
export const measure = { screen: 640, thread: 560 } as const;

const serif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, serif',
});
export const type = {
  display: {
    fontFamily: serif,
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -1.2,
    fontWeight: '400',
  },
  displayCompact: {
    fontFamily: serif,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -0.8,
    fontWeight: '400',
  },
  heading: { fontSize: 23, lineHeight: 30, fontWeight: '600' },
  section: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  secondary: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  input: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  message: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  time: {
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
  },
} satisfies Record<string, TextStyle>;
export type TextVariant = keyof typeof type;
