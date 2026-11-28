# Receipt semantics

A new canonical send captures eligible active members except the sender. Later additions do not become targets of prior messages. Removal makes the old recipient’s targets ineligible, preserving recorded timestamps. Rejoining does not reactivate historical targets. Messages from earlier stages with no targets remain **Sent**.

The recipient stores the canonical message, event position and delivered intent in the same SQLite commit. The worker submits the acknowledgment only after that commit. The local acknowledgment row survives restarts. A read intent starts when a laid-out incoming row intersects the viewport of the focused conversation and the app is active. Reading implies delivery. Repeated or out-of-order acknowledgments preserve durable timestamps and produce no redundant event.

Direct threads progress from sent to delivered to read for their one eligible recipient. Group threads show accessible delivered and read counts against eligible recipients. A zero-eligible group remains sent. Only the sender receives aggregate counts in message projections.
