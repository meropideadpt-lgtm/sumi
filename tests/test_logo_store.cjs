const test = require('node:test');
const assert = require('node:assert/strict');
const Logo = require('../logo-store.js');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

function harness(mode = 'ok') {
  const records = new Map();
  const counts = {reads:0,writes:0,opens:0,commits:0};
  let initialized = false;
  const database = {
    objectStoreNames:{contains:() => initialized},
    createObjectStore:() => { initialized = true; },
    close() {},
    transaction(_name, access) {
      const tx = {abort() { tx.onabort?.(); }};
      tx.objectStore = () => ({
        get: id => request('get',id),
        put: record => request('put',record)
      });
      function request(action, value) {
        const req = {};
        queueMicrotask(() => {
          if (action === 'get') { counts.reads++; req.result = records.get(value); }
          else { counts.writes++; req.result = value.id; }
          req.onsuccess?.();
          // An IDB request can succeed before its transaction eventually fails.
          setTimeout(() => {
            if (access === 'readwrite' && mode === 'abort') {
              tx.error = new Error('quota'); tx.onabort?.(); return;
            }
            if (action === 'put') records.set(value.id,value);
            counts.commits++; tx.oncomplete?.();
          },5);
        });
        return req;
      }
      return tx;
    }
  };
  const environment = {crypto:globalThis.crypto,indexedDB:{
    open() {
      counts.opens++;
      if (mode === 'unavailable') throw Error('SecurityError');
      const req = {};
      queueMicrotask(() => {
        if (mode === 'blocked') { req.onblocked?.(); return; }
        if (mode === 'timeout') return;
        req.result = database;
        if (!initialized) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  }};
  return {store:Logo.create({environment,timeout:50}),records,counts,environment};
}

test('logo references use a narrow lowercase content hash scheme', () => {
  assert.equal(Logo.isReference('sumi-logo:'+'a'.repeat(64)),true);
  for (const value of ['',null,'sumi-logo:../image','sumi-logo:'+'A'.repeat(64),'sumi-logo:'+'a'.repeat(63),'https://example.com/logo']) assert.equal(Logo.isReference(value),false);
});

test('a durable asset reference is returned only after transaction completion', async () => {
  const {store,records,counts} = harness();
  const result = await store.save(PNG);
  assert.equal(Logo.isReference(result),true);
  assert.equal(counts.commits,1);
  assert.equal(records.size,1);
  assert.equal(await store.resolve(result),PNG);
  assert.equal(counts.reads,1);
  assert.equal(await store.save(PNG),result,'identical bytes share an asset key');
  assert.equal(records.size,1);
});

test('request success followed by transaction abort retains the inline image', async () => {
  const {store,records,counts} = harness('abort');
  assert.equal(await store.save(PNG),PNG);
  assert.equal(counts.writes,1);
  assert.equal(records.size,0);
});

test('unavailable blocked or unresponsive IndexedDB preserves a usable inline fallback', async () => {
  for (const mode of ['unavailable','blocked','timeout']) {
    const {store} = harness(mode);
    assert.equal(await store.save(PNG),PNG,mode);
  }
  const {environment} = harness();
  environment.crypto = null;
  assert.equal(await Logo.create({environment}).save(PNG),PNG);
});

test('old data URLs and brand or remote image paths pass through unchanged without migration', async () => {
  const {store,counts} = harness();
  for (const logo of [PNG,'assets/brands/netflix.svg','https://example.com/logo.png','']) assert.equal(await store.resolve(logo),logo);
  assert.equal(counts.opens,0);
});

test('concurrent reads deduplicate and valid images are bounded-cache reusable', async () => {
  const {store,counts} = harness();
  const reference = await store.save(PNG);
  assert.deepEqual(await Promise.all([store.resolve(reference),store.resolve(reference)]),[PNG,PNG]);
  assert.equal(counts.reads,1);
  assert.equal(await store.resolve(reference),PNG);
  assert.equal(counts.reads,1);
});

test('a portable backup embeds custom images without touching business data or input objects', async () => {
  const {store} = harness();
  const reference = await store.save(PNG);
  const data = {subscriptions:[{id:'one',logo:reference,amount:10,currency:'USD'},{id:'two',logo:PNG}],payments:[{amount:12.12345,fxSnapshot:{rate:7,convertedAmount:84.86}}],extra:{logo:reference,note:reference}};
  const original = JSON.stringify(data), copy = await store.hydrateBackup(data);
  assert.equal(JSON.stringify(data),original);
  assert.equal(copy.subscriptions[0].logo,PNG);
  assert.equal(copy.extra.logo,PNG);
  assert.equal(copy.extra.note,reference);
  assert.deepEqual(copy.payments,data.payments);
  assert.equal(copy.subscriptions[0].amount,10);
});

test('missing or corrupt images resolve neutrally and stop export instead of silent data loss', async () => {
  const {store,records} = harness();
  const reference = await store.save(PNG);
  assert.equal(await store.resolve(reference),PNG);
  records.clear();
  await assert.rejects(store.hydrateBackup({subscriptions:[{logo:reference}]}),/备份已停止/,'backup bypasses in-memory UI cache');
  store.close();
  assert.equal(await store.resolve(reference),null);
  const result = await store.save(PNG), record = records.get(result.slice(10));
  record.blob = new Blob(['wrong contents'],{type:'image/png'});
  assert.equal(await store.resolve(result),null);
  await assert.rejects(store.hydrateBackup({logo:result}),/备份已停止/);
});

test('invalid or excessive inline input does not create an asset or unsafe fallback', async () => {
  const {store,counts} = harness();
  for (const value of ['data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)',null,'data:image/png;base64,!','data:image/png;base64,','data:image/png;base64,'+'A'.repeat(400004)]) await assert.rejects(store.save(value),/图标数据无效/);
  assert.equal(counts.opens,0);
});

test('database version changes close connections and subsequent operations reopen safely', async () => {
  const {store,counts} = harness();
  const reference = await store.save(PNG);
  store.close();
  assert.equal(await store.resolve(reference),PNG);
  assert.equal(counts.opens,2);
});

function paddedPNG(index, payloadSize = 100000) {
  // A real ancillary PNG text chunk makes distinct portable images large
  // enough to expose localStorage expansion without changing their pixels.
  const image = Buffer.from(PNG.split(',')[1],'base64');
  const text = Buffer.from('comment\0'+String(index).padEnd(payloadSize,'x'));
  const chunk = Buffer.alloc(text.length+12);
  chunk.writeUInt32BE(text.length); chunk.write('tEXt',4); text.copy(chunk,8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4,-4)) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0,chunk.length-4);
  return 'data:image/png;base64,'+Buffer.concat([image.subarray(0,-12),chunk,image.subarray(-12)]).toString('base64');
}

test('many-logo portable import commits images to IndexedDB before compact subscription references', async () => {
  const {store,records,counts} = harness();
  const data = {subscriptions:Array.from({length:48},(_,index)=>({id:String(index),amount:index+0.25,currency:'USD',logo:paddedPNG(index)})),payments:[{amount:12.12345,fxSnapshot:{rate:7,convertedAmount:84.86}}],extra:{logo:PNG}};
  const original = JSON.stringify(data);
  assert.ok(original.length > 6*1024*1024,'portable backup exceeds usual localStorage budget');
  const imported = await store.prepareImport(data);
  assert.equal(records.size,48);
  assert.equal(counts.commits,48);
  assert.ok(imported.subscriptions.every(record=>Logo.isReference(record.logo)));
  assert.ok(JSON.stringify(imported).length < 15000);
  assert.equal(JSON.stringify(data),original);
  assert.deepEqual(imported.payments,data.payments);
  assert.equal(imported.extra.logo,PNG,'unknown extension fields stay exactly unchanged');
  const exported = await store.hydrateBackup(imported);
  assert.equal(JSON.stringify(exported),original,'original image bytes and accounting records survive the round trip');
});

test('import deduplicates repeated assets and preserves all inline images when IndexedDB is unavailable', async () => {
  const data = {subscriptions:[{logo:PNG},{logo:PNG},{logo:paddedPNG(2)}],payments:[{logo:PNG}]};
  const success = harness();
  const imported = await success.store.prepareImport(data);
  assert.equal(success.counts.writes,2);
  assert.equal(imported.subscriptions[0].logo,imported.subscriptions[1].logo);
  assert.equal(imported.payments[0].logo,PNG);
  for (const mode of ['unavailable','abort','blocked']) {
    const {store,counts} = harness(mode);
    assert.deepEqual(await store.prepareImport(data),data);
    assert.equal(counts.opens,1,'fallback does not retry for every image');
  }
});

test('import leaves larger legacy logos unchanged and validates existing references durably', async () => {
  const {store,records} = harness();
  const large = paddedPNG(1,320000);
  const reference = await store.save(PNG);
  const data = {subscriptions:[{logo:large},{logo:reference},{logo:'assets/brands/netflix.svg'}],unknown:{logo:reference}};
  assert.deepEqual(await store.prepareImport(data),data);
  assert.equal(await store.resolve(reference),PNG);
  records.clear();
  await assert.rejects(store.prepareImport(data),/备份已停止/);
  assert.equal(data.subscriptions[0].logo,large);
});
