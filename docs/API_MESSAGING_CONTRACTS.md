# Messaging REST contracts

Use a Stage 4 bearer token. Responses carry `Cache-Control: no-store`. Request and response shapes are defined in [shared contracts](../packages/contracts/src/messaging.ts). IDs are lowercase MongoDB ObjectIds, operation IDs are UUID v4, and timestamps use UTC ISO 8601. JSON bodies have a 24 KiB limit.

In this table `:c`, `:u`, `:m` and `:a` are conversation, user, message and attachment IDs.

| Method and path                                     | Input                                         | Response                                                                |
| --------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /v1/users/discover`                            | `q` (2–50 characters)                         | Up to 20 `{ id, displayName, avatarUrl }` entries, excluding the caller |
| `GET /v1/conversations`                             | Optional `limit` and conversation ID `cursor` | `{ items: Conversation[], nextCursor }`                                 |
| `POST /v1/conversations/direct`                     | `{ userId }`                                  | `200 Conversation`, canonical for the pair                              |
| `POST /v1/conversations/group`                      | `{ title, userIds, clientGroupId }`           | `200 Conversation`, canonical for owner and UUID                        |
| `GET /v1/conversations/:c`                          | Path ID                                       | `Conversation`                                                          |
| `GET /v1/conversations/:c/members`                  | Path ID                                       | Active public profiles with `role`                                      |
| `PATCH /v1/conversations/:c/members/:u`             | `{ role: "ADMIN" \| "MEMBER" }`               | Updated `Conversation`. Inserts, rejoins or changes role                |
| `DELETE /v1/conversations/:c/members/:u`            | Path IDs                                      | Updated `Conversation`. Revokes active membership                       |
| `GET /v1/conversations/:c/messages`                 | Optional `limit`, opaque `cursor`             | `{ items: Message[], nextCursor }`                                      |
| `POST /v1/conversations/:c/messages`                | `{ clientMessageId, body?, attachmentIds? }`  | `200 Message` after commit or exact replay                              |
| `DELETE /v1/conversations/:c/messages/:m`           | Path IDs                                      | `204`, including repeated sender deletion                               |
| `GET /v1/conversations/:c/search`                   | `q` and optional `limit`, opaque `cursor`     | `{ items: { id, sender, createdAt, preview }[], nextCursor }`           |
| `POST /v1/conversations/:c/attachments`             | `{ fileName, mimeType, size }`                | `201 { attachment, url, method: "PUT", headers }`                       |
| `POST /v1/conversations/:c/attachments/:a/complete` | Path IDs                                      | Verified attachment metadata                                            |
| `POST /v1/conversations/:c/attachments/:a/download` | Path IDs                                      | `{ url }`, short-lived signed GET                                       |

`Conversation` includes `id`, `kind`, `title`, caller `role`, active `members`, `updatedAt`, and the latest visible message or `null`. `Message` includes `id`, `conversationId`, safe `sender`, `body`, attachment metadata, `createdAt` and `deleted`. An exact replay of a deleted message exposes a tombstone with an empty body and attachment array. History and search omit tombstones.

Discovery performs normalized display-name prefix lookup and applies 30 requests per account per minute per API instance. Message body length is 4,000 characters. A message can include up to four distinct attachments and must have text or an attachment. The initial mobile composer offers one attachment at a time. Group titles contain 1–80 characters, with 1–31 invitees on creation. History and search return at most 50 rows per page, defaulting to 25. Continue with the same search text and the previous response's cursor.

Errors use `{ statusCode, code, message, requestId }`. Expect `400` for invalid shape or cursor, `401` for missing or expired credentials, `403` for disallowed role or non-sender deletion, `404` for records outside the caller’s scope, `409` for conflicting operation payloads or bounded capacity, `413` for size limits, `429` for throttled discovery and `503` when optional storage is unavailable or not configured.

## Stage 6 recovery additions

- `GET /v1/conversations/:c/messages?reconcile=1` returns a `visibleFrom` membership boundary and a sender-owned `clientMessageId` when applicable. Deleted history in this mode contains only tombstones with empty body and attachment fields. The original history shape is unchanged when the flag is omitted.
- `POST /v1/conversations/:c/attachments/recover/:operation` accepts the existing upload metadata plus a UUID v4 in the path. It returns an existing verified attachment with `ready: true`, or a fresh signed PUT grant for the same attachment identity. Changed metadata under the same operation receives HTTP 409. The route checks active membership and attachment ownership. Finish a newly uploaded object with the existing completion endpoint.
