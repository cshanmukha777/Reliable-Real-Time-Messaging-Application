# Stage 5 implementation

Stage 5 extends the merged Stage 4 application with authenticated direct and group messaging, member administration, REST history, indexed search, sender-only deletion and private file transfer. The inbox, discovery, thread, composer, search and member views use the existing mobile design system and configured backend.

- [Architecture and authorization](MESSAGING_ARCHITECTURE.md)
- [REST endpoints](API_MESSAGING_CONTRACTS.md)
- [Test commands and evidence](TEST_EVIDENCE.md)
- [Evaluation walkthrough](DEMONSTRATION_GUIDE.md)
- [Traceability](ASSESSMENT_TRACEABILITY.md)

The existing Node, npm, Expo, React Native, NestJS and Prisma pins remain unchanged. Attachment additions are AWS SDK for JavaScript 3.1178.0, Expo SDK 58-compatible photo and document pickers, Expo FileSystem and Expo Sharing. The existing local MongoDB Compose project now offers a VersityGW 1.11.0 profile for S3-compatible storage.

## Local setup

```bash
npm ci
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
openssl rand -hex 32
docker compose -f infrastructure/mongodb/compose.yml up -d mongo
docker compose -f infrastructure/mongodb/compose.yml run --rm mongo-init
npm run prisma:generate
npm run db:push
npm run db:messaging
npm run dev:api
```

Before starting the API, save the generated signing key in the ignored root `.env`. For attachments, set `S3_ENDPOINT=http://127.0.0.1:9000` and `S3_BUCKET=chatapp-local`. Generate independent local values for `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` with `openssl rand -hex 12` and `openssl rand -hex 24`, respectively. Set `S3_PUBLIC_ENDPOINT` when the address the phone uses differs from the API’s internal endpoint. It must be reachable from the device and must appear as the signed host. The API disables upload grants if S3 configuration is absent.

```bash
docker compose -f infrastructure/mongodb/compose.yml --profile attachments up -d objects
npm run storage:local
npm run build:contracts
npm run start -w @chatapp/mobile -- --dev-client
```

Rebuild the iOS or Android development client after adding the native Expo modules. The mobile start command serves a previously installed development build. Follow the [device connectivity guide](LOCAL_DEVELOPMENT.md) for API and storage addresses. Keep MongoDB bound to loopback. A phone needs a LAN-reachable API and S3 public endpoint, while an Android emulator normally uses `10.0.2.2` to reach the host. The optional `CHATAPP_S3_BIND` and `CHATAPP_S3_PORT` values control the local object port binding. Use an explicitly enabled local HTTP development build or HTTPS. Release clients require HTTPS.

## Operational limits

- Local object storage is for development and CI. Use a private bucket, least-privilege object policy, TLS, storage budgets and access logging that redacts signed query strings for deployment.
- Verified object validation checks expected length, reported type, signatures and strict UTF-8. It does not scan for malware, sanitize PDFs or transcode images. Opening files requires a user action and uses the OS share/open flow.
- Stage 5 retains sealed objects after message deletion and may leave orphaned objects after an interrupted attempt. Configure staging retention on the deployment bucket and add database-aware cleanup for sealed objects before a public rollout.
- Discovery limits are per process, and inbox pages are cursor-paginated by conversation ID with activity ordering among loaded rows. The client refreshes on focus and on demand.
- The in-memory composer can retry a failed send while the thread stays open. Closing the app discards its draft and retry state. Stage 6 owns durable drafts, cache, queue and attachment staging. Stage 7 owns sockets, presence, typing, receipts and live updates.

## Stage 6 entry criteria

Complete the native smoke cases in the [demonstration guide](DEMONSTRATION_GUIDE.md) and review Stage 5 before extending the client. Stage 6 should first add an account-scoped SQLite schema for conversation snapshots, drafts, outgoing operations and staged attachment metadata. Persist each draft-to-outbox transition and UUID atomically. Then build a cancellable worker that reuses the existing REST UUID across restarts, reconciles server acknowledgments, and distinguishes recoverable network failures from terminal conflicts or lost membership. Prove force-close recovery, lost responses, repeated reconnects, account and backend switching, and attachment staging cleanup on both platforms. Real-time delivery remains Stage 7.
