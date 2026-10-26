const test=require('node:test'),assert=require('node:assert/strict');
const Transport=require('../sync-transport.js'),Upload=require('../logo-upload.js');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const OP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// Actual JPEG with EXIF Orientation=6: encoded 2x3, displayed 3x2 in browsers.
const ORIENTED_JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz6iiivYPLP//Z';
const WEBP='data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8iJf/LPn8NnHv/5BcsLriMAAAA==';
const body=url=>new Uint8Array(Buffer.from(url.slice(url.indexOf(',')+1),'base64'));
const hash=async url=>Buffer.from(await crypto.subtle.digest('SHA-256',body(url))).toString('hex');
const ref=async url=>'sumi-logo:'+await hash(url);
const mime=url=>url.slice(5,url.indexOf(';'));
const change=(logo=PNG)=>({kind:'subscriptions',id:'legacy-id',baseRevision:0,deleted:false,payload:{id:'legacy-id',logo,name:'Original 原名',amount:12.345,currency:'USD',months:1,nextDate:'2026-12-01',extension:{keep:true}}});
function harness(options={}){
 const objects=new Map(),local=new Map(),calls=[],decodes=[];
 const identity={mode:'account',userId:A,project:'https://personal.supabase.co'};
 let user=A,locked=false;
 const client={supabaseUrl:identity.project,auth:{getUser:async()=>({data:{user:{id:user}},error:null})},
  rpc:async(name,args)=>{calls.push({name,args});if(options.rpc)return options.rpc(name,args);return {data:name==='sumi_sync_pull'?{version:1,cursor:'0',more:false,records:[]}:{ok:true,records:args.p_changes.map((c,index)=>({kind:c.kind,id:c.id,payload:c.deleted?null:c.payload,deleted:c.deleted,revision:c.baseRevision+1,seq:String(index+1)}))},error:null}},
  storage:{from:bucket=>{assert.equal(bucket,Transport.BUCKET);return {
   upload:async(path,blob,settings)=>{calls.push({name:'upload',path,settings});if(options.upload)return options.upload(path,blob,settings,objects);if(objects.has(path))return {error:{status:400,statusCode:'409'}};objects.set(path,blob);return {data:{path},error:null}},
   download:async path=>{calls.push({name:'download',path});if(options.download)return options.download(path,objects);return objects.has(path)?{data:objects.get(path),error:null}:{error:{status:400,statusCode:'404'}}}
  }}}};
 const logoStore={resolve:async value=>local.get(value)??null,save:async url=>{if(options.save)return options.save(url,local);if(options.inline)return url;const key=await ref(url);local.set(key,url);return key}};
 const decodeImage=async url=>{decodes.push(url);if(options.decode)return options.decode(url);return Upload.inspectBytes(body(url),mime(url))};
 const transport=Transport.create({client,identity,logoStore,decodeImage,assertWritable(){if(locked)throw Error('workspace-locked')}});
 return {transport,client,identity,logoStore,objects,local,calls,decodes,setUser:value=>{user=value},lock:()=>{locked=true}};
}

test('RPC uses SDK, cursor, exact operation payload and an immutable identity assertion',async()=>{
 const h=harness();await h.transport.pull({after:'0',limit:200});const changes=[change('assets/brands/github.svg')];
 await h.transport.push({operationId:OP,changes});
 assert.deepEqual(h.calls,[{name:'sumi_sync_pull',args:{p_after:'0',p_limit:200,p_expected_owner:A}},{name:'sumi_sync_push',args:{p_operation_id:OP,p_changes:changes,p_expected_owner:A}}]);
 assert.equal(JSON.stringify(h.calls).includes('owner_id'),false);
});
test('guest identity, another project, changed account or a locked workspace cannot issue RPC',async()=>{
 const h=harness();
 assert.throws(()=>Transport.create({client:h.client,identity:{mode:'guest'},logoStore:h.logoStore}),/sync-auth/);
 assert.throws(()=>Transport.create({client:h.client,identity:{...h.identity,project:'https://different.supabase.co'},logoStore:h.logoStore}),/sync-auth/);
 h.setUser(B);await assert.rejects(h.transport.pull(),/sync-auth/);assert.equal(h.calls.length,0);
 h.setUser(A);h.lock();await assert.rejects(h.transport.push({operationId:OP,changes:[]}),/sync-auth/);assert.equal(h.calls.length,0);
});
test('identity is checked again after a delayed response',async()=>{
 let h;h=harness({rpc:async()=>{h.setUser(B);return {data:{version:1,cursor:'0',more:false,records:[]},error:null}}});
 await assert.rejects(h.transport.pull(),/sync-auth/);
});
test('an injected identity guard avoids redundant auth requests but still rejects changed identity',async()=>{
 const h=harness();let permitted=true,checks=0;
 h.client.auth.getUser=async()=>{throw Error('should not call getUser')};
 const transport=Transport.create({client:h.client,identity:h.identity,logoStore:h.logoStore,assertIdentity(){checks++;return permitted}});
 await transport.pull();assert.equal(checks,2);permitted=false;await assert.rejects(transport.pull(),/sync-auth/);
});
test('permission, migration and network errors use stable codes without raw server details',async()=>{
 for(const [error,code]of [[{status:401},'sync-auth'],[{code:'42501'},'sync-permission'],[{code:'PGRST202'},'sync-unavailable'],[{name:'TypeError'},'sync-network'],[{message:'private DB error'},'sync-failed']]){
  const h=harness({rpc:async()=>({error})});await assert.rejects(h.transport.pull(),e=>e.code===code&&e.message===code);
 }
});
test('malformed RPC results, unsafe revisions and duplicate record identities are rejected',async()=>{
 const record={...change(''),revision:1,seq:'1'};delete record.baseRevision;
 for(const result of [null,{version:1,cursor:1,more:false,records:[]},{version:1,cursor:'1',more:false,records:[{...record,revision:Number.MAX_SAFE_INTEGER+1}]},{version:1,cursor:'1',more:false,records:[record,record]}]){
  const h=harness({rpc:async()=>({data:result,error:null})});await assert.rejects(h.transport.pull(),/sync-invalid-response/);
 }
 const h=harness();await assert.rejects(h.transport.push({operationId:'not-an-id',changes:[]}),/sync-invalid-response/);await assert.rejects(h.transport.pull({after:'-1'}),/sync-invalid-response/);
});
test('inline image upload verifies bytes, uses private owner/hash path and reads back before business push',async()=>{
 const h=harness(),original=[change()],unchanged=structuredClone(original),expected=await ref(PNG);
 const prepared=await h.transport.beforePush(original);
 assert.deepEqual(original,unchanged);assert.equal(prepared[0].payload.logo,expected);
 assert.deepEqual({...prepared[0].payload,logo:PNG},original[0].payload);
 const uploads=h.calls.filter(call=>call.name==='upload');assert.equal(uploads.length,1);
 assert.equal(uploads[0].path,`${A}/${await hash(PNG)}.png`);assert.deepEqual(uploads[0].settings,{contentType:'image/png',upsert:false,cacheControl:'0'});
 assert.equal(h.calls.at(-1).name,'download');assert.equal(h.calls.some(call=>call.name==='sumi_sync_push'),false);
 await h.transport.push({operationId:OP,changes:prepared});assert.equal(h.calls.at(-1).name,'sumi_sync_push');
 assert.equal(h.decodes.length,2);
});
test('shared images are uploaded once per batch and existing hash references remain identical',async()=>{
 const h=harness(),reference=await ref(PNG);h.local.set(reference,PNG);
 const prepared=await h.transport.prepareUpload([change(reference),{...change(PNG),id:'second',payload:{...change(PNG).payload,id:'second'}}]);
 assert.ok(prepared.every(record=>record.payload.logo===reference));assert.equal(h.calls.filter(call=>call.name==='upload').length,1);
});
test('duplicate upload status is verified by read-back and never overwrites another object',async()=>{
 const h=harness(),path=`${A}/${await hash(PNG)}.png`;h.objects.set(path,new Blob([body(PNG)],{type:'image/png'}));
 await h.transport.beforePush([change()]);assert.equal(h.calls.filter(call=>call.name==='download').length,1);assert.equal(h.calls[0].settings.upsert,false);
 const corrupt=harness({upload:async()=>({error:{status:400,statusCode:'409'}}),download:async()=>({data:new Blob([body(WEBP)],{type:'image/png'})})});
 await assert.rejects(corrupt.transport.beforePush([change()]),/sync-image-invalid/);
});
test('truncated, disguised, oversized or undecodable input never reaches Storage',async()=>{
 for(const value of ['data:image/png;base64,PHN2Zz48L3N2Zz4=','data:image/jpeg;base64,'+PNG.split(',')[1],'data:image/png;base64,'+'A'.repeat(Math.ceil(Transport.MAX_IMAGE_BYTES/3)*4+4)]){
  const h=harness();await assert.rejects(h.transport.beforePush([change(value)]),/sync-image-(invalid|too-large)/);assert.equal(h.calls.length,0);
 }
 const h=harness({decode:async()=>{throw Error('decoder rejected raster')}});await assert.rejects(h.transport.beforePush([change()]),/sync-image-invalid/);assert.equal(h.calls.length,0);
});
test('a stale local reference hash cannot publish substituted image bytes',async()=>{
 const h=harness(),falseRef='sumi-logo:'+'a'.repeat(64);h.local.set(falseRef,PNG);
 await assert.rejects(h.transport.beforePush([change(falseRef)]),/sync-image-invalid/);assert.equal(h.calls.length,0);
});
test('downloading missing local WebP probes only the same owner and persists a verified hash',async()=>{
 const h=harness(),reference=await ref(WEBP);h.objects.set(`${A}/${await hash(WEBP)}.webp`,new Blob([body(WEBP)],{type:'image/webp'}));
 const data={subscriptions:[change(reference).payload],payments:[{id:'pay',amount:12.345,fxSnapshot:{preserve:['all','original','fields']}}],extension:{user:'unchanged'}};
 const original=structuredClone(data),result=await h.transport.beforeApply(data);
 assert.deepEqual(result,data);assert.deepEqual(data,original);assert.equal(h.local.get(reference),WEBP);
 const digest=await hash(WEBP);assert.deepEqual(h.calls.map(call=>call.path),['png','jpg','webp'].map(ext=>`${A}/${digest}.${ext}`));
});
test('IndexedDB failure falls back to verified inline content without changing its wire identity',async()=>{
 const h=harness({inline:true}),reference=await ref(PNG);h.objects.set(`${A}/${await hash(PNG)}.png`,new Blob([body(PNG)],{type:'image/png'}));
 const original={subscriptions:[change(reference).payload],payments:[],categories:['Custom']};
 const local=await h.transport.beforeApply(original);assert.equal(local.subscriptions[0].logo,PNG);assert.equal(original.subscriptions[0].logo,reference);
 const again=await h.transport.beforePush([{...change(),payload:local.subscriptions[0]}]);assert.equal(again[0].payload.logo,reference);
 assert.deepEqual(local.categories,['Custom']);
});
test('wrong downloaded hash or MIME aborts before saving a local snapshot',async()=>{
 let saves=0;
 for(const blob of [new Blob([body(WEBP)],{type:'image/webp'}),new Blob([body(PNG)],{type:'image/jpeg'}),new Blob(['<svg/>'],{type:'image/png'})]){
  const h=harness({download:async()=>({data:blob,error:null}),save:async()=>{saves++}});
  const original={subscriptions:[change(await ref(PNG)).payload],payments:[]};
  await assert.rejects(h.transport.beforeApply(original),/sync-image-invalid/);assert.equal(saves,0);
 }
});
test('missing private objects and denied access never become empty or broken local logos',async()=>{
 const missing=harness(),reference=await ref(PNG),data={subscriptions:[change(reference).payload],payments:[]};
 await assert.rejects(missing.transport.beforeApply(data),/sync-image-missing/);assert.equal(data.subscriptions[0].logo,reference);
 assert.equal(missing.calls.length,3);assert.ok(missing.calls.every(call=>call.path.startsWith(A+'/')));
 const denied=harness({download:async()=>({error:{status:403,message:'other user details must never be shown'}})});
 await assert.rejects(denied.transport.beforeApply(data),error=>error.message==='sync-permission');assert.equal(denied.calls.length,1);
});
test('untrusted reference strings cannot address another owner or traverse Storage paths',async()=>{
 for(const logo of ['sumi-logo:../'+B+'/image.png','sumi-logo:'+B+'/abc','sumi-logo:'+'a'.repeat(63)]){
  const h=harness();await assert.rejects(h.transport.beforePush([change(logo)]),/sync-image-invalid/);assert.equal(h.calls.length,0);
 }
 const h=harness();const records=[{...change(),payload:{...change().payload,owner_id:B}}];
 await h.transport.beforePush(records);assert.ok(h.calls.every(call=>call.path.startsWith(A+'/')));
 assert.equal(records[0].payload.owner_id,B); // Unknown business extension is preserved, never trusted for authorization.
});
test('auth revocation while an image is downloading stops local writes',async()=>{
 let h,saves=0;h=harness({download:async()=>{h.setUser(B);return {data:new Blob([body(PNG)],{type:'image/png'})}},save:async()=>{saves++}});
 await assert.rejects(h.transport.beforeApply({subscriptions:[change(await ref(PNG)).payload],payments:[]}),/sync-auth/);assert.equal(saves,0);
});
test('a logo store returning another hash fails without mutating originals',async()=>{
 const h=harness({save:async()=> 'sumi-logo:'+'b'.repeat(64)}),original=[change(PNG)];
 await assert.rejects(h.transport.prepareDownload(original),/sync-image-storage/);assert.equal(original[0].payload.logo,PNG);
});
test('Storage transport failures are surfaced before business records can be committed',async()=>{
 const h=harness({upload:async()=>{throw new TypeError('offline transport')}});
 await assert.rejects(h.transport.beforePush([change()]),/sync-network/);
 assert.equal(h.calls.filter(call=>call.name==='sumi_sync_push').length,0);
});
test('built-in and external legacy logos are preserved without private image requests',async()=>{
 const h=harness(),records=[change('assets/brands/github.svg'),{...change('https://example.test/custom.png'),id:'legacy-url'}];
 assert.deepEqual(await h.transport.beforePush(records),records);assert.equal(h.calls.length,0);
 const data={subscriptions:records.map(record=>record.payload),payments:[{id:'p',fxSnapshot:{rate:1.2345,convertedAmount:12.35}}]};
 assert.deepEqual(await h.transport.beforeApply(data),data);assert.equal(h.calls.length,0);
});
test('valid EXIF-oriented legacy JPEG retains original bytes and hash when decoded dimensions rotate',async()=>{
 assert.deepEqual(Upload.inspectBytes(body(ORIENTED_JPEG),'image/jpeg'),{mime:'image/jpeg',width:2,height:3});
 const h=harness({decode:async()=>({width:3,height:2})});
 const result=await h.transport.beforePush([change(ORIENTED_JPEG)]);
 assert.equal(result[0].payload.logo,await ref(ORIENTED_JPEG));
 const blob=h.objects.get(`${A}/${await hash(ORIENTED_JPEG)}.jpg`);
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),body(ORIENTED_JPEG));
});
function largeLegacyPNG(){
 // A valid 1x1 PNG with an ancillary tEXt chunk and its real CRC-32.
 // Browsers decode the original image; metadata is kept, never recompressed.
 const payload=Buffer.from('legacy\0'+'x'.repeat(320000)),type=Buffer.from('tEXt');
 const crcBytes=Buffer.concat([type,payload]);let crc=0xffffffff;
 for(const byte of crcBytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 const chunk=Buffer.alloc(payload.length+12);chunk.writeUInt32BE(payload.length,0);type.copy(chunk,4);payload.copy(chunk,8);chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);
 const original=Buffer.from(body(PNG)),combined=Buffer.concat([original.subarray(0,33),chunk,original.subarray(33)]);
 return 'data:image/png;base64,'+combined.toString('base64');
}
test('legacy originals above the compressed-logo threshold synchronize without recompression or loss',async()=>{
 const original=largeLegacyPNG();assert.ok(body(original).length>300000);assert.ok(body(original).length<Transport.MAX_IMAGE_BYTES);
 assert.deepEqual(Upload.inspectBytes(body(original),'image/png'),{mime:'image/png',width:1,height:1});
 const h=harness({save:async()=>{throw Error('legacy image exceeds compressed logo-store envelope')}});
 const wire=await h.transport.beforePush([change(original)]);assert.equal(wire[0].payload.logo,await ref(original));
 const local=await h.transport.beforeApply({subscriptions:[wire[0].payload],payments:[]});assert.equal(local.subscriptions[0].logo,original);
 assert.equal(wire[0].payload.logo,await ref(original));
 assert.deepEqual(new Uint8Array(await h.objects.values().next().value.arrayBuffer()),body(original));
});
test('missing, partial, mismatched and wrong-revision acknowledgements cannot clear a queued operation',async()=>{
 const changes=[change('')],valid={kind:'subscriptions',id:'legacy-id',payload:changes[0].payload,revision:1,deleted:false,seq:'1'};
 for(const records of [[],[{...valid,id:'unrelated'}],[{...valid,revision:2}],[{...valid,payload:{...valid.payload,amount:99}}],[{...valid,deleted:true,payload:null}]]){
  const h=harness({rpc:async()=>({data:{ok:true,records},error:null})});
  await assert.rejects(h.transport.push({operationId:OP,changes}),/sync-invalid-response/);
 }
});
test('pull rejects backwards cursors, empty continuing pages and out-of-window records',async()=>{
 const row={kind:'subscriptions',id:'legacy-id',payload:change('').payload,revision:1,deleted:false,seq:'3'};
 for(const result of [{version:1,cursor:'1',more:false,records:[]},{version:1,cursor:'2',more:true,records:[]},{version:1,cursor:'2',more:false,records:[row]},{version:1,cursor:'3',more:false,records:[{...row,seq:'2'}]}]){
  const h=harness({rpc:async()=>({data:result,error:null})});await assert.rejects(h.transport.pull({after:'2'}),/sync-invalid-response/);
 }
 const h=harness({rpc:async()=>({data:{version:1,cursor:'9007199254740994',more:false,records:[{...row,seq:'9007199254740994'}]},error:null})});
 assert.equal((await h.transport.pull({after:'9007199254740993'})).cursor,'9007199254740994');
});
test('an SDK token change after the guard cannot write A workspace records into B account',async()=>{
 let h;const cloud=[];
 h=harness({rpc:async(name,args)=>{
  // The SDK can fetch its current token asynchronously after the UI guard.
  // Mirror the mandatory SQL identity fence before any cloud mutation.
  h.setUser(B);const serverUid=B;
  if(args.p_expected_owner!==serverUid)return {error:{status:403,code:'42501'}};
  cloud.push({owner:serverUid,changes:args.p_changes});
  return {data:{ok:true,records:[]},error:null};
 }});
 await assert.rejects(h.transport.push({operationId:OP,changes:[change('')]}),/sync-auth|sync-permission/);
 assert.equal(h.calls[0].args.p_expected_owner,A);assert.deepEqual(cloud,[]);
});
