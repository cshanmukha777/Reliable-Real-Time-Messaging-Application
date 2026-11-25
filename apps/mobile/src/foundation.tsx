import { createContext, useContext, type ReactNode } from 'react';
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
