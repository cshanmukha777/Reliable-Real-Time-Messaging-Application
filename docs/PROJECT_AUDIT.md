# Stage 1 repository audit

**Baseline:** `main` at [`82440287cbb00ed592b061dcf6046839b1a397cd`](https://github.com/cshanmukha777/Reliable-Real-Time-Messaging-Application/commit/82440287cbb00ed592b061dcf6046839b1a397cd).

The repository is a documentation and PostgreSQL schema foundation. There is no runnable ChatApp. The project specification selects NestJS, MongoDB and Prisma, while the original setup instructions select Supabase. The [architecture decision](ADR/0001-system-architecture.md) resolves that divergence.

## Evidence and verification

The audit used the GitHub repository metadata, recursive tree, branch listing, commit history, workflow-run listing and a clean clone. The clone contained one branch (`main`), no tags and three commits. GitHub listed zero workflow runs and zero releases. The tracked tree contained no workflow definitions, scripts, submodules or package manifests, so there was no install, application launch, database integration or test suite to run. The legacy SQL was reviewed statically. No live Supabase project, deployment or production dataset was supplied.

| Tracked baseline path | Findings |
| --- | --- |
| `.env.example` | Placeholder Supabase URL and public key variables. No service-role secret or actual values in the template. |
| `.gitignore` | Ignores dependencies, Expo/native generated folders, local env files, signing file patterns and coverage. Recheck conventions for nested apps and signing before adding builds. |
| `LICENSE` | MIT license. |
| `README.md` | Product goals and prospective Expo/Supabase scaffolding steps. Directions would create an app. The app was absent. |
| `docs/ARCHITECTURE.md` | Planned Supabase architecture, status definitions and reconnect principles. The reliability concepts carry into the target design. |
| `docs/DEVELOPMENT_PLAN.md` | Five-day sketch for Supabase and a two-device demo. The recipient-offline step confuses server acceptance with delivery. Split recipient-offline and sender-offline tests. |
| `supabase/schema.sql` | DDL for profiles, conversations, participants, messages and receipts. Includes RLS, membership helper, sender/client UUID uniqueness and history index. Realtime publication is a manual instruction. |

| Commit | Change |
| --- | --- |
| `3d6158d` | Initial README. |
| `9296e8d` | Foundation docs, environment template, license, ignore rules and SQL schema. |
| `8244028` | Revised RLS and added a security-definer membership check with explicit search path and execute grant. |

## Implementation and testing gaps

- **Mobile:** No Expo project, TypeScript configuration, Router routes, screens, UI assets, design tokens, local database, secure storage, or build profiles. Plan design coverage for offline/reconnecting, failed retry, attachment progress, empty states, light/dark, large text, keyboard and screen readers.
- **Backend:** No REST controllers, NestJS gateway, authentication, Prisma schema, MongoDB setup, attachment store or deployment artifacts. Planned presence and typing exist only in prose. The legacy schema models groups and receipts but has no end-to-end workflows.
- **Dependencies:** No installed versions, lockfiles or runtime constraints can be audited. Stage 2 must pin a supported Node/package manager, compatible Expo SDK/React Native/Router/SQLite versions, NestJS/Socket.IO and matching Prisma CLI/client with MongoDB support. Resolve peer dependencies and review licenses and advisories from the resulting lockfile. Avoid scaffolding directly into the populated repository root.
- **Build/deployment:** No CI, EAS configuration, Dockerfile, MongoDB replica set, health endpoints, backend hosting or macOS packaging. Stage 2 should prove a reproducible clean checkout and local API startup. Stage 8 adds a release-like environment and Stage 10 adds packaging/signing.
- **Test evidence:** No unit, integration, SQLite restart, device, socket, security, accessibility, performance or packaging results. Treat database constraints and descriptions as design evidence only. See the [feature matrix](FEATURE_MATRIX.md) and [quality gates](QUALITY_GATES.md).

## Technical risks and priorities

| Priority | Evidence or risk | Required response |
| --- | --- | --- |
| P0 | The existing setup points to Supabase while the specification requires NestJS and MongoDB. | One runtime backend. Preserve the schema as reference and require a migration decision based on whether any live data exists. |
| P0 | MongoDB transactions require a replica set under the proposed Prisma connector. Connector support varies by Prisma major. | Verify supported versions and prove a transaction, rollback and compound index enforcement in CI against a replica set during Stage 2. |
| P0 | The legacy participant insert policy reads a conversation whose SELECT policy itself requires membership. This can block initial membership on a fresh conversation. The policy also permits an existing participant to add members without a role model. | Verify the concern before any legacy data operation. Create conversations and memberships atomically in NestJS and enforce explicit group roles. |
| P0 | The legacy receipt update policy checks user identity but omits a fresh membership predicate and monotonic state rules. Authenticated profile reads are broad. | Bound public profile fields and centralize conversation authorization. Require ownership, membership and monotonic receipt writes server-side. |
| P0 | A write can commit while its response or live event is lost. Manual retry and concurrent reconnect attempts can race. | Stable client UUID, unique database key, deterministic replay contract, transactional sync events and crash recovery. |
| P1 | A socket disconnect, reconnect overlap or stale membership can drop events or expose data. | Authorize fanout and subscriptions, persist ordered changes, reconcile on reconnect and test eviction when membership changes. |
| P1 | Attachment access, endpoint switching and shared-device cache leakage have no implementation. | Private object storage, bounded uploads, authenticated downloads, account/backend-scoped SQLite and secure session storage. |
| P1 | Mobile reliability and macOS distribution have distinct platform requirements. | Validate on iOS and Android early. Prove the Electron storage adapter and record signing or notarization prerequisites before claiming public distribution. |
