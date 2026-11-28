# Socket security

The NestJS gateway uses Socket.IO 4.8.3 and the existing session/auth module. Connect with WebSocket transport at `/realtime`. Put the short-lived access token in the Socket.IO auth object. The gateway checks signature, issuer, audience, expiry and active session against the same services used by REST. The token stays in memory and handshake auth is cleared after validation.

Nonempty origins must match the socket server’s HTTP(S) origin or the configured `CORS_ORIGINS` allowlist. React Native sends an origin derived from its WebSocket URL. Release traffic requires TLS or a loopback reverse proxy that sets a single HTTPS forwarding header. Preserve the public Host and overwrite any client-supplied `X-Forwarded-Proto` at the proxy. Direct cleartext production upgrades are refused.

Clients send validated `watch`, `unwatch` and `typing` commands. Rooms are server-controlled. Session and membership checks guard subscriptions and emissions. Logout, logout-all and refresh-family revocation disconnect local sockets immediately. A five-second session check catches external account disablement and session changes. JWT expiry also has a timer. Socket.IO ping keeps dead connections from retaining presence indefinitely.

The gateway limits connection attempts per peer, eight simultaneous sockets per user, four watched rooms per socket, 32 socket commands per socket per 10 seconds and 8 KiB packets. Sync HTTP routes limit accounts to 160 requests per 10 seconds. These are single-process limits. Production ingress rate limits and distributed ownership belong to Stage 8.

For development, use the API origin in the mobile settings. Android emulators can reach host localhost through `10.0.2.2`. Use the Mac host or a LAN address for an iOS simulator or physical device as appropriate, and allow local HTTP in the development build only. Production uses the public HTTPS API origin, which Socket.IO upgrades to WSS.
