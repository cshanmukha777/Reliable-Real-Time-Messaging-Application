import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController, ProfileController } from './auth.controller';
import { AccessTokenGuard } from './auth.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuthThrottle } from './throttle.guard';
import { TokenService } from './token.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, ProfileController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordService,
    SessionService,
    TokenService,
    AccessTokenGuard,
    AuthThrottle,
  ],
  exports: [AccessTokenGuard, SessionService, TokenService],
})
export class AuthModule {}
