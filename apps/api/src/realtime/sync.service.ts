import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, Membership, Message, RealtimeEvent, RealtimeStream } from '@prisma/client';
import type { MembershipView, ReceiptStage, RealtimeMessage, ReplayEntry, ReplayPage } from '@chatapp/contracts';
import { Conversations } from '../messaging/conversations.service';
import { Messages } from '../messaging/messages.service';
import { decodeCursor, encodeCursor } from '../messaging/policy';
import { MessagingRepository, type MessagingDb } from '../messaging/repository';
import { appendChange } from './events';

function membershipView(row: Conversation, member: Membership): MembershipView {
  return {
    id: row.id, visibleFrom: member.visibleFrom,
    eventVisibleFrom: member.eventVisibleFrom ?? 1, highWater: row.eventSequence ?? 0,
  };
}

@Injectable()
export class SyncService {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly conversations: Conversations,
    private readonly messages: Messages,
  ) {}

  async access(userId: string, id: string) {
    return this.repository.atomic(async (tx) => {
      const member = await this.repository.membership(tx,id,userId);
      const row = await tx.conversation.findUniqueOrThrow({where:{id}});
      return membershipView(row,member);
    });
  }

  accountHighWater(userId: string) {
    return this.accountSequence(this.repository.db,userId);
  }

  private async accountSequence(tx: MessagingDb, userId: string) {
    return (await tx.accountSyncState.findUnique({where:{id:userId}}))?.sequence ?? 0;
  }

  accountSnapshot(userId: string, limit: number, cursor?: string, watermark?: number) {
    return this.repository.atomic(async (tx)=>{
      const highWater = await this.accountSequence(tx,userId);
      if (watermark !== undefined && highWater !== watermark) {
        return {highWater,changed:true,memberships:[],nextCursor:null};
      }
      const members = await tx.membership.findMany({
        where:{userId,active:true,...(cursor && {conversationId:{lt:cursor}})},
        orderBy:{conversationId:'desc'},take:limit+1,
      });
      const page=members.slice(0,limit);
      const conversations=await tx.conversation.findMany({where:{id:{in:page.map((member)=>member.conversationId)}}});
      const lookup=new Map(conversations.map((row)=>[row.id,row]));
      return {
        highWater,changed:false,
        memberships:page.flatMap((member)=>{
          const row=lookup.get(member.conversationId);
          return row ? [membershipView(row,member)] : [];
        }),
        nextCursor:members.length>limit ? page.at(-1)?.conversationId ?? null : null,
      };
    });
  }

  conversationSnapshot(userId: string, id: string, older?: string) {
    const cursor=decodeCursor(older);
    return this.repository.atomic(async (tx)=>{
      const member=await this.repository.membership(tx,id,userId);
      const row=await tx.conversation.findUniqueOrThrow({where:{id}});
      const messages=await tx.message.findMany({
        where:{conversationId:id,sequence:{gte:member.visibleFrom},deletedAt:null,...(cursor&&{OR:[
          {createdAt:{lt:cursor.createdAt}},
          {createdAt:cursor.createdAt,id:{lt:cursor.id}},
        ]})},
        orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,
      });
      const page=messages.slice(0,50);
      const last=page.at(-1);
      return {
        membership:membershipView(row,member),
        conversation:await this.conversations.present(tx,row,member),
        messages:await this.projectMessages(tx,userId,page),
        older:messages.length>50 && last ? encodeCursor(last) : null,
      };
    });
  }

  replay(userId: string, stream:RealtimeStream, streamId:string, after:number, limit:number): Promise<ReplayPage> {
    return this.repository.atomic(async (tx)=>{
      const member=stream==='CONVERSATION' ? await this.repository.membership(tx,streamId,userId) : undefined;
      const highWater=member
        ? (await tx.conversation.findUniqueOrThrow({where:{id:streamId}})).eventSequence ?? 0
        : await this.accountSequence(tx,userId);
      const base={stream,streamId,highWater};
      const rows=await tx.realtimeEvent.findMany({
        where:{stream,streamId,sequence:{gt:after}},orderBy:{sequence:'asc'},take:limit,
      });
      const snapshotRequired=after>highWater || (member?.eventVisibleFrom ?? 1)>after+1 ||
        rows.some((row,index)=>row.sequence!==after+index+1) || (after<highWater && !rows.length);
      if (snapshotRequired) return {...base,events:[],next:after,more:false,snapshotRequired:true};
      const events:ReplayEntry[]=[];
      for (const row of rows) events.push(await this.projectEvent(tx,userId,row,member));
      const next=rows.at(-1)?.sequence ?? after;
      return {...base,events,next,more:next<highWater,snapshotRequired:false};
    });
  }

  private async projectEvent(tx:MessagingDb,userId:string,row:RealtimeEvent,member?:Membership): Promise<ReplayEntry> {
    const filtered:ReplayEntry={sequence:row.sequence,type:'filtered'};
    const type=row.type as ReplayEntry['type'];
    const id=row.conversationId;
    if (!member) {
      const own=await tx.membership.findUnique({where:{conversationId_userId:{conversationId:id,userId}}});
      if (!own?.active) {
        return row.affectedUserId===userId && type==='membership.revoked'
          ? {sequence:row.sequence,type,conversationId:id,membership:null} : filtered;
      }
      if (row.messageSequence!=null && row.messageSequence<own.visibleFrom) return filtered;
      const conversation=await tx.conversation.findUniqueOrThrow({where:{id}});
      return {sequence:row.sequence,type,conversationId:id,membership:membershipView(conversation,own)};
    }
    if (row.messageSequence!=null && row.messageSequence<member.visibleFrom) return filtered;
    if (row.messageId) {
      const message=await tx.message.findFirst({where:{id:row.messageId,conversationId:id,sequence:{gte:member.visibleFrom}}});
      const [projection]=message ? await this.projectMessages(tx,userId,[message]) : [];
      return projection ? {sequence:row.sequence,type,message:projection} : filtered;
    }
    const conversation=await tx.conversation.findUniqueOrThrow({where:{id}});
    return {sequence:row.sequence,type,conversation:await this.conversations.present(tx,conversation,member),
      ...(type==='membership.revoked' && {receiptsInvalidated:true})};
  }

  private async projectMessages(tx:MessagingDb,userId:string,rows:Message[]): Promise<RealtimeMessage[]> {
    if (!rows.length) return [];
    const ids=rows.map((row)=>row.id);
    const receipts=await tx.receipt.findMany({
      where:{eligible:true,messageId:{in:ids}},select:{messageId:true,recipientId:true,deliveredAt:true,readAt:true},
    });
    const projections=await this.messages.present(tx,rows);
    return rows.map((row,index)=>{
      const projection=projections[index];
      if (!projection) throw new Error('Missing canonical projection');
      const targets=receipts.filter((receipt)=>receipt.messageId===row.id);
      return {
        ...projection,messageSequence:row.sequence,
        ...(row.senderId===userId ? {
          clientMessageId:row.clientMessageId,
          ...(!projection.deleted && {receipt:{eligible:targets.length,
            delivered:targets.filter((target)=>target.deliveredAt).length,
            read:targets.filter((target)=>target.readAt).length}}),
        } : {canAcknowledge:!projection.deleted && targets.some((target)=>target.recipientId===userId)}),
      };
    });
  }

  acknowledge(userId:string,id:string,messageId:string,stage:ReceiptStage) {
    return this.repository.atomic(async(tx)=>{
      const {membership}=await this.repository.lock(tx,id,userId);
      const message=await tx.message.findFirst({where:{
        id:messageId,conversationId:id,deletedAt:null,sequence:{gte:membership.visibleFrom},
      }});
      if (!message) throw new NotFoundException();
      const target=await tx.receipt.findUnique({where:{messageId_recipientId:{messageId,recipientId:userId}}});
      if (!target?.eligible) throw new NotFoundException();
      const read=stage==='READ';
      if (read ? target.readAt : target.deliveredAt) return;
      const now=new Date();
      const at=target.deliveredAt && target.deliveredAt>now ? target.deliveredAt : now;
      await tx.receipt.update({where:{id:target.id},data:{
        deliveredAt:target.deliveredAt ?? at,...(read && {readAt:at}),
      }});
      await appendChange(tx,{type:read?'receipt.read':'receipt.delivered',conversationId:id,messageId,messageSequence:message.sequence});
    });
  }
}
