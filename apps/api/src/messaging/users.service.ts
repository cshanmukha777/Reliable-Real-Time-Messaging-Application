import { Injectable, HttpException, NotFoundException } from '@nestjs/common';
import type { Person } from '@chatapp/contracts';
import { MessagingRepository, type MessagingDb } from './repository';

export function discoveryKey(value: string) {
  return value.normalize('NFKC').toLowerCase();
}

@Injectable()
export class MessagingUsers {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(private readonly repository: MessagingRepository) {}

  async discover(userId: string, query: string): Promise<Person[]> {
    const now = Date.now();
    let window = this.windows.get(userId);
    if (!window || window.until <= now) {
      if (this.windows.size >= 10000) {
        for (const [id, candidate] of this.windows) {
          if (candidate.until <= now) this.windows.delete(id);
        }
        if (this.windows.size >= 10000)
          throw new HttpException('Too many requests', 429);
      }
      window = { count: 0, until: now + 60000 };
      this.windows.set(userId, window);
    }
    if (++window.count > 30) throw new HttpException('Too many requests', 429);
    const key = discoveryKey(query);
    const rows = await this.repository.db.profile.findMany({
      where: {
        userId: { not: userId },
        discoveryKey: { gte: key, lt: `${key}\u{10ffff}`, startsWith: key },
        user: { status: 'ACTIVE' },
      },
      orderBy: [{ discoveryKey: 'asc' }, { userId: 'asc' }],
      take: 20,
      select: { userId: true, displayName: true, avatarUrl: true },
    });
    return rows.map(({ userId: id, ...profile }) => ({ id, ...profile }));
  }

  async verify(db: MessagingDb, ids: string[]) {
    const count = await db.user.count({
      where: { id: { in: ids }, status: 'ACTIVE' },
    });
    if (count !== ids.length) throw new NotFoundException();
  }

  async profiles(db: MessagingDb, ids: string[]) {
    const profiles = await db.profile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, displayName: true, avatarUrl: true },
    });
    return new Map(
      profiles.map(({ userId: id, ...profile }) => [id, { id, ...profile }]),
    );
  }
}
