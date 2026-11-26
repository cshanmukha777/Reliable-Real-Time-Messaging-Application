import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import type { ApiEnvironment } from './config/environment';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

@Module({})
export class AppModule {
  static forRoot(environment: ApiEnvironment): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(environment), HealthModule, AuthModule],
    };
  }
}
