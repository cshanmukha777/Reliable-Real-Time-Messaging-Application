# ChatApp authentication

ChatApp authenticates native clients against the selected NestJS origin. The auth module implements registration, login, credentials, rotation, session revocation and owner-only profile reads and writes. The Expo client uses the Stage 3 theme and controls. [REST contracts](API_AUTH_CONTRACTS.md) and [session lifecycle](SESSION_LIFECYCLE.md) describe the boundaries in detail.

## Setup

1. Follow [local development](LOCAL_DEVELOPMENT.md) to start the MongoDB replica set.
2. Set `AUTH_SIGNING_KEY` in the API's ignored root `.env` to the output of `openssl rand -hex 32`. Use a unique secret per environment. `AUTH_ISSUER` defaults to `chatapp-api`.
3. Run `npm run prisma:generate`, `npm run db:push` and `npm run dev:api`.
4. Use the mobile Settings screen to test and select the API origin. Then register or sign in.

Passwords use 12–128 JavaScript string code units. Email is trimmed and lowercased before validation and persistence, with a unique database index. No password trimming or normalization occurs. Duplicate registration returns 409. Bad login credentials use the same 401 response for unknown email, wrong password and disabled accounts.

## MongoDB models

| Model          | Fields and indexes                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`         | ObjectId, normalized unique email, Argon2id hash, account status, created/updated and last-login timestamps                                                                |
| `Profile`      | ObjectId, unique ObjectId `userId`, display name, nullable avatar URL, created/updated timestamps                                                                          |
| `Session`      | ObjectId session/family ID, ObjectId `userId`, unique current refresh hash, absolute expiry, revocation and activity timestamps. Indexes cover user/revocation and expiry. |
| `SpentRefresh` | ObjectId, unique spent refresh hash, ObjectId `sessionId` index, operation digest and rotation timestamp                                                                   |

Registration creates the user, profile and initial session within one replica-set transaction. An access guard validates both the JWT and the live session, including the subject, expiry, revocation and account status. Profile writes derive ownership from that guard and validate an exact-field request body. Avatar upload is deferred.

## Two-account verification

Run the [replica-set tests](DATABASE_SETUP.md#isolated-integration-tests) with `npm run test:db`. They use real HTTP, real MongoDB and two separate mobile session-manager instances with isolated test keychains. To reproduce with devices, register distinct accounts, sign in from two development builds, force-close and relaunch, edit one display name, and verify the other profile is unchanged. Then sign out one device and verify its session is revoked. Finally, switch a client to a second trusted origin in Settings and confirm it opens sign-in before that origin receives any authenticated request.
