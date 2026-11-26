# Authentication REST contracts

Use `/v1`. Send JSON through the chosen TLS origin in release builds. Protected endpoints require `Authorization: Bearer <access token>`. All authentication and profile responses use `Cache-Control: no-store`.

| Method and path            | Request body                       | Success                            |
| -------------------------- | ---------------------------------- | ---------------------------------- |
| `POST /v1/auth/register`   | `displayName`, `email`, `password` | 201, session                       |
| `POST /v1/auth/login`      | `email`, `password`                | 200, session                       |
| `POST /v1/auth/refresh`    | `refreshToken`, `operationId`      | 200, rotated session               |
| `POST /v1/auth/logout`     | `refreshToken`                     | 204, idempotent family revocation  |
| `POST /v1/auth/logout-all` | No body, access bearer             | 204, revokes the caller's families |
| `GET /v1/auth/me`          | Access bearer                      | 200, own account                   |
| `GET /v1/users/me`         | Access bearer                      | 200, own account                   |
| `PATCH /v1/users/me`       | `displayName` and access bearer    | 200, updated account               |

Example profile update:

```json
{ "displayName": "Asha Rao" }
```

Example success shapes, with placeholders for generated credentials:

```json
{
  "user": {
    "id": "000000000000000000000000",
    "email": "asha@example.test",
    "displayName": "Asha Rao",
    "createdAt": "2026-11-26T00:00:00.000Z",
    "avatarUrl": null
  },
  "accessToken": "<signed JWT>",
  "accessExpiresAt": "2026-11-26T00:05:00.000Z",
  "refreshToken": "<43-character Base64URL credential>"
}
```

The account endpoints return the inner user object. Invalid request shapes return 400. Invalid credentials return 401. Duplicate registrations and rotation conflicts return 409. Rate limits return 429 with `Retry-After` when a quota is exhausted. The error envelope is `{ statusCode, code, message, requestId }`. Shared schemas live in [the contracts package](../packages/contracts/src/auth.ts).
