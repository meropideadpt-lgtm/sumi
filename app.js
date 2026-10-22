const $=s=>document.querySelector(s);const services=['ChatGPT','Claude','Gemini','DeepSeek','Netflix','YouTube','Spotify','Apple Music','iCloud','Disney+','GagaOOLala','哔哩哔哩','爱奇艺','腾讯视频','优酷','网易云音乐','QQ音乐','WPS','Microsoft 365','Google One','百度网盘','夸克网盘','京东 PLUS','淘宝 88VIP','Notion','Figma','Canva','Dropbox','GitHub','Nintendo','PlayStation','Xbox','Amazon Prime'];const icons={'ChatGPT':'openai','Claude':'anthropic','Gemini':'googlegemini','DeepSeek':'deepseek','Netflix':'netflix','YouTube':'youtube','Spotify':'spotify','Apple Music':'applemusic','iCloud':'icloud','Disney+':'disneyplus','GagaOOLala':'','哔哩哔哩':'bilibili','爱奇艺':'iqiyi','腾讯视频':'tencentvideo','优酷':'youku','网易云音乐':'neteasecloudmusic','QQ音乐':'qqmusic','WPS':'wps','Microsoft 365':'microsoft','Google One':'google','百度网盘':'baidu','夸克网盘':'','京东 PLUS':'jd','淘宝 88VIP':'taobao','Notion':'notion','Figma':'figma','Canva':'canva','Dropbox':'dropbox','GitHub':'github','Nintendo':'nintendo','PlayStation':'playstation','Xbox':'xbox','Amazon Prime':'amazonprime'};const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const storage=SumiData.open({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
let data=storage.data,preferences=storage.preferences,view='home',filter='',statusFilter='all',modal=null,detailId=null,picker=false,selectedLogo='',pickerSearch='',calOffset=0,formDraft=null,paymentModal=null,paymentDraft=null,confirming=false;
const rates={CNY:1,USD:7.1,JPY:.048,HKD:.91,TWD:.22,EUR:7.8,GBP:9.1,KRW:.0052};const currencySymbol={CNY:'¥',USD:'$',JPY:'¥',HKD:'HK$',TWD:'NT$',EUR:'€',GBP:'£',KRW:'₩'};const converted=(amount,from,to=preferences.currency)=>Number(amount||0)*(rates[from]||1)/(rates[to]||1);const money=(amount,from=preferences.currency)=>`${currencySymbol[preferences.currency]||preferences.currency} ${converted(amount,from).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;const original=(amount,cur)=>`${cur} ${Number(amount).toFixed(2)}`;const active=s=>s.status!=='cancelled';const monthly=s=>converted(s.amount,s.currency)/(Number(s.months)||1);const total=()=>data.subscriptions.filter(active).reduce((a,s)=>a+monthly(s),0);const moneyDisplay=n=>`${currencySymbol[preferences.currency]||preferences.currency} ${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;const daysUntil=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000);const id=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());const logo=name=>Object.hasOwn(icons,name)&&icons[name]?`https://cdn.simpleicons.org/${icons[name]}`:null;const logoMarkup=(name,url)=>SumiData.safeLogo(url)?`<img class="logo" src="${esc(url)}" alt="" data-fallback="${esc((name||'?').slice(0,1))}">`:`<div class="logo fallback">${esc((name||'?').slice(0,1))}</div>`;const nav=[['home','home','首页'],['list','list','订阅列表'],['stats','stats','统计'],['calendar','calendar','日历'],['settings','settings','设置']];
function render(){document.body.classList.toggle('dark',preferences.theme==='dark');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">sumi</div><nav class="nav" aria-label="主导航">${nav.map(([k,i,t])=>`<button class="${view===k?'active':''} ${k==='settings'?'settings-link':''}" data-nav="${k}"><span class="symbol">${sumiIcon(i)}</span>${t}</button>`).join('')}</nav></aside><main class="main view-${view}">${storage.issues.length?`<div class="storage-notice" role="alert">${storage.issues.map(esc).join(" ")} <button class="linkbtn" id="exportRaw">导出原始数据</button></div>`:""}<header class="top"><div><h1>${{home:'首页',list:'订阅列表',stats:'统计',calendar:'日历',settings:'设置'}[view]}</h1><p class="sub">${{home:'轻松管理每一份订阅',list:'你的所有订阅，一目了然',stats:'了解你的订阅支出',calendar:'查看即将到来的续费',settings:'个性化你的 sumi'}[view]}</p></div>${view!=='settings'?`<button class="primary" data-add>${sumiIcon('plus')}添加订阅</button>`:''}</header>${({home:homePage,list:listPage,stats:statsPage,calendar:calendarPage,settings:settingsPage})[view]()}</main></div>${modal?modalHtml():''}${detailId?detailHtml():''}${picker?pickerHtml():''}${paymentModal?paymentHtml():''}`;bind()};const metrics=()=>{let a=data.subscriptions.filter(active),next=[...a].filter(s=>s.nextDate).sort((x,y)=>x.nextDate.localeCompare(y.nextDate))[0];return `<div class="cards ${view==='home'?'home-metrics':''}"><div class="card"><div class="card-title">平均每月订阅成本</div><div class="metric">${moneyDisplay(total())}</div><div class="small">按订阅周期分摊 · 估算汇率</div></div><div class="card"><div class="card-title">正在订阅</div><div class="metric">${a.length} <span style="font-size:15px;color:#91a0b4">项</span></div><div class="small">仅包含有效订阅</div></div><div class="card"><div class="card-title">下次续费</div><div class="metric" style="font-size:24px">${next?esc(next.nextDate):'暂无'}</div><div class="small">${next?esc(next.name):'添加订阅以开始'}</div></div></div>`};function chart(){let n=total(),months=Array.from({length:6},(_,i)=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-5+i);return `${d.getMonth()+1}月`});return `<div class="card section home-chart"><div class="section-title"><h2>月度成本概览</h2><span class="small">当前月成本参考值 · 非历史趋势</span></div><div class="chart">${months.map((m,i)=>`<div class="bar-item"><div class="bar ${i===5?'current':''}" title="${moneyDisplay(n)}" style="height:${n?70:2}%"></div><div class="bar-label">${m}</div></div>`).join('')}</div><p class="note">当前版本尚未保存历史成本快照，图表仅展示当前月成本参考值；Codex 后续将实现真实历史趋势。</p></div>`}
function reminders(){let list=data.subscriptions.filter(s=>active(s)&&daysUntil(s.nextDate)<=Number(preferences.reminder)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));return list.length?`<div class="reminders"><div style="font-weight:650;margin-bottom:8px">${sumiIcon('bell')}续费提醒 <span class="pill">${list.length} 项待关注</span></div>${list.map(s=>`<div class="reminder-item"><div><strong style="font-size:13px">${esc(s.name)}</strong><div class="notice">${daysUntil(s.nextDate)<0?'已过续费日 · 待确认':daysUntil(s.nextDate)===0?'今天续费':daysUntil(s.nextDate)+' 天后续费'} · ${esc(original(s.amount,s.currency))}</div></div><button class="secondary" data-detail="${esc(s.id)}">查看</button></div>`).join('')}</div>`:''}
function table(){let list=data.subscriptions.filter(s=>(statusFilter==='all'||(statusFilter==='active'?active(s):!active(s)))&&s.name.toLowerCase().includes(filter.toLowerCase()));return `<div class="card section ${view==='home'?'home-table':''}"><div class="section-title"><h2>我的订阅</h2><div class="tools"><input class="search" id="search" value="${esc(filter)}" placeholder="搜索订阅..."/><select class="select" id="statusFilter"><option value="all" ${statusFilter==='all'?'selected':''}>全部订阅</option><option value="active" ${statusFilter==='active'?'selected':''}>订阅中</option><option value="cancelled" ${statusFilter==='cancelled'?'selected':''}>已取消</option></select></div></div><div class="table-wrap"><table class="table"><thead><tr><th>订阅服务</th><th>费用</th><th>平均月成本</th><th>下次续费</th><th>状态</th></tr></thead><tbody>${list.map(s=>`<tr data-detail="${esc(s.id)}"><td><div class="service">${logoMarkup(s.name,s.logo)}${esc(s.name)}</div></td><td>${esc(original(s.amount,s.currency))} / ${esc(s.months)}月</td><td>${moneyDisplay(monthly(s))}</td><td>${esc(s.nextDate)}</td><td><span class="tag ${active(s)?'':'off'}">${active(s)?'订阅中':'已取消'}</span></td></tr>`).join('')}</tbody></table>${!list.length?'<div class="empty">暂无订阅，点击右上角「添加订阅」开始吧</div>':''}</div></div>`}const homePage=()=>metrics()+mobileSummary()+`<div class="section home-reminders">${reminders()}</div>`+chart()+table()+mobileSubscriptions();const listPage=()=>table();function statsPage(){let arr=data.subscriptions.filter(active).sort((a,b)=>monthly(b)-monthly(a)),sum=total();return metrics()+`<div class="grid2 section"><div class="card"><div class="section-title"><h2>各订阅月成本占比</h2></div>${arr.length?arr.map(s=>`<div style="margin:17px 0"><div class="detail-row" style="border:0;padding:0 0 8px"><span>${esc(s.name)}</span><strong>${moneyDisplay(monthly(s))} · ${sum?(monthly(s)/sum*100).toFixed(1):0}%</strong></div><div style="height:7px;border-radius:8px;background:#eef3fb;overflow:hidden"><div style="height:100%;width:${sum?monthly(s)/sum*100:0}%;background:#92b7e9;border-radius:8px"></div></div></div>`).join(''):'<div class="empty">暂无数据</div>'}</div><div class="card"><div class="section-title"><h2>实际付款历史</h2></div>${data.payments.some(SumiBilling.successful)?data.payments.filter(SumiBilling.successful).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<div class="payment"><div>${esc(p.name)}<div class="small">${esc(p.date)}</div></div><strong>${esc(original(p.amount,p.currency))}</strong></div>`).join(''):'<div class="empty">暂无已确认付款</div>'}<p class="note">实际付款与平均月成本独立计算。历史趋势将在后续版本实现。</p></div></div>`}
function calendarPage(){let d=new Date();d.setDate(1);d.setMonth(d.getMonth()+calOffset);const y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();let cells=Array.from({length:first},()=>'<div></div>');for(let day=1;day<=days;day++){let date=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,items=data.subscriptions.filter(s=>active(s)&&s.nextDate===date);cells.push(`<div class="calendar-cell"><b>${day}</b>${items.map(s=>`<button class="calendar-event" data-detail="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>`)}return `<div class="card"><div class="section-title"><h2>${y} 年 ${m+1} 月</h2><div class="month-switch"><button class="secondary" data-month="-1" aria-label="上一月">${sumiIcon('chevron-left')}</button><button class="secondary" data-month="1" aria-label="下一月">${sumiIcon('chevron-right')}</button></div></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<div class="small" style="text-align:center">周${x}</div>`).join('')}${cells.join('')}</div><p class="note">日历目前展示记录中的下一次续费日期。</p></div>`}
function settingsPage(){return `<div class="card"><div class="settings-row"><label>语言</label><select class="select" id="language"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文（待完善）</option><option value="ja">日本語（待完善）</option><option value="en">English（待完善）</option></select></div><div class="settings-row"><label>统一显示货币</label><select class="select" id="currency">${Object.keys(rates).map(c=>`<option ${preferences.currency===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="settings-row"><label>货币汇率</label><span class="small">当前使用演示固定汇率，非实时数据</span></div><div class="settings-row"><label>暗黑模式</label><select class="select" id="theme"><option value="light" ${preferences.theme==='light'?'selected':''}>关闭</option><option value="dark" ${preferences.theme==='dark'?'selected':''}>开启</option></select></div><div class="settings-row"><label>续费提醒（仅站内）</label><select class="select" id="reminder">${[0,1,3,7,14].map(x=>`<option value="${x}" ${Number(preferences.reminder)===x?'selected':''}>${x?'提前 '+x+' 天':'当天'}</option>`).join('')}</select></div><div class="settings-row"><label>备份与恢复</label><div class="tools"><button class="secondary" id="export">${storage.issues.length?'导出原始数据':'导出 JSON'}</button><button class="secondary" id="import">导入 JSON</button><input id="importFile" type="file" accept=".json,application/json" hidden></div></div><p class="note">本版本使用浏览器本地存储。清理浏览器数据可能导致记录丢失，请定期导出备份。语言切换、实时汇率及云同步留待后续开发。</p></div>`}
function modalHtml(){let s=formDraft||(modal==='new'?{name:'',amount:'',currency:'CNY',months:1,nextDate:today(),status:'active',autoRenew:true,logo:''}:data.subscriptions.find(x=>x.id===modal));if(!s)return '';return `<div class="overlay" id="modalOverlay"><div class="modal"><div class="modal-head"><h2>${modal==='new'?'添加订阅':'编辑订阅'}</h2><button class="iconbtn" data-close aria-label="关闭订阅表单">${sumiIcon('close')}</button></div><form id="subscriptionForm"><div class="form-grid"><div><label class="small">软件图标</label><button class="logo-picker" type="button" id="openPicker">${logoMarkup(s.name,s.logo||logo(s.name))}</button></div><div class="field"><label for="name">订阅名称</label><input id="name" required maxlength="70" value="${esc(s.name)}" autocomplete="off"><div id="suggestions"></div></div><div class="field"><label for="formCurrency">原始货币</label><select id="formCurrency">${Object.keys(rates).map(c=>`<option ${s.currency===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field" style="grid-column:2"><label for="nextDate">下次续费日期</label><input id="nextDate" type="date" min="0001-01-01" max="9999-12-31" required value="${esc(s.nextDate)}"></div><div class="field"><label for="amount">金额</label><input id="amount" type="number" required min="0" step="0.01" value="${esc(s.amount)}"></div><div class="field" style="grid-column:2"><label for="months">订阅周期</label><select id="months">${[1,3,6,12].map(n=>`<option value="${n}" ${Number(s.months)===n?'selected':''}>${n} 个月</option>`).join('')}</select></div><div class="field"><label for="status">订阅状态</label><select id="status"><option value="active" ${active(s)?'selected':''}>订阅中</option><option value="cancelled" ${!active(s)?'selected':''}>已取消</option></select></div><div class="field" style="grid-column:2"><label for="autoRenew">自动续费</label><select id="autoRenew"><option value="true" ${s.autoRenew?'selected':''}>开启</option><option value="false" ${!s.autoRenew?'selected':''}>关闭</option></select></div></div><div class="modal-actions"><button class="secondary" type="button" data-close>取消</button><button class="primary" type="submit">${modal==='new'?'添加':'保存修改'}</button></div></form></div></div>`}
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
  return `<div class="payment" data-payment-id="${esc(p.id)}"><div>${esc(p.date)}<div class="small">${succeeded?'付款成功':'付款失败'}${p.scheduleArchived?' · 旧账期':''}${p.cycleDate?' · 账期 '+esc(p.cycleDate):' · 未关联账期'}</div></div><div><strong>${esc(original(p.amount,p.currency))}</strong><div class="payment-actions"><button class="linkbtn" data-edit-payment="${esc(p.id)}">编辑</button><button class="linkbtn" data-remove-payment="${esc(p.id)}">删除</button></div></div></div>`;
}
function detailHtml(){
  const s=data.subscriptions.find(x=>x.id===detailId);if(!s)return '';
  const history=data.payments.filter(p=>p.subscriptionId===s.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="drawer-overlay" id="drawerOverlay"><div class="drawer" role="dialog" aria-modal="true" aria-label="订阅详情"><div class="drawer-header"><strong>订阅详情</strong><button class="iconbtn" data-close-detail aria-label="关闭订阅详情">${sumiIcon('close')}</button></div><div class="detail-hero">${logoMarkup(s.name,s.logo)}<div><h2>${esc(s.name)}</h2><span class="tag ${active(s)?'':'off'}">${active(s)?'订阅中':'已取消'}</span></div></div><div class="detail-price"><div class="small">平均每月成本</div><strong>${moneyDisplay(monthly(s))}</strong><div class="small">${esc(original(s.amount,s.currency))} / ${esc(s.months)}个月 · 演示汇率</div></div>${[['下次续费',s.nextDate],['订阅周期',s.months+' 个月'],['自动续费',s.autoRenew?'开启':'关闭'],['订阅状态',active(s)?'订阅中':'已取消']].map(([a,b])=>`<div class="detail-row"><span>${a}</span><strong>${esc(b)}</strong></div>`).join('')}<div class="section-title section"><h2>付款历史</h2><button class="linkbtn" data-payment>${sumiIcon('plus')}补录付款</button></div>${history.length?history.map(paymentHistoryRow).join(''):'<div class="empty">暂无付款记录</div>'}<div class="stack section">${active(s)?`<button class="primary" data-confirm data-cycle="${esc(s.nextDate)}" ${confirming?'disabled':''}>${sumiIcon('check')}确认本次续费成功</button><button class="secondary" data-fail-payment>${sumiIcon('warning')}记录本次付款失败</button>`:''}<button class="secondary" data-edit>${sumiIcon('edit')}编辑订阅</button><button class="secondary" data-toggle>${sumiIcon(active(s)?'pause':'play')}${active(s)?'标记为已取消':'恢复订阅'}</button><button class="secondary" data-delete style="color:#c97d7d">${sumiIcon('trash')}删除订阅</button></div><p class="note">这里只记录付款结果，不会实际扣费。每次成功确认仅结清对应账期；逾期账期逐期处理，失败不推进日期。取消仅更改本地状态，恢复后保留原账期。删除或改为失败的关联付款会重新打开对应账期。</p></div></div>`;
}
function paymentHtml(){
  const subscription=data.subscriptions.find(s=>s.id===detailId);if(!paymentModal||!subscription)return '';
  const old=paymentModal==='new'?null:data.payments.find(p=>p.id===paymentModal);
  const p=paymentDraft||old||{date:today(),amount:'',currency:subscription.currency,cycleDate:'',status:'succeeded'};
  return `<div class="overlay payment-overlay" id="paymentOverlay"><div class="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="paymentTitle"><div class="modal-head"><h2 id="paymentTitle">${old?'编辑付款记录':'补录付款'}</h2><button class="iconbtn" data-close-payment aria-label="关闭付款表单">${sumiIcon('close')}</button></div><form id="paymentForm"><div class="field"><label for="paymentDate">实际付款日期</label><input id="paymentDate" type="date" required min="0001-01-01" max="${today()}" value="${esc(p.date)}"></div><div class="field"><label for="paymentAmount">付款金额</label><input id="paymentAmount" type="number" required min="0" step="${old?'any':'0.01'}" value="${esc(p.amount)}"></div><div class="field"><label for="paymentCurrency">原始货币</label><select id="paymentCurrency">${Object.keys(rates).map(c=>`<option ${p.currency===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label for="paymentCycleDate">对应账期（可选）</label><input id="paymentCycleDate" type="date" min="0001-01-01" max="9999-12-31" value="${esc(p.cycleDate||'')}"></div><div class="field"><label for="paymentStatus">付款结果</label><select id="paymentStatus"><option value="succeeded" ${SumiBilling.successful(p)?'selected':''}>付款成功</option><option value="failed" ${p.status==='failed'?'selected':''}>付款失败</option></select></div><p class="note">${old?.scheduleArchived?'这条记录属于旧账期设置，保持原账期时不会影响当前续费日；修改对应账期可关联当前设置。':''}关联账期后，成功付款会推进至下一未付款账期。留空则仅补记历史，不推算账期。失败记录不计入实际付款。</p><div class="modal-actions"><button class="secondary" type="button" data-close-payment>取消</button><button class="primary" type="submit">保存付款记录</button></div></form></div></div>`;
}

function pickerHtml(){let arr=services.filter(s=>s.toLowerCase().includes(pickerSearch.toLowerCase()));return `<div class="overlay" id="pickerOverlay" style="z-index:20"><div class="modal" style="max-width:460px"><div class="modal-head"><h2>选择图标</h2><button class="iconbtn" id="closePicker" aria-label="关闭图标选择">${sumiIcon('close')}</button></div><input class="search" id="pickerSearch" placeholder="搜索 ChatGPT、Netflix、Spotify..." value="${esc(pickerSearch)}" style="width:100%;margin-bottom:20px"><div class="small" style="margin-bottom:12px">常用服务</div><div class="picker-grid">${arr.map(s=>`<button class="pick-item" data-pick="${esc(s)}">${logoMarkup(s,logo(s))}<span>${esc(s)}</span></button>`).join('')}</div><div style="margin-top:20px"><label class="secondary" style="display:block;text-align:center;cursor:pointer">${sumiIcon('upload')}上传自己的图片<input id="uploadLogo" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div><p class="note">品牌图标从公开 CDN 加载，可能因网络或图标缺失而显示首字占位；未来需完善品牌授权和离线资源。</p></div></div>`}
function captureDraft(){
  if(!$('#subscriptionForm'))return;
  formDraft={name:$('#name').value,amount:$('#amount').value,currency:$('#formCurrency').value,
    months:Number($('#months').value),nextDate:$('#nextDate').value,status:$('#status').value,
    autoRenew:$('#autoRenew').value==='true',logo:selectedLogo};
}
function bindLogos(){
  document.querySelectorAll('img[data-fallback]').forEach(img=>{
    const fallback=()=>{const el=document.createElement('div');el.className='logo fallback';el.textContent=img.dataset.fallback;img.replaceWith(el)};
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&!img.naturalWidth)fallback();
  });
}
function commit(nextData,nextPrefs=preferences,recovery=false){
  try{storage.write(nextData,nextPrefs,recovery);data=nextData;preferences=nextPrefs;return true}
  catch(error){alert(error.message);return false}
}
function updateData(change){try{const next=structuredClone(data);change(next);return commit(next)}catch(error){alert(error.message);return false}}
function downloadJson(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bind(){
  bindLogos();
  $('[data-show-subscriptions]')?.addEventListener('click',()=>{view='list';filter='';render()});
  $('#exportRaw')?.addEventListener('click',()=>downloadJson(storage.rawBackup(),`sumi-recovery-${today()}.json`));
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{view=el.dataset.nav;filter='';render()});
  document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{modal='new';formDraft=null;selectedLogo='';render()});
  document.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>{detailId=el.dataset.detail;render()});
  $('#search')?.addEventListener('input',e=>{filter=e.target.value;const pos=e.target.selectionStart;render();$('#search')?.focus();$('#search')?.setSelectionRange(pos,pos)});
  $('#statusFilter')?.addEventListener('change',e=>{statusFilter=e.target.value;render()});
  const closeModal=()=>{modal=null;formDraft=null;selectedLogo='';render()};
  document.querySelectorAll('[data-close]').forEach(el=>el.onclick=closeModal);
  $('#modalOverlay')?.addEventListener('click',e=>{if(e.target.id==='modalOverlay')closeModal()});
  $('#openPicker')?.addEventListener('click',()=>{captureDraft();picker=true;pickerSearch='';render()});
  $('#subscriptionForm')?.addEventListener('input',captureDraft);
  $('#subscriptionForm')?.addEventListener('change',captureDraft);
  $('#subscriptionForm')?.addEventListener('submit',e=>{
    e.preventDefault();captureDraft();
    if(!SumiData.formAmount(formDraft.amount)){alert('请输入有效金额，最多保留两位小数。');return}
    const old=modal==='new'?null:data.subscriptions.find(s=>s.id===modal);
    let s={...old,...formDraft,id:old?.id||id(),name:formDraft.name.trim(),amount:Number(formDraft.amount),logo:selectedLogo||logo(formDraft.name.trim())||''};
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
  $('#name')?.addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    $('#suggestions').innerHTML=q?services.filter(s=>s.toLowerCase().includes(q)).slice(0,3).map(s=>`<button type="button" class="linkbtn" data-suggest="${esc(s)}">${esc(s)}</button>`).join(''):'';
    document.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{
      $('#name').value=b.dataset.suggest;selectedLogo=logo(b.dataset.suggest)||'';captureDraft();
      $('#suggestions').innerHTML='';$('#openPicker').innerHTML=logoMarkup(b.dataset.suggest,selectedLogo);bindLogos();
    });
  });
  $('#closePicker')?.addEventListener('click',()=>{picker=false;render()});
  $('#pickerSearch')?.addEventListener('input',e=>{pickerSearch=e.target.value;const pos=e.target.selectionStart;render();$('#pickerSearch')?.focus();$('#pickerSearch')?.setSelectionRange(pos,pos)});
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
    selectedLogo=logo(b.dataset.pick)||'';formDraft.name=b.dataset.pick;formDraft.logo=selectedLogo;picker=false;render();
  });
  $('#uploadLogo')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>500000){alert('请选择小于 500KB 的 PNG、JPEG 或 WebP 图片。');return}
    const reader=new FileReader(),draft=formDraft;
    reader.onerror=()=>alert('图片读取失败，请重试。');
    reader.onload=()=>{
      const img=new Image();img.onerror=()=>alert('无法读取这张图片，请选择有效的图片文件。');
      img.onload=()=>{if(formDraft!==draft||!picker)return;selectedLogo=reader.result;formDraft.logo=selectedLogo;picker=false;render()};img.src=reader.result;
    };
    reader.readAsDataURL(f);
  });
  $('#drawerOverlay')?.addEventListener('click',e=>{if(e.target.id==='drawerOverlay'){detailId=null;render()}});
  document.querySelectorAll('[data-close-detail]').forEach(b=>b.onclick=()=>{detailId=null;render()});
  $('[data-edit]')?.addEventListener('click',()=>{modal=detailId;detailId=null;formDraft=null;selectedLogo=data.subscriptions.find(s=>s.id===modal)?.logo||'';render()});
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
    const saved=updateData(next=>changePayment(next,{id:id(),subscriptionId:s.id,name:s.name,date:today(),cycleDate:cycle,amount:s.amount,currency:s.currency,status:'succeeded',advancesSchedule:true}));
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
  const capturePayment=()=>{paymentDraft={date:$('#paymentDate').value,amount:$('#paymentAmount').value,currency:$('#paymentCurrency').value,cycleDate:$('#paymentCycleDate').value,status:$('#paymentStatus').value}};
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
    if(updateData(next=>changePayment(next,record,old))){paymentModal=null;paymentDraft=null;render()}
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
render();
