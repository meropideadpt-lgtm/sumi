const test=require('node:test'),assert=require('node:assert/strict');
const {check,guardedFetch,publicConfig,ORIGIN,STORAGE_PATH,TABLES}=require('../scripts/check-sync-connectivity.cjs');
const config={url:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture_only'};
function fixture(){
 const calls=[];
 const fetcher=async(input,options)=>{
  const url=new URL(input);calls.push({url,options});
  assert.equal(options.headers.get('Origin'),ORIGIN);assert.equal(options.redirect,'error');
  assert.equal(options.headers.get('apikey'),config.publishableKey);
  if(options.method==='HEAD')return new Response(null,{status:401});
  if(options.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'apikey,authorization,content-type,x-client-info,x-upsert'}});
  return Response.json(url.pathname.endsWith('/health')?{name:'GoTrue'}:{disable_signup:true},{headers:{'access-control-allow-origin':ORIGIN}});
 };
 return {calls,fetcher};
}
test('readonly plan uses official SDK anonymous HEAD and OPTIONS without executing either RPC',async()=>{
 const f=fixture(),report=await check(config,{fetcher:f.fetcher});
 assert.equal(report.stopped,undefined);assert.equal(report.checks.length,9);assert(report.checks.every(r=>r.passed));
 assert.deepEqual(f.calls.map(c=>c.options.method),['GET','GET','OPTIONS','OPTIONS','OPTIONS','HEAD','HEAD','HEAD','HEAD']);
 for(const call of f.calls){assert.equal(call.options.body,undefined);if(call.url.pathname.includes('/rpc/'))assert.equal(call.options.method,'OPTIONS')}
 for(const table of TABLES){const call=f.calls.find(c=>c.url.pathname==='/rest/v1/'+table);assert.equal(call.url.searchParams.get('limit'),'0');assert.equal(call.options.headers.get('authorization'),'Bearer '+config.publishableKey)}
 assert.equal(report.authenticatedRpc,'not-run');assert.equal(report.browserCorsEnforcement,'not-run');
 assert(!JSON.stringify(report).includes(config.publishableKey));
});
test('guard blocks writes, real tokens, foreign origins, RPC execution and larger reads before fetch',async()=>{
 let requests=0;const fetch=guardedFetch(config,async()=>{requests++;return new Response()});
 const cases=[['/rest/v1/rpc/sumi_sync_pull',{method:'POST'}],['/rest/v1/rpc/sumi_sync_pull',{method:'GET'}],['/rest/v1/rpc/sumi_sync_push',{method:'OPTIONS',body:'{}'}],
  [STORAGE_PATH,{method:'POST'}],[STORAGE_PATH,{method:'DELETE'}],['/rest/v1/sumi_sync_records?select=*&limit=10',{method:'HEAD'}],
  ['/auth/v1/settings',{headers:{authorization:'Bearer private-test-jwt'}}],['/auth/v1/settings',{headers:{apikey:'sb_secret_forbidden'}}]];
 for(const [path,options]of cases)await assert.rejects(fetch(config.url+path,options));
 await assert.rejects(fetch('https://different.supabase.co/auth/v1/settings'));
 assert.equal(requests,0);
});
test('unreachable health stops immediately, reports no success and never logs raw errors',async()=>{
 let calls=0;const report=await check(config,{fetcher:async()=>{calls++;throw Error('secret server text')}});
 assert.equal(calls,1);assert.equal(report.checks.length,0);assert(report.stopped);assert(!JSON.stringify(report).includes('secret server text'));
});
test('CORS mismatch or anonymous table access is flagged instead of being called a pass',async()=>{
 const f=fixture();const report=await check(config,{fetcher:async(input,options)=>{
  if(options.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://wrong.test'}});
  if(options.method==='HEAD')return new Response(null,{status:200});
  return f.fetcher(input,options);
 }});
 assert.equal(report.checks.filter(r=>r.passed).length,2);assert(report.checks.slice(2).every(r=>r.passed===false));
});
test('repository config is public only; loading it does not contact the service',()=>{
 const value=publicConfig();assert.equal(value.url,'https://qcboybxjjegdwpbbtbaj.supabase.co');assert.match(value.publishableKey,/^sb_publishable_/);
});
