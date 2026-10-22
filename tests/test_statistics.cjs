const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../statistics.js');
const sub = (extra = {}) => ({id:'reading', name:'阅读会员', amount:31, currency:'CNY', months:1, status:'active', ...extra});
const revision = (effectiveDate, extra = {}) => ({id:'revision-' + effectiveDate, subscriptionId:'reading', name:'阅读会员', category:'未分类', amount:31, currency:'CNY', months:1, status:'active', effectiveDate, observedAt:effectiveDate + 'T12:00:00.000Z', kind:'created', ...extra});
const paid = (date, extra = {}) => ({id:'payment-' + date, subscriptionId:'reading', name:'阅读会员', amount:31, currency:'CNY', date, ...extra});
const data = (extra = {}) => ({subscriptions:[], payments:[], ...extra});
const range = (start, end, extra = {}) => ({start, end, today:'2026-12-31', displayCurrency:'CNY', ...extra});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('empty data has no invented bars, totals or payment counts', () => {
  const result = S.calculate(data(), range('2026-01-01', '2026-12-31'));
  assert.equal(result.hasData, false);
  assert.equal(result.monthlyAverage, null);
  assert.equal(result.amortizedTotal, null);
  assert.equal(result.paidTotal, null);
  assert.equal(result.paidCount, 0);
  for (const key of ['monthlyTrend','annualTrend','serviceShares','categoryShares','paymentRows']) assert.deepEqual(result[key], []);
});

test('legacy current plans create only a virtual current observation, not historical bars', () => {
  const original = data({subscriptions:[sub()]});
  const copy = JSON.stringify(original);
  const before = S.calculate(original, range('2026-01-01', '2026-09-30', {today:'2026-10-22'}));
  assert.equal(before.hasData, false);
  assert.deepEqual(before.monthlyTrend, []);
  const result = S.calculate(original, range('2026-01-01', '2026-12-31', {today:'2026-10-22'}));
  assert.equal(result.monthlyTrend.length, 1);
  assert.equal(result.monthlyTrend[0].key, '2026-10');
  assert.equal(result.monthlyAverage, 31);
  assert.equal(result.knownDays, 1);
  assert.equal(result.partial, true);
  close(result.amortizedTotal, 1);
  assert.equal(JSON.stringify(original), copy);
});

test('observed monthly trend averages daily run rates rather than actual payments', () => {
  const original = data({costHistory:[revision('2026-01-01'), revision('2026-01-16', {id:'increase', amount:62, kind:'changed'})], payments:[paid('2026-01-03', {amount:400})]});
  const result = S.calculate(original, range('2026-01-01', '2026-01-31'));
  close(result.monthlyAverage, (31 * 15 + 62 * 16) / 31);
  close(result.amortizedTotal, 47);
  close(result.monthlyTrend[0].amount, 47);
  assert.equal(result.knownDays, 31);
  assert.equal(result.partial, false);
  assert.equal(result.paidTotal, 400);
  assert.equal(result.paidCount, 1);
});

test('yearly amortized trend sums actual observed month fractions and crosses years', () => {
  const original = data({costHistory:[revision('2025-12-01', {amount:12})]});
  const result = S.calculate(original, range('2025-12-01', '2026-02-28'));
  assert.deepEqual(result.monthlyTrend.map(point => point.key), ['2025-12','2026-01','2026-02']);
  assert.deepEqual(result.annualTrend.map(point => point.key), ['2025','2026']);
  close(result.annualTrend[0].amount, 12);
  close(result.annualTrend[1].amount, 24);
  close(result.amortizedTotal, 36);
  close(result.monthlyAverage, 12);
});

test('annual full-year cost is twelve monthly amounts even in a leap year', () => {
  const result = S.calculate(data({costHistory:[revision('2024-01-01', {amount:120, months:12})]}), range('2024-01-01', '2024-12-31'));
  assert.equal(result.knownDays, 366);
  close(result.monthlyAverage, 10);
  close(result.annualTrend[0].amount, 120);
  close(result.amortizedTotal, 120);
});

test('custom dates are inclusive and actual payments respect both boundaries', () => {
  const original = data({costHistory:[revision('2024-02-01', {amount:29})], payments:[paid('2024-02-27'), paid('2024-02-28'), paid('2024-02-29'), paid('2024-03-01')]});
  const result = S.calculate(original, range('2024-02-28', '2024-02-29'));
  assert.equal(result.knownDays, 2);
  close(result.amortizedTotal, 2);
  assert.equal(result.paidCount, 2);
  assert.equal(result.paidTotal, 62);
});

test('future selected dates are marked partial and never forecast future observed costs', () => {
  const original = data({costHistory:[revision('2026-10-01', {amount:31})], payments:[paid('2026-10-22'), paid('2026-10-23')]});
  const result = S.calculate(original, range('2026-10-01', '2026-12-31', {today:'2026-10-22'}));
  assert.deepEqual(result.monthlyTrend.map(point => point.key), ['2026-10']);
  assert.equal(result.monthlyTrend[0].knownDays, 22);
  assert.equal(result.monthlyTrend[0].totalDays, 31);
  assert.equal(result.monthlyTrend[0].partial, true);
  assert.equal(result.paidCount, 1);
  close(result.amortizedTotal, 22);
  const future = S.calculate(original, range('2027-01-01', '2027-12-31', {today:'2026-10-22'}));
  assert.equal(future.hasData, false);
  assert.deepEqual(future.monthlyTrend, []);
});

test('unknown legacy baseline prehistory is not treated as free subscription time', () => {
  const original = data({costHistory:[revision('2026-01-16', {kind:'baseline'})]});
  const result = S.calculate(original, range('2026-01-01', '2026-01-31'));
  assert.equal(result.monthlyAverage, 31);
  close(result.amortizedTotal, 16);
  assert.equal(result.knownDays, 16);
  assert.equal(result.partial, true);
  assert.equal(result.historyUnknownBefore, true);
});

test('a newly created plan has known absence before creation, while old baseline remains unknown', () => {
  const history = [revision('2026-01-01'), revision('2026-01-16', {id:'new', subscriptionId:'new', name:'新订阅', amount:31})];
  const result = S.calculate(data({costHistory:history}), range('2026-01-01', '2026-01-31'));
  assert.equal(result.knownDays, 31);
  close(result.amortizedTotal, 47);
  const baseline = S.calculate(data({costHistory:[history[0], {...history[1],kind:'baseline'}]}), range('2026-01-01', '2026-01-31'));
  assert.equal(baseline.knownDays, 16);
  assert.equal(baseline.historyUnknownBefore, true);
  assert.equal(baseline.unknownHistorySubscriptions, 1);
  close(baseline.amortizedTotal, 32);
});

test('cancelled and deleted plans contribute only before their observed transitions', () => {
  const history = [revision('2026-01-01'), revision('2026-01-11', {id:'cancel', kind:'changed', status:'cancelled'}), revision('2026-01-21', {id:'restore', kind:'changed'}), revision('2026-01-26', {id:'delete', kind:'deleted', status:'deleted'})];
  const result = S.calculate(data({costHistory:history}), range('2026-01-01', '2026-01-31'));
  close(result.amortizedTotal, 15);
  assert.equal(result.knownDays, 31);
  assert.equal(result.serviceShares.length, 1);
});

test('service and category shares use selected-period observed amortized contributions', () => {
  const history = [revision('2026-01-01', {category:'工作'}), revision('2026-01-01', {id:'music', subscriptionId:'music', name:'音乐', amount:62, category:'娱乐'}), revision('2026-01-16', {id:'recategory', kind:'changed', category:'娱乐'})];
  const result = S.calculate(data({costHistory:history}), range('2026-01-01', '2026-01-31'));
  close(result.amortizedTotal, 93);
  assert.equal(result.serviceShares[0].name, '音乐');
  close(result.serviceShares[0].percentage, 200 / 3);
  const work = result.categoryShares.find(item => item.name === '工作');
  const entertainment = result.categoryShares.find(item => item.name === '娱乐');
  close(work.amount, 15);
  close(entertainment.amount, 78);
  close(result.categoryShares.reduce((sum, item) => sum + item.percentage, 0), 100);
});

test('unsupported cost FX produces incomplete totals and shares, never a one-to-one fallback', () => {
  const history = [revision('2026-01-01'), revision('2026-01-01', {id:'twd', subscriptionId:'twd', name:'台币订阅', currency:'TWD', amount:90})];
  const result = S.calculate(data({costHistory:history}), range('2026-01-01', '2026-01-31'));
  assert.equal(result.monthlyAverage, null);
  assert.equal(result.amortizedTotal, null);
  assert.equal(result.amortizedKnownTotal, 31);
  assert.equal(result.missingFx, true);
  assert.deepEqual(result.missingCurrencies, ['TWD']);
  assert.equal(result.monthlyTrend[0].amount, null);
  assert.equal(result.serviceShares.find(item => item.name === '台币订阅').amount, null);
  assert.ok(result.serviceShares.every(item => item.percentage === null));
});

test('amortized costs may use current reference FX but frozen actual valuations remain independent', () => {
  const original = data({costHistory:[revision('2026-01-01', {currency:'USD', amount:10})], payments:[paid('2026-01-15', {currency:'USD',amount:10,fxSnapshot:{convertedAmount:70}})]});
  const result = S.calculate(original, range('2026-01-01', '2026-01-31', {convert:amount=>({amount:amount*8}),valuePayment:payment=>({amount:payment.fxSnapshot.convertedAmount})}));
  assert.equal(result.monthlyAverage, 80);
  assert.equal(result.amortizedTotal, 80);
  assert.equal(result.paidTotal, 70);
  assert.equal(result.paidCount, 1);
});

test('failed attempts are excluded, legacy success counted, and legacy foreign cash remains unresolved', () => {
  const original = data({payments:[paid('2026-01-01'), paid('2026-01-02',{id:'failed',status:'failed',amount:999}), paid('2026-01-03',{id:'usd',currency:'USD',amount:20}), paid('2025-12-31')]});
  const result = S.calculate(original, range('2026-01-01','2026-01-31'));
  assert.equal(result.hasCostData, false);
  assert.equal(result.hasPaymentData, true);
  assert.equal(result.hasData, true);
  assert.equal(result.paidCount, 2);
  assert.equal(result.paidTotal, null);
  assert.equal(result.paidKnownTotal, 31);
  assert.equal(result.paidUnconvertedCount, 1);
  assert.deepEqual(result.originalCurrencyTotals, [{currency:'CNY',amount:31,count:1},{currency:'USD',amount:20,count:1}]);
  assert.equal(result.paymentMonthly[0].amount,null);
  assert.equal(result.paymentMonthly[0].count,2);
});

test('callback exceptions or invalid converted values cannot become fake totals', () => {
  const history = [revision('2026-01-01')];
  for (const value of [NaN,Infinity,-1,'7',null]) {
    const result = S.calculate(data({costHistory:history}), range('2026-01-01','2026-01-31',{convert:()=>({amount:value})}));
    assert.equal(result.amortizedTotal,null);
  }
  const failed = S.calculate(data({payments:[paid('2026-01-01')]}),range('2026-01-01','2026-01-31',{valuePayment:()=>{throw Error('no cache')}}));
  assert.equal(failed.paidTotal,null);
  assert.equal(failed.paymentRows[0].reason,'conversion-error');
});

test('same-day effective changes use latest observation deterministically', () => {
  const history = [revision('2026-01-01',{amount:10}), revision('2026-01-01',{id:'last',amount:30,observedAt:'2026-01-01T15:00:00.000Z',kind:'changed'}), revision('2026-01-01',{id:'middle',amount:20,observedAt:'2026-01-01T13:00:00.000Z',kind:'changed'})];
  const result = S.calculate(data({costHistory:history}), range('2026-01-01','2026-01-31'));
  assert.equal(result.monthlyAverage,30);
  assert.equal(result.amortizedTotal,30);
});

test('recordChanges is immutable and starts legacy history only on the observation date', () => {
  const before=data({subscriptions:[sub({legacy:{keep:true}})]});
  const next=structuredClone(before);next.subscriptions[0].amount=62;
  const beforeRaw=JSON.stringify(before),nextRaw=JSON.stringify(next);
  let sequence=0;
  const result=S.recordChanges(before,next,'2026-01-16','2026-01-16T12:00:00.000Z',()=>`id-${sequence++}`);
  assert.equal(JSON.stringify(before),beforeRaw);
  assert.equal(JSON.stringify(next),nextRaw);
  assert.equal(result.costHistory.length,2);
  assert.deepEqual(result.costHistory.map(item=>item.kind),['baseline','changed']);
  assert.equal(result.costHistory[0].amount,31);
  assert.equal(result.costHistory[1].amount,62);
  assert.deepEqual(result.subscriptions[0].legacy,{keep:true});
  const stats=S.calculate(result,range('2026-01-01','2026-01-31',{today:'2026-01-16'}));
  assert.equal(stats.knownDays,1);
  assert.equal(stats.monthlyAverage,62);
});

test('creation origin survives repeated same-day edits and deletion preserves prior revisions', () => {
  const first=S.recordChanges(data(),data({subscriptions:[sub()]}),'2026-01-01','2026-01-01T12:00:00.000Z',()=> 'same');
  const updated=structuredClone(first);updated.subscriptions[0].category='工作';
  const second=S.recordChanges(first,updated,'2026-01-01','2026-01-01T13:00:00.000Z',()=> 'same');
  assert.equal(second.costHistory[0].kind,'created');
  assert.equal(second.costHistory[1].id,'same-1');
  const deleted=S.recordChanges(second,{...second,subscriptions:[]},'2026-01-11','2026-01-11T12:00:00.000Z',()=> 'same');
  assert.equal(deleted.costHistory.length,3);
  assert.equal(deleted.costHistory[2].status,'deleted');
  const stats=S.calculate(deleted,range('2026-01-01','2026-01-31'));
  close(stats.amortizedTotal,10);
  assert.equal(stats.categoryShares[0].name,'工作');
});

test('an unrelated actual-payment change observes old plans but does not fabricate older history', () => {
  const before=data({subscriptions:[sub()]});
  const next={...before,payments:[paid('2026-01-16')]};
  const observed=S.recordChanges(before,next,'2026-01-16','2026-01-16T12:00:00.000Z',()=> 'observation');
  assert.equal(observed.costHistory.length,1);
  assert.equal(observed.costHistory[0].kind,'baseline');
  assert.equal(S.calculate(observed,range('2026-01-01','2026-01-15')).hasData,false);
});

test('range validation rejects normalized dates, reverse dates, oversized spans and invalid currency', () => {
  for (const invalid of ['2026-02-31','2026-13-01','2026-1-01','0000-01-01',null]) assert.throws(()=>S.calculate(data(),range(invalid,'2026-12-31')),/有效/);
  assert.throws(()=>S.calculate(data(),range('2026-02-01','2026-01-01')),/开始日期/);
  assert.throws(()=>S.calculate(data(),range('1900-01-01','2026-12-31')),/100 年/);
  assert.throws(()=>S.calculate(data(),range('2026-01-01','2026-12-31',{displayCurrency:'<img>'})),/币种/);
});

test('calculation preserves original subscriptions, history and payment objects', () => {
  const original=data({subscriptions:[sub()],costHistory:[revision('2026-01-01')],payments:[paid('2026-01-02')]});
  const raw=JSON.stringify(original);
  S.calculate(original,range('2026-01-01','2026-01-31'));
  assert.equal(JSON.stringify(original),raw);
});
