# Stage 2 implementation and verification

The foundation starts from the merged Stage 1 architecture on `main` at `9df91a7`. The repository now has an npm workspace and one lockfile. This stage introduces the settings and diagnostic mobile shell, NestJS health API, shared contracts, database probe and engineering checks.

## Workspace

- `apps/mobile/app/` contains the Expo Router layout, startup boundary, home and settings. `apps/mobile/src/` owns public config, API requests, Expo SQLite and persistence adapters. `apps/mobile/test/` verifies the platform-neutral persistence code against real SQLite on Node.
- `apps/api/src/` contains startup, app/config/database/health modules, request IDs, HTTP errors and validation. `apps/api/prisma/` contains the MongoDB schema. `apps/api/test/` covers server startup, HTTP health and isolated replica-set integration.
- `packages/contracts/` builds the shared runtime schemas and TypeScript declarations for environment, health/error responses, backend settings, identifiers and pagination.
- `infrastructure/mongodb/` holds Compose and the replica-set initializer. `.github/workflows/stage-2.yml` defines static quality, backend, dual-platform mobile export, database integration and secret/bundle jobs.

## Version pins and compatibility

| Area         | Version                                            |
| ------------ | -------------------------------------------------- |
| Toolchain    | Node.js 24.22.3 LTS, npm 11.19.1, TypeScript 5.9.3 |
| Mobile       | Expo 58.0.26, React Native 0.88.1, React 19.3.0    |
| Expo modules | Router 58.0.32, SQLite 58.0.18, dev client 58.0.21 |
| API          | NestJS 11.2.12, RxJS 7.8.2                         |
| Data         | Prisma CLI/Client 6.19.3, MongoDB Community 7.0.40 |

Expo’s SDK 58 compatibility table lists React Native 0.88, React 19.3 and Node 22.13 or newer. The Expo package’s bundled native module manifest guided the exact Expo module pins. NestJS 11 supports Node 20+ and RxJS 7. Prisma documents MongoDB on the 6.19 release line and requires a replica set for transaction support. Socket.IO is reserved for Stage 7. At that stage, select the Socket.IO version declared by the matching NestJS adapter and pin a compatible client, then verify over WebSockets.

References: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Expo Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/), [Expo SQLite](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [NestJS version compatibility](https://docs.nestjs.com/faq/versions), [NestJS gateways](https://docs.nestjs.com/websockets/gateways), and [Prisma MongoDB support](https://www.prisma.io/docs/orm/v6/overview/databases/mongodb).

## API and persistence

| Endpoint               | Contract                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/health`       | 200 with service, API version and environment. Used to validate a candidate backend.                                     |
| `GET /v1/health/live`  | 200 whenever the HTTP process can serve requests. Independent of MongoDB.                                                |
| `GET /v1/health/ready` | 200 while Prisma can connect to a writable replica-set primary, 503 otherwise. Both states use the shared health schema. |

The SQLite settings database has versioned, transactional migrations. Version 1 creates `app_preference` and `foundation_probe` with text primary keys. The app records the latest probe ID so it can verify the same record after a restart. The mobile client validates the health response before allowing an override and has an explicit reset to the configured default. See [environment configuration](ENVIRONMENT.md) and [database setup](DATABASE_SETUP.md).

## Verification evidence and open gates

- The local MongoDB 7.0.40 integration suite ran against an elected replica-set primary. It passed six Node test entries, including five subtests for connection and persistence, transaction commit, rollback, concurrent uniqueness, and 200/503/200 readiness recovery. The test switched an actual TCP connection. This Linux workspace had no Docker executable, so it used the pinned MongoDB binary and the same replica-set topology. GitHub Actions covers the Compose path.
- The Node SQLite suite writes an origin, appearance and unique probe, closes the database, opens it in a fresh process, and checks the same records and schema version. It also exercises rollback and failed migration recovery.
- Android and iOS exports are compile-time evidence. A native launch, LAN test and force-close/relaunch of Expo SQLite on both platforms remain open. This environment has neither Xcode nor a configured Android runtime. The [device smoke steps](LOCAL_DEVELOPMENT.md#mobile-development) describe how to record that evidence.
- The npm production audit reported seven advisory entries, rooted in Expo fingerprinting and Prisma CLI dependencies, with zero critical entries at the time of verification. Review the affected tooling before release.
- GitHub Actions job results are recorded on the PR. Local checks and platform exports are separate evidence from a hosted run.
- The Supabase SQL is preserved. No live project or production dataset was supplied, so migration disposition remains unknown. The new workspace connects only to NestJS and MongoDB and uses synthetic fixtures. The repository owner must confirm whether there is a data owner and cutover to schedule before connecting real users.

Stage 3 starts in a separate change after review.
