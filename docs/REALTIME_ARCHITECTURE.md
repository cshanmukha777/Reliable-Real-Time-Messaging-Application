# Stage 7 real-time architecture

```mermaid
flowchart LR
  App["Expo and account SQLite"] <-->|"Authenticated REST replay and receipts"| API["NestJS"]
  API <-->|"Domain writes and event log"| DB["MongoDB replica set"]
  DB --> Relay["Leased event relay"]
  Relay --> Gateway["Socket.IO gateway"]
  Gateway -->|"Availability hints"| App
```

Socket messages announce availability. Durable REST replay supplies canonical content. The event and receipt records commit with each domain write. The app applies each contiguous replay page to the existing account SQLite store and commits its cursor in the same transaction.

## Authenticate a connection

```mermaid
sequenceDiagram
  participant C as Expo client
  participant S as Session manager
  participant G as Gateway
  participant D as Session store
  C->>S: Request current access token
  S-->>C: Token and generation
  C->>G: Open upgrade and send Socket.IO auth
  G->>D: Validate signed claims and active session
  G-->>C: Join account stream and announce cursor
```

## Commit a message and announce it

```mermaid
sequenceDiagram
  participant C as Sender
  participant API as REST service
  participant D as MongoDB
  participant W as Relay
  participant R as Recipient
  C->>API: Send original operation UUID
  API->>D: Commit message, receipt targets and stream events
  API-->>C: Canonical message
  W->>D: Claim committed event
  W-->>R: Stream high-water hint
  R->>API: Replay after committed cursor
```

## Retry relay work after a crash

```mermaid
sequenceDiagram
  participant W as Relay
  participant D as MongoDB
  participant C as Connected client
  W->>D: Claim event lease
  W-->>C: Publish hint
  Note over W,D: Process exits before checkpoint
  W->>D: Reclaim after lease expiry
  W-->>C: Duplicate hint
  W->>D: Checkpoint using current lease
  C->>C: Ignore cursor positions already applied
```

## Reconnect and replay

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant A as Sync API
  participant D as SQLite
  C->>G: Reconnect and join account channel
  C->>D: Read last committed cursor
  C->>A: Request ordered events
  A-->>C: Page or snapshot-required response
  C->>D: Commit projections and cursor
  C->>A: Continue if the watermark is ahead
```

## Subscribe during ongoing writes

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant A as Sync API
  C->>C: Register availability listeners
  C->>G: Join account and watch active thread
  G-->>C: Announce post-join watermark
  C->>A: Start replay
  G-->>C: A newer hint arrives during replay
  C->>C: Keep the highest requested sequence
  A-->>C: Return current page
  C->>A: Drain through latest known sequence
```

## Progress delivered and read

```mermaid
sequenceDiagram
  participant A as Sync API
  participant C as Recipient
  participant D as SQLite
  participant S as Sender
  A-->>C: Return canonical message
  C->>D: Commit message, cursor and delivered intent
  C->>A: Acknowledge delivered
  C->>D: Persist read intent when message is visible
  C->>A: Acknowledge read
  A-->>S: New receipt event hint
```

## Presence and typing

```mermaid
sequenceDiagram
  participant A as Account device
  participant G as Gateway
  participant B as Authorized peer
  A->>G: Connect or subscribe
  G-->>B: Updated online member set
  A->>G: Coalesced typing start
  G-->>B: Authorized typing signal
  Note over G: Five-second expiry or explicit stop
  G-->>B: Clear typing indication
```

## Revoke membership

```mermaid
sequenceDiagram
  participant A as Group admin
  participant S as Sync API
  participant G as Gateway
  participant C as Removed account
  participant D as SQLite
  A->>S: Remove member
  S->>S: Commit membership and account revocation
  G->>G: Remove old conversation subscriptions
  G-->>C: Account stream advances
  C->>S: Replay revocation
  C->>D: Purge server cache and block pending sends
```

Read [event storage](REALTIME_EVENT_MODEL.md), [replay and retention](EVENT_REPLAY_AND_RETENTION.md), [socket security](SOCKET_SECURITY.md), [receipts](RECEIPT_SEMANTICS.md), and [presence and typing](PRESENCE_AND_TYPING.md) for the deployment contracts.
