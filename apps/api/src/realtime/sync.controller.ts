import { BadRequestException, Controller, Get, HttpCode, HttpException, Injectable, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { accountSnapshotQuerySchema, API_VERSION, mongoIdSchema, pageQuerySchema, receiptInputSchema, replayQuerySchema, type Account } from '@chatapp/contracts';
import type { ZodType } from 'zod';
import { AccessTokenGuard, CurrentAccount } from '../auth/auth.guard';
import { SyncService } from './sync.service';

function parse<T>(schema: ZodType<T>, value: unknown):T {
  const result=schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}

@Injectable()
export class SyncThrottle {
  private readonly buckets=new Map<string,number>();
  private epoch=0;
  check(id:string) {
    const epoch=Math.floor(Date.now()/10_000);
    if (epoch!==this.epoch) {this.buckets.clear();this.epoch=epoch;}
    if (!this.buckets.has(id) && this.buckets.size>=10_000) throw new HttpException('Sync busy',429);
    const next=(this.buckets.get(id)??0)+1;
    if (next>160) throw new HttpException('Sync busy',429);
    this.buckets.set(id,next);
  }
}

@Controller({version:API_VERSION.slice(1)})
@UseGuards(AccessTokenGuard)
export class SyncController {
  constructor(private readonly sync:SyncService, private readonly throttle:SyncThrottle) {}

  @Get('sync/account')
  account(@CurrentAccount() user:Account,@Query() query:unknown) {
    this.throttle.check(user.id);
    const {after,limit}=parse(replayQuerySchema,query);
    return this.sync.replay(user.id,'ACCOUNT',user.id,after,limit);
  }

  @Get('sync/account/snapshot')
  accountSnapshot(@CurrentAccount() user:Account,@Query() query:unknown) {
    this.throttle.check(user.id);
    const {limit,cursor,watermark}=parse(accountSnapshotQuerySchema,query);
    return this.sync.accountSnapshot(user.id,limit,cursor ? parse(mongoIdSchema,cursor) : undefined,watermark);
  }

  @Get('conversations/:id/events')
  conversation(@CurrentAccount() user:Account,@Param('id') id:string,@Query() query:unknown) {
    this.throttle.check(user.id);
    const {after,limit}=parse(replayQuerySchema,query);
    return this.sync.replay(user.id,'CONVERSATION',parse(mongoIdSchema,id),after,limit);
  }

  @Get('conversations/:id/events/snapshot')
  snapshot(@CurrentAccount() user:Account,@Param('id') id:string,@Query() query:unknown) {
    this.throttle.check(user.id);
    return this.sync.conversationSnapshot(user.id,parse(mongoIdSchema,id),parse(pageQuerySchema,query).cursor);
  }

  @Post('conversations/:id/messages/:message/receipt')
  @HttpCode(204)
  async acknowledge(@CurrentAccount() user:Account,@Param('id') id:string,@Param('message') message:string,@Body() body:unknown) {
    this.throttle.check(user.id);
    await this.sync.acknowledge(user.id,parse(mongoIdSchema,id),parse(mongoIdSchema,message),parse(receiptInputSchema,body).stage);
  }
}
