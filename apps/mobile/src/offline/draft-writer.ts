import type { Draft, OfflineStore } from './store.ts';

type Pending = { draft: Draft; timer: ReturnType<typeof setTimeout> };
export class DraftWriter {
  private readonly store: OfflineStore;
  private readonly onError: () => void;
  private readonly pending = new Map<string, Pending>();

  constructor(store: OfflineStore, onError: () => void) {
    this.store = store;
    this.onError = onError;
  }

  edit(id: string, draft: Draft) {
    clearTimeout(this.pending.get(id)?.timer);
    const timer = setTimeout(() => { void this.flush(id).catch(this.onError); }, 180);
    this.pending.set(id, { draft,timer });
  }

  async flush(id: string) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    // Leave the latest revision in memory until its transaction commits.
    await this.store.saveDraft(id,pending.draft);
    if (this.pending.get(id) === pending) this.pending.delete(id);
  }

  async flushAll() {
    await Promise.all([...this.pending.keys()].map((id) => this.flush(id)));
  }
}
