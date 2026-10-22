/* Calendar-only billing helpers: no local timezone, storage, or payment side effects. */
const SumiBilling = (() => {
  const PERIODS = [1, 3, 6, 12];
  const LAST_MONTH = 9999 * 12 - 1;
  const fail = message => { throw new Error(message); };
  const daysInMonth = (year, month) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  }
  function parts(value) {
    if (!validDate(value)) fail('账期日期无效');
    return {year:Number(value.slice(0, 4)), month:Number(value.slice(5, 7)), day:Number(value.slice(8, 10))};
  }
  const index = date => (date.year - 1) * 12 + date.month - 1;
  function schedule(subscription) {
    if (!subscription || typeof subscription !== 'object' || !PERIODS.includes(subscription.months)) fail('订阅周期无效');
    parts(subscription.nextDate);
    const anchor = parts(subscription.billingAnchor ?? subscription.nextDate);
    return {months:subscription.months, anchor};
  }
  function matches(plan, value) {
    if (!validDate(value)) return false;
    const date = parts(value);
    return (index(date) - index(plan.anchor)) % plan.months === 0 && date.day === Math.min(plan.anchor.day, daysInMonth(date.year, date.month));
  }
  function isScheduledCycle(subscription, value) {
    return matches(schedule(subscription), value);
  }
  function shift(subscription, from, direction) {
    const plan = schedule(subscription);
    if (!matches(plan, from)) fail('日期不属于此订阅账期');
    const target = index(parts(from)) + plan.months * direction;
    if (target < 0 || target > LAST_MONTH) fail('续费日期超出支持范围（0001–9999 年）');
    const year = Math.floor(target / 12) + 1, month = target % 12 + 1;
    const day = Math.min(plan.anchor.day, daysInMonth(year, month));
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const nextCycle = (subscription, from = subscription?.nextDate) => shift(subscription, from, 1);
  const previousCycle = (subscription, from = subscription?.nextDate) => shift(subscription, from, -1);
  const successful = payment => Boolean(payment && typeof payment === 'object' && (payment.status === undefined || payment.status === 'succeeded'));
  function paidCycles(payments, subscriptionId, coverageOnly = false) {
    if (!Array.isArray(payments)) fail('付款记录无效');
    if (typeof subscriptionId !== 'string' || !subscriptionId.trim()) fail('订阅编号无效');
    return new Set(payments.filter(payment => successful(payment) && (!coverageOnly || (payment.advancesSchedule !== false && payment.scheduleArchived !== true)) && payment.subscriptionId === subscriptionId && validDate(payment.cycleDate)).map(payment => payment.cycleDate));
  }
  function hasSuccessfulPayment(payments, subscriptionId, cycleDate) {
    if (!validDate(cycleDate)) fail('账期日期无效');
    return paidCycles(payments, subscriptionId).has(cycleDate);
  }
  function advancePastPaid(subscription, payments, start = subscription?.nextDate) {
    const plan = schedule(subscription);
    if (!matches(plan, start)) fail('日期不属于此订阅账期');
    const paid = paidCycles(payments, subscription.id, true);
    let current = start;
    // Each advancement consumes a distinct calendar month from a finite set.
    // Unpaid dates always stop the loop, even when they are overdue.
    for (let steps = 0; steps <= paid.size; steps += 1) {
      if (!paid.has(current)) return current;
      current = nextCycle(subscription, current);
    }
    fail('账期记录异常，无法继续推进');
  }
  return Object.freeze({validDate, nextCycle, previousCycle, isScheduledCycle, successful, hasSuccessfulPayment, advancePastPaid});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiBilling;
