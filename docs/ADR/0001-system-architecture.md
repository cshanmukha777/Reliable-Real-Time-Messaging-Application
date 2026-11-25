# ADR 0001 — Single NestJS messaging backend

- **Status:** Accepted for implementation
- **Scope:** ChatApp mobile backend and future Electron client

## Context

The capstone calls for React Native, Expo Router, TypeScript, NestJS, REST, WebSockets, MongoDB, Prisma and Expo SQLite. The repository has earlier Supabase planning, a PostgreSQL schema and a placeholder configuration template. The [audit](../PROJECT_AUDIT.md) found no runtime code or tracked deployment.

## Decision

Use a single NestJS service with REST for durable commands and history and a Socket.IO WebSocket gateway for push and ephemeral signals. MongoDB via Prisma is the authority for domain records and the sync log. Use Expo SQLite for native cache and the durable send queue and private object storage for file bytes. Electron later uses the same server protocol. Persist the domain mutation and ordered sync event in one transaction. Scope retries to sender and client UUID, and authorize reads, writes, replay and fanout independently of the transport.

The Supabase-only option would cut initial setup but diverges from the required backend. A hybrid would split identity and durable state and require maintaining two sets of security rules and failure handling. NestJS with a native MongoDB driver could remove Prisma compatibility constraints but would also diverge from the specification. The selected option adds replica-set operations and requires compatible Prisma tooling, with explicit Stage 2 proof before feature work.

## Migration and retirement

1. Keep the existing SQL, environment template and design history as legacy reference in Stage 1. Reuse the entity boundaries, sender/client UUID uniqueness and separate receipt semantics. Re-express permissions as tested NestJS membership, role and ownership rules.
2. Before provisioning a cutover, confirm whether a live Supabase project holds real users, conversations or files. If none exists, begin with fresh MongoDB and synthetic demo accounts. Replace the root setup with the supported mobile/server configuration during scaffolding.
3. If real data exists, take an authorized export and rehearsed backup. Map legacy UUIDs to stable new IDs for users, conversations, memberships, messages and receipts. Preserve sender/client UUIDs, timestamps and receipt semantics. Review identity migration separately and require password reset or re-registration if credentials cannot be migrated safely. Validate attachment ownership and integrity if external files exist.
4. Rehearse in an isolated environment. Check counts, membership invariants, duplicates, references, receipt monotonicity and selected conversation histories. Freeze legacy writes during the cutover, switch the clients once and verify before reopening writes. A rollback before reopening restores the prior service and snapshot. After new writes, reconcile them under a separately approved recovery procedure before reversing traffic. No dual-write or ongoing dual backend.
5. Keep legacy credentials out of new clients. Archive the old setup instructions and disable legacy access after any cutover retention window. Record the result and any data handling decision in the Stage 2 handoff.

## Follow-up

Validate the Prisma/MongoDB and Expo/RN combinations in Stage 2. Use MongoDB replica-set integration tests and explicit index/backfill release procedures. Version REST and WebSocket contracts and make backward-compatible changes until desktop clients can upgrade independently. See [architecture](../ARCHITECTURE.md).
