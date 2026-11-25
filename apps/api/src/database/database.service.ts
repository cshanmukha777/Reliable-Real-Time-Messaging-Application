import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { API_ENVIRONMENT } from '../config/config.module';
import type { ApiEnvironment } from '../config/environment';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnApplicationShutdown
{
  private readinessCheck: Promise<boolean> | undefined;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super({ datasourceUrl: environment.DATABASE_URL });
  }

  isReady(): Promise<boolean> {
    this.readinessCheck ??= this.checkReadiness().finally(() => {
      this.readinessCheck = undefined;
    });
    return this.readinessCheck;
  }

  private async checkReadiness(): Promise<boolean> {
    try {
      const result = await this.$runCommandRaw({ hello: 1 });
      return (
        result.ok === 1 &&
        result.isWritablePrimary === true &&
        typeof result.setName === 'string'
      );
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
