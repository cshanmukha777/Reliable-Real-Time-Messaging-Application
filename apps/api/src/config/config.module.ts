import { Module, type DynamicModule } from '@nestjs/common';
import type { ApiEnvironment } from './environment';

export const API_ENVIRONMENT = Symbol('API_ENVIRONMENT');

@Module({})
export class ConfigModule {
  static forRoot(environment: ApiEnvironment): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: API_ENVIRONMENT, useValue: environment }],
      exports: [API_ENVIRONMENT],
    };
  }
}
