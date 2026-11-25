# UI component catalog

Components take typed presentation props and callbacks. The Expo Router production settings route supplies the actual health and SQLite handlers. The fixture preview supplies local inputs and actions to the same components.

| Area         | Components                                                                 | States and behavior                                                                                                |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Layout       | AppScreen, AppHeader, AppText, Surface, Divider, SectionHeader             | Safe-area insets, optional scrolling, semantic text styles, separators and headings                                |
| Controls     | PressTarget, AppButton, IconButton, TextField, SearchField                 | Explicit accessible names, focus, pressed, selected, disabled, loading, validation and clear                       |
| People       | Avatar, AvatarGroup, UnreadIndicator, ConversationRow                      | Photo or initials, overlapping participant seals, online status, unread count, group names and failed preview text |
| Feedback     | EmptyState, ErrorState, LoadingState, OfflineBanner, ConnectionIndicator   | Empty query/inbox, retry, progress, five connection states and text announcements                                  |
| Conversation | ThreadScreen, MessageBubble, MessageStatus, DateSeparator, TypingIndicator | Grouped incoming/outgoing messages, date/unread breaks, retry, attachments, and six delivery states                |
| Composer     | MessageComposer, AttachmentPreview                                         | Multiline, empty, ready, sending, queued offline, attachment selected/removed, upload progress, upload failure     |
| Settings     | SettingsView, SettingsRow, ThemeSelector                                   | Real native preferences, tested backend activation, reset, diagnostics and theme selection                         |

## Screen specifications

| Screen                         | Structure and interactions                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox                          | App mark and profile/settings actions, display title, search, All/Unread/Groups filters, and time-aligned rows. Search results and empty states occupy the same content area.            |
| Direct conversation            | Back, avatar and presence above the scrollable transcript. Group adjacent bubbles by sender. Date and unread dividers, attachment/photo details, typing, and composer after the history. |
| Group conversation and details | Use the same message components with author labels, a participant count and stacked avatars. Details list members by name.                                                               |
| Profile and edit profile       | Avatar, display name, edit action, then a labelled form with save state. The preview edits sample data in memory.                                                                        |
| Settings                       | Appearance radio group, server test/save/reset, local storage probe, and application information. Native handlers retain Stage 2 persistence.                                            |
| Sign in and registration       | Labelled email and password inputs, with display name for registration. Buttons show the intended hierarchy in preview. Account behavior is a later stage.                               |
| New conversation and group     | Searchable people directory and selectable participants. Group setup includes a group-name field. Creation is reserved for messaging wiring.                                             |
| Attachment                     | Photo or file metadata, descriptive image text and preview route. Upload progress belongs to the composer; retry belongs to the failed message.                                          |
| Unavailable, loading and empty | Short explanation plus the action that can resolve the state. No decorative illustrations.                                                                                               |
