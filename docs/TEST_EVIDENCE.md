# Stage 5 test evidence

Verification was performed on 27 November 2026 using Node 24.22.3, npm 11.19.1, TypeScript 5.9.3, NestJS 11.2.12, Prisma 6.19.3, Expo 58.0.26 and React Native 0.88.1. Database and object tests used a real MongoDB 7.0.40 replica-set primary and a local VersityGW 1.11.0 S3-compatible service.

| Command or check                                                                                             | Observed result                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci --include=dev`, `npm run prisma:generate`                                                            | Passed. Existing runtime pins retained.                                                                                        |
| `npm run lint`, `npm run typecheck`, `npm run format:check`                                                  | Passed.                                                                                                                        |
| `npm test`                                                                                                   | 35 passed, 0 failed. Includes Stage 2 settings and SQLite, Stage 3 design tokens, Stage 4 session tests and Stage 5 messaging. |
| `npm run test:api`                                                                                           | 3 passed, 0 failed. Builds contracts and API first.                                                                            |
| `npm run test:db` with `CHATAPP_TEST_DATABASE_URL` and `CHATAPP_TEST_S3_*`                                   | 13 passed, 0 failed, including the authenticated Stage 5 suite.                                                                |
| `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npm run doctor -w @chatapp/mobile`                              | 19 of 19 checks passed. The rolling-catalog check runs separately against the locked SDK.                                      |
| `EXPO_OFFLINE=1 npm run dependencies:check -w @chatapp/mobile` and `node scripts/check-expo-attachments.mjs` | Passed. The four attachment packages match the Expo 58.0.26 published package catalog.                                         |
| `npm run router:check -w @chatapp/mobile`                                                                    | Passed.                                                                                                                        |
| `npm run export:android -w @chatapp/mobile` and `npm run export:ios -w @chatapp/mobile`                      | Passed using HTTPS-only release configuration. These are Hermes bundle exports.                                                |
| `npm run check:security` and `gitleaks git --redact --no-banner .`                                           | Passed. No leaks found and server-only markers absent from native output.                                                      |
| `node scripts/check-audit.mjs`                                                                               | Passed the policy for reviewed advisories. See the findings below.                                                             |

For local test services and environment, use the [test plan](TEST_PLAN.md). CI runs the same foundation jobs in the [GitHub Actions workflow](../.github/workflows/stage-2.yml), including a private S3 container. Check the Stage 5 pull request for its current GitHub run.

## Browser and REST screenshots

These images were captured from a Chromium 143 session on Linux, with a 412 × 880 mobile viewport and Expo dev mode, at code commit [`38441f2`](https://github.com/cshanmukha777/Reliable-Real-Time-Messaging-Application/commit/38441f2d28d5bf5f11322cbb3766de1366469b26). The browser harness mounted the native route tree with in-memory credential storage and fixed preview preferences because the shipped web entry does not support signing in. Authentication, account scoping, messaging UI and API requests used the project implementations. Three disposable accounts (Ada, Ben and Chi) used an isolated database and private bucket. Test records were created through the API and were loaded from MongoDB. The preview-only adapters were outside the delivered source.

- [Inbox with direct and group conversations](screenshots/stage-5/inbox.png)
- [Failed response with the original draft preserved](screenshots/stage-5/retry.png)
- [Direct message confirmed after retry](screenshots/stage-5/direct-thread.png)
- [Conversation-scoped search](screenshots/stage-5/search.png)
- [Group thread with an attachment backed by real object storage](screenshots/stage-5/group-thread.png)
- [Group members and owner controls](screenshots/stage-5/members.png)
- [Authorized REST history response captured with the second account](screenshots/stage-5/rest-history.png)

The browser test forwarded an actual send to the API, waited for HTTP 200 after persistence, then dropped the response to the client. It verified the draft stayed visible, retried with the same UUID, and found exactly one matching message in the recipient’s history. It also exercised display-name discovery and direct creation from the UI. Private S3 verification checked signed MIME type and size, a staging overwrite after sealing, unsigned access denial, membership revocation and denial after deletion.

## Remaining checks

- Native iOS and Android app installation and interactive smoke tests remain pending. This Linux environment had no provisioned iOS or Android device. Native library permissions, upload progress, photo preview, file opening, share sheet and the native deletion alert require device evidence. The browser run used the real view and REST path and did not exercise those native APIs.
- Expo’s online Doctor catalog advertised Expo 58.1.0 and newer patches for crypto, dev client, FileSystem, Router and Sharing on the test date. The installed SDK catalog matched the locked binaries and attachments. CI uses the local catalog check alongside Doctor’s other 19 checks to keep the approved Stage 4 versions reproducible.

## Dependency audit

The npm report flagged six entries, representing two underlying advisories and their ancestor packages. Both paths and installed versions are unchanged from Stage 4. The audit gate logs the specific reviewed versions and fails for a new high or critical advisory.

| Advisory                                                                           | Installed path                                                | Review                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), high     | `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`  | The issue concerns recursive object graphs in a configuration merge. Messaging routes use shared Zod schemas and Prisma Client rather than feeding request objects into Prisma CLI configuration. npm proposed a Prisma 7 upgrade. The MongoDB connector remains on the supported Prisma 6 line, so the fix needs a compatible release or separately verified mitigation. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate | `expo@58.0.26 → @expo/fingerprint@0.21.10 → minimatch@10.2.6` | The reported exposure is in Expo tooling and uses glob input, which messaging requests do not access. npm’s proposed Expo 52 downgrade would break the existing SDK contract. Retest an upstream-compatible fix before changing the Expo dependency tree.                                                                                                                 |
