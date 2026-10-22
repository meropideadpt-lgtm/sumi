/* Version-one storage remains readable. Never rewrite records during startup. */
const SumiData = (() => {
  const STORE = 'sumi-data-v1';
  const PREF = 'sumi-prefs-v1';
  const JOURNAL = 'sumi-write-journal-v1';
  const defaults = {currency:'CNY', reminder:3, theme:'light', language:'zh-CN'};
  // API coverage is checked by the FX layer; syntax validation must keep old,
  // unsupported currencies readable instead of deleting their original amounts.
  const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const text = (value, label, max = 200) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + '无效');
    return value;
  };
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  };
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100;
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const timestamp = value => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && date(value.slice(0,10)) && Number.isFinite(Date.parse(value));
  const close = (a,b) => Math.abs(a-b) <= Math.max(1,Math.abs(a),Math.abs(b))*Number.EPSILON*16;
  function fxSnapshot(value, record) {
    if (!object(value) || value.version !== 1 || !['available','unavailable'].includes(value.status)
      || !['frankfurter','identity','unavailable'].includes(value.provider)) fail('付款汇率快照无效');
    if (!currency(value.sourceCurrency) || !currency(value.displayCurrency) || !currency(value.base)
      || value.sourceCurrency !== record.currency || value.sourceAmount !== record.amount) fail('付款汇率快照与原币金额不一致');
    if (!timestamp(value.confirmedAt)) fail('付款汇率确认时间无效');
    if (!object(value.rates) || !Object.keys(value.rates).length
      || Object.entries(value.rates).some(([code,rate]) => !currency(code) || !positive(rate))
      || !Object.hasOwn(value.rates,value.base) || !close(value.rates[value.base],1)) fail('付款汇率矩阵无效');
    if (value.date !== null && !date(value.date)) fail('付款参考汇率日期无效');
    if (value.fetchedAt !== null && !timestamp(value.fetchedAt)) fail('付款汇率获取时间无效');
    if ((value.date === null) !== (value.fetchedAt === null)) fail('付款汇率日期和获取时间不一致');
    if (value.date !== null) {
      const fetched = Date.parse(value.fetchedAt), latestConfirmation = Date.parse(value.confirmedAt)+5*60*1000;
      // Cache clocks can be slightly ahead, but a confirmation cannot freeze
      // rates fetched in the future. The actual payment may be backdated.
      if (fetched > latestConfirmation
        || value.date > new Date(fetched).toISOString().slice(0,10)
        || value.date > new Date(latestConfirmation).toISOString().slice(0,10)) fail('付款汇率时间顺序无效');
    }
    if (value.status === 'unavailable') {
      if (value.provider !== 'unavailable' || value.rate !== null || value.convertedAmount !== null) fail('未换算付款不能包含换算金额');
      text(value.reason,'未换算原因',400);
      return;
    }
    if (value.provider === 'unavailable' || !positive(value.rate)
      || typeof value.convertedAmount !== 'number' || !Number.isFinite(value.convertedAmount) || value.convertedAmount < 0) fail('付款换算结果无效');
    if (value.reason !== null && value.reason !== undefined) text(value.reason,'付款汇率说明',400);
    const identity = value.sourceCurrency === value.displayCurrency;
    if (value.provider === 'identity' && (!identity || value.base !== value.sourceCurrency
      || value.date !== null || value.fetchedAt !== null || Object.keys(value.rates).length !== 1)) fail('同币种付款汇率快照无效');
    if (value.provider === 'frankfurter' && (value.date === null || value.fetchedAt === null)) fail('付款参考汇率元数据缺失');
    const sourceRate = value.rates[value.sourceCurrency], targetRate = value.rates[value.displayCurrency];
    const expectedRate = identity ? 1 : (positive(sourceRate) && positive(targetRate) ? targetRate/sourceRate : null);
    if (!positive(expectedRate) || !close(value.rate,expectedRate)) fail('付款汇率与冻结矩阵不一致');
    if (identity) {
      if (value.convertedAmount !== record.amount) fail('同币种付款金额不一致');
      return;
    }
    const digits = new Intl.NumberFormat('en',{style:'currency',currency:value.displayCurrency}).resolvedOptions().maximumFractionDigits;
    const factor = 10**digits, scaled = value.convertedAmount*factor;
    const raw = record.amount*expectedRate;
    const expectedAmount = Math.round((raw+Number.EPSILON)*factor)/factor;
    if (!Number.isFinite(raw) || raw*factor > Number.MAX_SAFE_INTEGER
      || !Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled-Math.round(scaled)) > 1e-6
      || value.convertedAmount !== expectedAmount) fail('付款换算金额与冻结汇率不一致');
  }
  const formAmount = value => typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && amount(Number(value));
  const safeLogo = value => {
    if (!value) return '';
    if (typeof value !== 'string') return '';
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? value : '';
    } catch { return ''; }
  };
  function subscription(value) {
    if (!object(value)) fail('订阅记录无效');
    text(value.id, '订阅编号'); text(value.name, '订阅名称', 70);
    if (!amount(value.amount)) fail('订阅金额无效');
    if (!currency(value.currency)) fail('订阅币种无效');
    if (value.category !== undefined) text(value.category,'订阅类别',30);
    if (![1,3,6,12].includes(value.months)) fail('订阅周期无效');
    if (!date(value.nextDate)) fail('续费日期无效');
    if (value.billingAnchor !== undefined) {
      if (!date(value.billingAnchor)) fail('账期锚点无效');
      const monthsBetween = (Number(value.nextDate.slice(0,4)) - Number(value.billingAnchor.slice(0,4))) * 12
        + Number(value.nextDate.slice(5,7)) - Number(value.billingAnchor.slice(5,7));
      const end = new Date(value.nextDate + 'T12:00:00Z');
      end.setUTCMonth(end.getUTCMonth()+1, 0);
      const expectedDay = Math.min(Number(value.billingAnchor.slice(8)), end.getUTCDate());
      if (monthsBetween % value.months !== 0 || Number(value.nextDate.slice(8)) !== expectedDay) fail('续费日期与账期锚点不一致');
    }
    if (value.status !== undefined && !['active','cancelled'].includes(value.status)) fail('订阅状态无效');
    if (value.autoRenew !== undefined && typeof value.autoRenew !== 'boolean') fail('自动续费设置无效');
    if (value.logo !== undefined && (typeof value.logo !== 'string' || (value.logo && !safeLogo(value.logo)))) fail('图标地址无效');
    return {...value, status:value.status ?? 'active', autoRenew:value.autoRenew ?? true, logo:value.logo ?? ''};
  }
  function payment(value) {
    if (!object(value)) fail('付款记录无效');
    text(value.id, '付款编号'); text(value.subscriptionId, '付款订阅编号'); text(value.name, '付款名称', 70);
    if (!amount(value.amount) || !currency(value.currency)) fail('付款金额或币种无效');
    if (!date(value.date) || (value.cycleDate !== undefined && !date(value.cycleDate))) fail('付款日期无效');
    if (value.status !== undefined && !['succeeded','failed'].includes(value.status)) fail('付款状态无效');
    if (value.advancesSchedule !== undefined && typeof value.advancesSchedule !== 'boolean') fail('付款账期标记无效');
    if (value.advancesSchedule === true && value.cycleDate === undefined) fail('推进账期的付款必须关联账期日期');
    if (value.scheduleArchived !== undefined && typeof value.scheduleArchived !== 'boolean') fail('历史账期标记无效');
    if (value.scheduleArchived === true && (value.cycleDate === undefined || value.advancesSchedule !== false)) fail('历史账期必须保留日期且不能推进当前账期');
    if (value.fxSnapshot !== undefined) fxSnapshot(value.fxSnapshot,value);
    return {...value};
  }
  function costRevision(value) {
    if (!object(value)) fail('成本历史记录无效');
    text(value.id,'成本历史编号'); text(value.subscriptionId,'成本历史订阅编号');
    text(value.name,'成本历史名称',70); text(value.category,'成本历史类别',30);
    if (!amount(value.amount) || !currency(value.currency) || ![1,3,6,12].includes(value.months)) fail('成本历史金额或周期无效');
    if (!['active','cancelled','deleted'].includes(value.status) || !['baseline','created','changed','deleted'].includes(value.kind)) fail('成本历史状态无效');
    if ((value.status === 'deleted') !== (value.kind === 'deleted')) fail('成本历史删除状态不一致');
    if (!date(value.effectiveDate) || !timestamp(value.observedAt)) fail('成本历史日期无效');
    return {...value};
  }
  function preferences(value = {}) {
    if (!object(value)) fail('偏好设置无效');
    const p = {...defaults, ...value};
    if (!currency(p.currency) || ![0,1,3,7,14].includes(p.reminder) || !['light','dark'].includes(p.theme) || p.language !== 'zh-CN') fail('偏好设置无效');
    return p;
  }
  function records(value, tolerant = false) {
    if (!object(value) || !Array.isArray(value.subscriptions) || !Array.isArray(value.payments)) fail('数据必须包含订阅和付款数组');
    const issues = [];
    const result = {...value};
    const collections = [['subscriptions',subscription],['payments',payment]];
    if (value.costHistory !== undefined) {
      if (!Array.isArray(value.costHistory)) {
        if (!tolerant) fail('成本历史必须是数组');
        issues.push('成本历史必须是数组'); result.costHistory=[];
      } else collections.push(['costHistory',costRevision]);
    }
    for (const [key, validate] of collections) {
      const ids = new Set(), paidCycles = new Set();
      result[key] = [];
      value[key].forEach((record, index) => {
        try {
          const checked = validate(record);
          if (ids.has(checked.id)) fail('编号重复');
          if (key === 'payments' && checked.status !== 'failed' && checked.cycleDate !== undefined) {
            const cycleKey = JSON.stringify([checked.subscriptionId, checked.cycleDate]);
            if (paidCycles.has(cycleKey)) fail('同一订阅账期已记录成功付款');
            paidCycles.add(cycleKey);
          }
          ids.add(checked.id); result[key].push(checked);
        } catch (error) {
          if (!tolerant) fail(`${{subscriptions:'订阅',payments:'付款',costHistory:'成本历史'}[key]}第 ${index+1} 条：${error.message}`);
          issues.push(error.message);
        }
      });
    }
    return {data:result, issues};
  }
  function backup(value) {
    if (!object(value) || value.version !== 1) fail('仅支持 version 为 1 的 sumi 备份');
    return {data:records(value.data).data, preferences:preferences(value.preferences)};
  }
  function open(storage) {
    let raw = {[STORE]:null, [PREF]:null};
    let readable = true, blocked = false;
    const issues = [];
    const restore = previous => {
      for (const key of [STORE,PREF]) {
        if (storage.getItem(key) === previous[key]) continue;
        if (previous[key] === null) storage.removeItem(key);
        else storage.setItem(key, previous[key]);
      }
    };
    try {
      const pending = storage.getItem(JOURNAL);
      if (pending !== null) {
        const previous = JSON.parse(pending);
        if (!object(previous) || ![STORE,PREF].every(key => previous[key] === null || typeof previous[key] === 'string')) fail('恢复记录无效');
        raw = {[STORE]:previous[STORE], [PREF]:previous[PREF]};
        restore(previous);
        storage.removeItem(JOURNAL);
      }
      raw = {[STORE]:storage.getItem(STORE), [PREF]:storage.getItem(PREF)};
    } catch {
      readable = false; blocked = true;
      issues.push('无法安全读取本地存储或恢复上次保存。请检查浏览器存储权限后刷新；现有记录不会被覆盖。');
    }
    let data = {subscriptions:[], payments:[]}, prefs = {...defaults};
    if (readable) {
      try {
        if (raw[STORE] !== null) {
          const stored = JSON.parse(raw[STORE]);
          // Older valid stores may omit an empty collection.
          if (!object(stored)) fail('数据结构无效');
          const loaded = records({...stored, subscriptions:stored.subscriptions ?? [], payments:stored.payments ?? []}, true);
          data = loaded.data;
          if (loaded.issues.length) fail(`有 ${loaded.issues.length} 条记录无法显示`);
        }
      } catch {
        blocked = true;
        issues.push('本地订阅数据异常，已保留原始内容并暂停写入。可导出原始数据，或导入已确认完整的备份恢复。');
      }
      try { if (raw[PREF] !== null) prefs = preferences(JSON.parse(raw[PREF])); }
      catch {
        blocked = true;
        issues.push('本地偏好设置异常，已保留原始内容并暂停写入。请先导出原始数据，再通过完整备份恢复。');
      }
    }
    return {
      data, preferences:prefs, issues,
      rawBackup: () => ({version:1, raw:{...raw}}),
      write(nextData, nextPrefs, recovery = false) {
        if (!readable || (blocked && !recovery)) fail(issues.join(' '));
        const checked = records(nextData).data, p = preferences(nextPrefs);
        const next = {[STORE]:JSON.stringify(checked), [PREF]:JSON.stringify(p)};
        let journalWritten = false;
        try {
          if (storage.getItem(JOURNAL) !== null || [STORE,PREF].some(key => storage.getItem(key) !== raw[key])) {
            fail('其他页面已修改数据，请刷新后重试。当前输入尚未保存。');
          }
          if ([STORE,PREF].every(key => next[key] === raw[key])) return;
          storage.setItem(JOURNAL, JSON.stringify(raw));
          journalWritten = true;
          for (const key of [STORE,PREF]) if (next[key] !== raw[key]) storage.setItem(key, next[key]);
          storage.removeItem(JOURNAL);
        } catch (error) {
          if (journalWritten) {
            try { restore(raw); storage.removeItem(JOURNAL); }
            catch {
              readable = false; blocked = true;
              issues.push('保存恢复尚未完成，已保留恢复记录并暂停写入。请检查存储权限和空间后刷新。');
            }
          }
          if (error.message.startsWith('其他页面')) throw error;
          fail('保存失败：浏览器存储空间不足或不可用，本次更改未保存。请保留当前页面并导出备份。' + (!readable ? ' 恢复未完成，请检查存储权限后刷新。' : ''));
        }
        raw = next; blocked = false;
        issues.length = 0;
      }
    };
  }
  return {open, backup, subscription, date, formAmount, safeLogo};
})();
