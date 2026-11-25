# Quality gates

A PR names the stage, the covered acceptance items, test results or reproducible commands, and open limitations. Record OS/device, build and commit for manual evidence. Product claims require an observed path. Block release for an unresolved critical defect, failed required check, data loss, duplicate canonical message, or unauthorized access.

## Merge and release checks

| Gate | Earliest stage | Pass evidence |
| --- | --- | --- |
| Baseline and design | 1 | Baseline ref and file inventory, six requested docs, working relative links, 17 feature rows, ten stages and reviewable commit history. |
| Reproducible builds | 2 | Locked install, formatting/lint/type-check, build, tests, Expo compatibility, health/readiness, and real replica-set integration in CI. |
| Accessible UI | 3, 9 | Check VoiceOver/TalkBack, focus, keyboard insets, text scaling, light/dark and reduced motion. Target WCAG AA text contrast and native 44 pt iOS/48 dp Android touch targets. |
| Identity and authorization | 4, 5, 7, 8 | Verify revoked/expired tokens, session rotation, own profile writes, horizontal access isolation, explicit group permissions, sender-only deletion, and sockets removed after revocation. Include non-member search/download and stale session cases. |
| Data integrity | 5–8 | Verify MongoDB constraints and transactional writes, single canonical message per idempotency key, deterministic conflict handling, monotonic receipts, and duplicate/out-of-order event tolerance. |
| Local durability | 6 | Exercise SQLite migration and restart, job claim recovery, dedupe, account/backend scope, attachment persistence, offline replay and corrupt/missing attachment feedback. |
| Live sync | 7 | Exercise subscribe/replay overlap, missed and duplicated events, expired cursors, relay restart, membership revocation and two-device foreground behavior. Observe no recurring history REST requests during a stable foreground connection. |
| Security operations | 8 | Run dependency/license and secret scans, review findings, validate request quotas, CORS and TLS, upload size/type and access policy, redacted telemetry, and perform test backup/restore. |
| Mobile release | 9 | Fresh Android/iOS release or distribution-test install, real two-account demo, closed release blockers and submission instructions with verified artifacts. |
| Desktop release | 10 | Build on macOS and install DMG on declared architectures. Check sandboxed renderer, narrow IPC, native credential storage, offline parity and signing/notarization for public distribution. |

## Mandatory reliability scenarios

| Scenario | Expected outcome |
| --- | --- |
| Sender offline, app force-closed | Text and staged attachment retain their queued state after relaunch. Reconnect sends the original item once. |
| Recipient offline, sender online | Sender can reach sent after durable commit. Delivered/read remain unset until the recipient persists/views the item and acknowledges it. |
| API response lost after commit | Identical concurrent retry returns the canonical message. Database, recipient and sender each show one message. Changed payload under the same UUID returns conflict. |
| Reconnect while live traffic arrives | REST replay and buffered socket changes merge to a contiguous cursor. Duplicates do not reopen tombstones or regress receipts. |
| Attachment network failure | Staged bytes survive retry and failed item is actionable. An unauthorized user cannot fetch the file. An interrupted upload does not create a partially usable message. |
| Group membership and multi-device receipts | Removed accounts lose future feed/search/download access. Eligible recipient progress counts at most once per user, and reconnect preserves previously acknowledged state. Presence remains online until the last active eligible device ends its connection or expires. |
| Sender deletion during recipient disconnect | Sender alone can delete. Recipient reconnect removes body/attachment references and search results. Repeating delete produces the same effective state. |
| Account or endpoint change with queued work | Old session and socket close. Pending items never send using another identity/backend. Old content does not appear under the new scope. |

## Measurement targets

Initial capstone targets for Stage 8. Use a seeded staging environment with a documented database tier, network conditions and test run ID. Measure at least three runs and record the sample count and p50/p95. Update thresholds through a reviewed decision if the test environment changes materially.

| Indicator | Target and setup |
| --- | --- |
| Live online text | p95 under 1 s from submit to recipient persistence, 200 sends with 20 authenticated socket clients, same-region staging and normal network. |
| History | p95 under 500 ms server response for 50-message pages over a seeded 10,000-message conversation with five concurrent readers. |
| Offline catch-up | p95 under 5 s to render 100 missed text changes after an authorized reconnect under the same network conditions. |
| Duplicate/data loss invariant | Zero duplicate canonical messages and zero lost accepted items over 100 controlled timeout/retry sequences. Compare SQLite, API and MongoDB identities. |

Treat mobile background suspension, push notifications, general-purpose browser support, end-to-end encryption and multi-region delivery as separate scope decisions. Benchmarks cover the supported foreground transport and describe device/network constraints.
