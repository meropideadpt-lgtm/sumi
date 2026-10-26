const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const I18n=require('../i18n.js');
const View=require('../sync-view.js');
const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../locales/sync.js'),'utf8'),context);
const messages=context.SumiMessages;
const view=(language='en')=>View.create({i18n:I18n.create({messages,language})});
const counts={subscriptions:2,payments:3,costHistory:4,preferences:4,extensions:1,images:1};

test('all sync resources have four complete languages and matching placeholders',()=>{
  assert(Object.keys(messages).length>40);
  for(const [key,row]of Object.entries(messages))for(const language of I18n.languages){
    assert.equal(typeof row[language],'string',key+' '+language);assert(row[language].trim());
    const placeholders=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(placeholders(row[language]),placeholders(row['zh-CN']),key+' '+language);
  }
});
test('guest markup has no private actions or invented cloud counts in every language',()=>{
  for(const language of I18n.languages){
    const html=view(language).markup({guest:true});
    assert.match(html,/id="syncPanel"/);assert(!html.includes('data-sync-action'));assert(!html.includes('sync-counts'));assert(!html.includes('undefined'));
  }
});
test('first enable offers both explicit directions only after counts have been read',()=>{
  const ui=view();const before=ui.markup({status:'disabled',pending:0});
  assert.match(before,/data-sync-action="inspect"/);assert(!before.includes('data-sync-action="upload"'));
  const preview=ui.markup({preview:{id:'preview-safe',localCounts:counts,cloudCounts:{...counts,subscriptions:0},differences:2}});
  assert.match(preview,/data-sync-action="upload" data-sync-preview="preview-safe"/);
  assert.match(preview,/data-sync-action="restore" data-sync-preview="preview-safe"/);
  assert.match(preview,/Records missing locally never delete cloud data/);
  assert.match(preview,/Guest data and cloud records are never deleted/);
  assert.match(ui.markup({preview:{id:'pending',localCounts:{},cloudCounts:{}}}),/Not checked/);
});
test('all sync statuses and unknown error responses have stable translated fallbacks',()=>{
  for(const language of I18n.languages)for(const status of ['disabled','synced','syncing','offline','error','conflict','paused']){
    const html=view(language).markup({status,error:'raw private exception token=secret'});
    assert(!html.includes('undefined'));assert(!html.includes('token=secret'));assert(!html.includes('sync.status.'));
  }
  assert.equal(View.errorKey('network'),'network');assert.equal(View.errorKey('migration-missing'),'setup');
  assert.equal(View.errorKey('image-hash-mismatch'),'image');assert.equal(View.errorKey('private SQL statement'),'generic');
});
test('conflicts expose complete unrounded versions as escaped text and never mutate data',()=>{
  const original={id:'group"<script>',records:[{kind:'payments',id:'id"<img>',local:{name:'<svg onload=alert(1)>',amount:3.123456789,fxSnapshot:{rate:7.8123456789,convertedAmount:24.3981481515}},remote:{amount:99.875}}]};
  const before=JSON.stringify(original);const html=view().markup({status:'conflict',conflicts:[original],hasBackup:true});
  assert.match(html,/3\.123456789/);assert.match(html,/7\.8123456789/);assert.match(html,/24\.3981481515/);assert.match(html,/99\.875/);
  assert(!html.includes('<script>'));assert(!html.includes('<svg onload'));assert.match(html,/&lt;svg onload/);assert.match(html,/data-sync-action="exportBackup"/);
  assert.equal(JSON.stringify(original),before);
});
test('financial and parent-deletion constraints cannot offer unsafe local overwrite',()=>{
  for(const reason of ['paid-cycle','parent-deleted','dependent-records']){
    const html=view().markup({status:'conflict',conflicts:[{id:'group',reason,records:[{kind:'payments',id:'legacy-id',local:{amount:10},remote:null,remoteDeleted:true}]}]});
    assert.match(html,/data-sync-action="local"[^>]*disabled/);assert.doesNotMatch(html,/data-sync-action="remote"[^>]*disabled/);
    assert.match(html,/Deleted/);
  }
});
test('pending counts and success time are localized and invalid time does not look successful',()=>{
  const ui=view('en');assert.match(ui.markup({enabled:true,status:'synced',pending:1234,lastSuccess:'2026-10-25T12:34:00Z'}),/1,234/);
  assert.match(ui.markup({lastSuccess:'invalid'}),/Not synced yet/);
  assert.match(ui.markup({pending:-10}),/Not checked/);
});

test('older translator without dateTime still renders a valid localized success time',()=>{
  const {dateTime,...older}=I18n.create({messages,language:'ja-JP'});
  assert.doesNotThrow(()=>View.create({i18n:older}).markup({lastSuccess:'2026-10-25T12:34:00Z'}));
  assert.match(View.create({i18n:older}).markup({lastSuccess:'2026-10-25T12:34:00Z'}),/2026/);
  for(const code of ['sync-local-changed','sync-preview-stale'])assert.equal(View.errorKey(code),'changed');
  assert.equal(View.errorKey('sync-locked'),'auth');
});
