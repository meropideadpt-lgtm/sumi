const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Sync=require('../sync-engine.js');
const Data=vm.runInNewContext(fs.readFileSync(require.resolve('../data-store.js'),'utf8')+';SumiData',{URL,Intl,Date,Number});
const copy=value=>structuredClone(value),key=(kind,id)=>JSON.stringify([kind,id]);
let serial=0;const id=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
const now=()=> '2026-10-25T12:00:00.000Z';
const prefs=()=>({language:'zh-CN',theme:'light',currency:'CNY',reminder:3,motion:'system'});
const sub=(recordId='service')=>({id:recordId,name:'Original service',amount:12.25,currency:'USD',months:1,nextDate:'2026-11-30',status:'active',autoRenew:true,logo:'',category:'我的类别',extra:{keep:true}});
const payment=(recordId='payment')=>({id:recordId,subscriptionId:'service',name:'Original payment',amount:12.25,currency:'USD',date:'2026-10-25',status:'succeeded',cycleDate:'2026-11-30',advancesSchedule:true,fxSnapshot:{version:1,status:'available',provider:'identity',sourceCurrency:'USD',sourceAmount:12.25,displayCurrency:'USD',base:'USD',rate:1,convertedAmount:12.25,date:null,fetchedAt:null,confirmedAt:now(),rates:{USD:1},reason:null}});
function cloud(){
 let seq=0;const rows={},receipts=new Map(),calls=[];let loseAck=false,beforePush=null,readFailure=false;
 return {
  rows,calls,receipts,
  loseNextAck(){loseAck=true},failReads(value){readFailure=value},beforePush(fn){beforePush=fn},
  async pull({after='0',limit=500}){
   calls.push(['pull',after]);if(readFailure)throw Error('network');
   const list=Object.values(rows).filter(row=>BigInt(row.seq)>BigInt(after)).sort((a,b)=>Number(BigInt(a.seq)-BigInt(b.seq)));
   const result=list.slice(0,limit),more=list.length>limit;
   return {version:1,cursor:more?result.at(-1).seq:String(seq),more,records:copy(result)};
  },
  async push({operationId,changes}){
   calls.push(['push',operationId,copy(changes)]);
   const body=Sync.signature(changes);
   if(receipts.has(operationId)){const prior=receipts.get(operationId);if(prior.body!==body)throw Error('operation-payload-changed');return copy(prior.result)}
   if(beforePush){const hook=beforePush;beforePush=null;await hook()}
   const conflicts=changes.filter(change=>(rows[key(change.kind,change.id)]?.revision||0)!==change.baseRevision).map(change=>({kind:change.kind,id:change.id,baseRevision:change.baseRevision,remote:copy(rows[key(change.kind,change.id)]||null),reason:'revision'}));
   if(conflicts.length)return {ok:false,conflicts};
   const next=copy(rows);
   for(const change of changes)next[key(change.kind,change.id)]={...copy(change),revision:change.baseRevision+1,seq:'1'};
   const cycles=new Map();
   for(const row of Object.values(next).filter(row=>row.kind==='payments'&&!row.deleted&&row.payload.status!=='failed'&&row.payload.cycleDate)){
    const cycle=key(row.payload.subscriptionId,row.payload.cycleDate),other=cycles.get(cycle);
    if(other){const changed=changes.find(change=>change.kind==='payments'&&(change.id===row.id||change.id===other.id));const remote=rows[key('payments',changed.id===row.id?other.id:row.id)];return {ok:false,conflicts:[{kind:'payments',id:changed.id,baseRevision:changed.baseRevision,remote:copy(remote),reason:'paid-cycle'}]}}
    cycles.set(cycle,row);
   }
   const changed=[];
   for(const change of changes){const row={kind:change.kind,id:change.id,payload:copy(change.payload),deleted:change.deleted,revision:change.baseRevision+1,seq:String(++seq)};rows[key(row.kind,row.id)]=row;changed.push(row)}
   const result={ok:true,records:copy(changed)};receipts.set(operationId,{body,result:copy(result)});
   if(loseAck){loseAck=false;throw Error('lost-ack')}
   return result;
  },
  async change(kind,recordId,payload,deleted=false){return this.push({operationId:id(),changes:[{kind,id:recordId,payload,deleted,baseRevision:rows[key(kind,recordId)]?.revision||0}]})},
 };
}
function device(server,{data={subscriptions:[],payments:[]},preferences=prefs(),state=null,transport={},validate=true}={}){
 let current={data:copy(data),preferences:copy(preferences),state:copy(state)},online=true,locked=false,busy=false,failCommit=false;
 const notices=[];
 const value={get snapshot(){return copy(current)},set snapshot(next){current=copy(next)},set online(next){online=next},set locked(next){locked=next},set busy(next){busy=next},set failCommit(next){failCommit=next},notices,
  write(change,prefChange){const previous=copy(current),next=copy(current);change?.(next.data);prefChange?.(next.preferences);if(validate)Data.backup({version:1,data:next.data,preferences:next.preferences});next.state=Sync.prepareWrite(previous.data,previous.preferences,next.data,next.preferences,previous.state,{id,now});current=next},
 };
 value.manager=Sync.create({read:()=>copy(current),commit:(next,expected)=>{if(failCommit)throw Error('quota');assert.equal(Sync.signature(current),Sync.signature(expected),'CAS prevents stale writes');current=copy(next)},transport:{pull:args=>server.pull(args),push:args=>server.push(args),...transport},validate:validate?snapshot=>Data.backup(snapshot):snapshot=>snapshot,isBusy:()=>busy,isLocked:()=>locked,online:()=>online,onChange:state=>notices.push(state),id,now});
 value.enable=async(mode='upload')=>{const p=await value.manager.preview();return value.manager.enable(mode,p.id)};
 return value;
}

test('record mapping retains IDs, orphan history, extensions, categories and exact frozen rates',()=>{
 const data={subscriptions:[sub()],payments:[payment()],costHistory:[{id:'old',subscriptionId:'deleted-service',extra:'legacy'}],extension:{'__proto__':'text',nested:[1,2]},categories:['我的类别']};
 const mapped=Sync.records(data,{...prefs(),customPreference:{unchanged:true}});
 assert.deepEqual(mapped[key('payments','payment')].payload.fxSnapshot,payment().fxSnapshot);
 assert.equal(mapped[key('costHistory','old')].payload.subscriptionId,'deleted-service');
 assert.deepEqual(mapped[key('extensions','categories')].payload.value,['我的类别']);
 assert.deepEqual(mapped[key('preferences','customPreference')].payload.value,{unchanged:true});
 assert.equal(mapped[key('preferences','motion')],undefined);
 assert.equal(data.subscriptions[0].id,'service');
});

test('disabled writes never create sync metadata or contact cloud',async()=>{
 const server=cloud(),d=device(server);d.write(data=>data.subscriptions.push(sub()));assert.equal(d.snapshot.state,null);
 await d.manager.run();assert.equal(server.calls.length,0);
 await d.enable();assert.equal(d.manager.getState().status,'synced');assert.equal(server.rows[key('subscriptions','service')].payload.id,'service');
});

test('desktop upload, tablet restore and edit preserve IDs, custom fields, history and local motion',async()=>{
 const server=cloud(),desktop=device(server,{data:{subscriptions:[sub()],payments:[payment()],extension:{future:true}},preferences:{...prefs(),theme:'dark',language:'ja-JP',motion:'reduce'}});
 await desktop.enable();assert.equal(desktop.manager.getState().pending,0);
 const tablet=device(server);const p=await tablet.manager.preview();assert.equal(p.cloudCounts.subscriptions,1);assert.equal(p.cloudCounts.payments,1);
 await tablet.manager.enable('restore',p.id);assert.equal(tablet.snapshot.preferences.language,'ja-JP');assert.equal(tablet.snapshot.preferences.motion,'system');
 assert.deepEqual(tablet.snapshot.data.extension,{future:true});assert.deepEqual(tablet.snapshot.data.payments[0].fxSnapshot,payment().fxSnapshot);
 tablet.write(data=>{data.subscriptions[0].name='Tablet edit'});await tablet.manager.run();await desktop.manager.run();
 assert.equal(desktop.snapshot.data.subscriptions[0].name,'Tablet edit');assert.equal(desktop.snapshot.preferences.motion,'reduce');
});

test('offline first run is resumable and outbox survives reopening without duplicate operations',async()=>{
 const server=cloud(),phone=device(server,{data:{subscriptions:[sub()],payments:[]}});await phone.enable();
 phone.online=false;phone.write(data=>{data.subscriptions[0].amount=19});await phone.manager.run();assert.equal(phone.manager.getState().status,'offline');
 const opId=phone.snapshot.state.outbox[0].id;
 const reopened=device(server,phone.snapshot);await reopened.manager.run();assert.equal(reopened.manager.getState().status,'synced');
 assert.equal(server.calls.filter(call=>call[0]==='push'&&call[1]===opId).length,1);assert.equal(server.rows[key('subscriptions','service')].payload.amount,19);
 phone.online=true;await phone.manager.run();assert.equal(phone.manager.getState().pending,0);
});

test('a lost ACK replays identical wire operation ID and clears only after server readback',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=29});
 const op=d.snapshot.state.outbox[0].id;server.loseNextAck();await d.manager.run();assert.equal(d.manager.getState().status,'error');assert.equal(d.manager.getState().pending,1);
 await d.manager.run();assert.equal(d.manager.getState().status,'synced');
 const pushes=server.calls.filter(call=>call[0]==='push'&&call[1]===op);assert.equal(pushes.length,2);assert.deepEqual(pushes[0][2],pushes[1][2]);
 assert.equal(server.rows[key('subscriptions','service')].revision,2);
});

test('offline local edit never resurrects a remote deletion without explicit conflict resolution',async()=>{
 const server=cloud(),a=device(server,{data:{subscriptions:[sub()],payments:[]}});await a.enable();const b=device(server);await b.enable('restore');
 b.online=false;b.write(data=>{data.subscriptions[0].amount=40});a.write(data=>{data.subscriptions=[]});await a.manager.run();b.online=true;await b.manager.run();
 assert.equal(b.manager.getState().status,'conflict');assert.equal(b.snapshot.data.subscriptions[0].amount,40);assert.equal(server.rows[key('subscriptions','service')].deleted,true);
 await b.manager.resolve(b.manager.getState().conflicts[0].id,'remote');assert.equal(b.snapshot.data.subscriptions.length,0);assert.equal(b.manager.getState().pending,0);
 await a.manager.run();assert.equal(a.snapshot.data.subscriptions.length,0);
});

test('same payment concurrent edit keeps both versions and its coupled renewal date',async()=>{
 const server=cloud(),a=device(server,{data:{subscriptions:[sub()],payments:[payment()]}});await a.enable();const b=device(server);await b.enable('restore');
 a.write(data=>{data.payments[0].note='A';data.subscriptions[0].nextDate='2026-12-30'});
 b.write(data=>{data.payments[0].note='B';data.subscriptions[0].nextDate='2027-01-30'});
 await a.manager.run();await b.manager.run();assert.equal(b.manager.getState().status,'conflict');
 const conflict=b.manager.getState().conflicts[0];assert.equal(conflict.records.find(row=>row.kind==='payments').local.note,'B');assert.equal(conflict.records.find(row=>row.kind==='payments').remote.note,'A');
 assert.equal(server.rows[key('subscriptions','service')].payload.nextDate,'2026-12-30');
 await b.manager.resolve(conflict.id,'local');await a.manager.run();assert.equal(a.snapshot.data.payments[0].note,'B');assert.equal(a.snapshot.data.subscriptions[0].nextDate,'2027-01-30');assert.deepEqual(a.snapshot.data.payments[0].fxSnapshot,payment().fxSnapshot);
});

test('new device choosing upload with empty records never deletes existing cloud records',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[payment()]}});await owner.enable();const empty=device(server);await empty.enable('upload');
 assert.equal(empty.snapshot.data.subscriptions.length,1);assert.equal(empty.snapshot.data.payments.length,1);assert.equal(server.rows[key('subscriptions','service')].deleted,false);
 assert.equal(server.calls.filter(call=>call[0]==='push').length,1);
});

test('first restore atomically retains an immutable local backup and does not upload it',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();
 const local={subscriptions:[{...sub('local-only'),name:'Keep this backup'}],payments:[],custom:'old'};
 const d=device(server,{data:local});await d.enable('restore');assert.deepEqual(d.snapshot.state.backup.data,local);assert.equal(d.snapshot.data.subscriptions[0].id,'service');
 assert.equal(Object.values(server.rows).some(row=>row.id==='local-only'),false);
 d.write(data=>{data.subscriptions[0].name='New'});await d.manager.run();assert.deepEqual(d.snapshot.state.backup.data,local);
});

test('preview is read-only and stale local or cloud state requires fresh confirmation',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});const before=d.snapshot,p=await d.manager.preview();assert.deepEqual(d.snapshot,before);
 d.write(data=>{data.subscriptions[0].name='Changed after preview'});await assert.rejects(d.manager.enable('upload',p.id),/preview-stale/);assert.equal(d.snapshot.state,null);
 const next=await d.manager.preview();await server.change('subscriptions','remote',sub('remote'));await assert.rejects(d.manager.enable('restore',next.id),/preview-stale/);assert.equal(d.snapshot.state,null);
});

test('persistent commit failure preserves outbox and cursor for replay',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=54});const pending=d.snapshot;
 d.failCommit=true;await d.manager.run();assert.equal(d.manager.getState().status,'error');assert.deepEqual(d.snapshot,pending);
 d.failCommit=false;await d.manager.run();assert.equal(d.manager.getState().status,'synced');assert.equal(server.rows[key('subscriptions','service')].payload.amount,54);
});

test('network read failure after commit retains operation until a verified read succeeds',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=59});
 server.beforePush(()=>{server.failReads(true)});await d.manager.run();assert.equal(d.manager.getState().pending,1);assert.equal(d.manager.getState().status,'error');
 server.failReads(false);await d.manager.run();assert.equal(d.manager.getState().pending,0);assert.equal(server.rows[key('subscriptions','service')].revision,2);
});

test('new local edits while a request waits are not overwritten and preserve causal dependencies',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=60});
 server.beforePush(()=>{d.write(data=>{data.subscriptions[0].amount=61})});await d.manager.run();
 assert.equal(d.snapshot.data.subscriptions[0].amount,61);assert.equal(server.rows[key('subscriptions','service')].payload.amount,61);assert.equal(d.manager.getState().pending,0);
});

test('asset canonicalization preserves financial fields and inline fallback does not enqueue loops',async()=>{
 const server=cloud(),hash='sumi-logo:'+'a'.repeat(64),inline='data:image/png;base64,AAAA';let uploads=0;
 const hooks={beforePush:async changes=>{uploads++;return changes.map(change=>change.kind==='subscriptions'&&!change.deleted?{...change,payload:{...change.payload,logo:hash}}:change)},beforeApply:async data=>({...data,subscriptions:data.subscriptions.map(row=>row.logo===hash?{...row,logo:inline}:row)})};
 const a=device(server,{data:{subscriptions:[{...sub(),logo:inline}],payments:[payment()]},transport:hooks});await a.enable();assert.equal(a.manager.getState().pending,0);assert.equal(server.rows[key('subscriptions','service')].payload.logo,hash);
 const b=device(server,{transport:hooks});await b.enable('restore');assert.equal(b.snapshot.data.subscriptions[0].logo,inline);
 const before=server.calls.filter(call=>call[0]==='push').length;b.write(()=>{},p=>{p.motion='reduce'});await b.manager.run();assert.equal(server.calls.filter(call=>call[0]==='push').length,before);
 b.write(data=>{data.subscriptions[0].name='Renamed'});await b.manager.run();assert.equal(server.rows[key('subscriptions','service')].payload.logo,hash);assert.deepEqual(server.rows[key('payments','payment')].payload.fxSnapshot,payment().fxSnapshot);assert.ok(uploads>=2);
});

test('duplicate successful payment with another ID becomes a visible unforceable conflict',async()=>{
 const server=cloud(),a=device(server,{data:{subscriptions:[sub()],payments:[]}});await a.enable();const b=device(server);await b.enable('restore');
 a.write(data=>data.payments.push(payment('from-a')));b.write(data=>data.payments.push(payment('from-b')));await a.manager.run();await b.manager.run();
 const conflict=b.manager.getState().conflicts[0];assert.equal(conflict.reason,'paid-cycle');assert.equal(b.snapshot.data.payments.length,1);assert.equal(b.snapshot.data.payments[0].id,'from-b');
 await assert.rejects(b.manager.resolve(conflict.id,'local'),/requires-edit/);await b.manager.resolve(conflict.id,'remote');assert.equal(b.snapshot.data.payments.length,1);assert.equal(b.snapshot.data.payments[0].id,'from-a');
});

test('busy or locked workspaces do not commit remote data and resume without stuck promises',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();await server.change('subscriptions','service',{...sub(),name:'Remote'});
 d.busy=true;await d.manager.run();assert.equal(d.snapshot.data.subscriptions[0].name,'Original service');d.busy=false;d.locked=true;await d.manager.run();assert.equal(d.manager.getState().status,'paused');
 d.locked=false;await d.manager.run();assert.equal(d.snapshot.data.subscriptions[0].name,'Remote');
});

test('corrupt metadata and malformed/backwards server cursors fail closed',async()=>{
 const invalid=Sync.initialState({deviceId:id()});invalid.cursor='-1';assert.throws(()=>Sync.validateState(invalid),/invalid-state/);
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]},transport:{pull:async()=>({version:1,cursor:'0',more:true,records:[]})}});
 await assert.rejects(d.manager.preview(),/invalid-response/);assert.equal(d.snapshot.state,null);assert.equal(d.snapshot.data.subscriptions.length,1);
});

test('first upload exposes a cross-ID paid-cycle conflict without materializing invalid duplicates',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[payment('cloud-paid')]}});await owner.enable();
 const newcomer=device(server,{data:{subscriptions:[sub()],payments:[payment('local-paid')]}});await newcomer.enable('upload');
 assert.equal(newcomer.manager.getState().status,'conflict');const conflict=newcomer.manager.getState().conflicts[0];assert.equal(conflict.reason,'paid-cycle');
 assert.equal(newcomer.snapshot.data.payments.length,1);assert.equal(newcomer.snapshot.data.payments[0].id,'local-paid');assert.equal(server.rows[key('payments','local-paid')],undefined);
 await newcomer.manager.resolve(conflict.id,'remote');assert.deepEqual(newcomer.snapshot.data.payments.map(row=>row.id),['cloud-paid']);assert.equal(newcomer.snapshot.state.backup.data.payments[0].id,'local-paid');
});

test('initial same-ID differences require explicit choice and retain the initial backup',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();
 const local=device(server,{data:{subscriptions:[{...sub(),amount:33}],payments:[],onlyLocalExtension:{x:1}}});await local.enable('upload');
 assert.equal(local.manager.getState().status,'conflict');assert.equal(server.rows[key('subscriptions','service')].payload.amount,12.25);
 await local.manager.resolve(local.manager.getState().conflicts[0].id,'remote');assert.equal(local.snapshot.data.subscriptions[0].amount,12.25);
 assert.equal(Object.hasOwn(local.snapshot.data,'onlyLocalExtension'),false);assert.equal(local.snapshot.state.backup.data.onlyLocalExtension.x,1);
});

test('remote family deletion conflicts with an offline new payment instead of silently deleting it',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();const phone=device(server);await phone.enable('restore');
 phone.write(data=>data.payments.push(payment('offline-new')));owner.write(data=>{data.subscriptions=[]});await owner.manager.run();await phone.manager.run();
 const conflict=phone.manager.getState().conflicts[0];assert.equal(conflict.reason,'parent-deleted');assert.equal(phone.snapshot.data.payments[0].id,'offline-new');
 await assert.rejects(phone.manager.resolve(conflict.id,'local'),/requires-edit/);await phone.manager.resolve(conflict.id,'remote');assert.equal(phone.snapshot.data.subscriptions.length,0);assert.equal(phone.snapshot.data.payments.length,0);
});

test('new remote dependent payment blocks an offline subscription deletion until the user resolves',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();const phone=device(server);await phone.enable('restore');
 phone.write(data=>{data.subscriptions=[]});owner.write(data=>data.payments.push(payment('new-remote')));await owner.manager.run();await phone.manager.run();
 const conflict=phone.manager.getState().conflicts[0];assert.equal(conflict.reason,'dependent-records');assert.equal(phone.snapshot.data.subscriptions.length,0);
 await phone.manager.resolve(conflict.id,'remote');assert.equal(phone.snapshot.data.subscriptions.length,1);assert.equal(phone.snapshot.data.payments[0].id,'new-remote');
});

test('pull pagination advances cursors and merges all records while preserving tombstones',async()=>{
 const server=cloud(),rows=Array.from({length:750},(_,n)=>({...sub('s'+n),name:'Subscription '+n}));
 await server.push({operationId:id(),changes:rows.map(payload=>({kind:'subscriptions',id:payload.id,payload,deleted:false,baseRevision:0}))});
 await server.change('subscriptions','s42',null,true);
 const d=device(server);await d.enable('restore');assert.equal(d.snapshot.data.subscriptions.length,749);assert.equal(d.snapshot.data.subscriptions.some(row=>row.id==='s42'),false);
 assert.equal(d.snapshot.state.base[key('subscriptions','s42')].deleted,true);assert.ok(server.calls.some(call=>call[0]==='pull'&&call[1]!=='0'));
});

test('image download failure and large initial upload keep the original local snapshot intact',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();
 const d=device(server,{data:{subscriptions:[sub('old-local')],payments:[]},transport:{beforeApply:async()=>{throw Error('image-failed')}}});const before=d.snapshot;
 const p=await d.manager.preview();await assert.rejects(d.manager.enable('restore',p.id),/image-failed/);assert.deepEqual(d.snapshot,before);
 const big=device(cloud(),{data:{subscriptions:Array.from({length:1001},(_,n)=>sub('id-'+n)),payments:[]}}),original=big.snapshot;
 await assert.rejects(big.enable('upload'),/too-large/);assert.deepEqual(big.snapshot,original);
});

test('a form opened during readback defers commit and preserves pending financial changes',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=88});
 server.beforePush(()=>{d.busy=true});await d.manager.run();assert.equal(d.snapshot.data.subscriptions[0].amount,88);assert.equal(d.manager.getState().pending,1);assert.equal(d.manager.getState().status,'paused');
 d.busy=false;await d.manager.run();assert.equal(d.manager.getState().pending,0);assert.equal(server.rows[key('subscriptions','service')].revision,2);
});

test('failed initialization commit cannot create an enabled workspace or discard its data',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}}),before=d.snapshot;d.failCommit=true;
 await assert.rejects(d.enable('upload'),/quota/);assert.deepEqual(d.snapshot,before);assert.equal(server.calls.filter(call=>call[0]==='push').length,0);
});

test('remote resolution includes later edits to a related tombstoned parent and cannot resurrect it',async()=>{
 const server=cloud(),owner=device(server,{data:{subscriptions:[sub()],payments:[]}});await owner.enable();const phone=device(server);await phone.enable('restore');
 phone.write(data=>data.payments.push({...payment('new'),cycleDate:undefined,advancesSchedule:false}));owner.write(data=>{data.subscriptions=[]});await owner.manager.run();await phone.manager.run();
 const conflict=phone.manager.getState().conflicts[0];assert.equal(conflict.reason,'parent-deleted');
 phone.write(data=>{data.subscriptions[0].name='Later unsynced parent edit'});
 assert.equal(phone.snapshot.state.conflicts[0].operationIds.length,2);
 await phone.manager.resolve(conflict.id,'remote');assert.equal(phone.snapshot.data.subscriptions.length,0);assert.equal(phone.snapshot.data.payments.length,0);assert.equal(phone.manager.getState().pending,0);assert.equal(server.rows[key('subscriptions','service')].deleted,true);
});

test('conflict choice never overwrites a newer unseen financial version',async()=>{
 const server=cloud(),a=device(server,{data:{subscriptions:[sub()],payments:[payment()]}});await a.enable();const b=device(server);await b.enable('restore');
 a.write(data=>{data.payments[0].note='A first'});b.write(data=>{data.payments[0].note='B local'});await a.manager.run();await b.manager.run();const conflict=b.manager.getState().conflicts[0];
 a.write(data=>{data.payments[0].note='A second unseen'});await a.manager.run();
 await assert.rejects(b.manager.resolve(conflict.id,'local'),/conflict-changed/);assert.equal(server.rows[key('payments','payment')].payload.note,'A second unseen');assert.equal(b.snapshot.data.payments[0].note,'B local');
 await b.manager.resolve(conflict.id,'local');assert.equal(server.rows[key('payments','payment')].payload.note,'B local');
});

test('tampered durable wire payload cannot change amounts or IDs during replay',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}});await d.enable();d.write(data=>{data.subscriptions[0].amount=70});server.loseNextAck();await d.manager.run();
 const stored=d.snapshot;stored.state.outbox[0].wire[0].payload.amount=700;
 assert.throws(()=>Sync.validateState(stored.state),/invalid-state/);
 const broken=device(server,stored);const count=server.calls.length;await broken.manager.run();assert.equal(broken.manager.getState().status,'error');assert.equal(server.calls.length,count);assert.equal(server.rows[key('subscriptions','service')].payload.amount,70);
});

test('cancel preview clears only the review state and invalidates its confirmation ID',async()=>{
 const server=cloud(),d=device(server,{data:{subscriptions:[sub()],payments:[]}}),before=d.snapshot;
 const preview=await d.manager.preview();assert.ok(d.manager.getState().preview);assert.equal(d.manager.cancelPreview(),true);
 assert.equal(d.manager.getState().preview,null);assert.deepEqual(d.snapshot,before);
 await assert.rejects(d.manager.enable('upload',preview.id),/preview-stale/);
});

test('shared currency changes never reprice frozen FX or discard orphan cost history and custom categories',async()=>{
 const server=cloud(),paid=payment();const rate=7.8/1.1;
 paid.fxSnapshot={version:1,status:'available',provider:'frankfurter',sourceCurrency:'USD',sourceAmount:paid.amount,displayCurrency:'CNY',base:'EUR',rate,convertedAmount:Math.round((paid.amount*rate+Number.EPSILON)*100)/100,date:'2026-10-24',fetchedAt:'2026-10-24T12:00:00Z',confirmedAt:now(),rates:{EUR:1,USD:1.1,CNY:7.8},reason:null};
 const history={id:'old-cost',subscriptionId:'already-deleted',name:'Old plan',category:'自定义类别',amount:18,currency:'JPY',months:12,status:'deleted',kind:'deleted',effectiveDate:'2026-10-20',observedAt:'2026-10-20T12:00:00Z',extension:{original:true}};
 const a=device(server,{data:{subscriptions:[sub()],payments:[paid],costHistory:[history],categories:['自定义类别'],extension:{nested:{keep:['all',7]}}}});await a.enable();
 const b=device(server);await b.enable('restore');b.write(null,p=>{p.currency='JPY';p.language='en';p.theme='dark'});await b.manager.run();await a.manager.run();
 assert.equal(a.snapshot.preferences.currency,'JPY');assert.deepEqual(a.snapshot.data.payments[0].fxSnapshot,paid.fxSnapshot);assert.deepEqual(b.snapshot.data.costHistory,[history]);assert.deepEqual(b.snapshot.data.categories,['自定义类别']);assert.deepEqual(b.snapshot.data.extension,{nested:{keep:['all',7]}});
});
