# Authentication security review

## Controls and evidence

- **Password handling.** Argon2id uses 19,456 KiB, two passes, one lane and a 32-byte output. Successful records use unique library-generated salts. Unknown emails use a dummy verifier. Failed sign-ins share the same response envelope. Registration explicitly communicates a duplicate email with HTTP 409. The local 20-sample hash-plus-verify benchmark measured 18 ms median and 25 ms p95. Deployment capacity still needs its own measurement. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- **Resource limits.** Per-IP per-route budgets are 8 registrations, 15 logins and 60 refresh/logout requests per minute. At most four Argon2 operations run at once per API process. The limiter has a bounded in-memory map and uses the observed peer address. A shared ingress limiter and explicit trusted-proxy configuration are needed when running multiple instances or behind a reverse proxy.
- **Secrets and transport.** Runtime server configuration requires a unique 32-byte hex key. The native auth transport blocks redirects and omits cookies. Server logs omit headers and bodies. Browser CORS uses the explicit origin allowlist and has no cookie-based credentials. Mobile bundle checks include server-only environment canaries and Stage 3 fixture checks.
- **Token handling.** Refresh rotation uses one transaction and a per-operation retry secret. The JWT guard also checks the live session for each protected request. [RFC 9700 rotation guidance](https://www.rfc-editor.org/rfc/rfc9700.html#name-refresh-token-protection)
- **Authorization.** The profile API has only own-account endpoints. An authenticated caller cannot supply a different user ID or request a private account by path. The integration tests confirm unauthorized and revoked-token responses against a real replica set.

## Dependency review

Authentication adds pinned Argon2 bindings, JSON Web Token support and the Expo SDK 58 SecureStore version. The Prisma CLI retains its MongoDB-compatible release. The Effect dependency under Prisma configuration is pinned to 3.22.1 to address its advisory. The workspace audit reported three high, three moderate and zero critical package entries after that change. The remaining findings trace to Prisma CLI configuration (`deepmerge-ts`) and Expo fingerprint/build tooling (`minimatch`). Those tools are separate from the request handlers and are not used to parse authentication requests. Deploy with build tooling separated from the production runtime, and reassess the findings on future compatible SDK/CLI updates.

References: [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw), [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
