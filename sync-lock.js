/* One writer per account on this browser. Cross-device concurrency uses SQL CAS.
 * Web Locks are held for this document, never implemented with expiring storage leases. */
const SumiSyncLock = (() => {
  function create({locks=globalThis.navigator?.locks}={}) {
    let identity=null,owned=false,pending=null,release=null;
    const supported=Boolean(locks?.request);
    async function claim(value) {
      if(value?.mode==='guest'){identity=value;return true}
      if(value?.mode!=='account'||typeof value.prefix!=='string'||!value.prefix)throw Error('sync-auth');
      if(identity&&identity.prefix!==value.prefix)throw Error('sync-auth');
      identity=value;
      if(owned)return true;
      if(!supported)return false;
      if(pending)return pending;
      pending=new Promise(resolve=>{
        try{
          const request=locks.request('sumi-sync-writer:'+value.prefix,{mode:'exclusive',ifAvailable:true},lock=>{
            if(!lock){resolve(false);return}
            owned=true;
            return new Promise(done=>{release=()=>{owned=false;release=null;done()};resolve(true)});
          });
          Promise.resolve(request).catch(()=>{owned=false;resolve(false)});
        }catch{resolve(false)}
      });
      try{return await pending}finally{pending=null}
    }
    function canWrite(syncEnabled=false) {
      if(identity?.mode==='guest')return true;
      // Older browsers keep local account features, but cannot opt into sync.
      if(!supported)return !syncEnabled;
      return owned;
    }
    function assertCloudWriter(){if(!supported)throw Error('sync-lock-unavailable');if(!owned)throw Error('sync-other-tab')}
    return Object.freeze({claim,canWrite,assertCloudWriter,isOwner:()=>owned,isSupported:()=>supported,release:()=>release?.()});
  }
  return Object.freeze({...create(),create});
})();
if(typeof module!=='undefined')module.exports=SumiSyncLock;
