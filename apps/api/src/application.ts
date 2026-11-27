import 'reflect-metadata';
import type { NextFunction, Request, Response } from 'express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestLogging } from './common/request-logging';
import type { ApiEnvironment } from './config/environment';

export async function createApplication(environment: ApiEnvironment) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(environment),
    {
      abortOnError: false,
      logger:
        environment.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
    },
  );
  app.disable('x-powered-by');
  app.use(requestLogging);
  app.useBodyParser('json', { limit: '24kb' });
  app.use(
    ['/v1/auth', '/v1/users', '/v1/conversations'],
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  if (environment.CORS_ORIGINS.length > 0) {
    app.enableCors({
      origin: environment.CORS_ORIGINS,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }
  return app;
}
