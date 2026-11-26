# Stage 4 authentication handoff

Stage 4 starts after Stage 3 merged at `41409e4`. It adds real native registration, login, restoration, refresh, logout, global revocation and owner-only profile editing. The previous appearance, backend test and SQLite diagnostic flows use the same preference adapters.

| Layer      | Implementation                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API        | Auth module, Argon2id verifier, signed access tokens, refresh operations, live-session guard and fixed-window rate limiter                                                                                    |
| Storage    | Prisma User, Profile, Session and SpentRefresh models. Existing FoundationProbe is retained.                                                                                                                  |
| Mobile     | Origin-bound AuthApi, Expo SecureStore adapter, observable session manager, account storage scope, protected Router groups and native forms                                                                   |
| Navigation | `(auth)/sign-in`, `(auth)/register`, protected `(app)/index` and `(app)/profile`. Native `settings` is reachable before signing in so a user can choose the backend. Design preview remains development-only. |

See the [architecture and setup](AUTHENTICATION.md), [session lifecycle](SESSION_LIFECYCLE.md), [REST contracts](API_AUTH_CONTRACTS.md), and [security review](AUTH_SECURITY_REVIEW.md).

## Verification

The authentication HTTP suite registered two accounts in a real MongoDB replica set, verified password hashes, triggered and checked transaction rollback, tested token claims, refreshed both clients after simulated process restart, and verified owner-only profile editing. It also checked duplicate refresh behavior, replay-family revocation, expired refresh, current-session revocation, logout-all and backend-origin mismatch. Local verification passed 21 unit tests, 3 HTTP tests and 12 MongoDB integration test entries. The mobile unit suite exercises secure-storage adapter contracts and failure behavior using test keychains.

Android and iOS exports and release-canary checks provide bundle evidence. Native device sign-in, deep links, hardware-backed credential storage and force-close/relaunch still require device or simulator verification. The account tests are two HTTP clients, with separate credential adapters. Browser use remains the existing design preview.

## Stage 5 readiness

The API exports an access guard and current-account decorator for future messaging routes. The native session and account-scope provider are available for inbox and message ownership. The authenticated inbox is empty until messaging data exists.
