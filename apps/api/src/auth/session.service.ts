import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RefreshInput, SessionResponse } from '@chatapp/contracts';
import {
  accountSelection,
  AuthRepository,
  presentAccount,
  prismaError,
  type AccountRow,
} from './auth.repository';
import { TokenService } from './token.service';

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const concurrentWindowMs = 3000;
const sessionSelection = {
  id: true,
  refreshHash: true,
  revokedAt: true,
  expiresAt: true,
  user: { select: accountSelection },
} satisfies Prisma.SessionSelect;
type SessionRow = Prisma.SessionGetPayload<{ select: typeof sessionSelection }>;

@Injectable()
export class SessionService {
  private readonly listeners = new Set<
    (scope: { userId?: string; sessionId?: string }) => void
  >();

  onRevoked(
    listener: (scope: { userId?: string; sessionId?: string }) => void,
  ) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(scope: { userId?: string; sessionId?: string }) {
    for (const listener of this.listeners) listener(scope);
  }

  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  async create(tx: Prisma.TransactionClient, userId: string) {
    const refreshToken = this.tokens.newRefresh();
    const session = await tx.session.create({
      data: {
        userId,
        refreshHash: this.tokens.digest(refreshToken),
        expiresAt: new Date(Date.now() + sessionLifetimeMs),
        revokedAt: null,
      },
      select: sessionSelection,
    });
    return this.response(session, refreshToken);
  }

  async current(userId: string, sessionId: string): Promise<AccountRow> {
    const session = await this.repository.database.session.findUnique({
      where: { id: sessionId },
      select: sessionSelection,
    });
    if (session?.user.id !== userId) throw new UnauthorizedException();
    return this.assertActive(session).user;
  }

  private assertActive(session: SessionRow | null | undefined): SessionRow {
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.valueOf() <= Date.now() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException();
    }
    return session;
  }

  private response(session: SessionRow, refreshToken: string): SessionResponse {
    return {
      user: presentAccount(session.user),
      ...this.tokens.issue(session.user.id, session.id, session.expiresAt),
      refreshToken,
    };
  }

  async refresh(input: RefreshInput): Promise<SessionResponse> {
    const db = this.repository.database;
    const currentHash = this.tokens.digest(input.refreshToken);
    const operationHash = this.tokens.digest(input.operationId);
    const nextToken = this.tokens.nextRefresh(
      input.refreshToken,
      input.operationId,
    );
    const nextHash = this.tokens.digest(nextToken);

    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await db.session.findUnique({
        where: { refreshHash: currentHash },
        select: sessionSelection,
      });
      if (!current) {
        const spent = await db.spentRefresh.findUnique({
          where: { hash: currentHash },
          select: {
            operationHash: true,
            rotatedAt: true,
            session: { select: sessionSelection },
          },
        });
        const session = this.assertActive(spent?.session);
        if (spent?.operationHash === operationHash) {
          if (session.refreshHash === nextHash)
            return this.response(session, nextToken);
          throw new ConflictException();
        }
        if (
          spent &&
          Date.now() - spent.rotatedAt.valueOf() < concurrentWindowMs
        ) {
          throw new ConflictException();
        }
        await db.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.notify({ sessionId: session.id });
        throw new UnauthorizedException();
      }

      const session = this.assertActive(current);
      const now = new Date();
      try {
        const rotated = await db.$transaction(async (tx) => {
          const result = await tx.session.updateMany({
            where: {
              id: session.id,
              refreshHash: currentHash,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { refreshHash: nextHash, lastActiveAt: now },
          });
          if (result.count === 0) return false;
          await tx.spentRefresh.create({
            data: {
              hash: currentHash,
              sessionId: session.id,
              operationHash,
              rotatedAt: now,
            },
          });
          return true;
        });
        if (rotated) return this.response(session, nextToken);
      } catch (error) {
        if (!prismaError(error, 'P2034', 'P2028')) throw error;
      }
    }
    throw new ServiceUnavailableException();
  }

  async revoke(refreshToken: string) {
    const db = this.repository.database;
    const hash = this.tokens.digest(refreshToken);
    // The session ID survives rotation and the family remains revocable with a spent credential.
    const current = await db.session.findUnique({
      where: { refreshHash: hash },
      select: { id: true },
    });
    const id =
      current?.id ??
      (
        await db.spentRefresh.findUnique({
          where: { hash },
          select: { sessionId: true },
        })
      )?.sessionId;
    if (id) {
      await db.session.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.notify({ sessionId: id });
    }
  }

  async revokeAll(userId: string) {
    await this.repository.database.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.notify({ userId });
  }
}
