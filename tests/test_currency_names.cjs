const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const i18n=require('../i18n.js');

// The documented v1 catalogue, including historic BGN, plus app-supported TWD.
const codes='AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY TWD USD ZAR'.split(' ');
const common={
  'zh-CN':['人民币','美元','日元','港元','欧元','新台币','英镑','韩元'],
  'zh-TW':['人民幣','美元','日圓','港幣','歐元','新臺幣','英鎊','韓元'],
  'ja-JP':['人民元','米ドル','日本円','香港ドル','ユーロ','新台湾ドル','英ポンド','韓国ウォン'],
  en:['Chinese yuan','US dollar','Japanese yen','Hong Kong dollar','Euro','New Taiwan dollar','British pound','South Korean won']
};
function isolated(IntlValue){
  const context=vm.createContext({Intl:IntlValue});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8')+'\nglobalThis.api=SumiI18n;',context);
  return context.api;
}

test('common currency names and code labels match all four selected interface languages',()=>{
  for(const language of i18n.languages){
    const api=i18n.create({language});
    ['CNY','USD','JPY','HKD','EUR','TWD','GBP','KRW'].forEach((code,index)=>{
      assert.equal(api.currencyName(code),common[language][index]);
      assert.equal(api.currencyLabel(code),language==='en'?`${code} (${common[language][index]})`:`${code}（${common[language][index]}）`);
    });
  }
});

test('every current catalogue currency has a localized name even without Intl DisplayNames',()=>{
  const api=isolated({});
  for(const language of api.languages){
    api.setLanguage(language);
    for(const code of codes){
      const name=api.currencyName(code);
      assert.ok(name.length>0&&!name.includes('undefined'),`${language} ${code}`);
      assert.notEqual(name,code);
      assert.doesNotMatch(name,/未知|不明|Unknown/);
      assert.ok(api.currencyLabel(code).includes(name));
      if(language==='en')assert.doesNotMatch(name,/[\u3400-\u9fff]/);
    }
  }
});

test('additional stored and future ISO currencies use native localized names',()=>{
  for(const language of i18n.languages){
    const api=i18n.create({language});
    const displayNames=new Intl.DisplayNames(language,{type:'currency',fallback:'none'});
    for(const code of ['AED','VND','MOP','HRK','RUB','BHD','CLP','SAR']){
      assert.equal(api.currencyName(code),displayNames.of(code),`${language} ${code}`);
    }
  }
});

test('unknown codes have a readable localized name without inventing a currency or exchange rate',()=>{
  for(const [api,expected] of [[i18n,['未知货币','未知貨幣','名称不明の通貨','Unknown currency']],
    [isolated({}),['未知货币','未知貨幣','名称不明の通貨','Unknown currency']]]){
    api.languages.forEach((language,index)=>{
      api.setLanguage(language);
      assert.equal(api.currencyName('ZZZ'),expected[index]);
      assert.ok(api.currencyLabel('ZZZ').startsWith('ZZZ'));
      assert.ok(api.currencyLabel('ZZZ').includes(expected[index]));
    });
  }
});

test('failing DisplayNames constructors and missing names fall back safely',()=>{
  for(const DisplayNames of [class{constructor(){throw Error('missing')}} ,class{of(){return undefined}},class{of(code){return code}}]){
    const api=isolated({DisplayNames});api.setLanguage('en');
    assert.equal(api.currencyName('USD'),'US dollar');
    assert.equal(api.currencyName('AED'),'Unknown currency');
  }
});

test('invalid currency input never becomes executable text or a raw translation key',()=>{
  const api=i18n.create({language:'en'});
  for(const code of [null,{},'USD<script>','usd','US','__proto__','constructor',123]){
    assert.equal(api.currencyName(code),'Unknown currency');
    assert.equal(api.currencyLabel(code),'Unknown currency');
  }
});

test('dynamic name formatter is cached by language while selection does not change amount formatting',()=>{
  let constructions=0;
  class DisplayNames extends Intl.DisplayNames{constructor(...args){super(...args);constructions++}}
  const api=isolated({DisplayNames,NumberFormat:Intl.NumberFormat});
  for(const language of api.languages){
    api.setLanguage(language);
    for(let i=0;i<20;i++){api.currencyName('AED');api.currencyName('VND')}
    assert.equal(api.money(3.123,'USD',{maximumFractionDigits:3}),new Intl.NumberFormat(language,{style:'currency',currency:'USD',maximumFractionDigits:3}).format(3.123));
  }
  assert.equal(constructions,4);
  api.setLanguage('en');api.currencyName('AED');assert.equal(constructions,4);
});
