/* The generated manifest binds an entire static release to one cache. */
importScripts('./sw-assets.js');
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `sumi-shell:${new URL(SCOPE).pathname}:`;
const CACHE_NAME = CACHE_PREFIX + self.SUMI_ASSET_VERSION;
const ASSETS = new Map(self.SUMI_ASSETS.map(asset => [new URL(asset.url, SCOPE).href, asset]));
const INDEX_URL = new URL('index.html', SCOPE).href;
const inScope = url => url.origin === new URL(SCOPE).origin && url.pathname.startsWith(new URL(SCOPE).pathname);

async function installRelease() {
  // Never populate an older release with responses from a partially deployed one.
  const existed = (await caches.keys()).includes(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  try {
    // A small pool avoids flooding mobile connections with 70+ parallel requests.
    const pending = [...ASSETS];
    let failure = null;
    await Promise.all(Array.from({length: 6}, async () => {
      while (pending.length && !failure) {
        try {
          const [url, asset] = pending.shift();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          let response, bytes;
          try {
            response = await fetch(new Request(url, {cache: 'reload', credentials: 'same-origin', signal: controller.signal}));
            if (!response.ok || response.type === 'opaque') throw new Error('Static asset unavailable');
            bytes = await response.clone().arrayBuffer();
          } finally { clearTimeout(timeout); }
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
          if (actual !== asset.revision) throw new Error('Inconsistent static release');
          await cache.put(url, response);
        } catch (error) { failure = error; }
      }
    }));
    if (failure) throw failure;
  } catch (error) {
    // Cache names include the worker and asset hashes. A failed new installation
    // cannot overwrite or remove the active release.
    if (!existed) await caches.delete(CACHE_NAME);
    throw error;
  }
}
self.addEventListener('install', event => event.waitUntil(installRelease()));
self.addEventListener('activate', event => {
  // No clients.claim(): the first page retains its original loading lifecycle.
  // Remove obsolete shell caches only when no app window can still need them.
  // Never touch unrelated caches, localStorage, IndexedDB logos or FX data.
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({type: 'window', includeUncontrolled: true}))
      .filter(client => inScope(new URL(client.url)));
    if (!windows.length) await Promise.all((await caches.keys())
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!inScope(url)) return;
  url.search = '';
  url.hash = '';
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
      (await cache.match(INDEX_URL)) || fetch(request)));
  } else if (ASSETS.has(url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
      (await cache.match(url.href)) || fetch(request)));
  }
  // External requests (including Frankfurter), backups and uploads are never
  // intercepted. Their existing validation and failure handling remain intact.
});
self.addEventListener('message', event => {
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (event.data?.type === 'SUMI_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const ready = (await Promise.all([...ASSETS.keys()].map(url => cache.match(url)))).every(Boolean);
      reply({ok: true, ready, version: self.SUMI_ASSET_VERSION});
    })());
  }
  if (event.data?.type === 'SUMI_APPLY_UPDATE') {
    event.waitUntil((async () => {
      if (!event.source || !inScope(new URL(event.source.url))) return reply({ok: false, reason: 'updateFailed'});
      const windows = (await self.clients.matchAll({type: 'window', includeUncontrolled: true}))
        .filter(client => inScope(new URL(client.url)));
      if (windows.length > 1) return reply({ok: false, reason: 'tabs'});
      try { await self.skipWaiting(); reply({ok: true}); }
      catch { reply({ok: false, reason: 'updateFailed'}); }
    })());
  }
});
