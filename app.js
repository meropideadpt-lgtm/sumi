const $=s=>document.querySelector(s);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(key,params)=>SumiI18n.t('app.'+key,params),tx=(key,params)=>esc(t(key,params));
const dateText=(value,options)=>SumiI18n.date(value,options),numberText=(value,options)=>SumiI18n.number(value,options);
const t6=(key,params)=>SumiI18n.t('stage6.'+key,params),tx6=(key,params)=>esc(t6(key,params));
let exporting=false,importing=false,logoStorageWarning=false;
const errorText=error=>SumiI18n.error(error?.message||error);
const storage=SumiData.open({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
let data=storage.data,preferences=storage.preferences,view='home',filter='',statusFilter='all',modal=null,detailId=null,picker=false,selectedLogo='',pickerSearch='',calOffset=0,formDraft=null,paymentModal=null,paymentDraft=null,confirming=false,uploadGeneration=0,logoUploading=false,logoError='',suggestionsOpen=false,suggestionIndex=-1,suggestionResults=[],nameComposing=false,pickerComposing=false,fxRenderPending=false,uiReady=false,statsFilters={mode:'year',year:today().slice(0,4),month:today().slice(0,7),start:today().slice(0,4)+'-01-01',end:today(),error:''};
const converted=(amount,from,to=preferences.currency)=>referenceQuote(Number(amount),from,to).rawAmount;
const original=(amount,cur)=>SumiI18n.money(Number(amount),cur,{currencyDisplay:'code',maximumFractionDigits:20});
const active=s=>s.status!=='cancelled';
const monthly=s=>{const value=converted(s.amount,s.currency);return value===null?null:value/s.months};
const total=()=>{const values=data.subscriptions.filter(active).map(monthly);return values.some(value=>value===null)?null:values.reduce((sum,value)=>sum+value,0)};
const moneyDisplay=value=>typeof value!=='number'||!Number.isFinite(value)?t('pendingConversion'):SumiI18n.money(value,preferences.currency);
const daysUntil=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000);
const id=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());
const nav=[['home','home'],['list','list'],['stats','stats'],['calendar','calendar'],['settings','settings']];
const categoryValues=['未分类','影音娱乐','音乐音频','AI 工具','工作效率','办公效率','云存储','游戏','设计','学习教育','开发工具','生活服务','其他'];
function setCategoryInput(value){const input=$('#category');if(!input)return;input.value=SumiI18n.category(value);input.dataset.originalCategory=value;input.dataset.originalLabel=input.value}
function readCategoryInput(){const input=$('#category'),value=input.value.trim();if(value===input.dataset.originalLabel)return input.dataset.originalCategory;return categoryValues.find(item=>SumiI18n.category(item)===value)||value||'未分类'}
function render(){
  SumiI18n.setLanguage(preferences.language);document.documentElement.lang=SumiI18n.getLanguage();SumiTheme.apply(preferences.theme);SumiMotion.apply(preferences.motion);
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">sumi</div><nav class="nav" aria-label="${tx('nav.main')}">${nav.map(([key,icon])=>`<button class="${view===key?'active':''} ${key==='settings'?'settings-link':''}" data-nav="${key}" ${view===key?'aria-current="page"':''}><span class="symbol">${sumiIcon(icon)}</span>${tx('nav.'+key)}</button>`).join('')}</nav></aside><main class="main view-${view}">${storage.issues.length?`<div class="storage-notice" role="alert">${storage.issues.map(issue=>esc(errorText(issue))).join(' ')} <button class="linkbtn" id="exportRaw">${tx('exportRaw')}</button></div>`:''}<header class="top"><div><h1>${tx('nav.'+view)}</h1><p class="sub">${tx('subtitle.'+view)}</p></div>${view!=='settings'?`<button class="primary" data-add>${sumiIcon('plus')}${tx('addSubscription')}</button>`:''}</header>${({home:homePage,list:listPage,stats:statsPage,calendar:calendarPage,settings:settingsPage})[view]()}</main></div>${modal?modalHtml():''}${detailId?detailHtml():''}${picker?pickerHtml():''}${paymentModal?paymentHtml():''}`;bind();SumiMotion.afterRender({view,modal,detailId,picker,paymentModal});showLogoStorageWarning();
}
const metrics=()=>{
  const subscriptions=data.subscriptions.filter(active),next=[...subscriptions].sort((a,b)=>a.nextDate.localeCompare(b.nextDate))[0];
  return `<div class="cards ${view==='home'?'home-metrics':''}"><div class="card"><div class="card-title">${tx('monthlyCost')}</div><div class="metric">${esc(moneyDisplay(total()))}</div><div class="small">${tx('amortizedReference')}</div></div><div class="card"><div class="card-title">${tx('activeSubscriptions')}</div><div class="metric">${esc(numberText(subscriptions.length))} <span class="metric-unit">${tx('items',{count:subscriptions.length})}</span></div><div class="small">${tx('activeOnly')}</div></div><div class="card"><div class="card-title">${tx('nextRenewal')}</div><div class="metric renewal-metric">${next?esc(dateText(next.nextDate)):tx('none')}</div><div class="small">${next?esc(next.name):tx('startAdding')}</div></div></div>`;
};
function reminders(){
  const list=data.subscriptions.filter(s=>active(s)&&daysUntil(s.nextDate)<=Number(preferences.reminder)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  return list.length?`<div class="reminders"><div class="reminder-title">${sumiIcon('bell')}${tx('renewalReminder')} <span class="pill">${tx('attentionCount',{count:numberText(list.length)})}</span></div>${list.map(s=>`<div class="reminder-item"><div><strong class="reminder-name">${esc(s.name)}</strong><div class="notice">${daysUntil(s.nextDate)<0?tx('overdue'):daysUntil(s.nextDate)===0?tx('dueToday'):tx('dueIn',{count:numberText(daysUntil(s.nextDate))})} · ${esc(original(s.amount,s.currency))}</div></div><button class="secondary" data-detail="${esc(s.id)}">${tx('view')}</button></div>`).join('')}</div>`:'';
}
function filteredSubscriptions(){const query=filter.toLowerCase();return data.subscriptions.filter(s=>(statusFilter==='all'||(statusFilter==='active'?active(s):!active(s)))&&s.name.toLowerCase().includes(query))}
function tableRows(list){return list.map(s=>`<tr data-detail="${esc(s.id)}"><td><div class="service">${logoMarkup(s.name,s.logo)}${esc(s.name)}</div></td><td>${esc(original(s.amount,s.currency))} / ${tx('shortMonths',{count:numberText(s.months)})}</td><td>${esc(moneyDisplay(monthly(s)))}</td><td>${esc(dateText(s.nextDate))}</td><td><span class="tag ${active(s)?'':'off'}">${tx(active(s)?'active':'cancelled')}</span></td></tr>`).join('')}
function bindDetails(scope=document){scope.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>{detailId=el.dataset.detail;render()})}
function refreshTable(){const body=$('.table tbody');if(!body)return;const list=filteredSubscriptions();body.innerHTML=tableRows(list);$('#tableEmpty').hidden=Boolean(list.length);bindDetails(body);bindLogos()}
function table(){
  const list=filteredSubscriptions();
  return `<div class="card section ${view==='home'?'home-table':''}"><div class="section-title"><h2>${tx('mySubscriptions')}</h2><div class="tools"><input class="search" id="search" value="${esc(filter)}" aria-label="${tx('searchSubscriptions')}" placeholder="${tx('searchSubscriptions')}"/><select class="select" id="statusFilter" aria-label="${tx('status')}"><option value="all" ${statusFilter==='all'?'selected':''}>${tx('allSubscriptions')}</option><option value="active" ${statusFilter==='active'?'selected':''}>${tx('active')}</option><option value="cancelled" ${statusFilter==='cancelled'?'selected':''}>${tx('cancelled')}</option></select></div></div><div class="table-wrap"><table class="table"><thead><tr>${['service','cost','monthlyAverage','nextRenewal','status'].map(key=>`<th>${tx(key)}</th>`).join('')}</tr></thead><tbody>${tableRows(list)}</tbody></table><div class="empty" id="tableEmpty" ${list.length?'hidden':''}>${tx('emptySubscriptions')}</div></div></div>`;
}
const homePage=()=>metrics()+mobileSummary()+`<div class="section home-reminders">${reminders()}</div>`+chart()+table()+mobileSubscriptions();
const listPage=()=>table();
function calendarPage(){
  const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+calOffset);
  const y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate(),month=`${String(y).padStart(4,'0')}-${String(m+1).padStart(2,'0')}-01`;
  const cells=Array.from({length:first},()=>'<div></div>');
  for(let day=1;day<=days;day++){
    const date=`${String(y).padStart(4,'0')}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,items=data.subscriptions.filter(s=>active(s)&&s.nextDate===date);
    cells.push(`<div class="calendar-cell"><b>${esc(numberText(day))}</b>${items.map(s=>`<button class="calendar-event" data-detail="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>`);
  }
  return `<div class="card"><div class="section-title"><h2>${esc(dateText(month,{year:'numeric',month:'long'}))}</h2><div class="month-switch"><button class="secondary" data-month="-1" aria-label="${tx('previousMonth')}">${sumiIcon('chevron-left')}</button><button class="secondary" data-month="1" aria-label="${tx('nextMonth')}">${sumiIcon('chevron-right')}</button></div></div><div class="calendar-grid">${[5,6,7,8,9,10,11].map(day=>`<div class="small calendar-weekday">${esc(dateText(`2026-01-${String(day).padStart(2,'0')}`,{weekday:'short'}))}</div>`).join('')}${cells.join('')}</div><p class="note">${tx('calendarNote')}</p></div>`;
}
function settingsPage(){return `<div class="card"><div class="settings-row"><label for="language">${tx('language')}</label><select class="select" id="language">${[['zh-CN','简体中文'],['zh-TW','繁體中文'],['ja-JP','日本語'],['en','English']].map(([value,label])=>`<option value="${value}" ${preferences.language===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="settings-row"><label for="currency">${tx('displayCurrency')}</label><select class="select" id="currency">${currencyOptions(preferences.currency)}</select></div>${fxPanel()}<div class="settings-row"><label for="theme">${tx('appearance')}</label><select class="select" id="theme">${['light','dark','system'].map(value=>`<option value="${value}" ${preferences.theme===value?'selected':''}>${tx(value)}</option>`).join('')}</select></div><div class="settings-row"><label for="motion">${tx6('motion')}</label><select class="select" id="motion">${['system','reduce'].map(value=>`<option value="${value}" ${(preferences.motion||'system')===value?'selected':''}>${tx6('motion.'+value)}</option>`).join('')}</select></div><div class="settings-row"><label for="reminder">${tx('siteReminder')}</label><select class="select" id="reminder">${[0,1,3,7,14].map(value=>`<option value="${value}" ${Number(preferences.reminder)===value?'selected':''}>${value?tx('daysBefore',{count:numberText(value)}):tx('onDay')}</option>`).join('')}</select></div><div class="settings-row"><label>${tx('backupRestore')}</label><div class="tools"><button class="secondary" id="export">${tx(storage.issues.length?'exportRaw':'exportJSON')}</button><button class="secondary" id="import">${tx('importJSON')}</button><input id="importFile" type="file" accept=".json,application/json" hidden></div></div><p class="note">${tx('backupNote')}</p>${SumiPWA.settingsMarkup()}</div>`}
function modalHtml(){
  const s=formDraft||(modal==='new'?{name:'',amount:'',currency:'CNY',months:1,nextDate:today(),status:'active',autoRenew:true,logo:''}:data.subscriptions.find(x=>x.id===modal));if(!s)return '';
  const category=s.category||'未分类',categoryLabel=SumiI18n.category(category);
  return `<div class="overlay" id="modalOverlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="subscriptionTitle"><div class="modal-head"><h2 id="subscriptionTitle">${tx(modal==='new'?'addSubscription':'editSubscription')}</h2><button class="iconbtn" data-close aria-label="${tx('closeSubscription')}">${sumiIcon('close')}</button></div><form id="subscriptionForm"><div class="form-grid"><div><label class="small">${tx('logo')}</label><button class="logo-picker" type="button" id="openPicker" aria-label="${tx('changeLogo')}">${logoMarkup(s.name,s.logo)}</button></div><div class="field service-autocomplete"><label for="name">${tx('subscriptionName')}</label><input id="name" required maxlength="70" value="${esc(s.name)}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="suggestions" aria-expanded="false"><div id="suggestions" class="service-suggestions" role="listbox" aria-label="${tx('matchedServices')}" hidden></div></div><div class="field"><label for="formCurrency">${tx('originalCurrency')}</label><select id="formCurrency">${currencyOptions(s.currency)}</select></div><div class="field" style="grid-column:2"><label for="nextDate">${tx('nextRenewal')}</label><input id="nextDate" type="date" min="0001-01-01" max="9999-12-31" required value="${esc(s.nextDate)}"></div><div class="field"><label for="amount">${tx('amount')}</label><input id="amount" type="number" required min="0" step="0.01" value="${esc(s.amount)}"></div><div class="field" style="grid-column:2"><label for="months">${tx('cycle')}</label><select id="months">${[1,3,6,12].map(n=>`<option value="${n}" ${Number(s.months)===n?'selected':''}>${tx('months',{count:numberText(n)})}</option>`).join('')}</select></div><div class="field"><label for="status">${tx('subscriptionStatus')}</label><select id="status"><option value="active" ${active(s)?'selected':''}>${tx('active')}</option><option value="cancelled" ${!active(s)?'selected':''}>${tx('cancelled')}</option></select></div><div class="field" style="grid-column:2"><label for="autoRenew">${tx('autoRenew')}</label><select id="autoRenew"><option value="true" ${s.autoRenew?'selected':''}>${tx('on')}</option><option value="false" ${!s.autoRenew?'selected':''}>${tx('off')}</option></select></div></div><div class="field category-field"><label for="category">${tx('category')}</label><input id="category" maxlength="30" value="${esc(categoryLabel)}" data-original-category="${esc(category)}" data-original-label="${esc(categoryLabel)}" list="categoryOptions"><datalist id="categoryOptions">${categoryValues.map(value=>`<option value="${esc(SumiI18n.category(value))}"></option>`).join('')}</datalist></div><div class="modal-actions"><button class="secondary" type="button" data-close>${tx('cancel')}</button><button class="primary" type="submit">${tx(modal==='new'?'add':'saveChanges')}</button></div></form></div></div>`;
}
function shortDate(value){return value?dateText(value,{month:'short',day:'numeric'}):t('none')}
function mobileSummary(){
  const subscriptions=data.subscriptions.filter(active),next=[...subscriptions].sort((a,b)=>a.nextDate.localeCompare(b.nextDate))[0];
  return `<section class="mobile-summary" aria-label="${tx('summary')}"><div class="summary-cost"><span class="small">${tx('monthly')}</span><strong>${esc(moneyDisplay(total()))}</strong></div><div class="summary-count"><span class="small">${tx('activeShort')}</span><strong>${tx('itemCount',{count:numberText(subscriptions.length)})}</strong></div><div class="summary-next"><span class="small">${tx('nextRenewal')}</span><strong>${next?esc(shortDate(next.nextDate)):tx('none')}</strong><span class="small">${next?esc(next.name):tx('startAdding')}</span></div></section>`;
}
function mobileSubscriptions(){
  const list=data.subscriptions.filter(active).sort((a,b)=>a.nextDate.localeCompare(b.nextDate)).slice(0,3);
  return `<section class="mobile-subscriptions"><header class="section-title"><h2>${tx('mySubscriptions')}</h2><button data-show-subscriptions class="linkbtn">${tx('viewAll')}</button></header>${list.length?list.map(s=>`<button class="mobile-subscription" data-detail="${esc(s.id)}"><span class="service">${logoMarkup(s.name,s.logo)}<span class="mobile-service-name">${esc(s.name)}</span></span><span class="mobile-service-price">${esc(original(s.amount,s.currency))}<span class="small">${tx('renewOn',{date:shortDate(s.nextDate)})}</span></span></button>`).join(''):`<p class="empty">${tx('emptyMobile')}</p>`}</section>`;
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
  if(!subscription)throw Error(t('subscriptionMissing'));
  const linked=Boolean(record?.cycleDate||previous?.cycleDate);
  const schedule=linked?scheduleFor(subscription,next.payments):subscription;
  const sameAssociation=previous&&record&&previous.cycleDate===record.cycleDate;
  const belongs=Boolean(record?.cycleDate)&&SumiBilling.isScheduledCycle(schedule,record.cycleDate);
  if(record?.cycleDate&&!belongs&&!sameAssociation)throw Error(t('cycleMismatch'));
  if(record&&SumiBilling.successful(record)&&record.cycleDate&&SumiBilling.hasSuccessfulPayment(next.payments.filter(p=>p.id!==previous?.id),subscription.id,record.cycleDate))throw Error(t('cyclePaid'));
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
  return `<div class="payment" data-payment-id="${esc(p.id)}"><div>${esc(dateText(p.date))}<div class="small">${tx(succeeded?'paymentSuccess':'paymentFailed')}${p.scheduleArchived?' · '+tx('oldCycle'):''} · ${p.cycleDate?tx('cycleDate',{date:dateText(p.cycleDate)}):tx('unlinkedCycle')}</div></div><div><strong>${esc(original(p.amount,p.currency))}</strong>${paymentFxNote(p)}<div class="payment-actions"><button class="linkbtn" data-edit-payment="${esc(p.id)}">${tx('edit')}</button><button class="linkbtn" data-remove-payment="${esc(p.id)}">${tx('delete')}</button></div></div></div>`;
}
function detailHtml(){
  const s=data.subscriptions.find(x=>x.id===detailId);if(!s)return '';
  const history=data.payments.filter(p=>p.subscriptionId===s.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="drawer-overlay" id="drawerOverlay"><div class="drawer" role="dialog" aria-modal="true" aria-label="${tx('details')}"><div class="drawer-header"><strong>${tx('details')}</strong><button class="iconbtn" data-close-detail aria-label="${tx('closeDetails')}">${sumiIcon('close')}</button></div><div class="detail-hero">${logoMarkup(s.name,s.logo)}<div><h2>${esc(s.name)}</h2><span class="tag ${active(s)?'':'off'}">${tx(active(s)?'active':'cancelled')}</span></div></div><div class="detail-price"><div class="small">${tx('monthlyAverage')}</div><strong>${esc(moneyDisplay(monthly(s)))}</strong><div class="small">${esc(original(s.amount,s.currency))} / ${tx('months',{count:numberText(s.months)})} · ${tx('referenceRate')}</div></div>${[['nextRenewal',dateText(s.nextDate)],['cycle',t('months',{count:numberText(s.months)})],['autoRenew',t(s.autoRenew?'on':'off')],['subscriptionStatus',t(active(s)?'active':'cancelled')]].map(([key,value])=>`<div class="detail-row"><span>${tx(key)}</span><strong>${esc(value)}</strong></div>`).join('')}<div class="section-title section"><h2>${tx('paymentHistory')}</h2><button class="linkbtn" data-payment>${sumiIcon('plus')}${tx('recordPayment')}</button></div>${history.length?history.map(paymentHistoryRow).join(''):`<div class="empty">${tx('noPayments')}</div>`}<div class="stack section">${active(s)?`<button class="primary" data-confirm data-cycle="${esc(s.nextDate)}" ${confirming?'disabled':''}>${sumiIcon('check')}${tx('confirmRenewal')}</button><button class="secondary" data-fail-payment>${sumiIcon('warning')}${tx('recordFailure')}</button>`:''}<button class="secondary" data-edit>${sumiIcon('edit')}${tx('editSubscription')}</button><button class="secondary" data-toggle>${sumiIcon(active(s)?'pause':'play')}${tx(active(s)?'markCancelled':'restore')}</button><button class="secondary danger" data-delete>${sumiIcon('trash')}${tx('deleteSubscription')}</button></div><p class="note">${tx('detailNote')}</p></div></div>`;
}
function paymentHtml(){
  const subscription=data.subscriptions.find(s=>s.id===detailId);if(!paymentModal||!subscription)return '';
  const old=paymentModal==='new'?null:data.payments.find(p=>p.id===paymentModal);
  const p=paymentDraft||old||{date:today(),amount:'',currency:subscription.currency,cycleDate:'',status:'succeeded'};
  return `<div class="overlay payment-overlay" id="paymentOverlay"><div class="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="paymentTitle"><div class="modal-head"><h2 id="paymentTitle">${tx(old?'editPayment':'recordPayment')}</h2><button class="iconbtn" data-close-payment aria-label="${tx('closePayment')}">${sumiIcon('close')}</button></div><form id="paymentForm"><div class="field"><label for="paymentDate">${tx('paymentDate')}</label><input id="paymentDate" type="date" required min="0001-01-01" max="${today()}" value="${esc(p.date)}"></div><div class="field"><label for="paymentAmount">${tx('paymentAmount')}</label><input id="paymentAmount" type="number" required min="0" step="${old?'any':'0.01'}" value="${esc(p.amount)}"></div><div class="field"><label for="paymentCurrency">${tx('originalCurrency')}</label><select id="paymentCurrency">${currencyOptions(p.currency)}</select></div><div class="field"><label for="paymentCycleDate">${tx('optionalCycle')}</label><input id="paymentCycleDate" type="date" min="0001-01-01" max="9999-12-31" value="${esc(p.cycleDate||'')}"></div><div class="field"><label for="paymentStatus">${tx('paymentResult')}</label><select id="paymentStatus"><option value="succeeded" ${SumiBilling.successful(p)?'selected':''}>${tx('paymentSuccess')}</option><option value="failed" ${p.status==='failed'?'selected':''}>${tx('paymentFailed')}</option></select></div><p class="note">${old?.scheduleArchived?tx('archivedPaymentNote')+' ':''}${tx('paymentNote')}</p><div class="modal-actions"><button class="secondary" type="button" data-close-payment>${tx('cancel')}</button><button class="primary" type="submit">${tx('savePayment')}</button></div></form></div></div>`;
}

function neutralLogo(name){return `<span class="logo fallback" role="img" aria-label="${tx(name?'namedNoLogo':'noLogo',{name})}">${sumiIcon('image')}</span>`}
function resolvedLogo(url){
  const local=SumiCatalog.all.find(service=>service.logo&&service.legacyUrls?.includes(url));
  return local?.logo||url;
}
function logoMarkup(name,url){
  const source=resolvedLogo(url);
  return SumiData.safeLogo(source)?`<img class="logo" ${SumiLogoStore.isReference(source)?`data-logo-ref="${esc(source)}"`:`src="${esc(source)}"`} loading="${picker||modal||detailId||view==='stats'?'eager':'lazy'}" width="40" height="40" alt="${tx('namedLogo',{name:name||t('subscription')})}" decoding="async" referrerpolicy="no-referrer" data-logo-image data-logo-name="${esc(name||'')}">`:neutralLogo(name);
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
  if(!$('#category').value.trim()||readCategoryInput()==='未分类')setCategoryInput(service.category);
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
  list.innerHTML=suggestionResults.length?suggestionResults.map((service,index)=>`<button type="button" role="option" tabindex="-1" id="service-option-${esc(service.id)}" aria-selected="${index===suggestionIndex}" class="service-suggestion ${index===suggestionIndex?'is-active':''}" data-suggest="${esc(service.id)}">${logoMarkup(service.name,service.logo)}<span class="suggestion-copy"><strong>${esc(service.name)}</strong><span class="small">${esc(SumiI18n.category(service.category))}</span></span></button>`).join(''):`<p class="suggestion-empty" role="status">${tx('noServiceMatch')}</p>`;
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
  return list.length?list.map(service=>`<button type="button" class="pick-item" data-pick="${esc(service.id)}" aria-label="${tx('chooseNamedLogo',{name:service.name})}">${logoMarkup(service.name,service.logo)}<span>${esc(service.name)}</span><span class="small">${esc(SumiI18n.category(service.category))}</span></button>`).join(''):`<p class="picker-empty small">${tx('noLogoMatch')}</p>`;
}
function pickerHtml(){return `<div class="overlay" id="pickerOverlay"><div class="modal logo-modal" role="dialog" aria-modal="true" aria-labelledby="pickerTitle"><div class="modal-head"><h2 id="pickerTitle">${tx('chooseLogo')}</h2><button type="button" class="iconbtn" id="closePicker" aria-label="${tx('closeLogo')}">${sumiIcon('close')}</button></div><div class="picker-current">${logoMarkup(formDraft?.name,selectedLogo)}<div><strong>${tx('currentLogo')}</strong><p class="small">${tx(selectedLogo?'canReplaceLogo':'noSelectedLogo')}</p></div></div><label class="small" for="pickerSearch">${tx('searchLogos')}</label><input class="search" id="pickerSearch" placeholder="${tx('searchAliases')}" value="${esc(pickerSearch)}" autocomplete="off"><div class="picker-grid" id="pickerResults">${pickerResultsHtml()}</div><div class="logo-actions"><button type="button" class="secondary" id="chooseUpload">${sumiIcon('upload')}${tx(selectedLogo?'replaceUpload':'uploadImage')}</button><button type="button" class="secondary" id="removeLogo" ${selectedLogo?'':'disabled'}>${sumiIcon('trash')}${tx('removeLogo')}</button><input id="uploadLogo" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><p id="logoUploadStatus" class="logo-upload-status small" role="status">${logoUploading?tx('checkingImage'):''}</p><p id="logoError" class="logo-error" role="alert" ${logoError?'':'hidden'}>${logoError?esc(errorText(logoError)):''}</p><p class="note">${tx6('uploadNote')}</p></div></div>`}

function resetPickerState(){uploadGeneration++;logoUploading=false;logoError='';pickerComposing=false}
function closePicker(){const target=modal;resetPickerState();SumiMotion.close('#pickerOverlay',()=>{if(modal!==target||!picker)return;resetPickerState();picker=false;render();$('#openPicker')?.focus({preventScroll:true})})}
function bindPickerChoices(){
  document.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
    const service=SumiCatalog.get(button.dataset.pick);if(!service)return;
    resetPickerState();selectedLogo=service.logo||'';formDraft.logo=selectedLogo;
    if(!formDraft.name.trim()){formDraft.name=service.name;if(!formDraft.category||formDraft.category==='未分类')formDraft.category=service.category}
    picker=false;render();$('#openPicker')?.focus({preventScroll:true});
  });
}
function pickerFeedback(){
  if($('#logoUploadStatus'))$('#logoUploadStatus').textContent=logoUploading?t('checkingImage'):'';
  const error=$('#logoError');if(error){error.textContent=logoError?errorText(logoError):'';error.hidden=!logoError}
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
  return codes.map(code=>`<option value="${code}" ${code===selected?'selected':''}>${code}${SumiFx.supported(code,fxState.snapshot)===false?tx('unsupportedCurrency'):''}</option>`).join('');
}
function referenceQuote(amount,from,to=preferences.currency){return SumiFx.quote(amount,from,to,fxState.snapshot)}
function rangeFor(filters){
  if(filters.mode==='month'){
    if(!/^\d{4}-\d{2}$/.test(filters.month))throw Error(t('invalidMonth'));
    const start=filters.month+'-01';if(!SumiData.date(start))throw Error(t('invalidMonth'));
    const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);
    return {start,end:d.toISOString().slice(0,10)};
  }
  if(filters.mode==='year'){
    if(!/^\d{1,4}$/.test(String(filters.year))||Number(filters.year)<1||Number(filters.year)>9999)throw Error(t('invalidYear'));
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
  const baseline=needsBaseline?`<div class="card section"><p class="note">${tx('baselineNote')}</p><button class="secondary" id="startCostHistory">${tx('recordBaseline')}</button></div>`:'';
  return sumiStatisticsView(model,statsFilters,{esc,money:moneyDisplay,original,icon:sumiIcon,logo:statisticsLogo})+baseline;
}
function chart(){
  const d=new Date(today()+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-5);
  const model=calculateStats({start:d.toISOString().slice(0,10),end:today()}),points=model.monthlyTrend;
  const known=points.filter(p=>typeof p.amount==='number'),max=Math.max(0,...known.map(p=>p.amount));
  return `<div class="card section home-chart"><div class="section-title"><h2>${tx('monthlyOverview')}</h2><span class="small">${tx('recordedMonthly')}</span></div>${known.length?`<div class="chart">${points.map((p,i)=>`<div class="bar-item">${p.amount===null?`<span class="small" title="${tx('unknownCost')}">—</span>`:`<div class="bar ${i===points.length-1?'current':''}" title="${esc(dateText(p.key+'-01',{year:'numeric',month:'long'}))} · ${esc(moneyDisplay(p.amount))}${p.partial?' · '+tx('partialDates'):''}" style="height:${max?Math.max(2,p.amount/max*70):2}%"></div>`}<div class="bar-label">${esc(dateText(p.key+'-01',{month:'short'}))}${p.partial?'*':''}</div></div>`).join('')}</div>`:`<div class="empty">${tx('emptyCostHistory')}</div>`}<p class="note">${tx('chartNote')}</p></div>`;
}
function fxPanel(){
  const snapshot=fxState.snapshot;
  const baseStatus=t(fxState.cacheState==='fresh'?'freshCache':fxState.cacheState==='stale'?'staleCache':'emptyCache');
  const status=fxState.loading?t('loadingRatesStatus',{status:baseStatus}):fxState.error?t('failedRatesStatus',{status:baseStatus}):baseStatus;
  const selectedUnsupported=SumiFx.supported(preferences.currency,snapshot)===false;
  return `<section class="fx-panel" aria-label="${tx('rateManagement')}"><div class="settings-row"><label>${tx('referenceRate')}</label><button class="secondary" id="refreshRates" ${fxState.loading?'disabled':''}>${tx(fxState.loading?'refreshing':'refreshRates')}</button></div><p id="fxStatus" class="fx-status" role="status">${esc(status)}</p><div class="settings-row"><span class="small">${tx('rateDate')}</span><strong id="fxRateDate">${snapshot?esc(dateText(snapshot.date)):tx('notFetched')}</strong></div><div class="settings-row"><span class="small">${tx('lastFetched')}</span><span id="fxFetchedAt" class="small">${snapshot?esc(SumiI18n.dateTime(snapshot.fetchedAt)):tx('notFetched')}</span></div>${fxState.error?`<p class="note">${tx('cacheFailureNote',{error:errorText(fxState.error)})}</p>`:''}${fxState.cacheWarning?`<p class="note">${esc(errorText(fxState.cacheWarning))}</p>`:''}${fxState.coverageWarning?`<p class="note">${esc(errorText(fxState.coverageWarning))}</p>`:''}${snapshot?`<p class="note">${tx('currencyCoverage',{count:numberText(Object.keys(snapshot.rates).length)})} ${SumiFx.supported('TWD',snapshot)===false?tx('twdUnavailable'):''} ${selectedUnsupported?tx('displayUnsupported'):''}</p>`:`<p class="note">${tx('noCoverage')}</p>`}<p class="note">${tx('rateNote')}</p></section>`;
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
  if(snapshot?.status==='unavailable'&&(!wasSuccessful||changedMoney)&&!confirm(t('confirmOriginalOnly',{reason:errorText(snapshot.reason)})))return null;
  return record;
}
function paymentFxNote(payment){
  if(!SumiBilling.successful(payment))return '';
  const fx=payment.fxSnapshot;
  if(!fx)return `<div class="small payment-fx">${tx('legacyPaymentFx')}</div>`;
  if(fx.status==='unavailable')return `<div class="small payment-fx">${tx('unavailablePaymentFx')}</div>`;
  if(fx.provider==='identity')return `<div class="small payment-fx">${tx('identityPaymentFx',{currency:fx.displayCurrency})}</div>`;
  return `<div class="small payment-fx">${tx('frozenPaymentFx',{date:dateText(fx.date),amount:SumiI18n.money(fx.convertedAmount,fx.displayCurrency,{currencyDisplay:'code',maximumFractionDigits:6}),rate:numberText(fx.rate,{maximumSignificantDigits:6})})}</div>`;
}

function captureDraft(){
  if(!$('#subscriptionForm'))return;
  formDraft={name:$('#name').value,amount:$('#amount').value,currency:$('#formCurrency').value,
    months:Number($('#months').value),nextDate:$('#nextDate').value,status:$('#status').value,
    autoRenew:$('#autoRenew').value==='true',logo:selectedLogo,category:readCategoryInput()};
}
function bindLogos(){
  document.querySelectorAll('img[data-logo-image]').forEach(img=>{
    if(img.dataset.logoBound)return;img.dataset.logoBound='true';
    const fallback=()=>{const el=document.createElement('span');el.className='logo fallback';el.setAttribute('role','img');el.setAttribute('aria-label',t(img.dataset.logoName?'namedNoLogo':'noLogo',{name:img.dataset.logoName}));el.innerHTML=sumiIcon('image');img.replaceWith(el)};
    img.addEventListener('error',fallback,{once:true});
    if(img.dataset.logoRef){
      SumiLogoStore.resolve(img.dataset.logoRef).then(source=>{if(!img.isConnected)return;if(source)img.src=source;else{logoStorageWarning=true;fallback();showLogoStorageWarning()}}).catch(()=>{if(img.isConnected){logoStorageWarning=true;fallback();showLogoStorageWarning()}});
    }else if(img.complete&&!img.naturalWidth)fallback();
  });
}
function showLogoStorageWarning(){
  if(!logoStorageWarning||$('#logoStorageNotice'))return;
  const note=document.createElement('p');note.id='logoStorageNotice';note.className='storage-notice';note.setAttribute('role','status');note.textContent=t6('missingLogo');$('.main')?.prepend(note);
}
function commit(nextData,nextPrefs=preferences,recovery=false){
  try{storage.write(nextData,nextPrefs,recovery);data=nextData;preferences=nextPrefs;return true}
  catch(error){alert(errorText(error));return false}
}
function commitPreferences(nextPrefs){
  try{storage.writePreferences(nextPrefs);preferences=nextPrefs;return true}catch(error){alert(errorText(error));return false}
}
function updateData(change){try{const next=structuredClone(data);change(next);const recorded=SumiStats.recordChanges(data,next,today(),new Date().toISOString(),id);return commit(recorded)}catch(error){alert(errorText(error));return false}}
function downloadJson(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindValidation(){
  document.querySelectorAll('form input').forEach(input=>{
    const clear=()=>input.setCustomValidity('');
    input.addEventListener('input',clear);input.addEventListener('change',clear);
    input.addEventListener('invalid',()=>{
      clear();const validity=input.validity;
      input.setCustomValidity(t(validity.valueMissing?'requiredField':validity.rangeUnderflow||validity.rangeOverflow?'rangeField':'invalidField'));
    });
  });
}
function bind(){
  bindLogos();bindValidation();SumiPWA.bind();
  $('#refreshRates')?.addEventListener('click',()=>fxManager.refresh({force:true}));
  $('#startCostHistory')?.addEventListener('click',()=>{if(updateData(()=>{}))render()});
  $('#statsMode')?.addEventListener('change',()=>{captureStatsFilters();statsFilters.error='';render()});
  $('#statsFilters')?.addEventListener('submit',e=>{e.preventDefault();captureStatsFilters();render()});
  $('[data-show-subscriptions]')?.addEventListener('click',()=>{view='list';filter='';render()});
  $('#exportRaw')?.addEventListener('click',()=>downloadJson(storage.rawBackup(),`sumi-recovery-${today()}.json`));
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{view=el.dataset.nav;filter='';render()});
  document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{resetPickerState();closeSuggestions();modal='new';formDraft=null;selectedLogo='';render();$('#name')?.focus({preventScroll:true})});
  bindDetails();
  $('#search')?.addEventListener('input',e=>{filter=e.target.value;refreshTable()});
  $('#statusFilter')?.addEventListener('change',e=>{statusFilter=e.target.value;refreshTable()});
  const closeModal=()=>{const target=modal;resetPickerState();SumiMotion.close('#modalOverlay',()=>{if(modal!==target)return;resetPickerState();closeSuggestions();nameComposing=false;modal=null;picker=false;formDraft=null;selectedLogo='';render()})};
  document.querySelectorAll('[data-close]').forEach(el=>el.onclick=closeModal);
  $('#modalOverlay')?.addEventListener('click',e=>{if(e.target.id==='modalOverlay')closeModal()});
  $('#openPicker')?.addEventListener('click',()=>{captureDraft();closeSuggestions();resetPickerState();picker=true;pickerSearch='';render();$('#pickerSearch')?.focus({preventScroll:true})});
  $('#subscriptionForm')?.addEventListener('input',captureDraft);
  $('#subscriptionForm')?.addEventListener('change',captureDraft);
  $('#subscriptionForm')?.addEventListener('submit',e=>{
    e.preventDefault();captureDraft();
    if(!SumiData.formAmount(formDraft.amount)){alert(t('invalidAmount'));return}
    const old=modal==='new'?null:data.subscriptions.find(s=>s.id===modal);
    let s={...old,...formDraft,id:old?.id||id(),name:formDraft.name.trim(),amount:Number(formDraft.amount),logo:selectedLogo};
    const changedSchedule=old&&(old.nextDate!==s.nextDate||old.months!==s.months);
    if(!old||changedSchedule)s.billingAnchor=s.nextDate;
    try{s=SumiData.subscription(s)}catch(error){alert(errorText(error));return}
    if(changedSchedule&&SumiBilling.hasSuccessfulPayment(data.payments,s.id,s.nextDate)){alert(t('paidNewDate'));return}
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
  $('#removeLogo')?.addEventListener('click',()=>{resetPickerState();selectedLogo='';formDraft.logo='';picker=false;render();$('#openPicker')?.focus({preventScroll:true})});
  $('#uploadLogo')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const generation=++uploadGeneration,targetModal=modal;
    const pending=()=>generation===uploadGeneration&&modal===targetModal&&picker&&formDraft;
    logoUploading=true;logoError='';pickerFeedback();
    try{
      const compressed=await SumiLogoUpload.read(file);
      if(!pending())return;
      const result=await SumiLogoStore.save(compressed);
      if(!pending())return;
      logoUploading=false;selectedLogo=result;formDraft.logo=result;picker=false;render();$('#openPicker')?.focus({preventScroll:true});
    }catch(error){if(pending()){logoUploading=false;logoError=error.message||t('imageReadFailure');if($('#uploadLogo'))$('#uploadLogo').value='';pickerFeedback()}}
  });
  const closeDetail=()=>{const target=detailId;SumiMotion.close('#drawerOverlay',()=>{if(detailId===target){detailId=null;render()}})};
  $('#drawerOverlay')?.addEventListener('click',e=>{if(e.target.id==='drawerOverlay')closeDetail()});
  document.querySelectorAll('[data-close-detail]').forEach(b=>b.onclick=closeDetail);
  bindDialogKeys($('#drawerOverlay .drawer'),closeDetail);
  $('[data-edit]')?.addEventListener('click',()=>{resetPickerState();closeSuggestions();modal=detailId;detailId=null;formDraft=null;selectedLogo=data.subscriptions.find(s=>s.id===modal)?.logo||'';render()});
  $('[data-toggle]')?.addEventListener('click',()=>{const current=data.subscriptions.find(s=>s.id===detailId);if(!confirm(t(active(current)?'confirmCancel':'confirmRestore')))return;if(updateData(next=>{const s=next.subscriptions.find(x=>x.id===detailId);s.status=active(s)?'cancelled':'active'}))render()});
  $('[data-delete]')?.addEventListener('click',()=>{
    if(confirm(t('confirmDelete'))&&updateData(next=>{
      next.subscriptions=next.subscriptions.filter(s=>s.id!==detailId);next.payments=next.payments.filter(p=>p.subscriptionId!==detailId);
    })){detailId=null;render()}
  });
  $('[data-confirm]')?.addEventListener('click',e=>{
    const button=e.currentTarget,cycle=button.dataset.cycle,s=data.subscriptions.find(x=>x.id===detailId);
    if(confirming||!s||!active(s)||s.nextDate!==cycle)return;
    confirming=true;button.disabled=true;
    const unlock=()=>{confirming=false;const current=$('[data-confirm]');if(current)current.disabled=false};
    if(!confirm(t('confirmPayment',{name:s.name,cycle:dateText(cycle),date:dateText(today()),amount:original(s.amount,s.currency)}))){unlock();return}
    const record=preparePayment({id:id(),subscriptionId:s.id,name:s.name,date:today(),cycleDate:cycle,amount:s.amount,currency:s.currency,status:'succeeded',advancesSchedule:true});
    if(!record){unlock();return}
    const saved=updateData(next=>changePayment(next,record));
    if(saved){render();setTimeout(unlock,750)}else unlock();
  });
  $('[data-fail-payment]')?.addEventListener('click',()=>{
    const s=data.subscriptions.find(x=>x.id===detailId);
    if(!s||!active(s)||!confirm(t('confirmFailure',{name:s.name,cycle:dateText(s.nextDate)})))return;
    if(updateData(next=>changePayment(next,{id:id(),subscriptionId:s.id,name:s.name,date:today(),cycleDate:s.nextDate,amount:s.amount,currency:s.currency,status:'failed',advancesSchedule:false})))render();
  });
  $('[data-payment]')?.addEventListener('click',()=>{paymentModal='new';paymentDraft=null;render()});
  document.querySelectorAll('[data-edit-payment]').forEach(button=>button.onclick=()=>{paymentModal=button.dataset.editPayment;paymentDraft=null;render()});
  const closePayment=()=>{const target=paymentModal;SumiMotion.close('#paymentOverlay',()=>{if(paymentModal===target){paymentModal=null;paymentDraft=null;render()}})};
  bindDialogKeys($('#paymentOverlay .modal'),closePayment);
  document.querySelectorAll('[data-close-payment]').forEach(button=>button.onclick=closePayment);
  $('#paymentOverlay')?.addEventListener('click',e=>{if(e.target.id==='paymentOverlay')closePayment()});
  const capturePayment=capturePaymentDraft;
  $('#paymentForm')?.addEventListener('input',capturePayment);
  $('#paymentForm')?.addEventListener('change',capturePayment);
  $('#paymentForm')?.addEventListener('submit',e=>{
    e.preventDefault();capturePayment();
    const old=paymentModal==='new'?null:data.payments.find(p=>p.id===paymentModal);
    if(!SumiData.date(paymentDraft.date)||paymentDraft.date>today()){alert(t('invalidPaymentDate'));return}
    if(!SumiData.formAmount(paymentDraft.amount)&&!(old&&Number(paymentDraft.amount)===old.amount&&paymentDraft.amount.trim())){alert(t('invalidAmount'));return}
    if(paymentDraft.cycleDate&&!SumiData.date(paymentDraft.cycleDate)){alert(t('invalidCycleDate'));return}
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
    const text=t(previous.cycleDate&&SumiBilling.successful(previous)?'confirmDeleteLinkedPayment':'confirmDeletePayment');
    if(confirm(text)&&updateData(next=>changePayment(next,null,previous)))render();
  });
  document.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{calOffset+=Number(b.dataset.month);render()});
  for(const key of ['currency','theme','reminder','language','motion'])$('#'+key)?.addEventListener('change',e=>{
    commitPreferences({...preferences,[key]:key==='reminder'?Number(e.target.value):e.target.value});render();$('#'+key)?.focus();
  });
  $('#export')?.addEventListener('click',async event=>{
    if(exporting)return;exporting=true;event.currentTarget.disabled=true;
    try{
      if(storage.issues.length)downloadJson(storage.rawBackup(),`sumi-recovery-${today()}.json`);
      else{const savedPreferences=structuredClone(preferences),savedData=structuredClone(data);downloadJson({version:1,data:await SumiLogoStore.hydrateBackup(savedData),preferences:savedPreferences},`sumi-backup-${today()}.json`)}
    }catch(error){alert(errorText(error))}finally{exporting=false;if($('#export'))$('#export').disabled=false}
  });
  $('#import')?.addEventListener('click',()=>$('#importFile').click());
  $('#importFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file||importing)return;importing=true;
    try{
      if(file.size>50*1024*1024)throw Error(t('largeBackup'));
      const obj=SumiData.backup(JSON.parse(await file.text()));
      obj.data=await SumiLogoStore.hydrateBackup(obj.data);
      if(modal||paymentModal||picker||logoUploading)throw Error(t6('importBusy'));
      if(!confirm(t('confirmImport')))return;
      const previousData=data,previousPreferences=preferences;
      obj.data=await SumiLogoStore.prepareImport(obj.data);
      if(data!==previousData||preferences!==previousPreferences||modal||paymentModal||picker||logoUploading)throw Error(t6('importBusy'));
      if(commit(obj.data,obj.preferences,true)){resetPickerState();closeSuggestions();picker=false;selectedLogo='';nameComposing=false;modal=null;detailId=null;formDraft=null;paymentModal=null;paymentDraft=null;logoStorageWarning=false;render()}
    }catch(error){alert(t('importFailed',{error:errorText(error)}))}
    finally{importing=false;e.target.value=''}
  });
}
render();uiReady=true;fxManager.refresh();
SumiPWA.start({isBusy:()=>Boolean(modal||paymentModal||picker||logoUploading||exporting||importing||confirming),onChange:()=>{const panel=$('#pwaPanel');if(panel){const focusId=document.activeElement?.id;panel.outerHTML=SumiPWA.settingsMarkup();SumiPWA.bind();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true})}}});
setInterval(()=>fxManager.refresh(),60*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)fxManager.refresh()});
