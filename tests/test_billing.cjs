const test = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const B = require('../billing.js');
const subscription = (nextDate, months = 1, billingAnchor = nextDate) => ({id:'sub', nextDate, months, billingAnchor});
const payment = (cycleDate, extra = {}) => ({id:'payment', subscriptionId:'sub', cycleDate, ...extra});

test('validDate checks real Gregorian dates without normalizing invalid values', () => {
  for (const date of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) assert.equal(B.validDate(date), true, date);
  for (const date of [null, 20260201, '', '0000-01-01', '10000-01-01', '1900-02-29', '2025-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z']) assert.equal(B.validDate(date), false, String(date));
});

test('monthly day 31 recovers after short months', () => {
  const sub = subscription('2025-01-31');
  assert.equal(B.nextCycle(sub), '2025-02-28');
  assert.equal(B.nextCycle(sub, '2025-02-28'), '2025-03-31');
  assert.equal(B.nextCycle(sub, '2025-03-31'), '2025-04-30');
  assert.equal(B.previousCycle(sub, '2025-03-31'), '2025-02-28');
  assert.equal(B.previousCycle(sub, '2025-02-28'), '2025-01-31');
});

test('monthly day 30 remains day 30 rather than becoming an end-of-month rule', () => {
  const sub = subscription('2025-01-30');
  assert.equal(B.nextCycle(sub), '2025-02-28');
  assert.equal(B.nextCycle(sub, '2025-02-28'), '2025-03-30');
  assert.equal(B.isScheduledCycle(sub, '2025-03-31'), false);
});

test('a February month-end without an earlier anchor stays on its original day', () => {
  assert.equal(B.nextCycle(subscription('2025-02-28')), '2025-03-28');
  assert.equal(B.nextCycle(subscription('2024-02-29')), '2024-03-29');
});

test('quarterly and half-year subscriptions preserve their anchor across year boundaries', () => {
  const quarter = subscription('2025-08-31', 3);
  assert.equal(B.nextCycle(quarter), '2025-11-30');
  assert.equal(B.nextCycle(quarter, '2025-11-30'), '2026-02-28');
  assert.equal(B.nextCycle(quarter, '2026-02-28'), '2026-05-31');
  const half = subscription('2025-08-31', 6);
  assert.equal(B.nextCycle(half), '2026-02-28');
  assert.equal(B.nextCycle(half, '2026-02-28'), '2026-08-31');
  assert.equal(B.previousCycle(half), '2025-02-28');
});

test('annual leap day returns in leap years and obeys century rules', () => {
  const sub = subscription('2024-02-29', 12);
  assert.equal(B.nextCycle(sub), '2025-02-28');
  assert.equal(B.nextCycle(sub, '2027-02-28'), '2028-02-29');
  assert.equal(B.previousCycle(sub, '2025-02-28'), '2024-02-29');
  assert.equal(B.nextCycle(subscription('2096-02-29', 12), '2099-02-28'), '2100-02-28');
  assert.equal(B.nextCycle(subscription('2396-02-29', 12), '2399-02-28'), '2400-02-29');
});

test('legacy subscriptions infer nextDate as anchor without changing stored fields', () => {
  const sub = Object.freeze({id:'legacy', nextDate:'2026-12-31', months:1});
  assert.equal(B.nextCycle(sub), '2027-01-31');
  assert.equal(B.previousCycle(sub), '2026-11-30');
  assert.equal(Object.hasOwn(sub, 'billingAnchor'), false);
});

test('schedule membership includes earlier historical cycles', () => {
  const sub = subscription('2026-08-31', 3);
  for (const cycle of ['2025-11-30', '2026-02-28', '2026-05-31', '2026-08-31', '2026-11-30']) assert.equal(B.isScheduledCycle(sub, cycle), true, cycle);
  for (const cycle of ['2026-07-31', '2026-05-30', '2026-02-27', '2026-02-31', 'nonsense']) assert.equal(B.isScheduledCycle(sub, cycle), false, cycle);
});

test('invalid schedules and off-cycle inputs are rejected', () => {
  for (const months of [0, -1, 2, 2.5, '1', 24, undefined]) assert.throws(() => B.nextCycle({nextDate:'2026-01-31', months}), /周期无效/);
  assert.throws(() => B.nextCycle(subscription('2026-02-31')), /日期无效/);
  assert.throws(() => B.nextCycle(subscription('2026-01-31', 1, '2026-02-31')), /日期无效/);
  assert.throws(() => B.nextCycle(subscription('2026-01-31'), '2026-03-30'), /不属于/);
  assert.throws(() => B.previousCycle(subscription('2026-01-31'), '2026-03-30'), /不属于/);
  assert.throws(() => B.nextCycle(null), /周期无效/);
});

test('calendar boundaries work for early years and reject range overflow', () => {
  assert.equal(B.nextCycle(subscription('0001-01-31')), '0001-02-28');
  assert.equal(B.previousCycle(subscription('0100-01-31')), '0099-12-31');
  assert.equal(B.nextCycle(subscription('9999-11-30')), '9999-12-30');
  assert.throws(() => B.nextCycle(subscription('9999-12-31')), /超出/);
  assert.throws(() => B.previousCycle(subscription('0001-01-31')), /超出/);
});

test('legacy success, explicit success and failed attempts remain distinct', () => {
  assert.equal(B.successful(payment('2026-01-31')), true);
  assert.equal(B.successful(payment('2026-01-31', {status:'succeeded'})), true);
  for (const status of ['failed', 'pending', null, '']) assert.equal(B.successful({status}), false);
  assert.equal(B.successful(null), false);
  assert.equal(B.successful('succeeded'), false);
});

test('successful duplicate checks include cycle and subscription and ignore failed attempts', () => {
  const payments = [payment('2026-01-31', {status:'failed'}), payment('2026-02-28'), payment('2026-03-31', {subscriptionId:'other'}), {subscriptionId:'sub', status:'succeeded'}];
  assert.equal(B.hasSuccessfulPayment(payments, 'sub', '2026-01-31'), false);
  assert.equal(B.hasSuccessfulPayment(payments, 'sub', '2026-02-28'), true);
  assert.equal(B.hasSuccessfulPayment(payments, 'sub', '2026-03-31'), false);
  assert.throws(() => B.hasSuccessfulPayment(null, 'sub', '2026-01-31'), /记录无效/);
  assert.throws(() => B.hasSuccessfulPayment([], '', '2026-01-31'), /编号无效/);
  assert.throws(() => B.hasSuccessfulPayment([], 'sub', '2026-02-31'), /日期无效/);
});

test('unpaid overdue dates are never skipped based on the current date', () => {
  const sub = subscription('2020-01-31');
  assert.equal(B.advancePastPaid(sub, []), '2020-01-31');
  assert.equal(B.advancePastPaid(sub, [payment('2020-01-31')]), '2020-02-29');
  assert.equal(B.advancePastPaid(sub, [payment('2020-01-31'), payment('2020-03-31')]), '2020-02-29');
});

test('advancement skips successful prepaid cycles out of order and deduplicates them', () => {
  const sub = subscription('2026-01-31');
  const payments = [payment('2026-03-31'), payment('2026-01-31'), payment('2026-02-28'), payment('2026-01-31'), payment('2026-04-30', {status:'failed'})];
  assert.equal(B.advancePastPaid(sub, payments), '2026-04-30');
  assert.equal(B.advancePastPaid(sub, payments, '2026-02-28'), '2026-04-30');
  assert.throws(() => B.advancePastPaid(sub, payments, '2026-02-27'), /不属于/);
});

test('archived successful payments prevent duplicates but do not cover a changed schedule', () => {
  const sub = subscription('2026-08-31', 3);
  const payments = [payment('2026-08-31', {advancesSchedule:false}), payment('2026-11-30', {advancesSchedule:true})];
  assert.equal(B.hasSuccessfulPayment(payments, 'sub', '2026-08-31'), true);
  assert.equal(B.advancePastPaid(sub, payments), '2026-08-31');
  assert.equal(B.advancePastPaid(sub, payments, '2026-11-30'), '2027-02-28');
});

test('archived schedule identity remains detached even if an old success marker is true', () => {
  const sub = subscription('2026-08-31', 3);
  const payments = [payment('2026-08-31', {advancesSchedule:true, scheduleArchived:true}), payment('2026-11-30', {advancesSchedule:true, scheduleArchived:false})];
  assert.equal(B.advancePastPaid(sub, payments), '2026-08-31');
  assert.equal(B.hasSuccessfulPayment(payments, 'sub', '2026-08-31'), true);
  assert.equal(B.advancePastPaid(sub, payments, '2026-11-30'), '2027-02-28');
});

test('legacy payments without a schedule marker continue covering their recorded cycles', () => {
  const sub = subscription('2026-01-31');
  const payments = [payment('2026-01-31'), payment('2026-02-28', {status:'succeeded'})];
  assert.equal(B.advancePastPaid(sub, payments), '2026-03-31');
  assert.equal(Object.hasOwn(payments[0], 'advancesSchedule'), false);
});

test('advancement is immutable and bounded by the supported calendar', () => {
  const sub = Object.freeze(subscription('2026-01-31'));
  const payments = Object.freeze([Object.freeze(payment('2026-01-31'))]);
  const before = JSON.stringify({sub, payments});
  assert.equal(B.advancePastPaid(sub, payments), '2026-02-28');
  assert.equal(JSON.stringify({sub, payments}), before);
  assert.throws(() => B.advancePastPaid(subscription('9999-12-31'), [payment('9999-12-31')]), /超出/);
});

test('results do not depend on local timezone or daylight saving time', () => {
  const modulePath = path.resolve(__dirname, '../billing.js');
  const script = `const B=require(${JSON.stringify(modulePath)});process.stdout.write(JSON.stringify([B.nextCycle({id:'a',nextDate:'2024-01-31',months:1,billingAnchor:'2024-01-31'},'2024-02-29'),B.previousCycle({id:'b',nextDate:'2026-12-31',months:3})]));`;
  const results = ['UTC', 'Asia/Shanghai', 'America/New_York', 'Pacific/Kiritimati'].map(TZ => execFileSync(process.execPath, ['-e', script], {env:{...process.env, TZ}, encoding:'utf8'}));
  assert.equal(new Set(results).size, 1);
  assert.equal(results[0], '["2024-03-31","2026-09-30"]');
});
