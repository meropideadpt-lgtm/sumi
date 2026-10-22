const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../i18n.js');
const errors = require('../locales/errors.js');
const languages = ['zh-CN', 'zh-TW', 'ja-JP', 'en'];
const localized = language => i18n.create({errors, language});

// Derive coverage from the core modules, so adding a validation or storage error
// without a resource entry fails independently of the presentation code.
test('all static core errors and generated invalid-field errors have translations', () => {
  const required = new Map();
  for (const filename of ['data-store.js', 'billing.js', 'statistics.js', 'exchange.js', 'logo-upload.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    for (const match of source.matchAll(/(?:fail|unavailable|issues\.push)\('([^']*[\u3400-\u9fff][^']*)'\)/g)) {
      required.set(match[1], filename);
    }
    for (const match of source.matchAll(/text\([^,]+,\s*'([^']+)'/g)) {
      required.set(match[1] + '无效', filename);
    }
    for (const match of source.matchAll(/cacheWarning\s*=\s*'([^']*[\u3400-\u9fff][^']*)'/g)) {
      required.set(match[1], filename);
    }
  }
  assert(required.size >= 100, 'Core error extraction must exercise the expected modules.');
  for (const [message, filename] of required) {
    assert(Object.hasOwn(errors.exact, message), `${filename}: missing translation for ${message}`);
    for (const language of languages) assert(errors.exact[message][language]?.trim(), `${language}: ${message}`);
  }
});

test('error catalogs have complete languages, matching parameters and readable English', () => {
  const params = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const row of [...Object.values(errors.exact), ...errors.patterns.map(pattern => pattern.values), errors.fallback]) {
    for (const language of languages) {
      assert.equal(typeof row[language], 'string');
      assert(row[language].trim());
      assert(!/undefined/.test(row[language]));
      assert.deepEqual(params(row[language]), params(row['zh-CN']));
    }
    assert(!/[\u3400-\u9fff]/u.test(row.en), row.en);
  }
  for (const pattern of errors.patterns) assert.doesNotThrow(() => new RegExp(pattern.source));
});

test('record errors retain record types and localize nested validation details and counts', () => {
  const api = localized('en');
  assert.equal(api.error('订阅第 10000 条：订阅金额无效'), 'Subscription record 10,000: The subscription amount is invalid.');
  assert.equal(api.error('付款第 2 条：付款日期无效'), 'Payment record 2: The payment date is invalid.');
  assert.equal(api.error('成本历史第 3 条：编号重复'), 'Cost-history record 3: Duplicate ID.');
  assert.equal(api.error('有 1234 条记录无法显示'), '1,234 records cannot be displayed.');
  for (const language of languages) {
    const local = localized(language);
    const message = local.error('付款第 2 条：付款日期无效');
    assert(message.includes(local.number(2)));
    assert(message.includes(local.error('付款日期无效')));
  }
});

test('nested FX failures translate known causes and preserve HTTP status as a code', () => {
  const api = localized('en');
  assert.equal(api.error('汇率更新失败：汇率请求失败（HTTP 503）'), 'Exchange-rate update failed: The exchange-rate request failed (HTTP 503).');
  assert.equal(api.error('汇率更新失败：汇率请求失败（HTTP 未知）'), 'Exchange-rate update failed: The exchange-rate request failed (HTTP unknown).');
  assert.equal(api.error('汇率更新失败：接口汇率日期无效'), 'Exchange-rate update failed: The API exchange-rate date is invalid.');
  assert.equal(api.error('汇率更新失败：Failed to fetch'), 'Exchange-rate update failed: The network is unavailable.');
  assert.equal(api.error('汇率更新失败：Unexpected end of JSON input'), 'Exchange-rate update failed: The data is not valid JSON. Check its contents and try again.');
});

test('multiple independent storage issues retain each localized recovery instruction', () => {
  const dataIssue = '本地订阅数据异常，已保留原始内容并暂停写入。可导出原始数据，或导入已确认完整的备份恢复。';
  const preferenceIssue = '本地偏好设置异常，已保留原始内容并暂停写入。请先导出原始数据，再通过完整备份恢复。';
  const recoveryIssue = '保存恢复尚未完成，已保留恢复记录并暂停写入。请检查存储权限和空间后刷新。';
  for (const language of languages) {
    const api = localized(language);
    const combined = [dataIssue, preferenceIssue, recoveryIssue].join(' ');
    assert.equal(api.error(combined), [dataIssue, preferenceIssue, recoveryIssue].map(issue => api.error(issue)).join(' '));
  }
});

test('failed saves retain the additional incomplete-recovery warning', () => {
  const save = '保存失败：浏览器存储空间不足或不可用，本次更改未保存。请保留当前页面并导出备份。';
  const recovery = '恢复未完成，请检查存储权限后刷新。';
  for (const language of languages) {
    const api = localized(language);
    assert.equal(api.error(save + ' ' + recovery), api.error(save) + ' ' + api.error(recovery));
  }
});

test('unknown network failures use a stable localized fallback without leaking raw exceptions', () => {
  for (const language of languages) {
    const api = localized(language);
    const raw = 'Internal gateway details <script>secret()</script>';
    for (const input of [raw, undefined, {}, '__proto__', new Error(raw)]) assert.equal(api.error(input), errors.fallback[language]);
    const nested = api.error('汇率更新失败：' + raw);
    assert(nested.includes(errors.fallback[language]));
    assert(!nested.includes(raw));
    assert(!/undefined|secret\(\)/.test(nested));
  }
});

test('currency data is preserved across translations without mutating payment reasons', () => {
  const payment = Object.freeze({currency:'TWD', name:'音乐 Music 日本語', fxSnapshot:Object.freeze({reason:'接口或此份汇率未支持 TWD，无法换算'})});
  const before = JSON.stringify(payment);
  for (const language of languages) {
    const api = localized(language);
    assert(api.error(payment.fxSnapshot.reason).includes('TWD'));
    assert(api.error('接口暂未返回 TWD、KRW 汇率，这些币种无法换算').includes('TWD、KRW'));
    assert.equal(JSON.stringify(payment), before);
  }
});

test('already localized exact and parameterized errors remain readable when caught again', () => {
  for (const language of languages) {
    const api = localized(language);
    for (const original of ['图标地址无效', '订阅第 12 条：订阅名称无效', '汇率更新失败：汇率请求失败（HTTP 503）']) {
      const once = api.error(original);
      assert.equal(api.error(once), once);
    }
  }
});
