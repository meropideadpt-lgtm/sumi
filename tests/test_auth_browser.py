"""Private sign-in / guest isolation through the actual official SDK in Chromium.
No real Supabase account, iPadOS Safari, email or cloud database is exercised.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import unittest
from playwright.sync_api import expect
from browser_support import Harness, FIXTURE
from auth_support import AuthSite, A, B, URL, STORAGE, NOW, session

class PrivateAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.h=Harness().__enter__()
    @classmethod
    def tearDownClass(cls):cls.h.__exit__()
    def setUp(self):self.sites=[]
    def tearDown(self):
        for site in self.sites:
            site.close();self.assertEqual(site.errors,[])
    def site(self,**kwargs):
        site=AuthSite(self.h,**kwargs);self.sites.append(site);return site
    @staticmethod
    def ready(page):expect(page.locator('[data-add]')).to_be_visible()
    @staticmethod
    def add(page,name='Private subscription'):
        page.locator('[data-add]').click();page.locator('#name').fill(name);page.locator('#amount').fill('19.25')
        page.locator('#subscriptionForm [type=submit]').click();expect(page.locator('#subscriptionForm')).to_have_count(0)

    def test_published_public_config_connects_sdk_and_preserves_guest_data(self):
        # Load the committed configuration, but intercept ALL external traffic.
        # This verifies wiring without sending a password to the real project.
        target='https://qcboybxjjegdwpbbtbaj.supabase.co'
        context=self.h.browser.new_context(service_workers='block')
        self.addCleanup(context.close)
        context.route('https://**/*',lambda route:route.abort('internetdisconnected'))
        calls=[]
        def auth_route(route):
            calls.append({'url':route.request.url,'apikey':route.request.headers.get('apikey')})
            route.fulfill(content_type='application/json',body=json.dumps(session()),
                          headers={'access-control-allow-origin':'*'})
        context.route(target+'/auth/v1/**',auth_route)
        original=json.dumps(FIXTURE,ensure_ascii=False,indent=2)
        context.add_init_script('''if(!localStorage.getItem('sumi-data-v1')){
            localStorage.setItem('sumi-data-v1',%s);
        }'''%json.dumps(original))
        page=context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.clock.install(time=datetime.fromtimestamp(NOW,timezone.utc))
        page.goto(self.h.url)
        config=page.evaluate('SumiAuthConfig')
        self.assertEqual(config['url'],target)
        self.assertTrue(config['publishableKey'].startswith('sb_publishable_'))
        expect(page.locator('#auth-submit')).to_be_enabled()
        page.locator('#auth-email').fill('config-test@example.test')
        page.locator('#auth-password').fill('fixture-password-not-a-real-account')
        page.locator('#auth-submit').click();self.ready(page)
        self.assertEqual(calls,[{'url':target+'/auth/v1/token?grant_type=password','apikey':config['publishableKey']}])
        self.assertEqual(page.evaluate('SumiWorkspace.current().project'),target)
        self.assertEqual(page.evaluate('data.subscriptions.length'),0)
        self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"),original)
        page.locator('[data-nav=settings]').click();page.locator('#accountGuest').click();self.ready(page)
        self.assertEqual(page.evaluate('SumiWorkspace.current().mode'),'guest')
        self.assertEqual(page.evaluate('data.subscriptions.length'),len(FIXTURE['subscriptions']))
        self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"),original)
        self.assertEqual(errors,[])

    def test_login_uses_sdk_and_restores_session_without_storing_password(self):
        s=self.site();p=s.page;before=s.raw_guest();s.login();self.ready(p)
        self.assertEqual(p.evaluate('SumiWorkspace.current().userId'),A)
        self.assertEqual(p.evaluate('data.subscriptions.length'),0)
        self.assertEqual(s.raw_guest(),before)
        self.assertNotIn('test-password-never-save',p.evaluate('JSON.stringify(localStorage)'))
        self.assertNotIn('test-password-never-save',p.evaluate('JSON.stringify(sessionStorage)'))
        expect(p.locator('#auth-password')).to_have_count(0)
        self.add(p);stored=p.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        p.reload();self.ready(p)
        self.assertEqual(p.evaluate("workspaceStorage.getItem('sumi-data-v1')"),stored)
        self.assertEqual(s.raw_guest(),before)
        self.assertEqual(len([call for call in s.calls if 'grant_type=password' in call['url']]),1)
        self.assertFalse(any('/signup' in call['url'] for call in s.calls))

    def test_guest_entry_keeps_all_legacy_records_and_has_no_account_data(self):
        s=self.site();p=s.page;original=s.raw_guest()[0]
        p.locator('#auth-guest').click();self.ready(p)
        self.assertEqual(p.evaluate("localStorage.getItem('sumi-data-v1')"),original)
        self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest')
        self.assertEqual(p.evaluate('data.subscriptions.length'),2)
        self.assertEqual(p.evaluate('data.payments[0].amount'),3.123)
        p.reload();self.ready(p);self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest')
        self.assertFalse(any('grant_type=' in call['url'] for call in s.calls))

    def test_account_guest_switches_and_logout_never_migrate_or_clear_records(self):
        s=self.site();p=s.page;original=s.raw_guest();s.login();self.ready(p);self.add(p)
        account=p.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        p.locator('[data-nav=settings]').click();expect(p.locator('#accountPanel')).to_contain_text('owner@example.test')
        p.locator('#accountGuest').click();self.ready(p)
        self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest');self.assertEqual(s.raw_guest()[0],original[0])
        p.locator('[data-nav=settings]').click();p.locator('#accountSignIn').click();self.ready(p)
        self.assertEqual(p.evaluate('SumiWorkspace.current().userId'),A)
        self.assertEqual(p.evaluate("workspaceStorage.getItem('sumi-data-v1')"),account)
        p.locator('[data-nav=settings]').click();p.locator('#accountSignOut').click()
        expect(p.locator('#auth-form')).to_be_visible();expect(p.locator('[data-add]')).to_have_count(0)
        self.assertIsNone(p.evaluate('key=>localStorage.getItem(key)',STORAGE))
        self.assertTrue(any('/logout?scope=local' in call['url'] for call in s.calls))
        p.locator('#auth-guest').click();self.ready(p)
        self.assertEqual(s.raw_guest()[0],original[0])
        self.assertEqual(p.evaluate("localStorage.getItem(SumiWorkspace.identity(SumiAuthConfig.url,'"+A+"').prefix+'sumi-data-v1')"),account)

    def test_expired_session_is_refreshed_by_sdk_without_replacing_workspace(self):
        s=self.site(cached=session(expires=NOW-30),choice={'version':1,'mode':'account','project':URL,'userId':A})
        self.ready(s.page);self.assertEqual(s.rotations,1)
        self.assertEqual(s.page.evaluate('SumiWorkspace.current().userId'),A)
        self.assertEqual(json.loads(s.page.evaluate('key=>localStorage.getItem(key)',STORAGE))['refresh_token'],'refresh-rotated-1')

    def test_wrong_credentials_and_validation_never_open_private_workspace(self):
        s=self.site(language='en');p=s.page;original=s.raw_guest();s.password_error='invalid_credentials'
        p.locator('#auth-submit').click();expect(p.locator('[data-auth-error]')).to_have_text('Enter a valid email and password.')
        s.login();expect(p.locator('[data-auth-error]')).to_have_text('Incorrect email or password.')
        expect(p.locator('[data-add]')).to_have_count(0);self.assertEqual(s.raw_guest(),original)
        self.assertNotIn('Do not expose raw server details',p.locator('body').inner_text())
        self.assertEqual(p.locator('#auth-password').input_value(),'')

    def test_gate_language_and_theme_switch_in_place_and_preserve_business_data(self):
        s=self.site();p=s.page;raw=s.raw_guest()
        p.evaluate("window.languageNode=document.querySelector('#auth-language');window.themeNode=document.querySelector('#auth-theme')")
        p.locator('#auth-email').fill('keep@example.test');p.locator('#auth-password').fill('not-persisted')
        labels={'en':'Private sign in','ja-JP':'個人ログイン','zh-TW':'私人登入','zh-CN':'私人登录'}
        for language,title in labels.items():
            p.locator('#auth-language').select_option(language);expect(p.locator('#auth-title')).to_have_text(title)
            expect(p.locator('#auth-email')).to_have_value('keep@example.test');expect(p.locator('#auth-password')).to_have_value('not-persisted')
            self.assertTrue(p.evaluate("languageNode===document.querySelector('#auth-language')&&themeNode===document.querySelector('#auth-theme')"))
            self.assertEqual(s.raw_guest(),raw)
        p.locator('#auth-language').select_option('ja-JP');p.locator('#auth-theme').select_option('dark')
        p.reload();expect(p.locator('#auth-title')).to_have_text('個人ログイン');expect(p.locator('html')).to_have_attribute('data-theme','dark')
        self.assertNotIn('not-persisted',p.evaluate('JSON.stringify(localStorage)'))

    def test_other_account_cannot_reuse_a_pinned_workspace(self):
        s=self.site();p=s.page;s.login();self.ready(p);self.add(p,'Account A');old=p.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        p.locator('[data-nav=settings]').click();p.locator('#accountSignOut').click();expect(p.locator('#auth-form')).to_be_visible()
        s.next_user=B;s.login('second@example.test');self.ready(p)
        self.assertEqual(p.evaluate('SumiWorkspace.current().userId'),B);self.assertEqual(p.evaluate('data.subscriptions.length'),0)
        self.add(p,'Account B')
        self.assertEqual(p.evaluate("localStorage.getItem(SumiWorkspace.identity(SumiAuthConfig.url,'"+A+"').prefix+'sumi-data-v1')"),old)
        self.assertEqual(p.evaluate('data.subscriptions[0].name'),'Account B')

    def test_cross_tab_signout_locks_account_and_retains_unsaved_form(self):
        s=self.site();p=s.page;s.login();self.ready(p)
        p.locator('[data-add]').click();p.locator('#name').fill('Unsaved remains');p.locator('#amount').fill('12.00')
        second=s.new_page(self.h.url);self.ready(second)
        second.locator('[data-nav=settings]').click();second.locator('#accountSignOut').click()
        expect(p.locator('.access-locked')).to_be_visible();expect(p.locator('#name')).to_have_value('Unsaved remains')
        self.assertTrue(p.locator('#app').evaluate('(node)=>node.inert'))
        self.assertTrue(p.evaluate("(()=>{try{workspaceStorage.setItem('sumi-data-v1','bad');return false}catch{return true}})()"))
        p.locator('#auth-email').fill('owner@example.test');p.locator('#auth-password').fill('test-password-never-save');p.locator('#auth-submit').click()
        expect(p.locator('.access-locked')).to_be_hidden();expect(p.locator('#name')).to_have_value('Unsaved remains')
        p.locator('#subscriptionForm [type=submit]').click();expect(p.locator('#subscriptionForm')).to_have_count(0)
        self.assertEqual(p.evaluate('data.subscriptions[0].name'),'Unsaved remains')

    def test_account_logo_database_is_separate_and_exports_contain_no_auth_session(self):
        s=self.site();p=s.page;s.login();self.ready(p);self.add(p)
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7z8AAAAASUVORK5CYII='
        result=p.evaluate('''async image=>{
          const guest=await SumiLogoStore.save(image),privateBefore=await logoStore.resolve(guest),account=await logoStore.save(image);
          return {guest,account,privateBefore,db:SumiWorkspace.current().dbName,databases:await indexedDB.databases()};
        }''',image)
        self.assertEqual(result['guest'],result['account']);self.assertNotEqual(result['db'],'sumi-logo-assets-v1')
        self.assertIsNone(result['privateBefore'])
        self.assertIn('sumi-logo-assets-v1',[db['name'] for db in result['databases']]);self.assertIn(result['db'],[db['name'] for db in result['databases']])
        p.locator('[data-nav=settings]').click()
        with p.expect_download() as download:p.locator('#export').click()
        content=Path(download.value.path()).read_text();backup=json.loads(content)
        self.assertEqual(backup['version'],1);self.assertEqual(backup['data']['subscriptions'][0]['name'],'Private subscription')
        for forbidden in ('access_token','refresh_token','test-password-never-save'):self.assertNotIn(forbidden,content)

    def test_login_and_guest_controls_fit_four_languages_themes_and_touch_viewports(self):
        for language in ('zh-CN','zh-TW','ja-JP','en'):
            for size in ((320,740),(390,844),(820,1180),(1440,1000)):
                with self.subTest(language=language,size=size):
                    s=self.site(language=language,size=size,touch=size[0]<1000);p=s.page
                    for theme in ('light','dark'):
                        p.locator('#auth-theme').select_option(theme)
                        self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                        for selector in ('#auth-email','#auth-password','#auth-submit','#auth-guest'):
                            box=p.locator(selector).bounding_box();self.assertGreaterEqual(box['height'],44);self.assertGreaterEqual(box['x'],0);self.assertLessEqual(box['x']+box['width'],size[0])
                    if size[0]<1000:p.locator('#auth-guest').tap()
                    else:p.locator('#auth-guest').click()
                    self.ready(p);s.close();self.sites.remove(s);self.assertEqual(s.errors,[])

    def test_offline_signout_removes_cached_session_and_explains_revocation_limit(self):
        s=self.site(language='en');p=s.page;s.login();self.ready(p);self.add(p)
        saved=p.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        p.locator('[data-nav=settings]').click();p.locator('#language').select_option('en');s.offline=True
        p.locator('#accountSignOut').click();expect(p.locator('#auth-form')).to_be_visible()
        expect(p.locator('[data-auth-status]')).to_contain_text('cached session was cleared')
        self.assertIsNone(p.evaluate('key=>localStorage.getItem(key)',STORAGE))
        self.assertEqual(p.evaluate("localStorage.getItem(SumiWorkspace.identity(SumiAuthConfig.url,'"+A+"').prefix+'sumi-data-v1')"),saved)
        p.locator('#auth-guest').click();self.ready(p);self.assertEqual(p.evaluate('data.subscriptions.length'),2)

    def test_invalid_refresh_returns_to_login_without_touching_guest_records(self):
        s=self.site(cached=session(expires=NOW-30),refresh_error=True,choice={'version':1,'mode':'account','project':URL,'userId':A})
        p=s.page;expect(p.locator('#auth-form')).to_be_visible()
        expect(p.locator('[data-auth-status]')).to_be_hidden()
        expect(p.locator('[data-add]')).to_have_count(0)
        self.assertIsNone(p.evaluate('SumiWorkspace.current()'))
        self.assertEqual(json.loads(s.raw_guest()[0])['subscriptions'][0]['id'],'reading')

    def test_sdk_storage_failure_does_not_open_account_or_overwrite_guest(self):
        s=self.site(language='en',init="""(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('sumi-auth-v1:'))throw new DOMException('Blocked','QuotaExceededError');return set.call(this,key,value)}})();""")
        before=s.raw_guest();s.login()
        expect(s.page.locator('[data-auth-error]')).to_contain_text('Cannot save the session')
        expect(s.page.locator('[data-add]')).to_have_count(0);self.assertEqual(s.raw_guest(),before)
        s.page.locator('#auth-guest').click();self.ready(s.page)

    def test_late_login_response_never_overrides_explicit_guest_choice(self):
        s=self.site();p=s.page;held=[]
        s.context.route(URL+'/auth/v1/token?grant_type=password',lambda route:held.append(route))
        s.login();p.wait_for_function("document.querySelector('#auth-submit').disabled")
        p.locator('#auth-guest').click();self.ready(p);self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest')
        self.assertEqual(len(held),1)
        held[0].fulfill(content_type='application/json',body=json.dumps(session()),headers={'access-control-allow-origin':'*'})
        p.wait_for_function('key=>localStorage.getItem(key)!==null',arg=STORAGE)
        self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest');self.assertEqual(p.evaluate('data.subscriptions.length'),2)
        p.reload();self.ready(p);self.assertEqual(p.evaluate('SumiWorkspace.current().mode'),'guest')

    def test_account_preferences_are_isolated_and_restore_before_paint(self):
        s=self.site();p=s.page;guest_preferences=s.raw_guest()[1];s.login();self.ready(p)
        p.locator('[data-nav=settings]').click();p.locator('#language').select_option('ja-JP');p.locator('#theme').select_option('dark')
        self.assertEqual(s.raw_guest()[1],guest_preferences)
        p.reload();self.ready(p);expect(p.locator('html')).to_have_attribute('data-theme','dark');expect(p.locator('html')).to_have_attribute('lang','ja-JP')
        p.locator('[data-nav=settings]').click();p.locator('#accountGuest').click();self.ready(p)
        expect(p.locator('html')).to_have_attribute('data-theme','light');expect(p.locator('html')).to_have_attribute('lang','zh-CN')

    def test_system_theme_and_guest_entry_work_with_no_auth_network(self):
        s=self.site(offline=True,language='en');p=s.page
        p.locator('#auth-theme').select_option('system');p.emulate_media(color_scheme='dark')
        expect(p.locator('html')).to_have_attribute('data-theme','dark');p.emulate_media(color_scheme='light')
        expect(p.locator('html')).to_have_attribute('data-theme','light')
        p.locator('#auth-guest').click();self.ready(p);self.add(p,'Offline guest record')
        self.assertEqual(p.evaluate('data.subscriptions.at(-1).name'),'Offline guest record')
        self.assertEqual(s.calls,[])

    def test_cached_different_account_requires_explicit_login_instead_of_switching(self):
        s=self.site(language='en',cached=session(uid=B),choice={'version':1,'mode':'account','project':URL,'userId':A})
        p=s.page;expect(p.locator('[data-auth-error]')).to_have_text('Sign in to the original account to resume this workspace.')
        expect(p.locator('[data-auth-status]')).to_be_hidden();expect(p.locator('[data-add]')).to_have_count(0)
        self.assertIsNone(p.evaluate('SumiWorkspace.current()'))
        s.login();self.ready(p);self.assertEqual(p.evaluate('SumiWorkspace.current().userId'),A)

    def test_automatic_token_refresh_keeps_form_node_draft_and_business_data(self):
        s=self.site();p=s.page;s.login();self.ready(p)
        p.locator('[data-add]').click();p.locator('#name').fill('Keep this draft');p.locator('#amount').fill('19.25')
        p.evaluate("window.pinnedName=document.querySelector('#name')")
        before=p.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        p.clock.run_for(3540000)
        p.wait_for_function('key=>JSON.parse(localStorage.getItem(key)).refresh_token!=="refresh-rotated-0"',arg=STORAGE)
        self.assertGreaterEqual(s.rotations,1)
        self.assertTrue(p.evaluate("pinnedName===document.querySelector('#name')"))
        expect(p.locator('#name')).to_have_value('Keep this draft')
        self.assertEqual(p.evaluate("workspaceStorage.getItem('sumi-data-v1')"),before)
        p.locator('#subscriptionForm [type=submit]').click();expect(p.locator('#subscriptionForm')).to_have_count(0)

    def test_online_cached_session_is_verified_by_server_before_account_opens(self):
        s=self.site(cached=session(),user_error=True,choice={'version':1,'mode':'account','project':URL,'userId':A})
        p=s.page;expect(p.locator('[data-auth-error]')).to_be_visible();expect(p.locator('[data-add]')).to_have_count(0)
        self.assertIsNone(p.evaluate('SumiWorkspace.current()'))
        self.assertTrue(any('/auth/v1/user' in call['url'] for call in s.calls))
        self.assertEqual(json.loads(s.raw_guest()[0])['subscriptions'][0]['id'],'reading')

    def test_cached_local_access_reverifies_on_reconnect_and_retains_draft_if_revoked(self):
        s=self.site(language='en',cached=session(),offline=True,choice={'version':1,'mode':'account','project':URL,'userId':A})
        p=s.page;self.ready(p);p.locator('[data-nav=settings]').click()
        expect(p.locator('#accountPanel [role=status]')).to_contain_text('cached local session')
        p.locator('[data-nav=home]').click();p.locator('[data-add]').click();p.locator('#name').fill('Keep offline draft')
        s.offline=False;s.user_error=True;p.evaluate("window.dispatchEvent(new Event('online'))")
        expect(p.locator('.access-locked')).to_be_visible();expect(p.locator('#name')).to_have_value('Keep offline draft')
        self.assertTrue(p.evaluate('SumiWorkspace.isLocked()'))
