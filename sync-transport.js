/* Per-record Supabase transport. Authentication/refresh stays in the official SDK.
 * No guest, public URL, anonymous fallback, or cloud-side owner supplied by UI. */
const SumiSyncTransport = (() => {
  const BUCKET = 'sumi-private-logos';
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const KINDS = new Set(['subscriptions','payments','costHistory','preferences','extensions']);
  const TYPES = Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'});
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const REFERENCE = /^sumi-logo:([a-f0-9]{64})$/;
  const integerString = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => JSON.stringify(value,(_key,item) => object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
  const hasStatus = (error,status) => Number(error?.status) === status || Number(error?.statusCode) === status;
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  function errorCode(error) {
    if (typeof error?.code === 'string' && error.code.startsWith('sync-')) return error.code;
    if (hasStatus(error,401) || ['PGRST301','PGRST302','bad_jwt','session_not_found'].includes(error?.code)) return 'sync-auth';
    if (hasStatus(error,403) || error?.code === '42501') return 'sync-permission';
    if (['PGRST202','PGRST205','42P01','42883'].includes(error?.code)) return 'sync-unavailable';
    if (['TypeError','AbortError','AuthRetryableFetchError'].includes(error?.name) || ['TypeError','AbortError'].includes(error?.originalError?.name) || hasStatus(error,0)) return 'sync-network';
    return 'sync-failed';
  }
  function checkRecords(records, changes = false) {
    if (!Array.isArray(records)) fail('sync-invalid-response');
    const seen = new Set();
    for (const record of records) {
      if (!object(record) || !KINDS.has(record.kind) || typeof record.id !== 'string' || !record.id.length || record.id.length > 200
        || typeof record.deleted !== 'boolean' || (!record.deleted && !object(record.payload))) fail('sync-invalid-response');
      const key = JSON.stringify([record.kind,record.id]);
      if (seen.has(key)) fail('sync-invalid-response');
      seen.add(key);
      if (changes) {
        if (!Number.isSafeInteger(record.baseRevision) || record.baseRevision < 0) fail('sync-invalid-response');
      } else if (!Number.isSafeInteger(record.revision) || record.revision < 0 || !integerString(record.seq)) fail('sync-invalid-response');
    }
    return records;
  }
  async function defaultDecode(url, environment) {
    if (typeof environment.Image !== 'function') fail('sync-image-invalid');
    return new Promise((resolve,reject) => {
      const image = new environment.Image();
      const finish = (error) => {
        clearTimeout(timer); image.onload = image.onerror = null;
        const size = {width:image.naturalWidth,height:image.naturalHeight};
        image.src = '';
        if (error) reject(error); else resolve(size);
      };
      const timer = setTimeout(() => finish(new Error('sync-image-invalid')),10000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error('sync-image-invalid'));
      image.src = url;
    });
  }
  function create({client,identity,logoStore,assertIdentity,assertWritable = () => {},decodeImage,
    environment = globalThis,inspectBytes = typeof SumiLogoUpload !== 'undefined' ? SumiLogoUpload.inspectBytes : null} = {}) {
    if (!identity || identity.mode !== 'account' || !UUID.test(identity.userId || '') || !client?.rpc || !client?.storage?.from
      || !logoStore?.resolve || !logoStore?.save) fail('sync-auth');
    const owner = identity.userId.toLowerCase();
    // Selectors come from the pinned workspace, never from a downloaded record.
    if (client.supabaseUrl && identity.project) {
      try { if (new URL(client.supabaseUrl).origin !== new URL(identity.project).origin) fail('sync-auth'); }
      catch { fail('sync-auth'); }
    }
    const storage = client.storage.from(BUCKET);
    const verifiedUploads = new Set();
    const knownExtensions = new Map();
    const inspect = inspectBytes || (typeof require === 'function' ? require('./logo-upload.js').inspectBytes : null);
    async function guard() {
      try {
        assertWritable();
        if (assertIdentity) {
          const result = await assertIdentity();
          if (result === false || (result?.id && result.id.toLowerCase() !== owner)) fail('sync-auth');
        } else {
          const result = await client.auth.getUser();
          if (result.error) fail(errorCode(result.error));
          if (result.data?.user?.id?.toLowerCase() !== owner) fail('sync-auth');
        }
      } catch (error) { fail(error?.code?.startsWith('sync-') ? error.code : 'sync-auth'); }
    }
    async function request(run) {
      await guard();
      try {
        const result = await run();
        await guard();
        if (!result || result.error) fail(errorCode(result?.error));
        return result.data;
      } catch (error) { fail(errorCode(error)); }
    }
    // The server compares this pinned identity with auth.uid() before reading
    // or writing. It still derives ownership from the JWT, never this argument.
    // This fences an SDK token change occurring after our client-side guard.
    async function pull({after = '0',limit = 500} = {}) {
      if (!integerString(String(after)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) fail('sync-invalid-response');
      const result = await request(() => client.rpc('sumi_sync_pull',{p_after:String(after),p_limit:limit,p_expected_owner:owner}));
      if (!object(result) || result.version !== 1 || !integerString(result.cursor) || typeof result.more !== 'boolean') fail('sync-invalid-response');
      checkRecords(result.records);
      if (BigInt(result.cursor) < BigInt(after) || result.records.length > limit
        || (result.more && (!result.records.length || BigInt(result.cursor) <= BigInt(after)))) fail('sync-invalid-response');
      let previous = BigInt(after);
      for (const record of result.records) {
        const sequence = BigInt(record.seq);
        if (sequence <= previous || sequence > BigInt(result.cursor)) fail('sync-invalid-response');
        previous = sequence;
      }
      return structuredClone(result);
    }
    async function push({operationId,changes} = {}) {
      if (!UUID.test(operationId || '')) fail('sync-invalid-response');
      checkRecords(changes,true);
      const result = await request(() => client.rpc('sumi_sync_push',{p_operation_id:operationId,p_changes:structuredClone(changes),p_expected_owner:owner}));
      if (!object(result) || typeof result.ok !== 'boolean') fail('sync-invalid-response');
      if (result.ok) {
        checkRecords(result.records);
        if (result.records.length !== changes.length) fail('sync-invalid-response');
        const acknowledged = new Map(result.records.map(record=>[JSON.stringify([record.kind,record.id]),record]));
        for (const change of changes) {
          const record = acknowledged.get(JSON.stringify([change.kind,change.id]));
          if (!record || record.revision !== change.baseRevision+1 || record.deleted !== change.deleted
            || canonical(record.payload) !== canonical(change.deleted ? null : change.payload)) fail('sync-invalid-response');
        }
      }
      else if (!Array.isArray(result.conflicts)) fail('sync-invalid-response');
      return structuredClone(result);
    }
    const digest = async bytes => Array.from(new Uint8Array(await environment.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    function dataURL(bytes,mime) {
      let binary = '';
      for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start,start+8192));
      return `data:${mime};base64,${btoa(binary)}`;
    }
    async function validate(bytes,mime,expectedHash = null) {
      if (!(bytes instanceof Uint8Array) || !bytes.length || !Object.hasOwn(TYPES,mime)) fail('sync-image-invalid');
      if (bytes.length > MAX_IMAGE_BYTES) fail('sync-image-too-large');
      let dimensions;
      try { dimensions = inspect(bytes,mime); }
      catch { fail('sync-image-invalid'); }
      const hash = await digest(bytes);
      if (expectedHash && hash !== expectedHash) fail('sync-image-invalid');
      const url = dataURL(bytes,mime);
      let decoded;
      try { decoded = await (decodeImage ? decodeImage(url) : defaultDecode(url,environment)); }
      catch { fail('sync-image-invalid'); }
      // EXIF orientation may swap display width/height without changing the
      // raster's validated byte dimensions or its content hash.
      const same = decoded?.width === dimensions.width && decoded?.height === dimensions.height;
      const rotated = decoded?.width === dimensions.height && decoded?.height === dimensions.width;
      if (!same && !rotated) fail('sync-image-invalid');
      return {hash,mime,bytes,url,reference:'sumi-logo:'+hash,extension:TYPES[mime]};
    }
    async function parse(source,expectedHash = null) {
      if (typeof source !== 'string' || source.length > Math.ceil(MAX_IMAGE_BYTES/3)*4+40) fail('sync-image-too-large');
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
      if (!match || match[2].length % 4 !== 0) fail('sync-image-invalid');
      let bytes;
      try { bytes = Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0)); }
      catch { fail('sync-image-invalid'); }
      return validate(bytes,match[1],expectedHash);
    }
    const path = (hash,extension) => `${owner}/${hash}.${extension}`;
    const missing = error => hasStatus(error,404)
      || ['not_found','NoSuchKey'].includes(error?.code);
    async function readObject(hash,extension) {
      await guard();
      let result;
      try { result = await storage.download(path(hash,extension)); }
      catch (error) { fail(errorCode(error)); }
      await guard();
      if (result?.error) { if (missing(result.error)) return null; fail(errorCode(result.error)); }
      const blob = result?.data;
      if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1) fail('sync-image-invalid');
      if (blob.size > MAX_IMAGE_BYTES) fail('sync-image-too-large');
      if (!Object.hasOwn(TYPES,blob.type) || TYPES[blob.type] !== extension) fail('sync-image-invalid');
      let bytes;
      try { bytes = new Uint8Array(await blob.arrayBuffer()); }
      catch { fail('sync-image-invalid'); }
      if (bytes.length !== blob.size) fail('sync-image-invalid');
      const asset = await validate(bytes,blob.type,hash);
      knownExtensions.set(hash,extension);
      return asset;
    }
    async function download(hash) {
      const known = knownExtensions.get(hash);
      const extensions = [...new Set([known,...Object.values(TYPES)].filter(Boolean))];
      for (const extension of extensions) {
        const asset = await readObject(hash,extension);
        if (asset) return asset;
      }
      fail('sync-image-missing');
    }
    async function upload(asset) {
      if (verifiedUploads.has(asset.hash)) return;
      await guard();
      let result;
      try { result = await storage.upload(path(asset.hash,asset.extension),new Blob([asset.bytes],{type:asset.mime}),
        {contentType:asset.mime,upsert:false,cacheControl:'0'}); }
      catch (error) { fail(errorCode(error)); }
      await guard();
      if (result?.error && !hasStatus(result.error,409) && result.error.code !== 'Duplicate') fail(errorCode(result.error));
      // Both new and duplicate uploads must read back exact immutable bytes.
      // Never accept a conflict response as proof that the required image exists.
      const read = await readObject(asset.hash,asset.extension);
      if (!read || read.mime !== asset.mime || read.bytes.length !== asset.bytes.length) fail('sync-image-invalid');
      verifiedUploads.add(asset.hash);
    }
    async function prepareUpload(records) {
      await guard();
      // Deduplicate within a batch only; a later run must recheck Storage even
      // if another device/admin has removed an object since the previous ACK.
      verifiedUploads.clear();
      const copy = structuredClone(records);
      if (!Array.isArray(copy)) fail('sync-invalid-response');
      const prepared = new Map();
      for (const record of copy) {
        if (record?.kind !== 'subscriptions' || record.deleted || !record.payload) continue;
        const source = record.payload.logo;
        if (typeof source === 'string' && source.startsWith('sumi-logo:') && !REFERENCE.test(source)) fail('sync-image-invalid');
        if (typeof source !== 'string' || (!REFERENCE.test(source) && !source.startsWith('data:'))) continue;
        if (prepared.has(source)) { record.payload.logo = prepared.get(source); continue; }
        let asset;
        if (REFERENCE.test(source)) {
          const hash = REFERENCE.exec(source)[1];
          const local = await logoStore.resolve(source);
          // A previously synced image can survive local IndexedDB eviction.
          asset = local ? await parse(local,hash) : await download(hash);
        } else asset = await parse(source);
        await upload(asset);
        prepared.set(source,asset.reference);record.payload.logo = asset.reference;
      }
      await guard();
      return copy;
    }
    async function prepareDownload(records) {
      await guard();
      const copy = structuredClone(records);
      if (!Array.isArray(copy)) fail('sync-invalid-response');
      const hydrated = new Map();
      for (const record of copy) {
        if (record?.kind !== 'subscriptions' || record.deleted || !record.payload) continue;
        const source = record.payload.logo;
        if (typeof source === 'string' && source.startsWith('sumi-logo:') && !REFERENCE.test(source)) fail('sync-image-invalid');
        if (typeof source !== 'string' || (!REFERENCE.test(source) && !source.startsWith('data:'))) continue;
        if (hydrated.has(source)) { record.payload.logo = hydrated.get(source); continue; }
        let asset;
        if (REFERENCE.test(source)) {
          const hash = REFERENCE.exec(source)[1], local = await logoStore.resolve(source);
          asset = local ? await parse(local,hash) : await download(hash);
        } else asset = await parse(source);
        await guard();
        let saved;
        try { saved = await logoStore.save(asset.url); }
        catch { saved = asset.url; }
        await guard();
        if (saved !== asset.reference && saved !== asset.url) fail('sync-image-storage');
        // A legacy original may exceed the logo store's compressed-file limit,
        // or IDB may be unavailable. Keep the verified original inline locally;
        // the caller's atomic business commit still handles local quota failure.
        if (saved === asset.reference) {
          const durable = await logoStore.resolve(saved);
          if (!durable) fail('sync-image-storage');
          await parse(durable,asset.hash);
        }
        hydrated.set(source,saved);record.payload.logo = saved;
      }
      return copy;
    }
    async function beforeApply(data) {
      if (!object(data) || !Array.isArray(data.subscriptions)) fail('sync-invalid-response');
      const copy = structuredClone(data);
      const records = await prepareDownload(copy.subscriptions.map(value=>({kind:'subscriptions',id:value.id,payload:value,deleted:false})));
      copy.subscriptions = records.map(record=>record.payload);
      return copy;
    }
    return Object.freeze({pull,push,beforePush:prepareUpload,beforeApply,prepareUpload,prepareDownload});
  }
  return Object.freeze({create,errorCode,BUCKET,MAX_IMAGE_BYTES});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SumiSyncTransport;
