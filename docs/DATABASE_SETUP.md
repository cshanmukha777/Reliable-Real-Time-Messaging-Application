# MongoDB replica-set setup

Prisma CLI and Client are pinned to 6.19.3. The MongoDB connector uses `prisma db push` for schema and index changes. Keep schema changes and any future backfill scripts in source control. Review changes before applying them to shared environments.

## Start and initialize

```bash
docker compose -f infrastructure/mongodb/compose.yml up -d mongo
docker compose -f infrastructure/mongodb/compose.yml run --rm mongo-init
docker compose -f infrastructure/mongodb/compose.yml ps
npm run prisma:generate
npm run db:push
```

Compose pins MongoDB Community `7.0.40` for both containers. The initializer creates `chatapp-rs` with member `mongo:27017` and waits for a writable primary. It detects the existing set on subsequent runs. Compose publishes the database to host loopback only. Bind-mounted examples provide no credentials. Use `directConnection=true` on the host because the replica member advertises the internal Docker DNS name. Override the host port using `CHATAPP_MONGO_PORT` and adjust the local URI if 27017 is occupied. This is a single-member development and test set. A shared environment should use a secured replica set.

The `foundation_probes` MongoDB collection maps Prisma `FoundationProbe`. MongoDB assigns the indexed ObjectId `_id`. Prisma creates a unique single-field index for `key`, with a string `value` and UTC `createdAt` timestamp per document.

## Inspect or reset the local service

```bash
docker compose -f infrastructure/mongodb/compose.yml exec mongo mongosh --quiet --eval 'rs.status().set'
docker compose -f infrastructure/mongodb/compose.yml exec mongo mongosh chatapp_dev --quiet --eval 'db.foundation_probes.getIndexes()'
docker compose -f infrastructure/mongodb/compose.yml logs mongo
docker compose -f infrastructure/mongodb/compose.yml down
```

For a deliberate fresh setup, replace the last command with `docker compose -f infrastructure/mongodb/compose.yml down --volumes`. This deletes the local Compose database volume. Then repeat **Start and initialize**.

## Isolated integration tests

```bash
CHATAPP_TEST_DATABASE_URL='mongodb://127.0.0.1:27017/chatapp_test?replicaSet=chatapp-rs&directConnection=true' npm run test:db
```

The suite refuses a URI for an arbitrary database. It derives a random `chatapp_test_<suffix>` database, applies the schema and cleans up only that database. Tests require a real primary and verify persistence, multi-record commit, rollback on a unique violation, and exactly one canonical row across eight concurrent duplicate attempts. An in-process TCP switch cuts actual API-to-MongoDB connections, then restores them while the same API process remains online. Readiness must change from 200 to 503 and back to 200. Liveness must remain 200.

References: [Prisma MongoDB connector](https://www.prisma.io/docs/orm/v6/overview/databases/mongodb), [MongoDB replica-set deployment](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/) and [MongoDB 7.0 release notes](https://www.mongodb.com/docs/manual/release-notes/7.0/).
