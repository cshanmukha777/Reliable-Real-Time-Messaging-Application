import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  API_VERSION,
  loginInputSchema,
  logoutInputSchema,
  profileInputSchema,
  refreshInputSchema,
  registerInputSchema,
  type Account,
} from '@chatapp/contracts';
import type { ZodType } from 'zod';
import { AccessTokenGuard, CurrentAccount } from './auth.guard';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AuthThrottle } from './throttle.guard';

function validated<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
const version = API_VERSION.slice(1);

@Controller({ path: 'auth', version })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  @UseGuards(AuthThrottle)
  register(@Body() body: unknown) {
    return this.auth.register(validated(registerInputSchema, body));
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthThrottle)
  login(@Body() body: unknown) {
    return this.auth.login(validated(loginInputSchema, body));
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AuthThrottle)
  refresh(@Body() body: unknown) {
    return this.sessions.refresh(validated(refreshInputSchema, body));
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthThrottle)
  logout(@Body() body: unknown) {
    return this.sessions.revoke(
      validated(logoutInputSchema, body).refreshToken,
    );
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthThrottle, AccessTokenGuard)
  logoutAll(@CurrentAccount() account: Account) {
    return this.sessions.revokeAll(account.id);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentAccount() account: Account) {
    return account;
  }
}

@Controller({ path: 'users/me', version })
@UseGuards(AccessTokenGuard)
export class ProfileController {
  constructor(private readonly auth: AuthService) {}
  @Get()
  me(@CurrentAccount() account: Account) {
    return account;
  }

  @Patch()
  update(@CurrentAccount() account: Account, @Body() body: unknown) {
    return this.auth.updateProfile(
      account.id,
      validated(profileInputSchema, body),
    );
  }
}
