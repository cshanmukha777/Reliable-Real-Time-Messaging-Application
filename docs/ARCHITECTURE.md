# Architecture

## High-level components

- **Expo client:** screens, navigation, session state, and message composition.
- **Local message store:** durable outgoing queue and cached conversation history (Expo SQLite).
- **Supabase Auth:** user identity and session management.
- **PostgreSQL:** canonical records for profiles, conversations, participants, and messages.
- **Supabase Realtime:** message changes, presence, and typing events.

## Outgoing message lifecycle

1. Create a UUID on the client and persist the message locally with status `queued`.
2. When connectivity and authentication are available, mark it `sending` and submit it with the same UUID.
3. The database unique constraint on `client_message_id` makes retries idempotent.
4. On server confirmation, update the local record to `sent`.
5. The recipient client acknowledges receipt and reading; the sender receives the corresponding status update.
6. On a network failure, retain the local message and retry later using the original UUID.

## Status meanings

| Status | Meaning |
| --- | --- |
| queued | Saved locally; waiting for a usable connection |
| sending | A request is currently in progress |
| sent | The server has persisted the message |
| delivered | The recipient device has acknowledged receipt |
| read | The recipient has opened/read the message |
| failed | Delivery could not complete; message remains available for retry |

A successful database insert alone must not be labelled delivered.

## Realtime and reconnect

Realtime subscriptions provide low-latency updates while connected. The database remains the source of truth. On app startup and reconnect, fetch messages newer than the last locally synchronized cursor, merge by stable message ID, and update local state. This prevents missed events from leaving the chat stale.

## Presence and typing

Use Supabase Presence for online state. Use short-lived broadcast events for typing indicators; typing state is ephemeral and should not be stored as a permanent message. Clear typing state after a short timeout and when a user leaves the conversation.

## Security

- Enable Row Level Security on every user-scoped table.
- A user may read a conversation only if they are a participant.
- A user may send messages only as themselves and only into conversations they participate in.
- Keep service-role credentials on trusted servers only; never bundle them in the mobile app.
- Validate membership and sender identity in database policies, not only in the UI.
