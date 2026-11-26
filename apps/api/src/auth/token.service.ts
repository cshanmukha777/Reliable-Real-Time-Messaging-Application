import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { API_ENVIRONMENT } from '../config/config.module';
import type { ApiEnvironment } from '../config/environment';

const audience = 'chatapp-native';
const accessLifetime = 300;
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const claimsSchema = z
  .object({
    sub: objectId,
    sid: objectId,
    iss: z.string(),
    aud: z.literal(audience),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .refine(({ iat, exp }) => exp > iat && exp - iat <= accessLifetime);

export type AccessClaims = z.infer<typeof claimsSchema>;

@Injectable()
export class TokenService {
  private readonly key: Buffer;
  private readonly rotationKey: Buffer;

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.key = Buffer.from(environment.AUTH_SIGNING_KEY, 'hex');
    this.rotationKey = createHmac('sha256', this.key)
      .update('ChatApp/refresh-rotation/v1')
      .digest();
  }

  issue(userId: string, sessionId: string, sessionExpiry: Date) {
    const issued = Math.floor(Date.now() / 1000);
    const expiry = Math.min(
      issued + accessLifetime,
      Math.floor(sessionExpiry.valueOf() / 1000),
    );
    if (expiry <= issued) throw new UnauthorizedException();
    const accessToken = jwt.sign(
      { sid: sessionId, iat: issued, exp: expiry },
      this.key,
      {
        algorithm: 'HS256',
        subject: userId,
        issuer: this.environment.AUTH_ISSUER,
        audience,
      },
    );
    return {
      accessToken,
      accessExpiresAt: new Date(expiry * 1000).toISOString(),
    };
  }

  verify(token: string): AccessClaims {
    try {
      const claims = claimsSchema.parse(
        jwt.verify(token, this.key, {
          algorithms: ['HS256'],
          issuer: this.environment.AUTH_ISSUER,
          audience,
        }),
      );
      if (claims.iat > Math.floor(Date.now() / 1000) + 5)
        throw new UnauthorizedException();
      return claims;
    } catch {
      throw new UnauthorizedException();
    }
  }

  newRefresh() {
    return randomBytes(32).toString('base64url');
  }

  digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  nextRefresh(current: string, operationId: string) {
    return createHmac('sha256', this.rotationKey)
      .update(current)
      .update(':')
      .update(operationId)
      .digest('base64url');
  }
}
