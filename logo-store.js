/* Custom images live independently of billing records. A reference is returned
 * only after the IndexedDB transaction commits; failure keeps an inline copy. */
const SumiLogoStore = (() => {
  const DB_NAME = 'sumi-logo-assets-v1';
  const STORE_NAME = 'logos';
  const PREFIX = 'sumi-logo:';
  const isReference = value => typeof value === 'string' && /^sumi-logo:[a-f0-9]{64}$/.test(value);
  const MISSING_MESSAGE = '自定义图标无法读取，备份已停止。请恢复图标或移除缺失图标后重试。';
  const INVALID_MESSAGE = '自定义图标数据无效，请重新上传。';

  function create(options = {}) {
    const environment = options.environment || globalThis;
    const timeout = options.timeout ?? 8000;
    let database = null, opening = null;
    const cache = new Map(), pending = new Map();
    const remember = (key, value) => {
      cache.delete(key); cache.set(key, value);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      return value;
    };
    function open() {
      if (database) return Promise.resolve(database);
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        let request, settled = false;
        const finish = (error, result) => {
          if (settled) { if (result) result.close(); return; }
          settled = true; clearTimeout(timer);
          if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => finish(new Error('logo-db-timeout')), timeout);
        try { request = environment.indexedDB.open(options.dbName || DB_NAME, 1); }
        catch (error) { finish(error); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath:'id'});
        };
        request.onerror = () => finish(request.error || new Error('logo-db-open'));
        request.onblocked = () => finish(new Error('logo-db-blocked'));
        request.onsuccess = () => finish(null, request.result);
      }).then(db => {
        database = db;
        db.onversionchange = () => { db.close(); database = null; };
        db.onclose = () => { if (database === db) database = null; };
        return db;
      }).finally(() => { opening = null; });
      return opening;
    }
    async function transaction(mode, run) {
      const db = await open();
      if (mode === 'readwrite') options.assertWritable?.();
      return new Promise((resolve, reject) => {
        let tx, result, settled = false;
        const finish = error => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => {
          finish(new Error('logo-db-timeout'));
          try { tx?.abort(); } catch { /* A transaction may have already settled. */ }
        }, timeout);
        try {
          tx = db.transaction(STORE_NAME, mode);
          const request = run(tx.objectStore(STORE_NAME));
          request.onsuccess = () => { result = request.result; };
          request.onerror = () => finish(request.error || new Error('logo-db-request'));
          tx.oncomplete = () => finish();
          tx.onabort = tx.onerror = () => finish(tx.error || new Error('logo-db-transaction'));
        } catch (error) { finish(error); }
      });
    }
    function parse(value) {
      if (typeof value !== 'string' || value.length > 400050) throw new Error(INVALID_MESSAGE);
      const match = /^data:(image\/(?:png|jpeg|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(value);
      if (!match || !match[2]) throw new Error(INVALID_MESSAGE);
      const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
      if (bytes.length > 300000) throw new Error(INVALID_MESSAGE);
      return {mime:match[1], bytes};
    }
    async function hash(bytes) {
      const digest = await environment.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('');
    }
    async function save(dataURL) {
      const {mime, bytes} = parse(dataURL);
      try {
        const id = await hash(bytes);
        const blob = new Blob([bytes], {type:mime});
        await transaction('readwrite', store => store.put({id,version:1,blob,createdAt:new Date().toISOString()}));
        // Deliberately do not memoize writes: subsequent reads verify durability.
        cache.delete(PREFIX + id);
        return PREFIX + id;
      } catch {
        // The caller persists the inline image with the subscription using its
        // normal transactional localStorage path; no reference was committed.
        return dataURL;
      }
    }
    async function readReference(value) {
      try {
        const record = await transaction('readonly', store => store.get(value.slice(PREFIX.length)));
        if (!record || record.id !== value.slice(PREFIX.length) || record.version !== 1
          || !(record.blob instanceof Blob) || record.blob.size < 1 || record.blob.size > 300000
          || !['image/png','image/jpeg','image/webp'].includes(record.blob.type)) return null;
        const bytes = new Uint8Array(await record.blob.arrayBuffer());
        if (await hash(bytes) !== record.id) return null;
        // Chunked encoding avoids argument limits on larger uploaded logos.
        let binary = '';
        for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start,start+8192));
        return `data:${record.blob.type};base64,${btoa(binary)}`;
      } catch { return null; }
    }
    async function resolve(value) {
      if (!isReference(value)) return typeof value === 'string' ? value : null;
      if (cache.has(value)) return remember(value, cache.get(value));
      if (pending.has(value)) return pending.get(value);
      const promise = readReference(value).then(result => result ? remember(value,result) : null).finally(() => pending.delete(value));
      pending.set(value,promise);
      return promise;
    }
    async function hydrateBackup(data) {
      const copy = structuredClone(data), references = new Set();
      function collect(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key,item] of Object.entries(value)) {
          if (key === 'logo' && isReference(item)) references.add(item);
          else if (item && typeof item === 'object') collect(item);
        }
      }
      collect(copy);
      const embedded = new Map();
      // Read from durable storage instead of the UI cache: never export an
      // apparently complete backup after the asset database was cleared.
      for (const reference of references) {
        const value = await readReference(reference);
        if (!value) throw new Error(MISSING_MESSAGE);
        embedded.set(reference,value);
      }
      function replace(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key,item] of Object.entries(value)) {
          if (key === 'logo' && embedded.has(item)) value[key] = embedded.get(item);
          else if (item && typeof item === 'object') replace(item);
        }
      }
      replace(copy);
      return copy;
    }
    async function prepareImport(data) {
      const copy = structuredClone(data);
      if (!Array.isArray(copy?.subscriptions)) return copy;
      const prepared = new Map();
      // Reject dangling references before writing any new imported assets.
      // Extensions, payment records and user notes are not asset containers.
      for (const subscription of copy.subscriptions) {
        const logo = subscription?.logo;
        if (isReference(logo) && !prepared.has(logo)) {
          if (!await readReference(logo)) throw new Error(MISSING_MESSAGE);
          prepared.set(logo,logo);
        }
      }
      let inlineFallback = false;
      for (const subscription of copy.subscriptions) {
        const logo = subscription?.logo;
        if (prepared.has(logo)) { subscription.logo = prepared.get(logo); continue; }
        if (inlineFallback || typeof logo !== 'string' || !logo.startsWith('data:image/')) continue;
        // The import schema accepts older embedded files. Only move payloads
        // that meet the current asset envelope; never recompress or discard an
        // older/larger image as a side effect of restoring a backup.
        try { parse(logo); } catch { continue; }
        const value = await save(logo);
        prepared.set(logo,value);
        subscription.logo = value;
        // If storage is unavailable, keep remaining images inline rather than
        // repeating the same blocked operation once per imported subscription.
        if (!isReference(value)) inlineFallback = true;
      }
      return copy;
    }
    function close() {
      if (database) database.close();
      database = null; cache.clear();
    }
    return Object.freeze({save,resolve,hydrateBackup,prepareImport,isReference,close});
  }
  return Object.freeze({...create(),create,DB_NAME,STORE_NAME,isReference});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiLogoStore;
