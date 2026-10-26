const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={URL};vm.runInNewContext(fs.readFileSync('data-store.js','utf8')+';globalThis.api=SumiData;',context);const api=context.api;
const DATA='sumi-data-v1',PREF='sumi-prefs-v1',META='sumi-sync-v1',JOURNAL='sumi-write-journal-v1';
const data={subscriptions:[{id:'legacy-id',name:'Old subscription',amount:3.123,currency:'USD',months:1,nextDate:'2026-10-31',status:'active',autoRenew:true,logo:'',custom:{keep:true}}],payments:[],customCategories:['My own category']};
const prefs={currency:'CNY',reminder:3,theme:'light',language:'zh-CN',motion:'system'};
const copy=value=>JSON.parse(JSON.stringify(value));
function memory(values={}){const map=new Map(Object.entries(values));return{map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}}
function seeded(){return memory({[DATA]:JSON.stringify(data,null,2),[PREF]:JSON.stringify(prefs,null,2),[META]:JSON.stringify({version:1,outbox:[]})})}
const options={metadataKey:META,prepareMeta:({metadata,nextData})=>({...metadata,outbox:[{operationId:'persistent-operation',name:nextData.subscriptions[0]?.name}]})};

test('sync sidecar and financial change persist in one recoverable write',()=>{
 const storage=seeded(),opened=api.open(storage,options),next=copy(data);next.subscriptions[0].amount=25;
 opened.write(next,prefs);assert.equal(JSON.parse(storage.getItem(DATA)).subscriptions[0].amount,25);
 assert.equal(JSON.parse(storage.getItem(META)).outbox[0].operationId,'persistent-operation');assert.equal(storage.getItem(JOURNAL),null);
 assert.equal(opened.snapshot().data.subscriptions[0].amount,25);
});
test('failure writing the outbox rolls back business and preferences byte for byte',()=>{
 const storage=seeded(),before=[DATA,PREF,META].map(key=>storage.getItem(key)),set=storage.setItem;let reject=true;
 storage.setItem=(key,value)=>{if(key===META&&reject){reject=false;throw Error('quota')}set(key,value)};
 const opened=api.open(storage,options),next=copy(data);next.subscriptions[0].amount=25;
 assert.throws(()=>opened.write(next,{...prefs,theme:'dark'}),/保存失败/);
 assert.deepEqual([DATA,PREF,META].map(key=>storage.getItem(key)),before);assert.equal(storage.getItem(JOURNAL),null);
});
test('interrupted sync write restores all three keys including original outbox',()=>{
 const storage=seeded(),previous=Object.fromEntries([DATA,PREF,META].map(key=>[key,storage.getItem(key)]));
 storage.setItem(JOURNAL,JSON.stringify(previous));storage.setItem(DATA,'{"subscriptions":[],"payments":[]}');storage.setItem(META,'{"version":1,"outbox":[{"id":"uncommitted"}]}');
 const opened=api.open(storage,options);assert.equal(opened.issues.length,0);
 for(const key of [DATA,PREF,META])assert.equal(storage.getItem(key),previous[key]);assert.equal(storage.getItem(JOURNAL),null);
});
test('legacy two-key journal recovery never deletes an existing sync sidecar',()=>{
 const storage=seeded(),metadata=storage.getItem(META);storage.setItem(JOURNAL,JSON.stringify({[DATA]:storage.getItem(DATA),[PREF]:storage.getItem(PREF)}));
 api.open(storage,options);assert.equal(storage.getItem(META),metadata);
});
test('another tab updating just sync cursor blocks stale business writes',()=>{
 const storage=seeded(),opened=api.open(storage,options),before=storage.getItem(DATA);
 storage.setItem(META,'{"version":1,"cursor":"9"}');const next=copy(data);next.subscriptions[0].amount=99;
 assert.throws(()=>opened.write(next,prefs),/其他页面/);assert.equal(storage.getItem(DATA),before);
});
test('cursor-only commits retain original legacy business and preference bytes',()=>{
 const storage=seeded(),opened=api.open(storage,options),before=[storage.getItem(DATA),storage.getItem(PREF)];
 opened.writeSnapshot(opened.data,opened.preferences,{version:1,cursor:'7',outbox:[]});
 assert.deepEqual([storage.getItem(DATA),storage.getItem(PREF)],before);assert.equal(opened.snapshot().metadata.cursor,'7');
});
test('guest writes have no sidecar reads or writes',()=>{
 const storage=memory({[DATA]:JSON.stringify(data)}),get=storage.getItem,set=storage.setItem;
 storage.getItem=key=>{assert.notEqual(key,META);return get(key)};storage.setItem=(key,value)=>{assert.notEqual(key,META);set(key,value)};
 const opened=api.open(storage);opened.writePreferences({...prefs,theme:'dark'});assert.equal(storage.map.has(META),false);
});
test('invalid sidecar is preserved and blocks writes rather than dropping pending operations',()=>{
 const storage=seeded();storage.setItem(META,'not-json');const before=storage.getItem(DATA),opened=api.open(storage,options);
 assert.ok(opened.issues.includes('sync-invalid-state'));assert.throws(()=>opened.write(data,prefs));assert.equal(storage.getItem(DATA),before);assert.equal(storage.getItem(META),'not-json');
});
test('metadata preparation failures leave no journal or partially saved record',()=>{
 const storage=seeded(),before=storage.getItem(DATA),opened=api.open(storage,{metadataKey:META,prepareMeta(){throw Error('invalid pending queue')}});
 assert.throws(()=>opened.write(data,prefs),/invalid pending/);assert.equal(storage.getItem(DATA),before);assert.equal(storage.getItem(JOURNAL),null);
});
test('first enable preserves backup and metadata atomically or retains original workspace',()=>{
 const storage=seeded(),opened=api.open(storage,options),backup=copy(data),next={subscriptions:[],payments:[]};
 const old=storage.getItem(DATA),set=storage.setItem;let once=true;storage.setItem=(key,value)=>{if(key===META&&once){once=false;throw Error('quota')}set(key,value)};
 assert.throws(()=>opened.writeSnapshot(next,prefs,{version:1,backup:{data:backup,preferences:prefs},enabled:true}),/保存失败/);assert.equal(storage.getItem(DATA),old);
 opened.writeSnapshot(next,prefs,{version:1,backup:{data:backup,preferences:prefs},enabled:true});assert.deepEqual(copy(opened.snapshot().metadata.backup.data),data);
});
test('a second sync tab cannot roll back another writer pending journal',()=>{
 const storage=seeded(),previous=Object.fromEntries([DATA,PREF,META].map(key=>[key,storage.getItem(key)]));storage.setItem(JOURNAL,JSON.stringify(previous));
 storage.setItem(DATA,'{"subscriptions":[],"payments":[]}');const current=storage.getItem(DATA);
 const opened=api.open(storage,{...options,canWrite:()=>false});assert.ok(opened.issues.length);assert.equal(storage.getItem(DATA),current);assert.notEqual(storage.getItem(JOURNAL),null);
 assert.equal(opened.rawBackup().raw[DATA],previous[DATA]);assert.throws(()=>opened.write(data,prefs),/sync-other-tab/);
});
