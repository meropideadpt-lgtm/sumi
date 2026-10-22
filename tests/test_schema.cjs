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
