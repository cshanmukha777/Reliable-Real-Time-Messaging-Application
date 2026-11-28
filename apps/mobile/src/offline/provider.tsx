import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Account } from '@chatapp/contracts';
import { accountScopeKey, type AccountScope } from '../auth/account-scope';
import {
  accountStorageDigest,
  openAccountStorage,
} from '../auth/account-storage';
import { useSession } from '../auth/session-provider';
import { useMessaging } from '../messaging/use-api';
import { putStagedFile } from '../messaging/native-files';
import { AppScreen } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/feedback';
import { accountFiles } from './files';
import { DraftWriter } from './draft-writer';
import { OfflineStore } from './store';
import { OutboxWorker } from './worker';
import { RealtimeClient } from '../realtime/client';
import { RealtimeProjection } from '../realtime/projection';

type Services = {
  store: OfflineStore;
  drafts: DraftWriter;
  files: ReturnType<typeof accountFiles>;
  worker: OutboxWorker;
  realtime: RealtimeClient;
  clean: () => Promise<void>;
  progress: (operation: string) => number | undefined;
  storageError: string;
};

const Context = createContext<Services | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { state, accountScope } = useSession();
  if (!accountScope || state.phase !== 'authenticated') return null;
  return (
    <AccountData
      key={accountScopeKey(accountScope)}
      scope={accountScope}
      user={state.user}
    >
      {children}
    </AccountData>
  );
}

function AccountData({
  children,
  scope,
  user,
}: {
  children: ReactNode;
  scope: AccountScope;
  user: Account;
}) {
  const { manager } = useSession();
  const { api } = useMessaging();
  const [services, setServices] = useState<Omit<
    Services,
    'storageError'
  > | null>(null);
  const [storageError, setStorageError] = useState('');
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const scopeRef = useRef(scope);
  const profile = useRef(user);
  profile.current = user;

  useEffect(() => {
    let current = true;
    let foreground = AppState.currentState !== 'background';
    let unsubscribe: (() => void) | undefined;
    let owned: Omit<Services, 'storageError'> | undefined;
    async function start() {
      const scope = scopeRef.current;
      const digest = await accountStorageDigest(scope);
      const files = accountFiles(digest);
      const db = await openAccountStorage(scope);
      if (!current) {
        await db.close();
        return;
      }
      const store = new OfflineStore(db, scope.userId);
      const bars = new Map<string, number>();
      const eligible = () => {
        const state = manager.snapshot();
        return (
          current &&
          foreground &&
          state.phase === 'authenticated' &&
          state.user.id === scope.userId &&
          manager.origin === scope.backendOrigin
        );
      };
      const fail = () => {
        if (current)
          setStorageError(
            'An edit could not be saved. Keep this screen open and retry.',
          );
      };
      const drafts = new DraftWriter(store, fail);
      const clean = async () => {
        for (const { id } of await store.unusedFiles()) {
          await files.discard(id);
          await store.dropFile(id);
        }
      };
      const worker = new OutboxWorker(store, {
        verify: (id, signal) => api.reconcile(id, undefined, signal, 1),
        recoverUpload: api.recoverUpload.bind(api),
        upload: async (grant, file, signal, progress) =>
          putStagedFile(grant, await files.validate(file), signal, progress),
        complete: api.complete.bind(api),
        send: api.send.bind(api),
        uuid: randomUUID,
        eligible,
        clean,
        progress: (id, value) => {
          if (!current) return;
          const percent =
            value === undefined
              ? undefined
              : Math.round(Math.min(100, Math.max(0, value)));
          if (bars.get(id) === percent) return;
          if (percent === undefined) bars.delete(id);
          else bars.set(id, percent);
          store.notify();
        },
      });
      const realtime = new RealtimeClient(
        manager,
        api,
        new RealtimeProjection(store),
        eligible,
        () => store.notify(),
      );
      owned = {
        store,
        realtime,
        files,
        drafts,
        worker,
        clean,
        progress: (id) => bars.get(id),
      };
      await store.resumeAuth(Date.now());
      if (!current) return;
      setServices(owned);
      worker.start();
      realtime.start();
      unsubscribe = manager.subscribe(() => {
        if (eligible()) realtime.tokenChanged();
        else realtime.stop();
      });
      // Stage imports may be interrupted before the draft is committed.
      void clean()
        .then(async () => {
          const known = new Set(
            (await db.all<{ id: string }>('SELECT id FROM staged_files')).map(
              ({ id }) => id,
            ),
          );
          await files.sweep(known);
        })
        .catch(() => undefined);
    }

    const events = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) {
        owned?.worker.start();
        owned?.realtime.start();
      } else if (owned) {
        owned.realtime.stop();
        void owned.worker.stop();
        void owned.drafts.flushAll().catch(() => undefined);
      }
    });
    void start().catch(() => {
      if (current) setInitializationFailed(true);
    });
    return () => {
      current = false;
      events.remove();
      unsubscribe?.();
      const currentServices = owned;
      if (currentServices) {
        void Promise.allSettled([
          currentServices.worker.stop(),
          currentServices.realtime.close(),
          currentServices.drafts.flushAll(),
        ])
          .then(() => currentServices.store.db.close())
          .catch(() => undefined);
      }
    };
  }, [api, manager, attempt]);

  useEffect(() => {
    if (services)
      void services.store.db
        .run(
          "INSERT OR REPLACE INTO sync_metadata VALUES ('profile',?)",
          JSON.stringify(profile.current),
        )
        .catch(() => undefined);
  }, [services, user]);

  if (!services)
    return (
      <AppScreen>
        {initializationFailed ? (
          <ErrorState
            detail="Couldn’t open this account’s messages."
            onRetry={() => {
              setInitializationFailed(false);
              setAttempt(attempt + 1);
            }}
          />
        ) : (
          <LoadingState label="Opening saved messages…" />
        )}
      </AppScreen>
    );
  return (
    <Context.Provider value={{ ...services, storageError }}>
      {children}
    </Context.Provider>
  );
}

export function useOffline() {
  const services = useContext(Context);
  if (!services) throw new Error('Offline storage provider is missing.');
  const version = useSyncExternalStore(
    services.store.subscribe,
    services.store.snapshot,
    services.store.snapshot,
  );
  return { ...services, version };
}
