/* Observed subscription costs and immutable actual-payment valuations are separate. */
const SumiStats = (() => {
  const DAY = 86400000;
  const MAX_DAYS = 36600;
  const projectionKeys = ['name', 'category', 'amount', 'currency', 'months', 'status'];
  const clone = value => structuredClone(value);
  const fail = message => { throw new Error(message); };
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  const epoch = date => Date.parse(date + 'T00:00:00Z') / DAY;
  const iso = day => new Date(day * DAY).toISOString().slice(0, 10);
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function project(subscription) {
    return {
      subscriptionId:subscription.id,
      name:subscription.name,
      category:typeof subscription.category === 'string' && subscription.category.trim() ? subscription.category : '未分类',
      amount:subscription.amount,
      currency:subscription.currency,
      months:subscription.months,
      status:subscription.status === 'cancelled' ? 'cancelled' : 'active'
    };
  }
  const equalProjection = (a, b) => projectionKeys.every(key => a[key] === b[key]);
  function recordChanges(before, next, date, observedAt, idFactory) {
    if (!validDate(date)) fail('成本记录日期无效');
    if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) fail('成本观察时间无效');
    if (!Array.isArray(before?.subscriptions) || !Array.isArray(next?.subscriptions)) fail('订阅数据无效');
    const result = clone(next);
    const history = clone(before.costHistory ?? []);
    if (!Array.isArray(history)) fail('成本历史无效');
    const ids = new Set(history.map(item => item.id));
    let sequence = 0;
    const makeId = () => {
      const proposed = idFactory ? String(idFactory()) : `cost-${date}-${Date.parse(observedAt)}-${sequence++}`;
      let id = proposed, suffix = 1;
      while (ids.has(id)) id = `${proposed}-${suffix++}`;
      ids.add(id);
      return id;
    };
    const append = (subscription, kind, status) => {
      const projected = project(subscription);
      history.push({...projected, ...(status ? {status} : {}), id:makeId(), effectiveDate:date, observedAt, kind});
    };
    const tracked = new Set(history.map(item => item.subscriptionId));
    const previous = new Map(before.subscriptions.map(subscription => [subscription.id, subscription]));
    const current = new Map(next.subscriptions.map(subscription => [subscription.id, subscription]));
    // A baseline observes an existing plan today. It says nothing about earlier dates.
    for (const subscription of before.subscriptions) {
      if (!tracked.has(subscription.id)) append(subscription, 'baseline');
    }
    for (const subscription of next.subscriptions) {
      const old = previous.get(subscription.id);
      if (!old) append(subscription, 'created');
      else if (!equalProjection(project(old), project(subscription))) append(subscription, 'changed');
    }
    for (const subscription of before.subscriptions) {
      if (!current.has(subscription.id)) append(subscription, 'deleted', 'deleted');
    }
    if (history.length || Object.hasOwn(before, 'costHistory')) result.costHistory = history;
    return result;
  }
  function observationGroups(data, today) {
    const history = data.costHistory ?? [];
    if (!Array.isArray(history)) fail('成本历史无效');
    const groups = new Map();
    let order = 0;
    const add = item => {
      if (!validDate(item.effectiveDate)) fail('成本历史日期无效');
      if (typeof item.subscriptionId !== 'string' || !item.subscriptionId) fail('成本历史订阅编号无效');
      if (!groups.has(item.subscriptionId)) groups.set(item.subscriptionId, []);
      groups.get(item.subscriptionId).push({...item, _day:epoch(item.effectiveDate), _order:order++});
    };
    for (const item of history) add(item);
    for (const subscription of data.subscriptions) {
      const list = groups.get(subscription.id) || [];
      const earlier = list.filter(item => item.effectiveDate <= today).sort(compareObservations);
      const last = earlier.at(-1);
      const projected = project(subscription);
      if (!last) add({...projected, effectiveDate:today, observedAt:today + 'T23:59:59.999Z', kind:'baseline', virtual:true});
      else if (!equalProjection(last, projected)) add({...projected, effectiveDate:today, observedAt:today + 'T23:59:59.999Z', kind:'changed', virtual:true});
    }
    for (const list of groups.values()) list.sort(compareObservations);
    return groups;
  }
  function compareObservations(a, b) {
    const firstTime = Date.parse(a.observedAt), secondTime = Date.parse(b.observedAt);
    const timeOrder = Number.isFinite(firstTime) && Number.isFinite(secondTime) ? firstTime - secondTime : 0;
    return a._day - b._day || timeOrder || a._order - b._order;
  }
  function monthBounds(day) {
    const d = new Date(day * DAY);
    d.setUTCDate(1);
    const start = d.getTime() / DAY;
    d.setUTCMonth(d.getUTCMonth() + 1);
    return {start, end:d.getTime() / DAY - 1};
  }
  function yearBounds(day) {
    const d = new Date(day * DAY);
    d.setUTCMonth(0, 1);
    const start = d.getTime() / DAY;
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return {start, end:d.getTime() / DAY - 1};
  }
  function safeValue(callback, fallback, ...args) {
    try {
      const result = callback ? callback(...args) : fallback(...args);
      if (result && typeof result.amount === 'number' && Number.isFinite(result.amount) && result.amount >= 0) return {amount:result.amount, reason:null};
      return {amount:null, reason:typeof result?.reason === 'string' ? result.reason : 'missing-rate'};
    } catch { return {amount:null, reason:'conversion-error'}; }
  }
  const originalOnly = (amount, from, to) => from === to ? {amount} : {amount:null, reason:'missing-rate'};
  const legacyPayment = (payment, currency) => originalOnly(payment.amount, payment.currency, currency);
  function calculate(data, options) {
    if (!data || !Array.isArray(data.subscriptions) || !Array.isArray(data.payments)) fail('统计数据无效');
    const {start, end, today = localToday(), displayCurrency = 'CNY', convert, valuePayment} = options ?? {};
    if (![start, end, today].every(validDate)) fail('请选择真实有效的统计日期');
    if (start > end) fail('统计开始日期不能晚于结束日期');
    if (typeof displayCurrency !== 'string' || !/^[A-Z]{3}$/.test(displayCurrency)) fail('展示币种无效');
    const first = epoch(start), requestedLast = epoch(end), last = Math.min(requestedLast, epoch(today));
    if (requestedLast - first + 1 > MAX_DAYS) fail('统计范围最多支持 100 年');
    const totalDays = requestedLast - first + 1;
    const model = {
      range:{start, end, effectiveEnd:iso(last)}, displayCurrency,
      hasData:false, hasCostData:false, hasPaymentData:false,
      monthlyTrend:[], annualTrend:[], serviceShares:[], categoryShares:[],
      monthlyAverage:null, monthlyKnownAverage:null, amortizedTotal:null, amortizedKnownTotal:0,
      knownDays:0, totalDays, partial:false, missingFx:false, missingCurrencies:[],
      historyStart:null, historyUnknownBefore:false, unknownHistorySubscriptions:0,
      paidTotal:null, paidKnownTotal:0, paidCount:0, paidUnconvertedCount:0,
      paymentRows:[], originalCurrencyTotals:[], paymentMonthly:[], paymentAnnual:[]
    };
    if (last < first) return model;
    const groups = observationGroups(data, today);
    const all = [...groups.values()].flat();
    const earliest = all.length ? Math.min(...all.map(item => item._day)) : null;
    const unknownHistory = new Set(), allMissing = new Set();
    const monthly = new Map(), annual = new Map(), services = new Map(), categories = new Map();
    let monthlyIntegral = 0;
    const point = (points, key, day, annualPoint = false) => {
      if (!points.has(key)) {
        const bounds = annualPoint ? yearBounds(day) : monthBounds(day);
        points.set(key, {key, knownDays:0, totalDays:Math.min(requestedLast, bounds.end) - Math.max(first, bounds.start) + 1,
          monthlyIntegral:0, amortized:0, missing:new Set(), observed:false});
      }
      return points.get(key);
    };
    const share = (map, key, name, subscriptionId) => {
      if (!map.has(key)) map.set(key, {name, ...(subscriptionId ? {subscriptionId} : {}), knownAmount:0, missingFx:false});
      const item = map.get(key); item.name = name;
      return item;
    };
    if (earliest !== null && earliest <= last) {
      model.historyStart = iso(earliest);
      const boundaries = new Set([first, last + 1]);
      for (const item of all) if (item._day > first && item._day <= last) boundaries.add(item._day);
      let month = monthBounds(first).end + 1;
      while (month <= last) { boundaries.add(month); month = monthBounds(month).end + 1; }
      const sorted = [...boundaries].sort((a, b) => a - b);
      const cursors = [...groups].map(([subscriptionId, list]) => ({subscriptionId, list, index:-1}));
      for (let index = 0; index < sorted.length - 1; index++) {
        const day = sorted[index], days = sorted[index + 1] - day;
        if (day < earliest) continue;
        const date = iso(day), monthPoint = point(monthly, date.slice(0, 7), day), yearPoint = point(annual, date.slice(0, 4), day, true);
        let unknown = false;
        const states = [];
        for (const cursor of cursors) {
          while (cursor.index + 1 < cursor.list.length && cursor.list[cursor.index + 1]._day <= day) cursor.index++;
          const current = cursor.index >= 0 ? cursor.list[cursor.index] : null;
          if (!current && cursor.list[0].kind !== 'created') { unknown = true; unknownHistory.add(cursor.subscriptionId); }
          if (current) states.push(current);
        }
        monthPoint.observed = true; yearPoint.observed = true;
        model.hasCostData = true;
        if (unknown) continue;
        model.knownDays += days; monthPoint.knownDays += days; yearPoint.knownDays += days;
        const daysInMonth = monthBounds(day).end - monthBounds(day).start + 1;
        for (const state of states) {
          if (state.status === 'cancelled' || state.status === 'deleted') continue;
          const service = share(services, state.subscriptionId, state.name, state.subscriptionId);
          const categoryName = typeof state.category === 'string' && state.category.trim() ? state.category : '未分类';
          const category = share(categories, categoryName, categoryName);
          const result = safeValue(convert, originalOnly, state.amount, state.currency, displayCurrency);
          if (result.amount === null || ![1, 3, 6, 12].includes(state.months)) {
            service.missingFx = true; category.missingFx = true;
            monthPoint.missing.add(state.currency); yearPoint.missing.add(state.currency); allMissing.add(state.currency);
            continue;
          }
          const monthlyAmount = result.amount / state.months;
          const integral = monthlyAmount * days;
          const amortized = integral / daysInMonth;
          monthlyIntegral += integral; monthPoint.monthlyIntegral += integral; yearPoint.monthlyIntegral += integral;
          model.amortizedKnownTotal += amortized; monthPoint.amortized += amortized; yearPoint.amortized += amortized;
          service.knownAmount += amortized; category.knownAmount += amortized;
        }
      }
    }
    model.partial = model.hasCostData && model.knownDays < totalDays;
    model.missingFx = allMissing.size > 0;
    model.missingCurrencies = [...allMissing].sort();
    model.historyUnknownBefore = unknownHistory.size > 0 || (earliest !== null && first < earliest);
    model.unknownHistorySubscriptions = unknownHistory.size;
    if (model.hasCostData && model.knownDays > 0) {
      model.monthlyKnownAverage = monthlyIntegral / model.knownDays;
      if (!model.missingFx) {
        model.monthlyAverage = model.monthlyKnownAverage;
        model.amortizedTotal = model.amortizedKnownTotal;
      }
    }
    const finalizePoint = (item, annualPoint = false) => {
      const missingFx = item.missing.size > 0;
      const knownAmount = annualPoint ? item.amortized : (item.knownDays ? item.monthlyIntegral / item.knownDays : 0);
      return {key:item.key, amount:item.knownDays && !missingFx ? knownAmount : null, knownAmount,
        amortizedAmount:item.knownDays && !missingFx ? item.amortized : null,
        knownDays:item.knownDays, totalDays:item.totalDays, partial:item.knownDays < item.totalDays,
        missingFx, missingCurrencies:[...item.missing].sort()};
    };
    model.monthlyTrend = [...monthly.values()].filter(item => item.observed).map(item => finalizePoint(item));
    model.annualTrend = [...annual.values()].filter(item => item.observed).map(item => finalizePoint(item, true));
    const finalizeShares = map => [...map.values()].map(item => ({...item, amount:item.missingFx ? null : item.knownAmount,
      percentage:model.amortizedTotal === null ? null : model.amortizedTotal > 0 ? item.knownAmount / model.amortizedTotal * 100 : 0}))
      .sort((a, b) => b.knownAmount - a.knownAmount || a.name.localeCompare(b.name));
    model.serviceShares = finalizeShares(services);
    model.categoryShares = finalizeShares(categories);
    const originals = new Map(), paidMonthly = new Map(), paidAnnual = new Map();
    const paidPoint = (map, key) => {
      if (!map.has(key)) map.set(key, {key, knownAmount:0, count:0, unconvertedCount:0});
      return map.get(key);
    };
    for (const payment of data.payments) {
      if (payment.status !== undefined && payment.status !== 'succeeded') continue;
      if (!validDate(payment.date) || payment.date < start || epoch(payment.date) > last) continue;
      const result = safeValue(valuePayment, legacyPayment, payment, displayCurrency);
      const monthPoint = paidPoint(paidMonthly, payment.date.slice(0, 7)), yearPoint = paidPoint(paidAnnual, payment.date.slice(0, 4));
      model.paidCount++; monthPoint.count++; yearPoint.count++;
      if (result.amount === null) { model.paidUnconvertedCount++; monthPoint.unconvertedCount++; yearPoint.unconvertedCount++; }
      else { model.paidKnownTotal += result.amount; monthPoint.knownAmount += result.amount; yearPoint.knownAmount += result.amount; }
      model.paymentRows.push({payment, amount:result.amount, reason:result.reason});
      if (!originals.has(payment.currency)) originals.set(payment.currency, {currency:payment.currency, amount:0, count:0});
      const original = originals.get(payment.currency); original.amount += payment.amount; original.count++;
    }
    model.paymentRows.sort((a, b) => b.payment.date.localeCompare(a.payment.date));
    model.originalCurrencyTotals = [...originals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
    const finishPaid = map => [...map.values()].map(item => ({...item, amount:item.unconvertedCount ? null : item.knownAmount})).sort((a, b) => a.key.localeCompare(b.key));
    model.paymentMonthly = finishPaid(paidMonthly); model.paymentAnnual = finishPaid(paidAnnual);
    model.hasPaymentData = model.paidCount > 0;
    if (model.hasPaymentData && !model.paidUnconvertedCount) model.paidTotal = model.paidKnownTotal;
    model.hasData = model.hasCostData || model.hasPaymentData;
    return model;
  }
  return Object.freeze({recordChanges, calculate, validDate});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiStats;
