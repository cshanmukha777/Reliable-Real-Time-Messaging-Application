import { type OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayInit,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { RealtimeEvent } from '@prisma/client';
import {
  mongoIdSchema,
  subscriptionSchema,
  typingSchema,
} from '@chatapp/contracts';
import { z } from 'zod';
import { SessionService } from '../auth/session.service';
import { TokenService, type AccessClaims } from '../auth/token.service';
import { MessagingRepository } from '../messaging/repository';
import { SyncService } from './sync.service';

const tokenSchema = z.strictObject({
  token: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[A-Za-z0-9_.-]+$/),
});
type Ack = (response: { ok: boolean; snapshotRequired?: boolean }) => void;
type Connected = {
  socket: Socket;
  claims: AccessClaims;
  rooms: Set<string>;
  expiry: ReturnType<typeof setTimeout>;
  commands: number;
  pending: number;
  tail: Promise<void>;
  window: number;
};
const room = (id: string) => `conversation:${id}`;
const account = (id: string) => `account:${id}`;

@WebSocketGateway({ path: '/realtime', transports: ['websocket'] })
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private server?: Server;
  private readonly live = new Map<string, Connected>();
  private readonly online = new Map<string, Set<string>>();
  private readonly connectionWindows = new Map<string, number>();
  private connectionEpoch = 0;
  private readonly typing = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; socketId: string; since: number }
  >();
  private heartbeat?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private checking = false;

  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly repository: MessagingRepository,
    private readonly sync: SyncService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('Connection refused')),
      );
    });
    this.unsubscribe = this.sessions.onRevoked(({ userId, sessionId }) => {
      for (const state of this.live.values()) {
        if (
          (userId && state.claims.sub === userId) ||
          (sessionId && state.claims.sid === sessionId)
        )
          state.socket.disconnect(true);
      }
    });
    this.heartbeat = setInterval(() => {
      if (this.checking) return;
      this.checking = true;
      void Promise.all(
        [...this.live.values()].map((state) => this.authorized(state)),
      ).finally(() => {
        this.checking = false;
      });
    }, 5000);
    this.heartbeat.unref();
  }

  private async authenticate(socket: Socket) {
    const epoch = Math.floor(Date.now() / 60_000);
    if (epoch !== this.connectionEpoch) {
      this.connectionEpoch = epoch;
      this.connectionWindows.clear();
    }
    const address = socket.handshake.address;
    const count = (this.connectionWindows.get(address) ?? 0) + 1;
    if (
      count > 120 ||
      (this.connectionWindows.size >= 10_000 &&
        !this.connectionWindows.has(address))
    )
      throw new Error();
    this.connectionWindows.set(address, count);
    const token = tokenSchema.parse(socket.handshake.auth).token;
    const claims = this.tokens.verify(token);
    await this.sessions.current(claims.sub, claims.sid);
    socket.data.claims = claims;
    socket.handshake.auth = {};
  }

  handleConnection(socket: Socket) {
    const claims = socket.data.claims as AccessClaims | undefined;
    if (!claims || this.live.size >= 1000) return socket.disconnect(true);
    const sockets = this.online.get(claims.sub) ?? new Set<string>();
    if (sockets.size >= 8) return socket.disconnect(true);
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, claims.exp * 1000 - Date.now()),
    );
    const state: Connected = {
      socket,
      claims,
      rooms: new Set(),
      expiry,
      commands: 0,
      pending: 0,
      tail: Promise.resolve(),
      window: 0,
    };
    this.live.set(socket.id, state);
    const wasOffline = !sockets.size;
    sockets.add(socket.id);
    this.online.set(claims.sub, sockets);
    void socket.join(account(claims.sub));
    socket.on('watch', (input: unknown, ack: unknown) =>
      this.command(state, ack, () => this.watch(state, input)),
    );
    socket.on('unwatch', (input: unknown, ack: unknown) =>
      this.command(state, ack, () =>
        this.unwatch(state, mongoIdSchema.parse(input)),
      ),
    );
    socket.on('typing', (input: unknown, ack: unknown) =>
      this.command(state, ack, () => this.setTyping(state, input)),
    );
    void this.sync
      .accountHighWater(claims.sub)
      .then((highWater) => {
        if (socket.connected)
          socket.emit('available', {
            stream: 'ACCOUNT',
            streamId: claims.sub,
            highWater,
          });
      })
      .catch(() => socket.disconnect(true));
    if (wasOffline)
      void this.presenceChanged(claims.sub).catch(() => undefined);
    return undefined;
  }

  handleDisconnect(socket: Socket) {
    const state = this.live.get(socket.id);
    if (!state) return;
    clearTimeout(state.expiry);
    this.live.delete(socket.id);
    const sockets = this.online.get(state.claims.sub);
    sockets?.delete(socket.id);
    if (!sockets?.size) {
      this.online.delete(state.claims.sub);
      void this.presenceChanged(state.claims.sub).catch(() => undefined);
    }
    for (const id of state.rooms)
      this.clearTyping(id, state.claims.sub, socket.id);
  }

  private async authorized(state: Connected) {
    if (!state.socket.connected) return false;
    try {
      if (state.claims.exp * 1000 <= Date.now()) throw new Error();
      await this.sessions.current(state.claims.sub, state.claims.sid);
      return state.socket.connected;
    } catch {
      state.socket.disconnect(true);
      return false;
    }
  }

  private command(
    state: Connected,
    reply: unknown,
    work: () => Promise<boolean | void>,
  ) {
    const now = Math.floor(Date.now() / 10_000);
    if (now !== state.window) {
      state.window = now;
      state.commands = 0;
    }
    const ack = typeof reply === 'function' ? (reply as Ack) : () => undefined;
    if (++state.commands > 32 || state.pending >= 32) {
      ack({ ok: false });
      return;
    }
    state.pending++;
    state.tail = state.tail
      .then(async () => {
        if (!(await this.authorized(state))) return ack({ ok: false });
        const snapshotRequired = await work();
        ack({ ok: true, ...(snapshotRequired && { snapshotRequired: true }) });
      })
      .catch(() => ack({ ok: false }))
      .finally(() => {
        state.pending--;
      });
  }

  private async watch(state: Connected, input: unknown) {
    const { id, after } = subscriptionSchema.parse(input);
    if (!state.rooms.has(id) && state.rooms.size >= 4) throw new Error();
    const access = await this.sync.access(state.claims.sub, id);
    await state.socket.join(room(id));
    if (!state.socket.connected) return;
    state.rooms.add(id);
    // Read a fresh high-water mark after joining to close the subscription race.
    const latest = await this.sync
      .access(state.claims.sub, id)
      .catch(async (error: unknown) => {
        await this.unwatch(state, id);
        throw error;
      });
    state.socket.emit('available', {
      stream: 'CONVERSATION',
      streamId: id,
      highWater: latest.highWater,
    });
    const ids = await this.activeMembers(id);
    if (ids.includes(state.claims.sub) && state.socket.connected)
      state.socket.emit('presence', {
        id,
        online: ids.filter((userId) => this.online.has(userId)),
      });
    return after < access.eventVisibleFrom - 1 || after > latest.highWater;
  }

  private async unwatch(state: Connected, id: string) {
    state.rooms.delete(id);
    await state.socket.leave(room(id));
    this.clearTyping(id, state.claims.sub, state.socket.id);
  }

  private async activeMembers(id: string) {
    const rows = await this.repository.db.membership.findMany({
      where: { conversationId: id, active: true },
      select: { userId: true },
      take: 32,
    });
    return rows.map((row) => row.userId);
  }

  private async presenceChanged(userId: string) {
    // Only conversations currently being watched can receive ephemeral signals.
    const watched = new Set(
      [...this.live.values()].flatMap((state) => [...state.rooms]),
    );
    for (const id of watched) {
      const ids = await this.activeMembers(id);
      if (ids.includes(userId))
        await this.broadcast(
          id,
          'presence',
          { id, online: ids.filter((id) => this.online.has(id)) },
          ids,
        );
    }
  }

  private async broadcast(
    id: string,
    event: 'presence' | 'typing',
    payload: unknown,
    members?: string[],
  ) {
    const ids = members ?? (await this.activeMembers(id));
    const subscribers = this.server?.sockets.adapter.rooms.get(room(id)) ?? [];
    await Promise.all(
      [...subscribers].map(async (socketId) => {
        const state = this.live.get(socketId);
        if (!state) return;
        if (!ids.includes(state.claims.sub)) {
          await this.unwatch(state, id);
          return;
        }
        if (await this.authorized(state)) state.socket.emit(event, payload);
      }),
    );
  }

  private async setTyping(state: Connected, input: unknown) {
    const { id, active } = typingSchema.parse(input);
    if (!state.rooms.has(id)) throw new Error();
    const ids = await this.activeMembers(id);
    const userId = state.claims.sub;
    if (!ids.includes(userId)) {
      await this.unwatch(state, id);
      throw new Error();
    }
    if (!active) {
      this.clearTyping(id, userId, state.socket.id);
      return;
    }
    const key = `${id}:${userId}`;
    const existing = this.typing.get(key);
    if (existing && Date.now() - existing.since < 1800) return;
    clearTimeout(existing?.timer);
    const timer = setTimeout(
      () => this.clearTyping(id, userId, state.socket.id),
      5000,
    );
    this.typing.set(key, {
      timer,
      socketId: state.socket.id,
      since: Date.now(),
    });
    await this.broadcast(id, 'typing', { id, userId, active: true }, ids);
  }

  private clearTyping(id: string, userId: string, socketId?: string) {
    const key = `${id}:${userId}`;
    const state = this.typing.get(key);
    if (!state || (socketId && state.socketId !== socketId)) return;
    clearTimeout(state.timer);
    this.typing.delete(key);
    void this.broadcast(id, 'typing', { id, userId, active: false }).catch(
      () => undefined,
    );
  }

  async publish(event: RealtimeEvent) {
    if (!this.server) throw new Error('Gateway is not ready');
    const { stream, streamId, sequence, conversationId, affectedUserId } =
      event;
    if (event.type === 'membership.revoked' && affectedUserId) {
      for (const socketId of this.online.get(affectedUserId) ?? []) {
        const state = this.live.get(socketId);
        if (state?.rooms.has(conversationId)) {
          const active = await this.repository.db.membership.findUnique({
            where: {
              conversationId_userId: { conversationId, userId: affectedUserId },
            },
          });
          if (!active?.active) await this.unwatch(state, conversationId);
        }
      }
      await this.presenceChangedForRoom(conversationId);
    }
    const id = stream === 'ACCOUNT' ? account(streamId) : room(streamId);
    const targets = this.server.sockets.adapter.rooms.get(id) ?? [];
    await Promise.all(
      [...targets].map(async (socketId) => {
        const state = this.live.get(socketId);
        if (!state || !(await this.authorized(state))) return;
        if (stream === 'CONVERSATION') {
          const member = await this.repository.db.membership.findUnique({
            where: {
              conversationId_userId: {
                conversationId: streamId,
                userId: state.claims.sub,
              },
            },
          });
          if (!member?.active) {
            await this.unwatch(state, streamId);
            return;
          }
          if (sequence < (member.eventVisibleFrom ?? 1)) return;
        }
        if (state.socket.connected)
          state.socket.emit('available', {
            stream,
            streamId,
            highWater: sequence,
          });
      }),
    );
  }

  private async presenceChangedForRoom(id: string) {
    if (!this.server?.sockets.adapter.rooms.has(room(id))) return;
    const ids = await this.activeMembers(id);
    await this.broadcast(
      id,
      'presence',
      { id, online: ids.filter((userId) => this.online.has(userId)) },
      ids,
    );
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    this.unsubscribe?.();
    for (const state of this.typing.values()) clearTimeout(state.timer);
    this.typing.clear();
    for (const state of this.live.values()) state.socket.disconnect(true);
  }
}
