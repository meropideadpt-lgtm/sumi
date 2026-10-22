/* Frankfurter v1 reference rates. No network request runs when this module loads. */
const SumiFx = (() => {
  const CACHE_KEY = 'sumi-fx-cache-v1';
  const API = 'https://api.frankfurter.dev/v1';
  const DAY = 24 * 60 * 60 * 1000;
  const RETRY_DELAY = 5 * 60 * 1000;
  const ISO = /^[A-Z]{3}$/;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const time = value => value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const parsed = Date.parse(value + 'T12:00:00Z');
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === value;
  };
  const isoTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  function round(value, currency) {
    if (!amount(value) || !ISO.test(currency)) fail('金额或币种无效');
    const digits = new Intl.NumberFormat('en', {style:'currency',currency}).resolvedOptions().maximumFractionDigits;
    const factor = 10 ** digits;
    if (value * factor > Number.MAX_SAFE_INTEGER) fail('换算金额超出安全精度范围');
    const result = Math.round((value + Number.EPSILON) * factor) / factor;
    if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) fail('换算金额超出支持范围');
    return result;
  }
  function validateCurrencies(payload) {
    if (!object(payload) || Object.keys(payload).length === 0 || Object.keys(payload).length > 1000) fail('接口币种列表无效');
    const result = {};
    for (const [currency,name] of Object.entries(payload)) {
      if (!ISO.test(currency) || typeof name !== 'string' || !name.trim() || name.length > 200) fail('接口币种列表无效');
      result[currency] = name;
    }
    if (!Object.hasOwn(result,'EUR')) fail('接口币种列表缺少 EUR');
    return result;
  }
  function rateMatrix(rates, base) {
    if (!ISO.test(base) || !object(rates) || !Object.keys(rates).length || Object.keys(rates).length > 1000) fail('接口汇率数据无效');
    const result = {};
    for (const [currency,rate] of Object.entries(rates)) {
      if (!ISO.test(currency) || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) fail('接口汇率数据无效');
      result[currency] = rate;
    }
    if (Object.hasOwn(result,base) && result[base] !== 1) fail('基准币种汇率必须为 1');
    result[base] = 1;
    return result;
  }
  function validateLatest(payload, now = Date.now()) {
    const clock = time(now);
    if (!Number.isFinite(clock) || !object(payload) || payload.base !== 'EUR' || payload.amount !== 1) fail('接口基准或金额无效');
    if (!date(payload.date) || payload.date > new Date(clock).toISOString().slice(0,10)) fail('接口汇率日期无效');
    const rates = rateMatrix(payload.rates,payload.base);
    if (Object.keys(rates).length < 2) fail('接口缺少换算汇率');
    return {base:'EUR',date:payload.date,rates};
  }
  function validateSnapshot(value, now = Date.now()) {
    if (!object(value) || value.version !== 1 || !isoTime(value.fetchedAt) || Date.parse(value.fetchedAt) > time(now) + 5 * 60 * 1000) fail('汇率缓存时间无效');
    if (value.date > new Date(value.fetchedAt).toISOString().slice(0,10)) fail('汇率缓存日期晚于获取时间');
    const latest = validateLatest({amount:1,base:value.base,date:value.date,rates:value.rates},now);
    const currencies = validateCurrencies(value.currencies);
    // The v1 catalogue filters expired codes while latest can expose a different
    // observation group. Never mix dates to fabricate the missing quotes.
    const rates = Object.fromEntries(Object.entries(latest.rates).filter(([currency]) => Object.hasOwn(currencies,currency)));
    if (Object.keys(rates).length < 2) fail('接口缺少可用币种汇率');
    const missingCurrencies = Object.keys(currencies).filter(currency => !Object.hasOwn(rates,currency)).sort();
    return {version:1,base:latest.base,date:latest.date,rates,fetchedAt:new Date(value.fetchedAt).toISOString(),currencies,missingCurrencies};
  }

  function supported(currency, snapshot) {
    if (!ISO.test(currency)) return false;
    if (!snapshot?.currencies) return null;
    return Object.hasOwn(snapshot.currencies,currency) && Object.hasOwn(snapshot.rates || {},currency);
  }
  const unavailable = reason => ({available:false,amount:null,rawAmount:null,rate:null,reason});
  function quote(value, from, to, snapshot) {
    if (!amount(value) || !ISO.test(from) || !ISO.test(to)) return unavailable('金额或币种无效');
    if (from === to) return {available:true,amount:value,rawAmount:value,rate:1,reason:null};
    if (!snapshot) return unavailable('尚无可用汇率，请联网获取参考汇率');
    let rates;
    try { rates = rateMatrix(snapshot.rates,snapshot.base); }
    catch { return unavailable('汇率数据无效，无法换算'); }
    if (!Object.hasOwn(rates,from)) return unavailable('接口或此份汇率未支持 ' + from + '，无法换算');
    if (!Object.hasOwn(rates,to)) return unavailable('接口或此份汇率未支持 ' + to + '，无法换算');
    const rate = rates[to] / rates[from], rawAmount = value * rate;
    if (!Number.isFinite(rate) || rate <= 0 || !amount(rawAmount)) return unavailable('换算金额超出支持范围');
    try { return {available:true,amount:round(rawAmount,to),rawAmount,rate,reason:null}; }
    catch { return unavailable('换算金额超出支持范围'); }
  }
  function frozenMatrix(snapshot) {
    if (!snapshot || !date(snapshot.date) || !isoTime(snapshot.fetchedAt) || snapshot.date > new Date(snapshot.fetchedAt).toISOString().slice(0,10)) return null;
    try { return {...snapshot,rates:rateMatrix(snapshot.rates,snapshot.base)}; }
    catch { return null; }
  }
  function freeze(value, from, to, snapshot, confirmedAt = new Date().toISOString()) {
    if (!amount(value) || !ISO.test(from) || !ISO.test(to) || !isoTime(confirmedAt)) fail('付款汇率快照参数无效');
    let valid = frozenMatrix(snapshot);
    if (valid && (valid.date > new Date(confirmedAt).toISOString().slice(0,10) || Date.parse(valid.fetchedAt) > Date.parse(confirmedAt) + 5 * 60 * 1000)) valid = null;
    const result = quote(value,from,to,valid);
    const provider = result.available ? (valid && Object.hasOwn(valid.rates,from) && Object.hasOwn(valid.rates,to) ? 'frankfurter' : 'identity') : 'unavailable';
    return {
      version:1,status:result.available?'available':'unavailable',provider,
      sourceCurrency:from,sourceAmount:value,displayCurrency:to,
      base:provider === 'identity' ? from : valid?.base || from,rate:result.rate,convertedAmount:result.amount,
      date:provider === 'identity' ? null : valid?.date || null,fetchedAt:provider === 'identity' ? null : valid?.fetchedAt || null,
      confirmedAt:new Date(confirmedAt).toISOString(),rates:clone(provider === 'identity' ? {[from]:1} : valid?.rates || {[from]:1}),reason:result.reason
    };
  }
  function valuePayment(payment, target) {
    if (!payment || (payment.status !== undefined && payment.status !== 'succeeded')) return unavailable('失败付款不计入实际已付金额');
    if (!amount(payment.amount) || !ISO.test(payment.currency) || !ISO.test(target)) return unavailable('付款金额或币种无效');
    if (payment.currency === target) return {available:true,amount:payment.amount,rawAmount:payment.amount,rate:1,reason:null};
    const frozen = payment.fxSnapshot;
    if (!frozen) return unavailable('旧付款未保存确认汇率，不能按当前汇率回算');
    if (frozen.sourceCurrency !== payment.currency || frozen.sourceAmount !== payment.amount) return unavailable('付款与冻结汇率不一致');
    if (frozen.status !== 'available') return unavailable(frozen.reason || '确认时没有可用汇率');
    if (target === frozen.displayCurrency) {
      if (!amount(frozen.convertedAmount) || typeof frozen.rate !== 'number' || !Number.isFinite(frozen.rate) || frozen.rate <= 0) return unavailable('冻结换算结果无效');
      return {available:true,amount:frozen.convertedAmount,rawAmount:payment.amount*frozen.rate,rate:frozen.rate,reason:null};
    }
    return quote(payment.amount,payment.currency,target,frozen);
  }
  function revise(payment, newAmount, newCurrency) {
    if (!payment?.fxSnapshot) return undefined;
    if (newAmount === payment.amount && newCurrency === payment.currency) return clone(payment.fxSnapshot);
    const old = payment.fxSnapshot;
    return freeze(newAmount,newCurrency,old.displayCurrency,frozenMatrix(old),old.confirmedAt);
  }
  function createManager({storage,fetcher = (...args) => fetch(...args),now = () => Date.now(),onChange = () => {},timeoutMs = 12000} = {}) {
    let snapshot = null, error = null, cacheWarning = null, loading = false, lastAttemptAt = null, inflight = null;
    try {
      const raw = storage?.getItem(CACHE_KEY);
      if (raw !== null && raw !== undefined) snapshot = validateSnapshot(JSON.parse(raw),now());
    } catch { cacheWarning = '本地汇率缓存损坏或不可读取，未覆盖原始内容'; }
    function getState() {
      const age = snapshot ? time(now()) - Date.parse(snapshot.fetchedAt) : null;
      return {snapshot:clone(snapshot),currencies:clone(snapshot?.currencies || {}),loading,error,cacheWarning,lastAttemptAt,
        cacheState:snapshot?(age < DAY && age >= 0?'fresh':'stale'):'empty',
        coverageWarning:snapshot?.missingCurrencies?.length?'接口暂未返回 '+snapshot.missingCurrencies.join('、')+' 汇率，这些币种无法换算':null};
    }
    const notify = () => { try { onChange(getState()); } catch { /* Observers cannot invalidate a successfully fetched rate cache. */ } };
    function refresh({force = false} = {}) {
      if (inflight) return inflight;
      const clock = time(now());
      if (!force && ((snapshot && clock - Date.parse(snapshot.fetchedAt) < DAY && clock >= Date.parse(snapshot.fetchedAt)) || (lastAttemptAt !== null && clock - lastAttemptAt < RETRY_DELAY))) return Promise.resolve(getState());
      lastAttemptAt = clock; loading = true; error = null;
      notify();
      inflight = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(),timeoutMs);
        try {
          const results = await Promise.all(['/latest','/currencies'].map(async path => {
            const response = await fetcher(API+path,{signal:controller.signal,headers:{Accept:'application/json'},cache:'no-cache'});
            if (!response || !response.ok) fail('汇率请求失败（HTTP '+(response?.status || '未知')+'）');
            return response.json();
          }));
          const fetchedAt = new Date(time(now())).toISOString();
          const next = validateSnapshot({version:1,...validateLatest(results[0],now()),currencies:results[1],fetchedAt},now());
          try {
            if (!storage || typeof storage.setItem !== 'function') fail('存储不可用');
            storage.setItem(CACHE_KEY,JSON.stringify(next));
            cacheWarning = null;
          } catch { cacheWarning = '参考汇率已获取，但本地缓存保存失败；刷新页面后可能无法离线使用'; }
          snapshot = next;
        } catch (failure) {
          controller.abort();
          error = failure?.name === 'AbortError' ? '汇率请求超时；保留已有缓存' : '汇率更新失败：'+(failure?.message || '网络不可用');
        } finally {
          clearTimeout(timer);loading = false;inflight = null;notify();
        }
        return getState();
      })();
      return inflight;
    }
    return Object.freeze({getState,refresh});
  }
  return Object.freeze({CACHE_KEY,API,DAY,RETRY_DELAY,validateCurrencies,validateLatest,validateSnapshot,supported,quote,round,freeze,valuePayment,revise,createManager});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiFx;
