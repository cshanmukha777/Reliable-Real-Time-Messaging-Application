import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { prismaError } from '../auth/auth.repository';
import { DatabaseService } from '../database/database.service';

export type MessagingDb = Prisma.TransactionClient;

@Injectable()
export class MessagingRepository {
  constructor(readonly db: DatabaseService) {}

  async atomic<T>(operation: (tx: MessagingDb) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await this.db.$transaction(operation);
      } catch (error) {
        if (!prismaError(error, 'P2034', 'P2002')) throw error;
        if (attempt === 5) throw new ConflictException();
        await new Promise((resolve) => setTimeout(resolve, 8 * (attempt + 1)));
      }
    }
    throw new ConflictException();
  }

  async membership(db: MessagingDb, conversationId: string, userId: string) {
    const membership = await db.membership.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership?.active) throw new NotFoundException();
    return membership;
  }

  async lock(tx: MessagingDb, conversationId: string, userId: string) {
    const membership = await this.membership(tx, conversationId, userId);
    const conversation = await tx.conversation.update({
      where: { id: conversationId },
      data: { revision: { increment: 1 } },
    });
    return { membership, conversation };
  }
}
