import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Account } from '@chatapp/contracts';
import { presentAccount } from './auth.repository';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

type AuthenticatedRequest = Request & { account?: Account };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    const token = match?.[1];
    if (!token || token.length > 4096) throw new UnauthorizedException();
    const claims = this.tokens.verify(token);
    request.account = presentAccount(
      await this.sessions.current(claims.sub, claims.sid),
    );
    return true;
  }
}

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Account => {
    const account = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().account;
    if (!account) throw new UnauthorizedException();
    return account;
  },
);
