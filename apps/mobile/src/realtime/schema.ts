export const realtimeSchema = `
  CREATE TABLE realtime_streams (
    stream TEXT NOT NULL CHECK(stream IN ('ACCOUNT','CONVERSATION')),
    id TEXT NOT NULL,
    cursor INTEGER NOT NULL,
    high_water INTEGER NOT NULL,
    event_boundary INTEGER NOT NULL DEFAULT 1,
    visible_from INTEGER NOT NULL DEFAULT 1,
    older TEXT,
    PRIMARY KEY(stream,id)
  );
  CREATE TABLE receipt_projection (
    message_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    eligible INTEGER NOT NULL,
    delivered INTEGER NOT NULL,
    read_count INTEGER NOT NULL
  );
  CREATE INDEX receipt_projection_thread ON receipt_projection(conversation_id);
  CREATE TABLE receipt_ack (
    message_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    desired INTEGER NOT NULL CHECK(desired IN(1,2)),
    acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged BETWEEN 0 AND desired)
  );
  CREATE INDEX receipt_ack_thread ON receipt_ack(conversation_id);
`;
