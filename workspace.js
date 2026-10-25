/* Workspace v1: guest keys stay byte-for-byte compatible; identities never share a namespace. */
const SumiWorkspace = (() => {
  const CHOICE='sumi-workspace-choice-v1', LEGACY_DB='sumi-logo-assets-v1';
  const KEYS=new Set(['sumi-data-v1','sumi-prefs-v1','sumi-write-journal-v1','sumi-fx-cache-v1']);
  const userId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
  function project(url){try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&parsed.pathname==='/'?parsed.origin:null}catch{return null}}
  function identity(url,id){const origin=project(url);if(!origin||!userId(id))throw Error('invalid-identity');return Object.freeze({version:1,mode:'account',project:origin,userId:id.toLowerCase(),prefix:`sumi-account-v1:${encodeURIComponent(origin)}:${id.toLowerCase()}:`,dbName:`${LEGACY_DB}:${encodeURIComponent(origin)}:${id.toLowerCase()}`})}
  const guest=()=>Object.freeze({version:1,mode:'guest',prefix:'',dbName:LEGACY_DB});
  function create({local=globalThis.localStorage,tab=globalThis.sessionStorage,config=globalThis.SumiAuthConfig||{}}={}){
    let active=null,locked=false;
    function choice(){
      for(const store of [tab,local])try{
        const saved=JSON.parse(store?.getItem(CHOICE)||'null');
        if(saved?.version!==1)continue;
        if(['guest','login'].includes(saved.mode))return {version:1,mode:saved.mode};
        if(saved.mode==='account'&&saved.project===project(config.url)&&userId(saved.userId))return identity(saved.project,saved.userId);
      }catch{}
      return {version:1,mode:'login'};
    }
    function remember(value){
      const saved=value.mode==='account'?{version:1,mode:'account',project:value.project,userId:value.userId}:{version:1,mode:value.mode};
      if(!['account','guest','login'].includes(saved.mode))throw Error('invalid-workspace');
      // An identity choice is not a migration. Never touch business keys here.
      let persisted=false;
      for(const store of [tab,local])try{store.setItem(CHOICE,JSON.stringify(saved));persisted=true}catch{}
      return persisted;
    }
    function activate(value){
      const next=value.mode==='guest'?guest():identity(value.project,value.userId);
      if(active&&active.prefix!==next.prefix)throw Error('workspace-reload-required');
      active=next;locked=false;return active;
    }
    const assertWritable=()=>{if(!active||locked)throw Error('workspace-locked')};
    function storage(){
      if(!active)throw Error('workspace-not-ready');
      const pinned=active;
      const key=name=>{if(!KEYS.has(name))throw Error('invalid-storage-key');return pinned.prefix+name};
      return Object.freeze({getItem:name=>local.getItem(key(name)),setItem:(name,value)=>{assertWritable();local.setItem(key(name),value)},removeItem:name=>{assertWritable();local.removeItem(key(name))}});
    }
    function preferenceKey(){const saved=choice();return (saved.mode==='account'?saved.prefix:'')+'sumi-prefs-v1'}
    return Object.freeze({choice,remember,activate,storage,preferenceKey,current:()=>active,lock:()=>{locked=true},unlock:id=>{if(active?.mode==='account'&&active.userId===id?.toLowerCase()){locked=false;return true}return false},isLocked:()=>locked,assertWritable});
  }
  // Storage access can itself throw in privacy modes. Keep the guest entry usable.
  const safeStore=name=>({getItem:key=>globalThis[name].getItem(key),setItem:(key,value)=>globalThis[name].setItem(key,value),removeItem:key=>globalThis[name].removeItem(key)});
  return Object.freeze({...create({local:safeStore('localStorage'),tab:safeStore('sessionStorage')}),create,identity,guest,project,userId,CHOICE,LEGACY_DB});
})();
if(typeof globalThis!=='undefined')globalThis.SumiWorkspace=SumiWorkspace;
if(typeof module!=='undefined')module.exports=SumiWorkspace;
