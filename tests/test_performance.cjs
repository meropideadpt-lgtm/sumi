const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const i18n=require('../i18n.js');
const catalog=require('../service-catalog.js');

function countedI18n() {
  const counts={NumberFormat:0,DateTimeFormat:0,PluralRules:0};
  const tracked={};
  for(const kind of Object.keys(counts))tracked[kind]=class extends Intl[kind] {
    constructor(...args){super(...args);counts[kind]++}
  };
  const context=vm.createContext({Intl:tracked});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8')+
    '\nglobalThis.api=SumiI18n.create({language:"en",messages:{items:{en:"{count} items","en-one":"{count} item"}}});',context);
  return {counts,run:source=>vm.runInContext(source,context)};
}

test('repeated table and calendar formatting reuses Intl instances without reusing formatted values',()=>{
  const {counts,run}=countedI18n();
  run(`for(let i=0;i<100;i++){
    api.number(i,{maximumFractionDigits:2});
    api.money(i,'CNY');
    api.date('2026-10-22');
    api.t('items',{count:i});
  }`);
  assert.deepEqual(counts,{NumberFormat:2,DateTimeFormat:1,PluralRules:1});
  assert.equal(run('api.number(42,{maximumFractionDigits:2})'),'42');
  assert.equal(run("api.t('items',{count:1})"),'1 item');
  assert.equal(run("api.t('items',{count:2})"),'2 items');
});

test('formatter cache keys include language, option values and options independent of property order',()=>{
  const {counts,run}=countedI18n();
  run(`api.number(1.25,{minimumFractionDigits:2,maximumFractionDigits:3});
    api.number(1.25,{maximumFractionDigits:3,minimumFractionDigits:2});`);
  assert.equal(counts.NumberFormat,1);
  assert.equal(run('api.number(1.25,{maximumFractionDigits:0})'),'1');
  assert.equal(counts.NumberFormat,2);
  run("api.setLanguage('ja-JP');api.number(1.25,{maximumFractionDigits:0});");
  assert.equal(counts.NumberFormat,3);
  run("api.setLanguage('en');api.number(1.25,{maximumFractionDigits:0});");
  assert.equal(counts.NumberFormat,3);
  assert.equal(run(`const options={maximumFractionDigits:0};api.number(1.25,options);
    options.maximumFractionDigits=2;api.number(1.25,options);`),'1.25');
});

test('formatter cache remains bounded and retains recently used entries',()=>{
  const {counts,run}=countedI18n();
  run(`for(let i=0;i<64;i++)api.money(1,'A'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26));
    api.money(2,'AAA');api.money(1,'ZZZ');api.money(3,'AAA');`);
  assert.equal(counts.NumberFormat,65);
  run("api.money(1,'AAB')");
  assert.equal(counts.NumberFormat,66,'least recently used formatter is recreated after eviction');
});

test('native accessor, inherited and invalid option behavior is preserved',()=>{
  const api=i18n.create({language:'en'});
  let calls=0;
  const options={get maximumFractionDigits(){calls++;return 1}};
  assert.equal(api.number(1.25,options),'1.3');
  assert.equal(calls,1,'cache key does not evaluate an accessor');
  assert.equal(api.number(1.25,Object.create({maximumFractionDigits:0})),'1');
  assert.equal(api.number(1.25,{maximumFractionDigits:-1}),new Intl.NumberFormat('en').format(1.25));
  assert.equal(api.number(1.25,null),new Intl.NumberFormat('en').format(1.25));
  assert.equal(api.date('2026-10-22',{month:'bad-option'}),'Unavailable');
});

test('cached localization remains identical to native Intl across all supported languages and currencies',()=>{
  const api=i18n.create();
  for(const language of i18n.languages) {
    api.setLanguage(language);
    for(const currency of ['CNY','USD','JPY','HKD','TWD','EUR','GBP','KRW'])for(const value of [0,3.123,1234567.89]){
      const options={style:'currency',currency,maximumFractionDigits:20};
      assert.equal(api.money(value,currency,{maximumFractionDigits:20}),new Intl.NumberFormat(language,options).format(value));
    }
    const date='2026-10-22T12:34:56Z',options={year:'numeric',month:'long',day:'numeric',hour:'2-digit',timeZone:'Asia/Tokyo'};
    assert.equal(api.dateTime(date,options),new Intl.DateTimeFormat(language,options).format(new Date(date)));
  }
});

function referenceSearch(value,limit=80) {
  const query=catalog.normalize(value),count=Number.isFinite(limit)?Math.max(0,Math.min(catalog.all.length,Math.floor(limit))):12;
  if(!query)return catalog.all.slice(0,count);
  return catalog.all.map((entry,index)=>{
    const terms=[entry.name,entry.id,...entry.aliases].map(catalog.normalize);
    const rank=terms.includes(query)?0:terms.some(term=>term.startsWith(query))?1:
      terms.some(term=>term.includes(query))?2:catalog.normalize(entry.category).includes(query)?3:4;
    return {entry,index,rank};
  }).filter(item=>item.rank<4).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,count).map(item=>item.entry);
}

test('indexed and cached searches preserve previous ranking for every name, alias, prefix and category',()=>{
  for(const entry of catalog.all)for(const value of [entry.name,entry.id,...entry.aliases,entry.category]){
    for(const query of [value,value.slice(0,2),value.slice(-2)]){
      assert.deepEqual(catalog.search(query,{limit:80}),referenceSearch(query),query);
      assert.deepEqual(catalog.search(query,{limit:2}),referenceSearch(query,2),query);
    }
    const normalized=catalog.normalize(value);
    const first=catalog.all.find(item=>[item.name,item.id,...item.aliases].map(catalog.normalize).includes(normalized))||null;
    assert.equal(catalog.findExact(value),first,value);
  }
});

test('search cache is bounded, normalizes equivalent queries, and never exposes its stored array',()=>{
  const maps=[];
  class TrackedMap extends Map {constructor(...args){super(...args);maps.push(this)}}
  const context=vm.createContext({Map:TrackedMap});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../service-catalog.js'),'utf8')+'\nglobalThis.api=SumiCatalog;',context);
  const api=context.api;
  api.search(' Git-Hub ');
  const cache=maps.find(map=>map.has('github')&&Array.isArray(map.get('github')));
  assert.ok(cache);
  const cached=cache.get('github');
  const result=api.search('ＧＩＴＨＵＢ');
  assert.equal(cache.get('github'),cached);
  result.splice(0,result.length);
  assert.equal(api.search('github')[0].id,'github');
  assert.ok(Object.isFrozen(cached));
  for(let i=0;i<100;i++)api.search('custom-service-'+i);
  assert.equal(cache.size,64);
  assert.equal(cache.has('github'),false);
  assert.equal(api.search('github')[0].id,'github');
  assert.equal(cache.size,64);
});
