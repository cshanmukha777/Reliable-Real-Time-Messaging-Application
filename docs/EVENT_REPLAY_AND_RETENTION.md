# Event replay and retention

| Endpoint                                               | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET /v1/sync/account?after=0&limit=25`                | Current caller’s metadata-only account stream                         |
| `GET /v1/sync/account/snapshot`                        | Paginated membership snapshot with a pinned account watermark         |
| `GET /v1/conversations/:id/events?after=0&limit=25`    | Authorized conversation projections                                   |
| `GET /v1/conversations/:id/events/snapshot`            | Current conversation, membership and up to 50 recent visible messages |
| `GET /v1/conversations/:id/events/snapshot?cursor=…`   | Older visible messages using the existing history cursor format       |
| `POST /v1/conversations/:id/messages/:message/receipt` | Idempotent delivered or read acknowledgment                           |

Event positions are validated nonnegative integers, scoped by authenticated stream. Each page carries its ordered positions, next cursor, high-water mark, continuation flag and `snapshotRequired`. The server keeps the newest **1,000 events per stream** and prunes older positions in the append transaction. This is a count window. Heavy traffic can shorten its wall-clock span. A position before retention, ahead of the current watermark, before the membership boundary, or across a gap requires explicit rebasing.

Account snapshot pages must all carry the same watermark before the app replaces its known authorized memberships and account cursor. A changed watermark restarts pagination. Conversation rebase replaces the confirmed cached window with an authorized canonical snapshot, keeps queued content and staged files, and resets the older-history cursor. Older pages remain available on request. Access loss removes server content, receipt data and the conversation cursor. Existing queued payloads remain blocked under their original account.

The app buffers the largest hint per stream, applies contiguous pages in one SQLite transaction and drains available work. The account channel also schedules conversation replay for authorized chats that are outside the foreground screen. There is no recurring history pull on a healthy connection. Connections, hints, navigation/explicit refresh and failure recovery can cause pulls.
