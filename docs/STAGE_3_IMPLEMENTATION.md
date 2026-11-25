# Stage 3 messaging design

Stage 3 builds on the Expo Router and native settings from Stage 2. The public shell shows the conversation empty state until real sessions and data exist. The development preview renders shared components with clearly labelled, in-memory fixtures. The preview route redirects in release and the release Metro resolver replaces its fixture entry. Both platform export checks scan for preview markers.

## Ordered design passes

The starting shell consisted of a headline and a settings link. Settings used a flat list of labels and default buttons with a small local palette. There was no shared spacing grid, chat hierarchy, icon family or delivery-state treatment. The direction and the nine passes were planned in sequence across the entire screen set before the new components were built.

1. **Spacing** established uniform 4-unit steps, stable inbox row rhythm, 24-unit gutters, and 48-unit actions.
2. **Color** specified paper and night palettes, one forest accent, and dedicated warning and failure roles.
3. **Icons** used an 18-unit Lucide set and smaller variants for secondary status.
4. **Copy** led with the person, message or action. Explicit retry and offline wording explain what changes next.
5. **Typography** gave the inbox a serif title and reserved native sans and tabular numerals for the rest.
6. **Layout** organized the inbox by rows, set the composer outside scrolling history, and grouped settings by task.
7. **Details** refined matching controls, focus, unread counts, message corners, and the transmission rail.
8. **Visuals** used personal initials and one photograph in the context of an attachment.
9. **Motion** limited feedback to a short entrance, navigation transition and state changes, with reduced-motion handling.

See [design tokens](DESIGN_SYSTEM.md), [references](DESIGN_REFERENCES.md), [component and screen inventory](UI_COMPONENT_CATALOG.md), and [accessibility review](ACCESSIBILITY_REVIEW.md).

## Preview

```bash
npm ci
npm run build:contracts
EXPO_PUBLIC_DESIGN_PREVIEW=1 npm run preview -w @chatapp/mobile -- --localhost
```

Open the local Expo URL. Use the moon/sun control to change theme and **Scenes** for conversation, delivery, offline, attachment, settings, and auxiliary screens. The native development shell also offers **Open design preview**. Native preferences and the real backend live under **Settings** in the main app. The preview is self-contained and performs no API call or SQLite write.

## Rendered evidence

These captures are from the Expo web development preview in Chromium. Primary scenes were captured at 390 × 844 CSS pixels. Settings used 430 × 980 to show all sections, and the compact group used 320 × 720.

| Scene                   | Captures                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation list       | [Light](screenshots/stage-3/01-inbox-light.jpg), [dark](screenshots/stage-3/02-inbox-dark.jpg)                                                                                     |
| Conversation            | [Light](screenshots/stage-3/03-conversation-light.jpg), [dark](screenshots/stage-3/04-conversation-dark.jpg), [compact group](screenshots/stage-3/14-compact-group.jpg)            |
| Reliability             | [Failed with retry](screenshots/stage-3/05-failed-message.jpg), [offline](screenshots/stage-3/06-offline.jpg), [six delivery states](screenshots/stage-3/12-delivery-states.jpg)   |
| Composer and settings   | [Multiline and selected file](screenshots/stage-3/07-composer.jpg), [upload progress](screenshots/stage-3/13-composer-upload.jpg), [settings](screenshots/stage-3/08-settings.jpg) |
| Search and empty states | [Search](screenshots/stage-3/09-search.jpg), [no results](screenshots/stage-3/10-no-results.jpg), [empty inbox](screenshots/stage-3/11-empty-inbox.jpg)                            |

I reviewed the actual captures. The first render exposed an oversized attachment that pushed the latest message below the fold, and a missing exposed checked state on the appearance controls. Subsequent renders constrained the photo, added explicit selection semantics, used compact display type for narrow screens, and aligned input focus treatment.

The browser run covered 320 × 720, 390 × 844, 412 × 892 and 430 × 932. It checked long names, a five-member group, multiline composer entry, tab focus, simulated 135% text sizing and the reduced-motion browser setting. Interactions included search, retry, offline queue presentation, attachment upload progress/failure and theme selection. Production Android and iOS exports excluded sample message text and the fixture JPEG even when the preview environment flag was set during export.

Local checks passed for TypeScript, lint, formatting, 12 unit tests, two API HTTP tests, six MongoDB replica-set test entries, native exports and bundle isolation. Expo Doctor and dependency validation are included in the existing pull-request workflow. Device launch and assistive technology evidence still require an iOS or Android runtime.

## Stage 4 handoff

The app shell, input fields, status views, preview and native settings are in place for routing and authentication work. The authentication forms are present as visual references. Native screen-reader and device verification are still open.
