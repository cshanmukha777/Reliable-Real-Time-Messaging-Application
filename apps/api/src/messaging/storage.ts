import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { API_ENVIRONMENT } from '../config/config.module';
import type { ApiEnvironment } from '../config/environment';
import type { UploadInput } from '@chatapp/contracts';

export const uploadSeconds = 120;
export const downloadSeconds = 45;

@Injectable()
export class AttachmentStorage {
  private readonly internal?: S3Client;
  private readonly signer?: S3Client;
  private readonly bucket?: string;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    const { S3_BUCKET, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = environment;
    if (S3_BUCKET && S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
      const options = {
        region: S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
        requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      };
      this.bucket = S3_BUCKET;
      this.internal = new S3Client({ ...options, endpoint: S3_ENDPOINT });
      this.signer = new S3Client({ ...options, endpoint: S3_PUBLIC_ENDPOINT ?? S3_ENDPOINT });
    }
  }

  upload(key: string, { size, mimeType }: UploadInput) {
    if (!this.signer) throw new ServiceUnavailableException();
    return getSignedUrl(this.signer, new PutObjectCommand({
      Bucket: this.bucket, Key: key, ContentLength: size, ContentType: mimeType,
    }), { expiresIn: uploadSeconds, signableHeaders: new Set(['content-length', 'content-type']) });
  }

  async readStaging(key: string, { size, mimeType }: UploadInput) {
    if (!this.internal) throw new ServiceUnavailableException();
    const object = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(12000),
    }).catch(() => { throw new BadRequestException(); });
    if (!object.Body) throw new BadRequestException();
    const parts = [];
    let length = 0;
    const stream = object.Body as NodeJS.ReadableStream & { destroy(): void };
    try {
      if (object.ContentLength !== size || object.ContentType !== mimeType) throw new BadRequestException();
      for await (const chunk of stream) {
        const data = Buffer.from(chunk);
        length += data.length;
        if (length > size) throw new BadRequestException();
        parts.push(data);
      }
      return Buffer.concat(parts);
    } finally {
      stream.destroy();
    }
  }

  async seal(key: string, bytes: Buffer, mimeType: string) {
    if (!this.internal) throw new ServiceUnavailableException();
    await this.internal.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: bytes, ContentLength: bytes.length,
      ContentType: mimeType, ContentDisposition: 'attachment',
    }), { abortSignal: AbortSignal.timeout(12000) });
  }

  async discard(key: string) {
    await this.internal?.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }

  download(key: string) {
    if (!this.signer) throw new ServiceUnavailableException();
    return getSignedUrl(this.signer, new GetObjectCommand({
      Bucket: this.bucket, Key: key, ResponseContentDisposition: 'attachment',
      ResponseCacheControl: 'private, no-store',
    }), { expiresIn: downloadSeconds });
  }
}
