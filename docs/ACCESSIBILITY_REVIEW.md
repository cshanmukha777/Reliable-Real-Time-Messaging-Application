# Stage 3 accessibility review

This review uses the [Stage 1 quality gates](QUALITY_GATES.md). It distinguishes checks on the Expo web preview, automated source checks and device checks.

| Area           | Verification                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette        | Automated WCAG contrast calculations cover common foreground/background pairs, both button treatments, input boundaries, warnings and all six status texts in both themes. The thresholds are 4.5:1 for text and 3:1 for meaningful control outlines. |
| Touch          | Shared controls and icon-only actions have a minimum 48-unit target. Rows can grow when labels wrap.                                                                                                                                                  |
| Semantics      | Header and button roles, labelled inputs, a radio group for appearance, upload progress, explicit disabled state, and labelled message status. Decorative icons and avatar initials are excluded from accessibility announcements.                    |
| Status         | Accessible names explain all six lifecycle states. The status label uses a polite live region. An iOS change handler announces transitions after the first render. Screen-reader announcement order requires confirmation on hardware.                |
| Text sizing    | Components use native scaling by default and flex wrapping for constrained layouts. Browser enlargement is a layout check alongside the normal viewport captures.                                                                                     |
| Motion         | Animated entry and navigation respect the platform preference. Reduced motion is the initial fallback while the setting loads. Typing dots are static.                                                                                                |
| Keyboard focus | Preview controls have a visible accent outline, field boundaries change at focus, and the browser sequence includes keyboard focus and multiline entry.                                                                                               |
| Device checks  | VoiceOver, TalkBack, native Dynamic Type/font scaling, software keyboard placement, safe-area appearance on cutout devices and native SQLite restart need physical devices or simulators.                                                             |

Native follow-up should cover a 320-unit width or the smallest supported device, 200% text, long contact names and unbroken filenames, reduced motion, input focus handoff, TalkBack and VoiceOver reading order, and the connection warning and retry announcement.
