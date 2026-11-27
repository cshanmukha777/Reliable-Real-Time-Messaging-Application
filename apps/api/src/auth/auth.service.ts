import { discoveryKey } from '../messaging/users.service';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  LoginInput,
  ProfileInput,
  RegisterInput,
} from '@chatapp/contracts';
import { AuthRepository, presentAccount, prismaError } from './auth.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async register({ email, password, displayName }: RegisterInput) {
    const passwordHash = await this.passwords.create(password);
    try {
      return await this.repository.database.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, lastLoginAt: new Date() },
          select: { id: true },
        });
        await tx.profile.create({
          data: {
            userId: user.id,
            displayName,
            discoveryKey: discoveryKey(displayName),
            avatarUrl: null,
          },
        });
        return this.sessions.create(tx, user.id);
      });
    } catch (error) {
      if (prismaError(error, 'P2002')) throw new ConflictException();
      throw error;
    }
  }

  async login({ email, password }: LoginInput) {
    const user = await this.repository.credentials(email);
    const valid = await this.passwords.matches(password, user?.passwordHash);
    if (!user || user.status !== 'ACTIVE' || !valid)
      throw new UnauthorizedException();
    return this.repository.database.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          status: 'ACTIVE',
          passwordHash: user.passwordHash,
        },
        data: { lastLoginAt: new Date() },
      });
      if (updated.count !== 1) throw new UnauthorizedException();
      return this.sessions.create(tx, user.id);
    });
  }

  async updateProfile(userId: string, { displayName }: ProfileInput) {
    await this.repository.database.profile.update({
      where: { userId },
      data: { displayName, discoveryKey: discoveryKey(displayName) },
    });
    const user = await this.repository.account(userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    return presentAccount(user);
  }
}
