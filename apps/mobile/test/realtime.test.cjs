const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {test}=require('node:test');
const {openDatabase}=require('./sqlite-worker.cjs');
const {migrate}=require('../src/sqlite-core.ts');
const {offlineSchema}=require('../src/offline/schema.ts');
const {OfflineStore}=require('../src/offline/store.ts');
const {RealtimeProjection}=require('../src/realtime/projection.ts');
const {ReplayEngine}=require('../src/realtime/replay.ts');
const {visibleRows}=require('../src/realtime/visibility.ts');

const user='a'.repeat(24);
const peer='b'.repeat(24);
const id='c'.repeat(24);
const first='d'.repeat(24);
const second='e'.repeat(24);
const now='2026-11-28T00:00:00.000Z';
const me={id:user,displayName:'Ada',avatarUrl:null};
const other={id:peer,displayName:'Ben',avatarUrl:null};
const conversation={id,kind:'DIRECT',title:'Ben',role:'MEMBER',members:[{...me,role:'MEMBER'},{...other,role:'MEMBER'}],updatedAt:now,latest:null};
const access=(highWater=0,eventVisibleFrom=1)=>({id,visibleFrom:1,eventVisibleFrom,highWater});
const incoming=(key,sequence=1)=>({id:key,conversationId:id,body:'Authorized canonical message',sender:other,
  messageSequence:sequence,canAcknowledge:true,createdAt:now,attachments:[],deleted:false});
const current=()=>true;
const page=(stream,highWater,events,next=highWater,extra={})=>({
  stream,streamId:stream==='ACCOUNT'?user:id,highWater,events,next,more:next<highWater,snapshotRequired:false,...extra,
});
async function start(path=':memory:'){
  const db=openDatabase(path);
  await migrate(db,true);
  const store=new OfflineStore(db,user);
  return {store,projection:new RealtimeProjection(store)};
}
async function bootstrap(projection){
  await projection.accountSnapshot({highWater:0,memberships:[access()]},current);
  await projection.conversationSnapshot({membership:access(),conversation,messages:[],older:null},current);
}

test('version 2 data survives migration to version 3 and scope checks fence acknowledgments',async()=>{
  const db=openDatabase(':memory:');
  try{
    await migrate(db);
    await db.transaction(async(tx)=>{await tx.exec(offlineSchema);await tx.exec('PRAGMA user_version=2');});
    const store=new OfflineStore(db,user);
    await store.cacheConversations([conversation]);
    await store.saveDraft(id,{body:'Existing v2 draft',file:null});
    await migrate(db,true);
    assert.equal((await db.first('PRAGMA user_version')).user_version,3);
    assert.equal((await store.getDraft(id)).body,'Existing v2 draft');
    const projection=new RealtimeProjection(store);
    await bootstrap(projection);
    await projection.apply(page('CONVERSATION',1,[{sequence:1,type:'message.created',message:incoming(first)}]),current);
    assert.deepEqual((await projection.receipts()).map((x)=>x.desired),[1]);
    assert.equal(await projection.read(id,[first],()=>false),false);
    assert.deepEqual((await projection.receipts()).map((x)=>x.desired),[1]);
    assert.equal(await projection.read(id,[first],current),true);
    const [receipt]=await projection.receipts();
    await projection.acknowledge(receipt,'DELIVERED');
    assert.equal((await projection.receipts())[0].desired,2);
    await projection.acknowledge(receipt,'READ');
    assert.deepEqual(await projection.receipts(),[]);
  }finally{await db.close();}
});

test('SQLite rollback prevents cursor advancement across a gap or failed message write',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'chatapp-atomic-sync-'));
  t.after(()=>rm(dir,{force:true,recursive:true}));
  const path=join(dir,'scope.db');
  let {store,projection}=await start(path);
  await bootstrap(projection);
  const p=page('CONVERSATION',2,[
    {sequence:1,type:'message.created',message:incoming(first)},
    {sequence:2,type:'message.created',message:incoming(second,2)},
  ]);
  await assert.rejects(projection.apply({...p,events:p.events.slice(1)},current),/EVENT_GAP/);
  await store.db.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON messages WHEN NEW.server_id='${second}'
    BEGIN SELECT RAISE(ABORT,'injected failure'); END;`);
  await assert.rejects(projection.apply(p,current),/injected failure/);
  await store.db.close();
  ({store,projection}=await start(path));
  try{
    assert.equal((await projection.cursor('CONVERSATION',id)).cursor,0);
    assert.equal((await store.thread(id)).rows.length,0);
    assert.deepEqual(await projection.receipts(),[]);
    await store.db.exec('DROP TRIGGER fail_second');
    await projection.apply(p,current);
    await projection.apply(p,current);
    assert.equal((await projection.cursor('CONVERSATION',id)).cursor,2);
    assert.equal((await store.thread(id)).rows.length,2);
  }finally{await store.db.close();}
});

test('a notification during replay is drained without duplicate bubbles or recurring pulls',async()=>{
  const {store,projection}=await start();
  try{
    await bootstrap(projection);
    let fetches=0,receipts=0;
    let engine;
    const api={
      accountEvents:async()=>page('ACCOUNT',0,[]),
      async conversationEvents(_id,after){
        fetches++;
        if(after===0){
          engine.hint({stream:'CONVERSATION',streamId:id,highWater:2});
          engine.hint({stream:'CONVERSATION',streamId:id,highWater:1});
          return page('CONVERSATION',1,[{sequence:1,type:'message.created',message:incoming(first)}]);
        }
        return page('CONVERSATION',2,[{sequence:2,type:'message.created',message:incoming(second,2)}]);
      },
      async acknowledge(){receipts++;},
    };
    engine=new ReplayEngine(projection,api);
    engine.hint({stream:'CONVERSATION',streamId:id,highWater:1});
    const signal=new AbortController().signal;
    await engine.run(signal,current);
    await engine.run(signal,current);
    assert.equal(fetches,2);
    assert.equal(receipts,2);
    assert.equal((await store.thread(id)).rows.length,2);
    assert.equal((await projection.cursor('CONVERSATION',id)).cursor,2);
  }finally{await store.db.close();}
});

test('snapshot and revocation never drop the original queued operation or restore stale content',async()=>{
  const {store,projection}=await start();
  try{
    await bootstrap(projection);
    await store.saveDraft(id,{body:'Queued while replaying',file:null});
    const operation=randomUUID();
    await store.enqueue(id,operation,me);
    await projection.apply(page('CONVERSATION',1,[{sequence:1,type:'message.created',message:incoming(first)}]),current);
    const stale=store.membershipRevision();
    await projection.conversationSnapshot({membership:access(1002),conversation,messages:[],older:null},current);
    await store.applyHistory(id,{items:[incoming(first)],visibleFrom:1,nextCursor:null},Date.now(),conversation,stale);
    assert.deepEqual((await store.thread(id)).rows.map((row)=>row.message.id),[operation]);
    await projection.apply(page('ACCOUNT',1,[{sequence:1,type:'membership.revoked',conversationId:id,membership:null}]),current);
    const thread=await store.thread(id);
    assert.equal(thread.active,false);
    assert.equal(thread.rows[0].state,'BLOCKED_ACCESS');
    assert.equal(thread.rows[0].message.body,'Queued while replaying');
    assert.equal(await projection.cursor('CONVERSATION',id),null);
    assert.deepEqual(await projection.receipts(),[]);
  }finally{await store.db.close();}
});

test('read eligibility requires a laid-out message intersecting the current viewport',()=>{
  const bounds=new Map([
    ['hidden',{y:0,height:70}],
    ['barely',{y:90,height:30}],
    ['visible',{y:140,height:35}],
    ['below',{y:230,height:70}],
  ]);
  assert.deepEqual(visibleRows(bounds,116,100,bounds.keys()),['visible']);
  assert.deepEqual(visibleRows(bounds,116,0,bounds.keys()),[]);
});
