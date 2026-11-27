import { API_ENVIRONMENT } from '../config/config.module';
import type { ApiEnvironment } from '../config/environment';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { UploadInput } from '@chatapp/contracts';
import { publicAttachment, verifyBytes } from './attachment-policy';
import { MessagingRepository } from './repository';
import { AttachmentMissingBytes, AttachmentStorage } from './storage';

@Injectable()
export class Attachments {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly storage: AttachmentStorage,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async grant(userId: string, conversationId: string, input: UploadInput) {
    if (input.size > this.environment.S3_MAX_UPLOAD_BYTES)
      throw new PayloadTooLargeException();
    const stagingKey = `staging/${randomUUID()}`;
    return this.repository.atomic(async (tx) => {
      await this.repository.lock(tx, conversationId, userId);
      const pending = await tx.attachment.count({
        where: {
          ownerId: userId,
          state: { in: ['PENDING', 'VERIFIED'] },
          expiresAt: { gt: new Date() },
        },
      });
      if (pending >= 12) throw new ConflictException();
      const url = await this.storage.upload(stagingKey, input);
      const row = await tx.attachment.create({
        data: {
          ...input,
          conversationId,
          ownerId: userId,
          stagingKey,
          state: 'PENDING',
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      return {
        attachment: publicAttachment(row),
        url,
        method: 'PUT' as const,
        headers: {
          'Content-Type': input.mimeType,
          'Content-Length': String(input.size),
        },
      };
    });
  }

  async recover(
    userId: string,
    conversationId: string,
    operation: string,
    input: UploadInput,
  ) {
    if (input.size > this.environment.S3_MAX_UPLOAD_BYTES)
      throw new PayloadTooLargeException();
    const id = createHash('sha256')
      .update(JSON.stringify([userId, conversationId, operation]))
      .digest('hex')
      .slice(0, 24);
    const { row, existing } = await this.repository.atomic(async (tx) => {
      await this.repository.lock(tx, conversationId, userId);
      const known = await tx.attachment.findUnique({ where: { id } });
      if (
        known &&
        (known.ownerId !== userId ||
          known.conversationId !== conversationId ||
          known.fileName !== input.fileName ||
          known.mimeType !== input.mimeType ||
          known.size !== input.size)
      )
        throw new ConflictException();
      if (known?.state === 'ATTACHED') return { row: known, existing: true };
      if (!known || known.expiresAt <= new Date()) {
        const pending = await tx.attachment.count({
          where: {
            ownerId: userId,
            state: { in: ['PENDING', 'VERIFIED'] },
            expiresAt: { gt: new Date() },
          },
        });
        if (pending >= 12) throw new ServiceUnavailableException();
      }
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      const row = known
        ? await tx.attachment.update({ where: { id }, data: { expiresAt } })
        : await tx.attachment.create({
            data: {
              id,
              ...input,
              ownerId: userId,
              conversationId,
              expiresAt,
              state: 'PENDING',
              stagingKey: `staging/${randomUUID()}`,
            },
          });
      return { row, existing: Boolean(known) };
    });
    if (row.state !== 'PENDING')
      return { ready: true as const, attachment: publicAttachment(row) };
    if (existing) {
      try {
        return {
          ready: true as const,
          attachment: await this.complete(userId, conversationId, id),
        };
      } catch (error) {
        if (!(error instanceof AttachmentMissingBytes)) throw error;
      }
    }
    return {
      attachment: publicAttachment(row),
      url: await this.storage.upload(row.stagingKey, input),
      method: 'PUT' as const,
      headers: {
        'Content-Type': input.mimeType,
        'Content-Length': String(input.size),
      },
    };
  }

  async complete(userId: string, conversationId: string, id: string) {
    const where = {
      id,
      ownerId: userId,
      conversationId,
      expiresAt: { gt: new Date() },
    };
    const db = this.repository.db;
    await this.repository.membership(db, conversationId, userId);
    const row = await db.attachment.findFirst({ where });
    if (!row) throw new NotFoundException();
    if (row.state !== 'PENDING') return publicAttachment(row);

    const input = publicAttachment(row);
    const bytes = await this.storage.readStaging(row.stagingKey, input);
    verifyBytes(bytes, input);
    const verifiedKey = `verified/${randomUUID()}`;
    await this.storage.seal(verifiedKey, bytes, input.mimeType);
    // A failed or uncertain commit can still own this key. Cleanup must inspect the database.
    const accepted = await this.repository.atomic(async (tx) => {
      await this.repository.lock(tx, conversationId, userId);
      const result = await tx.attachment.updateMany({
        where: { ...where, state: 'PENDING' },
        data: { state: 'VERIFIED', verifiedKey },
      });
      if (
        !result.count &&
        !(await tx.attachment.findFirst({
          where: { ...where, state: { in: ['VERIFIED', 'ATTACHED'] } },
        }))
      ) {
        throw new NotFoundException();
      }
      return result.count === 1;
    });
    if (!accepted) await this.storage.discard(verifiedKey);
    await this.storage.discard(row.stagingKey);
    return input;
  }

  download(userId: string, conversationId: string, id: string) {
    return this.repository.atomic(async (tx) => {
      const { membership } = await this.repository.lock(
        tx,
        conversationId,
        userId,
      );
      const row = await tx.attachment.findFirst({
        where: { id, conversationId, state: 'ATTACHED' },
      });
      if (!row?.messageId || !row.verifiedKey) throw new NotFoundException();
      const message = await tx.message.findFirst({
        where: {
          id: row.messageId,
          conversationId,
          sequence: { gte: membership.visibleFrom },
          deletedAt: null,
          attachmentIds: { has: id },
        },
      });
      if (!message) throw new NotFoundException();
      return { url: await this.storage.download(row.verifiedKey) };
    });
  }
}
