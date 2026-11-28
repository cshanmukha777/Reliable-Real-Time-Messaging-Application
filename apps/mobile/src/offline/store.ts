import type { ReceiptCounts } from '@chatapp/contracts';
import {
  clientOperationIdSchema,
  uploadInputSchema,
  type Conversation,
  type Message,
  type Person,
  type ReconciliationPage,
  type UploadInput,
} from '@chatapp/contracts';
import type { LocalDatabase, SqlExecutor } from '../sqlite-core.ts';

export type Stage = { id: string; input: UploadInput; checksum?: string };
export type Draft = { body: string; file: Stage | null };
export type OutboxState =
  | 'QUEUED'
  | 'CLAIMED'
  | 'UPLOADING'
  | 'SENDING'
  | 'RETRY_WAIT'
  | 'CONFIRMED'
  | 'FAILED'
  | 'BLOCKED_AUTH'
  | 'BLOCKED_ACCESS';
export type Job = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attempts: number;
  lease: string;
  state: OutboxState;
  eligible_at: number;
};
export type LocalMessage = {
  message: Message;
  state: OutboxState | null;
  error: string | null;
  operation: string | null;
  file: Stage | null;
  receipt: ReceiptCounts | null;
};
const inFlight = "'CLAIMED','UPLOADING','SENDING'";
const due = `((state IN ('QUEUED','RETRY_WAIT') AND eligible_at <= ?) OR (state IN (${inFlight}) AND lease_until <= ?))`;

export class OfflineStore {
  readonly db: LocalDatabase;
  readonly userId: string;
  private listeners = new Set<() => void>();
  private version = 0;
  private accessVersion = 0;

  constructor(db: LocalDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.version;
  notify() {
    this.changed();
  }
  private changed() {
    this.version++;
    for (const callback of this.listeners) callback();
  }

  invalidateReads() {
    this.accessVersion++;
  }

  membershipRevision() {
    return this.accessVersion;
  }

  async cacheConversations(
    rows: Conversation[],
    revision = this.accessVersion,
  ) {
    await this.db.transaction(async (tx) => {
      if (revision !== this.accessVersion) return;
      for (const row of rows) await this.cacheConversation(tx, row);
    });
    this.changed();
  }

  async cacheConversation(tx: SqlExecutor, row: Conversation) {
    if (!row.members.some((member) => member.id === this.userId)) return;
    await tx.run(
      `INSERT INTO conversations(id,data,updated_at) VALUES (?,?,?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data,active=1,updated_at=excluded.updated_at`,
      row.id,
      JSON.stringify(row),
      row.updatedAt,
    );
    await tx.run('DELETE FROM members WHERE conversation_id=?', row.id);
    for (const member of row.members) {
      await tx.run(
        'INSERT INTO members VALUES (?,?,?)',
        row.id,
        member.id,
        JSON.stringify(member),
      );
    }
  }

  async inbox() {
    const rows = await this.db.all<{
      data: string;
      latest: string | null;
      cached_preview: string | null;
    }>(`
      SELECT c.data,
        (SELECT m.data FROM messages m WHERE m.conversation_id=c.id AND m.server_id IS NOT NULL
          AND json_extract(m.data,'$.deleted')=0 ORDER BY m.created_at DESC,m.local_id DESC LIMIT 1) AS latest,
        (SELECT m.data FROM messages m WHERE m.server_id=json_extract(c.data,'$.latest.id')) AS cached_preview
      FROM conversations c WHERE c.active=1 ORDER BY c.updated_at DESC,c.id`);
    return rows.map((row) => {
      const conversation = JSON.parse(row.data) as Conversation;
      const cached = row.latest ? (JSON.parse(row.latest) as Message) : null;
      const original =
        row.cached_preview &&
        (JSON.parse(row.cached_preview) as Message).deleted
          ? null
          : conversation.latest;
      const latest =
        cached && (!original || cached.createdAt >= original.createdAt)
          ? cached
          : original;
      return {
        ...conversation,
        latest,
        updatedAt:
          latest && latest.createdAt > conversation.updatedAt
            ? latest.createdAt
            : conversation.updatedAt,
      };
    });
  }

  async thread(id: string) {
    const row = await this.db.first<{ data: string; active: number }>(
      'SELECT data,active FROM conversations WHERE id=?',
      id,
    );
    if (!row) return null;
    const records = await this.db.all<{
      data: string;
      state: OutboxState | null;
      error: string | null;
      operation_id: string | null;
      file: string | null;
      eligible: number | null;
      delivered: number | null;
      read_count: number | null;
    }>(
      `
      SELECT m.data, o.state, o.error, m.operation_id, sf.metadata AS file, rp.eligible, rp.delivered, rp.read_count
      FROM messages m LEFT JOIN outbox_operations o ON o.id=m.operation_id
      LEFT JOIN outbox_attachments a ON a.operation_id=o.id
      LEFT JOIN staged_files sf ON sf.id=a.file_id
      LEFT JOIN receipt_projection rp ON rp.message_id=m.server_id
      WHERE m.conversation_id=? AND (m.server_id IS NULL OR ?=1)
      ORDER BY m.created_at,m.local_id`,
      id,
      row.active,
    );
    return {
      conversation: JSON.parse(row.data) as Conversation,
      active: row.active === 1,
      rows: records.map(
        (m): LocalMessage => ({
          message: JSON.parse(m.data) as Message,
          state: m.state,
          operation: m.operation_id,
          error: m.error,
          file: m.file ? (JSON.parse(m.file) as Stage) : null,
          receipt: m.eligible === null ? null : { eligible:m.eligible,delivered:m.delivered ?? 0,read:m.read_count ?? 0 },
        }),
      ),
    };
  }

  async getDraft(id: string): Promise<Draft> {
    const row = await this.db.first<{ body: string; file: string | null }>(
      `
      SELECT d.body,f.metadata AS file FROM drafts d LEFT JOIN staged_files f ON d.file_id=f.id WHERE conversation_id=?`,
      id,
    );
    return {
      body: row?.body ?? '',
      file: row?.file ? (JSON.parse(row.file) as Stage) : null,
    };
  }

  async saveDraft(id: string, draft: Draft, now = Date.now()) {
    await this.db.transaction(async (tx) => {
      if (draft.file) {
        const fileId = clientOperationIdSchema.parse(draft.file.id);
        const file = {
          ...draft.file,
          id: fileId,
          input: uploadInputSchema.parse(draft.file.input),
        };
        await tx.run(
          'INSERT OR IGNORE INTO staged_files VALUES (?,?)',
          fileId,
          JSON.stringify(file),
        );
      }
      await tx.run(
        `INSERT INTO drafts VALUES (?,?,?,?)
        ON CONFLICT(conversation_id) DO UPDATE SET body=excluded.body,file_id=excluded.file_id,updated_at=excluded.updated_at`,
        id,
        draft.body,
        draft.file?.id ?? null,
        now,
      );
    });
  }

  async enqueue(
    id: string,
    operation: string,
    sender: Person,
    now = Date.now(),
  ) {
    clientOperationIdSchema.parse(operation);
    if (sender.id !== this.userId) throw new Error('ACCOUNT_SCOPE');
    await this.db.transaction(async (tx) => {
      const allowed = await tx.first(
        'SELECT c.id FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE c.id=? AND c.active=1 AND m.user_id=?',
        id,
        sender.id,
      );
      if (!allowed) throw new Error('CONVERSATION_ACCESS');
      const draft = await tx.first<{ body: string; file_id: string | null }>(
        'SELECT body,file_id FROM drafts WHERE conversation_id=?',
        id,
      );
      const body = draft?.body.trim() ?? '';
      if ((!body && !draft?.file_id) || body.length > 4000)
        throw new Error('INVALID_DRAFT');
      const { id: senderId, displayName, avatarUrl } = sender;
      const local: Message = {
        id: operation,
        conversationId: id,
        sender: { id: senderId, displayName, avatarUrl },
        body,
        attachments: [],
        createdAt: new Date(now).toISOString(),
        deleted: false,
      };
      await tx.run(
        `INSERT INTO outbox_operations(id,conversation_id,sender_id,body,state,eligible_at,created_at,updated_at)
        VALUES (?,?,?,?,'QUEUED',?,?,?)`,
        operation,
        id,
        sender.id,
        body,
        now,
        now,
        now,
      );
      await tx.run(
        'INSERT INTO messages VALUES (?,NULL,?,?,?,?,?)',
        operation,
        operation,
        id,
        sender.id,
        local.createdAt,
        JSON.stringify(local),
      );
      if (draft?.file_id)
        await tx.run(
          'INSERT INTO outbox_attachments VALUES (?,?,NULL)',
          operation,
          draft.file_id,
        );
      await tx.run('DELETE FROM drafts WHERE conversation_id=?', id);
    });
    this.changed();
  }

  claim(lease: string, now: number, until: number) {
    return this.db
      .transaction(async (tx) => {
        const row = await tx.first<Job>(
          `SELECT * FROM outbox_operations WHERE sender_id=? AND ${due}
        ORDER BY eligible_at,created_at,id LIMIT 1`,
          this.userId,
          now,
          now,
        );
        if (!row) return null;
        await tx.run(
          `UPDATE outbox_operations SET state='CLAIMED',attempts=attempts+1,lease=?,lease_until=?,updated_at=? WHERE id=?`,
          lease,
          until,
          now,
          row.id,
        );
        return {
          ...row,
          state: 'CLAIMED' as const,
          lease,
          attempts: row.attempts + 1,
        };
      })
      .then((job) => {
        if (job) this.changed();
        return job;
      });
  }

  wakeTime() {
    return this.db.first<{ time: number | null }>(
      `SELECT MIN(CASE WHEN state IN (${inFlight}) THEN lease_until ELSE eligible_at END) AS time
      FROM outbox_operations WHERE sender_id=? AND state IN (${inFlight},'QUEUED','RETRY_WAIT')`,
      this.userId,
    );
  }

  async renew(job: Job, now: number, until: number) {
    return this.db.transaction(async (tx) => {
      if (!(await this.owns(tx, job, now))) return false;
      await tx.run(
        'UPDATE outbox_operations SET lease_until=? WHERE id=?',
        until,
        job.id,
      );
      return true;
    });
  }

  private owns(tx: SqlExecutor, job: Job, now: number) {
    return tx.first(
      `SELECT id FROM outbox_operations WHERE id=? AND sender_id=? AND lease=? AND lease_until>? AND state IN (${inFlight})`,
      job.id,
      this.userId,
      job.lease,
      now,
    );
  }

  async phase(job: Job, state: 'UPLOADING' | 'SENDING', now: number) {
    await this.db.transaction(async (tx) => {
      if (!(await this.owns(tx, job, now))) throw new Error('LEASE_LOST');
      await tx.run(
        'UPDATE outbox_operations SET state=?,updated_at=? WHERE id=?',
        state,
        now,
        job.id,
      );
    });
    this.changed();
  }

  async fail(
    job: Job,
    state: 'FAILED' | 'RETRY_WAIT' | 'BLOCKED_AUTH' | 'BLOCKED_ACCESS',
    error: string,
    until: number,
    now: number,
  ) {
    await this.db.transaction(async (tx) => {
      if (!(await this.owns(tx, job, now))) return;
      if (state === 'BLOCKED_ACCESS')
        await this.revokeIn(tx, job.conversation_id);
      else
        await tx.run(
          'UPDATE outbox_operations SET state=?,error=?,eligible_at=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=?',
          state,
          error,
          until,
          now,
          job.id,
        );
    });
    this.changed();
  }

  async retry(operation: string, now: number) {
    await this.db.run(
      `UPDATE outbox_operations SET state='QUEUED',eligible_at=?,error=NULL,updated_at=?
      WHERE id=? AND sender_id=? AND state='RETRY_WAIT' AND error<>'RATE_LIMITED'`,
      now,
      now,
      operation,
      this.userId,
    );
    this.changed();
  }

  async connectionRecovered(now: number) {
    await this.db.run(
      `UPDATE outbox_operations SET eligible_at=?
      WHERE sender_id=? AND state='RETRY_WAIT' AND error='CONNECTION'`,
      now,
      this.userId,
    );
  }

  async resumeAuth(now: number) {
    await this.db.run(
      `UPDATE outbox_operations SET state='QUEUED',eligible_at=?,error=NULL,updated_at=?
      WHERE sender_id=? AND state='BLOCKED_AUTH'`,
      now,
      now,
      this.userId,
    );
    this.changed();
  }

  async attachment(operation: string) {
    const row = await this.db.first<{
      metadata: string;
      server_id: string | null;
    }>(
      `SELECT f.metadata,a.server_id FROM outbox_attachments a
      JOIN staged_files f ON f.id=a.file_id WHERE a.operation_id=?`,
      operation,
    );
    return row
      ? { file: JSON.parse(row.metadata) as Stage, serverId: row.server_id }
      : null;
  }

  async freezeAttachment(job: Job, id: string, now: number) {
    await this.db.transaction(async (tx) => {
      if (!(await this.owns(tx, job, now))) throw new Error('LEASE_LOST');
      await tx.run(
        'UPDATE outbox_attachments SET server_id=? WHERE operation_id=? AND server_id IS NULL',
        id,
        job.id,
      );
      const frozen = await tx.first<{ server_id: string }>(
        'SELECT server_id FROM outbox_attachments WHERE operation_id=?',
        job.id,
      );
      if (frozen?.server_id !== id) throw new Error('ATTACHMENT_ID_CHANGED');
    });
  }

  async confirm(job: Job, message: Message, now: number) {
    if (
      message.conversationId !== job.conversation_id ||
      message.sender.id !== this.userId
    )
      throw new Error('CONFIRMATION_SCOPE');
    await this.db.transaction(async (tx) => {
      if (!(await this.owns(tx, job, now))) return;
      await this.merge(tx, message, job.id, now);
    });
    this.changed();
  }

  async merge(
    tx: SqlExecutor,
    message: Message,
    operation: string | undefined,
    now: number,
  ) {
    const existing = await tx.first<{ data: string }>(
      'SELECT data FROM messages WHERE server_id=?',
      message.id,
    );
    if (
      existing &&
      (JSON.parse(existing.data) as Message).deleted &&
      !message.deleted
    )
      return;
    const pending =
      operation &&
      (await tx.first<{ id: string }>(
        `SELECT id FROM outbox_operations
      WHERE id=? AND conversation_id=? AND sender_id=?`,
        operation,
        message.conversationId,
        this.userId,
      ));
    if (pending) {
      await tx.run(
        'DELETE FROM messages WHERE server_id=? AND local_id<>?',
        message.id,
        pending.id,
      );
      await tx.run(
        `UPDATE outbox_operations SET state='CONFIRMED',server_id=?,lease=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE id=?`,
        message.id,
        now,
        pending.id,
      );
      await tx.run(
        'DELETE FROM outbox_attachments WHERE operation_id=?',
        pending.id,
      );
    }
    await tx.run(
      `INSERT INTO messages VALUES (?,?,?,?,?,?,?) ON CONFLICT(local_id)
      DO UPDATE SET server_id=excluded.server_id,created_at=excluded.created_at,data=excluded.data
      ON CONFLICT(server_id) DO UPDATE SET created_at=excluded.created_at,data=excluded.data`,
      pending ? pending.id : message.id,
      message.id,
      pending ? pending.id : null,
      message.conversationId,
      message.sender.id,
      message.createdAt,
      JSON.stringify(message),
    );
  }

  async applyHistory(
    id: string,
    page: ReconciliationPage,
    now = Date.now(),
    detail?: Conversation,
    revision = this.accessVersion,
  ) {
    await this.db.transaction(async (tx) => {
      if (revision !== this.accessVersion) return;
      const key = `membership:${id}`;
      const row = await tx.first<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key=?',
        key,
      );
      if (row && Number(row.value) > page.visibleFrom) return;
      if (row && Number(row.value) !== page.visibleFrom)
        await this.revokeIn(tx, id, false);
      if (detail) {
        if (detail.id !== id) throw new Error('CONVERSATION_SCOPE');
        await this.cacheConversation(tx, detail);
      }
      await tx.run('UPDATE conversations SET active=1 WHERE id=?', id);
      await tx.run(
        'INSERT OR REPLACE INTO sync_metadata VALUES (?,?)',
        key,
        String(page.visibleFrom),
      );
      for (const { clientMessageId, ...message } of page.items) {
        if (message.conversationId !== id)
          throw new Error('CONVERSATION_SCOPE');
        await this.merge(
          tx,
          message,
          message.sender.id === this.userId ? clientMessageId : undefined,
          now,
        );
      }
    });
    this.changed();
  }

  async revokeIn(tx: SqlExecutor, id: string, clearRoster = true) {
    this.accessVersion++;
    if (clearRoster) await tx.run("DELETE FROM realtime_streams WHERE stream='CONVERSATION' AND id=?",id);
    else await tx.run("UPDATE realtime_streams SET cursor=-1,older=NULL WHERE stream='CONVERSATION' AND id=?",id);
    await tx.run('DELETE FROM receipt_projection WHERE conversation_id=?',id);
    await tx.run('DELETE FROM receipt_ack WHERE conversation_id=?',id);
    await tx.run('UPDATE conversations SET active=0 WHERE id=?', id);
    if (clearRoster) {
      await tx.run('DELETE FROM members WHERE conversation_id=?', id);
      await tx.run(
        "UPDATE conversations SET data=json_set(data,'$.latest',NULL,'$.members',json('[]')) WHERE id=?",
        id,
      );
    }
    await tx.run(
      'DELETE FROM messages WHERE conversation_id=? AND server_id IS NOT NULL',
      id,
    );
    await tx.run(
      `UPDATE outbox_operations SET state='BLOCKED_ACCESS',error='ACCESS_REVOKED',lease=NULL,lease_until=NULL
      WHERE conversation_id=? AND state<>'CONFIRMED'`,
      id,
    );
  }

  async revoke(id: string) {
    await this.db.transaction((tx) => this.revokeIn(tx, id));
    this.changed();
  }

  async removeCached(message: Message) {
    await this.db.transaction((tx) =>
      this.merge(
        tx,
        { ...message, body: '', attachments: [], deleted: true },
        undefined,
        Date.now(),
      ),
    );
    this.changed();
  }

  async unusedFiles() {
    return this.db.all<{
      id: string;
    }>(`SELECT id FROM staged_files WHERE id NOT IN (SELECT file_id FROM drafts WHERE file_id IS NOT NULL)
      AND id NOT IN (SELECT file_id FROM outbox_attachments)`);
  }

  dropFile(id: string) {
    return this.db.run('DELETE FROM staged_files WHERE id=?', id);
  }
}
