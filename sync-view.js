/* Cloud-sync presentation only. Actions and persistence belong to the controller. */
const SumiSyncView = (() => {
  const statuses = new Set(['disabled','synced','syncing','offline','error','conflict','paused']);
  const kinds = ['subscriptions','payments','costHistory','preferences','extensions','images'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  function errorKey(error) {
    const value = typeof error === 'string' ? error : typeof error?.code === 'string' ? error.code : '';
    if (value === 'sync-other-tab') return 'otherTab';
    if (value === 'sync-lock-unavailable') return 'lockUnavailable';
    if (/^(network|offline|sync-network|fetch-failed|sync-offline)$/.test(value)) return 'network';
    if (/^(auth|auth-required|unauthorized|sync-auth|sync-identity|workspace-locked|sync-locked|identity-changed|session-changed)$/.test(value)) return 'auth';
    if (/^(setup|migration-required|migration-missing|sync-unavailable|sync-not-configured|schema-missing)$/.test(value)) return 'setup';
    if (/^(permission|forbidden|sync-permission)$/.test(value)) return 'permission';
    if (/^(image|logo|sync-image|sync-logo)(-|$)/.test(value)) return 'image';
    if (/^(storage|sync-storage|quota|state-storage)(-|$)/.test(value)) return 'storage';
    if (/^(changed|stale-local|stale-preview|preview-stale|local-changed|sync-stale|sync-local-changed|sync-preview-stale|sync-preview-expired)$/.test(value)) return 'changed';
    if (/^(busy|sync-busy)$/.test(value)) return 'busy';
    if (value==='sync-too-large') return 'tooLarge';
    if (value==='sync-verification-failed') return 'verification';
    if (/^(invalid|sync-invalid|invalid-state|sync-state-invalid|invalid-data|validation|sync-validation)(-|$)/.test(value)) return 'invalid';
    return 'generic';
  }
  function create(options = {}) {
    const translator = () => options.i18n || (typeof SumiI18n !== 'undefined' ? SumiI18n : null);
    const tr = (key,params) => translator()?.t('sync.'+key,params) || 'Cloud sync is unavailable.';
    const tx = (key,params) => escape(tr(key,params));
    const number = value => Number.isSafeInteger(value) && value >= 0 ? translator()?.number(value) ?? String(value) : tr('unknown');
    const lastTime = value => {
      if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return tr('notYet');
      const i18n=translator();
      if(typeof i18n?.dateTime==='function')return i18n.dateTime(value);
      try{return new Intl.DateTimeFormat(i18n?.getLanguage?.()||'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
      catch{return tr('notYet')}
    };
    const states = new WeakMap();
    const statusFor = model => statuses.has(model?.status) ? model.status : model?.enabled ? 'error' : 'disabled';
    const busyFor = model => Boolean(model?.busy || statusFor(model) === 'syncing');
    const action = (name,label,attributes='',disabled=false,primary=false) =>
      `<button type="button" class="${primary?'primary':'secondary'}" data-sync-action="${name}" ${attributes}${disabled?' disabled':''}>${tx(label)}</button>`;
    function countsMarkup(preview) {
      return `<div class="sync-counts-wrap"><table class="sync-counts"><thead><tr><th scope="col">${tx('type')}</th><th scope="col">${tx('local')}</th><th scope="col">${tx('cloud')}</th></tr></thead><tbody>${kinds.map(kind=>`<tr><th scope="row">${tx('kind.'+kind)}</th><td>${escape(number(preview.localCounts?.[kind]))}</td><td>${escape(number(preview.cloudCounts?.[kind]))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function previewMarkup(model) {
      const preview = model.preview;
      if (!preview || typeof preview.id !== 'string') return '';
      const attrs = `data-sync-preview="${escape(preview.id)}"`;
      return `<section class="sync-preview" aria-labelledby="syncPreviewTitle"><h3 id="syncPreviewTitle" tabindex="-1">${tx('previewTitle')}</h3><p class="note">${tx('previewNote')}</p>${countsMarkup(preview)}<p class="small">${tx('differences',{count:number(preview.differences)})}</p><div class="sync-first-choice">${action('upload','upload',attrs,busyFor(model),true)}<p class="note">${tx('uploadNote')}</p></div><div class="sync-first-choice">${action('restore','restore',attrs,busyFor(model))}<p class="note">${tx('restoreNote')}</p></div>${action('cancelPreview','cancelPreview','',busyFor(model))}</section>`;
    }
    function versionMarkup(payload,deleted,label) {
      if (deleted) return `<p class="sync-deleted">${tx('deleted')}</p>${payload == null ? '' : `<pre tabindex="0" role="region" aria-label="${tx(label)}">${escape(JSON.stringify(payload,null,2))}</pre>`}`;
      if (payload == null) return `<p class="small">${tx('absent')}</p>`;
      return `<pre tabindex="0" role="region" aria-label="${tx(label)}">${escape(JSON.stringify(payload,null,2))}</pre>`;
    }
    function conflictsMarkup(model) {
      const groups = Array.isArray(model.conflicts) ? model.conflicts : [];
      if (!groups.length) return '';
      return `<section class="sync-conflicts" aria-labelledby="syncConflictsTitle"><h3 id="syncConflictsTitle" tabindex="-1">${tx('conflictsTitle')}</h3><p class="note">${tx('conflictsNote')}</p>${groups.map((group,index)=>{
        const records = Array.isArray(group.records) ? group.records : [];
        const attrs = `data-sync-conflict-id="${escape(group.id)}"`;
        const blockedReason = {'paid-cycle':'paidCycle','parent-deleted':'parentDeleted','dependent-records':'dependentRecords'}[group.reason];
        return `<details class="sync-conflict" data-sync-conflict="${escape(group.id)}"><summary>${tx('conflictGroup',{count:number(index+1)})}</summary>${blockedReason?`<p class="sync-warning">${tx(blockedReason)}</p>`:''}${records.map(record=>{
          const kind = kinds.includes(record.kind) ? record.kind : 'unknown';
          const name = record.local?.name || record.remote?.name || record.id;
          return `<article class="sync-conflict-record"><h4>${tx('kind.'+kind)} · ${escape(name)}</h4><p class="small sync-record-id">${escape(record.id)}</p><div class="sync-versions"><div><h5>${tx('localVersion')}</h5>${versionMarkup(record.local,record.localDeleted,'localVersion')}</div><div><h5>${tx('cloudVersion')}</h5>${versionMarkup(record.remote,record.remoteDeleted,'cloudVersion')}</div></div></article>`;
        }).join('')}<div class="sync-actions">${action('local','useLocal',attrs,busyFor(model)||Boolean(blockedReason))}${action('remote','useCloud',attrs,busyFor(model))}</div></details>`;
      }).join('')}</section>`;
    }
    function markup(model = {}) {
      if (model.guest) return `<section id="syncPanel" class="sync-panel" aria-labelledby="syncTitle"><h2 id="syncTitle">${tx('title')}</h2><p class="note">${tx('guestNote')}</p></section>`;
      const status = statusFor(model), busy = busyFor(model);
      return `<section id="syncPanel" class="sync-panel" aria-labelledby="syncTitle" aria-busy="${busy}"><div class="sync-heading"><h2 id="syncTitle" tabindex="-1">${tx('title')}</h2><span class="sync-status" data-sync-status data-state="${status}" role="status" aria-live="polite">${tx('status.'+status)}</span></div><p class="note">${tx(model.enabled?'enabledNote':'disabledNote')}</p><dl class="sync-metrics"><div><dt>${tx('pending')}</dt><dd data-sync-pending>${escape(number(model.pending??0))}</dd></div><div><dt>${tx('lastSuccess')}</dt><dd data-sync-time>${escape(lastTime(model.lastSuccess))}</dd></div></dl><p class="sync-error" data-sync-error role="alert"${model.error?'':' hidden'}>${model.error?tx('error.'+errorKey(model.error)):''}</p><div class="sync-actions">${model.enabled?action('retry',status==='error'||status==='offline'?'retry':'syncNow','',busy):model.preview?'':action('inspect','inspect','',busy)}${model.hasBackup?action('exportBackup','backup','',busy):''}</div>${previewMarkup(model)}${conflictsMarkup(model)}</section>`;
    }
    function panelFor(container) {
      if (!container) return null;
      return container.id === 'syncPanel' ? container : container.querySelector?.('#syncPanel') || null;
    }
    function updateStatus(panel,model) {
      const status = statusFor(model), node = panel.querySelector('[data-sync-status]');
      if (node) { node.textContent=tr('status.'+status); node.dataset.state=status; }
      const pending=panel.querySelector('[data-sync-pending]'),time=panel.querySelector('[data-sync-time]'),error=panel.querySelector('[data-sync-error]');
      if(pending)pending.textContent=number(model.pending??0);
      if(time)time.textContent=lastTime(model.lastSuccess);
      if(error){error.hidden=!model.error;error.textContent=model.error?tr('error.'+errorKey(model.error)):'';}
      panel.setAttribute('aria-busy',String(busyFor(model)));
    }
    function bind(container,actions = {}) {
      const panel=panelFor(container);if(!panel)return;
      let state=states.get(panel);
      if(!state){
        state={actions,running:false,pending:null};states.set(panel,state);
        panel.addEventListener('focusout',()=>queueMicrotask(()=>{
          if(state.pending&&!state.running&&panel.isConnected&&!panel.contains(panel.ownerDocument.activeElement)){
            const pending=state.pending;state.pending=null;refresh(panel,pending.model,pending.actions,{force:true});
          }
        }));
      }else state.actions=actions;
      panel.onclick=async event=>{
        const button=event.target.closest?.('[data-sync-action]');
        if(!button||!panel.contains(button)||button.disabled||state.running)return;
        const name=button.dataset.syncAction;
        const handler=['local','remote'].includes(name)?state.actions.resolve:state.actions[name];
        if(typeof handler!=='function')return;
        event.preventDefault();state.running=true;
        // This button already completed its click. Never disable/recreate it on
        // pointerdown or restore focus by opening a native picker.
        button.disabled=true;
        try{
          if(['local','remote'].includes(name))await handler(button.dataset.syncConflictId,name);
          else if(['upload','restore'].includes(name))await handler(button.dataset.syncPreview);
          else await handler();
        }catch{
          const error=panel.querySelector('[data-sync-error]');
          if(error){error.hidden=false;error.textContent=tr('error.generic')}
        }finally{
          state.running=false;
          if(state.pending&&panel.isConnected){const pending=state.pending;state.pending=null;refresh(panel,pending.model,pending.actions,{force:true})}
          else if(button.isConnected)button.disabled=false;
        }
      };
    }
    function refresh(container,model,actions = {},{force=false}={}) {
      const panel=panelFor(container);if(!panel)return null;
      const active=panel.ownerDocument.activeElement,state=states.get(panel),focused=panel.contains(active);
      // Automatic state updates keep the user's current action node attached.
      // The click handler flushes the pending view only after the action settles.
      if(!force&&(focused||state?.running)){
        updateStatus(panel,model);bind(panel,actions);
        states.get(panel).pending={model,actions};return panel;
      }
      const open=new Set([...panel.querySelectorAll('details[data-sync-conflict][open]')].map(node=>node.dataset.syncConflict));
      const focus=focused&&active?.dataset?.syncAction?{action:active.dataset.syncAction,id:active.dataset.syncConflictId}:null;
      const wrapper=panel.ownerDocument.createElement('div');wrapper.innerHTML=markup(model);
      const next=wrapper.firstElementChild;panel.replaceWith(next);bind(next,actions);
      for(const node of next.querySelectorAll('details[data-sync-conflict]'))if(open.has(node.dataset.syncConflict))node.open=true;
      if(focused){
        const matching=focus&&[...next.querySelectorAll('[data-sync-action]')].find(node=>node.dataset.syncAction===focus.action&&node.dataset.syncConflictId===focus.id&&!node.disabled);
        (matching||next.querySelector('#syncPreviewTitle,#syncConflictsTitle,#syncTitle'))?.focus({preventScroll:true});
      }
      return next;
    }
    return Object.freeze({markup,bind,refresh,errorText:error=>tr('error.'+errorKey(error))});
  }
  return Object.freeze({...create(),create,errorKey});
})();
if(typeof module!=='undefined')module.exports=SumiSyncView;
