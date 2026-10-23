"""Phase-six integration checks in simulated Chromium; not physical Safari/iPadOS.

Service-worker lifecycle/offline navigation is covered separately in test_stage6_pwa.
These tests keep the service worker blocked to exercise the current files directly.
"""
import base64
import copy
from io import BytesIO
import json
import random
import re
import unittest

from PIL import Image
from playwright.sync_api import expect

from browser_support import Harness, FIXTURE, PREFS


class StageSixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()
        buffer = BytesIO()
        Image.frombytes('RGB', (1024, 1024), random.Random(6).randbytes(1024 * 1024 * 3)).save(buffer, format='PNG')
        cls.large_image = {'name': 'photo.png', 'mimeType': 'image/png', 'buffer': buffer.getvalue()}

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages, self.errors, self.messages = [], [], []
        self.page = self.new_page()

    def new_page(self, **kwargs):
        page = self.h.page(**kwargs)
        self.pages.append(page)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('dialog', self.dialog)
        return page

    def dialog(self, dialog):
        self.messages.append(dialog.message)
        dialog.accept()

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [], 'Unhandled JavaScript error')

    def navigate(self, view):
        self.page.locator(f'[data-nav={view}]').click()

    def seed(self, data, prefs=PREFS):
        self.page.evaluate('''([data,prefs]) => {
            localStorage.setItem('sumi-data-v1',JSON.stringify(data));
            localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
        }''', [data, prefs])
        self.page.reload()
        self.page.wait_for_function('!fxManager.getState().loading')

    def store(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def raw_data_and_fx(self):
        return self.page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")

    @staticmethod
    def small_image(color='red'):
        buffer = BytesIO()
        Image.new('RGBA', (16, 16), color).save(buffer, format='PNG')
        return {'name':'logo.png', 'mimeType':'image/png', 'buffer':buffer.getvalue()}

    def open_form(self, name='Uploaded service', amount='18.50'):
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill(name)
        self.page.locator('#amount').fill(amount)
        self.page.locator('#nextDate').fill('2026-11-15')

    def upload(self, picture=None):
        self.page.locator('#openPicker').click()
        self.page.locator('#uploadLogo').set_input_files(picture or self.small_image())
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        self.loaded(self.page.locator('#openPicker img'))

    def submit(self):
        self.page.locator('#subscriptionForm [type=submit]').click()
        expect(self.page.locator('#subscriptionForm')).to_have_count(0)

    def loaded(self, locator):
        expect(locator).to_have_count(1)
        expect(locator).to_be_visible()
        expect(locator).to_have_attribute('src', re.compile(r'^(?:data:image/|assets/brands/|https://)'))
        locator.evaluate('image => image.decode()')
        self.assertTrue(locator.evaluate('image => image.complete && image.naturalWidth > 0'))

    def export(self):
        self.navigate('settings')
        with self.page.expect_download() as event:
            self.page.locator('#export').click()
        return json.loads(event.value.path().read_text())

    def import_backup(self, backup):
        self.navigate('settings')
        self.page.locator('#importFile').set_input_files({
            'name':'sumi.json', 'mimeType':'application/json', 'buffer':json.dumps(backup).encode(),
        })
        self.page.wait_for_function("document.querySelector('#importFile').files.length === 0")

    def test_large_image_is_compressed_before_durable_indexeddb_reference_is_saved(self):
        self.assertGreater(len(self.large_image['buffer']), 500000)
        self.open_form()
        self.upload(self.large_image)
        self.submit()
        record = self.store()['subscriptions'][0]
        self.assertRegex(record['logo'], r'^sumi-logo:[a-f0-9]{64}$')
        encoded = self.page.evaluate('reference => SumiLogoStore.resolve(reference)', record['logo'])
        self.assertRegex(encoded, r'^data:image/(webp|png);base64,')
        output = base64.b64decode(encoded.split(',', 1)[1])
        self.assertLessEqual(len(output), 300000)
        with Image.open(BytesIO(output)) as image:
            self.assertLessEqual(max(image.size), 512)
        # Large binary content is deliberately absent from the business store.
        self.assertLess(len(json.dumps(self.store())), 5000)
        self.assertEqual((record['name'], record['amount'], record['currency']), ('Uploaded service', 18.5, 'CNY'))

    def test_indexeddb_logo_is_consistent_in_list_detail_statistics_edit_and_reload(self):
        self.open_form()
        self.upload()
        self.submit()
        record = self.store()['subscriptions'][0]
        for _ in range(2):
            self.navigate('list')
            self.loaded(self.page.locator('tr[data-detail] img.logo'))
            self.page.locator('tr[data-detail]').click()
            self.loaded(self.page.locator('.detail-hero img.logo'))
            self.page.locator('[data-edit]').click()
            self.loaded(self.page.locator('#openPicker img'))
            self.page.locator('#modalOverlay [data-close]').first.click()
            self.navigate('stats')
            self.loaded(self.page.locator('[data-shares=service] .stats-service img.logo').first)
            self.page.reload()
            self.page.wait_for_function('!fxManager.getState().loading')
        self.assertEqual(self.store()['subscriptions'][0]['logo'], record['logo'])

    def test_export_embeds_logo_bytes_and_import_into_fresh_storage_preserves_history(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['payments'] = [{'id':'legacy', 'subscriptionId':'reading', 'name':'Original payment',
                                'amount':27.125, 'currency':'CNY', 'date':'2026-10-21', 'note':'keep exactly'}]
        self.seed(fixture)
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        self.upload()
        self.submit()
        before = self.raw_data_and_fx()
        original = self.store()
        backup = self.export()
        self.assertRegex(backup['data']['subscriptions'][0]['logo'], r'^data:image/(png|webp);base64,')
        self.assertEqual(backup['data']['payments'], fixture['payments'])
        self.assertEqual(self.raw_data_and_fx(), before)
        self.page = self.new_page()
        self.import_backup(backup)
        self.assertEqual(self.store()['payments'], original['payments'])
        self.assertEqual(self.store()['costHistory'], original['costHistory'])
        self.navigate('list')
        self.loaded(self.page.locator('tr[data-detail=reading] img.logo'))
        self.assertEqual(self.page.evaluate('fxManager.getState().snapshot.rates.CNY'), 7.8)

    def test_portable_backup_restores_logo_after_indexeddb_has_been_cleared(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['payments'] = [{'id':'restored', 'subscriptionId':'reading', 'name':'Kept payment',
                                'amount':27.125, 'currency':'CNY', 'date':'2026-10-21'}]
        self.seed(fixture)
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        self.upload()
        self.submit()
        old_reference = self.store()['subscriptions'][0]['logo']
        original = self.store()
        backup = self.export()
        embedded = backup['data']['subscriptions'][0]['logo']
        self.page.evaluate("""async () => {
            SumiLogoStore.close();
            await new Promise((resolve,reject) => {
                const request=indexedDB.deleteDatabase(SumiLogoStore.DB_NAME);
                request.onsuccess=()=>resolve();
                request.onerror=()=>reject(request.error);
                request.onblocked=()=>reject(new Error('Unexpected active database connection'));
            });
        }""")
        self.assertIsNone(self.page.evaluate('reference=>SumiLogoStore.resolve(reference)', old_reference))
        self.import_backup(backup)
        reference = self.store()['subscriptions'][0]['logo']
        self.assertRegex(reference, r'^sumi-logo:[a-f0-9]{64}$')
        self.assertEqual(self.page.evaluate('reference=>SumiLogoStore.resolve(reference)', reference), embedded)
        self.assertEqual(self.store()['payments'], original['payments'])
        self.assertEqual(self.store()['costHistory'], original['costHistory'])
        self.page.reload()
        self.navigate('list')
        self.loaded(self.page.locator('[data-detail=reading] img.logo'))

    def test_async_import_never_discards_a_form_or_picker_opened_while_it_waits(self):
        for stage in ('file_read', 'logo_storage'):
            with self.subTest(stage=stage):
                self.page = self.new_page(data=FIXTURE, prefs={**PREFS,'language':'en'})
                backup_data = copy.deepcopy(FIXTURE)
                backup_data['subscriptions'][0]['name'] = 'Imported replacement'
                backup_data['subscriptions'][0]['logo'] = 'data:image/png;base64,' + base64.b64encode(self.small_image()['buffer']).decode()
                backup = {'version':1, 'data':backup_data, 'preferences':PREFS}
                self.navigate('settings')
                before = self.raw_data_and_fx()
                if stage == 'file_read':
                    self.page.evaluate("""() => {
                        const read = File.prototype.text;
                        File.prototype.text = function() {
                            const file = this;
                            return new Promise((resolve,reject) => {
                                window.releaseImport = () => read.call(file).then(resolve,reject);
                            });
                        };
                    }""")
                else:
                    self.page.evaluate("""() => {
                        const digest = crypto.subtle.digest.bind(crypto.subtle);
                        crypto.subtle.digest = (...args) => new Promise((resolve,reject) => {
                            window.releaseImport = () => digest(...args).then(resolve,reject);
                        });
                    }""")
                self.page.locator('#importFile').set_input_files({
                    'name':'delayed.json', 'mimeType':'application/json', 'buffer':json.dumps(backup).encode(),
                })
                self.page.wait_for_function('typeof window.releaseImport === "function"')
                self.navigate('home')
                self.open_form('Unsaved draft', '25.50')
                self.page.locator('#openPicker').click()
                self.page.locator('#pickerSearch').fill('github')
                self.page.evaluate('window.releaseImport()')
                self.page.wait_for_function('!importing')
                self.assertEqual(self.raw_data_and_fx(), before)
                expect(self.page.locator('#pickerOverlay')).to_have_count(1)
                expect(self.page.locator('#pickerSearch')).to_have_value('github')
                expect(self.page.locator('#name')).to_have_value('Unsaved draft')
                expect(self.page.locator('#amount')).to_have_value('25.50')
                self.assertRegex(self.messages[-1].lower(), r'import|edit|draft')
                self.page.locator('#closePicker').click()
                expect(self.page.locator('#pickerOverlay')).to_have_count(0)
                expect(self.page.locator('#subscriptionForm')).to_have_count(1)
                expect(self.page.locator('#name')).to_have_value('Unsaved draft')

    def test_closing_picker_invalidates_upload_before_its_exit_animation_finishes(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['logo'] = 'assets/brands/github.svg'
        self.seed(fixture)
        self.page.emulate_media(reduced_motion='no-preference')
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        self.page.locator('#openPicker').click()
        original = self.page.evaluate('selectedLogo')
        before = self.raw_data_and_fx()
        self.page.evaluate("""() => {
            const read = File.prototype.arrayBuffer;
            File.prototype.arrayBuffer = function() {
                const file = this;
                return new Promise((resolve,reject) => {
                    window.releaseUpload = () => read.call(file).then(resolve,reject);
                });
            };
            const revoke = URL.revokeObjectURL.bind(URL);
            window.uploadReadDone = new Promise(resolve => {
                URL.revokeObjectURL = url => { revoke(url); resolve(); };
            });
        }""")
        self.page.locator('#uploadLogo').set_input_files(self.small_image('blue'))
        self.page.wait_for_function('typeof window.releaseUpload === "function" && logoUploading')
        # Pause the JS fallback timer and the actual exit animations independently.
        self.page.clock.pause_at(self.page.evaluate('Date.now() + 1000'))
        state = self.page.evaluate("""() => {
            const generation = uploadGeneration;
            document.querySelector('#closePicker').click();
            const overlay = document.querySelector('#pickerOverlay');
            overlay.getAnimations({subtree:true}).forEach(animation => animation.pause());
            return {generation, current:uploadGeneration, uploading:logoUploading,
                    picker, exists:Boolean(overlay)};
        }""")
        self.assertGreater(state['current'], state['generation'])
        self.assertFalse(state['uploading'])
        self.assertTrue(state['picker'])
        self.assertTrue(state['exists'])
        state = self.page.evaluate("""async () => {
            window.releaseUpload();
            await window.uploadReadDone;
            await Promise.resolve();
            await Promise.resolve();
            return {selectedLogo, draftLogo:formDraft.logo, picker, uploading:logoUploading};
        }""")
        self.assertEqual(state, {'selectedLogo':original, 'draftLogo':original,
                                'picker':True, 'uploading':False})
        self.assertEqual(self.raw_data_and_fx(), before)
        self.page.evaluate("document.querySelector('#pickerOverlay').getAnimations({subtree:true}).forEach(animation=>animation.finish())")
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        self.page.clock.resume()
        expect(self.page.locator('#openPicker img')).to_have_attribute('src', original)
        expect(self.page.locator('#subscriptionForm')).to_have_count(1)
        self.assertEqual(self.raw_data_and_fx(), before)

    def test_indexeddb_unavailable_falls_back_to_compressed_embedded_logo(self):
        self.page = self.new_page(init="Object.defineProperty(window, 'indexedDB', {value:{open(){throw new DOMException('Blocked','SecurityError')}}});")
        self.open_form()
        self.upload(self.large_image)
        self.submit()
        logo = self.store()['subscriptions'][0]['logo']
        self.assertRegex(logo, r'^data:image/(png|webp);base64,')
        self.assertLessEqual(len(base64.b64decode(logo.split(',', 1)[1])), 300000)
        self.page.reload()
        self.loaded(self.page.locator('tr[data-detail] img.logo'))

    def test_missing_indexeddb_asset_preserves_record_and_blocks_incomplete_export(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['logo'] = 'sumi-logo:' + 'a' * 64
        self.seed(fixture, {**PREFS, 'language':'en'})
        before = self.raw_data_and_fx()
        expect(self.page.locator('tr[data-detail=reading] .logo.fallback')).to_have_count(1)
        self.assertEqual(self.raw_data_and_fx(), before)
        downloads = []
        self.page.on('download', lambda download: downloads.append(download))
        self.navigate('settings')
        with self.page.expect_event('dialog'):
            self.page.locator('#export').click()
        self.assertEqual(downloads, [])
        self.assertRegex(self.messages[-1].lower(), r'logo|image')
        self.assertNotRegex(self.messages[-1], r'[\u3400-\u9fff]')
        self.assertEqual(self.raw_data_and_fx(), before)

    def test_replacing_and_removing_logo_does_not_delete_previous_durable_bytes(self):
        self.open_form()
        self.upload(self.small_image('red'))
        self.submit()
        first = self.store()['subscriptions'][0]['logo']
        first_bytes = self.page.evaluate('reference => SumiLogoStore.resolve(reference)', first)
        self.navigate('list')
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-edit]').click()
        self.upload(self.small_image('blue'))
        self.submit()
        second = self.store()['subscriptions'][0]['logo']
        self.assertNotEqual(first, second)
        self.assertEqual(self.page.evaluate('reference => SumiLogoStore.resolve(reference)', first), first_bytes)
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-edit]').click()
        self.page.locator('#openPicker').click()
        self.page.locator('#removeLogo').click()
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'], '')
        self.assertIsNotNone(self.page.evaluate('reference => SumiLogoStore.resolve(reference)', second))
        self.assertEqual(self.page.evaluate('reference => SumiLogoStore.resolve(reference)', first), first_bytes)

    def test_failed_business_save_keeps_form_and_existing_logo_history_and_rates(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['payments'] = [{'id':'old', 'subscriptionId':'reading', 'name':'Reading', 'amount':28, 'currency':'CNY', 'date':'2026-10-21'}]
        self.seed(fixture)
        before = self.raw_data_and_fx()
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        self.upload()
        self.page.evaluate('''() => {
            const setItem = Storage.prototype.setItem;
            let fail = true;
            Storage.prototype.setItem = function(key,value) {
                if (key === 'sumi-data-v1' && fail) { fail=false; throw new DOMException('Quota','QuotaExceededError'); }
                return setItem.call(this,key,value);
            };
        }''')
        self.page.locator('#subscriptionForm [type=submit]').click()
        expect(self.page.locator('#subscriptionForm')).to_have_count(1)
        self.loaded(self.page.locator('#openPicker img'))
        self.assertEqual(self.raw_data_and_fx(), before)
        self.assertTrue(self.messages)
        self.submit()
        self.assertEqual(self.store()['payments'], fixture['payments'])
        self.assertRegex(self.store()['subscriptions'][0]['logo'], r'^sumi-logo:')

    def test_legacy_embedded_logo_and_unknown_fields_remain_byte_identical_on_open(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['logo'] = 'data:image/png;base64,' + base64.b64encode(self.small_image()['buffer']).decode()
        fixture['subscriptions'][0]['customField'] = {'keep':'原始值'}
        raw = json.dumps(fixture, ensure_ascii=False, indent=2)
        self.page.evaluate("raw => localStorage.setItem('sumi-data-v1',raw)", raw)
        self.page.reload()
        self.loaded(self.page.locator('tr[data-detail=reading] img.logo'))
        self.assertEqual(self.page.evaluate("localStorage.getItem('sumi-data-v1')"), raw)
        self.navigate('settings')
        self.page.locator('#motion').select_option('reduce')
        self.assertEqual(self.page.evaluate("localStorage.getItem('sumi-data-v1')"), raw)
        exported = self.export()
        self.assertEqual(exported['data']['subscriptions'][0]['logo'], fixture['subscriptions'][0]['logo'])
        self.assertEqual(exported['data']['subscriptions'][0]['customField'], {'keep':'原始值'})

    def test_indexeddb_logo_remains_available_offline_without_touching_payments_or_rates(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['payments'] = [{'id':'offline', 'subscriptionId':'reading', 'name':'Reading',
                                'amount':28, 'currency':'CNY', 'date':'2026-10-21'}]
        self.seed(fixture)
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        self.upload()
        self.submit()
        before = self.raw_data_and_fx()
        self.page.context.set_offline(True)
        self.navigate('stats')
        self.loaded(self.page.locator('[data-shares=service] .stats-service img.logo').first)
        self.navigate('list')
        self.loaded(self.page.locator('[data-detail=reading] img.logo'))
        self.page.locator('[data-detail=reading]').click()
        self.loaded(self.page.locator('.detail-hero img.logo'))
        self.assertEqual(self.raw_data_and_fx(), before)
        self.assertEqual(self.store()['payments'], fixture['payments'])

    def test_motion_choice_persists_and_never_rewrites_business_or_fx_data(self):
        self.seed(FIXTURE)
        before = self.raw_data_and_fx()
        self.navigate('settings')
        self.page.locator('#motion').select_option('reduce')
        expect(self.page.locator('html')).to_have_attribute('data-motion', 'reduce')
        self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('sumi-prefs-v1')).motion"), 'reduce')
        self.page.reload()
        self.navigate('settings')
        expect(self.page.locator('#motion')).to_have_value('reduce')
        self.assertEqual(self.raw_data_and_fx(), before)
        self.navigate('home')
        self.open_form('Still editable')
        duration = self.page.locator('#modalOverlay .modal').evaluate('el => getComputedStyle(el).animationDuration')
        self.assertTrue(all(float(value.strip().removesuffix('s')) <= 0.001 for value in duration.split(',')), duration)

    def test_system_reduced_motion_changes_without_replacing_draft_or_focus(self):
        self.page.emulate_media(reduced_motion='no-preference')
        self.open_form('Draft 动画', '23.50')
        self.page.locator('#name').focus()
        self.page.evaluate("window.motionDraft = document.querySelector('#name')")
        before = self.raw_data_and_fx()
        for value in ('reduce', 'no-preference', 'reduce'):
            self.page.emulate_media(reduced_motion=value)
            expect(self.page.locator('html')).to_have_attribute('data-motion', 'reduce' if value == 'reduce' else 'full')
            expect(self.page.locator('#name')).to_be_focused()
            expect(self.page.locator('#name')).to_have_value('Draft 动画')
            expect(self.page.locator('#amount')).to_have_value('23.50')
            self.assertTrue(self.page.evaluate("window.motionDraft === document.querySelector('#name')"))
            self.assertEqual(self.raw_data_and_fx(), before)
            if value == 'reduce':
                duration = self.page.locator('#modalOverlay .modal').evaluate('el => getComputedStyle(el).animationDuration')
                self.assertTrue(all(float(part.strip().removesuffix('s')) <= 0.001 for part in duration.split(',')), duration)

    def test_entry_motion_runs_for_navigation_but_not_fx_rerenders_of_a_draft(self):
        self.page.emulate_media(reduced_motion='no-preference')
        self.navigate('list')
        expect(self.page.locator('.main')).to_have_class(re.compile(r'sumi-enter-view'))
        self.assertGreater(float(self.page.locator('.main').evaluate('el=>getComputedStyle(el).animationDuration').removesuffix('s')), 0)
        self.navigate('home')
        self.open_form('Unchanged draft', '29')
        expect(self.page.locator('#modalOverlay')).to_have_class(re.compile(r'sumi-enter-overlay'))
        self.page.evaluate('fxManager.refresh({force:true})')
        self.page.wait_for_function('!fxManager.getState().loading')
        expect(self.page.locator('#modalOverlay')).not_to_have_class(re.compile(r'sumi-enter-overlay'))
        expect(self.page.locator('#name')).to_have_value('Unchanged draft')
        expect(self.page.locator('#amount')).to_have_value('29')
        self.assertIsNone(self.store())

    def test_subscription_search_keeps_input_node_and_keyboard_selection(self):
        self.seed(FIXTURE)
        self.navigate('list')
        search = self.page.locator('#search')
        search.focus()
        self.page.evaluate("window.searchInput = document.querySelector('#search')")
        search.fill('阅读')
        expect(search).to_be_focused()
        self.assertTrue(self.page.evaluate("window.searchInput === document.querySelector('#search')"))
        expect(self.page.locator('tr[data-detail]')).to_have_count(1)
        expect(self.page.locator('tr[data-detail]')).to_have_attribute('data-detail','reading')
        search.press('Control+A')
        search.press('Backspace')
        expect(self.page.locator('tr[data-detail]')).to_have_count(2)
        self.assertTrue(self.page.evaluate("window.searchInput === document.querySelector('#search')"))

    def test_four_language_motion_setting_is_readable_and_preserves_brand_search(self):
        for language in ('zh-CN','zh-TW','ja-JP','en'):
            with self.subTest(language=language):
                self.navigate('settings')
                self.page.locator('#language').select_option(language)
                labels = self.page.locator('#motion option').all_text_contents()
                self.assertEqual(len(labels), 2)
                self.assertTrue(all(label.strip() and 'undefined' not in label and 'stage6.' not in label for label in labels))
                if language == 'en':
                    self.assertNotRegex(' '.join(labels), r'[\u3400-\u9fff]')
                self.navigate('home')
                self.open_form()
                self.page.locator('#name').fill('奈飞')
                expect(self.page.locator('[data-suggest]').first).to_contain_text('Netflix')
                self.page.locator('#modalOverlay [data-close]').first.click()

    def assert_horizontal_fit(self):
        dimensions = self.page.evaluate('({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
        self.assertLessEqual(max(dimensions['document'], dimensions['body']), dimensions['width'] + 1, dimensions)

    def test_dark_layouts_fit_narrow_phone_phone_ipad_desktop_and_keep_home_rules(self):
        for width, height in ((320,740),(390,844),(820,1180),(1440,1000)):
            with self.subTest(viewport=(width,height)):
                self.page.set_viewport_size({'width':width,'height':height})
                self.seed(FIXTURE, {**PREFS,'theme':'dark','language':'en'})
                self.assert_horizontal_fit()
                chart = self.page.locator('.home-chart')
                if width <= 720:
                    expect(chart).to_be_hidden()
                else:
                    expect(chart).to_be_visible()
                for view in ('list','stats','calendar','settings'):
                    self.navigate(view)
                    self.assert_horizontal_fit()
                self.navigate('home')
                self.open_form('Responsive service')
                self.assert_horizontal_fit()
                dialog = self.page.locator('#modalOverlay .modal')
                box = dialog.bounding_box()
                self.assertGreaterEqual(box['x'], -1)
                self.assertLessEqual(box['x'] + box['width'], width + 1)
                self.page.locator('#openPicker').click()
                self.assert_horizontal_fit()
                self.page.locator('#pickerSearch').fill('GitHub')
                self.page.locator('#pickerSearch').press('ArrowDown')
                expect(self.page.locator('[data-pick]').first).to_be_focused()
                self.page.locator('[data-pick]').first.press('Enter')
                expect(self.page.locator('#openPicker')).to_be_focused()
                self.page.locator('#modalOverlay [data-close]').first.click()

    def test_simulated_visual_viewport_keeps_form_inside_keyboard_available_area(self):
        self.page.set_viewport_size({'width':390, 'height':844})
        self.open_form('Keyboard draft', '42')
        self.page.evaluate('''() => {
            Object.defineProperty(visualViewport,'height',{configurable:true,value:420});
            Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:40});
            visualViewport.dispatchEvent(new Event('resize'));
            visualViewport.dispatchEvent(new Event('scroll'));
        }''')
        self.page.clock.run_for(100)
        expect(self.page.locator('html')).to_have_attribute('data-keyboard', 'open')
        expect(self.page.locator('.sidebar')).to_be_hidden()
        box = self.page.locator('#modalOverlay .modal').bounding_box()
        self.assertGreaterEqual(box['y'], 39)
        self.assertLessEqual(box['y'] + box['height'], 461)
        self.page.locator('#category').fill('Keyboard category')
        self.page.locator('#subscriptionForm [type=submit]').scroll_into_view_if_needed()
        save_box = self.page.locator('#subscriptionForm [type=submit]').bounding_box()
        self.assertGreaterEqual(save_box['y'], 40)
        self.assertLessEqual(save_box['y'] + save_box['height'], 461)
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['category'], 'Keyboard category')


if __name__ == '__main__':
    unittest.main()
