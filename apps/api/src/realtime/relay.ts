import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RealtimeEvent } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { RealtimeGateway } from './gateway';

@Injectable()
export class EventRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventRelay.name);
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<number>;
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.flight) return;
      this.flight = this.dispatch()
        .catch(() => {
          this.logger.warn('Event relay temporarily unavailable');
          return 0;
        })
        .finally(() => {
          delete this.flight;
        });
    }, 200);
    this.timer.unref();
  }

  async claim(now = new Date()) {
    const candidates = await this.db.realtimeEvent.findMany({
      where: { publishedAt: null, availableAt: { lte: now } },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 32,
    });
    const claimed: RealtimeEvent[] = [];
    for (const event of candidates) {
      const lease = randomUUID();
      const result = await this.db.realtimeEvent.updateMany({
        where: { id: event.id, publishedAt: null, availableAt: { lte: now } },
        data: {
          lease,
          availableAt: new Date(now.getTime() + 30_000),
          attempts: { increment: 1 },
        },
      });
      if (result.count)
        claimed.push({ ...event, lease, attempts: event.attempts + 1 });
    }
    return claimed;
  }

  async checkpoint(event: RealtimeEvent, now = new Date()) {
    if (!event.lease) return false;
    const result = await this.db.realtimeEvent.updateMany({
      where: { id: event.id, lease: event.lease, publishedAt: null },
      data: { publishedAt: now, lease: null },
    });
    return result.count === 1;
  }

  async dispatch() {
    const events = await this.claim();
    // Hints can arrive out of order. REST supplies ordered stream events.
    await Promise.all(
      events.map(async (event) => {
        try {
          await this.gateway.publish(event);
          await this.checkpoint(event);
        } catch {
          this.logger.warn(`Deferred event dispatch attempt ${event.attempts}`);
          // An expired claim is eligible for another worker.
        }
      }),
    );
    return events.length;
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.flight;
  }
}
