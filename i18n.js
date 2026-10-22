/* Display-only localization. Stored dates, category values, enums and amounts stay unchanged. */
const SumiI18n = (() => {
  const LANGUAGES = Object.freeze(['zh-CN','zh-TW','ja-JP','en']);
  const normalize = language => LANGUAGES.includes(language) ? language : 'zh-CN';
  const generic = {'zh-CN':'暂不可用','zh-TW':'暫時無法使用','ja-JP':'現在利用できません',en:'Unavailable'};
  const categories = {
    '未分类':['未分類','未分類','Uncategorized'],
    '影音娱乐':['影音娛樂','動画・エンタメ','Video & entertainment'],
    '音乐音频':['音樂與音訊','音楽・オーディオ','Music & audio'],
    'AI 工具':['AI 工具','AI ツール','AI tools'],
    '云存储':['雲端儲存','クラウドストレージ','Cloud storage'],
    '办公效率':['辦公效率','オフィス・仕事効率化','Office & productivity'],
    '工作效率':['工作效率','仕事効率化','Productivity'],
    '游戏':['遊戲','ゲーム','Gaming'],
    '设计':['設計','デザイン','Design'],
    '学习教育':['學習教育','学習・教育','Learning & education'],
    '开发工具':['開發工具','開発ツール','Developer tools'],
    '生活服务':['生活服務','暮らしのサービス','Lifestyle'],
    '其他':['其他','その他','Other']
  };
  const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const interpolate = (template, params) => template.replace(/\{([\w]+)\}/g,(_,key)=>Object.hasOwn(params,key) && params[key] != null ? String(params[key]) : '');
  function create({messages = globalThis.SumiMessages || {}, errors = globalThis.SumiErrorMessages || {}, language = 'zh-CN'} = {}) {
    let current = normalize(language);
    const getLanguage = () => current;
    const setLanguage = value => {current=normalize(value);return current};
    const textFor = values => typeof values?.[current] === 'string' && values[current] ? values[current] : typeof values?.['zh-CN'] === 'string' && values['zh-CN'] ? values['zh-CN'] : null;
    function t(key, params = {}, fallback) {
      const row=Object.hasOwn(messages,key) ? messages[key] : null;
      const count=params && Object.hasOwn(params,'count') ? Number(String(params.count).replace(/,/g,'')) : NaN;
      const plural=Number.isFinite(count) ? new Intl.PluralRules(current).select(count) : null;
      const variant=plural && row?.[current+'-'+plural];
      const value=typeof variant==='string' && variant ? variant : textFor(row);
      return interpolate(value || (typeof fallback==='string' && fallback ? fallback : generic[current]),params || {});
    }
    function number(value, options = {}) {
      if(typeof value!=='number'||!Number.isFinite(value))return generic[current];
      try{return new Intl.NumberFormat(current,options).format(value)}catch{return new Intl.NumberFormat(current).format(value)}
    }
    function money(value,currency,options = {}) {
      if(typeof value!=='number'||!Number.isFinite(value)||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))return generic[current];
      return number(value,{style:'currency',currency,...options});
    }
    function date(value,options) {
      if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return generic[current];
      const parsed=new Date(value+'T12:00:00Z');
      if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return generic[current];
      try{return new Intl.DateTimeFormat(current,{...(options || {year:'numeric',month:'2-digit',day:'2-digit'}),timeZone:'UTC'}).format(parsed)}catch{return generic[current]}
    }
    function dateTime(value,options = {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) {
      if(typeof value!=='string'||!value.trim())return generic[current];
      const parsed=new Date(value);
      if(!Number.isFinite(parsed.getTime()))return generic[current];
      try{return new Intl.DateTimeFormat(current,options).format(parsed)}catch{return generic[current]}
    }
    function category(value) {
      if(typeof value!=='string')return '';
      return current==='zh-CN' || !Object.hasOwn(categories,value) ? value : categories[value][['zh-TW','ja-JP','en'].indexOf(current)];
    }
    function isTranslated(value) {
      const groups=[...Object.values(messages),...Object.values(errors.exact||{}),...(errors.patterns||[]).map(p=>p.values)];
      return groups.some(group=>{
        const template=textFor(group);if(typeof template!=='string')return false;
        if(template===value)return true;
        const pattern=template.split(/(\{\w+\})/).map(part=>/^\{\w+\}$/.test(part)?'[\\s\\S]*':escapePattern(part)).join('');
        return pattern!==template && new RegExp('^'+pattern+'$').test(value);
      });
    }
    function error(input, depth = 0) {
      const value=typeof input==='string'?input:typeof input?.message==='string'?input.message:'';
      const fallback=textFor(errors.fallback)||generic[current];
      if(!value || depth>8)return fallback;
      if(Object.hasOwn(errors.exact||{},value))return textFor(errors.exact[value])||fallback;
      for(const pattern of errors.patterns||[]) {
        const match=new RegExp(pattern.source).exec(value);
        if(!match)continue;
        const params={};
        for(let i=1;i<match.length;i++)params[i]=(pattern.translateCaptures||[]).includes(i)?error(match[i],depth+1):(pattern.numberCaptures||[]).includes(i)?number(Number(match[i])):match[i];
        return interpolate(textFor(pattern.values)||fallback,params);
      }
      if(isTranslated(value))return value;
      // Storage can report several independent issues joined by a space.
      const prefix=Object.keys(errors.exact||{}).sort((a,b)=>b.length-a.length).find(key=>value.startsWith(key+' '));
      if(prefix)return error(prefix,depth+1)+' '+error(value.slice(prefix.length+1),depth+1);
      return fallback;
    }
    return Object.freeze({getLanguage,setLanguage,t,number,money,date,dateTime,category,error,languages:LANGUAGES});
  }
  return Object.freeze({...create(),create,normalize,languages:LANGUAGES});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SumiI18n;
