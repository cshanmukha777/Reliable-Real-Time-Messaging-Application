import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation as ConversationRow, MemberRole, Membership } from '@prisma/client';
import type { Conversation, GroupInput } from '@chatapp/contracts';
import { directPair, fingerprint, memberAuthority } from './policy';
import { MessagingRepository, type MessagingDb } from './repository';
import { MessagingUsers } from './users.service';
import { Messages } from './messages.service';

@Injectable()
export class Conversations {
  constructor(private readonly repository: MessagingRepository, private readonly users: MessagingUsers, private readonly messages: Messages) {}

  direct(userId: string, targetId: string) {
    const pair = directPair(userId, targetId);
    return this.create(userId, `direct:${pair.join(':')}`, pair, null);
  }

  group(userId: string, input: GroupInput) {
    const ids = [...new Set(input.userIds)].sort();
    if (ids.length !== input.userIds.length || ids.includes(userId)) throw new BadRequestException();
    return this.create(userId, `group:${userId}:${input.clientGroupId}`, [userId, ...ids], input.title);
  }

  private async create(userId: string, identityKey: string, users: string[], title: string | null) {
    const hash = fingerprint([title, users]);
    const id = await this.repository.atomic(async (tx) => {
      const existing = await tx.conversation.findUnique({ where: { identityKey } });
      if (existing) {
        if (existing.fingerprint !== hash) throw new ConflictException();
        return existing.id;
      }
      await this.users.verify(tx, users);
      const group = title !== null;
      const row = await tx.conversation.create({
        data: { identityKey, fingerprint: hash, title, kind: group ? 'GROUP' : 'DIRECT', directUsers: group ? [] : users },
      });
      await tx.membership.createMany({
        data: users.map((id) => ({
          conversationId: row.id, userId: id, active: true, visibleFrom: 1,
          role: group && id === userId ? 'OWNER' : 'MEMBER',
        })),
      });
      return row.id;
    });
    return this.details(userId, id);
  }

  details(userId: string, id: string) {
    return this.repository.atomic(async (tx) => {
      const membership = await this.repository.membership(tx, id, userId);
      const row = await tx.conversation.findUniqueOrThrow({ where: { id } });
      return this.present(tx, row, membership);
    });
  }

  list(userId: string, limit: number, cursor?: string) {
    return this.repository.atomic(async (tx) => {
      const rows = await tx.membership.findMany({
        where: { userId, active: true, conversationId: cursor ? { lt: cursor } : undefined },
        orderBy: { conversationId: 'desc' }, take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const conversations = await tx.conversation.findMany({
        where: { id: { in: page.map((row) => row.conversationId) } },
      });
      const byId = new Map(conversations.map((row) => [row.id, row]));
      const items = await Promise.all(page.map((membership) => {
        const row = byId.get(membership.conversationId);
        if (!row) throw new NotFoundException();
        return this.present(tx, row, membership);
      }));
      return { items, nextCursor: rows.length > limit ? page[page.length - 1].conversationId : null };
    });
  }

  private async present(tx: MessagingDb, row: ConversationRow, membership: Membership): Promise<Conversation> {
    const rows = await tx.membership.findMany({ where: { conversationId: row.id, active: true }, orderBy: { userId: 'asc' } });
    const profiles = await this.users.profiles(tx, rows.map((member) => member.userId));
    const members = rows.flatMap((member) => {
      const profile = profiles.get(member.userId);
      return profile ? [{ ...profile, role: member.role }] : [];
    });
    return {
      id: row.id, kind: row.kind, role: membership.role,
      title: row.title ?? members.find((member) => member.id !== membership.userId)?.displayName ?? 'Direct conversation',
      members, updatedAt: row.updatedAt.toISOString(),
      latest: await this.messages.latest(tx, membership),
    };
  }

  async change(userId: string, id: string, targetId: string, role: Exclude<MemberRole, 'OWNER'> | null) {
    await this.repository.atomic(async (tx) => {
      const { membership, conversation } = await this.repository.lock(tx, id, userId);
      if (conversation.kind !== 'GROUP') throw new BadRequestException();
      const key = { conversationId: id, userId: targetId };
      const target = await tx.membership.findUnique({ where: { conversationId_userId: key } });
      memberAuthority(membership.role, target?.active ? target.role : undefined, role ?? undefined);
      if (role === null) {
        if (!target?.active) throw new NotFoundException();
        await tx.membership.update({ where: { id: target.id }, data: { active: false } });
        return;
      }
      await this.users.verify(tx, [targetId]);
      const data = { role, active: true, visibleFrom: target?.active ? target.visibleFrom : conversation.sequence + 1 };
      await tx.membership.upsert({ where: { conversationId_userId: key }, update: data, create: { ...key, ...data } });
      if (await tx.membership.count({ where: { conversationId: id, active: true } }) > 32) throw new ConflictException();
    });
    return this.details(userId, id);
  }
}
