export const offlineSchema = `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY(conversation_id, user_id)
  );
  CREATE TABLE staged_files (
    id TEXT PRIMARY KEY NOT NULL,
    metadata TEXT NOT NULL
  );
  CREATE TABLE drafts (
    conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id),
    body TEXT NOT NULL,
    file_id TEXT REFERENCES staged_files(id),
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE outbox_operations (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('QUEUED','CLAIMED','UPLOADING','SENDING','RETRY_WAIT','CONFIRMED','FAILED','BLOCKED_AUTH','BLOCKED_ACCESS')),
    attempts INTEGER NOT NULL DEFAULT 0,
    eligible_at INTEGER NOT NULL,
    lease TEXT,
    lease_until INTEGER,
    error TEXT,
    server_id TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE outbox_attachments (
    operation_id TEXT NOT NULL REFERENCES outbox_operations(id),
    file_id TEXT NOT NULL REFERENCES staged_files(id),
    server_id TEXT,
    PRIMARY KEY(operation_id, file_id)
  );
  CREATE TABLE messages (
    local_id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT UNIQUE,
    operation_id TEXT UNIQUE REFERENCES outbox_operations(id),
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    sender_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE sync_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE INDEX conversation_activity ON conversations(active, updated_at);
  CREATE INDEX history_order ON messages(conversation_id, created_at, local_id);
  CREATE INDEX outbox_due ON outbox_operations(state, eligible_at, lease_until);
  CREATE INDEX outbox_thread ON outbox_operations(conversation_id, created_at);
  CREATE INDEX staged_file_operations ON outbox_attachments(file_id);
`;
