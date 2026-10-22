/* Installation and opt-in updates. App data never passes through this module. */
(function(root) {
  'use strict';
  let registration = null, installPrompt = null, started = false, reloadRequested = false;
  const watchedWorkers = new WeakSet();
  let hooks = {isBusy: () => false, onChange: () => {}};
  const state = {supported: false, offline: false, ready: false, waiting: false,
    updating: false, reloadPending: false, error: '', installed: false,
    installAvailable: false, installing: false, checking: false};
  const text = key => (typeof SumiI18n !== 'undefined' ? SumiI18n.t('pwa.' + key) : '') || ({title:'Offline app',statusPreparing:'Preparing offline access'}[key] || 'Offline app');
  const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const notify = () => hooks.onChange({...state});
  const busy = () => { try { return Boolean(hooks.isBusy()); } catch { return true; } };
  const standalone = () => Boolean(root.navigator?.standalone || root.matchMedia?.('(display-mode: standalone)').matches);

  function settingsMarkup() {
    const status = !state.supported ? 'unsupported' : state.error ? state.error
      : state.reloadPending ? 'reloadPending' : state.waiting ? 'updateReady'
      : state.offline ? state.ready ? 'offlineReady' : 'offlineUnavailable'
      : state.ready ? 'statusReady' : 'statusPreparing';
    return `<section id="pwaPanel" class="pwa-panel" aria-label="${escape(text('title'))}"><div class="settings-row"><span>${escape(text('title'))}</span><span class="small">${escape(text(state.installed ? 'installed' : 'browser'))}</span></div><p id="pwaStatus" class="fx-status" role="status">${escape(text(status))}</p><div class="tools">${state.installAvailable && !state.installed ? `<button class="secondary" id="pwaInstall" ${state.installing?'disabled':''}>${escape(text('install'))}</button>` : ''}${state.waiting || state.reloadPending ? `<button class="primary" id="pwaUpdate" ${state.updating?'disabled':''}>${escape(text(state.updating?'updating':state.reloadPending?'reload':'applyUpdate'))}</button>` : ''}${state.supported ? `<button class="secondary" id="pwaCheckUpdate" ${state.checking || state.offline?'disabled':''}>${escape(text(state.checking?'checking':'checkUpdate'))}</button>` : ''}</div>${!state.installed && !state.installAvailable ? `<p class="note">${escape(text('installHelp'))}</p>` : ''}<p class="note">${escape(text('offlineHelp'))}</p></section>`;
  }
  function bind() {
    root.document?.getElementById('pwaInstall')?.addEventListener('click', install);
    root.document?.getElementById('pwaUpdate')?.addEventListener('click', applyUpdate);
    root.document?.getElementById('pwaCheckUpdate')?.addEventListener('click', checkForUpdate);
  }
  function message(worker, type) {
    return new Promise((resolve, reject) => {
      if (!worker) return reject(new Error('worker-unavailable'));
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('worker-timeout')); }, 10000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      try { worker.postMessage({type}, [channel.port2]); }
      catch(error) { clearTimeout(timer); channel.port1.close(); reject(error); }
    });
  }
  async function refreshReady() {
    try { const result = await message(registration?.active, 'SUMI_STATUS'); state.ready = Boolean(result.ok && result.ready); }
    catch { state.ready = false; }
    state.waiting = Boolean(registration?.waiting);
    notify();
  }
  function finishRequestedUpdate() {
    if (!reloadRequested) return false;
    reloadRequested = false; state.waiting = false; state.updating = false;
    if (!busy()) { root.location.reload(); return true; }
    state.reloadPending = true; state.error = 'busy'; notify();
    return true;
  }
  function observeWorker(worker) {
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    const replacesActive = Boolean(registration?.active && registration.active !== worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') { state.waiting = Boolean(registration?.waiting); notify(); }
      if (worker.state === 'activated') {
        const requested = finishRequestedUpdate();
        // An initial, uncontrolled document does not hold the old worker open.
        // Browsers may activate its replacement naturally; offer a reload but
        // never discard that page's draft automatically.
        if (!requested && replacesActive && !root.navigator.serviceWorker.controller) {
          state.reloadPending = true; state.waiting = false;
        }
        refreshReady();
      }
      if (worker.state === 'redundant') { reloadRequested = false; state.error = 'updateFailed'; state.updating = false; notify(); }
    });
  }
  async function registerWorker() {
    registration = await root.navigator.serviceWorker.register(new URL('sw.js', root.document.baseURI).href,
      {scope: new URL('./', root.document.baseURI).href, updateViaCache: 'none'});
    registration.addEventListener('updatefound', () => { state.error = ''; observeWorker(registration.installing); });
    observeWorker(registration.installing);
    state.waiting = Boolean(registration.waiting);
    if (registration.active) refreshReady();
    root.navigator.serviceWorker.ready.then(() => refreshReady()).catch(() => {});
    notify();
    return registration;
  }
  async function checkForUpdate() {
    if (state.checking || state.offline || !state.supported) return false;
    state.checking = true; state.error = ''; notify();
    try {
      if (!registration) await registerWorker();
      else await registration.update();
      state.waiting = Boolean(registration.waiting); return true;
    }
    catch { state.error = 'updateFailed'; return false; }
    finally { state.checking = false; notify(); }
  }
  async function install() {
    if (!installPrompt || state.installing) return false;
    const prompt = installPrompt;
    installPrompt = null; state.installing = true; state.error = ''; notify();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      return choice.outcome === 'accepted';
    } catch { state.error = 'installFailed'; return false; }
    finally { state.installing = false; state.installAvailable = false; notify(); }
  }
  async function applyUpdate() {
    if (state.updating) return false;
    if (busy()) { state.error = 'busy'; notify(); return false; }
    if (state.reloadPending) { root.location.reload(); return true; }
    if (!registration?.waiting) { state.waiting = false; notify(); return false; }
    state.error = ''; state.updating = true; reloadRequested = true; notify();
    // A page opened before the first worker took control may not receive a
    // controllerchange event. Observe the explicit target's activation too.
    observeWorker(registration.waiting);
    try {
      const result = await message(registration.waiting, 'SUMI_APPLY_UPDATE');
      if (!result.ok) { reloadRequested = false; state.error = result.reason === 'tabs' ? 'tabs' : 'updateFailed'; state.updating = false; notify(); return false; }
      return true;
    } catch { reloadRequested = false; state.error = 'updateFailed'; state.updating = false; notify(); return false; }
  }
  async function start(options = {}) {
    hooks = {isBusy: options.isBusy || hooks.isBusy, onChange: options.onChange || hooks.onChange};
    if (started) return registration;
    started = true;
    state.offline = root.navigator?.onLine === false;
    state.installed = standalone();
    state.supported = Boolean(root.isSecureContext && root.navigator?.serviceWorker);
    root.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); installPrompt = event; state.installAvailable = true; notify();
    });
    root.addEventListener('appinstalled', () => { state.installed = true; state.installAvailable = false; installPrompt = null; notify(); });
    root.addEventListener('offline', () => { state.offline = true; notify(); });
    root.addEventListener('online', () => { state.offline = false; notify(); checkForUpdate(); });
    notify();
    if (!state.supported) return null;
    root.navigator.serviceWorker.addEventListener('controllerchange', () => {
      state.waiting = false; state.updating = false;
      if (finishRequestedUpdate() && !state.reloadPending) return;
      refreshReady();
    });
    try {
      return await registerWorker();
    } catch { state.error = 'registerFailed'; notify(); return null; }
  }
  root.SumiPWA = Object.freeze({start, settingsMarkup, bind, getState: () => ({...state}), checkForUpdate, applyUpdate, install});
})(globalThis);
