# Presence and typing

The server tracks authorized socket IDs per account. The first socket makes the account online. The last disconnect makes it offline. A watched conversation receives an authorized member snapshot and subsequent changes. A public search cannot query online users. Disconnect, session revocation, expiry and transport heartbeat clean up socket state.

Typing is keyed by conversation and user. Only members with a live subscription can send it. The client coalesces edits and emits explicit stops after idle, send or navigation. The gateway limits repeated starts and expires the indication after five seconds. Disconnect or revocation clears the last owner’s signal. A peer sees typing only for the active authorized thread. Neither feature is persisted in MongoDB or replayed.

The first deployment uses a single gateway and relay. Multiple API instances need a shared Socket.IO adapter, coordinated relay delivery and distributed presence/typing state before scaling out.
