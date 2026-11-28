# Stage 7 implementation and handoff

Stage 7 connects the existing account-scoped Expo store to an authenticated Socket.IO control channel, MongoDB event log and leased relay. REST remains authoritative for canonical replay, history and receipts. The offline outbox, upload recovery and message operation UUID stay in place.

## Draft commit boundary

Each edit starts a serialized SQLite write immediately. The composer displays **Saving draft…** until the latest revision commits. A draft becomes durable when SQLite commits it. An abrupt termination before that commit can still lose the in-progress edit. Sending waits for the draft write, then retains the existing atomic draft-to-outbox transaction. The kill test terminates the process immediately after the edit is confirmed and verifies both the latest draft and the earlier immutable queued message after reopening.

## Rollout

Use the pinned Node and npm versions. Deploy the API first, with a MongoDB replica set and a trusted TLS ingress.

```bash
npm ci --include=dev
npm run prisma:generate
npm run db:push
npm run db:messaging
npm run dev:api
```

Start the Expo development client with the existing [local setup](LOCAL_DEVELOPMENT.md). The Socket.IO dependencies are pinned to server/client 4.8.3 and NestJS adapter/gateway 11.2.12. Mobile SQLite migration v3 adds stream and receipt tables. Existing installations keep earlier data and the existing REST response shapes.

[Architecture diagrams](REALTIME_ARCHITECTURE.md) · [API and retention](EVENT_REPLAY_AND_RETENTION.md) · [Verification](TEST_EVIDENCE.md#stage-7-verification)

## Stage 8 entry

1. Run the carried-forward Stage 5 and Stage 6 checks and Stage 7 two-device release gate on Android and iOS.
2. Deploy to staging behind a TLS proxy and rehearse session revocation, credential-free telemetry, database backup/restore and retention rebase.
3. Load-test the configured rate limits and relay backlog. Measure the [quality targets](QUALITY_GATES.md), then tune SQLite projection cost and gateway fanout with measured evidence.
4. Review production storage retention and dependency advisories. Keep push, desktop and distributed presence outside the single-instance deployment until their own release criteria are defined.
