import { BadRequestException } from '@nestjs/common';
import { attachmentSchema, type UploadInput } from '@chatapp/contracts';
import type { Attachment } from '@prisma/client';

const prefixes: Partial<Record<UploadInput['mimeType'], Buffer>> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'application/pdf': Buffer.from('%PDF-'),
};

export function verifyBytes(bytes: Buffer, expected: UploadInput) {
  if (bytes.length !== expected.size) throw new BadRequestException();
  const prefix = prefixes[expected.mimeType];
  const valid = prefix
    ? bytes.length > prefix.length &&
      bytes.subarray(0, prefix.length).equals(prefix)
    : expected.mimeType === 'image/webp'
      ? bytes.length >= 16 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP' &&
        bytes.readUInt32LE(4) === bytes.length - 8
      : validText(bytes);
  if (!valid) throw new BadRequestException();
}

function validText(bytes: Buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return !/[<>]|[^\P{Cc}\n\r\t]/u.test(text);
  } catch {
    return false;
  }
}

export function publicAttachment({ id, fileName, mimeType, size }: Attachment) {
  return attachmentSchema.parse({ id, fileName, mimeType, size });
}
