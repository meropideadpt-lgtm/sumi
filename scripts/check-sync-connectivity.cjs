#!/usr/bin/env node
/* Opt-in, anonymous, read-only connectivity diagnostics. No real user session.
 * Not run by CI. GET/HEAD/OPTIONS only; neither RPC is executed. In particular,
 * sumi_sync_pull is NOT read-only: it can initialize the owner's clock row.
 */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
function loadSDK() {
  const source=fs.readFileSync(path.join(__dirname,'../supabase-sdk.js'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/vendor/supabase.json'),'utf8'));
  if(createHash('sha256').update(source).digest('hex')!==manifest.sha256) throw Error('Vendored SDK checksum mismatch');
  // The pinned browser distribution exposes a local `var supabase`, not CJS
  // exports. Evaluate that unchanged distribution in a private function scope.
  return new Function(source+'\nreturn supabase;')();
}
const TABLES = ['sumi_sync_records','sumi_sync_clock','sumi_sync_operations','sumi_subscription_ids'];
const ORIGIN = 'https://meropideadpt-lgtm.github.io';
const STORAGE_PATH = '/storage/v1/object/sumi-private-logos/00000000-0000-4000-8000-000000000000/'+'0'.repeat(64)+'.png';
const ROUTES = new Map([
  ['/auth/v1/health','GET'], ['/auth/v1/settings','GET'],
  ['/rest/v1/rpc/sumi_sync_pull','OPTIONS'], ['/rest/v1/rpc/sumi_sync_push','OPTIONS'],
  [STORAGE_PATH,'OPTIONS'], ...TABLES.map(table=>['/rest/v1/'+table,'HEAD'])
]);
function publicConfig() {
  const source = fs.readFileSync(path.join(__dirname,'../auth-config.js'),'utf8');
  const url = /\burl:\s*'([^']+)'/.exec(source)?.[1];
  const publishableKey = /\bpublishableKey:\s*'(sb_publishable_[A-Za-z0-9_-]+)'/.exec(source)?.[1];
  if (!url || !publishableKey) throw Error('Public configuration is missing');
  return {url,publishableKey};
}
function guardedFetch(config,fetcher,onResponse=()=>{}) {
  const project = new URL(config.url);
  if (project.protocol!=='https:' || project.username || project.password || project.pathname!=='/' || project.search || project.hash
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw Error('Use only the public project URL and Publishable Key');
  return async (input,options={}) => {
    const url = new URL(input instanceof URL?input.href:input),method=(options.method||'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (url.origin!==project.origin || ROUTES.get(url.pathname)!==method || options.body!=null
      || (method!=='HEAD' && url.search) || url.username || url.password || url.hash) throw Error('Read-only probe rejected request');
    if (method==='HEAD' && (url.searchParams.get('select')!=='owner_id' || url.searchParams.get('limit')!=='0'
      || [...url.searchParams.keys()].some(k=>!['select','limit'].includes(k)))) throw Error('Read-only probe rejected query');
    // Reject any real JWT or credential accidentally passed into this tool.
    if (headers.get('apikey') && headers.get('apikey')!==config.publishableKey) throw Error('Unexpected API key');
    if (headers.get('authorization') && headers.get('authorization')!=='Bearer '+config.publishableKey) throw Error('User sessions are not accepted');
    headers.set('Origin',ORIGIN);
    const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);
    const response=await fetcher(url.href,{...options,method,headers,signal,redirect:'error'});
    onResponse(url.pathname,method,response);
    return response;
  };
}
async function check(config,{fetcher=globalThis.fetch}={}) {
  const report={checkedAt:new Date().toISOString(),project:config.url,mode:'anonymous-read-only',
    authenticatedRpc:'not-run',privateImageTransfer:'not-run',browserCorsEnforcement:'not-run',checks:[]};
  const responses=new Map();
  const request=guardedFetch(config,fetcher,(p,m,r)=>responses.set(m+' '+p,r));
  const headers={apikey:config.publishableKey};
  async function probe(label,path,options={}) {
    const method=options.method||'GET';
    const response=await request(config.url+path,{...options,headers:{...headers,...options.headers}});
    const cors=response.headers.get('access-control-allow-origin');
    const row={label,method,path,status:response.status,corsOrigin:cors,corsHeadersAdvertised: cors==='*'||cors===ORIGIN};
    report.checks.push(row);return {row,response};
  }
  try {
    const health=await probe('Auth health','/auth/v1/health');
    const info=await health.response.json().catch(()=>null);
    health.row.serviceRecognized=health.response.ok && info?.name==='GoTrue';
    health.row.passed=health.row.serviceRecognized && health.row.corsHeadersAdvertised;
    if (!health.row.serviceRecognized) {report.stopped='Auth service not verified; no further probes';return report;}
    const settings=await probe('Public Auth settings','/auth/v1/settings');
    const flags=await settings.response.json().catch(()=>null);
    settings.row.passed=settings.response.ok && typeof flags?.disable_signup==='boolean' && settings.row.corsHeadersAdvertised;
    settings.row.publicSignupDisabled=typeof flags?.disable_signup==='boolean'?flags.disable_signup:null;
    for (const endpoint of ['/rest/v1/rpc/sumi_sync_pull','/rest/v1/rpc/sumi_sync_push',STORAGE_PATH]) {
      const {row,response}=await probe('CORS preflight only',endpoint,{method:'OPTIONS',headers:{
        'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,authorization,content-type,x-client-info'+(endpoint===STORAGE_PATH?',x-upsert':'')}});
      const methods=response.headers.get('access-control-allow-methods')||'';
      const allowed=(response.headers.get('access-control-allow-headers')||'').toLowerCase().split(',').map(s=>s.trim());
      row.passed=response.ok && row.corsHeadersAdvertised && /\bPOST\b/i.test(methods)
        && (allowed.includes('*') || ['apikey','authorization','content-type','x-client-info',...(endpoint===STORAGE_PATH?['x-upsert']:[])].every(h=>allowed.includes(h)));
      row.scope='Preflight does not prove RPC existence, execution privileges, RLS or Storage transfer';
    }
    const sdk=loadSDK().createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:request}});
    for (const table of TABLES) {
      const result=await sdk.from(table).select('owner_id',{head:true}).limit(0);
      const response=responses.get('HEAD /rest/v1/'+table);
      report.checks.push({label:'Official SDK anonymous table HEAD',method:'HEAD',path:'/rest/v1/'+table,
        status:response?.status||0,passed:Boolean(result.error)&&[401,403].includes(response?.status),
        scope:'Expected table privilege denial; does not test authenticated owner RLS'});
      if (!response) {report.stopped='Network unavailable; remaining probes not run';break;}
    }
  } catch { report.stopped='Network, TLS, proxy or response failure; no credentials or response body logged'; }
  return report;
}
if(require.main===module) {
  (async()=>{
    if(process.argv.slice(2).join(' ')!=='--read-only') throw Error('Usage: node --use-env-proxy scripts/check-sync-connectivity.cjs --read-only');
    if(['HTTPS_PROXY','HTTP_PROXY','https_proxy','http_proxy'].some(k=>process.env[k])
      && !process.execArgv.includes('--use-env-proxy') && process.env.NODE_USE_ENV_PROXY!=='1') throw Error('Preserve the environment proxy: run Node with --use-env-proxy');
    const report=await check(publicConfig());console.log(JSON.stringify(report,null,2));
    process.exitCode=report.stopped || !report.checks.every(row=>row.passed) ? 1:0;
  })().catch(error=>{console.error(error.message);process.exitCode=1});
}
module.exports={check,guardedFetch,publicConfig,ORIGIN,STORAGE_PATH,TABLES};
