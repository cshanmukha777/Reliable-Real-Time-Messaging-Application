/* eslint-disable @typescript-eslint/no-require-imports -- Metro resolves bundled image assets through require. */
import type { Attachment } from '../../chat/attachments';
import type { Person } from '../../chat/avatar';
import type { ConversationSummary } from '../../chat/inbox';
import type { ThreadEntry } from '../../chat/thread';

export const self: Person = { name: 'Aarav Mehta', tint: 'avatarPaper' };
export const mira: Person = { name: 'Mira Sen', tint: 'avatarFern' };
const imran: Person = { name: 'Imran Khan', tint: 'avatarSlate' };
const leela: Person = { name: 'Leela Menon', tint: 'avatarClay' };
const dev: Person = { name: 'Dev Rao', tint: 'avatarPaper' };
const ananya: Person = { name: 'Ananya Iyer', tint: 'avatarClay' };
export const contacts = [mira, imran, leela, dev, ananya];

export const conversations: ConversationSummary[] = [
  {
    id: 'mira',
    name: mira.name,
    people: [mira],
    preview: 'I saved you the seat by the window.',
    time: '9:43',
    unread: 2,
    online: true,
  },
  {
    id: 'sunday',
    name: 'Sunday field notes',
    people: [imran, leela, dev, ananya],
    preview: 'Imran: I’ll bring the film camera.',
    time: '9:18',
    unread: 3,
    group: true,
  },
  {
    id: 'leela',
    name: leela.name,
    people: [leela],
    preview: 'You: I’ll send it when I’m back online.',
    time: '8:56',
  },
  {
    id: 'dev',
    name: dev.name,
    people: [dev],
    preview: 'Message failed · Tap to open',
    time: 'Yesterday',
    needsAttention: true,
  },
  {
    id: 'studio',
    name: 'Studio handoff',
    people: [ananya, mira, dev],
    preview: 'Ananya: The final mockups are ready.',
    time: 'Yesterday',
    group: true,
  },
  {
    id: 'ananya',
    name: ananya.name,
    people: [ananya],
    preview: 'The address is in the note above.',
    time: 'Monday',
  },
  {
    id: 'test-long-name',
    name: 'Kavya Narayanan Subramaniam',
    people: [{ name: 'Kavya Narayanan Subramaniam', tint: 'avatarSlate' }],
    preview:
      'I wrote down the directions from the south entrance if you need them.',
    time: 'Monday',
  },
];

export const cafePhoto: Attachment = {
  name: 'Window seat.jpg',
  detail: 'Photo · 284 KB',
  image: {
    source: require('./rain-window.jpg'),
    description: 'A cup of coffee beside a rain-streaked window',
  },
};

export const note: Attachment = {
  name: 'Meeting point.pdf',
  detail: 'PDF · 240 KB',
};

export const thread: ThreadEntry[] = [
  { id: 'today', divider: 'date', label: 'Today, 25 November' },
  {
    id: 'incoming',
    direction: 'incoming',
    text: 'Still up for coffee? It’s raining pretty hard here.',
    time: '9:38',
  },
  {
    id: 'outgoing',
    direction: 'outgoing',
    text: 'On my way. I’ll be there in ten.',
    time: '9:40',
    status: 'read',
  },
  { id: 'unread', divider: 'unread', label: 'Unread messages' },
  { id: 'photo', direction: 'incoming', attachment: cafePhoto, time: '9:42' },
  {
    id: 'seat',
    direction: 'incoming',
    text: 'I saved you the seat by the window.',
    time: '9:43',
  },
];

export const groupThread: ThreadEntry[] = [
  { id: 'group-today', divider: 'date', label: 'Today, 25 November' },
  {
    id: 'group-1',
    direction: 'incoming',
    author: leela.name,
    text: 'South entrance, right by the old blue gate.',
    time: '9:10',
  },
  {
    id: 'group-2',
    direction: 'incoming',
    author: imran.name,
    text: 'I’ll bring the film camera.',
    time: '9:18',
  },
  {
    id: 'group-3',
    direction: 'outgoing',
    attachment: note,
    time: '9:21',
    status: 'delivered',
  },
];
