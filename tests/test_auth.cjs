const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const Auth=require('../auth.js'),Workspace=require('../workspace.js');
const config={url:'https://personal.supabase.co',publishableKey:'sb_publishable_test_public_only'};
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function memory(initial={}){const data=new Map(Object.entries(initial));return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}}
function fake(options={}){
  const store=options.storage||memory(),calls=[];let callback,clientOptions,paused=0;
  const session={user:{id:A,email:'owner@example.test'},access_token:'private-access',refresh_token:'private-refresh'};
  const manager=Auth.create({config,storage:store,onChange:state=>calls.push(['state',state]),fetch:async(input,settings)=>{calls.push(['fetch',input,settings]);if(settings.signal.aborted)throw new DOMException('cancelled','AbortError');return new Response('{}')},createClient:(url,key,settings)=>{
    clientOptions=settings;calls.push(['client',url,key]);return {auth:{
      onAuthStateChange:cb=>{callback=cb;return {data:{subscription:{unsubscribe(){calls.push(['unsubscribe'])}}}}},
      getSession:async()=>options.restoreError?{error:options.restoreError}:{data:{session:options.session===null?null:session}},
      getUser:async()=>{calls.push(['getUser']);return options.userPromise?options.userPromise:options.userError?{error:options.userError}:{data:{user:{...session.user,id:options.serverUser||A}}}},
      signInWithPassword:async credentials=>{calls.push(['login',credentials]);if(options.loginError)return {error:options.loginError};return {data:{session}}},
      signOut:async params=>{calls.push(['signOut',params]);return {error:options.logoutError||null}},
      stopAutoRefresh:()=>{paused++}
    }};
  }});
  return {manager,store,calls,options:()=>clientOptions,event:(event,value)=>callback(event,value),paused:()=>paused,session};
}
test('only HTTPS project URL and a public publishable key can configure auth',()=>{
  assert.equal(Auth.configuration(config).url,config.url);
  for(const value of [{...config,url:'http://personal.supabase.co'},{...config,url:'https://user:password@personal.supabase.co'}, {...config,url:config.url+'/unsafe'}, {...config,url:config.url+'?token=x'}, {...config,publishableKey:'sb_secret_do_not_use'}, {...config,publishableKey:'eyJhbGciOiJIUzI1NiJ9.service_role.signature'},null])assert.equal(Auth.configuration(value),null);
});
test('official SDK owns persistence, refresh, password login and local-device signout',async()=>{
  const f=fake();await f.manager.restore();
  const settings=f.options();assert.equal(settings.auth.persistSession,true);assert.equal(settings.auth.autoRefreshToken,true);assert.equal(settings.auth.detectSessionInUrl,false);
  assert.equal(settings.auth.storageKey,Auth.keyFor(config.url));
  assert.equal((await f.manager.login(' owner@example.test ','password-in-memory-only')).ok,true);
  assert.deepEqual(f.calls.find(call=>call[0]==='login')[1],{email:'owner@example.test',password:'password-in-memory-only'});
  assert.equal(f.store.data.size,0);assert.doesNotMatch(JSON.stringify(f.manager.getState()),/private-access|private-refresh|password-in-memory/);
  assert.equal((await f.manager.logout()).ok,true);assert.deepEqual(f.calls.find(call=>call[0]==='signOut')[1],{scope:'local'});
  assert.equal(f.paused(),1);
});
test('session recovery exposes only identity, never token payloads',async()=>{
  const f=fake();assert.deepEqual((await f.manager.restore()).user,{id:A,email:'owner@example.test'});
  f.event('TOKEN_REFRESHED',{...f.session,access_token:'changed'});assert.equal(f.manager.getState().user.id,A);
  f.event('SIGNED_IN',{user:{id:B,email:'second@example.test'}});assert.equal(f.manager.getState().user.id,B);
  f.event('SIGNED_OUT',null);assert.equal(f.manager.getState().user,null);
});
test('online restore verifies the SDK identity and rejects an invalid or mismatched user',async()=>{
  for(const options of [{serverUser:B},{userError:{status:401,code:'bad_jwt'}}]){
    const f=fake(options);const state=await f.manager.restore();assert.equal(state.status,'signed-out');assert.equal(state.user,null);assert.ok(f.calls.some(call=>call[0]==='getUser'));
  }
  const f=fake();assert.equal((await f.manager.restore()).verification,'verified');
});
test('network failure retains only a marked cached local identity',async()=>{
  const f=fake({userError:{name:'AuthRetryableFetchError'}}),state=await f.manager.restore();
  assert.equal(state.user.id,A);assert.equal(state.verification,'cached');
});
test('late server verification cannot restore an account after a newer signout',async()=>{
  let resolve;const userPromise=new Promise(done=>{resolve=done}),f=fake({userPromise});const restoring=f.manager.restore();
  await new Promise(setImmediate);f.event('SIGNED_OUT',null);resolve({data:{user:f.session.user}});
  assert.equal((await restoring).user,null);assert.equal(f.manager.getState().status,'signed-out');
});
test('late server verification cannot replace a different current SDK identity',async()=>{
  let resolve;const userPromise=new Promise(done=>{resolve=done}),f=fake({userPromise});const restoring=f.manager.restore();
  await new Promise(setImmediate);f.event('SIGNED_IN',{user:{id:B,email:'second@example.test'}});resolve({data:{user:f.session.user}});
  assert.equal((await restoring).user.id,B);assert.equal(f.manager.getState().user.id,B);
});
test('login error codes are localized by code, without leaking server text',async()=>{
  for(const [error,expected] of [[{code:'invalid_credentials',message:'private server detail'},'invalid_credentials'],[{name:'AuthRetryableFetchError'},'network'],[{message:'auth-storage-unavailable'},'storage'],[{message:'unknown secret detail'},'failed']]){
    const f=fake({loginError:error});assert.deepEqual(await f.manager.login('a@b.test','test-password'),{ok:false,error:expected});
  }
});
test('offline signout clears only SDK keys and blocks late refresh writes',async()=>{
  const key=Auth.keyFor(config.url),storage=memory({[key]:'session',[key+'-user']:'user',[key+'-code-verifier']:'verifier','sumi-data-v1':'guest-records','sumi-fx-cache-v1':'fx','another-auth':'other'});
  const f=fake({storage,logoutError:{name:'AuthRetryableFetchError'}});await f.manager.restore();
  assert.deepEqual(await f.manager.logout(),{ok:true,remotePending:true});
  assert.deepEqual([...storage.data.entries()],[['sumi-data-v1','guest-records'],['sumi-fx-cache-v1','fx'],['another-auth','other']]);
  assert.throws(()=>f.options().auth.storage.setItem(key,'late token'),/auth-storage/);
});
test('session storage failures do not claim a successful logout',async()=>{
  const f=fake({storage:{getItem:()=>null,setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}}});await f.manager.restore();
  assert.throws(()=>f.options().auth.storage.setItem('any','token'),/auth-storage/);
  assert.deepEqual(await f.manager.logout(),{ok:false,error:'storage'});
});
test('auth HTTP requests are never cacheable and retain cancellation',async()=>{
  const f=fake();await f.manager.restore();const controller=new AbortController();controller.abort();
  // The SDK receives a bounded fetch, rather than a hand-written token refresher.
  assert.equal(typeof f.options().global.fetch,'function');
  await f.options().global.fetch(config.url+'/auth/v1/user');assert.equal(f.calls.find(call=>call[0]==='fetch')[2].cache,'no-store');
  await assert.rejects(f.options().global.fetch(config.url+'/auth/v1/user',{signal:controller.signal}),{name:'AbortError'});
});
test('guest workspace retains every original storage key and IndexedDB name',()=>{
  const local=memory({'sumi-data-v1':'original bytes','sumi-prefs-v1':'prefs','sumi-fx-cache-v1':'fx'}),tab=memory();
  const w=Workspace.create({local,tab,config});w.activate(Workspace.guest());const store=w.storage();
  assert.equal(w.current().dbName,'sumi-logo-assets-v1');assert.equal(store.getItem('sumi-data-v1'),'original bytes');
  w.remember(Workspace.guest());assert.equal(local.getItem('sumi-data-v1'),'original bytes');
  store.setItem('sumi-fx-cache-v1','new fx');assert.equal(local.getItem('sumi-fx-cache-v1'),'new fx');
});
test('accounts and projects isolate data, preferences, recovery journals, FX and images',()=>{
  const local=memory({'sumi-data-v1':'guest'});
  const identities=[Workspace.identity(config.url,A),Workspace.identity(config.url,B),Workspace.identity('https://other.supabase.co',A)];
  assert.equal(new Set(identities.map(value=>value.dbName)).size,3);
  identities.forEach((value,index)=>{const w=Workspace.create({local,tab:memory(),config});w.activate(value);for(const name of ['sumi-data-v1','sumi-prefs-v1','sumi-write-journal-v1','sumi-fx-cache-v1'])w.storage().setItem(name,String(index))});
  identities.forEach((value,index)=>{const w=Workspace.create({local,tab:memory(),config});w.activate(value);assert.equal(w.storage().getItem('sumi-data-v1'),String(index))});
  assert.equal(local.getItem('sumi-data-v1'),'guest');
});
test('an open workspace cannot silently retarget writes to another identity',()=>{
  const local=memory(),w=Workspace.create({local,tab:memory(),config});w.activate(Workspace.identity(config.url,A));const store=w.storage();
  assert.throws(()=>w.activate(Workspace.identity(config.url,B)),/reload-required/);
  w.lock();assert.throws(()=>store.setItem('sumi-data-v1','wrong'),/workspace-locked/);
  assert.equal(w.unlock(B),false);assert.equal(w.unlock(A),true);store.setItem('sumi-data-v1','right');
  assert.equal(local.getItem(Workspace.identity(config.url,A).prefix+'sumi-data-v1'),'right');assert.equal(local.getItem('sumi-data-v1'),null);
  assert.throws(()=>store.getItem('sumi-auth-v1:arbitrary'),/invalid-storage-key/);
});
test('tab choice is stable when another tab changes the remembered default',()=>{
  const local=memory(),first=Workspace.create({local,tab:memory(),config}),second=Workspace.create({local,tab:memory(),config});
  first.remember(Workspace.guest());second.remember(Workspace.identity(config.url,A));
  assert.equal(first.choice().mode,'guest');assert.equal(second.choice().userId,A);
  assert.equal(Workspace.create({local,tab:memory(),config}).choice().userId,A);
});
test('invalid or foreign persisted identities cannot select arbitrary storage',()=>{
  for(const saved of [{version:1,mode:'account',project:config.url,userId:'../../sumi-data-v1'},{version:1,mode:'account',project:'https://other.supabase.co',userId:A},{version:99,mode:'guest'},'{bad']){
    const w=Workspace.create({local:memory({[Workspace.CHOICE]:typeof saved==='string'?saved:JSON.stringify(saved)}),tab:memory(),config});assert.equal(w.choice().mode,'login');assert.equal(w.preferenceKey(),'sumi-prefs-v1');
  }
  assert.throws(()=>Workspace.identity('http://insecure.example',A),/invalid-identity/);
});
test('blocked storage still permits an in-memory guest workspace without deleting anything',()=>{
  const denied={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  const w=Workspace.create({local:denied,tab:denied,config});assert.equal(w.choice().mode,'login');assert.equal(w.remember(Workspace.guest()),false);assert.equal(w.activate(Workspace.guest()).mode,'guest');
});
test('vendored official SDK has a pinned source hash and its license',()=>{
  const manifest=JSON.parse(fs.readFileSync(require.resolve('../assets/vendor/supabase.json')));
  assert.equal(manifest.package,'@supabase/supabase-js');assert.equal(manifest.version,'2.118.0');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../supabase-sdk.js'))).digest('hex'),manifest.sha256);
  assert.match(fs.readFileSync(require.resolve('../assets/vendor/LICENSE-supabase.txt'),'utf8'),/MIT/);
});
test('every auth message and supported error is available in all four languages',()=>{
  const messages=require('../locales/auth.js'),i18n=require('../i18n.js');
  for(const [key,values] of Object.entries(messages).filter(([key])=>key.startsWith('auth.'))){
    for(const language of i18n.languages){assert.equal(typeof values[language],'string',key+' '+language);assert.ok(values[language].trim());assert.notEqual(i18n.create({messages,language}).t(key),key)}
  }
  for(const error of [{code:'invalid_credentials'},{code:'email_not_confirmed'},{code:'over_request_rate_limit'},{code:'over_email_send_rate_limit'},{name:'AuthRetryableFetchError'},{message:'auth-storage-unavailable'},{}])assert.ok(messages['auth.'+Auth.errorCode(error)]);
});
test('cloud client access requires a freshly verified matching account',async()=>{
  const f=fake();const client=await f.manager.syncClient(A);assert.equal(typeof client.auth.getUser,'function');
  assert.ok(f.calls.some(call=>call[0]==='getUser'));await assert.rejects(f.manager.syncClient(B),/sync-auth/);
});
test('a cached offline identity cannot start a cloud transfer',async()=>{
  const f=fake({userError:{name:'AuthRetryableFetchError'}});await assert.rejects(f.manager.syncClient(A),/sync-network/);
  assert.equal(f.manager.getState().verification,'cached');assert.equal(f.manager.getState().user.id,A);
});
test('cloud client access stops after current-device logout',async()=>{
  const f=fake();await f.manager.restore();await f.manager.logout();await assert.rejects(f.manager.syncClient(A),/sync-auth/);
});
