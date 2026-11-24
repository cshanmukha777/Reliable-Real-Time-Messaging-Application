# Reliable Real-Time Messaging Application

A mobile-first messaging application designed to keep conversations understandable and reliable when connectivity is slow, intermittent, or unavailable.

## Project goals

- Real-time one-to-one messaging without periodic message-history polling
- Clear message lifecycle: queued, sending, sent, delivered, read, and failed
- Offline-first outgoing message queue with safe retry
- Idempotent message submission to prevent duplicate messages
- Live online presence and typing indicators
- Persistent conversation history and read acknowledgements

## Planned technology

- **Mobile:** React Native, Expo, TypeScript, Expo Router
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Local persistence:** Expo SQLite
- **Quality:** TypeScript, ESLint, and focused device testing

## Getting started

### Prerequisites

- Node.js LTS and npm
- Expo Go on a physical device, or an Android/iOS simulator
- A Supabase project

### Create the Expo application

Clone the repository, then scaffold the current Expo Router tabs template into the repository root:

```bash
git clone https://github.com/cshanmukha777/Reliable-Real-Time-Messaging-Application.git
cd Reliable-Real-Time-Messaging-Application
npx create-expo-app@latest . --template tabs
```

If the scaffold command reports that the directory is not empty, preserve the existing documentation and scaffold into a temporary directory before copying the generated application files into this repository.

Install Supabase and local persistence using Expo-compatible package versions:

```bash
npx expo install @supabase/supabase-js expo-sqlite
```

Copy `.env.example` to `.env` and enter the Supabase project URL and publishable/anon key:

```bash
cp .env.example .env
npx expo start
```

Never commit `.env`, service-role keys, access tokens, or other secrets. The mobile app must only use a Supabase publishable/anon key and enforce access through Row Level Security.

## Implementation roadmap

- [ ] Expo + TypeScript application scaffold
- [ ] Supabase client and authentication
- [ ] Profiles and one-to-one conversations
- [ ] Persistent message history and realtime subscriptions
- [ ] Outgoing message queue and visible delivery states
- [ ] Idempotent retry and reconnect synchronization
- [ ] Presence, typing indicators, and read receipts
- [ ] Two-device reliability test and demo recording

## Reliability principles

1. Generate a stable client-side UUID for each outgoing message before attempting network delivery.
2. Persist the message locally before sending it.
3. Reuse the same UUID on every retry; enforce a unique constraint in the database.
4. Treat realtime events as updates, not as the only source of truth. Reconcile persisted server state after reconnect.
5. Do not show a message as delivered or read until the corresponding acknowledgement is received.
6. Keep failed messages and their text visible so users can retry without retyping.

## Documentation

- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Database schema](supabase/schema.sql)

## License

MIT. See [LICENSE](LICENSE).
