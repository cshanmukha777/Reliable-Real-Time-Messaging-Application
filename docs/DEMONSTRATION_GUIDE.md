# Stage 5 demonstration guide

1. Start MongoDB, object storage, the API and a rebuilt Expo development client. Confirm `GET /v1/health/ready` returns a successful readiness response.
2. On two devices or independent clients, create development accounts. Add a third account for testing history visibility. Use short public names with distinct prefixes.
3. From both accounts, discover and start a direct conversation. Send a text from one and refresh the other. Restart the API and reload history to show MongoDB persistence.
4. Create a group. Send a message, invite the third account, and confirm it can see messages sent after joining. Promote another account to admin, remove an ordinary member and verify the removed account loses access after refresh.
5. In a test build, cut off a response immediately after a send commits. Reconnect and tap Send again without editing. Show one canonical message through REST and in the thread. The test suite simulates repeated and concurrent sends with the same operation UUID.
6. Search for a word that exists in another conversation. Confirm results stay in scope. Then delete a sent message using its own sender account and verify it disappears from history and search.
7. Pick a photo and a plain-text attachment on a native device. Show upload progress and the confirmed attachment card. Open the photo or file from the second account. Remove that account or delete the message and verify new downloads fail.
8. Explain the boundary for rejected or uncertain sends. The current draft survives a failure while the conversation remains mounted. Refreshing or reopening another client fetches server state through REST.

Record device, OS version, build type, commit, test accounts by role and observed results. Capture evidence only after the action. Keep access tokens and signed object URLs out of screenshots.

## Stage 7 demonstration

1. Sign in with two distinct accounts in development builds. Open the same conversation. Send a message and observe the second device show it without manual refresh.
2. Watch delivered advance after the recipient persists it. Bring the recipient’s conversation into view to move to read. Use a group to show eligible counts.
3. Connect a second device to the recipient account. Disconnect one device, verify the account stays online, then disconnect the last one.
4. Send another message while the recipient is disconnected. Reconnect and confirm replay. Delete a message and remove a member. Observe the tombstone and revoked cache respectively.
5. Repeat with a queued offline send, an account switch, an app background or foreground transition, and a force-close. Track cursors and the original operation UUID without capturing credentials.
