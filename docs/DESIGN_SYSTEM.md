# ChatApp design system

ChatApp helps people keep track of messages through intermittent connections. The experience is calm, exact and familiar. Cream paper and green-black ink set the light theme. A low-saturation green-black ramp sets the dark theme. An amber note marks work that is waiting. Muted red marks a message that needs attention. Photographs and the words people intend to send provide the color and character inside a thread.

The signature is the four-stop delivery rail. Its positions represent this device, the server, the recipient device, and reading. Sending uses an outline at the server step, while sent fills that step. Queued, failed, delivered and read have distinct labels and glyphs. Screen readers receive full explanations.

## Color

The canonical values are in [palette.ts](../apps/mobile/src/design/palette.ts).

| Role                 | Light     | Dark      |
| -------------------- | --------- | --------- |
| Background           | `#F8F6EF` | `#1B211D` |
| Surface              | `#FFFDF8` | `#232B25` |
| Elevated             | `#F0EDE3` | `#2B342D` |
| Primary ink          | `#242B26` | `#F3F0E6` |
| Secondary ink        | `#48564E` | `#C8D0C5` |
| Muted ink            | `#59655D` | `#A9B6AB` |
| Decorative separator | `#D8D9CF` | `#435047` |
| Input boundary       | `#7B877E` | `#849389` |
| Accent               | `#235643` | `#B9D9BF` |
| Success              | `#2B5944` | `#B3D7B8` |
| Warning              | `#714821` | `#E3BD8B` |
| Error                | `#912F2B` | `#F1B0A5` |
| Incoming message     | `#FFFDF8` | `#252E28` |
| Outgoing message     | `#DFEBDF` | `#304236` |

Each delivery state has its own semantic key. Color supports the label and silhouette. Appearance obeys the persisted System, Light or Dark preference. The isolated preview can choose its own appearance.

## Typography and spacing

| Text role         | Size / line height | Treatment                                                                                  |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Display           | 42 / 50            | Georgia on iOS and web, system serif on Android. The inbox uses 34 / 42 on narrow layouts. |
| Heading           | 23 / 30            | Native sans, semibold                                                                      |
| Section           | 16 / 23            | Native sans, semibold                                                                      |
| Body              | 16 / 24            | Native sans, regular                                                                       |
| Secondary         | 14 / 21            | Native sans, regular                                                                       |
| Caption           | 12 / 17            | Native sans, medium                                                                        |
| Input and message | 16 / 23            | Native sans, regular                                                                       |
| Timestamp         | 12 / 17            | Native sans, tabular digits                                                                |

Text scales by default. Avatar initials are decorative and retain their fixed size. Their containing action carries the full name. The scale uses 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64 units. Screens use a 24-unit gutter, common controls have a 48-unit minimum touch target, and message spacing uses 4 or 12 units. Control radius is 10, grouped surface radius is 16, and message radius is 18 with a 6-unit sender corner. The inbox uses dividers instead of cards.

## Icons and motion

Lucide icons share a 1.65 stroke. Common controls use 18-unit icons and dense status marks use 14 or 16. Icon-only actions have explicit labels. Pressed controls change surface or opacity. Navigation fades and newly composed bubbles enter with a short fade when reduced motion is off. Progress is explicit and typing dots are still. See the [component catalog](UI_COMPONENT_CATALOG.md).
