# Realtime event model

| Storage                       | Purpose                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Conversation.eventSequence`  | Next conversation event position, separate from message `sequence` and the write-lock `revision`. Missing fields on older conversations start at zero. |
| `Membership.eventVisibleFrom` | First permitted event in the current membership. A rejoin allocates a fresh boundary. Older active memberships start at one.                           |
| `AccountSyncState`            | Per-account event position, keyed by authenticated user ID.                                                                                            |
| `RealtimeEvent`               | Reference-only durable event and lease state. Unique `(stream, streamId, sequence)`. A separate indexed query finds due unpublished rows.              |
| `Receipt`                     | Unique `(messageId, recipientId)`, eligibility and server-managed timestamps.                                                                          |

Conversation creation, group grants and revocations, role changes, canonical messages, tombstones, delivered and read updates append a conversation event and account events for affected users. Conversation writes acquire the existing transaction lock. Account counters are updated in user-ID order. Any write conflict rolls back the domain mutation and event allocation before the existing repository retry. Duplicate sends, deletion retries and receipt retries leave event counts unchanged.

Events retain IDs, types, sequence metadata and timestamps. Body text, bytes, signed URLs and credentials stay out of the log. Replay rechecks live authorization and resolves each projection against the current canonical record. Deleted messages yield content-free tombstones. An invisible event resolves to a cursor-only entry. Removed accounts can still replay their own revocation.

The relay claims up to 32 indexed due events at a time. Each atomic claim writes a token, expiry and attempt count. A successful dispatch checkpoints only with the current lease. A crash can cause duplicate or out-of-order hints. Ordered REST replay and SQLite cursor checks absorb them. The relay logs failed attempts without event content or credentials.
