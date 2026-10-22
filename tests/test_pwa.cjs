const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const workerSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(ROOT, 'pwa.js'), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));

function worker(options = {}) {
  const handlers = {}, store = new Map(), fetches = [];
  const scope = 'https://example.com/sumi/';
  const sources = {'index.html':'<main>sumi</main>', 'app.js':'globalThis.version = 6;'};
  const assets = Object.entries(sources).map(([url, source]) => ({url, revision:hash(source)}));
  const windows = options.windows || [{id:'current',url:scope}];
  let skipped = 0, claimed = 0;
  const self = {registration:{scope}, SUMI_ASSET_VERSION:'new-release', SUMI_ASSETS:assets,
    clients:{matchAll:async () => windows, claim:() => {claimed++;}},
    skipWaiting:async () => {skipped++;}, addEventListener:(name, callback) => {handlers[name] = callback;}};
  const caches = {
    keys:async () => [...store.keys()], delete:async key => store.delete(key),
    open:async key => {
      if(!store.has(key))store.set(key,new Map());
      const cache = store.get(key);
      return {put:async (url,response) => cache.set(url,response),match:async url => cache.get(typeof url==='string'?url:url.url)?.clone()};
    }
  };
  const context = vm.createContext({self,caches,URL,Request,Response,crypto:crypto.webcrypto,
    Uint8Array,Map,Promise,AbortController,setTimeout:options.fastTimeout?callback=>setTimeout(callback,0):setTimeout,clearTimeout,importScripts:() => {}, fetch:async request => {
      fetches.push(request.url);
      const name = request.url.slice(scope.length);
      if(options.hang === name)return new Promise((resolve,reject)=>{request.signal.addEventListener('abort',()=>reject(new Error('timeout')));});
      if(options.fail === name) return new Response('',{status:404});
      return new Response(options.mismatch === name ? 'partial-deployment' : sources[name] || 'network');
    }});
  vm.runInContext(workerSource, context);
  async function dispatch(name, fields = {}) {
    const waits = []; let response;
    const event = {waitUntil: promise => waits.push(promise), respondWith: promise => {response = promise;},...fields};
    handlers[name](event); await Promise.all(waits);
    return response && await response;
  }
  async function message(type, source={url:scope}) {
    let reply;
    await dispatch('message',{data:{type},source,ports:[{postMessage:value => {reply = value;}}]});
    return reply;
  }
  return {self,store,caches,scope,fetches,dispatch,message,skipped:() => skipped,claimed:() => claimed};
}

test('generated shell manifest contains all runtime assets and accurate content hashes', () => {
  const context = vm.createContext({self:{}});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'sw-assets.js'),'utf8'),context);
  const assets = context.self.SUMI_ASSETS;
  const urls = new Set(assets.map(asset => asset.url));
  for(const name of ['index.html','styles.css','manifest.webmanifest','pwa.js','theme.js','i18n.js','logo-store.js','motion.js','locales/app.js','locales/pwa.js','locales/stage6.js']) assert.ok(urls.has(name),name);
  for(const asset of assets) assert.equal(hash(fs.readFileSync(path.join(ROOT,asset.url))),asset.revision,asset.url+' needs scripts/update-pwa-cache.py');
  const canonical = JSON.stringify(assets.map(({url,revision}) => ({revision,url})));
  assert.equal(hash(Buffer.concat([Buffer.from(workerSource),Buffer.from(canonical)])).slice(0,24),context.self.SUMI_ASSET_VERSION);
  assert.equal(urls.size,assets.length);
  const brands = fs.readdirSync(path.join(ROOT,'assets/brands')).filter(name => name.endsWith('.svg'));
  for(const brand of brands)assert.ok(urls.has('assets/brands/'+brand));
  assert.ok(![...urls].some(url => url.includes('http') || url.includes('test') || url === 'sw.js'));
});

test('manifest supports scoped installation and actual purpose-specific square PNG icons', () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(icon => icon.purpose==='maskable'));
  for(const icon of manifest.icons) {
    const png=fs.readFileSync(path.join(ROOT,icon.src));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(icon.sizes,`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    assert.equal(png.readUInt32BE(16),png.readUInt32BE(20));
  }
});

test('complete release installation verifies and caches all resources without forced activation', async () => {
  const sw=worker();await sw.dispatch('install');
  assert.equal(sw.fetches.length,2);assert.equal(sw.skipped(),0);assert.equal(sw.claimed(),0);
  assert.equal((await sw.message('SUMI_STATUS')).ready,true);
});

for(const [reason,options] of [['HTTP failure',{fail:'app.js'}],['digest mismatch',{mismatch:'app.js'}]]) {
  test(`failed installation (${reason}) removes only partial new cache`,async () => {
    const sw=worker(options);
    sw.store.set('sumi-shell:/sumi/:old-release',new Map([['old','still here']]));
    sw.store.set('unrelated-app',new Map([['value','untouched']]));
    await assert.rejects(sw.dispatch('install'));
    assert.deepEqual([...sw.store.keys()],['sumi-shell:/sumi/:old-release','unrelated-app']);
    assert.equal(sw.skipped(),0);
  });
}

test('offline navigations and static query URLs use a single coherent release cache',async () => {
  const sw=worker();await sw.dispatch('install');const count=sw.fetches.length;
  const html=await sw.dispatch('fetch',{request:{url:sw.scope+'?from=home',method:'GET',mode:'navigate'}});
  assert.equal(await html.text(),'<main>sumi</main>');
  const script=await sw.dispatch('fetch',{request:{url:sw.scope+'app.js?ignored=true',method:'GET',mode:'cors'}});
  assert.equal(await script.text(),'globalThis.version = 6;');assert.equal(sw.fetches.length,count);
});

test('FX, external resources, uploads and unknown same-origin paths are not intercepted',async () => {
  const sw=worker();
  for(const request of [
    {url:'https://api.frankfurter.dev/v1/latest',method:'GET',mode:'cors'},
    {url:'https://example.com/other/app.js',method:'GET',mode:'cors'},
    {url:sw.scope+'backup.json',method:'GET',mode:'cors'},
    {url:sw.scope+'app.js',method:'POST',mode:'cors'}
  ])assert.equal(await sw.dispatch('fetch',{request}),undefined);
  assert.equal(sw.fetches.length,0);
});

test('explicit update refuses another open same-scope tab but ignores unrelated sites',async () => {
  const busy=worker({windows:[{url:'https://example.com/sumi/'},{url:'https://example.com/sumi/index.html'}]});
  assert.equal((await busy.message('SUMI_APPLY_UPDATE')).reason,'tabs');assert.equal(busy.skipped(),0);
  const alone=worker({windows:[{url:'https://example.com/sumi/'},{url:'https://example.com/other/'}]});
  assert.equal((await alone.message('SUMI_APPLY_UPDATE')).ok,true);assert.equal(alone.skipped(),1);
  assert.equal((await alone.message('SUMI_APPLY_UPDATE',{url:'https://outside.example/'})).ok,false);
});

test('activation never claims clients and retains old shell caches while a window is open',async () => {
  const sw=worker();sw.store.set('sumi-shell:/sumi/:old',new Map());
  await sw.dispatch('activate');assert.ok(sw.store.has('sumi-shell:/sumi/:old'));assert.equal(sw.claimed(),0);
});

test('activation with all app windows closed cleans only obsolete same-scope shell caches',async () => {
  const sw=worker({windows:[]});await sw.dispatch('install');
  for(const name of ['sumi-shell:/sumi/:old','sumi-shell:/another/:old','third-party'])sw.store.set(name,new Map());
  await sw.dispatch('activate');assert.ok(!sw.store.has('sumi-shell:/sumi/:old'));
  assert.ok(sw.store.has('sumi-shell:/another/:old'));assert.ok(sw.store.has('third-party'));assert.equal(sw.claimed(),0);
});

function client(options={}) {
  const events={}, swEvents={};let reloads=0, registrations=0, updates=0, changes=0, prompts=0;
  let isBusy=Boolean(options.busy), failRegister=Boolean(options.failRegister);
  const workerEvents={};
  const worker={state:'installed',addEventListener(name,callback){workerEvents[name]=callback;},postMessage(data,ports){queueMicrotask(() => ports[0].postMessage(data.type==='SUMI_STATUS'?{ok:true,ready:true}:{ok:!options.tabs,reason:options.tabs?'tabs':undefined}));}};
  const registration={active:worker,waiting:options.waiting?worker:null,installing:null,addEventListener(){},update:async () => {updates++;}};
  const serviceWorker={controller:options.controlled?worker:null,addEventListener:(name,fn) => {swEvents[name]=fn;},
    register:async (url,config) => {registrations++;assert.equal(url,'https://example.com/sumi/sw.js');assert.equal(config.scope,'https://example.com/sumi/');assert.equal(config.updateViaCache,'none');if(failRegister)throw new Error('offline');return registration;},
    ready:Promise.resolve(registration)};
  const context=vm.createContext({URL,MessageChannel,Promise,setTimeout,clearTimeout,
    document:{baseURI:'https://example.com/sumi/index.html',getElementById:()=>null},
    isSecureContext:options.secure!==false,navigator:{serviceWorker,onLine:!options.offline},
    location:{reload:() => {reloads++;}},matchMedia:()=>({matches:false}),
    SumiI18n:{t:key=>key},addEventListener:(name,fn)=>{events[name]=fn;}});
  vm.runInContext(clientSource,context);
  const api=context.SumiPWA;
  return {api,registration,events,swEvents,activate:()=>{worker.state='activated';workerEvents.statechange?.();},start:() => api.start({isBusy:()=>isBusy,onChange:()=>{changes++;}}),
    setBusy:value=>{isBusy=value;},setRegisterFailure:value=>{failRegister=value;},
    reloads:()=>reloads,registrations:()=>registrations,updates:()=>updates,changes:()=>changes,
    prompt:()=>{events.beforeinstallprompt({preventDefault(){},prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});},prompts:()=>prompts};
}

test('PWA startup is idempotent, scoped and reads readiness without app storage writes',async()=>{
  const app=client();await app.start();await app.start();await tick();await tick();
  assert.equal(app.registrations(),1);assert.equal(app.api.getState().supported,true);
  assert.equal(app.api.getState().ready,true);assert.ok(app.api.settingsMarkup().includes('id="pwaPanel"'));
});

test('unsupported contexts do not register or expose inactive install controls',async()=>{
  const app=client({secure:false});await app.start();
  assert.equal(app.registrations(),0);assert.equal(app.api.getState().supported,false);
  assert.ok(!app.api.settingsMarkup().includes('id="pwaInstall"'));
});

test('a failed registration can be retried from check updates without reload',async()=>{
  const app=client({failRegister:true});await app.start();assert.equal(app.api.getState().error,'registerFailed');
  app.setRegisterFailure(false);assert.equal(await app.api.checkForUpdate(),true);
  assert.equal(app.registrations(),2);assert.equal(app.api.getState().error,'');
});

test('install control invokes the captured browser prompt exactly once',async()=>{
  const app=client();await app.start();app.prompt();assert.equal(app.api.getState().installAvailable,true);
  assert.equal(await app.api.install(),true);assert.equal(app.prompts(),1);
  assert.equal(await app.api.install(),false);assert.equal(app.api.getState().installAvailable,false);
});

test('busy forms and other tabs prevent update activation',async()=>{
  const app=client({waiting:true,busy:true});await app.start();
  assert.equal(await app.api.applyUpdate(),false);assert.equal(app.api.getState().error,'busy');assert.equal(app.reloads(),0);
  const tabs=client({waiting:true,tabs:true});await tabs.start();
  assert.equal(await tabs.api.applyUpdate(),false);assert.equal(tabs.api.getState().error,'tabs');assert.equal(tabs.reloads(),0);
});

test('only an explicitly requested update can reload and a newly opened form defers that reload',async()=>{
  const app=client({waiting:true});await app.start();app.swEvents.controllerchange();await tick();
  assert.equal(app.reloads(),0);
  assert.equal(await app.api.applyUpdate(),true);app.setBusy(true);app.swEvents.controllerchange();await tick();
  assert.equal(app.reloads(),0);assert.equal(app.api.getState().reloadPending,true);
  assert.equal(await app.api.applyUpdate(),false);app.setBusy(false);
  assert.equal(await app.api.applyUpdate(),true);assert.equal(app.reloads(),1);
});

test('offline controls avoid update requests and reconnect initiates one check',async()=>{
  const app=client({offline:true});await app.start();assert.equal(await app.api.checkForUpdate(),false);assert.equal(app.updates(),0);
  app.events.online();await tick();assert.equal(app.updates(),1);assert.equal(app.api.getState().offline,false);
});

test('PWA resource translations include all four languages with no empty values',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'locales/pwa.js'),'utf8'),context);
  for(const [key,values] of Object.entries(context.SumiMessages))for(const language of ['zh-CN','zh-TW','ja-JP','en'])assert.ok(values[language]?.trim(),key+'/'+language);
});


test('explicit update also completes on an uncontrolled page and never reloads twice',async()=>{
  const app=client({waiting:true,controlled:false});await app.start();
  assert.equal(await app.api.applyUpdate(),true);
  app.activate();assert.equal(app.reloads(),1);assert.equal(app.api.getState().updating,false);
  app.swEvents.controllerchange();assert.equal(app.reloads(),1);
});


test('a stalled static response times out and preserves the existing release',async()=>{
  const sw=worker({hang:'app.js',fastTimeout:true});
  sw.store.set('sumi-shell:/sumi/:old-release',new Map());
  await assert.rejects(sw.dispatch('install'),/timeout/);
  assert.deepEqual([...sw.store.keys()],['sumi-shell:/sumi/:old-release']);
});

test('actual lexical i18n module translates the PWA settings immediately in all four languages',()=>{
  const context=vm.createContext({});
  for(const file of ['locales/pwa.js','i18n.js','pwa.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),context);
  assert.equal(context.SumiI18n,undefined,'the app translator is a lexical binding, not a global property');
  const titles={'zh-CN':'安装与离线使用','zh-TW':'安裝與離線使用','ja-JP':'インストールとオフライン',en:'Install &amp; offline access'};
  for(const [language,title] of Object.entries(titles)) {
    vm.runInContext(`SumiI18n.setLanguage(${JSON.stringify(language)})`,context);
    const markup=context.SumiPWA.settingsMarkup();
    assert.ok(markup.includes(title),language);
    assert.ok(!markup.includes('Offline app'),language);
  }
});
