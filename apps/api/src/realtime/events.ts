import type { Prisma, RealtimeStream } from '@prisma/client';
import type { ReplayEntry } from '@chatapp/contracts';

export const retainedEvents = 1000;
type Change = {
  type: Exclude<ReplayEntry['type'], 'filtered'>;
  conversationId: string;
  messageId?: string;
  messageSequence?: number;
  affectedUserId?: string;
};

async function persist(
  tx: Prisma.TransactionClient,
  stream: RealtimeStream,
  streamId: string,
  sequence: number,
  change: Change,
) {
  const now = new Date();
  await tx.realtimeEvent.create({
    data: {
      stream,
      streamId,
      sequence,
      ...change,
      createdAt: now,
      availableAt: now,
      lease: null,
      publishedAt: null,
    },
  });
  if (sequence > retainedEvents) {
    await tx.realtimeEvent.deleteMany({
      where: { stream, streamId, sequence: { lte: sequence - retainedEvents } },
    });
  }
}

// The caller has already acquired the conversation write lock or inserted the conversation.
export async function appendChange(
  tx: Prisma.TransactionClient,
  change: Change,
) {
  const current = await tx.conversation.findUniqueOrThrow({
    where: { id: change.conversationId },
    select: { eventSequence: true },
  });
  const sequence = (current.eventSequence ?? 0) + 1;
  await tx.conversation.update({
    where: { id: change.conversationId },
    data: { eventSequence: sequence },
  });
  await persist(tx, 'CONVERSATION', change.conversationId, sequence, change);

  const members = await tx.membership.findMany({
    where: { conversationId: change.conversationId, active: true },
    select: { userId: true },
    orderBy: { userId: 'asc' },
  });
  const users = new Set(members.map(({ userId }) => userId));
  if (change.affectedUserId) users.add(change.affectedUserId);
  for (const id of [...users].sort()) {
    const counter = await tx.accountSyncState.upsert({
      where: { id },
      create: { id, sequence: 1 },
      update: { sequence: { increment: 1 } },
    });
    await persist(tx, 'ACCOUNT', id, counter.sequence, change);
  }
}
