const $=s=>document.querySelector(s);const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const storage=SumiData.open({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
let data=storage.data,preferences=storage.preferences,view='home',filter='',statusFilter='all',modal=null,detailId=null,picker=false,selectedLogo='',pickerSearch='',calOffset=0,formDraft=null,paymentModal=null,paymentDraft=null,confirming=false,uploadGeneration=0,logoUploading=false,logoError='',suggestionsOpen=false,suggestionIndex=-1,suggestionResults=[],nameComposing=false,pickerComposing=false,fxRenderPending=false,uiReady=false,statsFilters={mode:'year',year:today().slice(0,4),month:today().slice(0,7),start:today().slice(0,4)+'-01-01',end:today(),error:''};
const currencySymbol={CNY:'¥',USD:'$',JPY:'¥',HKD:'HK$',TWD:'NT$',EUR:'€',GBP:'£',KRW:'₩'};
const converted=(amount,from,to=preferences.currency)=>referenceQuote(Number(amount),from,to).rawAmount;
const original=(amount,cur)=>`${cur} ${Number(amount).toFixed(2)}`;
const active=s=>s.status!=='cancelled';
const monthly=s=>{const value=converted(s.amount,s.currency);return value===null?null:value/s.months};
const total=()=>{const values=data.subscriptions.filter(active).map(monthly);return values.some(value=>value===null)?null:values.reduce((sum,value)=>sum+value,0)};
const moneyDisplay=value=>typeof value!=='number'||!Number.isFinite(value)?'待换算':`${currencySymbol[preferences.currency]||preferences.currency} ${value.toLocaleString('zh-CN',{minimumFractionDigits:new Intl.NumberFormat('en',{style:'currency',currency:preferences.currency}).resolvedOptions().maximumFractionDigits,maximumFractionDigits:new Intl.NumberFormat('en',{style:'currency',currency:preferences.currency}).resolvedOptions().maximumFractionDigits})}`;
const daysUntil=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000);const id=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());const nav=[['home','home','首页'],['list','list','订阅列表'],['stats','stats','统计'],['calendar','calendar','日历'],['settings','settings','设置']];
function render(){document.body.classList.toggle('dark',preferences.theme==='dark');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">sumi</div><nav class="nav" aria-label="主导航">${nav.map(([k,i,t])=>`<button class="${view===k?'active':''} ${k==='settings'?'settings-link':''}" data-nav="${k}"><span class="symbol">${sumiIcon(i)}</span>${t}</button>`).join('')}</nav></aside><main class="main view-${view}">${storage.issues.length?`<div class="storage-notice" role="alert">${storage.issues.map(esc).join(" ")} <button class="linkbtn" id="exportRaw">导出原始数据</button></div>`:""}<header class="top"><div><h1>${{home:'首页',list:'订阅列表',stats:'统计',calendar:'日历',settings:'设置'}[view]}</h1><p class="sub">${{home:'轻松管理每一份订阅',list:'你的所有订阅，一目了然',stats:'了解你的订阅支出',calendar:'查看即将到来的续费',settings:'个性化你的 sumi'}[view]}</p></div>${view!=='settings'?`<button class="primary" data-add>${sumiIcon('plus')}添加订阅</button>`:''}</header>${({home:homePage,list:listPage,stats:statsPage,calendar:calendarPage,settings:settingsPage})[view]()}</main></div>${modal?modalHtml():''}${detailId?detailHtml():''}${picker?pickerHtml():''}${paymentModal?paymentHtml():''}`;bind()};const metrics=()=>{let a=data.subscriptions.filter(active),next=[...a].filter(s=>s.nextDate).sort((x,y)=>x.nextDate.localeCompare(y.nextDate))[0];return `<div class="cards ${view==='home'?'home-metrics':''}"><div class="card"><div class="card-title">平均每月订阅成本</div><div class="metric">${moneyDisplay(total())}</div><div class="small">按订阅周期分摊 · 参考汇率</div></div><div class="card"><div class="card-title">正在订阅</div><div class="metric">${a.length} <span style="font-size:15px;color:#91a0b4">项</span></div><div class="small">仅包含有效订阅</div></div><div class="card"><div class="card-title">下次续费</div><div class="metric" style="font-size:24px">${next?esc(next.nextDate):'暂无'}</div><div class="small">${next?esc(next.name):'添加订阅以开始'}</div></div></div>`};function reminders(){let list=data.subscriptions.filter(s=>active(s)&&daysUntil(s.nextDate)<=Number(preferences.reminder)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));return list.length?`<div class="reminders"><div style="font-weight:650;margin-bottom:8px">${sumiIcon('bell')}续费提醒 <span class="pill">${list.length} 项待关注</span></div>${list.map(s=>`<div class="reminder-item"><div><strong style="font-size:13px">${esc(s.name)}</strong><div class="notice">${daysUntil(s.nextDate)<0?'已过续费日 · 待确认':daysUntil(s.nextDate)===0?'今天续费':daysUntil(s.nextDate)+' 天后续费'} · ${esc(original(s.amount,s.currency))}</div></div><button class="secondary" data-detail="${esc(s.id)}">查看</button></div>`).join('')}</div>`:''}
function table(){let list=data.subscriptions.filter(s=>(statusFilter==='all'||(statusFilter==='active'?active(s):!active(s)))&&s.name.toLowerCase().includes(filter.toLowerCase()));return `<div class="card section ${view==='home'?'home-table':''}"><div class="section-title"><h2>我的订阅</h2><div class="tools"><input class="search" id="search" value="${esc(filter)}" placeholder="搜索订阅..."/><select class="select" id="statusFilter"><option value="all" ${statusFilter==='all'?'selected':''}>全部订阅</option><option value="active" ${statusFilter==='active'?'selected':''}>订阅中</option><option value="cancelled" ${statusFilter==='cancelled'?'selected':''}>已取消</option></select></div></div><div class="table-wrap"><table class="table"><thead><tr><th>订阅服务</th><th>费用</th><th>平均月成本</th><th>下次续费</th><th>状态</th></tr></thead><tbody>${list.map(s=>`<tr data-detail="${esc(s.id)}"><td><div class="service">${logoMarkup(s.name,s.logo)}${esc(s.name)}</div></td><td>${esc(original(s.amount,s.currency))} / ${esc(s.months)}月</td><td>${moneyDisplay(monthly(s))}</td><td>${esc(s.nextDate)}</td><td><span class="tag ${active(s)?'':'off'}">${active(s)?'订阅中':'已取消'}</span></td></tr>`).join('')}</tbody></table>${!list.length?'<div class="empty">暂无订阅，点击右上角「添加订阅」开始吧</div>':''}</div></div>`}const homePage=()=>metrics()+mobileSummary()+`<div class="section home-reminders">${reminders()}</div>`+chart()+table()+mobileSubscriptions();const listPage=()=>table();function calendarPage(){let d=new Date();d.setDate(1);d.setMonth(d.getMonth()+calOffset);const y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();let cells=Array.from({length:first},()=>'<div></div>');for(let day=1;day<=days;day++){let date=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,items=data.subscriptions.filter(s=>active(s)&&s.nextDate===date);cells.push(`<div class="calendar-cell"><b>${day}</b>${items.map(s=>`<button class="calendar-event" data-detail="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>`)}return `<div class="card"><div class="section-title"><h2>${y} 年 ${m+1} 月</h2><div class="month-switch"><button class="secondary" data-month="-1" aria-label="上一月">${sumiIcon('chevron-left')}</button><button class="secondary" data-month="1" aria-label="下一月">${sumiIcon('chevron-right')}</button></div></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<div class="small" style="text-align:center">周${x}</div>`).join('')}${cells.join('')}</div><p class="note">日历目前展示记录中的下一次续费日期。</p></div>`}
function settingsPage(){return `<div class="card"><div class="settings-row"><label for="language">语言</label><select class="select" id="language"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文（待完善）</option><option value="ja">日本語（待完善）</option><option value="en">English（待完善）</option></select></div><div class="settings-row"><label for="currency">统计展示币种</label><select class="select" id="currency">${currencyOptions(preferences.currency)}</select></div>${fxPanel()}<div class="settings-row"><label for="theme">暗黑模式</label><select class="select" id="theme"><option value="light" ${preferences.theme==='light'?'selected':''}>关闭</option><option value="dark" ${preferences.theme==='dark'?'selected':''}>开启</option></select></div><div class="settings-row"><label for="reminder">续费提醒（仅站内）</label><select class="select" id="reminder">${[0,1,3,7,14].map(x=>`<option value="${x}" ${Number(preferences.reminder)===x?'selected':''}>${x?'提前 '+x+' 天':'当天'}</option>`).join('')}</select></div><div class="settings-row"><label>备份与恢复</label><div class="tools"><button class="secondary" id="export">${storage.issues.length?'导出原始数据':'导出 JSON'}</button><button class="secondary" id="import">导入 JSON</button><input id="importFile" type="file" accept=".json,application/json" hidden></div></div><p class="note">订阅和付款原始金额不会随展示币种修改。数据保存在本浏览器，请定期备份。</p></div>`}
function modalHtml(){let s=formDraft||(modal==='new'?{name:'',amount:'',currency:'CNY',months:1,nextDate:today(),status:'active',autoRenew:true,logo:''}:data.subscriptions.find(x=>x.id===modal));if(!s)return '';return `<div class="overlay" id="modalOverlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="subscriptionTitle"><div class="modal-head"><h2 id="subscriptionTitle">${modal==='new'?'添加订阅':'编辑订阅'}</h2><button class="iconbtn" data-close aria-label="关闭订阅表单">${sumiIcon('close')}</button></div><form id="subscriptionForm"><div class="form-grid"><div><label class="small">软件图标</label><button class="logo-picker" type="button" id="openPicker" aria-label="选择或更换订阅图标">${logoMarkup(s.name,s.logo)}</button></div><div class="field service-autocomplete"><label for="name">订阅名称</label><input id="name" required maxlength="70" value="${esc(s.name)}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="suggestions" aria-expanded="false"><div id="suggestions" class="service-suggestions" role="listbox" aria-label="匹配的订阅服务" hidden></div></div><div class="field"><label for="formCurrency">原始货币</label><select id="formCurrency">${currencyOptions(s.currency)}</select></div><div class="field" style="grid-column:2"><label for="nextDate">下次续费日期</label><input id="nextDate" type="date" min="0001-01-01" max="9999-12-31" required value="${esc(s.nextDate)}"></div><div class="field"><label for="amount">金额</label><input id="amount" type="number" required min="0" step="0.01" value="${esc(s.amount)}"></div><div class="field" style="grid-column:2"><label for="months">订阅周期</label><select id="months">${[1,3,6,12].map(n=>`<option value="${n}" ${Number(s.months)===n?'selected':''}>${n} 个月</option>`).join('')}</select></div><div class="field"><label for="status">订阅状态</label><select id="status"><option value="active" ${active(s)?'selected':''}>订阅中</option><option value="cancelled" ${!active(s)?'selected':''}>已取消</option></select></div><div class="field" style="grid-column:2"><label for="autoRenew">自动续费</label><select id="autoRenew"><option value="true" ${s.autoRenew?'selected':''}>开启</option><option value="false" ${!s.autoRenew?'selected':''}>关闭</option></select></div></div><div class="field category-field"><label for="category">订阅类别</label><input id="category" maxlength="30" value="${esc(s.category||'未分类')}" list="categoryOptions"><datalist id="categoryOptions">${['未分类','影音娱乐','工作效率','云存储','开发工具','生活服务','其他'].map(value=>`<option value="${value}"></option>`).join('')}</datalist></div><div class="modal-actions"><button class="secondary" type="button" data-close>取消</button><button class="primary" type="submit">${modal==='new'?'添加':'保存修改'}</button></div></form></div></div>`}
function shortDate(value){return value?`${Number(value.slice(5,7))}月${Number(value.slice(8,10))}日`:'暂无'}
function mobileSummary(){
  const subscriptions=data.subscriptions.filter(active),next=[...subscriptions].sort((a,b)=>a.nextDate.localeCompare(b.nextDate))[0];
  return `<section class="mobile-summary" aria-label="订阅摘要"><div class="summary-cost"><span class="small">平均每月</span><strong>${moneyDisplay(total())}</strong></div><div class="summary-count"><span class="small">活跃订阅</span><strong>${subscriptions.length} 项</strong></div><div class="summary-next"><span class="small">下次续费</span><strong>${next?esc(shortDate(next.nextDate)):'暂无'}</strong><span class="small">${next?esc(next.name):'添加订阅以开始'}</span></div></section>`;
}
function mobileSubscriptions(){
  const list=data.subscriptions.filter(active).sort((a,b)=>a.nextDate.localeCompare(b.nextDate)).slice(0,3);
  return `<section class="mobile-subscriptions"><header class="section-title"><h2>我的订阅</h2><button data-show-subscriptions class="linkbtn">查看全部</button></header>${list.length?list.map(s=>`<button class="mobile-subscription" data-detail="${esc(s.id)}"><span class="service">${logoMarkup(s.name,s.logo)}<span class="mobile-service-name">${esc(s.name)}</span></span><span class="mobile-service-price">${esc(original(s.amount,s.currency))}<span class="small">${esc(shortDate(s.nextDate))}续费</span></span></button>`).join(''):'<p class="empty">暂无订阅，添加一份开始吧</p>'}</section>`;
}
function scheduleFor(subscription,payments){
  if(subscription.billingAnchor)return {...subscription};
  // Reuse a historical original day only when it matches the saved current schedule.
  const prior=payments.filter(p=>p.subscriptionId===subscription.id&&p.cycleDate&&p.advancesSchedule!==false&&p.scheduleArchived!==true&&SumiBilling.successful(p)).sort((a,b)=>a.cycleDate.localeCompare(b.cycleDate));
  const anchor=prior.find(p=>SumiBilling.isScheduledCycle({...subscription,billingAnchor:p.cycleDate},subscription.nextDate));
  return {...subscription,billingAnchor:anchor?.cycleDate||subscription.nextDate};
}
function changePayment(next,record,previous=null){
  const subscription=next.subscriptions.find(s=>s.id===(record||previous).subscriptionId);
  if(!subscription)throw Error('找不到对应订阅，请刷新后重试。');
  const linked=Boolean(record?.cycleDate||previous?.cycleDate);
  const schedule=linked?scheduleFor(subscription,next.payments):subscription;
  const sameAssociation=previous&&record&&previous.cycleDate===record.cycleDate;
  const belongs=Boolean(record?.cycleDate)&&SumiBilling.isScheduledCycle(schedule,record.cycleDate);
  if(record?.cycleDate&&!belongs&&!sameAssociation)throw Error('对应账期不属于此订阅的续费周期，请检查原始续费日。');
  if(record&&SumiBilling.successful(record)&&record.cycleDate&&SumiBilling.hasSuccessfulPayment(next.payments.filter(p=>p.id!==previous?.id),subscription.id,record.cycleDate))throw Error('该续费周期已记录付款');
  if(previous)next.payments=next.payments.filter(p=>p.id!==previous.id);
  if(record)next.payments.push(record);
  if(!linked)return;
  let start=subscription.nextDate;
  const removedCoverage=previous&&SumiBilling.successful(previous)&&previous.advancesSchedule!==false&&previous.scheduleArchived!==true&&previous.cycleDate&&(!record||!SumiBilling.successful(record)||record.cycleDate!==previous.cycleDate);
  if(removedCoverage&&SumiBilling.isScheduledCycle(schedule,previous.cycleDate)&&previous.cycleDate<start)start=previous.cycleDate;
  if((removedCoverage&&SumiBilling.isScheduledCycle(schedule,previous.cycleDate))||(record&&SumiBilling.successful(record)&&belongs&&record.advancesSchedule!==false&&record.scheduleArchived!==true)){
    subscription.billingAnchor=schedule.billingAnchor;
    subscription.nextDate=SumiBilling.advancePastPaid(schedule,next.payments,start);
  }
}
function paymentHistoryRow(p){
  const succeeded=SumiBilling.successful(p);
  return `<div class="payment" data-payment-id="${esc(p.id)}"><div>${esc(p.date)}<div class="small">${succeeded?'付款成功':'付款失败'}${p.scheduleArchived?' · 旧账期':''}${p.cycleDate?' · 账期 '+esc(p.cycleDate):' · 未关联账期'}</div></div><div><strong>${esc(original(p.amount,p.currency))}</strong>${paymentFxNote(p)}<div class="payment-actions"><button class="linkbtn" data-edit-payment="${esc(p.id)}">编辑</button><button class="linkbtn" data-remove-payment="${esc(p.id)}">删除</button></div></div></div>`;
}
function detailHtml(){
  const s=data.subscriptions.find(x=>x.id===detailId);if(!s)return '';
  const history=data.payments.filter(p=>p.subscriptionId===s.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="drawer-overlay" id="drawerOverlay"><div class="drawer" role="dialog" aria-modal="true" aria-label="订阅详情"><div class="drawer-header"><strong>订阅详情</strong><button class="iconbtn" data-close-detail aria-label="关闭订阅详情">${sumiIcon('close')}</button></div><div class="detail-hero">${logoMarkup(s.name,s.logo)}<div><h2>${esc(s.name)}</h2><span class="tag ${active(s)?'':'off'}">${active(s)?'订阅中':'已取消'}</span></div></div><div class="detail-price"><div class="small">平均每月成本</div><strong>${moneyDisplay(monthly(s))}</strong><div class="small">${esc(original(s.amount,s.currency))} / ${esc(s.months)}个月 · 参考汇率</div></div>${[['下次续费',s.nextDate],['订阅周期',s.months+' 个月'],['自动续费',s.autoRenew?'开启':'关闭'],['订阅状态',active(s)?'订阅中':'已取消']].map(([a,b])=>`<div class="detail-row"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('')}<div class="section-title section"><h2>付款历史</h2><button class="linkbtn" data-payment>${sumiIcon('plus')}补录付款</button></div>${history.length?history.map(paymentHistoryRow).join(''):'<div class="empty">暂无付款记录</div>'}<div class="stack section">${active(s)?`<button class="primary" data-confirm data-cycle="${esc(s.nextDate)}" ${confirming?'disabled':''}>${sumiIcon('check')}确认本次续费成功</button><button class="secondary" data-fail-payment>${sumiIcon('warning')}记录本次付款失败</button>`:''}<button class="secondary" data-edit>${sumiIcon('edit')}编辑订阅</button><button class="secondary" data-toggle>${sumiIcon(active(s)?'pause':'play')}${active(s)?'标记为已取消':'恢复订阅'}</button><button class="secondary" data-delete style="color:#c97d7d">${sumiIcon('trash')}删除订阅</button></div><p class="note">这里只记录付款结果，不会实际扣费。每次成功确认仅结清对应账期；逾期账期逐期处理，失败不推进日期。取消仅更改本地状态，恢复后保留原账期。删除或改为失败的关联付款会重新打开对应账期。</p></div></div>`;
}
function paymentHtml(){
  const subscription=data.subscriptions.find(s=>s.id===detailId);if(!paymentModal||!subscription)return '';
  const old=paymentModal==='new'?null:data.payments.find(p=>p.id===paymentModal);
  const p=paymentDraft||old||{date:today(),amount:'',currency:subscription.currency,cycleDate:'',status:'succeeded'};
  return `<div class="overlay payment-overlay" id="paymentOverlay"><div class="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="paymentTitle"><div class="modal-head"><h2 id="paymentTitle">${old?'编辑付款记录':'补录付款'}</h2><button class="iconbtn" data-close-payment aria-label="关闭付款表单">${sumiIcon('close')}</button></div><form id="paymentForm"><div class="field"><label for="paymentDate">实际付款日期</label><input id="paymentDate" type="date" required min="0001-01-01" max="${today()}" value="${esc(p.date)}"></div><div class="field"><label for="paymentAmount">付款金额</label><input id="paymentAmount" type="number" required min="0" step="${old?'any':'0.01'}" value="${esc(p.amount)}"></div><div class="field"><label for="paymentCurrency">原始货币</label><select id="paymentCurrency">${currencyOptions(p.currency)}</select></div><div class="field"><label for="paymentCycleDate">对应账期（可选）</label><input id="paymentCycleDate" type="date" min="0001-01-01" max="9999-12-31" value="${esc(p.cycleDate||'')}"></div><div class="field"><label for="paymentStatus">付款结果</label><select id="paymentStatus"><option value="succeeded" ${SumiBilling.successful(p)?'selected':''}>付款成功</option><option value="failed" ${p.status==='failed'?'selected':''}>付款失败</option></select></div><p class="note">${old?.scheduleArchived?'这条记录属于旧账期设置，保持原账期时不会影响当前续费日；修改对应账期可关联当前设置。':''}关联账期后，成功付款会推进至下一未付款账期。留空则仅补记历史，不推算账期。失败记录不计入实际付款。</p><div class="modal-actions"><button class="secondary" type="button" data-close-payment>取消</button><button class="primary" type="submit">保存付款记录</button></div></form></div></div>`;
}

function neutralLogo(name){return `<span class="logo fallback" role="img" aria-label="${esc(name?name+'：暂无图标':'暂无图标')}">${sumiIcon('image')}</span>`}
function resolvedLogo(url){
  const local=SumiCatalog.all.find(service=>service.logo&&service.legacyUrls?.includes(url));
  return local?.logo||url;
}
function logoMarkup(name,url){
  const source=resolvedLogo(url);
  return SumiData.safeLogo(source)?`<img class="logo" src="${esc(source)}" alt="${esc(name||'订阅')} Logo" decoding="async" referrerpolicy="no-referrer" data-logo-image data-logo-name="${esc(name||'')}">`:neutralLogo(name);
}
function statisticsLogo(name,subscriptionId){
  const subscription=data.subscriptions.find(item=>item.id===subscriptionId);
  return logoMarkup(name,subscription?subscription.logo:SumiCatalog.findExact(name)?.logo);
}
function closeSuggestions(){
  suggestionsOpen=false;suggestionIndex=-1;suggestionResults=[];
  const list=$('#suggestions'),input=$('#name');
  if(list){list.hidden=true;list.innerHTML=''}
  input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');
}
function chooseService(service){
  if(!service||!$('#name'))return;
  uploadGeneration++;selectedLogo=service.logo||'';
  $('#name').value=service.name;
  if(!$('#category').value.trim()||$('#category').value==='未分类')$('#category').value=service.category;
  captureDraft();closeSuggestions();
  $('#openPicker').innerHTML=logoMarkup(service.name,selectedLogo);bindLogos();
  $('#name').focus();$('#name').setSelectionRange(service.name.length,service.name.length);
  closeSuggestions();
}
function updateSuggestions(reset=true){
  const input=$('#name'),list=$('#suggestions');if(!input||!list||picker)return;
  if(nameComposing||!input.value.trim()){closeSuggestions();return}
  suggestionResults=SumiCatalog.search(input.value,{limit:6});suggestionsOpen=true;
  if(reset)suggestionIndex=-1;
  suggestionIndex=Math.min(suggestionIndex,suggestionResults.length-1);
  list.hidden=false;input.setAttribute('aria-expanded','true');
  list.innerHTML=suggestionResults.length?suggestionResults.map((service,index)=>`<button type="button" role="option" tabindex="-1" id="service-option-${esc(service.id)}" aria-selected="${index===suggestionIndex}" class="service-suggestion ${index===suggestionIndex?'is-active':''}" data-suggest="${esc(service.id)}">${logoMarkup(service.name,service.logo)}<span class="suggestion-copy"><strong>${esc(service.name)}</strong><span class="small">${esc(service.category)}</span></span></button>`).join(''):'<p class="suggestion-empty" role="status">未找到匹配服务，可直接使用自定义名称。</p>';
  if(suggestionIndex>=0)input.setAttribute('aria-activedescendant','service-option-'+suggestionResults[suggestionIndex].id);else input.removeAttribute('aria-activedescendant');
  list.querySelectorAll('[data-suggest]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')event.preventDefault()});
    button.onclick=()=>chooseService(SumiCatalog.get(button.dataset.suggest));
  });
  bindLogos();
}
function bindServiceSearch(){
  const input=$('#name');if(!input)return;
  input.addEventListener('compositionstart',()=>{nameComposing=true;closeSuggestions()});
  input.addEventListener('compositionend',()=>{nameComposing=false;captureDraft();updateSuggestions();if(fxRenderPending)setTimeout(()=>{if(fxRenderPending)refreshFxView()},0)});
  input.addEventListener('input',event=>{if(!event.isComposing&&!nameComposing)updateSuggestions()});
  input.addEventListener('focus',()=>{if(!nameComposing)updateSuggestions(false)});
  input.addEventListener('keydown',event=>{
    if(event.isComposing||nameComposing)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(!suggestionsOpen)updateSuggestions();
      if(!suggestionResults.length)return;
      suggestionIndex=(suggestionIndex+(event.key==='ArrowDown'?1:suggestionIndex<0?0:-1)+suggestionResults.length)%suggestionResults.length;
      updateSuggestions(false);$('#service-option-'+suggestionResults[suggestionIndex].id)?.scrollIntoView({block:'nearest'});
    }else if(event.key==='Enter'&&suggestionsOpen&&suggestionIndex>=0){event.preventDefault();chooseService(suggestionResults[suggestionIndex])}
    else if(event.key==='Escape'&&suggestionsOpen){event.preventDefault();event.stopPropagation();closeSuggestions()}
    else if(event.key==='Tab')closeSuggestions();
  });
  // Collapse an in-flow panel only after the pointer gesture has activated its target.
  $('#subscriptionForm').addEventListener('click',event=>{if(!event.target.closest('.service-autocomplete'))closeSuggestions()});
  if(suggestionsOpen)updateSuggestions(false);
}
function pickerResultsHtml(){
  const list=SumiCatalog.search(pickerSearch,{limit:80});
  return list.length?list.map(service=>`<button type="button" class="pick-item" data-pick="${esc(service.id)}" aria-label="选择 ${esc(service.name)} 图标">${logoMarkup(service.name,service.logo)}<span>${esc(service.name)}</span><span class="small">${esc(service.category)}</span></button>`).join(''):'<p class="picker-empty small">没有匹配的服务，可上传自己的图片或保留中性图标。</p>';
}
function pickerHtml(){return `<div class="overlay" id="pickerOverlay"><div class="modal logo-modal" role="dialog" aria-modal="true" aria-labelledby="pickerTitle"><div class="modal-head"><h2 id="pickerTitle">选择图标</h2><button type="button" class="iconbtn" id="closePicker" aria-label="关闭图标选择">${sumiIcon('close')}</button></div><div class="picker-current">${logoMarkup(formDraft?.name,selectedLogo)}<div><strong>当前图标</strong><p class="small">${selectedLogo?'可替换或移除':'尚未选择图标'}</p></div></div><label class="small" for="pickerSearch">搜索服务图标</label><input class="search" id="pickerSearch" placeholder="搜索中文、英文或常见别名" value="${esc(pickerSearch)}" autocomplete="off"><div class="picker-grid" id="pickerResults">${pickerResultsHtml()}</div><div class="logo-actions"><button type="button" class="secondary" id="chooseUpload">${sumiIcon('upload')}${selectedLogo?'替换为自定义图片':'上传自己的图片'}</button><button type="button" class="secondary" id="removeLogo" ${selectedLogo?'':'disabled'}>${sumiIcon('trash')}移除图标</button><input id="uploadLogo" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><p id="logoUploadStatus" class="logo-upload-status small" role="status">${logoUploading?'正在检查图片…':''}</p><p id="logoError" class="logo-error" role="alert" ${logoError?'':'hidden'}>${esc(logoError)}</p><p class="note">支持静态 PNG、JPEG、WebP，最大 500 KB，单边不超过 4096 像素。没有可靠品牌图标时使用统一中性图标。</p></div></div>`}
function resetPickerState(){uploadGeneration++;logoUploading=false;logoError='';pickerComposing=false}
function closePicker(){resetPickerState();picker=false;render();$('#openPicker')?.focus()}
function bindPickerChoices(){
  document.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
    const service=SumiCatalog.get(button.dataset.pick);if(!service)return;
    resetPickerState();selectedLogo=service.logo||'';formDraft.logo=selectedLogo;
    if(!formDraft.name.trim()){formDraft.name=service.name;if(!formDraft.category||formDraft.category==='未分类')formDraft.category=service.category}
    picker=false;render();$('#openPicker')?.focus();
  });
}
function pickerFeedback(){
  if($('#logoUploadStatus'))$('#logoUploadStatus').textContent=logoUploading?'正在检查图片…':'';
  const error=$('#logoError');if(error){error.textContent=logoError;error.hidden=!logoError}
}
function bindDialogKeys(element,close){
  if(!element)return;
  element.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing||nameComposing||pickerComposing)return;
    if(event.key==='Escape'){event.preventDefault();close();return}
    if(event.key!=='Tab')return;
    const controls=[...element.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(control=>control.tabIndex>=0&&control.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  });
}

const commonCurrencies=['CNY','USD','JPY','HKD','TWD','EUR','GBP','KRW'];
let fxState={snapshot:null,currencies:{},loading:false,error:null,cacheWarning:null,cacheState:'empty'};
const fxManager=SumiFx.createManager({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},onChange:state=>{
  fxState=state;refreshFxView();
}});
function refreshFxView(){
  if(!uiReady)return;
  // Preserve the active native IME input until composition has committed.
  if(nameComposing||pickerComposing){fxRenderPending=true;return}
  fxRenderPending=false;
  captureDraft();capturePaymentDraft();captureStatsFilters();
  const focused=document.activeElement,focusId=focused?.id,position=focused?.selectionStart,scroll=window.scrollY;
  render();
  const restored=focusId?document.getElementById(focusId):null;
  if(restored){restored.focus({preventScroll:true});if(typeof position==='number')try{restored.setSelectionRange(position,position)}catch{}}
  window.scrollTo(0,scroll);
}
fxState=fxManager.getState();
function currencyOptions(selected){
  const codes=[...new Set([...commonCurrencies,...Object.keys(fxState.currencies||{}),...data.subscriptions.map(s=>s.currency),...data.payments.map(p=>p.currency),preferences.currency,selected])].filter(code=>/^[A-Z]{3}$/.test(code));
  return codes.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${code}${SumiFx.supported(code,fxState.snapshot)===false?'（未支持换算）':''}</option>`).join('');
}
function referenceQuote(amount,from,to=preferences.currency){return SumiFx.quote(amount,from,to,fxState.snapshot)}
function rangeFor(filters){
  if(filters.mode==='month'){
    if(!/^\d{4}-\d{2}$/.test(filters.month))throw Error('请选择有效月份。');
    const start=filters.month+'-01';if(!SumiData.date(start))throw Error('请选择有效月份。');
    const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);
    return {start,end:d.toISOString().slice(0,10)};
  }
  if(filters.mode==='year'){
    if(!/^\d{1,4}$/.test(String(filters.year))||Number(filters.year)<1||Number(filters.year)>9999)throw Error('请选择有效年份。');
    const year=String(filters.year).padStart(4,'0');return {start:year+'-01-01',end:year+'-12-31'};
  }
  return {start:filters.start,end:filters.end};
}
function calculateStats(range){return SumiStats.calculate(data,{...range,today:today(),displayCurrency:preferences.currency,convert:(amount,from,to)=>{const quote=referenceQuote(amount,from,to);return {...quote,amount:quote.rawAmount}},valuePayment:SumiFx.valuePayment})}
function captureStatsFilters(){
  if(!$('#statsFilters'))return;
  for(const [key,id] of [['mode','statsMode'],['month','statsMonth'],['year','statsYear'],['start','statsStart'],['end','statsEnd']])if($('#'+id))statsFilters[key]=$('#'+id).value;
}
function statsPage(){
  let model=null;try{model=calculateStats(rangeFor(statsFilters));statsFilters.error=''}catch(error){statsFilters.error=error.message}
  const tracked=new Set((data.costHistory||[]).map(record=>record.subscriptionId));
  const needsBaseline=data.subscriptions.some(subscription=>!tracked.has(subscription.id));
  const baseline=needsBaseline?'<div class="card section"><p class="note">部分旧订阅尚未保存成本历史。当前观察只代表今天；记录基线后可持续跟踪，不补造过去的数据。</p><button class="secondary" id="startCostHistory">记录当前成本基线</button></div>':'';
  return sumiStatisticsView(model,statsFilters,{esc,money:moneyDisplay,original,icon:sumiIcon,logo:statisticsLogo})+baseline;
}
function chart(){
  const d=new Date(today()+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-5);
  const model=calculateStats({start:d.toISOString().slice(0,10),end:today()}),points=model.monthlyTrend;
  const known=points.filter(p=>typeof p.amount==='number'),max=Math.max(0,...known.map(p=>p.amount));
  return `<div class="card section home-chart"><div class="section-title"><h2>月度成本概览</h2><span class="small">已记录的月均成本</span></div>${known.length?`<div class="chart">${points.map((p,i)=>`<div class="bar-item">${p.amount===null?'<span class="small" title="未记录或无法换算">—</span>':`<div class="bar ${i===points.length-1?'current':''}" title="${esc(p.key)} · ${p.amount===null?'未记录或无法换算':esc(moneyDisplay(p.amount))}${p.partial?' · 部分日期':''}" style="height:${p.amount===null?0:max?Math.max(2,p.amount/max*70):2}%"></div>`}<div class="bar-label">${esc(p.key.slice(5))}月${p.partial?'*':''}</div></div>`).join('')}</div>`:'<div class="empty">暂无可展示的成本历史</div>'}<p class="note">仅展示已记录日期，不补造过去的数据；* 表示部分日期。按当前参考汇率换算，与实际付款独立。</p></div>`;
}
function fxPanel(){
  const snapshot=fxState.snapshot;
  const baseStatus=fxState.cacheState==='fresh'?'本地缓存（24 小时内获取）':fxState.cacheState==='stale'?'旧缓存（超过 24 小时）':'暂无有效缓存';
  const status=fxState.loading?'正在获取汇率；'+baseStatus:fxState.error?'更新失败；'+baseStatus:baseStatus;
  const selectedUnsupported=SumiFx.supported(preferences.currency,snapshot)===false;
  return `<section class="fx-panel" aria-label="参考汇率管理"><div class="settings-row"><label>参考汇率</label><button class="secondary" id="refreshRates" ${fxState.loading?'disabled':''}>${fxState.loading?'正在刷新…':'手动刷新汇率'}</button></div><p id="fxStatus" class="fx-status" role="status">${esc(status)}</p><div class="settings-row"><span class="small">汇率对应日期</span><strong id="fxRateDate">${snapshot?esc(snapshot.date):'尚未获取'}</strong></div><div class="settings-row"><span class="small">最近成功获取时间</span><span id="fxFetchedAt" class="small">${snapshot?esc(new Date(snapshot.fetchedAt).toLocaleString('zh-CN',{hour12:false})):'尚未获取'}</span></div>${fxState.error?`<p class="note">${esc(fxState.error)}。有缓存时继续使用原缓存；日期不会更新为今天。</p>`:''}${fxState.cacheWarning?`<p class="note">${esc(fxState.cacheWarning)}</p>`:''}${fxState.coverageWarning?`<p class="note">${esc(fxState.coverageWarning)}</p>`:''}${snapshot?`<p class="note">当前参考数据支持 ${Object.keys(snapshot.rates).length} 种币种。${SumiFx.supported('TWD',snapshot)===false?'此接口暂无 TWD 换算，已有原币记录保留。':''}${selectedUnsupported?'当前展示币种未获接口支持，无法换算其他币种。':''}</p>`:'<p class="note">支持列表尚未获取。暂不估算跨币种汇率，同币种金额仍可查看。</p>'}<p class="note">来源 Frankfurter v1，每 24 小时检查更新；采用每日参考汇率，不是秒级实时交易报价。历史成功付款使用确认时冻结的汇率，刷新不会改写。</p></section>`;
}
function capturePaymentDraft(){
  if(!$('#paymentForm'))return;
  paymentDraft={date:$('#paymentDate').value,amount:$('#paymentAmount').value,currency:$('#paymentCurrency').value,cycleDate:$('#paymentCycleDate').value,status:$('#paymentStatus').value};
}
function preparePayment(record,previous=null){
  if(!SumiBilling.successful(record)){delete record.fxSnapshot;return record}
  const wasSuccessful=previous&&SumiBilling.successful(previous);
  const snapshot=wasSuccessful?SumiFx.revise(previous,record.amount,record.currency):SumiFx.freeze(record.amount,record.currency,preferences.currency,fxState.snapshot,new Date().toISOString());
  if(snapshot)record.fxSnapshot=snapshot;else delete record.fxSnapshot;
  const changedMoney=previous&&(previous.amount!==record.amount||previous.currency!==record.currency);
  if(snapshot?.status==='unavailable'&&(!wasSuccessful||changedMoney)&&!confirm('当前无法换算这笔付款（'+snapshot.reason+'）。是否只保存原币金额？此记录不会按今后汇率自动回算。'))return null;
  return record;
}
function paymentFxNote(payment){
  if(!SumiBilling.successful(payment))return '';
  const fx=payment.fxSnapshot;
  if(!fx)return '<div class="small payment-fx">旧记录未保存确认汇率；不按当前汇率补算。</div>';
  if(fx.status==='unavailable')return '<div class="small payment-fx">确认时无法换算，原币金额已保留。</div>';
  if(fx.provider==='identity')return `<div class="small payment-fx">原币 ${esc(fx.displayCurrency)} 金额，无需换算；未保存其他币种汇率。</div>`;
  return `<div class="small payment-fx">确认汇率 ${esc(fx.date)} · ${esc(fx.displayCurrency)} ${Number(fx.convertedAmount).toLocaleString('zh-CN',{maximumFractionDigits:6})} · 汇率 ${Number(fx.rate).toPrecision(6)}（已冻结）</div>`;
}

function captureDraft(){
  if(!$('#subscriptionForm'))return;
  formDraft={name:$('#name').value,amount:$('#amount').value,currency:$('#formCurrency').value,
    months:Number($('#months').value),nextDate:$('#nextDate').value,status:$('#status').value,
    autoRenew:$('#autoRenew').value==='true',logo:selectedLogo,category:$('#category').value.trim()||'未分类'};
}
function bindLogos(){
  document.querySelectorAll('img[data-logo-image]').forEach(img=>{
    if(img.dataset.logoBound)return;img.dataset.logoBound='true';
    const fallback=()=>{const el=document.createElement('span');el.className='logo fallback';el.setAttribute('role','img');el.setAttribute('aria-label',(img.dataset.logoName?img.dataset.logoName+'：':'')+'暂无图标');el.innerHTML=sumiIcon('image');img.replaceWith(el)};
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&!img.naturalWidth)fallback();
  });
}
function commit(nextData,nextPrefs=preferences,recovery=false){
  try{storage.write(nextData,nextPrefs,recovery);data=nextData;preferences=nextPrefs;return true}
  catch(error){alert(error.message);return false}
}
function updateData(change){try{const next=structuredClone(data);change(next);const recorded=SumiStats.recordChanges(data,next,today(),new Date().toISOString(),id);return commit(recorded)}catch(error){alert(error.message);return false}}
function downloadJson(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bind(){
  bindLogos();
  $('#refreshRates')?.addEventListener('click',()=>fxManager.refresh({force:true}));
  $('#startCostHistory')?.addEventListener('click',()=>{if(updateData(()=>{}))render()});
  $('#statsMode')?.addEventListener('change',()=>{captureStatsFilters();statsFilters.error='';render()});
  $('#statsFilters')?.addEventListener('submit',e=>{e.preventDefault();captureStatsFilters();render()});
  $('[data-show-subscriptions]')?.addEventListener('click',()=>{view='list';filter='';render()});
  $('#exportRaw')?.addEventListener('click',()=>downloadJson(storage.rawBackup(),`sumi-recovery-${today()}.json`));
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{view=el.dataset.nav;filter='';render()});
  document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{resetPickerState();closeSuggestions();modal='new';formDraft=null;selectedLogo='';render();$('#name')?.focus()});
  document.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>{detailId=el.dataset.detail;render()});
  $('#search')?.addEventListener('input',e=>{filter=e.target.value;const pos=e.target.selectionStart;render();$('#search')?.focus();$('#search')?.setSelectionRange(pos,pos)});
  $('#statusFilter')?.addEventListener('change',e=>{statusFilter=e.target.value;render()});
  const closeModal=()=>{resetPickerState();closeSuggestions();nameComposing=false;modal=null;picker=false;formDraft=null;selectedLogo='';render()};
  document.querySelectorAll('[data-close]').forEach(el=>el.onclick=closeModal);
  $('#modalOverlay')?.addEventListener('click',e=>{if(e.target.id==='modalOverlay')closeModal()});
  $('#openPicker')?.addEventListener('click',()=>{captureDraft();closeSuggestions();resetPickerState();picker=true;pickerSearch='';render();$('#pickerSearch')?.focus()});
  $('#subscriptionForm')?.addEventListener('input',captureDraft);
  $('#subscriptionForm')?.addEventListener('change',captureDraft);
  $('#subscriptionForm')?.addEventListener('submit',e=>{
    e.preventDefault();captureDraft();
    if(!SumiData.formAmount(formDraft.amount)){alert('请输入有效金额，最多保留两位小数。');return}
    const old=modal==='new'?null:data.subscriptions.find(s=>s.id===modal);
    let s={...old,...formDraft,id:old?.id||id(),name:formDraft.name.trim(),amount:Number(formDraft.amount),logo:selectedLogo};
    const changedSchedule=old&&(old.nextDate!==s.nextDate||old.months!==s.months);
    if(!old||changedSchedule)s.billingAnchor=s.nextDate;
    try{s=SumiData.subscription(s)}catch(error){alert(error.message);return}
    if(changedSchedule&&SumiBilling.hasSuccessfulPayment(data.payments,s.id,s.nextDate)){alert('新续费日期已有成功付款，请选择下一未付款账期。');return}
    if(!updateData(next=>{
      if(old)next.subscriptions[next.subscriptions.findIndex(x=>x.id===old.id)]=s;else next.subscriptions.push(s);
      if(changedSchedule)next.payments.forEach(p=>{if(p.subscriptionId===s.id&&p.cycleDate){p.advancesSchedule=false;p.scheduleArchived=true}});
    }))return;
    modal=null;formDraft=null;selectedLogo='';render();
  });
  bindServiceSearch();
  bindDialogKeys($('#modalOverlay .modal'),closeModal);
  $('#closePicker')?.addEventListener('click',closePicker);
  $('#pickerOverlay')?.addEventListener('click',event=>{if(event.target.id==='pickerOverlay')closePicker()});
  bindDialogKeys($('#pickerOverlay .modal'),closePicker);
  const updatePickerSearch=()=>{$('#pickerResults').innerHTML=pickerResultsHtml();bindPickerChoices();bindLogos()};
  $('#pickerSearch')?.addEventListener('compositionstart',()=>{pickerComposing=true});
  $('#pickerSearch')?.addEventListener('compositionend',event=>{pickerComposing=false;pickerSearch=event.target.value;updatePickerSearch();if(fxRenderPending)setTimeout(()=>{if(fxRenderPending)refreshFxView()},0)});
  $('#pickerSearch')?.addEventListener('input',event=>{pickerSearch=event.target.value;if(!event.isComposing&&!pickerComposing)updatePickerSearch()});
  $('#pickerSearch')?.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&!event.isComposing&&!pickerComposing){event.preventDefault();$('[data-pick]')?.focus()}});
  bindPickerChoices();
  $('#chooseUpload')?.addEventListener('click',()=>$('#uploadLogo')?.click());
  $('#removeLogo')?.addEventListener('click',()=>{resetPickerState();selectedLogo='';formDraft.logo='';picker=false;render();$('#openPicker')?.focus()});
  $('#uploadLogo')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const generation=++uploadGeneration,targetModal=modal;
    const pending=()=>generation===uploadGeneration&&modal===targetModal&&picker&&formDraft;
    logoUploading=true;logoError='';pickerFeedback();
    try{
      const result=await SumiLogoUpload.read(file);
      if(!pending())return;
      logoUploading=false;selectedLogo=result;formDraft.logo=result;picker=false;render();$('#openPicker')?.focus();
    }catch(error){if(pending()){logoUploading=false;logoError=error.message||'图片读取失败，请重试。';if($('#uploadLogo'))$('#uploadLogo').value='';pickerFeedback()}}
  });
  $('#drawerOverlay')?.addEventListener('click',e=>{if(e.target.id==='drawerOverlay'){detailId=null;render()}});
  document.querySelectorAll('[data-close-detail]').forEach(b=>b.onclick=()=>{detailId=null;render()});
  $('[data-edit]')?.addEventListener('click',()=>{resetPickerState();closeSuggestions();modal=detailId;detailId=null;formDraft=null;selectedLogo=data.subscriptions.find(s=>s.id===modal)?.logo||'';render()});
  $('[data-toggle]')?.addEventListener('click',()=>{const current=data.subscriptions.find(s=>s.id===detailId);if(!confirm(active(current)?'标记为已取消？付款历史和原账期会保留。':'恢复订阅？原账期会保留，逾期付款需逐期确认。'))return;if(updateData(next=>{const s=next.subscriptions.find(x=>x.id===detailId);s.status=active(s)?'cancelled':'active'}))render()});
  $('[data-delete]')?.addEventListener('click',()=>{
    if(confirm('删除此订阅及其付款记录？此操作不可撤销。')&&updateData(next=>{
      next.subscriptions=next.subscriptions.filter(s=>s.id!==detailId);next.payments=next.payments.filter(p=>p.subscriptionId!==detailId);
    })){detailId=null;render()}
  });
  $('[data-confirm]')?.addEventListener('click',e=>{
    const button=e.currentTarget,cycle=button.dataset.cycle,s=data.subscriptions.find(x=>x.id===detailId);
    if(confirming||!s||!active(s)||s.nextDate!==cycle)return;
    confirming=true;button.disabled=true;
    const unlock=()=>{confirming=false;const current=$('[data-confirm]');if(current)current.disabled=false};
    if(!confirm(`确认 ${s.name} 的 ${cycle} 账期已于 ${today()} 成功付款 ${original(s.amount,s.currency)}？`)){unlock();return}
    const record=preparePayment({id:id(),subscriptionId:s.id,name:s.name,date:today(),cycleDate:cycle,amount:s.amount,currency:s.currency,status:'succeeded',advancesSchedule:true});
    if(!record){unlock();return}
    const saved=updateData(next=>changePayment(next,record));
    if(saved){render();setTimeout(unlock,750)}else unlock();
  });
  $('[data-fail-payment]')?.addEventListener('click',()=>{
    const s=data.subscriptions.find(x=>x.id===detailId);
    if(!s||!active(s)||!confirm(`记录 ${s.name} 的 ${s.nextDate} 账期付款失败？失败不会推进续费日期。`))return;
    if(updateData(next=>changePayment(next,{id:id(),subscriptionId:s.id,name:s.name,date:today(),cycleDate:s.nextDate,amount:s.amount,currency:s.currency,status:'failed',advancesSchedule:false})))render();
  });
  $('[data-payment]')?.addEventListener('click',()=>{paymentModal='new';paymentDraft=null;render()});
  document.querySelectorAll('[data-edit-payment]').forEach(button=>button.onclick=()=>{paymentModal=button.dataset.editPayment;paymentDraft=null;render()});
  const closePayment=()=>{paymentModal=null;paymentDraft=null;render()};
  document.querySelectorAll('[data-close-payment]').forEach(button=>button.onclick=closePayment);
  $('#paymentOverlay')?.addEventListener('click',e=>{if(e.target.id==='paymentOverlay')closePayment()});
  const capturePayment=capturePaymentDraft;
  $('#paymentForm')?.addEventListener('input',capturePayment);
  $('#paymentForm')?.addEventListener('change',capturePayment);
  $('#paymentForm')?.addEventListener('submit',e=>{
    e.preventDefault();capturePayment();
    const old=paymentModal==='new'?null:data.payments.find(p=>p.id===paymentModal);
    if(!SumiData.date(paymentDraft.date)||paymentDraft.date>today()){alert('请输入不晚于今天的真实付款日期。');return}
    if(!SumiData.formAmount(paymentDraft.amount)&&!(old&&Number(paymentDraft.amount)===old.amount&&paymentDraft.amount.trim())){alert('请输入有效金额，最多保留两位小数。');return}
    if(paymentDraft.cycleDate&&!SumiData.date(paymentDraft.cycleDate)){alert('请输入真实有效的账期日期。');return}
    const s=data.subscriptions.find(x=>x.id===detailId);
    const record={...old,...paymentDraft,id:old?.id||id(),subscriptionId:s.id,name:old?.name||s.name,amount:Number(paymentDraft.amount),advancesSchedule:Boolean(paymentDraft.cycleDate)&&paymentDraft.status==='succeeded'};
    if(old?.scheduleArchived&&record.cycleDate===old.cycleDate){record.scheduleArchived=true;record.advancesSchedule=false}
    else delete record.scheduleArchived;
    if(!record.cycleDate)delete record.cycleDate;
    const prepared=preparePayment(record,old);if(!prepared)return;
    if(updateData(next=>changePayment(next,prepared,old))){paymentModal=null;paymentDraft=null;render()}
  });
  document.querySelectorAll('[data-remove-payment]').forEach(button=>button.onclick=()=>{
    const previous=data.payments.find(p=>p.id===button.dataset.removePayment);if(!previous)return;
    const text=previous.cycleDate&&SumiBilling.successful(previous)?'删除这条付款记录？关联账期会重新变为待付款。':'删除这条付款记录？';
    if(confirm(text)&&updateData(next=>changePayment(next,null,previous)))render();
  });
  document.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{calOffset+=Number(b.dataset.month);render()});
  for(const key of ['currency','theme','reminder'])$('#'+key)?.addEventListener('change',e=>{
    commit(data,{...preferences,[key]:key==='reminder'?Number(e.target.value):e.target.value});render();
  });
  $('#language')?.addEventListener('change',e=>{if(e.target.value!=='zh-CN')alert('完整多语言界面将在后续版本实现。');e.target.value='zh-CN'});
  $('#export')?.addEventListener('click',()=>{
    if(storage.issues.length)downloadJson(storage.rawBackup(),`sumi-recovery-${today()}.json`);
    else downloadJson({version:1,data,preferences},`sumi-backup-${today()}.json`);
  });
  $('#import')?.addEventListener('click',()=>$('#importFile').click());
  $('#importFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>10*1024*1024)throw Error('备份文件超过 10MB，请检查文件。');
      const obj=SumiData.backup(JSON.parse(await file.text()));
      if(!confirm('导入会替换当前所有订阅、付款记录和偏好设置，是否继续？'))return;
      if(commit(obj.data,obj.preferences,true)){modal=null;detailId=null;formDraft=null;paymentModal=null;paymentDraft=null;render()}
    }catch(error){alert('导入失败：'+error.message)}
    finally{e.target.value=''}
  });
}
render();uiReady=true;fxManager.refresh();
setInterval(()=>fxManager.refresh(),60*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)fxManager.refresh()});
