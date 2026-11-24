# Five-Day Development Plan

## Day 1 — Foundation
- Scaffold Expo Router + TypeScript
- Configure Supabase client and environment variables
- Build authentication and profile flow
- Establish navigation and visual design system

## Day 2 — Core messaging
- Create conversations and participant membership
- Build chat list and conversation screen
- Persist and display message history
- Subscribe to realtime message inserts

## Day 3 — Delivery reliability
- Add SQLite-backed outgoing queue
- Implement queued/sending/sent/failed states
- Add stable client message IDs and idempotent retries
- Reconcile local state after reconnect

## Day 4 — Communication signals
- Add delivered/read receipts
- Add online presence and typing indicators
- Test offline/online transitions and duplicate-send cases

## Day 5 — Quality and submission
- Polish empty, loading, error, and retry states
- Test using two accounts/devices
- Capture demo evidence and update README
- Verify clean install and document known limitations

## Demo acceptance scenario

1. Sign in on two devices/accounts and open the same conversation.
2. Disable network on the recipient device.
3. Send a message from the sender and show its clear pending/sending state.
4. Re-enable recipient connectivity and verify synchronization.
5. Confirm the message appears exactly once and the sender receives delivery/read acknowledgements.
