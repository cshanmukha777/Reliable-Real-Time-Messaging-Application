import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import type { AppConfiguration } from '@chatapp/contracts';

export type Foundation = {
  defaultUrl: string;
  configuration: AppConfiguration;
  ignoredStoredBackend: boolean;
  updateConfiguration: (update: Partial<AppConfiguration>) => void;
};

const FoundationContext = createContext<Foundation | null>(null);

export function FoundationProvider({
  value,
  children,
}: {
  value: Foundation;
  children: ReactNode;
}) {
  return (
    <FoundationContext.Provider value={value}>
      {children}
    </FoundationContext.Provider>
  );
}

export function useFoundation() {
  const context = useContext(FoundationContext);
  if (!context) throw new Error('Foundation provider is missing.');
  return context;
}

export function usePalette(
  appearance: AppConfiguration['appearance'] = 'system',
) {
  const system = useColorScheme();
  const dark =
    appearance === 'dark' || (appearance === 'system' && system === 'dark');
  return dark
    ? {
        dark,
        background: '#101518',
        foreground: '#edf4f2',
        muted: '#a8c0bc',
        accent: '#8fdbca',
        border: '#536c67',
      }
    : {
        dark,
        background: '#f5f9f8',
        foreground: '#132724',
        muted: '#455b54',
        accent: '#006350',
        border: '#6d8079',
      };
}

export const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  content: { padding: 24, gap: 16 },
  heading: { fontSize: 29, fontWeight: '700' },
  label: { fontSize: 16, fontWeight: '600' },
  text: { fontSize: 16, lineHeight: 23 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
});
