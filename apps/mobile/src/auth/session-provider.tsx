import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { getRandomValues } from 'expo-crypto';
import { AuthApi } from './auth-api';
import { nativeCredentials } from './native-credentials';
import { SessionManager } from './session-manager';
import { accountSchema } from '@chatapp/contracts';
import { openAccountStorage } from './account-storage';
import type { AccountScope } from './account-scope';

const Context = createContext<SessionManager | null>(null);
const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function operationId() {
  const bytes = getRandomValues(new Uint8Array(32));
  let bits = 0;
  let remaining = 0;
  let encoded = '';
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    remaining += 8;
    while (remaining >= 6) {
      remaining -= 6;
      encoded += alphabet[(bits >>> remaining) & 63];
    }
  }
  if (remaining) encoded += alphabet[(bits << (6 - remaining)) & 63];
  return encoded;
}

export function SessionProvider({
  origin,
  children,
}: {
  origin: string;
  children: ReactNode;
}) {
  const manager = useMemo(
    () =>
      new SessionManager(
        origin,
        new AuthApi(origin),
        nativeCredentials,
        operationId,
        async (userId) => {
          const db = await openAccountStorage({
            backendOrigin: origin,
            userId,
          });
          try {
            const row = await db.first<{ value: string }>(
              "SELECT value FROM sync_metadata WHERE key='profile'",
            );
            return row ? accountSchema.parse(JSON.parse(row.value)) : null;
          } finally {
            await db.close();
          }
        },
      ),
    [origin],
  );
  useEffect(() => {
    manager.start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') manager.onForeground();
    });
    return () => {
      subscription.remove();
      manager.stop();
    };
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}

export function useSession() {
  const manager = useContext(Context);
  if (!manager) throw new Error('Session provider is missing.');
  const state = useSyncExternalStore(
    manager.subscribe,
    manager.snapshot,
    manager.snapshot,
  );
  const accountScope: AccountScope | null =
    state.phase === 'authenticated'
      ? { backendOrigin: manager.origin, userId: state.user.id }
      : null;
  return { manager, state, accountScope };
}
