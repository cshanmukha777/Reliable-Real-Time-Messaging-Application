import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { ErrorResponse } from '@chatapp/contracts';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = response.getHeader('X-Request-Id');
    const code = HttpStatus[statusCode] ?? 'HTTP_ERROR';
    const error: ErrorResponse = {
      statusCode,
      code,
      message:
        statusCode >= 500
          ? 'The service could not complete the request.'
          : code.toLowerCase().replaceAll('_', ' '),
      requestId: typeof requestId === 'string' ? requestId : randomUUID(),
    };
    response.setHeader('X-Request-Id', error.requestId);
    response.status(statusCode).json(error);
  }
}
