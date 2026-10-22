"""Real service-worker integration on isolated localhost sites in Chromium.

The HTTP localhost secure-context exemption is used. These are automated browser
checks, not physical Safari/iPadOS, OS installation UI, or live Frankfurter tests.
Every deployment/update below changes a disposable site copy, never the worktree.
"""
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright
from browser_support import ROOT, FIXTURE, PREFS, FX_LATEST, FX_CURRENCIES


class NoCacheHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split('?',1)[0].endswith('/sw.js') and getattr(self.server,'reject_worker',False):
            self.send_error(503,'Simulated temporary worker download failure')
            return
        super().do_GET()

    def end_headers(self):
        # Offline assertions must be served by CacheStorage, not the HTTP cache.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class StageSixPWATests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.environ.get('SUMI_CHROMIUM') or shutil.which('chromium'),
            headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sumi-pwa-test-')
        self.document_root = Path(self.temp.name)
        self.site = self.document_root / 'sumi'
        self.site.mkdir()
        for pattern in ('*.js', '*.css', '*.html', '*.webmanifest'):
            for source in ROOT.glob(pattern):
                shutil.copy2(source, self.site / source.name)
        for folder in ('assets', 'locales', 'scripts'):
            if (ROOT / folder).exists():
                shutil.copytree(ROOT / folder, self.site / folder)
        subprocess.run(['python', str(self.site/'scripts/update-pwa-cache.py')],
            cwd=self.site, check=True, capture_output=True, text=True)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0),
            partial(NoCacheHandler, directory=str(self.document_root)))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.url = self.origin + '/sumi/'
        self.context = self.browser.new_context(service_workers='allow', locale='en',
            viewport={'width':1280,'height':900})
        self.context.set_default_timeout(12000)
        self.offline = False
        self.api_requests = []
        self.context.route('https://api.frankfurter.dev/v1/**', self.fx_route)
        self.errors = []
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('dialog', lambda dialog: dialog.accept())
        fixture = copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['logo'] = 'assets/brands/github.svg'
        fixture['payments'] = [{'id':'legacy-payment','subscriptionId':'reading',
            'name':'Original payment 原始记录','amount':27.125,'currency':'CNY',
            'date':'2026-10-21','note':'preserve unchanged'}]
        fixture['payments'].append({'id':'frozen-payment','subscriptionId':'reading',
            'name':'Historical USD payment','amount':12,'currency':'USD','date':'2026-10-22',
            'status':'succeeded','advancesSchedule':False,'fxSnapshot':{
                'version':1,'status':'available','provider':'frankfurter',
                'sourceCurrency':'USD','sourceAmount':12,'displayCurrency':'CNY',
                'base':'EUR','rate':7.8/1.1,'convertedAmount':85.09,
                'date':'2026-10-21','fetchedAt':'2026-10-21T12:00:00.000Z',
                'confirmedAt':'2026-10-22T00:00:00.000Z',
                'rates':{'EUR':1,'USD':1.1,'CNY':7.8},'reason':None}})
        fixture['extension'] = {'legacy':'原始数据'}
        self.original_data = json.dumps(fixture, ensure_ascii=False, indent=2)
        self.context.add_init_script('''(() => {
            if (!localStorage.getItem('pwa-test-seeded')) {
                localStorage.setItem('sumi-data-v1', %s);
                localStorage.setItem('sumi-prefs-v1', %s);
                localStorage.setItem('pwa-test-seeded', 'yes');
            }
        })();''' % (json.dumps(self.original_data),json.dumps(json.dumps({**PREFS,'language':'en'}))))

    def tearDown(self):
        self.context.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()
        self.assertEqual(self.errors, [], 'Unhandled page error')

    def fx_route(self, route):
        self.api_requests.append(route.request.url)
        if self.offline:
            return route.abort('internetdisconnected')
        payload = FX_CURRENCIES if '/currencies' in route.request.url else FX_LATEST
        return route.fulfill(status=200, content_type='application/json',
            body=json.dumps(payload),headers={'access-control-allow-origin':'*'})

    def open(self):
        self.page.goto(self.url)
        self.page.wait_for_function("typeof SumiPWA !== 'undefined' && SumiPWA.getState().ready")
        self.page.wait_for_function('!fxManager.getState().loading')
        self.page.reload()
        self.page.wait_for_function('navigator.serviceWorker.controller !== null')
        self.page.wait_for_function('SumiPWA.getState().ready')
        return self.page

    def settings(self, page=None):
        (page or self.page).locator('[data-nav=settings]').click()

    def cache_urls(self):
        return self.page.evaluate('''async () => (await Promise.all((await caches.keys()).map(async name =>
            (await (await caches.open(name)).keys()).map(request=>request.url)))).flat()''')

    def raw(self):
        return self.page.evaluate("['sumi-data-v1','sumi-prefs-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")

    def go_offline(self):
        self.offline = True
        self.context.set_offline(True)

    def build_update(self, fail=False):
        # A deploy changes an application asset, then generates the matching
        # integrity manifest. Omitting one generated asset simulates a partial
        # upload, which must not replace a complete installed release.
        target = self.site / 'app.js'
        target.write_text(target.read_text() + '\nwindow.pwaTestRelease = "updated";\n')
        subprocess.run(['python', str(self.site/'scripts/update-pwa-cache.py')],
            cwd=self.site, check=True, capture_output=True, text=True)
        if fail == 'missing':
            (self.site/'assets/brands/github.svg').unlink()
        elif fail == 'integrity':
            target.write_text(target.read_text() + '\n/* unexpected deployment bytes */\n')
        self.page.evaluate('async () => (await navigator.serviceWorker.getRegistration()).update()')

    def wait_update(self):
        self.page.wait_for_function('SumiPWA.getState().waiting')

    def test_manifest_uses_relative_scope_and_complete_real_icon_assets(self):
        self.open()
        manifest = self.page.evaluate('''async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json()''')
        self.assertEqual(manifest['display'], 'standalone')
        self.assertFalse(manifest['start_url'].startswith('/'))
        self.assertFalse(manifest['scope'].startswith('/'))
        self.assertTrue({'192x192','512x512'}.issubset({icon['sizes'] for icon in manifest['icons']}))
        for icon in manifest['icons']:
            self.assertEqual(self.page.evaluate('''async src => (await fetch(new URL(src,location.href))).status''',icon['src']),200)
        self.assertEqual(self.page.evaluate('async()=> (await navigator.serviceWorker.getRegistration()).scope'),self.url)

    def test_offline_reopen_all_pages_preserves_business_history_preferences_and_fx(self):
        self.open()
        initial = self.raw()
        self.assertEqual(initial[0],self.original_data)
        self.assertIsNotNone(initial[2])
        self.go_offline()
        reopened = self.context.new_page()
        reopened.goto(self.url)
        reopened.wait_for_function("typeof SumiPWA !== 'undefined'")
        for view in ('home','list','stats','calendar','settings'):
            reopened.locator(f'[data-nav={view}]').click()
            expect(reopened.locator('.top h1')).to_be_visible()
        self.assertEqual(reopened.evaluate("['sumi-data-v1','sumi-prefs-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))"),initial)
        self.assertTrue(reopened.evaluate('SumiPWA.getState().offline'))
        reopened.reload()
        expect(reopened.locator('.top h1')).to_have_text('Home')
        self.assertEqual(self.raw(),initial)

    def test_offline_brand_catalog_and_shell_are_fully_cached(self):
        self.open()
        self.go_offline()
        result = self.page.evaluate('''async () => {
            const logos=[...new Set(SumiCatalog.all.map(service=>service.logo).filter(Boolean))];
            return Promise.all(logos.map(async path => ({path,status:(await fetch(path)).status})));
        }''')
        self.assertGreaterEqual(len(result),50)
        self.assertTrue(all(entry['status']==200 for entry in result),result)
        self.page.reload()
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('github')
        expect(self.page.locator('#suggestions')).to_be_visible()
        self.assertTrue(self.page.locator('#suggestions img').first.evaluate('(img)=>img.complete && img.naturalWidth>0'))

    def test_offline_add_payment_and_reload_remain_usable(self):
        self.open()
        self.go_offline()
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('Offline service')
        self.page.locator('#amount').fill('19.50')
        self.page.locator('#nextDate').fill('2026-10-31')
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.page.locator('tr[data-detail]').filter(has_text='Offline service').click()
        self.page.locator('[data-confirm]').click()
        stored = self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")
        added = next(item for item in stored['subscriptions'] if item['name']=='Offline service')
        self.assertEqual(added['nextDate'],'2026-11-30')
        self.assertEqual(sum(item['subscriptionId']==added['id'] for item in stored['payments']),1)
        self.assertEqual(next(p for p in stored['payments'] if p['id']=='legacy-payment')['amount'],27.125)
        self.page.reload()
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))"),stored)

    def test_cache_contains_only_allowlisted_static_assets_not_api_or_private_json(self):
        self.open()
        (self.site/'private.json').write_text('{"private":"payment export"}')
        self.assertEqual(self.page.evaluate("async()=> (await fetch('private.json')).status"),200)
        urls = self.cache_urls()
        self.assertTrue(urls)
        self.assertTrue(all(url.startswith(self.url) for url in urls),urls)
        self.assertFalse(any('private.json' in url or 'frankfurter' in url or 'sumi-data' in url for url in urls),urls)
        self.assertTrue(any(url.endswith('/app.js') for url in urls),urls)

    def test_available_update_waits_without_replacing_existing_client_assets(self):
        self.open()
        before = self.raw()
        old_app = self.page.evaluate("async()=> (await fetch('app.js')).text()")
        self.build_update()
        self.wait_update()
        self.assertIsNone(self.page.evaluate('window.pwaTestRelease || null'))
        self.assertEqual(self.page.evaluate("async()=> (await fetch('app.js')).text()"),old_app)
        self.assertEqual(self.raw(),before)
        self.settings()
        expect(self.page.locator('#pwaUpdate')).to_be_visible()

    def test_explicit_update_reloads_into_new_release_and_preserves_data(self):
        self.open()
        before=self.raw()
        self.build_update()
        self.wait_update()
        self.settings()
        self.page.locator('#pwaUpdate').click()
        self.page.wait_for_function('window.pwaTestRelease === "updated"')
        self.assertEqual(self.raw(),before)
        self.assertFalse(self.page.evaluate('SumiPWA.getState().waiting'))
        self.go_offline()
        self.page.reload()
        self.page.wait_for_function('window.pwaTestRelease === "updated"')
        self.assertEqual(self.raw(),before)

    def test_update_from_initial_uncontrolled_document_can_complete(self):
        self.page.goto(self.url)
        self.page.wait_for_function('SumiPWA.getState().ready')
        self.page.wait_for_function('!fxManager.getState().loading')
        self.assertIsNone(self.page.evaluate('navigator.serviceWorker.controller'))
        before=self.raw()
        self.build_update()
        self.page.wait_for_function("SumiPWA.getState().reloadPending")
        self.assertIsNone(self.page.evaluate("window.pwaTestRelease || null"))
        self.assertIsNone(self.page.evaluate("navigator.serviceWorker.controller"))
        self.settings()
        self.page.locator('#pwaUpdate').click()
        self.page.wait_for_function('window.pwaTestRelease === "updated"')
        self.assertEqual(self.raw(),before)
        self.assertFalse(self.page.evaluate('SumiPWA.getState().updating'))

    def test_second_open_tab_prevents_forced_update(self):
        self.open()
        second=self.context.new_page()
        second.goto(self.url)
        second.wait_for_function('navigator.serviceWorker.controller !== null')
        self.build_update()
        self.wait_update()
        self.settings()
        self.page.locator('#pwaUpdate').click()
        self.page.wait_for_function('SumiPWA.getState().error === "tabs"')
        self.assertIsNone(self.page.evaluate('window.pwaTestRelease || null'))
        self.assertIsNone(second.evaluate('window.pwaTestRelease || null'))
        self.assertTrue(self.page.evaluate('SumiPWA.getState().waiting'))
        second.close()
        self.page.locator('#pwaUpdate').click()
        self.page.wait_for_function('window.pwaTestRelease === "updated"')

    def test_unsaved_form_blocks_programmatic_update_without_losing_draft(self):
        self.open()
        self.build_update()
        self.wait_update()
        self.settings()
        # The panel is behind the modal. Dispatching its event exercises the
        # application guard even if an update races with a newly opened form.
        self.page.evaluate("modal='new';formDraft=null;render()")
        self.page.locator('#name').fill('Unsaved service 原始草稿')
        self.page.locator('#amount').fill('31.25')
        self.page.locator('#pwaUpdate').evaluate('(button)=>button.click()')
        self.page.wait_for_function('SumiPWA.getState().error === "busy"')
        expect(self.page.locator('#name')).to_have_value('Unsaved service 原始草稿')
        expect(self.page.locator('#amount')).to_have_value('31.25')
        self.assertIsNone(self.page.evaluate('window.pwaTestRelease || null'))
        self.assertEqual(self.raw()[0],self.original_data)

    def test_offline_manual_rate_refresh_retains_cached_rates_and_old_payments(self):
        self.open()
        before=self.raw()
        self.go_offline()
        self.settings()
        self.page.locator('#refreshRates').click()
        self.page.wait_for_function('!fxManager.getState().loading && !!fxManager.getState().error')
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('#fxStatus')).to_contain_text('cache')
        self.assertTrue(self.page.evaluate('!!fxManager.getState().snapshot'))

    def assert_failed_deployment_preserves_active_release(self, failure):
        self.open()
        before=self.raw()
        self.page.evaluate('''async()=> {
            const registration=await navigator.serviceWorker.getRegistration();
            window.failedReleaseFinished=false;
            registration.addEventListener('updatefound',()=>{
                const worker=registration.installing;
                worker.addEventListener('statechange',()=>{
                    if(worker.state==='redundant')window.failedReleaseFinished=true;
                });
            });
        }''')
        self.build_update(fail=failure)
        self.page.wait_for_function('window.failedReleaseFinished')
        self.assertFalse(self.page.evaluate('SumiPWA.getState().waiting'))
        self.go_offline()
        self.page.reload()
        expect(self.page.locator('.top h1')).to_have_text('Home')
        self.assertIsNone(self.page.evaluate('window.pwaTestRelease || null'))
        self.assertEqual(self.raw(),before)
        self.assertEqual(self.page.evaluate("async()=> (await fetch('assets/brands/github.svg')).status"),200)
    def test_incomplete_deploy_keeps_old_worker_and_offline_assets(self):
        self.assert_failed_deployment_preserves_active_release('missing')

    def test_integrity_mismatch_keeps_old_worker_and_offline_assets(self):
        self.assert_failed_deployment_preserves_active_release('integrity')

    def test_draft_opened_during_update_defers_reload_until_user_is_ready(self):
        self.open()
        before=self.raw()
        self.build_update()
        self.wait_update()
        self.page.evaluate("""() => {
            SumiPWA.applyUpdate();
            modal='new';formDraft=null;render();
            const input=document.querySelector('#name');
            input.value='Draft opened during update';
            input.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        self.page.wait_for_function('SumiPWA.getState().reloadPending')
        expect(self.page.locator('#name')).to_have_value('Draft opened during update')
        self.assertIsNone(self.page.evaluate('window.pwaTestRelease || null'))
        self.assertEqual(self.raw(),before)
        self.page.locator('[data-close]').first.click()
        self.settings()
        self.page.locator('#pwaUpdate').click()
        self.page.wait_for_function('window.pwaTestRelease === "updated"')
        self.assertEqual(self.raw(),before)

    def test_failed_initial_registration_can_be_retried_manually(self):
        self.server.reject_worker=True
        self.page.goto(self.url)
        self.page.wait_for_function('SumiPWA.getState().error === "registerFailed"')
        self.page.wait_for_function('!fxManager.getState().loading')
        before=self.raw()
        self.settings()
        expect(self.page.locator('#pwaStatus')).to_be_visible()
        self.server.reject_worker=False
        self.page.locator('#pwaCheckUpdate').click()
        self.page.wait_for_function('SumiPWA.getState().ready && !SumiPWA.getState().error')
        self.page.reload()
        self.page.wait_for_function('navigator.serviceWorker.controller !== null')
        self.go_offline()
        self.page.reload()
        expect(self.page.locator('.top h1')).to_have_text('Home')
        self.assertEqual(self.raw(),before)

    def test_pwa_settings_use_all_four_languages_with_real_translation_module(self):
        self.open()
        before=self.raw()
        self.settings()
        labels={
            'zh-CN':('安装与离线使用','离线资源已就绪。','当前离线，可以继续管理本地订阅。','检查应用更新'),
            'zh-TW':('安裝與離線使用','離線資源已就緒。','目前離線，可以繼續管理本機訂閱。','檢查應用程式更新'),
            'ja-JP':('インストールとオフライン','オフラインで利用できます。','オフラインです。この端末の契約は引き続き管理できます。','アプリの更新を確認'),
            'en':('Install & offline access','Offline resources are ready.','You are offline. You can continue managing local subscriptions.','Check app updates'),
        }
        # i18n.js declares a lexical const, not window.SumiI18n. Check rendered
        # copy against independent text expectations so a global-property mock
        # cannot conceal fallback-only labels in the actual application.
        self.assertEqual(self.page.evaluate('typeof SumiI18n'), 'object')
        self.assertEqual(self.page.evaluate('typeof window.SumiI18n'), 'undefined')
        for language,(title,ready,offline,check) in labels.items():
            with self.subTest(language=language,state='online'):
                self.page.locator('#language').select_option(language)
                expect(self.page.locator('#pwaPanel')).to_have_attribute('aria-label',title)
                expect(self.page.locator('#pwaPanel > .settings-row span').first).to_have_text(title)
                expect(self.page.locator('#pwaStatus')).to_have_text(ready)
                expect(self.page.locator('#pwaCheckUpdate')).to_have_text(check)
                self.assertNotIn('Offline app',self.page.locator('#pwaPanel').inner_text())
                self.assertNotIn('pwa.',self.page.locator('#pwaPanel').inner_text())
        self.go_offline()
        self.page.wait_for_function('SumiPWA.getState().offline')
        for language,(title,ready,offline,check) in labels.items():
            with self.subTest(language=language,state='offline'):
                self.page.locator('#language').select_option(language)
                expect(self.page.locator('#pwaPanel')).to_have_attribute('aria-label',title)
                expect(self.page.locator('#pwaStatus')).to_have_text(offline)
                expect(self.page.locator('#pwaCheckUpdate')).to_have_text(check)
                expect(self.page.locator('#pwaCheckUpdate')).to_be_disabled()
        after=self.raw()
        self.assertEqual(after[0],before[0])
        self.assertEqual(after[2],before[2])

    def test_install_button_requires_browser_prompt_and_user_click(self):
        self.open()
        self.settings()
        expect(self.page.locator('#pwaInstall')).to_have_count(0)
        # Native installation dialogs are outside headless browser coverage;
        # this synthetic browser event tests the application's actual button.
        self.page.evaluate("""() => {
            window.installPromptCount=0;
            const event=new Event('beforeinstallprompt',{cancelable:true});
            event.prompt=async()=>{window.installPromptCount++};
            event.userChoice=Promise.resolve({outcome:'dismissed'});
            window.dispatchEvent(event);
            window.installEventPrevented=event.defaultPrevented;
        }""")
        expect(self.page.locator('#pwaInstall')).to_be_visible()
        self.assertTrue(self.page.evaluate('window.installEventPrevented'))
        self.assertEqual(self.page.evaluate('window.installPromptCount'),0)
        self.page.locator('#pwaInstall').click()
        self.page.wait_for_function('!SumiPWA.getState().installAvailable')
        self.assertEqual(self.page.evaluate('window.installPromptCount'),1)
        self.assertFalse(self.page.evaluate('SumiPWA.getState().installed'))
        expect(self.page.locator('#pwaInstall')).to_have_count(0)
        self.page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
        self.assertTrue(self.page.evaluate('SumiPWA.getState().installed'))


if __name__=='__main__':
    unittest.main()
