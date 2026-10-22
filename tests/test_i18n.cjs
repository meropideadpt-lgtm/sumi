const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const i18n=require('../i18n.js');
const resources=()=>{
  const context={};
  for(const file of ['app','statistics','errors'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../locales',file+'.js'),'utf8'),context);
  return {messages:context.SumiMessages,errors:context.SumiErrorMessages};
};
const schemaContext={URL};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data-store.js'),'utf8')+'\nglobalThis.api=SumiData;',schemaContext);
const schema=schemaContext.api;
function memory(seed={}){
  const values=new Map(Object.entries(seed));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
const prefs=(language='zh-CN',theme='light')=>({currency:'CNY',reminder:3,language,theme});
const legacy='{ "subscriptions": [{"id":"legacy", "name":"Music 中文 日本語", "amount":3.123,"currency":"JPY","months":1,"nextDate":"2026-10-31","extension":{"note":"不要翻译"}}] }';

test('locale selection supports exactly four locales and defaults safely',()=>{
  const api=i18n.create();
  for(const lang of i18n.languages){assert.equal(api.setLanguage(lang),lang);assert.equal(api.getLanguage(),lang)}
  for(const lang of ['unknown','ja',null,{},'__proto__'])assert.equal(api.setLanguage(lang),'zh-CN');
});
test('missing locale entries fall back to Chinese and missing keys never expose keys or undefined',()=>{
  const api=i18n.create({language:'en',messages:{known:{'zh-CN':'可用'},literal:{en:'Ready'}}});
  assert.equal(api.t('known'),'可用');
  assert.equal(api.t('literal'),'Ready');
  assert.equal(api.t('unknown'),'Unavailable');
  assert.equal(api.t('__proto__'),'Unavailable');
  assert.equal(api.t('unknown',{},'Readable fallback'),'Readable fallback');
});
test('placeholders preserve zero and user text without evaluating HTML or message keys',()=>{
  const api=i18n.create({language:'en',messages:{item:{en:'{name}: {count} / {missing}'}}});
  assert.equal(api.t('item',{name:'<img src=x onerror=alert(1)>',count:0}),'<img src=x onerror=alert(1)>: 0 / ');
});
test('date-only formatting uses UTC and rejects normalized or invalid calendar dates',()=>{
  for(const language of i18n.languages){
    const api=i18n.create({language});
    assert.equal(api.date('2026-10-22'),new Intl.DateTimeFormat(language,{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date('2026-10-22T12:00:00Z')));
    assert.equal(api.date('2026-01-01',{year:'numeric'}),new Intl.DateTimeFormat(language,{year:'numeric',timeZone:'UTC'}).format(new Date('2026-01-01T12:00:00Z')));
    assert.notEqual(api.date('2026-02-30'),api.date('2026-03-02'));
    assert(!/Invalid|undefined|NaN/.test(api.date('invalid')));
    assert(api.date('0001-01-01').length>0);
  }
});
test('localized money respects currency minor units and original precision overrides',()=>{
  for(const language of i18n.languages){
    const api=i18n.create({language});
    for(const currency of ['CNY','USD','JPY','TWD','KRW','EUR'])assert.equal(api.money(1234.56,currency),new Intl.NumberFormat(language,{style:'currency',currency}).format(1234.56));
    assert.equal(api.money(3.123,'JPY',{minimumFractionDigits:2,maximumFractionDigits:3}),new Intl.NumberFormat(language,{style:'currency',currency:'JPY',minimumFractionDigits:2,maximumFractionDigits:3}).format(3.123));
    assert.equal(api.number(.125,{style:'percent',maximumFractionDigits:1}),new Intl.NumberFormat(language,{style:'percent',maximumFractionDigits:1}).format(.125));
    assert(!/NaN|Infinity|undefined/.test(api.money(NaN,'CNY')));
  }
});
test('built-in categories localize for display and custom categories are unchanged',()=>{
  const api=i18n.create({language:'en'});
  assert.equal(api.category('音乐音频'),'Music & audio');
  for(const value of ['Music','My category 中文','<b>custom</b>'])assert.equal(api.category(value),value);
  api.setLanguage('ja-JP');assert.equal(api.category('云存储'),'クラウドストレージ');
});
test('every UI resource has all four languages and matching interpolation parameters',()=>{
  const {messages,errors}=resources();
  assert(Object.keys(messages).length>100);
  for(const [key,row]of Object.entries({...messages,...errors.exact})){
    const params=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    for(const language of i18n.languages){assert.equal(typeof row[language],'string',key+' '+language);assert(row[language].trim(),key+' '+language);assert.deepEqual(params(row[language]),params(row['zh-CN']),key+' '+language)}
  }
});
test('core errors and nested record or FX errors localize without exposing raw exceptions',()=>{
  const data=resources();
  for(const language of ['en','ja-JP','zh-TW']){
    const api=i18n.create({...data,language});
    for(const source of ['订阅金额无效','订阅第 2 条：订阅金额无效','请选择不超过 500KB 的图片。','无效的未知错误','SyntaxError: Unexpected token <']){
      const translated=api.error(source);assert(translated);assert(!/undefined/.test(translated));if(language==='en')assert(!/[\u4e00-\u9fff]/.test(translated),translated);
    }
  }
  const en=i18n.create({...data,language:'en'});
  assert.equal(en.error(en.error('订阅金额无效')),en.error('订阅金额无效'));
});
test('preferences-only writes preserve legacy business bytes and FX cache across all languages and themes',()=>{
  const store=memory({'sumi-data-v1':legacy,'sumi-fx-cache-v1':'raw fx cache','sumi-prefs-v1':JSON.stringify(prefs())});
  const opened=schema.open(store);assert.equal(opened.issues.length,0);
  for(const language of i18n.languages)for(const theme of ['light','dark','system']){
    opened.writePreferences(prefs(language,theme));
    assert.equal(store.getItem('sumi-data-v1'),legacy);
    assert.equal(store.getItem('sumi-fx-cache-v1'),'raw fx cache');
    assert.equal(schema.open(store).preferences.language,language);
    assert.equal(schema.open(store).preferences.theme,theme);
    assert.equal(store.getItem('sumi-write-journal-v1'),null);
  }
});
test('preferences-only writes do not create business data for an empty installation',()=>{
  const store=memory();schema.open(store).writePreferences(prefs('en','system'));
  assert.equal(store.getItem('sumi-data-v1'),null);
  assert.equal(schema.open(store).preferences.theme,'system');
});
test('failed preference saves roll back while stale and damaged stores still reject writes',()=>{
  const initial=JSON.stringify(prefs());
  const store=memory({'sumi-data-v1':legacy,'sumi-prefs-v1':initial});
  const opened=schema.open(store),set=store.setItem;
  store.setItem=(key,value)=>{if(key==='sumi-prefs-v1')throw Error('quota');set(key,value)};
  assert.throws(()=>opened.writePreferences(prefs('en','dark')),/保存失败/);
  assert.equal(store.getItem('sumi-data-v1'),legacy);assert.equal(store.getItem('sumi-prefs-v1'),initial);assert.equal(store.getItem('sumi-write-journal-v1'),null);
  store.setItem=set;store.setItem('sumi-prefs-v1',JSON.stringify(prefs('zh-TW')));
  assert.throws(()=>opened.writePreferences(prefs('en')),/其他页面/);
  const corrupt=memory({'sumi-data-v1':'{bad'});assert.throws(()=>schema.open(corrupt).writePreferences(prefs('en')),/本地订阅数据异常/);assert.equal(corrupt.getItem('sumi-data-v1'),'{bad');
});
test('invalid locale/theme values remain rejected without altering stored bytes',()=>{
  const store=memory({'sumi-data-v1':legacy,'sumi-prefs-v1':JSON.stringify(prefs())});
  const opened=schema.open(store);
  assert.throws(()=>opened.writePreferences(prefs('fr','light')),/偏好设置无效/);
  assert.throws(()=>opened.writePreferences(prefs('en','auto')),/偏好设置无效/);
  assert.equal(store.getItem('sumi-data-v1'),legacy);
});

test('English quantities use singular only for one and preserve localized counts',()=>{
  const en=i18n.create({...resources(),language:'en'});
  assert.equal(en.t('app.months',{count:'1'}),'1 month');
  assert.equal(en.t('app.months',{count:'3'}),'3 months');
  assert.equal(en.t('app.itemCount',{count:'1,000'}),'1,000 items');
  assert.equal(en.t('app.itemCount',{count:0}),'0 items');
  assert.equal(en.t('app.dueIn',{count:1}),'Renews in 1 day');
  assert.equal(en.t('stats.originalTotal',{amount:'USD 10.00',count:1}),'USD 10.00 · 1 payment');
  en.setLanguage('ja-JP');assert.equal(en.t('app.months',{count:1}),'1 か月');
});
