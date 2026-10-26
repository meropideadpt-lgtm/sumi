/* Record-level sync. Business snapshots and this sidecar must commit atomically.
 * Transport owns authentication/assets; this module never reads a token/store. */
const SumiSync = (() => {
  'use strict';
  const KINDS = ['subscriptions','payments','costHistory','preferences','extensions'];
  const COLLECTIONS = KINDS.slice(0,3), LOCAL_PREFS = new Set(['motion']);
  const clone = value => structuredClone(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const error = code => { throw new Error(code); };
  const key = (kind,id) => JSON.stringify([kind,id]);
  const order = value => Array.isArray(value) ? value.map(order) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(name=>[name,order(value[name])])) : value;
  const signature = value => JSON.stringify(order(value));
  const equal = (left,right) => signature(left) === signature(right);
  const uuid = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) return error('sync-random-unavailable');
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
  const validId = value => typeof value==='string' && value.length>0 && value.length<=200;
  const validUUID = value => typeof value==='string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
  const validCursor = value => typeof value==='string' && /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value)<=9223372036854775807n;
  const revision = value => Number.isSafeInteger(value) && value>=0;
  const wireChange = change => ({kind:change.kind,id:change.id,payload:clone(change.payload),deleted:change.deleted,baseRevision:change.baseRevision});
  function validateChange(change) {
    if (!object(change) || !KINDS.includes(change.kind) || !validId(change.id)
      || typeof change.deleted!=='boolean' || !revision(change.baseRevision)
      || (!change.deleted && !object(change.payload))) error('sync-invalid-state');
    if (!change.deleted && COLLECTIONS.includes(change.kind) && change.payload.id!==change.id) error('sync-invalid-state');
    if (!change.deleted && !COLLECTIONS.includes(change.kind) && !Object.hasOwn(change.payload,'value')) error('sync-invalid-state');
    return change;
  }
  function sameWirePayload(source,target) {
    const left=clone(source.payload),right=clone(target.payload);
    if(source.kind==='subscriptions' && !source.deleted){
      if(left.logo!==right.logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(left.logo||'') || !/^sumi-logo:[a-f0-9]{64}$/.test(right.logo||'')))return false;
      delete left.logo;delete right.logo;
    }
    return equal(left,right);
  }
  function validateRecord(record) {
    if (!object(record) || !revision(record.revision) || record.revision<1 || !validCursor(record.seq)) error('sync-invalid-response');
    try { validateChange({...record,baseRevision:record.revision}); } catch { error('sync-invalid-response'); }
    return record;
  }
  function initialState({deviceId=uuid()}={}) {
    if (!validUUID(deviceId)) error('sync-invalid-state');
    return {version:1,deviceId,enabled:false,cursor:'0',base:{},outbox:[],conflicts:[],lastSuccess:null,backup:null};
  }
  function validateState(state) {
    if (state===null || state===undefined) return null;
    if (!object(state) || state.version!==1 || !validUUID(state.deviceId) || typeof state.enabled!=='boolean'
      || !validCursor(state.cursor) || !object(state.base) || !Array.isArray(state.outbox) || !Array.isArray(state.conflicts)
      || (state.lastSuccess!==null && (typeof state.lastSuccess!=='string' || !Number.isFinite(Date.parse(state.lastSuccess))))) error('sync-invalid-state');
    for (const [name,record] of Object.entries(state.base)) {
      try { validateRecord(record); } catch { error('sync-invalid-state'); }
      if (name!==key(record.kind,record.id)) error('sync-invalid-state');
    }
    const ids=new Set();
    for (const op of state.outbox) {
      if (!object(op) || !validUUID(op.id) || ids.has(op.id) || !Array.isArray(op.changes) || !op.changes.length || op.changes.length>1000) error('sync-invalid-state');
      const keys=new Set();
      for (const change of op.changes) {
        validateChange(change);const name=key(change.kind,change.id);
        if (keys.has(name) || (change.dependsOn!==undefined && !ids.has(change.dependsOn))) error('sync-invalid-state');keys.add(name);
      }
      if (op.wire!==undefined) {
        if (!Array.isArray(op.wire) || op.wire.length!==op.changes.length) error('sync-invalid-state');
        for (let i=0;i<op.wire.length;i++) {
          const change=validateChange(op.wire[i]),source=op.changes[i];
          if (change.kind!==source.kind || change.id!==source.id || change.deleted!==source.deleted || change.baseRevision!==source.baseRevision || !sameWirePayload(source,change)) error('sync-invalid-state');
        }
      }
      ids.add(op.id);
    }
    for (const conflict of state.conflicts) {
      if (!object(conflict) || !validId(conflict.id) || !Array.isArray(conflict.operationIds) || !conflict.operationIds.length
        || conflict.operationIds.some(id=>!ids.has(id)) || !Array.isArray(conflict.extraRemote)) error('sync-invalid-state');
      conflict.extraRemote.forEach(validateRecord);
    }
    if (state.backup!==null && state.backup!==undefined && (!object(state.backup) || state.backup.version!==1 || !object(state.backup.data) || !object(state.backup.preferences))) error('sync-invalid-state');
    return state;
  }
  function records(data,preferences) {
    if (!object(data) || !object(preferences)) error('sync-invalid-data');
    const result={};
    for (const kind of COLLECTIONS) {
      if (data[kind]!==undefined && !Array.isArray(data[kind])) error('sync-invalid-data');
      for (const payload of data[kind]||[]) {
        if (!object(payload) || !validId(payload.id)) error('sync-invalid-data');
        const name=key(kind,payload.id);if (Object.hasOwn(result,name)) error('sync-invalid-data');
        result[name]={kind,id:payload.id,payload:clone(payload),deleted:false};
      }
    }
    for (const [id,value] of Object.entries(preferences)) if (!LOCAL_PREFS.has(id)) {
      if (!validId(id)) error('sync-invalid-data');result[key('preferences',id)]={kind:'preferences',id,payload:{value:clone(value)},deleted:false};
    }
    for (const [id,value] of Object.entries(data)) if (!COLLECTIONS.includes(id)) {
      if (!validId(id)) error('sync-invalid-data');result[key('extensions',id)]={kind:'extensions',id,payload:{value:clone(value)},deleted:false};
    }
    return result;
  }
  function sameValue(left,right) {
    const l=!left || left.deleted, r=!right || right.deleted;
    return l===r && (l || equal(left.payload,right.payload));
  }
  function materialize(map,previous,{replace=false}={}) {
    const data=replace?{}:clone(previous.data),preferences=clone(previous.preferences);
    for (const kind of COLLECTIONS) {
      const items=(previous.data[kind]||[]),positions=new Map(items.map((item,index)=>[item.id,index]));
      const active=Object.values(map).filter(record=>record.kind===kind && !record.deleted);
      active.sort((a,b)=>(positions.get(a.id)??Number.MAX_SAFE_INTEGER)-(positions.get(b.id)??Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
      if (kind!=='costHistory' || active.length || Object.hasOwn(previous.data,'costHistory')) data[kind]=active.map(record=>clone(record.payload));
    }
    if (replace) for (const id of Object.keys(preferences)) if (!LOCAL_PREFS.has(id) && !['currency','reminder','theme','language'].includes(id)) delete preferences[id];
    for (const record of Object.values(map)) {
      if (record.kind==='extensions') {
        if (record.deleted) delete data[record.id];else Object.defineProperty(data,record.id,{value:clone(record.payload.value),enumerable:true,configurable:true,writable:true});
      } else if (record.kind==='preferences' && !LOCAL_PREFS.has(record.id)) {
        if (record.deleted) delete preferences[record.id];else Object.defineProperty(preferences,record.id,{value:clone(record.payload.value),enumerable:true,configurable:true,writable:true});
      }
    }
    return {data,preferences};
  }
  function components(state,seedIds,seedKeys=[]) {
    const ids=new Set(seedIds),keys=new Set(seedKeys);let changed=true;
    while (changed) {
      changed=false;
      for (const op of state.outbox) {
        if (!ids.has(op.id) && !op.changes.some(change=>keys.has(key(change.kind,change.id)))) continue;
        if (!ids.has(op.id)) { ids.add(op.id);changed=true; }
        for (const change of op.changes) if (!keys.has(key(change.kind,change.id))) { keys.add(key(change.kind,change.id));changed=true; }
      }
    }
    return {ids,keys};
  }
  function conflictComponent(state,conflict) {
    return components(state,conflict.operationIds,conflict.extraRemote.map(record=>key(record.kind,record.id)));
  }
  function regroup(state) {
    const groups=[];
    for (const original of state.conflicts) {
      let component=conflictComponent(state,original),reason=original.reason,groupId=original.id;
      const extras=new Map(original.extraRemote.map(record=>[key(record.kind,record.id),record]));
      let merged=true;
      while(merged){
        merged=false;
        for(const group of [...groups]){
          const other=conflictComponent(state,group);
          if(![...other.ids].some(id=>component.ids.has(id)) && ![...other.keys].some(name=>component.keys.has(name)))continue;
          groups.splice(groups.indexOf(group),1);groupId=group.id;
          if(['revision','initial'].includes(reason))reason=group.reason;
          group.extraRemote.forEach(record=>extras.set(key(record.kind,record.id),record));
          component=components(state,[...component.ids,...other.ids],[...component.keys,...other.keys]);merged=true;
        }
      }
      groups.push({id:groupId,operationIds:[...component.ids],reason,extraRemote:[...extras.values()]});
    }
    state.conflicts=groups;
  }
  function prepareWrite(previousData,previousPreferences,nextData,nextPreferences,state,{id=uuid,now=()=>new Date().toISOString()}={}) {
    validateState(state);if (!state?.enabled) return state===undefined?null:clone(state);
    const previous=records(previousData,previousPreferences),next=records(nextData,nextPreferences),result=clone(state),changes=[];
    for (const name of new Set([...Object.keys(previous),...Object.keys(next)])) {
      if (sameValue(previous[name],next[name])) continue;
      const target=next[name]||{kind:previous[name].kind,id:previous[name].id,payload:null,deleted:true};
      const dependency=[...result.outbox].reverse().find(op=>op.changes.some(change=>key(change.kind,change.id)===name));
      changes.push({...clone(target),baseRevision:result.base[name]?.revision||0,...(dependency?{dependsOn:dependency.id}:{})});
    }
    if (changes.length>1000) error('sync-too-large');
    if (changes.length) result.outbox.push({id:id(),createdAt:now(),changes});
    regroup(result);validateState(result);return result;
  }
  const counts = map => {
    const result=Object.fromEntries(KINDS.map(kind=>[kind,0]));const images=new Set();
    for (const record of Object.values(map)) if (!record.deleted) {
      result[record.kind]++;
      if (record.kind==='subscriptions' && /^(sumi-logo:|data:image\/)/.test(record.payload.logo||'')) images.add(record.payload.logo);
    }
    return {...result,images:images.size};
  };
  function create({read,commit,transport,validate=value=>value,isBusy=()=>false,isLocked=()=>false,online=()=>globalThis.navigator?.onLine!==false,onChange=()=>{},id=uuid,now=()=>new Date().toISOString()}) {
    let running=null,working=false,paused=false,lastError=null,previewValue=null,previewPrivate=null;
    const readSafe=()=>{const snapshot=read();if (!object(snapshot)||!object(snapshot.data)||!object(snapshot.preferences))error('sync-invalid-data');validateState(snapshot.state);return clone(snapshot)};
    const guard=()=>{if(paused||isLocked())error('sync-locked');if(isBusy())error('sync-busy');if(!online())error('sync-offline')};
    function conflictViews(snapshot) {
      const local=records(snapshot.data,snapshot.preferences),state=snapshot.state;
      return (state?.conflicts||[]).map(conflict=>{
        const component=conflictComponent(state,conflict),extra=new Map(conflict.extraRemote.map(record=>[key(record.kind,record.id),record]));
        for (const name of extra.keys()) component.keys.add(name);
        return {id:conflict.id,reason:conflict.reason,records:[...component.keys].map(name=>{
          const [kind,recordId]=JSON.parse(name),remote=state.base[name]||extra.get(name),own=local[name];
          return {kind,id:recordId,local:own?.payload??null,remote:remote?.payload??null,localDeleted:!own||own.deleted,remoteDeleted:!remote||remote.deleted};
        })};
      });
    }
    function getState() {
      try {
        const snapshot=readSafe(),state=snapshot.state,conflicts=conflictViews(snapshot),enabled=Boolean(state?.enabled);
        return {enabled,busy:working,status:working?'syncing':!enabled?(lastError?'error':'disabled'):paused||isLocked()||isBusy()?'paused':!online()?'offline':conflicts.length?'conflict':lastError?'error':state.outbox.length?'syncing':'synced',
          pending:state?.outbox.reduce((sum,op)=>sum+op.changes.length,0)||0,lastSuccess:state?.lastSuccess||null,conflicts,error:lastError,preview:previewValue?clone(previewValue):null,hasBackup:Boolean(state?.backup)};
      } catch { return {enabled:false,status:'error',pending:0,lastSuccess:null,conflicts:[],error:'sync-invalid-state',preview:null,hasBackup:false}; }
    }
    const emit=()=>onChange(getState());
    function checked(next) {
      const result=validate({version:1,data:clone(next.data),preferences:clone(next.preferences)});
      if (result?.data && result?.preferences) return {...next,data:result.data,preferences:result.preferences};
      return next;
    }
    async function save(next,expected) { guard();validateState(next.state);await commit(checked(next),expected); }
    function validatePage(page,after) {
      if (!object(page)||page.version!==1||!validCursor(page.cursor)||BigInt(page.cursor)<BigInt(after)||typeof page.more!=='boolean'||!Array.isArray(page.records)||page.records.length>1000) error('sync-invalid-response');
      let last=BigInt(after);
      for (const record of page.records) {
        validateRecord(record);const seq=BigInt(record.seq);
        if (seq<=last || seq>BigInt(page.cursor)) error('sync-invalid-response');last=seq;
      }
      if (page.more && (!page.records.length || page.cursor===after)) error('sync-invalid-response');
      return page;
    }
    async function collect(after='0') {
      let cursor=after,map={},more=true,pages=0;
      while(more) {
        guard();if(++pages>1000)error('sync-too-large');
        const page=validatePage(await transport.pull({after:cursor,limit:500}),cursor);guard();
        for (const record of page.records) map[key(record.kind,record.id)]=clone(record);
        cursor=page.cursor;more=page.more;
      }
      return {map,cursor};
    }
    const snapshotSignature=snapshot=>signature({data:snapshot.data,preferences:snapshot.preferences,state:snapshot.state});
    async function hydrate(next,expected) {
      let data=clone(next.data);
      if (transport.beforeApply) data=await transport.beforeApply(data);
      guard();const latest=readSafe();if(snapshotSignature(latest)!==snapshotSignature(expected))error('sync-local-changed');
      return {...next,data};
    }
    function addConflict(state,op,reason,extraRemote=[]) {
      if (!state.conflicts.some(item=>item.operationIds.includes(op.id))) state.conflicts.push({id:op.id,operationIds:[op.id],reason,extraRemote:clone(extraRemote)});
      else {const item=state.conflicts.find(item=>item.operationIds.includes(op.id));if(!['revision','initial'].includes(reason))item.reason=reason;item.extraRemote.push(...clone(extraRemote));}
      regroup(state);
    }
    async function ingest(delta) {
      const previous=readSafe();if(!previous.state?.enabled)return;
      const state=clone(previous.state),map=records(previous.data,previous.preferences);
      for (const [name,record] of Object.entries(delta.map)) {
        const old=state.base[name];if(old && record.revision<old.revision)error('sync-invalid-response');
        const pending=state.outbox.filter(op=>op.changes.some(change=>key(change.kind,change.id)===name));
        if (pending.length) {
          const first=pending[0],wire=(first.wire||first.changes).find(change=>key(change.kind,change.id)===name);
          if ((!old || record.revision>old.revision) && (!old || !sameValue(old,record)) && !(wire && sameValue(wire,record))) addConflict(state,first,'revision');
        } else {
          // A different payment ID can still compete for the same paid cycle.
          // Keep that cloud record in the conflict, not in an invalid local pair.
          const related=state.outbox.find(op=>op.changes.some(change=>{
            if(record.kind==='payments' && !record.deleted && record.payload.status!=='failed' && record.payload.cycleDate
              && change.kind==='payments' && !change.deleted && change.payload.status!=='failed')
              return change.payload.subscriptionId===record.payload.subscriptionId && change.payload.cycleDate===record.payload.cycleDate;
            if(record.kind==='subscriptions' && record.deleted && change.kind==='payments' && !change.deleted)
              return change.payload.subscriptionId===record.id;
            if(record.kind==='payments' && !record.deleted && change.kind==='subscriptions' && change.deleted)
              return record.payload.subscriptionId===change.id;
            return false;
          }));
          if(related)addConflict(state,related,record.kind==='subscriptions'?'parent-deleted':related.changes.some(change=>change.kind==='subscriptions'&&change.deleted&&change.id===record.payload.subscriptionId)?'dependent-records':'paid-cycle',[record]);
          const held=state.conflicts.some(conflict=>conflict.extraRemote.some(item=>key(item.kind,item.id)===name));
          if(!held && (!old || !equal(old,record)))map[name]=clone(record);
        }
        state.base[name]=clone(record);
      }
      state.cursor=delta.cursor;
      const next={...materialize(map,previous),state};
      if (snapshotSignature(next)===snapshotSignature(previous))return;
      await save(await hydrate(next,previous),previous);
    }
    async function pull() {
      const snapshot=readSafe();if(!snapshot.state?.enabled)return;
      const delta=await collect(snapshot.state.cursor);await ingest(delta);
    }
    async function preview() {
      guard();if(running||working)error('sync-busy');lastError=null;working=true;emit();
      try {
        const snapshot=readSafe(),cloud=await collect('0');
        if(snapshotSignature(readSafe())!==snapshotSignature(snapshot))error('sync-local-changed');
        const local=records(snapshot.data,snapshot.preferences);
        const value={id:id(),localCounts:counts(local),cloudCounts:counts(cloud.map),differences:[...new Set([...Object.keys(local),...Object.keys(cloud.map)])].filter(name=>!sameValue(local[name],cloud.map[name])).length};
        previewPrivate={snapshotSignature:snapshotSignature(snapshot),cloud,signature:signature(cloud.map),id:value.id};previewValue=value;
        return clone(value);
      } catch(cause) {lastError=cause.message||'sync-failed';throw cause;} finally {working=false;emit();}
    }
    async function prepareWire(op) {
      const source=op.changes.map(wireChange),result=transport.beforePush?await transport.beforePush(clone(source)):source;
      if(!Array.isArray(result)||result.length!==source.length)error('sync-invalid-response');
      return result.map((change,index)=>{
        try{validateChange(change)}catch{error('sync-invalid-response')}
        const previous=source[index];
        if(change.kind!==previous.kind||change.id!==previous.id||change.deleted!==previous.deleted||change.baseRevision!==previous.baseRevision)error('sync-invalid-response');
        // Asset canonicalization may replace inline bytes by their hash only.
        // It cannot change a financial field or rewrite an arbitrary logo URL.
        if(!sameWirePayload(previous,change))error('sync-invalid-response');
        return wireChange(change);
      });
    }
    async function enable(mode,previewId) {
      if(!['upload','restore'].includes(mode))error('sync-invalid-choice');guard();
      if(running||working)error('sync-busy');
      const snapshot=readSafe();if(snapshot.state?.enabled)error('sync-already-enabled');
      if(!previewPrivate||previewPrivate.id!==previewId||previewPrivate.snapshotSignature!==snapshotSignature(snapshot))error('sync-preview-stale');
      working=true;lastError=null;emit();
      try {
        const cloud=await collect('0');if(signature(cloud.map)!==previewPrivate.signature)error('sync-preview-stale');
        const state=snapshot.state?clone(snapshot.state):initialState({deviceId:id()});state.enabled=true;state.cursor=cloud.cursor;state.base=clone(cloud.map);
        if(!state.backup)state.backup={version:1,createdAt:now(),data:clone(snapshot.data),preferences:clone(snapshot.preferences)};
        let next;
        if(mode==='restore') next={...materialize(cloud.map,snapshot,{replace:true}),state};
        else {
          const local=records(snapshot.data,snapshot.preferences),all=Object.values(local).map(record=>({...record,baseRevision:cloud.map[key(record.kind,record.id)]?.revision||0}));
          if(all.length>1000)error('sync-too-large');
          const op={id:id(),createdAt:now(),changes:all},wire=all.length?await prepareWire(op):[];
          const changes=[],wireChanges=[];
          for(let i=0;i<all.length;i++)if(!sameValue(wire[i],cloud.map[key(all[i].kind,all[i].id)])){changes.push(all[i]);wireChanges.push(wire[i])}
          if(changes.length){op.changes=changes;op.wire=wireChanges;state.outbox.push(op);if(wireChanges.some(change=>cloud.map[key(change.kind,change.id)] && !sameValue(change,cloud.map[key(change.kind,change.id)])))addConflict(state,op,'initial');}
          const merged={...cloud.map,...local};
          if(state.outbox.length)for(const remote of Object.values(cloud.map)){
            if(remote.kind!=='payments'||remote.deleted||remote.payload.status==='failed'||!remote.payload.cycleDate)continue;
            const competing=Object.values(local).find(record=>record.kind==='payments'&&record.id!==remote.id&&record.payload.status!=='failed'&&record.payload.subscriptionId===remote.payload.subscriptionId&&record.payload.cycleDate===remote.payload.cycleDate);
            if(competing && !local[key(remote.kind,remote.id)]){addConflict(state,op,'paid-cycle',[remote]);delete merged[key(remote.kind,remote.id)];}
          }
          next={...materialize(merged,snapshot,{replace:true}),state};
        }
        const ready=await hydrate(next,snapshot);await save(ready,snapshot);previewPrivate=null;previewValue=null;
      } catch(cause){lastError=cause.message||'sync-failed';throw cause;} finally{working=false;emit();}
      return run();
    }
    async function acknowledge(operationId) {
      const previous=readSafe(),state=clone(previous.state),op=state.outbox.find(item=>item.id===operationId);if(!op)return;
      if(!op.wire || op.wire.some(change=>!sameValue(change,state.base[key(change.kind,change.id)])))error('sync-verification-failed');
      state.outbox=state.outbox.filter(item=>item.id!==operationId);
      state.conflicts=state.conflicts.filter(item=>!item.operationIds.includes(operationId));
      for(const pending of state.outbox)for(const change of pending.changes)if(change.dependsOn===operationId){change.baseRevision=state.base[key(change.kind,change.id)]?.revision||0;delete change.dependsOn;delete pending.wire;}
      regroup(state);await save({...previous,state},previous);
    }
    async function pushNext() {
      let current=readSafe(),op=current.state.outbox[0];if(!op)return;
      if(op.changes.some(change=>change.dependsOn))error('sync-invalid-state');
      if(!op.wire){
        const wire=await prepareWire(op);guard();current=readSafe();const state=clone(current.state),pending=state.outbox.find(item=>item.id===op.id);
        if(!pending)return;if(!equal(pending.changes,op.changes))error('sync-local-changed');pending.wire=wire;
        await save({...current,state},current);op=clone(pending);
      }
      guard();const response=await transport.push({operationId:op.id,changes:clone(op.wire)});guard();
      if(!object(response)||typeof response.ok!=='boolean')error('sync-invalid-response');
      if(response.ok){
        if(!Array.isArray(response.records)||response.records.length!==op.wire.length)error('sync-invalid-response');
        const result=new Map(response.records.map(record=>{validateRecord(record);return [key(record.kind,record.id),record]}));
        if(result.size!==op.wire.length||op.wire.some(change=>!sameValue(change,result.get(key(change.kind,change.id)))))error('sync-invalid-response');
        // An ACK is not proof of a successful read. Persist outbox until a pull
        // returns the committed values; dropped ACKs retry the same operation.
        await pull();
        const state=readSafe().state;
        if(op.wire.every(change=>sameValue(change,state.base[key(change.kind,change.id)])))await acknowledge(op.id);
        else {const previous=readSafe(),next=clone(previous.state);addConflict(next,op,'revision');await save({...previous,state:next},previous);}
      } else {
        if(!Array.isArray(response.conflicts)||!response.conflicts.length)error('sync-invalid-response');
        const previous=readSafe(),state=clone(previous.state),extras=[];let reason='revision';
        for(const conflict of response.conflicts){
          if(!object(conflict)||!op.wire.some(change=>change.kind===conflict.kind&&change.id===conflict.id))error('sync-invalid-response');
          if(!['revision','paid-cycle','parent-deleted','dependent-records'].includes(conflict.reason))error('sync-invalid-response');
          if(conflict.reason!=='revision')reason=conflict.reason;
          if(conflict.remote){validateRecord(conflict.remote);state.base[key(conflict.remote.kind,conflict.remote.id)]=clone(conflict.remote);extras.push(clone(conflict.remote));}
        }
        addConflict(state,op,reason,extras);await save({...previous,state},previous);
        await pull();
        const latest=readSafe().state;
        if(reason==='revision'&&op.wire.every(change=>sameValue(change,latest.base[key(change.kind,change.id)])))await acknowledge(op.id);
      }
    }
    function run() {
      if(running)return running;
      running=Promise.resolve().then(async()=>{
        try {
          guard();const first=readSafe();if(!first.state?.enabled)return getState();
          lastError=null;working=true;emit();await pull();
          let attempts=0;
          while(readSafe().state.outbox.length && !readSafe().state.conflicts.length){if(++attempts>1000)error('sync-too-large');await pushNext();}
          if(!readSafe().state.conflicts.length){await pull();const previous=readSafe();if(!previous.state.outbox.length&&!previous.state.conflicts.length){const state=clone(previous.state);state.lastSuccess=now();await save({...previous,state},previous);}}
        } catch(cause){lastError=['sync-busy','sync-locked','sync-offline'].includes(cause.message)?null:(cause.message||'sync-failed');}
        finally{working=false;running=null;emit();}
        return getState();
      });return running;
    }
    async function resolve(conflictId,choice) {
      if(!['local','remote'].includes(choice))error('sync-invalid-choice');guard();if(running||working)error('sync-busy');
      working=true;lastError=null;emit();
      try {
        // A newly observed financial version needs another explicit choice.
        // Refreshing must not silently rebase a decision made on an older UI.
        const shown=readSafe(),selected=shown.state.conflicts.find(item=>item.id===conflictId);
        if(!selected)error('sync-conflict-missing');
        const choiceSignature=(snapshot,item)=>{
          if(!item)return null;const local=records(snapshot.data,snapshot.preferences),component=conflictComponent(snapshot.state,item);
          return signature({reason:item.reason,operations:item.operationIds,records:[...component.keys].sort().map(name=>({name,local:local[name]||null,remote:snapshot.state.base[name]||null}))});
        };
        const seen=choiceSignature(shown,selected);
        await pull();const previous=readSafe(),state=clone(previous.state),conflict=state.conflicts.find(item=>item.id===conflictId);
        if(choiceSignature(previous,conflict)!==seen)error('sync-conflict-changed');
        if(!conflict)error('sync-conflict-missing');
        if(choice==='local'&&!['revision','initial'].includes(conflict.reason))error('sync-conflict-requires-edit');
        const component=conflictComponent(state,conflict),local=records(previous.data,previous.preferences),map=clone(local);
        for(const extra of conflict.extraRemote)component.keys.add(key(extra.kind,extra.id));
        const removed=new Set(component.ids);
        state.outbox=state.outbox.filter(op=>!removed.has(op.id));state.conflicts=state.conflicts.filter(item=>!item.operationIds.some(id=>removed.has(id)));
        if(choice==='remote'){
          for(const name of component.keys){if(state.base[name])map[name]=clone(state.base[name]);else map[name]={kind:JSON.parse(name)[0],id:JSON.parse(name)[1],payload:null,deleted:true};}
        } else {
          const changes=[];
          for(const name of component.keys){const target=local[name]||{kind:JSON.parse(name)[0],id:JSON.parse(name)[1],payload:null,deleted:true};if(!sameValue(target,state.base[name]))changes.push({...clone(target),baseRevision:state.base[name]?.revision||0});}
          if(changes.length>1000)error('sync-too-large');if(changes.length)state.outbox.unshift({id:id(),createdAt:now(),changes});
        }
        regroup(state);const next={...materialize(map,previous),state};await save(await hydrate(next,previous),previous);
      }catch(cause){lastError=cause.message||'sync-failed';throw cause;}finally{working=false;emit();}
      return run();
    }
    function cancelPreview(){if(working||running)return false;previewPrivate=null;previewValue=null;emit();return true;}
    function pause(value=true){paused=Boolean(value);emit();}
    return Object.freeze({getState,preview,enable,run,resolve,pause,cancelPreview});
  }
  return Object.freeze({KINDS,initialState,validateState,records,prepareWrite,create,signature});
})();
if(typeof globalThis!=='undefined')globalThis.SumiSync=SumiSync;
if(typeof module!=='undefined')module.exports=SumiSync;
