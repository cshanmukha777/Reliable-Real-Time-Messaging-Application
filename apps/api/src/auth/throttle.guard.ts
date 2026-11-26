import {
  HttpException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class AuthThrottle implements CanActivate {
  private readonly buckets = new Map<string, { used: number; until: number }>();
  private nextSweep = 0;

  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const now = Date.now();
    if (now >= this.nextSweep) {
      for (const [key, value] of this.buckets)
        if (value.until <= now) this.buckets.delete(key);
      this.nextSweep = now + 60000;
    }
    const operation = context.getHandler().name;
    const key = `${operation}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (this.buckets.size >= 10000 && !bucket)
        throw new HttpException('Try again shortly', 429);
      bucket = { used: 0, until: now + 60000 };
      this.buckets.set(key, bucket);
    }
    const maximum =
      operation === 'register' ? 8 : operation === 'login' ? 15 : 60;
    if (bucket.used >= maximum) {
      http
        .getResponse<Response>()
        .setHeader('Retry-After', Math.ceil((bucket.until - now) / 1000));
      throw new HttpException('Try again shortly', 429);
    }
    bucket.used++;
    return true;
  }
}
