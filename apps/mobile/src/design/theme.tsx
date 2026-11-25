import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import type { Appearance } from '@chatapp/contracts';
import { dark, light } from './palette';

const ThemeContext = createContext({ colors: light, isDark: false });

export function ThemeProvider({
  appearance = 'system',
  children,
}: {
  appearance?: Appearance;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const isDark =
    appearance === 'dark' || (appearance === 'system' && system === 'dark');
  return (
    <ThemeContext.Provider value={isDark ? night : day}>
      {children}
    </ThemeContext.Provider>
  );
}

const day = { colors: light, isDark: false };
const night = { colors: dark, isDark: true };
export const useTheme = () => useContext(ThemeContext);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
