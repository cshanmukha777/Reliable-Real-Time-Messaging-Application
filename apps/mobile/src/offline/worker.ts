import type {
  Attachment,
  Message,
  MessageInput,
  ReconciliationPage,
  UploadInput,
} from '@chatapp/contracts';
import type { Job, OfflineStore, Stage } from './store.ts';

type Grant = {
  attachment: Attachment;
  url: string;
  headers: Record<string, string>;
};
type Recovery = Grant | { attachment: Attachment; ready: true };
type Dependencies = {
  verify: (
    conversation: string,
    signal: AbortSignal,
  ) => Promise<ReconciliationPage>;
  recoverUpload: (
    id: string,
    fileId: string,
    input: UploadInput,
    signal: AbortSignal,
  ) => Promise<Recovery>;
  upload: (
    grant: Grant,
    file: Stage,
    signal: AbortSignal,
    progress: (value: number) => void,
  ) => Promise<void>;
  complete: (
    id: string,
    attachmentId: string,
    signal: AbortSignal,
  ) => Promise<Attachment>;
  send: (
    id: string,
    input: MessageInput,
    signal: AbortSignal,
  ) => Promise<Message>;
  uuid: () => string;
  eligible: () => boolean;
  now?: () => number;
  random?: () => number;
  progress?: (operation: string, value: number | undefined) => void;
  clean?: () => Promise<void>;
};

export const leaseDuration = 45_000;

export function classify(
  error: unknown,
  attempts: number,
  random = Math.random,
) {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : undefined;
  const code =
    error instanceof Error
      ? 'code' in error && typeof error.code === 'string'
        ? error.code
        : error.message
      : '';
  const retryAfter =
    error &&
    typeof error === 'object' &&
    'retryAfter' in error &&
    typeof error.retryAfter === 'number'
      ? error.retryAfter
      : 0;
  const delay =
    Math.min(300_000, 2000 * 2 ** Math.min(attempts - 1, 10)) *
    (0.5 + random() * 0.5);
  if (status === 401)
    return { state: 'BLOCKED_AUTH', code: 'SIGN_IN', delay: 0 } as const;
  if (status === 403 || status === 404)
    return {
      state: 'BLOCKED_ACCESS',
      code: 'ACCESS_REVOKED',
      delay: 0,
    } as const;
  if (status === 429)
    return {
      state: 'RETRY_WAIT',
      code: 'RATE_LIMITED',
      delay: Math.max(delay, retryAfter),
    } as const;
  if (status === 408 || (typeof status === 'number' && status >= 500))
    return { state: 'RETRY_WAIT', code: 'TEMPORARY', delay } as const;
  if (code === 'FILE_MISSING' || code === 'FILE_CHANGED')
    return { state: 'FAILED', code, delay: 0 } as const;
  if (
    (typeof status === 'number' && status >= 400) ||
    code === 'ATTACHMENT_ID_CHANGED' ||
    code === 'UNEXPECTED_ORIGIN'
  )
    return {
      state: 'FAILED',
      code:
        status === 409
          ? 'CONFLICT'
          : status === 413
            ? 'FILE_TOO_LARGE'
            : 'REJECTED',
      delay: 0,
    } as const;
  return { state: 'RETRY_WAIT', code: 'CONNECTION', delay } as const;
}

export class OutboxWorker {
  private readonly store: OfflineStore;
  private readonly dependencies: Dependencies;
  private readonly now: () => number;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<void>;
  private controller?: AbortController;
  private running = false;
  private wakePending = false;

  constructor(store: OfflineStore, dependencies: Dependencies) {
    this.store = store;
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
  }

  start() {
    this.running = true;
    this.wake();
  }

  async stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    await this.flight;
  }

  wake = () => {
    if (!this.running) return;
    clearTimeout(this.timer);
    if (this.flight) {
      this.wakePending = true;
      return;
    }
    this.flight = this.drain()
      .catch(() => {
        if (this.running) this.timer = setTimeout(this.wake, 2000);
      })
      .finally(() => {
        delete this.flight;
        if (this.wakePending) {
          this.wakePending = false;
          this.wake();
        }
      });
  };

  private async drain() {
    while (
      this.running &&
      this.dependencies.eligible() &&
      (await this.processNext())
    ) {
      // Each durable claim has independent recovery.
    }
    if (!this.running || !this.dependencies.eligible()) return;
    const next = (await this.store.wakeTime())?.time;
    if (next != null && this.running)
      this.timer = setTimeout(
        this.wake,
        Math.min(2_147_483_647, Math.max(100, next - this.now())),
      );
  }

  async processNext() {
    if (!this.dependencies.eligible()) return false;
    const controller = new AbortController();
    this.controller = controller;
    const claimTime = this.now();
    const job = await this.store.claim(
      this.dependencies.uuid(),
      claimTime,
      claimTime + leaseDuration,
    );
    if (!job) return false;
    const guard = () => {
      if (controller.signal.aborted || !this.dependencies.eligible())
        throw new Error('SCOPE_PAUSED');
    };
    const heartbeat = setInterval(() => {
      if (!this.dependencies.eligible()) controller.abort();
      else {
        const now = this.now();
        void this.store.renew(job, now, now + leaseDuration).then(
          (owned) => {
            if (!owned) controller.abort();
          },
          () => controller.abort(),
        );
      }
    }, 10_000);
    try {
      guard();
      const revision = this.store.membershipRevision();
      const page = await this.dependencies.verify(
        job.conversation_id,
        controller.signal,
      );
      guard();
      await this.store.applyHistory(
        job.conversation_id,
        page,
        this.now(),
        undefined,
        revision,
      );
      if (revision !== this.store.membershipRevision())
        throw new Error('MEMBERSHIP_CHANGED');
      await this.dependencies.clean?.().catch(() => undefined);
      const attachment = await this.store.attachment(job.id);
      if (attachment) await this.store.phase(job, 'UPLOADING', this.now());
      const attachmentIds = attachment
        ? [await this.prepare(job, attachment, controller.signal, guard)]
        : [];
      await this.store.phase(job, 'SENDING', this.now());
      guard();
      const message = await this.dependencies.send(
        job.conversation_id,
        {
          clientMessageId: job.id,
          body: job.body,
          attachmentIds,
        },
        controller.signal,
      );
      guard();
      await this.store.confirm(job, message, this.now());
      await this.dependencies.clean?.().catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted || !this.dependencies.eligible()) {
        await this.store.fail(
          job,
          'RETRY_WAIT',
          'PAUSED',
          this.now(),
          this.now(),
        );
      } else {
        const result = classify(error, job.attempts, this.dependencies.random);
        await this.store.fail(
          job,
          result.state,
          result.code,
          this.now() + result.delay,
          this.now(),
        );
      }
    } finally {
      clearInterval(heartbeat);
      this.dependencies.progress?.(job.id, undefined);
      delete this.controller;
    }
    return true;
  }

  private async prepare(
    job: Job,
    attachment: { file: Stage; serverId: string | null },
    signal: AbortSignal,
    guard: () => void,
  ) {
    guard();
    const grant = await this.dependencies.recoverUpload(
      job.conversation_id,
      attachment.file.id,
      attachment.file.input,
      signal,
    );
    guard();
    await this.store.freezeAttachment(job, grant.attachment.id, this.now());
    if (!('ready' in grant)) {
      await this.dependencies.upload(grant, attachment.file, signal, (value) =>
        this.dependencies.progress?.(job.id, value),
      );
      guard();
      await this.dependencies.complete(
        job.conversation_id,
        grant.attachment.id,
        signal,
      );
    }
    return grant.attachment.id;
  }
}
