import { HttpException, Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

@Injectable()
export class PasswordService {
  private pending = 0;
  private dummyHash: Promise<string> | undefined;

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= 4) throw new HttpException('Try again shortly', 429);
    this.pending++;
    try {
      return await operation();
    } finally {
      this.pending--;
    }
  }

  create(password: string) {
    return this.run(() => hash(password, options));
  }

  async matches(password: string, encoded: string | undefined) {
    if (!encoded) {
      this.dummyHash ??= this.create(randomBytes(32).toString('hex')).catch(
        (error: unknown) => {
          this.dummyHash = undefined;
          throw error;
        },
      );
      encoded = await this.dummyHash;
    }
    const expected = encoded;
    return this.run(() => verify(expected, password, options));
  }
}
