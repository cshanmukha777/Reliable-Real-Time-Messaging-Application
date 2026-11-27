import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { MemberRole } from '@prisma/client';
import { mongoIdSchema } from '@chatapp/contracts';

export function directPair(first: string, second: string) {
  if (first === second) throw new BadRequestException();
  return [first, second].sort();
}

export function fingerprint(payload: readonly unknown[]) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function memberAuthority(actor: MemberRole, existing?: MemberRole, next?: MemberRole) {
  if (existing === 'OWNER' || next === 'OWNER' || actor === 'MEMBER') throw new ForbiddenException();
  if (actor === 'ADMIN' && (existing === 'ADMIN' || next === 'ADMIN')) throw new ForbiddenException();
}

export function encodeCursor(record: { createdAt: Date; id: string }) {
  return Buffer.from(`${record.createdAt.toISOString()}:${record.id}`).toString('base64url');
}

export function decodeCursor(value?: string) {
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new BadRequestException();
  const raw = Buffer.from(value, 'base64url').toString();
  const createdAt = new Date(raw.slice(0, 24));
  const id = mongoIdSchema.safeParse(raw.slice(25));
  if (!id.success || !Number.isFinite(createdAt.getTime()) || encodeCursor({ createdAt, id: id.data }) !== value) {
    throw new BadRequestException();
  }
  return { createdAt, id: id.data };
}
