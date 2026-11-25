import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import {
  API_SERVICE,
  API_VERSION,
  type HealthResponse,
} from '@chatapp/contracts';
import type { Response } from 'express';
import { API_ENVIRONMENT } from '../config/config.module';
import type { ApiEnvironment } from '../config/environment';
import { DatabaseService } from '../database/database.service';

@Controller({ path: 'health', version: API_VERSION.slice(1) })
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  private response(check: HealthResponse['check']): HealthResponse {
    return {
      service: API_SERVICE,
      apiVersion: API_VERSION,
      environment: this.environment.NODE_ENV,
      status: 'ok',
      check,
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  health(): HealthResponse {
    return this.response('service');
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): HealthResponse {
    return this.response('live');
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const ready = await this.database.isReady();
    if (!ready) response.status(503);
    return {
      ...this.response('ready'),
      status: ready ? 'ok' : 'unavailable',
      database: ready ? 'available' : 'unavailable',
    };
  }
}
