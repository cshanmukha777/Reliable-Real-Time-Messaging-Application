import type { AccountSnapshot, ConversationSnapshot, MembershipView, RealtimeMessage, ReplayPage, ReceiptStage } from '@chatapp/contracts';
import type { SqlExecutor } from '../sqlite-core.ts';
import type { OfflineStore } from '../offline/store.ts';

type Stream = ReplayPage['stream'];
type Cursor = {id:string;cursor:number;high_water:number;event_boundary:number;visible_from:number;older:string|null};
export type PendingReceipt={message_id:string;conversation_id:string;desired:1|2};

export class RealtimeProjection {
  readonly store: OfflineStore;
  constructor(store:OfflineStore) {this.store=store;}

  cursor(stream:Stream,id:string) {
    return this.store.db.first<Cursor>('SELECT * FROM realtime_streams WHERE stream=? AND id=?',stream,id);
  }

  conversations() {
    return this.store.db.all<Cursor>("SELECT * FROM realtime_streams WHERE stream='CONVERSATION' ORDER BY id");
  }

  private async membership(tx:SqlExecutor,view:MembershipView) {
    const row=await tx.first<Cursor>("SELECT * FROM realtime_streams WHERE stream='CONVERSATION' AND id=?",view.id);
    if(row && row.event_boundary>view.eventVisibleFrom)return;
    if(row && (row.event_boundary!==view.eventVisibleFrom || row.visible_from!==view.visibleFrom)) {
      await this.store.revokeIn(tx,view.id);
    }
    await tx.run(`INSERT INTO realtime_streams(stream,id,cursor,high_water,event_boundary,visible_from) VALUES('CONVERSATION',?,-1,?,?,?)
      ON CONFLICT(stream,id) DO UPDATE SET high_water=MAX(high_water,excluded.high_water)`,
      view.id,view.highWater,view.eventVisibleFrom,view.visibleFrom);
  }

  async accountSnapshot(snapshot:Pick<AccountSnapshot,'memberships'|'highWater'>, isCurrent:()=>boolean) {
    await this.store.db.transaction(async(tx)=>{
      if(!isCurrent())return;
      const known = await tx.all<{id:string}>(`SELECT id FROM conversations WHERE active=1
        UNION SELECT id FROM realtime_streams WHERE stream='CONVERSATION'`);
      const allowed=new Set(snapshot.memberships.map((m)=>m.id));
      for(const {id} of known) if(!allowed.has(id))await this.store.revokeIn(tx,id);
      for(const member of snapshot.memberships)await this.membership(tx,member);
      if(!isCurrent())throw new Error('SCOPE_CHANGED');
      await this.persistCursor(tx,'ACCOUNT',this.store.userId,snapshot.highWater,snapshot.highWater);
    });
    this.store.notify();
  }

  async conversationSnapshot(snapshot:ConversationSnapshot,isCurrent:()=>boolean,older=false) {
    await this.store.db.transaction(async(tx)=>{
      if(!isCurrent())return;
      const {membership,conversation,messages}=snapshot;
      const id=conversation.id;
      if(membership.id!==id)throw new Error('CONVERSATION_SCOPE');
      const old=await tx.first<Cursor>("SELECT * FROM realtime_streams WHERE stream='CONVERSATION' AND id=?",id);
      if(!old || old.event_boundary>membership.eventVisibleFrom || old.cursor>membership.highWater) return;
      if(older && (old.event_boundary!==membership.eventVisibleFrom || old.visible_from!==membership.visibleFrom)) throw new Error('MEMBERSHIP_CHANGED');
      await this.membership(tx,membership);
      await this.store.cacheConversation(tx,conversation);
      if(!older) {
        await tx.run('DELETE FROM messages WHERE conversation_id=? AND server_id IS NOT NULL',id);
        await tx.run('DELETE FROM receipt_projection WHERE conversation_id=?',id);
      }
      for(const message of messages)await this.message(tx,id,message);
      await tx.run('INSERT OR REPLACE INTO sync_metadata VALUES (?,?)',`membership:${id}`,String(membership.visibleFrom));
      if(!isCurrent())throw new Error('SCOPE_CHANGED');
      if(!older)await this.persistCursor(tx,'CONVERSATION',id,membership.highWater,membership.highWater);
      await tx.run("UPDATE realtime_streams SET older=? WHERE stream='CONVERSATION' AND id=?",snapshot.older,id);
    });
    this.store.notify();
  }

  async apply(page:ReplayPage,isCurrent:()=>boolean) {
    if(page.snapshotRequired)throw new Error('SNAPSHOT_REQUIRED');
    await this.store.db.transaction(async(tx)=>{
      if(!isCurrent())return;
      if(page.stream==='ACCOUNT' && page.streamId!==this.store.userId)throw new Error('ACCOUNT_SCOPE');
      const row=await tx.first<Cursor>('SELECT * FROM realtime_streams WHERE stream=? AND id=?',page.stream,page.streamId);
      if(!row)throw new Error('MISSING_CURSOR');
      let cursor=row.cursor;
      for(const entry of page.events) {
        if(entry.sequence<=cursor)continue;
        if(entry.sequence!==cursor+1)throw new Error('EVENT_GAP');
        if(page.stream==='ACCOUNT'){
          if(entry.membership)await this.membership(tx,entry.membership);
          else if(entry.membership===null && entry.conversationId) await this.store.revokeIn(tx,entry.conversationId);
        } else {
          if(entry.conversation?.id===page.streamId)await this.store.cacheConversation(tx,entry.conversation);
          if(entry.message)await this.message(tx,page.streamId,entry.message);
        }
        cursor=entry.sequence;
      }
      if(cursor<page.next || cursor>Math.max(row.cursor,page.highWater))throw new Error('EVENT_GAP');
      if(!isCurrent())throw new Error('SCOPE_CHANGED');
      await this.persistCursor(tx,page.stream,page.streamId,cursor,page.highWater);
    });
    this.store.notify();
  }

  private async persistCursor(tx:SqlExecutor,stream:Stream,id:string,cursor:number,watermark:number) {
    await tx.run(`INSERT INTO realtime_streams(stream,id,cursor,high_water) VALUES(?,?,?,?)
      ON CONFLICT(stream,id) DO UPDATE SET cursor=excluded.cursor,high_water=MAX(high_water,excluded.high_water)`,
      stream,id,cursor,watermark);
  }

  private async message(tx:SqlExecutor,id:string,value:RealtimeMessage) {
    const {clientMessageId,receipt,canAcknowledge,messageSequence,...message}=value;
    if(message.conversationId!==id || messageSequence<1)throw new Error('CONVERSATION_SCOPE');
    const prior=await tx.first<{deleted:number}>("SELECT json_extract(data,'$.deleted') AS deleted FROM messages WHERE server_id=?",message.id);
    if(prior?.deleted && !message.deleted)return;
    await this.store.merge(tx,message,message.sender.id===this.store.userId?clientMessageId:undefined,Date.now());
    if(message.deleted){
      await tx.run('DELETE FROM receipt_ack WHERE message_id=?',message.id);
      await tx.run('DELETE FROM receipt_projection WHERE message_id=?',message.id);
    } else {
      if(receipt && message.sender.id===this.store.userId) await tx.run(`INSERT INTO receipt_projection VALUES(?,?,?,?,?)
        ON CONFLICT(message_id) DO UPDATE SET eligible=excluded.eligible,delivered=excluded.delivered,read_count=excluded.read_count`,
        message.id,id,receipt.eligible,receipt.delivered,receipt.read);
      if(canAcknowledge && message.sender.id!==this.store.userId)await tx.run(
        'INSERT OR IGNORE INTO receipt_ack(message_id,conversation_id,desired) VALUES(?,?,1)',message.id,id);
    }
  }

  receipts() {
    return this.store.db.all<PendingReceipt>('SELECT message_id,conversation_id,desired FROM receipt_ack WHERE desired>acknowledged ORDER BY message_id LIMIT 32');
  }

  async acknowledge(receipt:PendingReceipt,stage:ReceiptStage) {
    await this.store.db.run('UPDATE receipt_ack SET acknowledged=MAX(acknowledged,?) WHERE message_id=?',
      stage==='READ'?2:1,receipt.message_id);
  }

  async read(id:string,ids:string[],eligible:()=>boolean) {
    return this.store.db.transaction(async(tx)=>{
      if(!eligible())return false;
      let changed=false;
      for(const messageId of new Set(ids)) {
        const row=await tx.first('SELECT message_id FROM receipt_ack WHERE conversation_id=? AND message_id=? AND desired=1',id,messageId);
        if(!row)continue;
        await tx.run('UPDATE receipt_ack SET desired=2 WHERE conversation_id=? AND message_id=?',id,messageId);
        changed=true;
      }
      if(!eligible())throw new Error('THREAD_NOT_VISIBLE');
      return changed;
    });
  }

  async release(id:string) {
    await this.store.revoke(id);
  }
}
