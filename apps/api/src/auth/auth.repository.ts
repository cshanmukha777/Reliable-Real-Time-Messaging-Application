import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Account } from '@chatapp/contracts';
import { DatabaseService } from '../database/database.service';

export const accountSelection = {
  id: true,
  email: true,
  createdAt: true,
  status: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;
export type AccountRow = Prisma.UserGetPayload<{
  select: typeof accountSelection;
}>;

export function presentAccount(user: AccountRow): Account {
  if (!user.profile) throw new ServiceUnavailableException();
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    ...user.profile,
  };
}

export function prismaError(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    codes.includes(error.code)
  );
}

@Injectable()
export class AuthRepository {
  constructor(readonly database: DatabaseService) {}

  credentials(email: string) {
    return this.database.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true },
    });
  }

  account(id: string) {
    return this.database.user.findUnique({
      where: { id },
      select: accountSelection,
    });
  }
}
