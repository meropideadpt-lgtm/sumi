/* Glue between the synchronous local transaction, the sync engine and the UI. */
const SumiSyncController = (() => {
  function create({storage,workspace,logoStore,readLocal,isBusy=()=>false,onApply=()=>{},onChange=()=>{},download=()=>{}}) {
    const identity=workspace.current(),guest=identity.mode==='guest';
    let manager=null,transport=null,client=null,localError=null,timer=null,stopped=false,task=null;
    const empty=guest?null:SumiSync.initialState();
    function read(){const saved=storage.snapshot(),local=readLocal?.()||saved;return {data:local.data,preferences:local.preferences,state:saved.metadata||empty}}
    function writable(){workspace.assertWritable();SumiSyncLock.assertCloudWriter();}
    function changed(){onChange(model())}
    function model(){
      if(guest)return {guest:true,enabled:false,status:'disabled',pending:0};
      let state;
      try{state=manager?manager.getState():{enabled:Boolean(read().state.enabled),status:'error',pending:0,hasBackup:Boolean(read().state.backup)}}
      catch{state={enabled:false,status:'error',pending:0};localError='sync-invalid-state'}
      if(!SumiSyncLock.isSupported())return {...state,status:'error',error:'sync-lock-unavailable',guest:false};
      if(!SumiSyncLock.isOwner())return {...state,status:'paused',error:'sync-other-tab',guest:false};
      return {...state,guest:false,...(localError?{error:localError,status:'error'}:{})};
    }
    async function ready(){
      writable();
      const verified=await SumiAccess.syncClient();writable();
      if(!transport||verified!==client){client=verified;transport=SumiSyncTransport.create({client,identity,logoStore,
        assertIdentity:SumiAccess.assertSyncIdentity,assertWritable:writable})}
      return transport;
    }
    const remote={};
    for(const method of ['pull','push','beforePush','beforeApply'])remote[method]=async value=>{
      writable();if(!transport)await ready();return transport[method](value);
    };
    if(!guest)try{
      SumiSync.validateState(read().state);
      manager=SumiSync.create({read,transport:remote,isBusy,isLocked:()=>workspace.isLocked()||!SumiSyncLock.isOwner(),
        validate:snapshot=>{SumiData.backup({version:1,data:snapshot.data,preferences:snapshot.preferences});return snapshot},
        commit(next,expected){
          writable();
          if(SumiSync.signature(read())!==SumiSync.signature(expected))throw Error('sync-local-changed');
          // No await between comparing, journaling data+metadata, and rendering.
          const before=storage.snapshot();storage.writeSnapshot(next.data,next.preferences,next.state);
          const after=storage.snapshot();
          if(SumiSync.signature([before.data,before.preferences])!==SumiSync.signature([after.data,after.preferences]))onApply(after);
        },onChange:changed});
    }catch{localError='sync-invalid-state'}
    async function action(method,...args){
      if(guest||!manager)throw Error('sync-unavailable');
      if(isBusy())throw Error('sync-busy');
      if(task)return task;
      task=Promise.resolve().then(async()=>{
        try{
          localError=null;
          if(!SumiSyncLock.isOwner()){
            await SumiSyncLock.claim(identity);
            if(SumiSyncLock.isOwner()){
              // Another tab may have saved since this view was opened. Reload
              // only on explicit retry, after the no-draft guard above.
              location.reload();return;
            }
          }
          writable();
          if(navigator.onLine!==false)await ready();
          return await manager[method](...args);
        }catch(error){localError=error.message||'sync-failed';throw error}
        finally{changed()}
      }).finally(()=>{task=null});
      return task;
    }
    function schedule(){
      if(guest||stopped||!manager||!read().state.enabled)return;
      queueMicrotask(()=>{
        if(stopped||isBusy()||workspace.isLocked())return;
        // Auto checks never reload a second tab or consume its unsaved input.
        if(!SumiSyncLock.isOwner()){changed();return}
        action('run').catch(()=>{});
      });
    }
    async function exportBackup(){
      if(guest||isBusy())throw Error('sync-busy');
      const backup=read().state.backup;if(!backup)throw Error('sync-invalid-state');
      const data=await logoStore.hydrateBackup(backup.data);
      download({version:1,data,preferences:backup.preferences},'sumi-before-cloud-sync.json');
    }
    const actions={inspect:()=>action('preview'),upload:id=>action('enable','upload',id),restore:id=>action('enable','restore',id),
      retry:()=>action(read().state.enabled?'run':'preview'),resolve:(id,choice)=>action('resolve',id,choice),exportBackup,
      cancelPreview(){if(manager?.cancelPreview)manager.cancelPreview();else localError=null;changed()}};
    function start(){
      if(guest||stopped)return;
      window.addEventListener('online',schedule);
      window.addEventListener('pageshow',schedule);
      document.addEventListener('visibilitychange',onVisible);
      timer=setInterval(()=>{if(!document.hidden)schedule()},30000);schedule();
    }
    function onVisible(){if(!document.hidden)schedule()}
    function stop(){stopped=true;clearInterval(timer);window.removeEventListener('online',schedule);window.removeEventListener('pageshow',schedule);document.removeEventListener('visibilitychange',onVisible);manager?.pause();}
    return Object.freeze({model,actions,start,stop,schedule,isBusy:()=>Boolean(task),snapshot:read});
  }
  return Object.freeze({create});
})();
if(typeof module!=='undefined')module.exports=SumiSyncController;
