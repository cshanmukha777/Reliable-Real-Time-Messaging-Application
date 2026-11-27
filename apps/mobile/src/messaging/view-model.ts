import type { Conversation, Message, Person } from '@chatapp/contracts';
import type { Person as AvatarPerson } from '../chat/avatar';
import type { ConversationSummary } from '../chat/inbox';
import type { ThreadEntry } from '../chat/thread';

const tints = ['avatarFern', 'avatarClay', 'avatarSlate', 'avatarPaper'] as const;
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function avatar(person: Person): AvatarPerson {
  return {
    name: person.displayName,
    tint: tints[parseInt(person.id.slice(-1), 16) % tints.length] ?? 'avatarFern',
    ...(person.avatarUrl?.startsWith('https://') && { image: { uri: person.avatarUrl } }),
  };
}

export function conversationPeople(conversation: Conversation, userId: string): [AvatarPerson, ...AvatarPerson[]] {
  const [first, ...others] = conversation.members.filter((member) => member.id !== userId).map(avatar);
  return [first ?? { name: conversation.title, tint: 'avatarFern' }, ...others];
}

export function inboxRow(row: Conversation, userId: string): ConversationSummary {
  return {
    id: row.id, name: row.title, people: conversationPeople(row, userId),
    preview: row.latest?.body || row.latest?.attachments[0]?.fileName || 'No messages yet',
    time: row.latest ? time.format(new Date(row.latest.createdAt)) : '',
    group: row.kind === 'GROUP',
  };
}

export function threadEntries(rows: Message[], userId: string, group: boolean): ThreadEntry[] {
  const result: ThreadEntry[] = [];
  let lastDay = '';
  for (const row of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (row.deleted) continue;
    const date = new Date(row.createdAt);
    const label = day.format(date);
    if (label !== lastDay) {
      result.push({ id: `date:${label}`, divider: 'date', label });
      lastDay = label;
    }
    const outgoing = row.sender.id === userId;
    result.push({
      id: row.id, direction: outgoing ? 'outgoing' : 'incoming', text: row.body,
      time: time.format(date), ...(outgoing ? { status: 'sent' } : group ? { author: row.sender.displayName } : {}),
      attachments: row.attachments.map((item) => ({
        id: item.id, name: item.fileName, detail: fileSize(item.size), photo: item.mimeType.startsWith('image/'),
      })),
    });
  }
  return result;
}

export function fileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
