# Reliable Real-Time Messaging Application

ChatApp is a university capstone for reliable messaging on iOS and Android. It is designed to keep message state understandable when a network is slow, intermittent or unavailable.

The repository currently contains the Stage 1 audit, architecture, implementation plan and legacy schema. Application setup and executable build commands arrive with the Stage 2 foundation.

## Target stack

| Layer | Technology |
| --- | --- |
| Mobile | React Native, Expo, TypeScript and Expo Router |
| Backend | NestJS REST API and Socket.IO over WebSockets |
| Server persistence | MongoDB replica set via Prisma, plus private object storage for attachments |
| Local persistence | Expo SQLite for the cache and durable outgoing queue |
| Desktop milestone | Electron client and macOS DMG |

The system uses stable client message IDs, a durable local queue, idempotent server writes and reconnect replay. The sender sees delivery and read states only after recipient acknowledgements.

## Project documentation

- [Repository audit](docs/PROJECT_AUDIT.md)
- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Architecture decision and migration strategy](docs/ADR/0001-system-architecture.md)
- [Ten-stage implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Quality gates](docs/QUALITY_GATES.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)

The [early development plan](docs/DEVELOPMENT_PLAN.md), [Supabase SQL](supabase/schema.sql) and [legacy environment template](.env.example) are retained for historical and migration reference. Use the roadmap for active work.

## License

MIT. See [LICENSE](LICENSE).
