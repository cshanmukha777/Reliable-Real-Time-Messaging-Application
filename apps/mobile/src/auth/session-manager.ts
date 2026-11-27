import type {
  Account,
  LoginInput,
  ProfileInput,
  RefreshInput,
  RegisterInput,
  SessionResponse,
} from '@chatapp/contracts';
import type { CredentialStorage, StoredSession } from './credential-storage';

export interface SessionApi {
  register(input: RegisterInput): Promise<SessionResponse>;
  login(input: LoginInput): Promise<SessionResponse>;
  refresh(input: RefreshInput): Promise<SessionResponse>;
  me(token: string): Promise<Account>;
  update(input: ProfileInput, token: string): Promise<Account>;
  logout(refreshToken: string): Promise<void>;
  logoutAll(token: string): Promise<void>;
}

export type SessionState =
  | { phase: 'initializing' | 'authenticating' | 'refreshing' | 'signing-out' }
  | { phase: 'unauthenticated' | 'expired'; note?: string }
  | { phase: 'authenticated'; user: Account; offline?: true }
  | { phase: 'unavailable'; detail: string };

export function sessionRoutes(phase: SessionState['phase']) {
  return {
    signedIn: phase === 'authenticated',
    showAuth:
      phase === 'unauthenticated' ||
      phase === 'expired' ||
      phase === 'authenticating',
  };
}

export function httpStatus(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}

export class SessionManager {
  private state: SessionState = { phase: 'initializing' };
  private readonly listeners = new Set<() => void>();
  private saved: StoredSession | null = null;
  private access: { token: string; expires: number } | null = null;
  private refreshFlight: Promise<void> | undefined;
  private authentication: Promise<void> | undefined;
  private restoration: Promise<void> | undefined;
  private signOutFlight: Promise<void> | undefined;
  private closing = false;
  private logoutRequired = false;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly origin: string;
  private readonly api: SessionApi;
  private readonly storage: CredentialStorage;
  private readonly operationId: () => string;
  private readonly offlineProfile: ((userId: string) => Promise<Account | null>) | undefined;

  constructor(
    origin: string,
    api: SessionApi,
    storage: CredentialStorage,
    operationId: () => string,
    offlineProfile?: (userId: string) => Promise<Account | null>,
  ) {
    this.origin = origin;
    this.api = api;
    this.storage = storage;
    this.operationId = operationId;
    this.offlineProfile = offlineProfile;
  }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SessionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  start() {
    this.active = true;
    if (this.access && this.access.expires > Date.now()) this.schedule();
    else if (this.state.phase === 'initializing') void this.restore();
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
  }

  restore() {
    if (this.logoutRequired) return this.signOut();
    this.restoration ??= this.readAndRefresh().finally(() => {
      this.restoration = undefined;
    });
    return this.restoration;
  }

  private async readAndRefresh() {
    if (this.closing || this.authentication) return;
    this.publish({ phase: 'initializing' });
    try {
      const stored = await this.storage.read();
      if (this.closing) return;
      if (stored && stored.origin !== this.origin) {
        await this.storage.clear();
        this.saved = null;
        this.publish({
          phase: 'unauthenticated',
          note: 'Sign in to this server.',
        });
        return;
      }
      this.saved = stored;
      if (stored?.retired) {
        this.logoutRequired = true;
        try {
          await this.storage.clear();
          this.saved = null;
          this.logoutRequired = false;
          const revoked = await this.api.logout(stored.refreshToken).then(
            () => true,
            () => false,
          );
          this.publish({
            phase: 'unauthenticated',
            ...(!revoked && {
              note: 'Signed out on this device. The server couldn’t be reached.',
            }),
          });
        } catch {
          this.publish({
            phase: 'unavailable',
            detail:
              'Couldn’t clear the signed-out session. Unlock your device and try again.',
          });
        }
        return;
      }
      if (stored) await this.refresh(true);
      else this.publish({ phase: 'unauthenticated' });
    } catch {
      if (!this.closing && this.state.phase === 'initializing') {
        this.publish({
          phase: 'unavailable',
          detail:
            'Couldn’t open secure storage. Unlock your device and try again.',
        });
      }
    }
  }

  signIn(input: LoginInput) {
    return this.authenticate(() => this.api.login(input));
  }
  register(input: RegisterInput) {
    return this.authenticate(() => this.api.register(input));
  }

  private authenticate(request: () => Promise<SessionResponse>) {
    if (
      this.authentication ||
      this.closing ||
      !['unauthenticated', 'expired'].includes(this.state.phase)
    ) {
      return Promise.reject(
        new Error('A session operation is already in progress.'),
      );
    }
    this.publish({ phase: 'authenticating' });
    this.authentication = (async () => {
      let issued: SessionResponse | undefined;
      try {
        issued = await request();
        await this.accept(issued);
      } catch (error) {
        if (issued)
          await this.api.logout(issued.refreshToken).catch(() => undefined);
        if (!this.closing) this.publish({ phase: 'unauthenticated' });
        throw error;
      }
    })().finally(() => {
      this.authentication = undefined;
    });
    return this.authentication;
  }

  private async accept(result: SessionResponse) {
    const stored = {
      origin: this.origin,
      userId: result.user.id,
      refreshToken: result.refreshToken,
    };
    const expires = Date.parse(result.accessExpiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now())
      throw new Error('Session already expired.');
    await this.storage.write(stored);
    this.saved = stored;
    if (this.closing) return;
    this.access = { token: result.accessToken, expires };
    this.publish({ phase: 'authenticated', user: result.user });
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.active || !this.access) return;
    this.timer = setTimeout(
      () => {
        void this.refresh().catch(() => undefined);
      },
      Math.max(0, this.access.expires - Date.now()),
    );
  }

  refresh(restoreUser = false) {
    if (this.refreshFlight) return this.refreshFlight;
    if (this.closing || !this.saved || this.saved.origin !== this.origin)
      return Promise.reject(new Error('No session to refresh.'));
    clearTimeout(this.timer);
    this.access = null;
    if (this.state.phase !== 'authenticated')
      this.publish({ phase: 'refreshing' });
    this.refreshFlight = this.rotate(this.saved, restoreUser).finally(() => {
      this.refreshFlight = undefined;
    });
    return this.refreshFlight;
  }

  private async rotate(stored: StoredSession, restoreUser: boolean) {
    try {
      const operation = stored.pendingOperation ?? this.operationId();
      const pending = { ...stored, pendingOperation: operation };
      if (!stored.pendingOperation) {
        await this.storage.write(pending);
        this.saved = pending;
      }
      const refreshed = await this.api.refresh({
        refreshToken: stored.refreshToken,
        operationId: operation,
      });
      if (refreshed.user.id !== stored.userId)
        throw new Error('Unexpected account on refresh.');
      const user = restoreUser
        ? await this.api.me(refreshed.accessToken)
        : refreshed.user;
      if (user.id !== stored.userId) throw new Error('Unexpected account.');
      await this.accept({ ...refreshed, user });
    } catch (error) {
      if (httpStatus(error) === 401) {
        try {
          await this.storage.clear();
          this.saved = null;
          if (!this.closing)
            this.publish({
              phase: 'expired',
              note: 'Your session expired. Sign in again.',
            });
        } catch {
          if (!this.closing)
            this.publish({
              phase: 'unavailable',
              detail:
                'Couldn’t clear the expired session. Unlock your device and retry.',
            });
        }
      } else if (!this.closing && this.state.phase !== 'authenticated') {
        const status = httpStatus(error);
        const transient = error instanceof TypeError ||
          (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ||
          status === 408 || status === 429 || (status !== undefined && status >= 500);
        const cached = transient
          ? await this.offlineProfile?.(stored.userId).catch(() => null)
          : null;
        if (this.closing) throw error;
        if (cached?.id === stored.userId) {
          this.publish({ phase: 'authenticated', user: cached, offline: true });
          throw error;
        }
        this.publish({
          phase: 'unavailable',
          detail:
            'Couldn’t restore your session. Check your connection and try again.',
        });
      }
      throw error;
    }
  }

  onForeground() {
    if (this.state.phase === 'authenticated' && (!this.access || this.access.expires <= Date.now()))
      void this.refresh().catch(() => undefined);
  }

  async authorized<T>(request: (access: string) => Promise<T>): Promise<T> {
    if (this.closing) throw new Error('Session is closing.');
    if (!this.access || this.access.expires <= Date.now()) await this.refresh();
    const token = this.access?.token;
    if (!token || this.closing) throw new Error('No access token.');
    try {
      return await request(token);
    } catch (error) {
      if (httpStatus(error) !== 401 || this.closing) throw error;
      if (this.access?.token === token) await this.refresh();
      if (!this.access || this.closing) throw error;
      return await request(this.access.token);
    }
  }

  async updateProfile(input: ProfileInput) {
    const account = await this.authorized((access) =>
      this.api.update(input, access),
    );
    if (
      !this.closing &&
      this.state.phase === 'authenticated' &&
      this.state.user.id === account.id
    ) {
      this.publish({ phase: 'authenticated', user: account });
    }
    return account;
  }

  signOut(all = false) {
    this.signOutFlight ??= this.closeSession(all).finally(() => {
      this.signOutFlight = undefined;
    });
    return this.signOutFlight;
  }

  private async closeSession(all: boolean) {
    if (all) await this.authorized((access) => this.api.logoutAll(access));
    this.closing = true;
    this.logoutRequired = true;
    this.access = null;
    clearTimeout(this.timer);
    this.publish({ phase: 'signing-out' });
    try {
      await Promise.allSettled([
        this.authentication,
        this.refreshFlight,
        this.restoration,
      ]);
      const saved = this.saved ?? (await this.storage.read());
      let cleared = false;
      if (saved && saved.origin === this.origin) {
        await this.storage
          .write({ ...saved, retired: true })
          .catch(() => undefined);
      }
      try {
        await this.storage.clear();
        this.saved = null;
        cleared = true;
        this.logoutRequired = false;
      } finally {
        const revoked =
          all || !saved || saved.origin !== this.origin
            ? true
            : await this.api.logout(saved.refreshToken).then(
                () => true,
                () => false,
              );
        if (cleared)
          this.publish({
            phase: 'unauthenticated',
            ...(!revoked && {
              note: 'Signed out on this device. The server couldn’t be reached.',
            }),
          });
      }
    } catch (error) {
      this.publish({
        phase: 'unavailable',
        detail:
          'Couldn’t clear secure storage. Unlock your device and try signing out again.',
      });
      throw error;
    } finally {
      this.closing = false;
    }
  }
}
