# Stage 6 verification

## Automated evidence

```bash
npm ci --include=dev
npm run prisma:generate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:api
npm run test:db
EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npm run doctor -w @chatapp/mobile
EXPO_OFFLINE=1 npm run dependencies:check -w @chatapp/mobile
npm run router:check -w @chatapp/mobile
EXPO_PUBLIC_API_BASE_URL=https://api.example.com npm run export:android -w @chatapp/mobile
EXPO_PUBLIC_API_BASE_URL=https://api.example.com npm run export:ios -w @chatapp/mobile
npm run check:security
```

Provide the replica set and private object service described in the [test plan](TEST_PLAN.md) before running `test:db`. CI runs it with MongoDB 7.0.40 and VersityGW 1.11.0. The live recovery test opens real SQLite, uploads to the object store, drops the responses after the object and message are committed, reopens SQLite between attempts, and proves that one object transfer and one canonical MongoDB message remain. It also checks that peers never receive the sender’s client operation UUID and that an opt-in history tombstone contains no original payload.

The mobile integration tests use Node 24's actual SQLite engine and filesystem. They exercise the Stage 5 migration, transactional rollback, child-process termination after durable claim, contention between processes, expiry and lease renewal, draft isolation, canceled scope, missing and corrupted files, lost responses, and terminal and recoverable errors. The existing auth suite checks cold offline access against a matched secure account and confirms that explicit credential rejection still expires the session.

## Native smoke gate

The execution host is Linux. It had no local or provisioned Android device/emulator or Android Debug Bridge, and no macOS, Xcode or iOS simulator. Android and iOS Expo bundle exports cover bundling only. The following remain pending on both platforms.

| Check                                          | Evidence to collect                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install, launch, login and session restoration | Device and build version, then launch a signed-in account with networking enabled and again while offline                                                |
| Photo and document picker                      | Allow and deny permissions where applicable, cancel each picker, select a supported file and confirm its appearance in the draft                         |
| Preview and opening                            | View a photo and open/share a downloaded file with the platform share sheet                                                                              |
| Deletion confirmation                          | Cancel, then confirm a sender deletion and check history after refreshing another client                                                                 |
| Upload and download progress and errors        | Observe an outbox upload, interrupt it, restore network, and check progress, retry feedback and the resulting download or user-visible error             |
| Force-close recovery                           | Save a draft, queue text with a file while disconnected, force-close, relaunch offline, then reconnect and verify one delivery through REST              |
| Scope switch and access loss                   | Sign out with queued work, sign in as a second account or on a second origin, then regain the original scope and check that a revoked thread cannot send |

Record device/OS, build mode, commit and observed outcome for each native check. Complete the [Stage 5 demonstration](DEMONSTRATION_GUIDE.md) against the same device build.
