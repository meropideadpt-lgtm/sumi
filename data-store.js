/* Version-one storage remains readable. Never rewrite records during startup. */
const SumiData = (() => {
  const STORE = 'sumi-data-v1';
  const PREF = 'sumi-prefs-v1';
  const JOURNAL = 'sumi-write-journal-v1';
  const defaults = {currency:'CNY', reminder:3, theme:'light', language:'zh-CN'};
  const currencies = ['CNY','USD','JPY','HKD','TWD','EUR','GBP','KRW'];
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
    if (!currencies.includes(value.currency)) fail('订阅币种无效');
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
    if (!amount(value.amount) || !currencies.includes(value.currency)) fail('付款金额或币种无效');
    if (!date(value.date) || (value.cycleDate !== undefined && !date(value.cycleDate))) fail('付款日期无效');
    if (value.status !== undefined && !['succeeded','failed'].includes(value.status)) fail('付款状态无效');
    if (value.advancesSchedule !== undefined && typeof value.advancesSchedule !== 'boolean') fail('付款账期标记无效');
    if (value.advancesSchedule === true && value.cycleDate === undefined) fail('推进账期的付款必须关联账期日期');
    if (value.scheduleArchived !== undefined && typeof value.scheduleArchived !== 'boolean') fail('历史账期标记无效');
    if (value.scheduleArchived === true && (value.cycleDate === undefined || value.advancesSchedule !== false)) fail('历史账期必须保留日期且不能推进当前账期');
    return {...value};
  }
  function preferences(value = {}) {
    if (!object(value)) fail('偏好设置无效');
    const p = {...defaults, ...value};
    if (!currencies.includes(p.currency) || ![0,1,3,7,14].includes(p.reminder) || !['light','dark'].includes(p.theme) || p.language !== 'zh-CN') fail('偏好设置无效');
    return p;
  }
  function records(value, tolerant = false) {
    if (!object(value) || !Array.isArray(value.subscriptions) || !Array.isArray(value.payments)) fail('数据必须包含订阅和付款数组');
    const issues = [];
    const result = {...value};
    for (const [key, validate] of [['subscriptions',subscription],['payments',payment]]) {
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
          if (!tolerant) fail(`${key === 'subscriptions' ? '订阅' : '付款'}第 ${index+1} 条：${error.message}`);
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
