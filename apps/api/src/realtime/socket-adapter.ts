import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import type { ApiEnvironment } from '../config/environment';

export function allowUpgrade(
  environment: Pick<ApiEnvironment, 'NODE_ENV' | 'CORS_ORIGINS'>,
  request: IncomingMessage,
) {
  const origin = request.headers.origin;
  const peer = request.socket.remoteAddress;
  const loopback =
    peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const secure =
    ('encrypted' in request.socket && request.socket.encrypted === true) ||
    (loopback && request.headers['x-forwarded-proto'] === 'https');
  if (environment.NODE_ENV === 'production' && !secure) return false;
  if (!origin) return true;
  if (environment.NODE_ENV === 'production' && !origin.startsWith('https://'))
    return false;
  // React Native supplies an HTTP(S) Origin derived from its WebSocket URL.
  const host = request.headers.host;
  const sameOrigin = host ? `${secure ? 'https' : 'http'}://${host}` : null;
  return origin === sameOrigin || environment.CORS_ORIGINS.includes(origin);
}

export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly environment: ApiEnvironment,
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      serveClient: false,
      transports: ['websocket'],
      maxHttpBufferSize: 8192,
      pingInterval: 20_000,
      pingTimeout: 12_000,
      allowRequest: (
        request: IncomingMessage,
        accept: (error: string | null, allowed: boolean) => void,
      ) => accept(null, allowUpgrade(this.environment, request)),
    });
  }
}
