import { appendChange } from '../realtime/events';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Membership, Message as Row, Prisma } from '@prisma/client';
import {
  mongoIdSchema,
  type Message,
  type MessageInput,
  type MessagePage,
  type ReconciliationPage,
  type PageQuery,
} from '@chatapp/contracts';
import { decodeCursor, encodeCursor, fingerprint } from './policy';
import { MessagingRepository, type MessagingDb } from './repository';
import { MessagingUsers } from './users.service';
import { publicAttachment } from './attachment-policy';

@Injectable()
export class Messages {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly users: MessagingUsers,
  ) {}

  async send(
    userId: string,
    conversationId: string,
    input: MessageInput,
  ): Promise<Message> {
    const hash = fingerprint([conversationId, input.body, input.attachmentIds]);
    return this.repository.atomic(async (tx) => {
      const { membership } = await this.repository.lock(
        tx,
        conversationId,
        userId,
      );
      const existing = await tx.message.findUnique({
        where: {
          senderId_clientMessageId: {
            senderId: userId,
            clientMessageId: input.clientMessageId,
          },
        },
      });
      if (existing) {
        if (existing.fingerprint !== hash) throw new ConflictException();
        if (existing.sequence < membership.visibleFrom)
          throw new NotFoundException();
        return this.presentOne(tx, existing);
      }
      const createdAt = new Date();
      const sequence = (
        await tx.conversation.update({
          where: { id: conversationId },
          data: { sequence: { increment: 1 }, updatedAt: createdAt },
        })
      ).sequence;
      const row = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          clientMessageId: input.clientMessageId,
          fingerprint: hash,
          sequence,
          body: input.body,
          createdAt,
          attachmentIds: input.attachmentIds,
          deletedAt: null,
        },
      });
      if (input.attachmentIds.length) {
        const result = await tx.attachment.updateMany({
          where: {
            id: { in: input.attachmentIds },
            conversationId,
            ownerId: userId,
            state: 'VERIFIED',
            expiresAt: { gt: new Date() },
          },
          data: { state: 'ATTACHED', messageId: row.id },
        });
        if (result.count !== input.attachmentIds.length)
          throw new NotFoundException();
      }
      const recipients = await tx.membership.findMany({
        where: { conversationId, active: true, userId: { not: userId } },
        select: { userId: true },
      });
      if (recipients.length)
        await tx.receipt.createMany({
          data: recipients.map(({ userId: recipientId }) => ({
            messageId: row.id,
            conversationId,
            recipientId,
            eligible: true,
            deliveredAt: null,
            readAt: null,
          })),
        });
      await appendChange(tx, {
        type: 'message.created',
        conversationId,
        messageId: row.id,
        messageSequence: row.sequence,
      });
      return this.presentOne(tx, row);
    });
  }

  async remove(userId: string, conversationId: string, id: string) {
    await this.repository.atomic(async (tx) => {
      const { membership } = await this.repository.lock(
        tx,
        conversationId,
        userId,
      );
      const row = await tx.message.findFirst({
        where: {
          id,
          conversationId,
          sequence: { gte: membership.visibleFrom },
        },
      });
      if (!row) throw new NotFoundException();
      if (row.senderId !== userId) throw new ForbiddenException();
      if (!row.deletedAt) {
        await tx.message.update({
          where: { id },
          data: { deletedAt: new Date(), body: null, attachmentIds: [] },
        });
        await appendChange(tx, {
          type: 'message.deleted',
          conversationId,
          messageId: row.id,
          messageSequence: row.sequence,
        });
      }
    });
  }

  page(
    userId: string,
    conversationId: string,
    query: PageQuery,
    term?: string,
    reconcile = false,
  ): Promise<MessagePage | ReconciliationPage> {
    const cursor = decodeCursor(query.cursor);
    return this.repository.atomic(async (tx) => {
      const membership = await this.repository.membership(
        tx,
        conversationId,
        userId,
      );
      const rows = term
        ? await this.search(tx, membership, term, query.limit + 1, cursor)
        : await tx.message.findMany({
            where: {
              ...this.visible(membership),
              ...(reconcile && { deletedAt: { isSet: true } }),
              ...(cursor && {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
          });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const items = await this.present(tx, page);
      const nextCursor =
        rows.length > query.limit && last ? encodeCursor(last) : null;
      if (!reconcile) return { items, nextCursor };
      const mine = new Map(
        page
          .filter((row) => row.senderId === userId)
          .map((row) => [row.id, row.clientMessageId]),
      );
      return {
        items: items.map((item) => {
          const clientMessageId = mine.get(item.id);
          return { ...item, ...(clientMessageId && { clientMessageId }) };
        }),
        nextCursor,
        visibleFrom: membership.visibleFrom,
      };
    });
  }

  private visible(membership: Membership): Prisma.MessageWhereInput {
    return {
      conversationId: membership.conversationId,
      sequence: { gte: membership.visibleFrom },
      deletedAt: null,
    };
  }

  private async search(
    tx: MessagingDb,
    membership: Membership,
    term: string,
    limit: number,
    cursor?: ReturnType<typeof decodeCursor>,
  ) {
    const filter = {
      conversationId: { $eq: { $oid: membership.conversationId } },
      sequence: { $gte: membership.visibleFrom },
      deletedAt: null,
      $text: { $search: `"${term}"` },
      ...(cursor && {
        $or: [
          { createdAt: { $lt: { $date: cursor.createdAt.toISOString() } } },
          {
            createdAt: { $eq: { $date: cursor.createdAt.toISOString() } },
            _id: { $lt: { $oid: cursor.id } },
          },
        ],
      }),
    };
    const hits = await tx.message.findRaw({
      filter,
      options: {
        projection: { _id: 1 },
        sort: { createdAt: -1, _id: -1 },
        limit,
        maxTimeMS: { secs: 1, nanos: 500000000 },
      },
    });
    if (!Array.isArray(hits)) throw new Error('Unexpected search result');
    const ids = hits.map((hit) => mongoIdSchema.parse(hit._id?.$oid));
    return tx.message.findMany({
      where: { ...this.visible(membership), id: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async latest(tx: MessagingDb, membership: Membership) {
    const row = await tx.message.findFirst({
      where: this.visible(membership),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? ((await this.present(tx, [row]))[0] ?? null) : null;
  }

  private async presentOne(tx: MessagingDb, row: Row) {
    const [message] = await this.present(tx, [row]);
    if (!message) throw new Error('Message could not be presented');
    return message;
  }

  async present(tx: MessagingDb, rows: Row[]): Promise<Message[]> {
    if (!rows.length) return [];
    const people = await this.users.profiles(tx, [
      ...new Set(rows.map((row) => row.senderId)),
    ]);
    const ids = rows.flatMap((row) => row.attachmentIds);
    const attachments = ids.length
      ? await tx.attachment.findMany({
          where: { id: { in: ids }, state: 'ATTACHED' },
        })
      : [];
    const byId = new Map(attachments.map((row) => [row.id, row]));
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      sender: people.get(row.senderId) ?? {
        id: row.senderId,
        displayName: 'Former member',
        avatarUrl: null,
      },
      body: row.deletedAt ? '' : (row.body ?? ''),
      deleted: !!row.deletedAt,
      createdAt: row.createdAt.toISOString(),
      attachments: row.deletedAt
        ? []
        : row.attachmentIds.flatMap((id) => {
            const attachment = byId.get(id);
            return attachment?.messageId === row.id
              ? [publicAttachment(attachment)]
              : [];
          }),
    }));
  }
}
