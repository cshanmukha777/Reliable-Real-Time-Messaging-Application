import type {
  Availability,
  MembershipView,
  ReceiptStage,
} from '@chatapp/contracts';
import type { MessagingApi } from '../messaging/api.ts';
import type { RealtimeProjection } from './projection.ts';

type Transport = Pick<
  MessagingApi,
  | 'accountEvents'
  | 'accountSnapshot'
  | 'conversationEvents'
  | 'conversationSnapshot'
  | 'acknowledge'
>;
type Access = () => boolean;
const unavailable = (error: unknown) =>
  error instanceof Error &&
  'status' in error &&
  [403, 404].includes(Number(error.status));

export class ReplayEngine {
  private readonly projection: RealtimeProjection;
  private readonly api: Transport;
  private readonly userId: string;
  private accountDirty = false;
  private accountTarget = 0;
  private targets = new Map<string, number>();
  private forced = new Set<string>();
  private flight?: Promise<void>;

  constructor(projection: RealtimeProjection, api: Transport) {
    this.projection = projection;
    this.api = api;
    this.userId = projection.store.userId;
  }

  probe() {
    this.accountDirty = true;
  }

  hint(hint: Availability) {
    if (hint.stream === 'ACCOUNT') {
      if (hint.streamId === this.userId)
        this.accountTarget = Math.max(this.accountTarget, hint.highWater);
      return;
    }
    // Active membership is still checked against the durable account projection.
    if (this.targets.size >= 32 && !this.targets.has(hint.streamId)) {
      this.probe();
      return;
    }
    this.targets.set(
      hint.streamId,
      Math.max(hint.highWater, this.targets.get(hint.streamId) ?? 0),
    );
  }

  checkThread(id: string) {
    this.forced.add(id);
  }

  async run(signal: AbortSignal, eligible: Access) {
    if (this.flight) return this.flight;
    if (signal.aborted || !eligible()) return;
    const current = () => !signal.aborted && eligible();
    const work = this.drain(signal, current).finally(() => {
      if (this.flight === work) delete this.flight;
    });
    this.flight = work;
    await work;
  }

  private async drain(signal: AbortSignal, current: Access) {
    while (current()) {
      const accountCursor =
        (await this.projection.cursor('ACCOUNT', this.userId))?.cursor ?? -1;
      if (this.accountDirty || accountCursor < this.accountTarget) {
        this.accountDirty = false;
        try {
          await this.pullAccount(signal, current);
        } catch (error) {
          this.probe();
          throw error;
        }
      }
      if (!current()) return;
      const threads = await this.projection.conversations();
      const known = new Map(threads.map((row) => [row.id, row.cursor]));
      for (const [id, hint] of this.targets) {
        const cursor = known.get(id);
        if (cursor === undefined || cursor >= hint) this.targets.delete(id);
      }
      for (const id of this.forced) if (!known.has(id)) this.forced.delete(id);
      const thread = threads.find(
        (row) =>
          this.forced.has(row.id) ||
          row.cursor < Math.max(row.high_water, this.targets.get(row.id) ?? 0),
      );
      if (thread) {
        this.targets.delete(thread.id);
        this.forced.delete(thread.id);
        try {
          await this.pullThread(thread.id, thread.cursor, signal, current);
        } catch (error) {
          if (unavailable(error) && current())
            await this.projection.release(thread.id);
          else throw error;
        }
        continue;
      }
      if (this.accountDirty) continue;
      const pending = await this.projection.receipts();
      for (const receipt of pending) {
        if (!current()) return;
        const stage: ReceiptStage =
          receipt.desired === 2 ? 'READ' : 'DELIVERED';
        try {
          await this.api.acknowledge(
            receipt.conversation_id,
            receipt.message_id,
            stage,
            signal,
          );
        } catch (error) {
          if (!unavailable(error)) throw error;
        }
        if (current()) await this.projection.acknowledge(receipt, stage);
      }
      if (!pending.length && !this.accountDirty) return;
    }
  }

  private async pullAccount(signal: AbortSignal, current: Access) {
    let cursor = (await this.projection.cursor('ACCOUNT', this.userId))?.cursor;
    if (cursor === undefined) {
      await this.rebaseAccount(signal, current);
      cursor = (await this.projection.cursor('ACCOUNT', this.userId))?.cursor;
    }
    while (current() && cursor !== undefined) {
      const page = await this.api.accountEvents(cursor, signal);
      if (!current()) return;
      if (page.stream !== 'ACCOUNT' || page.streamId !== this.userId)
        throw new Error('ACCOUNT_SCOPE');
      if (page.snapshotRequired) {
        const reset = cursor > page.highWater;
        if (reset) {
          this.accountTarget = 0;
          this.targets.clear();
        }
        await this.rebaseAccount(signal, current, reset);
        this.probe();
        return;
      }
      await this.projection.apply(page, current);
      if (!page.more) return;
      if (page.next <= cursor) throw new Error('EVENT_GAP');
      cursor = page.next;
    }
  }

  private async rebaseAccount(
    signal: AbortSignal,
    current: Access,
    reset = false,
  ) {
    // Membership pages must use the same account watermark before replacing local access.
    for (let attempt = 0; attempt < 3 && current(); attempt++) {
      let watermark: number | undefined;
      let cursor: string | undefined;
      const memberships: MembershipView[] = [];
      while (current()) {
        const next = await this.api.accountSnapshot(signal, cursor, watermark);
        if (
          next.changed ||
          (watermark !== undefined && next.highWater !== watermark)
        )
          break;
        watermark = next.highWater;
        memberships.push(...next.memberships);
        if (!next.nextCursor) {
          await this.projection.accountSnapshot(
            { highWater: watermark, memberships },
            current,
            reset,
          );
          return;
        }
        if (cursor === next.nextCursor) throw new Error('SNAPSHOT_CURSOR');
        cursor = next.nextCursor;
      }
    }
    if (current()) throw new Error('SNAPSHOT_CHANGED');
  }

  private async pullThread(
    id: string,
    after: number,
    signal: AbortSignal,
    current: Access,
  ) {
    let reset = false;
    if (after >= 0) {
      const page = await this.api.conversationEvents(id, after, signal);
      if (!current()) return;
      reset = page.snapshotRequired && after > page.highWater;
      if (page.stream !== 'CONVERSATION' || page.streamId !== id)
        throw new Error('CONVERSATION_SCOPE');
      if (
        !page.snapshotRequired &&
        !page.events.some((entry) => entry.receiptsInvalidated)
      ) {
        if (page.more && page.next <= after) throw new Error('EVENT_GAP');
        await this.projection.apply(page, current);
        return;
      }
    }
    const next = await this.api.conversationSnapshot(id, signal);
    if (current() && next.membership.id === id)
      await this.projection.conversationSnapshot(next, current, false, reset);
  }
}
