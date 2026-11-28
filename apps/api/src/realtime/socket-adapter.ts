import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import type { ApiEnvironment } from '../config/environment';

export function allowUpgrade(environment:Pick<ApiEnvironment,'NODE_ENV'|'CORS_ORIGINS'>, request:IncomingMessage) {
  const origin = request.headers.origin;
  if (origin && !environment.CORS_ORIGINS.includes(origin)) return false;
  if (environment.NODE_ENV !== 'production') return true;
  if (origin && !origin.startsWith('https://')) return false;
  const peer=request.socket.remoteAddress;
  const loopback=peer==='127.0.0.1'||peer==='::1'||peer==='::ffff:127.0.0.1';
  return ('encrypted' in request.socket && request.socket.encrypted === true) ||
    (loopback && request.headers['x-forwarded-proto']==='https');
}

export class RealtimeAdapter extends IoAdapter {
  constructor(app:INestApplicationContext, private readonly environment:ApiEnvironment) { super(app); }
  override createIOServer(port:number,options?:ServerOptions) {
    return super.createIOServer(port,{
      ...options,
      transports:['websocket'],
      maxHttpBufferSize:8192,
      pingInterval:20_000,pingTimeout:12_000,
      allowRequest:(request:IncomingMessage,accept:(error:string|null,allowed:boolean)=>void)=>accept(null,allowUpgrade(this.environment,request)),
    });
  }
}
