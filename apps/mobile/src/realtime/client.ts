import { io, type Socket } from 'socket.io-client';
import { availabilitySchema,presenceSchema,typingNoticeSchema } from '@chatapp/contracts';
import type { SessionManager } from '../auth/session-manager';
import type { MessagingApi } from '../messaging/api';
import type { RealtimeProjection } from './projection';
import { ReplayEngine } from './replay';

export type Connection='offline'|'connecting'|'replaying'|'live'|'retrying';

export class RealtimeClient {
  private readonly socket:Socket;
  private readonly engine:ReplayEngine;
  private readonly session:SessionManager;
  private readonly projection:RealtimeProjection;
  private readonly api:MessagingApi;
  private readonly eligible:()=>boolean;
  private readonly changed:()=>void;
  private state:Connection='offline';
  private controller?:AbortController;
  private retries=0;
  private timer?:ReturnType<typeof setTimeout>;
  private connection?:Promise<void>;
  private replay?:Promise<void>;
  private again=false;
  private generation=-1;
  private activeThread?:string;
  private readonly online=new Map<string,Set<string>>();
  private readonly typingUsers=new Map<string,Set<string>>();
  private typingTimer?:ReturnType<typeof setTimeout>;
  private lastTyping=0;

  constructor(session:SessionManager,api:MessagingApi,projection:RealtimeProjection,eligible:()=>boolean,changed:()=>void) {
    this.session=session;this.projection=projection;this.api=api;this.eligible=eligible;this.changed=changed;
    this.engine=new ReplayEngine(projection,api);
    this.socket=io(session.origin,{path:'/realtime',transports:['websocket'],autoConnect:false,reconnection:false,forceNew:true,timeout:10000});
    this.socket.on('connect',()=>{
      this.socket.auth={};
      this.retries=0;
      this.engine.probe();
      this.kick();
      if(this.activeThread)void this.subscribe(this.activeThread);
    });
    this.socket.on('available',(input:unknown)=>{
      const notice=availabilitySchema.safeParse(input);
      if(notice.success && this.current()) {this.engine.hint(notice.data);this.kick();}
    });
    this.socket.on('presence',(input:unknown)=>{
      const event=presenceSchema.safeParse(input);
      if(event.success && this.current() && event.data.id===this.activeThread) {
        this.online.set(event.data.id,new Set(event.data.online));
        this.changed();
      }
    });
    this.socket.on('typing',(input:unknown)=>{
      const event=typingNoticeSchema.safeParse(input);
      if(!event.success || !this.current() || event.data.id!==this.activeThread)return;
      const ids=this.typingUsers.get(event.data.id) ?? new Set<string>();
      if(event.data.active)ids.add(event.data.userId);
      else ids.delete(event.data.userId);
      this.typingUsers.set(event.data.id,ids);
      this.changed();
    });
    this.socket.on('disconnect',()=>this.disconnected());
    this.socket.on('connect_error',(error:Error)=>{
      this.socket.auth={};
      this.disconnected();
      if(error.message==='Connection refused' && this.current()) void this.session.refresh().catch(()=>undefined);
    });
  }

  status() {return this.state;}
  presence(id:string){return this.online.get(id);}
  typing(id:string){return this.typingUsers.get(id);}
  private set(state:Connection){if(this.state!==state){this.state=state;this.changed();}}
  private current=()=>Boolean(this.controller&&!this.controller.signal.aborted&&this.eligible());

  start() {
    if(!this.eligible())return;
    this.controller??=new AbortController();
    void this.connect();
  }

  tokenChanged() {
    if(this.socket.connected && this.generation!==this.session.accessGeneration()) {
      this.stop();this.start();
    }
  }

  retry() {
    if(!this.current())return this.start();
    clearTimeout(this.timer);
    this.retries=0;
    if(this.socket.connected){this.engine.probe();this.kick();}
    else void this.connect();
  }

  stop() {
    this.controller?.abort();
    delete this.controller;
    this.socket.auth={};
    this.socket.disconnect();
    clearTimeout(this.timer);
    clearTimeout(this.typingTimer);
    this.lastTyping=0;
    this.online.clear();this.typingUsers.clear();
    this.set('offline');
  }

  async close() {
    this.stop();
    this.socket.removeAllListeners();
    await this.replay?.catch(()=>undefined);
  }

  private async connect() {
    if(!this.current() || this.connection || this.socket.connected || this.socket.active)return;
    this.set('connecting');
    const signal=this.controller?.signal;
    this.connection=this.session.socketAuthentication().then(({token,generation})=>{
      if(!signal || signal.aborted || !this.current())return;
      this.generation=generation;
      this.socket.auth={token};
      this.socket.connect();
    }).catch(()=>this.schedule()).finally(()=>{delete this.connection;});
    await this.connection;
    if(signal?.aborted && this.current())void this.connect();
  }

  private disconnected() {
    this.online.clear();this.typingUsers.clear();
    if(!this.current())return;
    this.controller?.abort();
    this.controller=new AbortController();
    this.schedule();
  }

  private schedule() {
    if(!this.current())return;
    this.set('retrying');
    clearTimeout(this.timer);
    const delay=Math.min(30000,800*2**Math.min(this.retries++,6))*(0.5+Math.random()*0.5);
    this.timer=setTimeout(()=>{
      if(this.socket.connected)this.kick();
      else void this.connect();
    },delay);
  }

  private kick() {
    if(!this.socket.connected || !this.current())return;
    if(this.replay){this.again=true;return;}
    const signal=this.controller?.signal;
    if(!signal)return;
    this.set('replaying');
    this.replay=this.engine.run(signal,()=>this.current()&&this.socket.connected).then(()=>{
      if(!signal.aborted && this.current() && this.socket.connected){this.retries=0;this.set('live');}
    }).catch(()=>{if(!signal.aborted)this.schedule();}).finally(()=>{
      delete this.replay;
      if(this.again){this.again=false;this.kick();}
    });
  }

  watch(id:string) {
    this.activeThread=id;
    if(this.socket.connected)void this.subscribe(id);
    return ()=>{
      if(this.activeThread!==id)return;
      if(this.socket.connected)this.socket.emit('unwatch',id);
      delete this.activeThread;
      clearTimeout(this.typingTimer);
      this.lastTyping=0;
      this.online.delete(id);this.typingUsers.delete(id);
    };
  }

  private async subscribe(id:string) {
    const cursor=await this.projection.cursor('CONVERSATION',id).catch(()=>null);
    if(!this.current() || this.activeThread!==id || !this.socket.connected)return;
    this.socket.emit('watch',{id,after:Math.max(0,cursor?.cursor??0)});
  }

  compose(id:string,active:boolean) {
    if(!this.current() || this.activeThread!==id || !this.socket.connected)return;
    const now=Date.now();
    if(active && now-this.lastTyping>=2200){
      this.socket.emit('typing',{id,active:true});
      this.lastTyping=now;
    }
    clearTimeout(this.typingTimer);
    if(!active){this.lastTyping=0;this.socket.emit('typing',{id,active:false});}
    else this.typingTimer=setTimeout(()=>{
      this.lastTyping=0;
      if(this.current()&&this.activeThread===id&&this.socket.connected)this.socket.emit('typing',{id,active:false});
    },2800);
  }

  visible(id:string,messages:string[],foreground:()=>boolean) {
    const current=()=>this.current()&&this.activeThread===id&&foreground();
    void this.projection.read(id,messages,current).then((changed)=>{if(changed)this.kick();}).catch(()=>undefined);
  }

  async older(id:string,cursor:string) {
    const signal=this.controller?.signal;
    if(!signal || !this.current())return false;
    const snapshot=await this.api.conversationSnapshot(id,signal,cursor);
    if(!signal.aborted && this.current()){
      await this.projection.conversationSnapshot(snapshot,()=>!signal.aborted&&this.current(),true);
      this.kick();
      return true;
    }
    return false;
  }
}
