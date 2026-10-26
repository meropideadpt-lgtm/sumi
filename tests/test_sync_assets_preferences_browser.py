"""Real Sumi + official SDK with isolated Auth/RPC/Private Storage HTTP fixtures.

Chromium contexts model devices, not real Supabase or iPadOS. Storage policy
responses here test SDK wiring; PostgreSQL RLS assertions run separately.
Offline API requests fail; the local shell still loads with SW disabled.
"""
import base64
import copy
from email.parser import BytesParser
from email.policy import default
import hashlib
import io
import json
import re
import unittest
from urllib.parse import unquote, urlparse
from PIL import Image
from playwright.sync_api import expect
from browser_support import Harness
from auth_support import AuthSite, A, B, URL, KEY
from test_sync_payments_browser import PaymentCloud


class PrivateImages:
    """Immutable owner/hash objects; fault injection never touches real Storage."""
    def __init__(self):
        self.objects = {}
        self.calls = []
        self.fault = None
        self.drop_upload_ack = False

    def route(self, route):
        request = route.request
        headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'}
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=headers)
        parts = request.headers.get('authorization', '').split('.')
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + '==')) if len(parts) == 3 else {}
        path = unquote(urlparse(request.url).path).split('/object/', 1)[-1]
        authenticated = path.startswith('authenticated/')
        if authenticated:
            path = path[len('authenticated/'):]
        self.calls.append((request.method, path, claims.get('sub')))

        def error(status):
            return route.fulfill(status=status, headers=headers, json={'statusCode': str(status), 'error': 'fixture', 'message': 'Storage fixture rejected request'})
        match = re.fullmatch(r'sumi-private-logos/([a-f0-9-]{36})/([a-f0-9]{64})\.(png|jpg|webp)', path)
        if not match or match[1] != claims.get('sub'):
            return error(403)
        if request.method == 'POST':
            if request.headers.get('x-upsert') == 'true':
                return error(403)
            content_type = request.headers.get('content-type', '')
            body = request.post_data_buffer or b''
            if content_type.startswith('multipart/form-data'):
                message = BytesParser(policy=default).parsebytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + body)
                files = [part for part in message.iter_parts() if part.get_filename() is not None]
                assert len(files) == 1
                body, content_type = files[0].get_payload(decode=True), files[0].get_content_type()
            if content_type not in ('image/png', 'image/jpeg', 'image/webp'):
                return error(415)
            if len(body) > 12 * 1024 * 1024:
                return error(413)
            if path in self.objects:
                return error(409)
            self.objects[path] = (body, content_type)
            if self.drop_upload_ack:
                self.drop_upload_ack = False
                return route.abort('internetdisconnected')
            return route.fulfill(headers=headers, json={'Key': path, 'Id': 'fixture-object'})
        # The vendored SDK uses /object/<bucket>/<path> with the bearer token;
        # other Storage versions also accept /object/authenticated/... . Both
        # require the owner check above. Public endpoints do not match it.
        if request.method != 'GET':
            return error(403)
        if self.fault == 'network':
            return route.abort('internetdisconnected')
        if self.fault in ('missing', 'denied'):
            return error(404 if self.fault == 'missing' else 403)
        if path not in self.objects:
            return error(404)
        body, mime = self.objects[path]
        if self.fault == 'hash':
            body = image_bytes('PNG', 'yellow')
        elif self.fault == 'mime':
            mime = 'image/jpeg' if mime != 'image/jpeg' else 'image/png'
        elif self.fault == 'malformed':
            body = b'<svg onload="alert(1)" />'
        elif self.fault == 'oversized':
            body = b'x' * (12 * 1024 * 1024 + 1)
        return route.fulfill(headers=headers, content_type=mime, body=body)


def image_bytes(fmt='PNG', color='blue'):
    output = io.BytesIO()
    Image.new('RGB', (36, 28), color).save(output, format=fmt)
    return output.getvalue()


class AssetsPreferencesSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.cloud, self.images, self.sites = PaymentCloud(), PrivateImages(), []

    def tearDown(self):
        errors = []
        for site in self.sites:
            errors.extend(site.errors)
            site.close()
        self.assertEqual(errors, [], 'Unhandled JavaScript errors')

    def site(self, size=(1440, 1000), uid=A, no_idb=False):
        offline = "Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>sessionStorage.getItem('sync-test-offline')!=='yes'});"
        if no_idb:
            offline += "Object.defineProperty(indexedDB,'open',{value:()=>{throw Error('fixture IDB unavailable')}});"
        site = AuthSite(self.h, size=size, touch=size[0] < 1000, init=offline)
        self.sites.append(site)
        site.context.route(URL + '/rest/v1/rpc/**', lambda route: route.abort('internetdisconnected') if site.offline else self.cloud.route(route))
        site.context.route(URL + '/storage/v1/**', lambda route: route.abort('internetdisconnected') if site.offline else self.images.route(route))
        site.next_user = uid
        site.login()
        expect(site.page.locator('[data-add]')).to_be_visible()
        site.page.wait_for_function('fxState.snapshot && !fxState.loading')
        return site

    @staticmethod
    def state(site):
        return site.page.evaluate('structuredClone(data)')

    def settings(self, site):
        if site.page.locator('[data-close-detail]').count():
            site.page.locator('[data-close-detail]').click()
        site.page.locator('[data-nav=settings]').click()

    @staticmethod
    def synced(site):
        site.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='synced' && syncController.model().pending===0")

    def sync(self, site):
        self.settings(site)
        site.page.wait_for_function('!syncController.isBusy()')
        site.page.locator('[data-sync-action=retry]').click()
        self.synced(site)

    def connect(self, site, choice):
        self.settings(site)
        site.page.locator('[data-sync-action=inspect]').click()
        expect(site.page.locator('.sync-preview')).to_be_visible()
        site.page.locator(f'[data-sync-action={choice}]').click()
        self.synced(site)

    @staticmethod
    def offline(site, value):
        site.offline = value
        site.page.evaluate("v=>{sessionStorage.setItem('sync-test-offline',v?'yes':'no');dispatchEvent(new Event(v?'offline':'online'))}", value)

    def prefs(self, site, **values):
        self.settings(site)
        for key, value in values.items():
            site.page.locator('#' + key).select_option(str(value))

    def form(self, site, sid=None):
        if site.page.locator('[data-close-detail]').count():
            site.page.locator('[data-close-detail]').click()
        site.page.locator('[data-nav=list]' if sid else '[data-nav=home]').click()
        if sid:
            site.page.locator(f'[data-detail="{sid}"]').first.click()
            site.page.locator('[data-edit]').click()
        else:
            site.page.locator('[data-add]').click()

    def upload(self, site, fmt='PNG', color='blue'):
        site.page.locator('#openPicker').click()
        mime = {'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}[fmt]
        site.page.locator('#uploadLogo').set_input_files({'name': 'custom.' + fmt.lower(), 'mimeType': mime, 'buffer': image_bytes(fmt, color)})
        expect(site.page.locator('#pickerOverlay')).to_have_count(0)

    def save(self, site):
        site.page.locator('#subscriptionForm [type=submit]').click()
        expect(site.page.locator('#subscriptionForm')).to_have_count(0)

    def add(self, site, fmt='PNG', color='blue'):
        self.form(site)
        site.page.locator('#name').fill('Custom ' + fmt)
        site.page.locator('#amount').fill('11.23')
        site.page.locator('#formCurrency').select_option('USD')
        site.page.locator('#nextDate').fill('2026-10-31')
        site.page.locator('#category').fill('私人分類 / Tools')
        site.page.locator('#months').select_option('3')
        site.page.locator('#autoRenew').select_option('false')
        self.upload(site, fmt, color)
        self.save(site)
        return self.state(site)['subscriptions'][-1]['id']

    def replace(self, site, sid, color, category=None):
        self.form(site, sid)
        self.upload(site, color=color)
        if category:
            site.page.locator('#category').fill(category)
        self.save(site)
        return next(s for s in self.state(site)['subscriptions'] if s['id'] == sid)

    def confirm(self, site, sid):
        site.page.locator('[data-nav=home]').click()
        site.page.locator(f'[data-detail="{sid}"]').first.click()
        site.page.locator('[data-confirm]').click()
        site.page.clock.run_for(800)
        self.settings(site)
        return copy.deepcopy(self.state(site)['payments'])

    def image(self, site, reference):
        value = site.page.evaluate('ref=>logoStore.resolve(ref)', reference)
        self.assertIsNotNone(value)
        mime, encoded = value.split(';base64,')
        raw = base64.b64decode(encoded)
        if reference.startswith('sumi-logo:'):
            self.assertEqual(reference, 'sumi-logo:' + hashlib.sha256(raw).hexdigest())
        return raw, mime.removeprefix('data:')

    def test_formats_preferences_extensions_restore_refresh_relogin_and_guest(self):
        desktop = self.site()
        guest = desktop.raw_guest()
        for fmt, color in [('PNG', 'blue'), ('JPEG', 'red'), ('WEBP', 'green')]:
            self.add(desktop, fmt, color)
        # Extend a real JSON backup through the supported import UI; this is not
        # a direct mutation of application state or a replacement engine.
        original = self.state(desktop)
        original['customCategories'] = ['私人分類 / Tools', '特殊カテゴリー']
        original['subscriptions'][0]['serviceSettings'] = {'plan': '家庭', 'region': 'JP', 'nested': [True, 1.23456789]}
        prefs = desktop.page.evaluate('structuredClone(preferences)')
        prefs['serviceDefaults'] = {'calendarWeek': 'monday', 'custom': '保留'}
        self.settings(desktop)
        desktop.page.locator('#importFile').set_input_files({'name': 'extensions.json', 'mimeType': 'application/json',
            'buffer': json.dumps({'version': 1, 'data': original, 'preferences': prefs}).encode()})
        desktop.page.wait_for_function("document.querySelector('#importFile').value === ''")
        payments = self.confirm(desktop, original['subscriptions'][0]['id'])
        self.prefs(desktop, language='ja-JP', theme='dark', currency='JPY', reminder=14, motion='reduce')
        original = self.state(desktop)
        self.assertEqual(self.cloud.calls, [], 'No private RPC before opt-in')
        self.connect(desktop, 'upload')
        expected = {s['id']: self.image(desktop, s['logo']) for s in original['subscriptions']}
        self.assertEqual(len(self.images.objects), 3)
        for path, (raw, mime) in self.images.objects.items():
            self.assertTrue(path.startswith('sumi-private-logos/' + A + '/' + hashlib.sha256(raw).hexdigest()))
            self.assertIn((raw, mime), expected.values())
        pref_ids = {row['id'] for row in self.cloud.rows.values() if row['kind'] == 'preferences'}
        self.assertEqual(pref_ids, {'language', 'theme', 'currency', 'reminder', 'serviceDefaults'})
        wire = json.dumps(self.cloud.pushes)
        for secret in ('access_token', 'refresh_token', 'test-password', 'sumi-auth-v1', 'sumi-fx-cache-v1', 'deviceId', 'workspace-choice'):
            self.assertNotIn(secret, wire)
        tablet = self.site((820, 1180))
        self.connect(tablet, 'restore')
        self.assertCountEqual(self.state(tablet)['subscriptions'], original['subscriptions'])
        self.assertEqual(self.state(tablet)['payments'], payments)
        self.assertEqual(self.state(tablet)['customCategories'], original['customCategories'])
        self.assertEqual(tablet.page.evaluate('preferences.serviceDefaults'), prefs['serviceDefaults'])
        self.assertEqual(tablet.page.evaluate('preferences.motion'), 'system')
        expect(tablet.page.locator('html')).to_have_attribute('lang', 'ja-JP')
        expect(tablet.page.locator('html')).to_have_attribute('data-theme', 'dark')
        for key, value in [('currency', 'JPY'), ('reminder', '14')]:
            expect(tablet.page.locator('#' + key)).to_have_value(value)
        for site in (desktop, tablet):
            site.page.reload()
            expect(site.page.locator('[data-add]')).to_be_visible()
            self.synced(site)
            for row in self.state(site)['subscriptions']:
                self.assertEqual(self.image(site, row['logo']), expected[row['id']])
            # Preserve production lazy loading: reveal each image before
            # checking decoding, including cards below the tablet fold.
            logos = site.page.locator('img[data-logo-ref]:visible')
            self.assertGreater(logos.count(), 0)
            for logo in logos.all():
                logo.scroll_into_view_if_needed()
                expect(logo).to_have_js_property('complete', True)
                self.assertGreater(logo.evaluate('i=>i.naturalWidth'), 0)
            self.assertEqual(self.state(site)['payments'], payments)
            self.assertFalse(site.page.evaluate('document.documentElement.scrollWidth > innerWidth'))
        self.settings(tablet)
        tablet.page.locator('#accountSignOut').click()
        expect(tablet.page.locator('#auth-email')).to_be_visible()
        tablet.login()
        expect(tablet.page.locator('[data-add]')).to_be_visible()
        self.synced(tablet)
        self.assertEqual(self.state(tablet)['payments'], payments)
        self.settings(desktop)
        self.assertEqual(desktop.raw_guest(), guest, 'account work must not touch guest bytes')
        desktop.page.locator('#accountGuest').click()
        expect(desktop.page.locator('[data-add]')).to_be_visible()
        # Once the guest workspace is open, its invalid reference-rate fixture
        # may refresh normally. Business records and preferences stay verbatim.
        self.assertEqual(desktop.raw_guest()[:2], guest[:2])
        before = (len(self.cloud.calls), len(self.images.calls))
        self.settings(desktop)
        desktop.page.evaluate("dispatchEvent(new Event('online'))")
        expect(desktop.page.locator('#syncPanel [data-sync-action]')).to_have_count(0)
        self.assertEqual((len(self.cloud.calls), len(self.images.calls)), before)

    def test_offline_logo_preference_retry_after_reopen_and_lost_upload_receipt(self):
        desktop = self.site()
        sid = self.add(desktop)
        payments = self.confirm(desktop, sid)
        self.connect(desktop, 'upload')
        phone = self.site((390, 844))
        self.connect(phone, 'restore')
        self.offline(phone, True)
        changed = self.replace(phone, sid, 'purple', '離線分類')
        self.prefs(phone, language='en', theme='dark', currency='USD', reminder=7, motion='reduce')
        local = self.state(phone)
        pending = phone.page.evaluate('storage.snapshot().metadata.outbox')
        self.assertGreater(len(pending), 0)
        self.assertNotEqual(self.cloud.rows[('subscriptions', sid)]['payload']['logo'], changed['logo'])
        phone.page.reload()
        expect(phone.page.locator('[data-add]')).to_be_visible()
        self.assertEqual(self.state(phone), local)
        self.assertEqual(phone.page.evaluate('storage.snapshot().metadata.outbox'), pending)
        raw = self.image(phone, changed['logo'])
        self.images.drop_upload_ack = True
        pushes = len(self.cloud.pushes)
        self.offline(phone, False)
        phone.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='error'")
        self.assertEqual(len(self.cloud.pushes), pushes, 'No subscription may reference an unverified image')
        self.assertGreater(phone.page.evaluate('syncController.model().pending'), 0)
        self.sync(phone)
        self.sync(desktop)
        self.assertEqual(self.state(desktop), local)
        self.assertEqual(self.image(desktop, changed['logo']), raw)
        self.assertEqual(self.state(desktop)['payments'], payments)
        self.assertEqual(desktop.page.evaluate('preferences.language'), 'en')
        self.assertEqual(desktop.page.evaluate('preferences.motion'), 'system')
        self.assertEqual(len(self.images.objects), 2, 'duplicate retry must not add or overwrite an object')
        self.assertEqual(self.cloud.rows[('subscriptions', sid)]['revision'], 2)
        self.assertFalse(phone.page.evaluate('document.documentElement.scrollWidth > innerWidth'))

    def test_conflicting_logo_category_and_language_keep_both_until_choice(self):
        desktop = self.site()
        sid = self.add(desktop)
        payments = self.confirm(desktop, sid)
        self.connect(desktop, 'upload')
        tablet = self.site((820, 1180))
        self.connect(tablet, 'restore')
        self.offline(tablet, True)
        local = self.replace(tablet, sid, 'purple', '本地分類')
        self.prefs(tablet, language='en')
        remote = self.replace(desktop, sid, 'orange', '雲端分類')
        self.prefs(desktop, language='zh-TW')
        self.sync(desktop)
        self.offline(tablet, False)
        tablet.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='conflict'")
        groups = tablet.page.evaluate('syncController.model().conflicts')
        records = [r for group in groups for r in group['records']]
        sub = next(r for r in records if r['kind'] == 'subscriptions')
        self.assertEqual(sub['local'], local)
        self.assertEqual(sub['remote'], remote)
        language = next(r for r in records if r['kind'] == 'preferences' and r['id'] == 'language')
        self.assertEqual(language['local'], {'value': 'en'})
        self.assertEqual(language['remote'], {'value': 'zh-TW'})
        self.assertEqual(self.state(tablet)['payments'], payments)
        self.settings(tablet)
        for group in groups:
            choice = 'remote' if any(r['kind'] == 'subscriptions' for r in group['records']) else 'local'
            panel = tablet.page.locator(f'[data-sync-conflict="{group["id"]}"]')
            panel.locator('summary').click()
            panel.locator(f'[data-sync-action={choice}]').click()
            tablet.page.wait_for_function('!syncController.isBusy()')
        self.sync(tablet)
        self.sync(desktop)
        for site in (desktop, tablet):
            self.assertEqual(self.state(site)['subscriptions'], [remote])
            self.assertEqual(site.page.evaluate('preferences.language'), 'en')
            self.assertEqual(self.state(site)['payments'], payments)
            self.image(site, remote['logo'])

    def test_invalid_private_images_block_restore_without_changing_existing_data(self):
        desktop = self.site()
        sid = self.add(desktop)
        self.confirm(desktop, sid)
        self.connect(desktop, 'upload')
        tablet = self.site((820, 1180))
        self.add(tablet, color='red')
        local = self.state(tablet)
        prefs = tablet.page.evaluate('structuredClone(preferences)')
        reference = local['subscriptions'][0]['logo']
        original_image = self.image(tablet, reference)
        self.settings(tablet)
        tablet.page.locator('[data-sync-action=inspect]').click()
        expect(tablet.page.locator('.sync-preview')).to_be_visible()
        for fault, code in [('hash', 'sync-image-invalid'), ('mime', 'sync-image-invalid'), ('malformed', 'sync-image-invalid'),
                            ('oversized', 'sync-image-too-large'), ('missing', 'sync-image-missing'), ('denied', 'sync-permission'), ('network', 'sync-network')]:
            with self.subTest(fault=fault):
                self.images.fault = fault
                tablet.page.locator('[data-sync-action=restore]').click()
                tablet.page.wait_for_function('!syncController.isBusy() && syncController.model().error !== null')
                self.assertEqual(tablet.page.evaluate('syncController.model().error'), code)
                self.assertEqual(self.state(tablet), local)
                self.assertEqual(tablet.page.evaluate('preferences'), prefs)
                self.assertFalse(tablet.page.evaluate('syncController.model().enabled'))
                self.assertEqual(self.image(tablet, reference), original_image)
        self.images.fault = None
        tablet.page.locator('[data-sync-action=restore]').click()
        self.synced(tablet)
        self.assertEqual(tablet.page.evaluate('storage.snapshot().metadata.backup.data'), local)
        self.assertEqual(self.state(tablet), self.state(desktop))
        self.image(tablet, reference)  # replaced local backup's image remains durable

    def test_sdk_private_storage_owner_mime_size_and_immutable_object_rejections(self):
        desktop = self.site()
        self.add(desktop)
        self.connect(desktop, 'upload')
        path = next(iter(self.images.objects)).removeprefix('sumi-private-logos/')
        before = copy.deepcopy(self.images.objects)
        other = self.site((390, 844), uid=B)
        outcome = other.page.evaluate('''async path=>{
          const sdk=await SumiAccess.syncClient(),bucket=sdk.storage.from('sumi-private-logos');
          const read=await bucket.download(path);
          const write=await bucket.upload(path,new Blob(['bad'],{type:'image/png'}));
          return [read,write].map(r=>Number(r.error?.statusCode||r.error?.status));
        }''', path)
        self.assertEqual(outcome, [403, 403])
        outcome = desktop.page.evaluate('''async ({path,url,key})=>{
          const sdk=await SumiAccess.syncClient(),bucket=sdk.storage.from('sumi-private-logos');
          const invalid=await bucket.upload(path.replace(/[^/]+$/, 'a'.repeat(64)+'.png'),new Blob(['<svg/>'],{type:'image/svg+xml'}));
          const large=await bucket.upload(path.replace(/[^/]+$/, 'b'.repeat(64)+'.png'),new Blob([new Uint8Array(12*1024*1024+1)],{type:'image/png'}));
          const replace=await bucket.upload(path,new Blob(['replace'],{type:'image/png'}),{upsert:true});
          const anonymous=supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
          const anon=await anonymous.storage.from('sumi-private-logos').download(path);
          return [invalid,large,replace,anon].map(r=>Number(r.error?.statusCode||r.error?.status));
        }''', {'path': path, 'url': URL, 'key': KEY})
        self.assertEqual(outcome, [415, 413, 403, 403])
        self.assertEqual(self.images.objects, before)
        self.assertEqual(self.state(other)['subscriptions'], [])

    def test_restored_logo_survives_idb_unavailable_with_inline_fallback(self):
        desktop = self.site()
        sid = self.add(desktop)
        payments = self.confirm(desktop, sid)
        self.connect(desktop, 'upload')
        original = self.state(desktop)['subscriptions'][0]
        tablet = self.site((820, 1180), no_idb=True)
        self.connect(tablet, 'restore')
        restored = self.state(tablet)['subscriptions'][0]
        self.assertTrue(restored['logo'].startswith('data:image/'))
        self.assertEqual(self.image(tablet, restored['logo']), self.image(desktop, original['logo']))
        self.assertEqual({**restored, 'logo': original['logo']}, original)
        self.offline(tablet, True)
        tablet.page.reload()
        expect(tablet.page.locator('[data-add]')).to_be_visible()
        self.assertEqual(self.state(tablet)['payments'], payments)
        self.assertEqual(self.state(tablet)['subscriptions'][0], restored)
        self.offline(tablet, False)
        self.sync(tablet)
        self.assertEqual(self.cloud.rows[('subscriptions', sid)]['payload']['logo'], original['logo'])
        self.assertEqual(self.cloud.rows[('subscriptions', sid)]['revision'], 1)


if __name__ == '__main__':
    unittest.main()
