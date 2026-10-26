const test=require('node:test'),assert=require('node:assert/strict');
const Lock=require('../sync-lock.js');
const account={mode:'account',prefix:'project:user:'};
function service(){const held=new Set();return{request:async(name,options,callback)=>{assert.equal(options.ifAvailable,true);if(held.has(name))return callback(null);held.add(name);try{return await callback({name})}finally{held.delete(name)}}}}
test('account tabs share one non-expiring writer lock; closing releases it',async()=>{
 const locks=service(),a=Lock.create({locks}),b=Lock.create({locks});
 assert.equal(await a.claim(account),true);assert.equal(await b.claim(account),false);
 a.assertCloudWriter();assert.throws(()=>b.assertCloudWriter(),/other-tab/);assert.equal(b.canWrite(),false);
 a.release();await new Promise(setImmediate);assert.equal(await b.claim(account),true);b.release();
});
test('different account identities do not block each other',async()=>{
 const locks=service(),a=Lock.create({locks}),b=Lock.create({locks});
 assert.equal(await a.claim(account),true);assert.equal(await b.claim({...account,prefix:'project:second:'}),true);a.release();b.release();
});
test('missing Web Locks keeps local-only usage but cannot enable or write cloud data',async()=>{
 const lock=Lock.create({locks:null});await lock.claim(account);assert.equal(lock.canWrite(false),true);assert.equal(lock.canWrite(true),false);assert.throws(()=>lock.assertCloudWriter(),/unavailable/);
});
test('guest does not ask for an account lock or private state',async()=>{
 const lock=Lock.create({locks:{request(){throw Error('must not call')}}});assert.equal(await lock.claim({mode:'guest'}),true);assert.equal(lock.canWrite(),true);
});
test('lock failure stays read-only and explicit retry can acquire it',async()=>{
 let failed=true;const lock=Lock.create({locks:{request(...args){if(failed)return Promise.reject(Error('blocked'));return service().request(...args)}}});
 assert.equal(await lock.claim(account),false);assert.equal(lock.canWrite(),false);failed=false;assert.equal(await lock.claim(account),true);lock.release();
});
