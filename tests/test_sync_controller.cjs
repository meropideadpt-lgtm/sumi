/* Subscription sync boundary: real controller/engine/transport/workspace/journal,
 * deterministic RPC responses only. SQL/RLS is tested separately in PostgreSQL. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const copy=value=>structuredClone(value),key=(kind,id)=>JSON.stringify([kind,id]);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const PROJECT='https://sync-fixture.supabase.co';
const PREFS={currency:'CNY',reminder:3,language:'zh-TW',theme:'dark',motion:'system'};
const sub=(id='legacy/subscription:one')=>({id,name:'原有訂閱',amount:12.345,currency:'USD',months:1,
 nextDate:'2026-11-30',status:'active',autoRenew:true,logo:'',category:'自訂分類',extra:{keep:true}});
const data=(...subscriptions)=>({subscriptions,payments:[],customCategories:['自訂分類']});
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}}
function locks(){const held=new Set();return {async request(name,_options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name})}finally{held.delete(name)}}}}

function server(){
 const owners=new Map(),calls=[];let hook=null,failRead=false,loseAck=false;
 const account=owner=>{if(!owners.has(owner))owners.set(owner,{rows:new Map(),receipts:new Map(),seq:0});return owners.get(owner)};
 return {calls,account,
  beforeNext(fn){hook=fn},failReads(value){failRead=value},loseNextAck(){loseAck=true},
  seed(owner,record){const state=account(owner),name=key('subscriptions',record.id),prior=state.rows.get(name);
   state.rows.set(name,{kind:'subscriptions',id:record.id,payload:copy(record),deleted:false,revision:(prior?.revision||0)+1,seq:String(++state.seq)})},
  client(actor){return {supabaseUrl:PROJECT,storage:{from(){return {upload(){throw Error('unexpected image request')},download(){throw Error('unexpected image request')}}}},
   async rpc(name,args){
    calls.push({name,args:copy(args)});if(hook){const run=hook;hook=null;await run(name,args)}
    // Only a protocol fixture, not evidence that real RLS works.
    if(!actor.id||args.p_expected_owner!==actor.id)return {error:{code:'42501'}};
    const state=account(actor.id);
    if(name==='sumi_sync_pull'){
     if(failRead)return {error:{name:'TypeError'}};
     const rows=[...state.rows.values()].filter(row=>BigInt(row.seq)>BigInt(args.p_after)).sort((a,b)=>Number(BigInt(a.seq)-BigInt(b.seq)));
     const page=rows.slice(0,args.p_limit),more=page.length<rows.length;
     return {data:{version:1,records:copy(page),cursor:more?page.at(-1).seq:String(state.seq),more}};
    }
    assert.equal(name,'sumi_sync_push');const changes=args.p_changes,body=JSON.stringify(changes),prior=state.receipts.get(args.p_operation_id);
    if(prior){assert.equal(body,prior.body,'retry must retain exact operation content');return {data:copy(prior.result)}}
    const conflicts=changes.filter(c=>(state.rows.get(key(c.kind,c.id))?.revision||0)!==c.baseRevision)
     .map(c=>({kind:c.kind,id:c.id,baseRevision:c.baseRevision,reason:'revision',remote:copy(state.rows.get(key(c.kind,c.id))||null)}));
    if(conflicts.length)return {data:{ok:false,conflicts}};
    const records=changes.map(c=>({kind:c.kind,id:c.id,payload:copy(c.payload),deleted:c.deleted,revision:c.baseRevision+1,seq:String(++state.seq)}));
    records.forEach(row=>state.rows.set(key(row.kind,row.id),row));const result={ok:true,records};state.receipts.set(args.p_operation_id,{body,result:copy(result)});
    if(loseAck){loseAck=false;return {error:{name:'TypeError'}}}
    return {data:copy(result)};
   }};
  }
 };
}

async function device(t,remote,{owner=A,local=memory(),lockService=locks(),seed,guest=false}={}){
 const actor={id:owner},client=remote.client(actor),navigator={onLine:true,locks:lockService},window=new EventTarget(),document=new EventTarget();
 let busy=false,reloads=0,authCalls=0;const applied=[],downloads=[];
 const scope=vm.createContext({URL,structuredClone,crypto:globalThis.crypto,console,navigator,window,document,queueMicrotask,
  setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},location:{reload(){reloads++}},
  SumiAccess:{async syncClient(){authCalls++;if(actor.id!==owner)throw Error('sync-auth');return client},assertSyncIdentity(){if(actor.id!==owner)throw Error('sync-auth');return {id:owner}}}});
 for(const file of ['workspace.js','data-store.js','sync-lock.js','sync-engine.js','sync-transport.js','sync-controller.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),scope,{filename:file});
 const api=vm.runInContext('({workspace:SumiWorkspace,data:SumiData,lock:SumiSyncLock,sync:SumiSync,controller:SumiSyncController})',scope);
 const workspace=api.workspace.create({local,tab:memory(),config:{url:PROJECT}});
 const identity=workspace.activate(guest?api.workspace.guest():api.workspace.identity(PROJECT,owner));await api.lock.claim(identity);
 const raw=workspace.storage();if(seed){raw.setItem('sumi-data-v1',JSON.stringify(seed,null,2));raw.setItem('sumi-prefs-v1',JSON.stringify(PREFS,null,2))}
 const storage=api.data.open(raw,guest?{}:{metadataKey:'sumi-sync-v1',
  canWrite:()=>api.lock.canWrite(Boolean(JSON.parse(raw.getItem('sumi-sync-v1')||'null')?.enabled)),
  prepareMeta:({data,preferences,metadata,nextData,nextPreferences})=>api.sync.prepareWrite(data,preferences,nextData,nextPreferences,metadata)});
 const controller=api.controller.create({storage,workspace,isBusy:()=>busy,
  logoStore:{async resolve(){return null},async save(){throw Error('unexpected image save')},async hydrateBackup(value){return value}},
  onApply:snapshot=>applied.push(copy(snapshot)),download:(value,name)=>downloads.push({value:copy(value),name})});
 const close=async()=>{controller.stop();api.lock.release();await new Promise(setImmediate)};t.after(close);
 return {controller,raw,local,workspace,navigator,actor,applied,downloads,close,
  snapshot:()=>copy(storage.snapshot()),get reloads(){return reloads},get authCalls(){return authCalls},set busy(value){busy=value},
  write(change){const current=storage.snapshot();change(current.data);storage.write(current.data,current.preferences)},
  async enable(mode='upload'){const preview=await controller.actions.inspect();return controller.actions[mode](preview.id)}};
}

test('guest and disabled account stay local without private reads or sync metadata',async t=>{
 const remote=server(),local=memory();const guest=await device(t,remote,{guest:true,local,seed:data(sub('guest'))});
 guest.controller.start();guest.write(d=>d.subscriptions[0].amount=20);assert.equal(guest.controller.model().guest,true);
 const guestBytes=local.getItem('sumi-data-v1'),account=await device(t,remote,{local});account.controller.start();account.write(d=>d.subscriptions.push(sub()));
 await new Promise(setImmediate);assert.equal(remote.calls.length,0);assert.equal(account.authCalls,0);
 assert.equal(account.raw.getItem('sumi-sync-v1'),null);assert.equal(local.getItem('sumi-data-v1'),guestBytes);
 await assert.rejects(guest.controller.actions.inspect(),/sync-unavailable/);
});

test('explicit upload reads back original IDs and a second device restores without changing cloud',async t=>{
 const remote=server(),original=data(sub());original.payments=[{id:'old-payment',subscriptionId:sub().id,name:'原付款',amount:12.345,currency:'USD',date:'2026-10-25',note:'保留'}];
 const desktop=await device(t,remote,{seed:original}),before=desktop.raw.getItem('sumi-data-v1');
 const preview=await desktop.controller.actions.inspect();assert.equal(preview.localCounts.subscriptions,1);assert.equal(preview.cloudCounts.subscriptions,0);
 assert.equal(desktop.raw.getItem('sumi-data-v1'),before);assert.equal(remote.account(A).rows.size,0);
 await desktop.controller.actions.upload(preview.id);assert.equal(desktop.controller.model().status,'synced');assert.equal(desktop.controller.model().pending,0);
 const pushes=remote.calls.filter(c=>c.name==='sumi_sync_push').length;
 assert.equal(remote.calls.at(-1).name,'sumi_sync_pull');assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).payload.id,sub().id);
 const tablet=await device(t,remote);await tablet.enable('restore');assert.deepEqual(tablet.snapshot().data,desktop.snapshot().data);
 assert.deepEqual(tablet.snapshot().data.payments[0],desktop.snapshot().data.payments[0]);assert.equal(tablet.snapshot().data.subscriptions[0].amount,12.345);
 assert.equal(remote.calls.filter(c=>c.name==='sumi_sync_push').length,pushes);
 tablet.write(d=>d.subscriptions[0].name='iPad 修改');await tablet.controller.actions.retry();await desktop.controller.actions.retry();
 assert.equal(desktop.snapshot().data.subscriptions[0].name,'iPad 修改');assert.equal(desktop.snapshot().data.subscriptions[0].id,sub().id);
});

test('empty-device upload merges existing cloud records and never infers a deletion',async t=>{
 const remote=server();remote.seed(A,sub());const empty=await device(t,remote);await empty.enable('upload');
 assert.equal(empty.snapshot().data.subscriptions[0].id,sub().id);assert.equal(empty.controller.model().status,'synced');
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).deleted,false);
 assert.ok(remote.calls.filter(c=>c.name==='sumi_sync_push').every(c=>c.args.p_changes.every(change=>!change.deleted)));
});

test('first restore retains an exportable local backup and rolls back all keys on quota failure',async t=>{
 const remote=server();remote.seed(A,sub('cloud'));const local=memory(),d=await device(t,remote,{local,seed:data(sub('local'))});
 const preview=await d.controller.actions.inspect(),before=new Map(local.map),set=local.setItem;let fail=true;
 local.setItem=(key,value)=>{if(key.endsWith('sumi-sync-v1')&&fail){fail=false;throw Error('quota')}set(key,value)};
 await assert.rejects(d.controller.actions.restore(preview.id),/保存失败/);assert.deepEqual(local.map,before);
 assert.equal(d.snapshot().data.subscriptions[0].id,'local');assert.equal(d.snapshot().metadata,null);
 await d.controller.actions.restore(preview.id);assert.equal(d.snapshot().data.subscriptions[0].id,'cloud');
 assert.equal(d.snapshot().metadata.backup.data.subscriptions[0].id,'local');await d.controller.actions.exportBackup();
 assert.equal(d.downloads[0].value.data.subscriptions[0].id,'local');assert.equal(d.downloads[0].value.preferences.language,'zh-TW');
 assert.equal(remote.calls.filter(c=>c.name==='sumi_sync_push').length,0);
});

test('offline operation survives reopening and lost ACK retry does not duplicate or increment twice',async t=>{
 const remote=server(),local=memory(),first=await device(t,remote,{local,seed:data(sub())});await first.enable();
 first.navigator.onLine=false;first.write(d=>d.subscriptions[0].amount=35.123);await first.controller.actions.retry();
 assert.equal(first.controller.model().status,'offline');const operation=first.snapshot().metadata.outbox[0].id;await first.close();
 const reopened=await device(t,remote,{local});remote.loseNextAck();await reopened.controller.actions.retry();
 assert.equal(reopened.controller.model().pending,1);assert.equal(reopened.snapshot().metadata.outbox[0].id,operation);
 await reopened.controller.actions.retry();assert.equal(reopened.controller.model().pending,0);
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).revision,2);
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).payload.amount,35.123);
 const retries=remote.calls.filter(c=>c.args.p_operation_id===operation);assert.equal(retries.length,2);assert.deepEqual(retries[0].args,retries[1].args);
});

test('a newer amount creates an explicit conflict and a deleted record is never silently resurrected',async t=>{
 const remote=server(),a=await device(t,remote,{seed:data(sub())});await a.enable();const b=await device(t,remote);await b.enable('restore');
 b.navigator.onLine=false;b.write(d=>d.subscriptions[0].amount=99);a.write(d=>d.subscriptions[0].amount=50);await a.controller.actions.retry();
 b.navigator.onLine=true;await b.controller.actions.retry();const conflict=b.controller.model().conflicts[0];
 assert.equal(b.controller.model().status,'conflict');assert.equal(conflict.records[0].local.amount,99);assert.equal(conflict.records[0].remote.amount,50);
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).payload.amount,50);
 await b.controller.actions.resolve(conflict.id,'remote');assert.equal(b.snapshot().data.subscriptions[0].amount,50);
 b.navigator.onLine=false;b.write(d=>d.subscriptions[0].amount=77);a.write(d=>d.subscriptions=[]);await a.controller.actions.retry();
 b.navigator.onLine=true;await b.controller.actions.retry();assert.equal(b.controller.model().status,'conflict');
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).deleted,true);assert.equal(b.snapshot().data.subscriptions[0].amount,77);
});

test('a successful upload is still pending until a separate server readback succeeds',async t=>{
 const remote=server(),d=await device(t,remote,{seed:data(sub())});await d.enable();d.write(value=>value.subscriptions[0].amount=70);
 const operation=d.snapshot().metadata.outbox[0].id;
 remote.beforeNext(()=>remote.beforeNext(()=>remote.failReads(true)));
 await d.controller.actions.retry();assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).payload.amount,70);
 assert.equal(d.controller.model().pending,1);assert.equal(d.snapshot().metadata.outbox[0].id,operation);
 remote.failReads(false);await d.controller.actions.retry();assert.equal(d.controller.model().pending,0);
 assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).revision,2);
});

test('changing cloud data after preview rejects restore and cancel removes a stale controller error',async t=>{
 const remote=server();remote.seed(A,sub('cloud'));const d=await device(t,remote,{seed:data(sub('local'))});const before=new Map(d.local.map);
 const preview=await d.controller.actions.inspect();remote.seed(A,{...sub('cloud'),amount:88});
 await assert.rejects(d.controller.actions.restore(preview.id),/sync-preview-stale/);assert.deepEqual(d.local.map,before);
 assert.equal(d.controller.model().error,'sync-preview-stale');d.controller.actions.cancelPreview();
 assert.equal(d.controller.model().preview,null);assert.equal(d.controller.model().error,null);
 await assert.rejects(d.controller.actions.restore(preview.id),/sync-preview-stale/);
});

test('account mismatch inside an SDK request cannot write another account or discard the outbox',async t=>{
 const remote=server(),a=await device(t,remote,{seed:data(sub())});await a.enable();a.write(d=>d.subscriptions[0].amount=60);
 const pending=a.snapshot().metadata.outbox[0].id;remote.beforeNext(()=>{a.actor.id=B});await a.controller.actions.retry();
 assert.equal(a.controller.model().status,'error');assert.equal(a.snapshot().metadata.outbox[0].id,pending);assert.equal(a.snapshot().data.subscriptions[0].amount,60);
 assert.equal(remote.account(B).rows.size,0);assert.equal(remote.account(A).rows.get(key('subscriptions',sub().id)).payload.amount,12.345);
 const b=await device(t,remote,{owner:B,local:a.local});const preview=await b.controller.actions.inspect();
 assert.equal(preview.cloudCounts.subscriptions,0);assert.equal(preview.localCounts.subscriptions,0);
});

test('an unsaved draft or local write during a restore prevents replacing the current local data',async t=>{
 const remote=server();remote.seed(A,sub('cloud'));const d=await device(t,remote,{seed:data(sub('local'))});
 const preview=await d.controller.actions.inspect();d.busy=true;await assert.rejects(d.controller.actions.restore(preview.id),/sync-busy/);d.busy=false;
 remote.beforeNext(()=>{d.write(value=>value.subscriptions[0].amount=19)});
 await assert.rejects(d.controller.actions.restore(preview.id),/sync-local-changed/);
 assert.equal(d.snapshot().data.subscriptions[0].id,'local');assert.equal(d.snapshot().data.subscriptions[0].amount,19);assert.equal(d.snapshot().metadata,null);
});

test('a second account tab cannot write the first tab journal, and unsupported locks keep local use',async t=>{
 const remote=server(),local=memory(),lockService=locks(),a=await device(t,remote,{local,lockService,seed:data(sub())});await a.enable();
 const b=await device(t,remote,{local,lockService}),before=new Map(local.map);assert.equal(b.controller.model().error,'sync-other-tab');
 assert.throws(()=>b.write(d=>d.subscriptions[0].amount=500),/sync-other-tab/);await assert.rejects(b.controller.actions.inspect(),/sync-other-tab/);
 assert.deepEqual(local.map,before);assert.equal(b.reloads,0);
 const unsupported=await device(t,remote,{lockService:null});unsupported.write(d=>d.subscriptions.push(sub()));
 await assert.rejects(unsupported.controller.actions.inspect(),/sync-lock-unavailable/);assert.equal(unsupported.snapshot().data.subscriptions.length,1);
 assert.equal(unsupported.snapshot().metadata,null);
});
