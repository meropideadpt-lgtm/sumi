# Installable, offline sumi

The app uses a relative web app manifest and a service worker. The same files work at `/` or a directory such as `/sumi/`. A secure context (HTTPS or localhost) is required. No production deployment is included in this phase.

## Installation and offline access

Settings shows whether the complete static release has been cached, whether the browser reports being offline, and whether an update is waiting. Chromium's install prompt is exposed when the browser supplies `beforeinstallprompt`. Where that event is unavailable, the settings copy explains browser-menu installation and Safari's Share → Add to Home Screen path. The browser controls actual eligibility and installation.

A first successful online visit is required. The worker verifies and caches the HTML, CSS, all runtime JavaScript and four-language resources, manifest, app icons, and all bundled brand SVGs. Subsequently, app navigation and these known same-origin resources use one consistent cached release. Requests use a six-request pool and a 20-second timeout per response, including its body. The first open page is not forcibly claimed or reloaded.

Only known static resources are intercepted. Frankfurter requests, external logo URLs, imported backups, subscriptions, payments and custom logo blobs are not part of the service-worker cache. Existing FX logic retains its own timestamps, stale-cache disclosure and error handling. Existing external logos can show the neutral fallback offline; bundled logos and locally stored uploads remain available. Browser `navigator.onLine` is only a connection hint, not proof an API is reachable.

## Safe updates

1. Registration checks for a new worker on app opening; Settings offers a manual check. Reconnecting also checks. There is no background polling loop. A failed initial registration can be retried without refreshing the page.
2. Every cached response must match the generated SHA-256 revision manifest. A missing, interrupted or mismatched asset rejects the entire new installation. The previous release remains intact. A deployment must upload a consistent release; users should retry if they catch an incomplete upload.
3. A downloaded new worker waits while the existing app remains open. Settings exposes an explicit **Update & reload** action. Draft forms, logo processing, payment confirmation and import/export operations block this action.
4. Before activating, the waiting worker checks for other same-scope app windows, including uncontrolled ones. The user must close them first. This prevents an ordinary update from switching resources underneath another open editor. No worker calls `clients.claim()`.
5. Only the tab that explicitly requested the update reloads. Both worker activation and controller changes are observed. On a first-visit uncontrolled page, the browser may activate a replacement naturally; the page offers a reload button without discarding its draft. If a form opens during activation, reload is deferred until a further explicit action. These guards protect normal app flows; browser termination or manual reload can still discard an unsubmitted form.
6. Closing every app window allows the browser's normal waiting-worker activation. Obsolete shell caches are removed only during activation with no app window open; caches belonging to other scopes/apps remain untouched. With a window open, older shell caches are retained to avoid interrupting it. The service worker never deletes localStorage or IndexedDB.

Do not force `skipWaiting()` during installation, introduce automatic page reloads, or cache API responses in the worker. Such changes would weaken the update and historical-rate guarantees.

## Updating the static release manifest

After changing any runtime file, stylesheet, locale, app/brand asset, HTML, manifest or `sw.js`, run:

```sh
python scripts/update-pwa-cache.py
node --test tests/test_pwa.cjs
```

Commit the resulting `sw-assets.js` with those changes. The generated release identifier includes the worker source and each resource's content hash. The unit suite rejects stale revision entries and release identifiers. The manifest intentionally excludes tests, documentation, source-control files and all user data. No bundler, package installation or build server is required.

## Verification and limits

`tests/test_pwa.cjs` verifies manifest integrity, install rollback, static-only fetch behavior, cache lifecycle, scoped/multiple-window update guards, real-prompt forwarding, registration retry and client reload protection. `tests/test_stage6_pwa.py` exercises actual service workers in a localhost Chromium browser with copied releases, controlled deployment changes and network-offline simulation. Its API responses are deterministic fixtures. General UI tests block service workers deliberately so they continue to exercise the current working files instead of a previously cached release.

These checks do not constitute a real iPhone/iPad Safari installation test, an OS desktop installation test, a public HTTPS deployment test, or a live Frankfurter/CORS test. The cloud network currently blocks the Frankfurter host; this phase does not claim otherwise. Real Safari/iPadOS acceptance should cover standalone launch, reboot/offline reopen, Share-menu installation, service-worker waiting/update behavior, storage persistence, soft keyboard and system appearance changes. A real-device API check must run from the app, not merely open the endpoint in Safari's address bar.

PWA storage is local to the browser/origin. Clearing site data, private browsing restrictions or operating-system storage eviction can remove it. Installation is not a cloud backup: continue exporting portable JSON backups. No account, cloud sync, notification permission or production deployment is introduced.

The app PNG icons are first-party `sumi` wordmarks rendered with DejaVu Sans. They are not third-party brand artwork. The source SVG uses a system sans-serif fallback; bundled service-brand artwork keeps its existing attribution and licenses.
