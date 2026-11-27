# Feature matrix

Assessment at Stage 1 baseline `8244028`. **Existing and verified** requires an observed working product path. **Partially implemented** means a relevant schema or component exists, with the product path incomplete. **Missing** means there is no implementation beyond possible planning. **Requires testing** is reserved for an apparently complete path with missing evidence. No baseline feature meets either the first or fourth definition.

## Stage 5 update

| Capability | Status | Evidence |
| --- | --- | --- |
| Direct and group conversations | Existing and verified over authenticated REST | Replica-set tests check concurrent canonical creation and group member persistence. |
| Discovery, roles and visibility | Existing and verified over authenticated REST | Public profiles and authorization tests cover limits, role changes, removal and rejoin. |
| Text messaging, history and search | Existing and verified over authenticated REST | Persisted messages load through scoped history and indexed search. Live incoming updates remain Stage 7. |
| Duplicate-send protection | Existing and verified for online retries | Parallel and repeated retries return one message. Durable local retry is Stage 6. |
| Sender-only deletion | Existing and verified over authenticated REST | Repeated delete clears content and blocks new attachment grants. |
| Photo and file sharing | Requires testing on native devices | Local S3 verifies private transfer, object validation and access revocation. Native picker, preview and share require device verification. |
| Receipt and offline states | Partially implemented | This stage shows confirmed sent and transient send feedback. Durable state is Stage 6 and receipts are Stage 7. |

See the [Stage 5 test evidence](TEST_EVIDENCE.md).

## Stage 4 update

| Capability | Status | Evidence |
| --- | --- | --- |
| Registration, login, restoration, refresh and sign-out | API verified. Native device validation pending. | Two real HTTP clients and MongoDB. Mobile session manager uses independent test keychains. |
| Owner-only profile and display-name editing | API verified. Native device validation pending. | Own reads/writes, cross-account denial and session revocation tested. |
| Configurable backend and account isolation | Automated client checks verified. Device smoke pending. | Origin mismatch clears stored credentials without a request. Account SQLite names are scoped by origin and user ID. |
| Appearance persistence | Existing adapter retained. | Stage 2 SQLite restart test continues to pass. |

| # | Requirement | Baseline status | Evidence and completion test | Stage |
| --- | --- | --- | --- | --- |
| 1 | Registration and login | Missing | The SQL references Supabase `auth.users`. App auth is absent. Register, sign in, restore, refresh and sign out with invalid-session coverage. | 4 |
| 2 | User profiles | Partially implemented | Legacy table and RLS only. Update the signed-in profile and restrict exposed fields on another user's profile. | 4 |
| 3 | One-to-one conversations | Partially implemented | Conversation and participant tables only. Reciprocal concurrent creates return the same chat and correct two members. | 5 |
| 4 | Group conversations | Partially implemented | `is_group`, title and participants in SQL. Create a group, enforce roles and revoke access after removal. | 5, 7 |
| 5 | Real-time text messaging | Partially implemented | Legacy message table with manual publication notes. Send text and render it on a second client through an authorized socket. | 5, 7 |
| 6 | Photo and file sharing | Missing | No attachment model, storage or UI. Upload, preview/open, validate type/size and deny unauthorized downloads. | 5, 6, 8 |
| 7 | Message search | Missing | History index only. Find authorized matches with stable pagination and exclude deleted messages. | 5 |
| 8 | Configurable backend connectivity | Partially implemented | Legacy build-time example only. Persist and validate a server URL without mixing sessions, cache or queued items across servers. | 2, 4 |
| 9 | Persistent appearance preferences | Missing | No screens or preferences store. System/light/dark selection survives force-close and relaunch. | 3, 4 |
| 10 | Offline-first outgoing queue | Missing | Described in prose. Compose while offline, force-close, relaunch, reconnect and observe one successful send. | 6 |
| 11 | Queued, sending, sent, delivered, read and failed | Partially implemented | Receipt timestamps and status descriptions only. Observe every state and confirm receipt updates never regress status. | 6, 7 |
| 12 | Safe retries without duplicates | Partially implemented | SQL unique key on sender and client UUID only. Drop a committed response, retry concurrently and verify one record and one bubble. | 5, 6 |
| 13 | Instant incoming messages without periodic polling | Missing | No publication code, subscription or client. Under a healthy connection, inspect live delivery and confirm no periodic history requests. | 7 |
| 14 | Online/offline presence | Missing | Planned only. Verify multi-device presence and transition after final disconnect or heartbeat expiry. | 7 |
| 15 | Typing indicators | Missing | Planned only. Verify room scope, expiry, rate limiting and cleanup on disconnect. | 7 |
| 16 | Complete read receipts | Partially implemented | SQL receipt rows and read timestamps only. Verify per-recipient/group counts, multiple devices and offline replay. | 7 |
| 17 | Sender-only deletion | Partially implemented | SQL `deleted_at` column. Verify sender authorization, repeat deletion, cache/search removal and reconnect propagation. | 5, 7 |
