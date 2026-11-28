import type { Draft, OfflineStore } from './store.ts';

type Pending = { draft: Draft; write: Promise<void>; failed: boolean };

export class DraftWriter {
  private readonly store: OfflineStore;
  private readonly onError: () => void;
  private readonly pending = new Map<string, Pending>();

  constructor(store: OfflineStore, onError: () => void) {
    this.store = store;
    this.onError = onError;
  }

  edit(id: string, draft: Draft) {
    const prior = this.pending.get(id);
    const write = (prior?.write.catch(() => undefined) ?? Promise.resolve())
      .then(() => this.store.saveDraft(id, draft));
    const pending = { draft, write, failed: false };
    this.pending.set(id, pending);
    void write.then(
      () => { if (this.pending.get(id) === pending) this.pending.delete(id); },
      () => { pending.failed = true; this.onError(); },
    );
    return write;
  }

  async flush(id: string) {
    while (this.pending.has(id)) {
      const pending = this.pending.get(id);
      if (!pending) break;
      await (pending.failed ? this.edit(id, pending.draft) : pending.write);
    }
  }

  async flushAll() {
    await Promise.all([...this.pending.keys()].map((id) => this.flush(id)));
  }
}
