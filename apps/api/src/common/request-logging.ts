import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';

const logger = new Logger('HTTP');

export function requestLogging(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const startedAt = performance.now();
  res.setHeader('X-Request-Id', requestId);
  res.once('finish', () => {
    logger.log({
      requestId,
      method: req.method,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  next();
}
