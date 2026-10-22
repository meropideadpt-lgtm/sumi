const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {URL};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data-store.js'), 'utf8') + '\nglobalThis.api = SumiData;', context);
const api = context.api;
const clone = value => JSON.parse(JSON.stringify(value));
const sub = overrides => ({id:'subscription', name:'阅读会员', amount:28, currency:'CNY', months:1,
  nextDate:'2026-01-31', status:'active', autoRenew:true, logo:'', ...overrides});
const paid = overrides => ({id:'payment', subscriptionId:'subscription', name:'阅读会员', amount:28,
  currency:'CNY', date:'2026-02-01', cycleDate:'2026-01-31', ...overrides});
const backup = (payments = [], subscriptions = [sub()]) => ({version:1, data:{subscriptions, payments}});
const check = value => clone(api.backup(value));
function memory(raw) {
  const values = new Map(Object.entries(raw));
  const mutations = [];
  return {values, mutations, getItem:key => values.get(key) ?? null,
    setItem(key,value){mutations.push([key,value]); values.set(key,value)},
    removeItem(key){mutations.push([key]); values.delete(key)}};
}

test('version-one subscriptions and manual payments stay readable without new fields', () => {
  const record = paid({amount:3.123}); delete record.cycleDate;
  const old = backup([record]);
  old.data.subscriptions[0].legacyExtension = {note:'保留'};
  old.data.payments[0].legacyPaymentNote = '历史信息';
  const result = check(old);
  assert.deepEqual(result.data, old.data);
  assert.equal(Object.hasOwn(result.data.subscriptions[0], 'billingAnchor'), false);
  assert.equal(Object.hasOwn(result.data.payments[0], 'status'), false);
  assert.equal(Object.hasOwn(result.data.payments[0], 'advancesSchedule'), false);
  assert.equal(Object.hasOwn(result.data.payments[0], 'scheduleArchived'), false);
});

test('startup never rewrites valid old localStorage strings', () => {
  const original = JSON.stringify(backup([paid()]).data, null, 2);
  const storage = memory({'sumi-data-v1':original});
  const loaded = api.open(storage);
  assert.equal(loaded.issues.length, 0);
  assert.equal(storage.getItem('sumi-data-v1'), original);
  assert.deepEqual(storage.mutations, []);
});

test('anchored monthly dates allow clamping then return to the original day', () => {
  for (const nextDate of ['2026-01-31', '2026-02-28', '2026-03-31', '2025-12-31']) {
    assert.equal(api.subscription(sub({billingAnchor:'2026-01-31',nextDate})).nextDate, nextDate);
  }
  assert.equal(api.subscription(sub({billingAnchor:'2026-01-30',nextDate:'2026-02-28'})).nextDate,'2026-02-28');
  assert.throws(() => api.subscription(sub({billingAnchor:'2026-01-31',nextDate:'2026-03-28'})), /锚点不一致/);
});

test('quarterly and annual anchors enforce month spacing and leap-day clamping', () => {
  assert.equal(api.subscription(sub({months:3,billingAnchor:'2026-01-31',nextDate:'2026-04-30'})).nextDate,'2026-04-30');
  assert.throws(() => api.subscription(sub({months:3,billingAnchor:'2026-01-31',nextDate:'2026-02-28'})), /锚点不一致/);
  for (const nextDate of ['2023-02-28','2025-02-28','2028-02-29']) {
    assert.equal(api.subscription(sub({months:12,billingAnchor:'2024-02-29',nextDate})).nextDate,nextDate);
  }
  assert.throws(() => api.subscription(sub({months:12,billingAnchor:'2024-02-29',nextDate:'2028-02-28'})), /锚点不一致/);
});

test('anchor is an actual ISO calendar date, including low years', () => {
  for (const billingAnchor of ['2026-02-31','2026-13-01','not-a-date',null,42,'<img src=x onerror=alert(1)>']) {
    assert.throws(() => api.subscription(sub({billingAnchor})), /锚点无效/);
  }
  assert.equal(api.subscription(sub({billingAnchor:'0001-01-31',nextDate:'0001-02-28'})).nextDate,'0001-02-28');
});

test('new succeeded and failed payment history round-trips all attributes', () => {
  const entries = [paid({status:'failed',advancesSchedule:false}),paid({id:'second',status:'succeeded',advancesSchedule:true})];
  const value = backup(entries, [sub({billingAnchor:'2026-01-31'})]);
  assert.deepEqual(check(value).data,value.data);
});

test('invalid payment status and schedule marker are rejected before import', () => {
  for (const status of ['', 'success', 'pending', 'javascript:alert(1)', null, true]) {
    assert.throws(() => check(backup([paid({status})])), /付款状态无效/);
  }
  for (const advancesSchedule of ['', 'true', 1, null]) {
    assert.throws(() => check(backup([paid({advancesSchedule})])), /付款账期标记无效/);
  }
  const missingCycle = paid({advancesSchedule:true}); delete missingCycle.cycleDate;
  assert.throws(() => check(backup([missingCycle])), /必须关联账期日期/);
});

test('duplicate successful cycles are rejected even when one entry is legacy', () => {
  assert.throws(() => check(backup([paid(),paid({id:'second',status:'succeeded'})])), /已记录成功付款/);
  assert.throws(() => check(backup([paid({status:'succeeded'}),paid({id:'second'})])), /已记录成功付款/);
});

test('failed attempts can repeat and do not block a later successful cycle', () => {
  const entries = [paid({status:'failed'}),paid({id:'retry',status:'failed'}),paid({id:'success',status:'succeeded'})];
  assert.equal(check(backup(entries)).data.payments.length,3);
});

test('unattached legacy payments and identical dates for different subscriptions remain valid', () => {
  const unattached = paid(); delete unattached.cycleDate;
  const entries = [unattached,{...unattached,id:'manual-second'},paid({id:'third'}),paid({id:'fourth',subscriptionId:'other'})];
  assert.equal(check(backup(entries)).data.payments.length,4);
});

test('local duplicate successful history is protected rather than silently rewritten', () => {
  const duplicate = backup([paid(),paid({id:'duplicate',status:'succeeded'})]).data;
  const original = JSON.stringify(duplicate);
  const storage = memory({'sumi-data-v1':original});
  const loaded = api.open(storage);
  assert.equal(loaded.data.subscriptions.length,1);
  assert.equal(loaded.data.payments.length,1);
  assert.equal(loaded.issues.length,1);
  assert.equal(loaded.rawBackup().raw['sumi-data-v1'],original);
  assert.throws(() => loaded.write(loaded.data,loaded.preferences), /暂停写入/);
  assert.equal(storage.getItem('sumi-data-v1'),original);
  assert.deepEqual(storage.mutations,[]);
});

test('invalid imported billing metadata never touches existing stored records', () => {
  const original = JSON.stringify(backup([paid()]).data);
  const storage = memory({'sumi-data-v1':original});
  const loaded = api.open(storage);
  const invalid = backup([paid({status:'failed'}),paid({id:'success',status:'broken'})]);
  assert.throws(() => {
    const incoming = api.backup(invalid);
    loaded.write(incoming.data,incoming.preferences,true);
  },/付款状态无效/);
  assert.equal(storage.getItem('sumi-data-v1'),original);
  assert.deepEqual(storage.mutations,[]);
});


test('archived schedule entries retain original history without affecting a replacement plan', () => {
  const entries = [
    paid({status:'succeeded',advancesSchedule:false,scheduleArchived:true}),
    paid({id:'failed-old',status:'failed',advancesSchedule:false,scheduleArchived:true}),
    paid({id:'new-payment',cycleDate:'2026-03-15',status:'succeeded',advancesSchedule:true,scheduleArchived:false})
  ];
  const value = backup(entries,[sub({nextDate:'2026-04-15',billingAnchor:'2026-03-15'})]);
  assert.deepEqual(check(value).data,value.data);
  const original = JSON.stringify(value.data, null, 2);
  const storage = memory({'sumi-data-v1':original});
  const loaded = api.open(storage);
  assert.equal(loaded.issues.length,0);
  assert.equal(storage.getItem('sumi-data-v1'),original);
  assert.deepEqual(storage.mutations,[]);
});

test('archived schedule marker requires a boolean and a detached linked cycle', () => {
  for (const scheduleArchived of ['', 'true', 1, null]) {
    assert.throws(() => check(backup([paid({scheduleArchived})])), /历史账期标记无效/);
  }
  assert.throws(() => check(backup([paid({scheduleArchived:true,advancesSchedule:true})])), /不能推进当前账期/);
  assert.throws(() => check(backup([paid({scheduleArchived:true})])), /不能推进当前账期/);
  const missingCycle = paid({scheduleArchived:true,advancesSchedule:false});delete missingCycle.cycleDate;
  assert.throws(() => check(backup([missingCycle])), /必须保留日期/);
  assert.equal(check(backup([paid({scheduleArchived:false})])).data.payments[0].scheduleArchived,false);
});

const revision = overrides => ({id:'revision',subscriptionId:'subscription',name:'阅读会员',category:'影音娱乐',
  amount:28,currency:'CNY',months:1,status:'active',effectiveDate:'2026-01-31',
  observedAt:'2026-01-31T04:00:00.000Z',kind:'baseline',...overrides});
const frozen = overrides => ({version:1,status:'available',provider:'frankfurter',sourceCurrency:'USD',sourceAmount:10,
  displayCurrency:'CNY',base:'EUR',rate:8/1.1,convertedAmount:72.73,date:'2026-01-30',
  fetchedAt:'2026-01-31T01:00:00.000Z',confirmedAt:'2026-02-01T02:00:00.000Z',
  rates:{EUR:1,CNY:8,USD:1.1,JPY:160},reason:null,...overrides});

test('currency syntax accepts API catalog extensions and preserves unsupported legacy originals', () => {
  for (const currency of ['CNY','USD','JPY','HKD','TWD','EUR','GBP','KRW','AUD','CHF','XYZ']) {
    const value=backup([paid({currency})],[sub({currency})]);
    value.preferences={currency};
    const checked=check(value);
    assert.equal(checked.data.subscriptions[0].currency,currency);
    assert.equal(checked.data.payments[0].currency,currency);
    assert.equal(checked.preferences.currency,currency);
  }
  for (const currency of ['usd','US','USDD','<X>',' USD','12A',null,1]) {
    assert.throws(()=>check(backup([],[sub({currency})])),/币种无效/);
    assert.throws(()=>check(backup([paid({currency})])),/币种无效/);
    assert.throws(()=>check({...backup(),preferences:{currency}}),/偏好设置无效/);
  }
});

test('subscription categories are optional, bounded text and never auto-added at startup', () => {
  assert.equal(Object.hasOwn(check(backup()).data.subscriptions[0],'category'),false);
  assert.equal(check(backup([],[sub({category:'自定义分类'})])).data.subscriptions[0].category,'自定义分类');
  for (const category of ['', '   ', 'x'.repeat(31),null,42,{}]) {
    assert.throws(()=>check(backup([],[sub({category})])),/类别无效/);
  }
});

test('cost history round-trips all revisions and extensions without rewriting old records', () => {
  const value=backup([paid()]);
  value.data.costHistory=[revision({extra:{keep:true}}),revision({id:'changed',kind:'changed',amount:36,effectiveDate:'2026-02-01'}),
    revision({id:'deleted',kind:'deleted',status:'deleted',effectiveDate:'2026-03-01'})];
  assert.deepEqual(check(value).data,value.data);
  const original=JSON.stringify(value.data,null,2), storage=memory({'sumi-data-v1':original});
  const loaded=api.open(storage);
  assert.equal(loaded.issues.length,0);
  assert.equal(storage.getItem('sumi-data-v1'),original);
  assert.deepEqual(storage.mutations,[]);
  assert.equal(Object.hasOwn(check(backup()).data,'costHistory'),false);
});

test('invalid cost history and duplicate IDs are rejected before importing', () => {
  const invalid=[null,{},'history'];
  for (const costHistory of invalid) {
    assert.throws(()=>check({...backup(),data:{...backup().data,costHistory}}),/成本历史必须是数组/);
  }
  for (const patch of [{effectiveDate:'2026-02-31'},{observedAt:'2026-02-31T12:00:00Z'},{observedAt:'yesterday'},
    {months:0},{amount:-1},{currency:'INVALID'},{category:''},{status:'unknown'},{kind:'unknown'},
    {kind:'deleted',status:'active'}]) {
    assert.throws(()=>check({...backup(),data:{...backup().data,costHistory:[revision(patch)]}}),/成本历史/);
  }
  assert.throws(()=>check({...backup(),data:{...backup().data,costHistory:[revision(),revision()]}}),/编号重复/);
});

test('corrupt local cost history protects raw bytes while preserving subscriptions and payments for viewing', () => {
  for (const costHistory of [{broken:true},[revision(),revision({id:'broken',amount:-1})]]) {
    const value={...backup([paid()]).data,costHistory},original=JSON.stringify(value);
    const storage=memory({'sumi-data-v1':original}),loaded=api.open(storage);
    assert.equal(loaded.data.subscriptions.length,1);
    assert.equal(loaded.data.payments.length,1);
    assert.equal(loaded.issues.length,1);
    assert.equal(loaded.rawBackup().raw['sumi-data-v1'],original);
    assert.throws(()=>loaded.write(loaded.data,loaded.preferences),/暂停写入/);
    assert.equal(storage.getItem('sumi-data-v1'),original);
    assert.deepEqual(storage.mutations,[]);
  }
});

test('frozen foreign payment snapshots preserve quote matrix and exact confirmed results', () => {
  const record=paid({amount:10,currency:'USD',fxSnapshot:frozen()});
  const value=backup([record]);
  assert.deepEqual(check(value).data.payments[0],record);
  const original=JSON.stringify(value.data),storage=memory({'sumi-data-v1':original});
  const loaded=api.open(storage);
  assert.equal(loaded.issues.length,0);
  assert.equal(storage.getItem('sumi-data-v1'),original);
  assert.deepEqual(storage.mutations,[]);
});

test('frozen payment snapshots reject mismatched originals, rates, converted money and invalid metadata', () => {
  for (const patch of [{sourceAmount:11},{sourceCurrency:'EUR'},{displayCurrency:'INVALID'},
    {rate:1},{rate:0},{rate:Infinity},{convertedAmount:10},{convertedAmount:72.731},
    {convertedAmount:NaN},{confirmedAt:'invalid'},{date:'2026-02-31'},{fetchedAt:null},
    {rates:{EUR:1,USD:1.1,CNY:0}},{rates:{EUR:2,USD:1.1,CNY:8}},
    {rates:{EUR:1,USD:1.1}},{provider:'unknown'},{status:'latest'},{base:'INVALID'}]) {
    assert.throws(()=>check(backup([paid({amount:10,currency:'USD',fxSnapshot:frozen(patch)})])),/汇率|币|付款|换算/);
  }
});

test('same currency identity snapshots retain pre-existing fractional originals without invented FX dates', () => {
  const fx=frozen({provider:'identity',sourceCurrency:'CNY',sourceAmount:3.123,displayCurrency:'CNY',base:'CNY',
    rate:1,convertedAmount:3.123,date:null,fetchedAt:null,rates:{CNY:1}});
  const record=paid({amount:3.123,fxSnapshot:fx});
  assert.deepEqual(check(backup([record])).data.payments[0],record);
  for (const patch of [{convertedAmount:3.12},{rate:2},{displayCurrency:'USD'},{date:'2026-01-30',fetchedAt:'2026-01-31T01:00:00.000Z'},
    {rates:{CNY:1,USD:1.1}},{base:'EUR'}]) {
    assert.throws(()=>check(backup([paid({amount:3.123,fxSnapshot:{...fx,...patch}})])),/币种|快照|金额|矩阵|汇率/);
  }
});

test('unavailable FX snapshots retain original money and reasons without a fake conversion', () => {
  const fx=frozen({status:'unavailable',provider:'unavailable',sourceCurrency:'TWD',sourceAmount:100,
    rate:null,convertedAmount:null,reason:'参考汇率接口不支持 TWD'});
  const record=paid({amount:100,currency:'TWD',fxSnapshot:fx});
  assert.deepEqual(check(backup([record])).data.payments[0],record);
  for (const patch of [{rate:1},{convertedAmount:100},{reason:''},{provider:'identity'}]) {
    assert.throws(()=>check(backup([paid({amount:100,currency:'TWD',fxSnapshot:{...fx,...patch}})])),/换算|原因/);
  }
});

test('snapshot conversion respects zero minor units and rejects unsafe numerical overflow', () => {
  const rate=160/1.1;
  const fx=frozen({displayCurrency:'JPY',rate,convertedAmount:Math.round((10*rate+Number.EPSILON))});
  assert.equal(check(backup([paid({amount:10,currency:'USD',fxSnapshot:fx})])).data.payments[0].fxSnapshot.convertedAmount,1455);
  assert.throws(()=>check(backup([paid({amount:10,currency:'USD',fxSnapshot:{...fx,convertedAmount:1454.5}})])),/换算金额/);
  const huge=Number.MAX_SAFE_INTEGER/100;
  assert.throws(()=>check(backup([paid({amount:huge,currency:'USD',fxSnapshot:{...fx,sourceAmount:huge,convertedAmount:huge*rate}})])),/换算金额/);
});

test('exchange freeze and revise outputs satisfy the persisted schema without changing historical source data', () => {
  const fx=require('../exchange.js');
  const snapshot={version:1,base:'EUR',date:'2026-01-30',fetchedAt:'2026-01-31T01:00:00.000Z',
    rates:{EUR:1,CNY:8,USD:1.1,JPY:160},currencies:{EUR:'Euro',CNY:'Yuan',USD:'Dollar',JPY:'Yen'}};
  const confirmedAt='2026-02-01T02:00:00.000Z';
  for (const [amount,currency,target,cache] of [[10,'USD','CNY',snapshot],[10,'USD','JPY',snapshot],
    [3.123,'CNY','CNY',snapshot],[3.123,'CNY','CNY',null],[20,'TWD','TWD',snapshot],
    [20,'TWD','CNY',snapshot],[20,'USD','CNY',null]]) {
    const record=paid({amount,currency,fxSnapshot:fx.freeze(amount,currency,target,cache,confirmedAt)});
    assert.deepEqual(check(backup([record])).data.payments[0],record);
    const unchanged=fx.revise(record,record.amount,record.currency);
    assert.deepEqual(unchanged,record.fxSnapshot);
    const revised={...record,amount:record.amount+1,fxSnapshot:fx.revise(record,record.amount+1,record.currency)};
    assert.deepEqual(check(backup([revised])).data.payments[0],revised);
  }
});

test('frozen metadata chronology rejects future quotes while permitting backdated actual payments', () => {
  const backdated=paid({date:'2025-01-01',amount:10,currency:'USD',fxSnapshot:frozen()});
  assert.deepEqual(check(backup([backdated])).data.payments[0],backdated);
  for (const patch of [
    {date:'2026-11-01',fetchedAt:'2026-11-02T00:00:00.000Z'},
    {date:'2026-02-01',fetchedAt:'2026-01-31T23:59:59.000Z'},
    {date:'2026-02-01',fetchedAt:'2026-02-01T02:05:00.001Z'},
    {date:'2026-02-02',fetchedAt:'2026-02-01T02:04:00.000Z'}
  ]) {
    assert.throws(()=>check(backup([paid({amount:10,currency:'USD',fxSnapshot:frozen(patch)})])),/时间顺序无效/);
  }
  const skew=frozen({date:'2026-02-01',fetchedAt:'2026-02-01T02:04:59.000Z'});
  assert.deepEqual(check(backup([paid({amount:10,currency:'USD',fxSnapshot:skew})])).data.payments[0].fxSnapshot,skew);
  const midnight=frozen({date:'2026-02-02',fetchedAt:'2026-02-02T00:01:00.000Z',confirmedAt:'2026-02-01T23:59:00.000Z'});
  assert.deepEqual(check(backup([paid({amount:10,currency:'USD',fxSnapshot:midnight})])).data.payments[0].fxSnapshot,midnight);
});
