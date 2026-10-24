/* Login shell. App code is loaded once, only after a workspace has been pinned. */
const SumiAccess = (() => {
  const root=document.createElement('div');root.id='access-root';document.body.append(root);
  const app=document.getElementById('app'),workspace=SumiWorkspace;
  const tr=(key,params)=>SumiI18n.t('auth.'+key,params);
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let auth=null,authPromise=null,loaded=false,loadingApp=false,busy=false,transitioning=false,locked=false,error='',status='',isBusy=()=>false,restoreIntent=true;
  const UI_PREFS='sumi-login-prefs-v1';
  let loginPrefs={language:'zh-CN',theme:'light'};
  try{const saved=JSON.parse((workspace.choice().mode==='account'?localStorage.getItem(workspace.preferenceKey())||localStorage.getItem(UI_PREFS)||localStorage.getItem('sumi-prefs-v1'):localStorage.getItem(UI_PREFS)||localStorage.getItem(workspace.preferenceKey()))||'null');if(saved){loginPrefs.language=SumiI18n.normalize(saved.language);if(['light','dark','system'].includes(saved.theme))loginPrefs.theme=saved.theme}}catch{}
  function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script)})}
  function setError(code){error=code;const node=root.querySelector('[data-auth-error]');if(node){node.textContent=code?tr(code):'';node.hidden=!code}}
  function setStatus(code){status=code;const node=root.querySelector('[data-auth-status]');if(node){node.textContent=code?tr(code):'';node.hidden=!code}}
  function setBusy(value){busy=value;const button=root.querySelector('#auth-submit');if(button){button.disabled=busy||!SumiAuth.configuration(SumiAuthConfig);button.textContent=tr(busy?'signingIn':'signIn')}root.querySelector('#auth-form')?.setAttribute('aria-busy',String(value))}
  function translateGate(){
    root.querySelectorAll('[data-auth-text]').forEach(node=>{node.textContent=tr(node.dataset.authText)});
    root.querySelectorAll('[data-auth-label]').forEach(node=>node.setAttribute('aria-label',tr(node.dataset.authLabel)));
    root.querySelectorAll('#auth-theme option').forEach(node=>node.textContent=SumiI18n.t('app.'+node.value));
    document.documentElement.lang=SumiI18n.getLanguage();setError(error);setStatus(status);setBusy(busy);
  }
  function renderGate(){
    if(!locked){SumiI18n.setLanguage(loginPrefs.language);SumiTheme.apply(loginPrefs.theme)}
    document.body.classList.add('access-visible');root.hidden=false;
    root.innerHTML=`<main class="access-screen ${locked?'access-locked':''}" aria-labelledby="auth-title" ${locked?'role="dialog" aria-modal="true"':''}><div class="access-preferences"><label><span class="sr-only" data-auth-text="language"></span><select id="auth-language" data-auth-label="language">${[['zh-CN','简体中文'],['zh-TW','繁體中文'],['ja-JP','日本語'],['en','English']].map(([value,label])=>`<option value="${value}" ${value===SumiI18n.getLanguage()?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="sr-only" data-auth-text="theme"></span><select id="auth-theme" data-auth-label="theme">${['light','dark','system'].map(value=>`<option value="${value}" ${value===SumiTheme.getMode()?'selected':''}></option>`).join('')}</select></label></div><section class="access-card"><div class="access-brand">sumi</div><h1 id="auth-title" data-auth-text="title"></h1><p class="access-note" data-auth-text="${locked?'locked':'separate'}"></p><form id="auth-form" novalidate><div class="field"><label for="auth-email" data-auth-text="email"></label><input id="auth-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254"></div><div class="field"><label for="auth-password" data-auth-text="password"></label><input id="auth-password" name="password" type="password" autocomplete="current-password" required maxlength="4096"></div><p class="access-status" data-auth-status role="status" hidden></p><p class="access-error" data-auth-error role="alert" hidden></p><button class="primary access-submit" id="auth-submit" type="submit" data-auth-text="signIn"></button></form></section><footer class="access-footer"><button id="auth-guest" class="linkbtn" type="button" data-auth-text="guest"></button></footer></main>`;
    translateGate();
    root.querySelector('#auth-language').onchange=event=>{loginPrefs.language=event.target.value;SumiI18n.setLanguage(loginPrefs.language);saveLoginPrefs();translateGate()};
    root.querySelector('#auth-theme').onchange=event=>{loginPrefs.theme=event.target.value;SumiTheme.apply(loginPrefs.theme);saveLoginPrefs()};
    root.querySelector('#auth-guest').onclick=enterGuest;
    root.querySelectorAll('#auth-email,#auth-password').forEach(input=>input.addEventListener('input',()=>{restoreIntent=false;setStatus('')}));
    root.querySelector('#auth-form').onsubmit=async event=>{
      event.preventDefault();if(busy)return;restoreIntent=false;
      const email=root.querySelector('#auth-email'),field=root.querySelector('#auth-password');
      if(!email.validity.valid||!field.value){setError('invalidForm');(!email.validity.valid?email:field).focus();return}
      let password=field.value;field.value='';setError('');setStatus('');setBusy(true);
      try{const manager=await ensureAuth();const result=await manager.login(email.value,password);if(root.hidden)return;if(!result.ok){setError(result.error);return}await acceptUser(result.user,true)}
      catch{setError('failed')}
      finally{password='';setBusy(false)}
    };
    if(!SumiAuth.configuration(SumiAuthConfig))setStatus('unconfigured');
  }
  function saveLoginPrefs(){try{localStorage.setItem(UI_PREFS,JSON.stringify(loginPrefs))}catch{/* Login appearance must not prevent offline guest access. */}}
  function lock(){
    if(locked||transitioning||workspace.current()?.mode!=='account')return;
    workspace.lock();locked=true;app.inert=true;app.setAttribute('aria-hidden','true');error='';status='';renderGate();
    root.querySelector('#auth-email')?.focus({preventScroll:true});
  }
  async function ensureAuth(){
    if(auth)return auth;if(authPromise)return authPromise;
    authPromise=(async()=>{
      if(!globalThis.supabase)await loadScript('supabase-sdk.js');
      auth=SumiAuth.create({config:SumiAuthConfig,createClient:globalThis.supabase.createClient,storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)},onChange:state=>{
        // Queue UI work outside the SDK's session lock. Never replace an active
        // guest or account workspace in response to an asynchronous auth event.
        queueMicrotask(()=>{if((loaded||loadingApp)&&workspace.current()?.mode==='account'&&(!state.user||state.user.id!==workspace.current().userId))lock();refreshPanel()});
      }});return auth;
    })().catch(error=>{authPromise=null;throw error});return authPromise;
  }
  async function startApp(value){
    if(loaded||loadingApp)return;loadingApp=true;
    workspace.activate(value);workspace.remember(value);
    root.hidden=true;root.replaceChildren();document.body.classList.remove('access-visible');
    try{await loadScript('app.js');loaded=true;if(value.mode==='account'&&auth?.getState().user?.id!==value.userId)lock()}
    catch{root.hidden=false;root.innerHTML=`<main class="access-screen"><section class="access-card"><p role="alert">${escape(tr('loadFailed'))}</p><button class="primary" id="auth-reload">${escape(tr('reload'))}</button></section></main>`;root.querySelector('#auth-reload').onclick=()=>location.reload()}
    finally{loadingApp=false}
  }
  async function acceptUser(user,explicit=false){
    if(locked){
      if(workspace.current()?.userId!==user.id){setStatus('');setError('sameAccount');return}
      workspace.unlock(user.id);locked=false;app.inert=false;app.removeAttribute('aria-hidden');root.hidden=true;root.replaceChildren();document.body.classList.remove('access-visible');refreshPanel();return;
    }
    if(loaded||loadingApp)return;
    const previous=workspace.choice();
    if(!explicit&&previous.mode==='account'&&previous.userId!==user.id){setStatus('');setError('sameAccount');return}
    await startApp(workspace.identity(SumiAuthConfig.url,user.id));
  }
  function enterGuest(){
    restoreIntent=false;
    if(loaded){if(isBusy()&&!confirm(tr('discard')))return;workspace.remember(workspace.guest());auth?.pause();location.reload();return}
    auth?.pause();startApp(workspace.guest());
  }
  function openLogin(){
    if(isBusy()){alert(tr('busy'));return}
    workspace.remember({mode:'login'});location.reload();
  }
  async function signOut(){
    if(isBusy()){alert(tr('busy'));return}if(transitioning)return;
    transitioning=true;refreshPanel();
    try{
      const result=await (await ensureAuth()).logout();
      if(!result.ok){workspace.lock();locked=false;transitioning=false;lock();setError(result.error);return}
      if(result.remotePending)try{sessionStorage.setItem('sumi-auth-notice-v1','localSignout')}catch{}
      workspace.lock();workspace.remember({mode:'login'});location.reload();
    }catch{transitioning=false;alert(tr('failed'));refreshPanel()}
  }
  function panelMarkup(){
    const value=workspace.current();if(!value)return '';
    const account=value.mode==='account',email=account?auth?.getState().user?.email||'':'';
    return `<section id="accountPanel" class="account-panel" aria-label="${escape(tr('workspace'))}"><div class="settings-row"><div><strong>${escape(tr(account?'accountMode':'guestMode'))}</strong>${email?`<p class="small account-email">${escape(email)}</p>`:''}</div><button id="${account?'accountSignOut':'accountSignIn'}" class="secondary" type="button" ${transitioning?'disabled':''}>${escape(tr(account?transitioning?'loggingOut':'logout':'signIn'))}</button></div><p class="note">${escape(tr(account?'accountNote':'guestNote'))}</p>${account&&auth?.getState().verification==='cached'?`<p class="note" role="status">${escape(tr('cachedSession'))}</p>`:''}${account?`<button id="accountGuest" class="linkbtn" type="button">${escape(tr('guest'))}</button>`:''}</section>`;
  }
  function bindPanel(){
    document.getElementById('accountSignIn')?.addEventListener('click',openLogin);
    document.getElementById('accountSignOut')?.addEventListener('click',signOut);
    document.getElementById('accountGuest')?.addEventListener('click',()=>{if(isBusy()){alert(tr('busy'));return}enterGuest()});
  }
  function refreshPanel(){const panel=document.getElementById('accountPanel');if(panel){panel.outerHTML=panelMarkup();bindPanel()}}
  function start(){
    SumiI18n.setLanguage(loginPrefs.language);
    SumiPWA.start({isBusy:()=>busy||Boolean(root.querySelector('#auth-password')?.value),onChange:()=>{}});
    if(workspace.choice().mode==='guest'){startApp(workspace.guest());return}
    renderGate();
    let localSignout=false;
    try{const notice=sessionStorage.getItem('sumi-auth-notice-v1');if(notice==='localSignout'){localSignout=true;setStatus(notice);sessionStorage.removeItem('sumi-auth-notice-v1')}}catch{}
    if(!SumiAuth.configuration(SumiAuthConfig))return;
    if(localSignout)return;
    setStatus('restoring');
    ensureAuth().then(manager=>manager.restore()).then(state=>{
      if(!restoreIntent||loaded||loadingApp)return;
      if(state.user)acceptUser(state.user);else{setStatus('');if(state.error)setError(state.error)}
    }).catch(()=>{if(!loaded){setStatus('');setError('failed')}});
  }
  window.addEventListener('storage',event=>{
    if(auth&&event.key===auth.storageKey&&workspace.current()?.mode==='account'){
      if(event.newValue===null)lock();else auth.restore();
    }
  });
  window.addEventListener('online',()=>{if(auth&&workspace.current()?.mode==='account'&&!transitioning)auth.restore()});
  queueMicrotask(start);
  return Object.freeze({panelMarkup,bindPanel,refreshPanel,setBusyCheck:callback=>{isBusy=callback},isLocked:()=>locked,hasDraft:()=>busy||Boolean(!root.hidden&&root.querySelector('#auth-password')?.value)});
})();
