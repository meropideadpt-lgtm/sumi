const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../exchange.js');
const CLOCK = Date.parse('2026-10-22T10:00:00Z');
const catalogue = {EUR:'Euro',CNY:'Chinese Renminbi Yuan',USD:'United States Dollar',JPY:'Japanese Yen',HKD:'Hong Kong Dollar',GBP:'British Pound',KRW:'South Korean Won'};
const payload = () => ({amount:1,base:'EUR',date:'2026-10-21',rates:{CNY:7.8,USD:1.1,JPY:160,HKD:8.6,GBP:.85,KRW:1500}});
const snapshot = (overrides={}) => ({version:1,...fx.validateLatest(payload(),CLOCK),fetchedAt:new Date(CLOCK).toISOString(),currencies:{...catalogue},missingCurrencies:[],...overrides});
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => ({ok:true,status:200,json:async()=>clone(value)});
function memory(raw={}) {
  const values = new Map(Object.entries(raw));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
const fetchRates = (latest=payload(), currencies=catalogue) => async url => response(url.endsWith('/currencies')?currencies:latest);

test('v1 EUR response adds its mathematical base without inventing unsupported quotes',()=>{
  const got=fx.validateLatest(payload(),CLOCK);
  assert.equal(got.rates.EUR,1);
  assert.equal(Object.hasOwn(got.rates,'TWD'),false);
  assert.equal(got.rates.CNY,7.8);
  const missingAmount=payload();delete missingAmount.amount;
  assert.throws(()=>fx.validateLatest(missingAmount,CLOCK),/金额无效/);
});

test('rejects malformed, future, wrong-base and non-unit latest responses',()=>{
  const cases=[null,[],{}, {...payload(),base:'USD'}, {...payload(),amount:10}, {...payload(),date:'2026-02-31'}, {...payload(),date:'2026-10-23'}, {...payload(),rates:{}}, {...payload(),rates:{USD:0}}, {...payload(),rates:{USD:-1}}, {...payload(),rates:{USD:Infinity}}, {...payload(),rates:{USD:'1.2'}}, {...payload(),rates:{EUR:2,USD:1.1}}, {...payload(),rates:{'<script>':1}}];
  for(const value of cases)assert.throws(()=>fx.validateLatest(value,CLOCK));
});

test('catalogue is dynamic and has validated currency labels',()=>{
  assert.deepEqual(fx.validateCurrencies(catalogue),catalogue);
  for(const bad of [null,[],{}, {EUR:''}, {EUR:'Euro',twd:'Taiwan'}, {EUR:'Euro',USD:1}])assert.throws(()=>fx.validateCurrencies(bad));
  assert.equal(fx.supported('USD',snapshot()),true);
  assert.equal(fx.supported('TWD',snapshot()),false);
  assert.equal(fx.supported('TWD',null),null);
});

test('partial valid coverage is explicit while invalid or unknown-only caches are rejected',()=>{
  const missing=snapshot();delete missing.rates.KRW;
  const checked=fx.validateSnapshot(missing,CLOCK);
  assert.deepEqual(checked.missingCurrencies,['KRW']);assert.equal(fx.supported('KRW',checked),false);assert.equal(fx.quote(1,'KRW','CNY',checked).amount,null);
  const extra=snapshot();extra.rates.TWD=35;
  assert.equal(Object.hasOwn(fx.validateSnapshot(extra,CLOCK).rates,'TWD'),false);
  assert.throws(()=>fx.validateSnapshot({...snapshot(),rates:{TWD:35}},CLOCK),/缺少可用/);
  assert.throws(()=>fx.validateSnapshot(snapshot({fetchedAt:'not-a-date'}),CLOCK));
  assert.throws(()=>fx.validateSnapshot(snapshot({fetchedAt:'2026-10-23T00:00:00Z'}),CLOCK));
});

test('impossible cached chronology is rejected without overwriting raw cache',async()=>{
  const invalid=snapshot({date:'2026-10-21',fetchedAt:'2026-10-20T10:00:00Z'});
  assert.throws(()=>fx.validateSnapshot(invalid,CLOCK),/晚于获取时间/);
  const raw=JSON.stringify(invalid),storage=memory({[fx.CACHE_KEY]:raw});
  const manager=fx.createManager({storage,now:()=>CLOCK,fetcher:async()=>{throw Error('offline')}});
  assert.equal(manager.getState().snapshot,null);assert.ok(manager.getState().cacheWarning);
  await manager.refresh();assert.equal(storage.getItem(fx.CACHE_KEY),raw);
  const goodRaw=JSON.stringify(snapshot()),lastGood=memory({[fx.CACHE_KEY]:goodRaw});
  const refreshed=fx.createManager({storage:lastGood,now:()=>CLOCK,fetcher:fetchRates({...payload(),date:'2026-10-23'})});
  await refreshed.refresh({force:true});assert.equal(lastGood.getItem(fx.CACHE_KEY),goodRaw);
});

test('conversion uses cross rates and target currency minor units',()=>{
  const before=snapshot(), raw=clone(before);
  const usd=fx.quote(11,'USD','CNY',before);
  assert.equal(usd.rate,7.8/1.1);assert.equal(usd.amount,78);
  assert.equal(fx.quote(1,'USD','JPY',before).amount,145);
  assert.equal(fx.quote(1,'USD','KRW',before).amount,1364);
  assert.equal(fx.round(1.005,'USD'),1.01);
  assert.deepEqual(before,raw);
});

test('same currency identity is exact even without rates and preserves legacy decimals',()=>{
  assert.deepEqual(fx.quote(3.123,'CNY','CNY',null),{available:true,amount:3.123,rawAmount:3.123,rate:1,reason:null});
  const identity=fx.freeze(3.123,'TWD','TWD',snapshot(),new Date(CLOCK).toISOString());
  assert.equal(identity.provider,'identity');assert.equal(identity.date,null);assert.equal(identity.fetchedAt,null);
  assert.equal(identity.convertedAmount,3.123);assert.deepEqual(identity.rates,{TWD:1});
});

test('unsupported currencies, invalid amounts and overflow are explicitly unavailable',()=>{
  for(const [value,from,to,snap] of [[20,'TWD','CNY',snapshot()],[20,'USD','TWD',snapshot()],[20,'USD','CNY',null],[-1,'USD','CNY',snapshot()],[Infinity,'USD','CNY',snapshot()],[9e13,'EUR','CNY',snapshot()]]){
    const result=fx.quote(value,from,to,snap);assert.equal(result.available,false);assert.equal(result.amount,null);assert.equal(result.rate,null);assert.ok(result.reason);
  }
});

test('successful refresh persists only a complete validated cache',async()=>{
  const storage=memory(),calls=[];
  const manager=fx.createManager({storage,now:()=>CLOCK,fetcher:async(url,options)=>{calls.push({url,options});return fetchRates()(url)}});
  assert.equal(manager.getState().cacheState,'empty');
  const state=await manager.refresh();
  assert.equal(calls.length,2);assert.equal(state.cacheState,'fresh');assert.equal(state.loading,false);assert.equal(state.error,null);
  assert.equal(state.snapshot.date,'2026-10-21');assert.equal(state.snapshot.fetchedAt,new Date(CLOCK).toISOString());
  assert.deepEqual(JSON.parse(storage.getItem(fx.CACHE_KEY)),state.snapshot);
  assert.ok(calls.every(call=>call.options.signal instanceof AbortSignal));
});

test('24 hour boundary refreshes, with fresh-cache and in-flight request deduplication',async()=>{
  let now=CLOCK,calls=0;
  const storage=memory({[fx.CACHE_KEY]:JSON.stringify(snapshot())});
  const manager=fx.createManager({storage,now:()=>now,fetcher:async url=>{calls++;return fetchRates()(url)}});
  await manager.refresh();assert.equal(calls,0);
  now+=fx.DAY-1;await manager.refresh();assert.equal(calls,0);
  now++;const first=manager.refresh(),second=manager.refresh({force:true});assert.equal(first,second);
  await first;assert.equal(calls,2);assert.equal(manager.getState().cacheState,'fresh');
  await manager.refresh();assert.equal(calls,2);
});

test('manual refresh bypasses TTL but concurrent manual presses share one request',async()=>{
  let finish,calls=0;
  const gate=new Promise(resolve=>finish=resolve);
  const manager=fx.createManager({storage:memory({[fx.CACHE_KEY]:JSON.stringify(snapshot())}),now:()=>CLOCK,fetcher:async url=>{calls++;await gate;return fetchRates()(url)}});
  const first=manager.refresh({force:true}),second=manager.refresh({force:true});assert.equal(first,second);assert.equal(calls,2);
  finish();await first;assert.equal(manager.getState().error,null);
});

test('network failure retains stale cache and throttles automatic retries for five minutes',async()=>{
  let now=CLOCK,calls=0;
  const old=snapshot({fetchedAt:new Date(CLOCK-fx.DAY-1000).toISOString()});
  const raw=JSON.stringify(old),storage=memory({[fx.CACHE_KEY]:raw});
  const manager=fx.createManager({storage,now:()=>now,fetcher:async()=>{calls++;throw Error('offline')}});
  const state=await manager.refresh();assert.equal(state.cacheState,'stale');assert.match(state.error,/offline/);assert.deepEqual(state.snapshot,old);assert.equal(storage.getItem(fx.CACHE_KEY),raw);
  await manager.refresh();assert.equal(calls,2);
  now+=fx.RETRY_DELAY;await manager.refresh();assert.equal(calls,4);
});

test('HTTP, JSON and invalid-currency failures never replace last successful cache',async()=>{
  const failures=[async()=>({ok:false,status:503}),async()=>({ok:true,status:200,json:async()=>{throw Error('invalid JSON')}}),fetchRates({...payload(),rates:{USD:0}},catalogue)];
  for(const fetcher of failures){
    const raw=JSON.stringify(snapshot()),storage=memory({[fx.CACHE_KEY]:raw});
    const manager=fx.createManager({storage,fetcher,now:()=>CLOCK});
    const state=await manager.refresh({force:true});assert.ok(state.error);assert.equal(storage.getItem(fx.CACHE_KEY),raw);assert.deepEqual(state.snapshot,snapshot());
  }
});

test('a valid partial API response exposes missing coverage without fabricated fallback rates',async()=>{
  const latest=payload();delete latest.rates.KRW;
  const manager=fx.createManager({storage:memory(),now:()=>CLOCK,fetcher:fetchRates(latest)});
  const state=await manager.refresh();assert.equal(state.error,null);assert.match(state.coverageWarning,/KRW/);
  assert.equal(state.snapshot.rates.KRW,undefined);assert.equal(fx.quote(10,'KRW','CNY',state.snapshot).amount,null);
  assert.equal(fx.quote(11,'USD','CNY',state.snapshot).amount,78);
});

test('corrupt cache is preserved until valid successful fetch, never passed off as current',async()=>{
  const storage=memory({[fx.CACHE_KEY]:'{broken'});
  const manager=fx.createManager({storage,now:()=>CLOCK,fetcher:async()=>{throw Error('offline')}});
  assert.equal(manager.getState().cacheState,'empty');assert.ok(manager.getState().cacheWarning);
  await manager.refresh();assert.equal(storage.getItem(fx.CACHE_KEY),'{broken');assert.equal(manager.getState().snapshot,null);
  const repaired=fx.createManager({storage,now:()=>CLOCK,fetcher:fetchRates()});await repaired.refresh();assert.equal(repaired.getState().cacheWarning,null);assert.equal(repaired.getState().cacheState,'fresh');
});

test('storage failures leave successful rates usable in memory with an honest cache warning',async()=>{
  const storage={getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('quota')}};
  const manager=fx.createManager({storage,now:()=>CLOCK,fetcher:fetchRates()});
  const state=await manager.refresh();assert.ok(state.snapshot);assert.equal(state.error,null);assert.match(state.cacheWarning,/保存失败/);
  assert.equal(fx.quote(11,'USD','CNY',state.snapshot).amount,78);
});

test('aborted timeout preserves cache and releases the loading state',async()=>{
  const manager=fx.createManager({storage:memory(),now:()=>CLOCK,timeoutMs:5,fetcher:(_url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true}))});
  const state=await manager.refresh();assert.equal(state.loading,false);assert.match(state.error,/超时/);assert.equal(state.snapshot,null);
});

test('freeze captures immutable confirmation rates and later currency switching uses that matrix',()=>{
  const old=snapshot(), frozen=fx.freeze(11,'USD','CNY',old,new Date(CLOCK).toISOString());
  const paid={amount:11,currency:'USD',status:'succeeded',fxSnapshot:frozen};
  old.rates.CNY=99;old.rates.JPY=999;
  assert.equal(frozen.sourceAmount,11);assert.equal(frozen.rate,7.8/1.1);assert.equal(frozen.convertedAmount,78);
  assert.equal(fx.valuePayment(paid,'CNY').amount,78);assert.equal(fx.valuePayment(paid,'JPY').amount,1600);
  assert.equal(fx.valuePayment(paid,'TWD').amount,null);
});

test('impossible future snapshot chronology is not frozen as an available historical quote',()=>{
  const confirmedAt=new Date(CLOCK).toISOString();
  for(const invalid of [snapshot({date:'2026-10-23'}),snapshot({fetchedAt:'2026-10-22T11:00:00Z'}),snapshot({date:'2026-10-21',fetchedAt:'2026-10-20T10:00:00Z'})]){
    const frozen=fx.freeze(11,'USD','CNY',invalid,confirmedAt);
    assert.equal(frozen.status,'unavailable');assert.equal(frozen.rate,null);assert.equal(frozen.convertedAmount,null);
  }
});

test('failed, legacy and unavailable historical values are not recalculated using latest rates',()=>{
  const legacy={amount:11,currency:'USD'};
  assert.equal(fx.valuePayment(legacy,'USD').amount,11);assert.equal(fx.valuePayment(legacy,'CNY').amount,null);
  const missing=fx.freeze(11,'TWD','CNY',snapshot(),new Date(CLOCK).toISOString());
  assert.equal(missing.status,'unavailable');assert.equal(missing.convertedAmount,null);assert.equal(missing.rate,null);
  assert.equal(fx.valuePayment({amount:11,currency:'TWD',fxSnapshot:missing},'CNY').amount,null);
  assert.equal(fx.valuePayment({...legacy,status:'failed'},'USD').amount,null);
  assert.equal(fx.valuePayment({...legacy,amount:12,fxSnapshot:fx.freeze(11,'USD','CNY',snapshot(),new Date(CLOCK).toISOString())},'CNY').amount,null);
});

test('financial edits revise only against frozen old rates, while unrelated edits preserve the snapshot',()=>{
  const payment={amount:11,currency:'USD',fxSnapshot:fx.freeze(11,'USD','CNY',snapshot(),new Date(CLOCK).toISOString())};
  const before=clone(payment);
  assert.deepEqual(fx.revise(payment,11,'USD'),payment.fxSnapshot);
  const revised=fx.revise(payment,22,'USD');assert.equal(revised.convertedAmount,156);assert.equal(revised.confirmedAt,payment.fxSnapshot.confirmedAt);assert.equal(revised.date,'2026-10-21');
  const switched=fx.revise(payment,10,'EUR');assert.equal(switched.convertedAmount,78);
  assert.equal(fx.revise(payment,10,'TWD').status,'unavailable');
  assert.equal(fx.revise({amount:11,currency:'USD'},12,'USD'),undefined);
  assert.deepEqual(payment,before);
});

test('external state readers and observers cannot mutate cached rates',async()=>{
  const manager=fx.createManager({storage:memory(),now:()=>CLOCK,fetcher:fetchRates(),onChange:state=>{if(state.snapshot)state.snapshot.rates.CNY=99}});
  await manager.refresh();const state=manager.getState();state.snapshot.rates.CNY=200;
  assert.equal(manager.getState().snapshot.rates.CNY,7.8);
});
