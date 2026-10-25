/* Official Supabase Auth owns tokens, refresh locks and cross-tab session events.
 * The UI receives identity/status only, never access or refresh tokens. */
const SumiAuth = (() => {
  function configuration(value){
    try{const url=new URL(value?.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value?.publishableKey))return null;return {url:url.origin,publishableKey:value.publishableKey}}catch{return null}
  }
  const keyFor=url=>'sumi-auth-v1:'+encodeURIComponent(new URL(url).origin);
  function errorCode(error){
    if(error?.code==='over_email_send_rate_limit')return 'over_request_rate_limit';
    if(['invalid_credentials','email_not_confirmed','over_request_rate_limit'].includes(error?.code))return error.code;
    if(error?.name==='AuthRetryableFetchError'||error?.name==='AbortError'||error?.name==='TypeError'||error?.status===0)return 'network';
    if(error?.message==='auth-storage-unavailable')return 'storage';
    return 'failed';
  }
  function create({config,createClient,storage,fetch:fetcher=globalThis.fetch,online=()=>globalThis.navigator?.onLine!==false,onChange=()=>{}}){
    const checked=configuration(config);let client=null,subscription=null,closed=false,requestId=0,sessionEpoch=0,state={status:checked?'idle':'unconfigured',user:null,error:null};
    const storageKey=checked?keyFor(checked.url):null;
    const authKeys=storageKey?[storageKey,storageKey+'-code-verifier',storageKey+'-user']:[];
    const emit=next=>{state={...state,...next};onChange({...state})};
    const identity=session=>session&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(session.user?.id||'')?{id:session.user.id.toLowerCase(),email:typeof session.user.email==='string'?session.user.email:''}:null;
    const authStorage={
      getItem:key=>{try{return storage.getItem(key)}catch{throw Error('auth-storage-unavailable')}},
      setItem:(key,value)=>{if(closed)throw Error('auth-storage-unavailable');try{storage.setItem(key,value)}catch{throw Error('auth-storage-unavailable')}},
      removeItem:key=>{try{storage.removeItem(key)}catch{throw Error('auth-storage-unavailable')}}
    };
    async function limitedFetch(input,options={}){
      const controller=new AbortController(),abort=()=>controller.abort();
      if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
      const timeout=setTimeout(abort,12000);
      try{return await fetcher(input,{...options,signal:controller.signal,cache:'no-store'})}
      finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort)}
    }
    function ensureClient(){
      if(!checked)throw Error('auth-unconfigured');
      if(client)return client;
      client=createClient(checked.url,checked.publishableKey,{auth:{storage:authStorage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:limitedFetch}});
      subscription=client.auth.onAuthStateChange((event,session)=>{
        if(closed)return;
        sessionEpoch++;
        const user=identity(session);
        // Do not call another SDK method inside its auth-state lock.
        emit({status:user?'authenticated':'signed-out',user,error:null,event,verification:user?(event==='TOKEN_REFRESHED'?'verified':'cached'):null});
      }).data.subscription;
      return client;
    }
    async function restore(){
      if(!checked)return {...state};
      const request=++requestId;
      emit({status:'restoring',error:null});
      try{
        const sdk=ensureClient(),before=sessionEpoch,result=await sdk.auth.getSession();if(closed||request!==requestId)return {...state};if(result.error)throw result.error;
        const user=identity(result.data.session);let verification=user?'cached':null;
        if(before!==sessionEpoch&&state.user?.id!==user?.id)return {...state};
        const epoch=sessionEpoch;
        if(user&&online()){
          const verified=await sdk.auth.getUser();if(closed||request!==requestId||epoch!==sessionEpoch)return {...state};
          if(verified.error){if(errorCode(verified.error)!=='network')throw verified.error}
          else{if(identity({user:verified.data.user})?.id!==user.id)throw Error('invalid-session');verification='verified'}
        }
        emit({status:user?'authenticated':'signed-out',user,error:null,verification});
      }
      catch(error){if(!closed&&request===requestId)emit({status:'signed-out',user:null,error:errorCode(error),verification:null})}
      return {...state};
    }
    async function login(email,password){
      if(!checked)return {ok:false,error:'unconfigured'};
      if(closed)return {ok:false,error:'failed'};
      const request=++requestId;
      try{const result=await ensureClient().auth.signInWithPassword({email:email.trim(),password});if(result.error)throw result.error;const user=identity(result.data.session);if(!user||closed||request!==requestId)throw Error('invalid-session');emit({status:'authenticated',user,error:null,verification:'verified'});return {ok:true,user}}
      catch(error){return {ok:false,error:errorCode(error)}}
    }
    async function logout(){
      requestId++;
      // Local sign-out keeps other devices logged in. If offline, remove this
      // device's cached SDK session and report that remote revocation failed.
      let remoteError=null;
      try{const result=await ensureClient().auth.signOut({scope:'local'});remoteError=result.error}catch(error){remoteError=error}
      closed=true;subscription?.unsubscribe();client?.auth.stopAutoRefresh();
      try{for(const key of authKeys)storage.removeItem(key)}catch{return {ok:false,error:'storage'}}
      emit({status:'signed-out',user:null,error:null});return {ok:true,remotePending:Boolean(remoteError)};
    }
    function pause(){client?.auth.stopAutoRefresh()}
    return Object.freeze({restore,login,logout,pause,getState:()=>({...state}),configured:Boolean(checked),storageKey});
  }
  return Object.freeze({configuration,keyFor,errorCode,create});
})();
if(typeof module!=='undefined')module.exports=SumiAuth;
