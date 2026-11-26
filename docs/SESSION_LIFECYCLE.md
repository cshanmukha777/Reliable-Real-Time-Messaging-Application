# Session lifecycle

## Server credentials

Access tokens are HS256 JWTs valid for at most five minutes. Verification pins the algorithm, issuer and native audience and validates `sub`, `sid`, `iat` and `exp`. Every protected request also checks the MongoDB session and active account. A session lasts at most 30 days from creation. The session ObjectId remains the refresh family ID through every rotation.

A refresh credential is a 256-bit opaque Base64URL value. An operation ID is an independent 256-bit value. The native client persists the pending operation before sending it. The server derives the same successor with a domain-separated HMAC if the same request reaches it twice. MongoDB stores SHA-256 digests of the old and new token and the operation ID. The raw credentials are returned only to the requesting client.

| Refresh outcome                                       | Server behavior                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Current token                                         | Atomically compare-and-swap the current digest and insert the spent-token record.           |
| Exact retry while the successor is current            | Return the same refresh successor and a valid access token.                                 |
| Exact retry after the successor has advanced          | Return 409 without revocation.                                                              |
| Different operation within three seconds of rotation  | Return 409 without issuing credentials or revoking a possible in-flight legitimate request. |
| Different operation after that window                 | Revoke that session family and return 401.                                                  |
| Unknown, expired, disabled-account or revoked session | Return 401.                                                                                 |

Spent records remain associated with the session so replay stays detectable for its full lifetime. Production retention should delete spent records only after their session has expired and the chosen audit retention period has ended. No automatic purge is configured in this stage.

## Native device

Expo SecureStore stores one origin-bound record with user ID, refresh credential and pending operation. On iOS it uses the unlocked, this-device-only Keychain accessibility option. Access tokens and profile context live in memory. Per-account SQLite filenames are keyed by a SHA-256 digest of the exact normalized origin and user ID. The global SQLite database holds device preferences and diagnostics. No account records are written to it.

Cold start opens device preferences, retrieves the secure record, rotates the credential, retrieves `/auth/me`, and only then admits the protected routes. A temporary error holds the app in a retryable unavailable state and preserves the pending operation. A 401 clears it. Concurrent in-process refresh callers share a single request.

Sign-out immediately closes authenticated access. The app marks the old secure record retired before deletion when storage permits and attempts remote revocation on the old origin. If revocation is unreachable, it reports that sign-out was local. If deletion fails, it remains locked and retries deletion instead of authorizing that record. If both secure writes and server revocation fail, a later process may still find the old record. Backend changes wait for successful local deletion before committing the new origin. Appearance persists through sign-out and backend changes.

The browser is limited to the isolated design preview. The native credential path uses no browser storage and no browser auth cookies.
