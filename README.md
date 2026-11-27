# ChatApp

ChatApp is a university capstone for reliable messaging on iOS and Android. The workspace contains an Expo Router messaging design and developer preview, persistent native settings, real native authentication and direct and group messaging, a NestJS API, shared TypeScript contracts, and a local MongoDB replica set.

## Quick start

Use Node **24.22.3**, npm **11.19.1**, and Docker with Compose v2. Follow the [device setup](docs/LOCAL_DEVELOPMENT.md#mobile-development) to choose an API address your simulator or phone can reach.

```bash
nvm use
npm install --global npm@11.19.1
npm ci
cp .env.example .env
printf "\nAUTH_SIGNING_KEY=%s\n" "$(openssl rand -hex 32)" >> .env
cp apps/mobile/.env.example apps/mobile/.env.local
docker compose -f infrastructure/mongodb/compose.yml up -d mongo
docker compose -f infrastructure/mongodb/compose.yml run --rm mongo-init
npm run prisma:generate
npm run db:push
npm run db:messaging
npm run dev:api
```

In another terminal, after setting the mobile API address, run `npm run dev:mobile`. The API responds at `/v1/health`, `/v1/health/live`, and `/v1/health/ready`.

## Documentation

- [Local development, device setup and testing](docs/LOCAL_DEVELOPMENT.md)
- [Environment configuration](docs/ENVIRONMENT.md)
- [MongoDB replica-set setup](docs/DATABASE_SETUP.md)
- [Stage 2 implementation and verification](docs/STAGE_2_IMPLEMENTATION.md)
- [Stage 3 design preview and screenshots](docs/STAGE_3_IMPLEMENTATION.md)
- [Stage 4 authentication and verification](docs/STAGE_4_IMPLEMENTATION.md)
- [Stage 5 messaging and private attachment setup](docs/STAGE_5_IMPLEMENTATION.md)
- [Architecture](docs/ARCHITECTURE.md), [ADR](docs/ADR/0001-system-architecture.md), and [implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Baseline audit](docs/PROJECT_AUDIT.md), [feature matrix](docs/FEATURE_MATRIX.md), and [quality gates](docs/QUALITY_GATES.md)

The [legacy Supabase SQL](supabase/schema.sql) remains available for migration review.

MIT. See [LICENSE](LICENSE).
