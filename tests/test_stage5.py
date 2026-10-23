"""Four-language interactions and appearance modes in simulated Chromium viewports.

These checks do not claim physical Safari, iPadOS or native keyboard coverage.
"""
import copy
import json
import re
import unittest

from playwright.sync_api import expect

from browser_support import Harness, FIXTURE, PREFS, SIZES


LANGUAGES = ('zh-CN', 'zh-TW', 'ja-JP', 'en')
HEADINGS = {
    'zh-CN': ('首页', '订阅列表', '统计', '日历', '设置'),
    'zh-TW': ('首頁', '訂閱列表', '統計', '行事曆', '設定'),
    'ja-JP': ('ホーム', 'サブスクリプション', '統計', 'カレンダー', '設定'),
    'en': ('Home', 'Subscriptions', 'Statistics', 'Calendar', 'Settings'),
}
DIALOGS = {
    'zh-CN': ('添加订阅', '编辑订阅', '订阅详情', '补录付款', '编辑付款记录', '选择图标'),
    'zh-TW': ('新增訂閱', '編輯訂閱', '訂閱詳情', '補登付款', '編輯付款記錄', '選擇圖示'),
    'ja-JP': ('サブスクリプションを追加', 'サブスクリプションを編集', '契約の詳細', '支払いを記録', '支払い記録を編集', 'アイコンを選択'),
    'en': ('Add subscription', 'Edit subscription', 'Subscription details', 'Record payment', 'Edit payment', 'Choose logo'),
}
REQUIRED = {'zh-CN':'请填写此字段。', 'zh-TW':'請填寫此欄位。', 'ja-JP':'この項目を入力してください。', 'en':'Please fill in this field.'}
HAN = re.compile(r'[\u3400-\u9fff]')


class StageFiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

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

    def seed(self, data, prefs=PREFS):
        self.page.evaluate('''([data,prefs])=>{
            localStorage.setItem('sumi-data-v1',JSON.stringify(data));
            localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
        }''', [data,prefs])
        self.page.reload()
        self.page.wait_for_function('!fxManager.getState().loading')

    def navigate(self, view):
        self.page.locator(f'[data-nav={view}]').click()

    def language(self, language):
        self.navigate('settings')
        self.page.locator('#language').select_option(language)
        expect(self.page.locator('html')).to_have_attribute('lang', language)
        expect(self.page.locator('#language')).to_have_value(language)

    def theme(self, theme):
        self.navigate('settings')
        self.page.locator('#theme').select_option(theme)
        expect(self.page.locator('#theme')).to_have_value(theme)

    def store(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def raw_data_and_fx(self):
        return self.page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")

    def prefs(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-prefs-v1'))")

    def open_form(self, name='', amount=''):
        self.page.locator('[data-add]').click()
        if name:
            self.page.locator('#name').fill(name)
        if amount:
            self.page.locator('#amount').fill(amount)
        self.page.locator('#nextDate').fill('2026-10-31')

    def submit(self):
        self.page.locator('#subscriptionForm [type=submit]').click()
        expect(self.page.locator('#subscriptionForm')).to_have_count(0)

    @staticmethod
    def fixture():
        data = copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update(name='My service 设置', category='Music', logo='assets/brands/github.svg', note='日本語、中文 & English', extension={'keep':True})
        data['payments'] = [{'id':'old-payment','subscriptionId':'reading','name':'Original payment 名称',
                             'amount':27.125,'currency':'CNY','date':'2026-10-21','note':'do not translate'}]
        data['extension']={'unknown':['原始',1,True]}
        return data

    def assert_english(self, text):
        self.assertFalse(HAN.search(text), text)
        self.assertNotIn('undefined', text)
        self.assertNotRegex(text, r'\b(?:app|stats|error)\.[A-Za-z][A-Za-z0-9_.]*')

    def test_default_language_and_appearance_keep_the_existing_light_design(self):
        self.page.emulate_media(color_scheme='dark')
        expect(self.page.locator('html')).to_have_attribute('lang','zh-CN')
        expect(self.page.locator('html')).to_have_attribute('data-theme','light')
        expect(self.page.locator('.top h1')).to_have_text('首页')
        self.navigate('settings')
        expect(self.page.locator('#theme')).to_have_value('light')
        expect(self.page.locator('#language')).to_have_value('zh-CN')
        self.assertEqual(self.page.locator('#language option').evaluate_all('(options)=>options.map(o=>o.value)'), list(LANGUAGES))
        self.assertEqual(self.page.locator('#theme option').evaluate_all('(options)=>options.map(o=>o.value)'), ['light','dark','system'])

    def test_all_four_languages_switch_immediately_persist_and_cover_main_pages(self):
        for language in LANGUAGES:
            with self.subTest(language=language):
                self.language(language)
                self.assertEqual(self.prefs()['language'], language)
                for view, heading in zip(('home','list','stats','calendar','settings'), HEADINGS[language]):
                    self.navigate(view)
                    expect(self.page.locator('.top h1')).to_have_text(heading)
                self.page.reload()
                self.page.wait_for_function('!fxManager.getState().loading')
                expect(self.page.locator('.top h1')).to_have_text(HEADINGS[language][0])
                expect(self.page.locator('html')).to_have_attribute('lang',language)

    def test_all_four_languages_cover_add_edit_detail_payment_and_logo_dialogs(self):
        self.seed(self.fixture())
        for language in LANGUAGES:
            with self.subTest(language=language):
                self.language(language)
                self.navigate('home')
                self.open_form()
                expect(self.page.locator('#subscriptionTitle')).to_have_text(DIALOGS[language][0])
                expect(self.page.locator('#modalOverlay [role=dialog]')).to_have_attribute('aria-modal','true')
                self.page.locator('#openPicker').click()
                expect(self.page.locator('#pickerTitle')).to_have_text(DIALOGS[language][5])
                self.page.locator('#closePicker').click()
                expect(self.page.locator('#openPicker')).to_be_focused()
                self.page.locator('#modalOverlay [data-close]').first.click()
                self.navigate('list')
                self.page.locator('[data-detail=reading]').click()
                expect(self.page.locator('.drawer[role=dialog]')).to_have_attribute('aria-label',DIALOGS[language][2])
                self.page.locator('[data-payment]').click()
                expect(self.page.locator('#paymentTitle')).to_have_text(DIALOGS[language][3])
                self.page.locator('[data-close-payment]').first.click()
                self.page.locator('[data-edit-payment=old-payment]').click()
                expect(self.page.locator('#paymentTitle')).to_have_text(DIALOGS[language][4])
                self.page.locator('[data-close-payment]').first.click()
                self.page.locator('[data-edit]').click()
                expect(self.page.locator('#subscriptionTitle')).to_have_text(DIALOGS[language][1])
                self.page.locator('#modalOverlay [data-close]').first.click()

    def test_language_and_theme_changes_preserve_legacy_business_and_fx_bytes(self):
        legacy=self.fixture()
        for item in legacy['subscriptions']:
            for field in ('status','autoRenew','logo'):
                item.pop(field,None)
        raw=json.dumps(legacy,ensure_ascii=False,indent=3)
        self.page.evaluate('raw=>localStorage.setItem("sumi-data-v1",raw)',raw)
        self.page.reload()
        self.page.wait_for_function('!fxManager.getState().loading')
        before=self.raw_data_and_fx()
        for language in LANGUAGES:
            self.language(language)
            for theme in ('dark','system','light'):
                self.theme(theme)
                self.assertEqual(self.raw_data_and_fx(),before)
        self.page.reload()
        self.page.wait_for_function('!fxManager.getState().loading')
        self.assertEqual(self.raw_data_and_fx(),before)

    def test_settings_preserve_payment_frozen_exchange_snapshot(self):
        data=copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update(currency='USD',amount=20)
        self.seed(data)
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-confirm]').click()
        self.page.clock.run_for(1000)
        saved=self.store()
        self.assertEqual(saved['payments'][0]['fxSnapshot']['status'],'available')
        before=self.raw_data_and_fx()
        self.page.locator('[data-close-detail]').click()
        self.language('en')
        self.theme('dark')
        self.language('ja-JP')
        self.assertEqual(self.raw_data_and_fx(),before)
        self.assertEqual(self.store()['payments'],saved['payments'])

    def test_catalog_aliases_and_original_fields_work_in_every_language(self):
        for language in LANGUAGES:
            with self.subTest(language=language):
                self.language(language)
                self.navigate('home')
                self.open_form(amount='42.50')
                self.page.locator('#months').select_option('3')
                self.page.locator('#formCurrency').select_option('USD')
                self.page.locator('#name').fill('奈飞')
                expect(self.page.locator('[data-suggest=netflix]')).to_contain_text('Netflix')
                self.page.locator('#name').press('ArrowDown')
                active=self.page.locator('#name').get_attribute('aria-activedescendant')
                self.assertTrue(active)
                self.page.locator('#name').press('Enter')
                expect(self.page.locator('#name')).to_have_value('Netflix')
                expect(self.page.locator('#amount')).to_have_value('42.50')
                expect(self.page.locator('#months')).to_have_value('3')
                expect(self.page.locator('#nextDate')).to_have_value('2026-10-31')
                self.submit()
                saved=self.store()['subscriptions'][-1]
                self.assertEqual((saved['name'],saved['amount'],saved['currency'],saved['months'],saved['nextDate']),('Netflix',42.5,'USD',3,'2026-10-31'))
                self.assertEqual(saved['category'],'影音娱乐')
                self.assertEqual(saved['logo'],'assets/brands/netflix.svg')

    def test_english_subscription_edit_cancel_restore_failure_and_success_are_interactive(self):
        self.language('en')
        self.navigate('home')
        self.open_form('Private subscription 设置','15.25')
        self.page.locator('#category').fill('Music')
        self.submit()
        self.navigate('list')
        subscription=self.store()['subscriptions'][0]
        sid=subscription['id']
        self.page.locator(f'[data-detail="{sid}"]').click()
        self.page.locator('[data-toggle]').click()
        self.assertEqual(self.store()['subscriptions'][0]['status'],'cancelled')
        self.assertIn('cancel',self.messages[-1].lower())
        self.page.locator('[data-toggle]').click()
        self.assertEqual(self.store()['subscriptions'][0]['status'],'active')
        self.page.locator('[data-edit]').click()
        expect(self.page.locator('#category')).to_have_value('Music')
        self.page.locator('#amount').fill('22.50')
        self.submit()
        self.page.locator(f'[data-detail="{sid}"]').click()
        self.page.locator('[data-fail-payment]').click()
        failed=self.store()
        self.assertEqual(failed['subscriptions'][0]['nextDate'],'2026-10-31')
        self.assertEqual(failed['payments'][0]['status'],'failed')
        self.page.locator('[data-confirm]').click()
        self.page.clock.run_for(1000)
        saved=self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'],'2026-11-30')
        self.assertEqual(saved['subscriptions'][0]['name'],'Private subscription 设置')
        self.assertEqual(saved['subscriptions'][0]['category'],'Music')
        self.assertEqual([p['status'] for p in saved['payments']],['failed','succeeded'])
        self.assertEqual(saved['payments'][1]['amount'],22.5)
        self.assertIn('successful',self.messages[-1].lower())

    def test_empty_english_pages_and_dialogs_do_not_leak_chinese_ui(self):
        self.language('en')
        for view in ('home','list','stats','calendar','settings'):
            self.navigate(view)
            # Language names intentionally remain in their own scripts.
            text=self.page.locator('.main').evaluate('(node)=>{const copy=node.cloneNode(true);copy.querySelector("#language")?.remove();return copy.textContent}')
            self.assert_english(text)
        self.navigate('home')
        self.open_form()
        text=self.page.locator('#modalOverlay').evaluate('(node)=>{const copy=node.cloneNode(true);copy.querySelector("#categoryOptions")?.remove();return copy.textContent}')
        self.assert_english(text)
        self.page.locator('#name').fill('netflix')
        self.assert_english(self.page.locator('#suggestions').inner_text())
        self.page.locator('#openPicker').click()
        self.page.locator('#pickerSearch').fill('GitHub')
        self.assert_english(self.page.locator('#pickerOverlay').inner_text())

    def test_validation_messages_follow_each_selected_language(self):
        for language in LANGUAGES:
            with self.subTest(language=language):
                self.language(language)
                self.navigate('home')
                self.open_form()
                self.page.locator('#subscriptionForm [type=submit]').click()
                self.assertEqual(self.page.locator('#name').evaluate('(input)=>input.validationMessage'),REQUIRED[language])
                self.page.locator('#name').fill('Custom')
                self.page.locator('#amount').fill('12')
                self.assertTrue(self.page.locator('#name').evaluate('(input)=>input.checkValidity()'))
                self.page.locator('#modalOverlay [data-close]').first.click()

    def test_upload_error_is_translated_and_keeps_the_existing_logo(self):
        self.seed(self.fixture(),{**PREFS,'language':'en'})
        self.navigate('list')
        self.page.locator('[data-detail=reading]').click()
        self.page.locator('[data-edit]').click()
        original=self.page.locator('#openPicker img').get_attribute('src')
        self.page.locator('#openPicker').click()
        self.page.locator('#uploadLogo').set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg"/>'})
        expect(self.page.locator('#logoError')).to_be_visible()
        text=self.page.locator('#logoError').inner_text()
        self.assert_english(text)
        self.assertIn('PNG',text)
        self.assertIn('SVG',text)
        self.page.locator('#closePicker').click()
        expect(self.page.locator('#openPicker img')).to_have_attribute('src',original)

    def test_import_validation_error_is_translated_and_preserves_data(self):
        self.seed(self.fixture(),{**PREFS,'language':'en'})
        before=self.raw_data_and_fx()
        self.navigate('settings')
        with self.page.expect_event('dialog'):
            self.page.locator('#importFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps({'version':999,'data':{'subscriptions':[],'payments':[]}}).encode()})
        self.assertTrue(self.messages)
        self.assert_english(self.messages[-1])
        self.assertIn('1',self.messages[-1])
        self.assertEqual(self.raw_data_and_fx(),before)

    def test_failed_preference_save_has_translated_error_and_keeps_selected_mode(self):
        self.seed(self.fixture(),{**PREFS,'language':'en'})
        self.navigate('settings')
        before=self.raw_data_and_fx()
        self.page.evaluate('''()=>{
            const original=Storage.prototype.setItem;
            let fail=true;
            Storage.prototype.setItem=function(key,value){
                if(key==='sumi-prefs-v1'&&fail){fail=false;throw new DOMException('Quota exceeded','QuotaExceededError')}
                return original.call(this,key,value);
            };
        }''')
        self.page.locator('#theme').select_option('dark')
        self.assertTrue(self.messages)
        self.assert_english(self.messages[-1])
        self.assertIn('sav',self.messages[-1].lower())
        self.assertEqual(self.raw_data_and_fx(),before)
        self.assertEqual(self.prefs()['theme'],'light')
        expect(self.page.locator('html')).to_have_attribute('data-theme','light')
        expect(self.page.locator('#theme')).to_have_value('light')

    def test_manual_fx_refresh_error_is_translated_and_preserves_cache(self):
        self.language('en')
        before=self.raw_data_and_fx()
        self.page.context.route('https://api.frankfurter.dev/v1/**',lambda route:route.abort('internetdisconnected'))
        self.page.locator('#refreshRates').click()
        self.page.wait_for_function('!fxManager.getState().loading')
        state=self.page.evaluate('fxManager.getState()')
        self.assertTrue(state['error'])
        text=self.page.locator('.main').evaluate('(node)=>{const copy=node.cloneNode(true);copy.querySelector("#language")?.remove();return copy.textContent}')
        self.assert_english(text)
        self.assertEqual(self.raw_data_and_fx(),before)
        self.assertRegex(text.lower(),r'cache|cached')

    def test_missing_translation_has_stable_readable_fallback(self):
        self.language('en')
        result=self.page.evaluate("SumiI18n.t('missing.test.key')")
        self.assertIsInstance(result,str)
        self.assertTrue(result.strip())
        self.assertNotIn('missing.test.key',result)
        self.assertNotIn('undefined',result)
        self.assertEqual(result,self.page.evaluate("SumiI18n.t('missing.test.key')"))

    def test_localized_dates_numbers_and_money_do_not_change_original_values(self):
        data=copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update(name='International',amount=1234.5,currency='USD')
        self.seed(data)
        before=self.raw_data_and_fx()
        rendered=[]
        for language in LANGUAGES:
            self.language(language)
            self.navigate('list')
            row=self.page.locator('[data-detail=reading]')
            expected_date=self.page.evaluate("language=>new Intl.DateTimeFormat(language,{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date('2026-11-15T12:00:00Z'))",language)
            expect(row).to_contain_text(expected_date)
            self.assertIn('1,234.50',row.inner_text())
            rendered.append(row.inner_text())
            self.assertEqual(self.raw_data_and_fx(),before)
        self.assertNotEqual(rendered[0],rendered[-1])

    def test_theme_modes_persist_and_manual_choices_override_system(self):
        self.page.emulate_media(color_scheme='dark')
        for mode, expected in (('dark','dark'),('light','light'),('system','dark')):
            self.theme(mode)
            expect(self.page.locator('html')).to_have_attribute('data-theme',expected)
            self.assertEqual(self.prefs()['theme'],mode)
            self.page.reload()
            self.page.wait_for_function('!fxManager.getState().loading')
            expect(self.page.locator('html')).to_have_attribute('data-theme',expected)
        self.page.emulate_media(color_scheme='light')
        expect(self.page.locator('html')).to_have_attribute('data-theme','light')
        self.theme('dark')
        self.page.emulate_media(color_scheme='dark')
        self.page.emulate_media(color_scheme='light')
        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')

    def test_system_theme_change_preserves_open_form_focus_and_draft(self):
        self.theme('system')
        self.navigate('home')
        self.open_form('未保存の設定 draft','19.50')
        self.page.locator('#name').focus()
        self.page.evaluate("window.stage5Input=document.querySelector('#name')")
        before=self.raw_data_and_fx()
        for scheme in ('dark','light','dark'):
            self.page.emulate_media(color_scheme=scheme)
            expect(self.page.locator('html')).to_have_attribute('data-theme',scheme)
            expect(self.page.locator('#name')).to_be_focused()
            expect(self.page.locator('#name')).to_have_value('未保存の設定 draft')
            expect(self.page.locator('#amount')).to_have_value('19.50')
            self.assertTrue(self.page.evaluate("window.stage5Input===document.querySelector('#name')"))
            self.assertEqual(self.raw_data_and_fx(),before)

    def test_saved_dark_theme_applies_before_app_script_runs(self):
        self.theme('dark')
        self.page.context.route('**/app.js',lambda route:route.abort())
        self.page.reload(wait_until='domcontentloaded')
        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')
        expect(self.page.locator('#app')).to_be_empty()
        self.assertEqual(self.page.evaluate('getComputedStyle(document.documentElement).colorScheme'),'dark')
        background=self.page.evaluate('getComputedStyle(document.documentElement).backgroundColor')
        self.assertNotIn(background,('rgba(0, 0, 0, 0)','rgb(255, 255, 255)'))

    def test_dark_statistics_calendar_and_picker_fit_desktop_tablet_and_phone(self):
        for size_name,size in SIZES.items():
            for language in ('en','ja-JP'):
                with self.subTest(viewport=size_name,language=language):
                    self.page.set_viewport_size({'width':size[0],'height':size[1]})
                    self.seed(self.fixture(),{**PREFS,'language':language,'theme':'dark'})
                    for view in ('home','stats','calendar'):
                        self.navigate(view)
                        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                        expect(self.page.locator('html')).to_have_attribute('data-theme','dark')
                        if view=='home':
                            if size_name=='phone':
                                expect(self.page.locator('.home-chart')).not_to_be_visible()
                                expect(self.page.locator('.mobile-summary')).to_be_visible()
                            else:
                                expect(self.page.locator('.home-chart')).to_be_visible()
                    self.navigate('home')
                    self.open_form('Custom','10')
                    self.page.locator('#openPicker').click()
                    self.page.locator('#pickerSearch').fill('GitHub')
                    self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    expect(self.page.locator('[data-pick=github]')).to_be_visible()
                    self.assertTrue(self.page.locator('#pickerOverlay .modal').evaluate('(node)=>node.getBoundingClientRect().width<=innerWidth'))
                    self.page.locator('#closePicker').click()
                    self.page.locator('#modalOverlay [data-close]').first.click()

    def test_dark_brand_logo_is_a_readable_light_silhouette_and_loads(self):
        self.seed(self.fixture(),{**PREFS,'theme':'dark','language':'en'})
        self.navigate('list')
        logo=self.page.locator('[data-detail=reading] img.logo')
        logo.evaluate('(image)=>image.decode()')
        self.assertTrue(logo.evaluate('(image)=>image.naturalWidth>0'))
        self.assertEqual(logo.evaluate('(image)=>getComputedStyle(image).backgroundColor'),'rgba(0, 0, 0, 0)')
        self.assertEqual(logo.evaluate('(image)=>getComputedStyle(image).filter'),'brightness(0) invert(1)')

    def test_localized_forms_have_labels_focus_and_dialog_keyboard_controls(self):
        self.language('en')
        self.theme('dark')
        self.navigate('home')
        self.open_form()
        expect(self.page.locator('#name')).to_have_accessible_name('Subscription name')
        expect(self.page.locator('#amount')).to_have_accessible_name('Amount')
        expect(self.page.locator('#modalOverlay [role=dialog]')).to_have_accessible_name('Add subscription')
        self.page.locator('#openPicker').click()
        expect(self.page.locator('#pickerOverlay [role=dialog]')).to_have_accessible_name('Choose logo')
        expect(self.page.locator('#pickerSearch')).to_be_focused()
        self.page.locator('#pickerSearch').fill('github')
        self.page.locator('#pickerSearch').press('ArrowDown')
        expect(self.page.locator('[data-pick]').first).to_be_focused()
        self.page.keyboard.press('Escape')
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        expect(self.page.locator('#openPicker')).to_be_focused()
        self.page.keyboard.press('Escape')
        expect(self.page.locator('#modalOverlay')).to_have_count(0)

    def test_both_themes_keep_text_placeholder_and_error_contrast_readable(self):
        self.language('en')

        def assert_contrast(selector, pseudo=None, minimum=4.5):
            values=self.page.locator(selector).first.evaluate(r"""(element,pseudo)=>{
                const rgb=value=>value.match(/[\d.]+/g).map(Number);
                const layers=[];
                for(let node=element;node;node=node.parentElement)layers.unshift(rgb(getComputedStyle(node).backgroundColor));
                let background=[255,255,255];
                for(const layer of layers){const alpha=layer[3]??1;background=background.map((channel,i)=>layer[i]*alpha+channel*(1-alpha))}
                const color=rgb(getComputedStyle(element,pseudo).color),alpha=color[3]??1;
                return {background,color:background.map((channel,i)=>color[i]*alpha+channel*(1-alpha))};
            }""",pseudo)
            def luminance(channels):
                values=[c/255 for c in channels]
                values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
                return sum(v*w for v,w in zip(values,(.2126,.7152,.0722)))
            foreground,background=luminance(values['color']),luminance(values['background'])
            ratio=(max(foreground,background)+.05)/(min(foreground,background)+.05)
            self.assertGreaterEqual(ratio,minimum,f'{selector} {pseudo}: contrast {ratio:.2f}, {values}')

        for theme in ('dark','light'):
            with self.subTest(theme=theme):
                self.theme(theme)
                for selector in ('.sub','.settings-row label','.fx-panel .small','.fx-panel .note'):
                    assert_contrast(selector)
                self.navigate('home')
                assert_contrast('.primary[data-add]')
                self.open_form()
                assert_contrast('#subscriptionForm .primary')
                self.page.locator('#openPicker').click()
                assert_contrast('#pickerSearch','::placeholder')
                self.page.locator('#uploadLogo').set_input_files({'name':'bad.svg','mimeType':'image/svg+xml','buffer':b'<svg/>'})
                expect(self.page.locator('#logoError')).to_be_visible()
                assert_contrast('#logoError')
                self.page.locator('#pickerSearch').focus()
                self.page.keyboard.press('Tab')
                focused=self.page.locator(':focus')
                outline=focused.evaluate('(element)=>getComputedStyle(element).outlineStyle')
                self.assertNotEqual(outline,'none','Keyboard focus must have a visible indicator')
                self.page.locator('#closePicker').click()
                self.page.locator('#modalOverlay [data-close]').first.click()

    def test_populated_statistics_charts_and_calendar_work_in_both_themes(self):
        self.seed(self.fixture(),{**PREFS,'language':'en'})
        self.navigate('stats')
        self.page.locator('#startCostHistory').click()
        for theme in ('dark','light'):
            self.theme(theme)
            for size in SIZES.values():
                self.page.set_viewport_size({'width':size[0],'height':size[1]})
                self.navigate('stats')
                expect(self.page.locator('[data-chart=monthly] .stats-bar').first).to_be_visible()
                expect(self.page.locator('[data-chart=annual] .stats-bar').first).to_be_visible()
                self.assert_english(self.page.locator('[data-chart=monthly] .stats-bar').first.get_attribute('aria-label'))
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                self.navigate('calendar')
                self.page.locator('[data-month="1"]').click()
                expect(self.page.locator('.calendar-event[data-detail=reading]')).to_be_visible()
                self.page.locator('.calendar-event[data-detail=reading]').click()
                expect(self.page.locator('.drawer[role=dialog]')).to_be_visible()
                expect(self.page.locator('html')).to_have_attribute('data-theme',theme)
                self.page.locator('[data-close-detail]').click()
                self.page.locator('[data-month="-1"]').click()

    def test_user_text_is_not_translated_or_interpreted_as_markup(self):
        data=self.fixture()
        data['subscriptions'][0]['name']='设置 <img src=x onerror="window.bad=1">'
        self.seed(data,{**PREFS,'language':'en'})
        before=self.raw_data_and_fx()
        self.navigate('list')
        expect(self.page.locator('[data-detail=reading]')).to_contain_text(data['subscriptions'][0]['name'])
        self.assertFalse(self.page.evaluate('Boolean(window.bad)'))
        self.language('ja-JP')
        self.navigate('list')
        expect(self.page.locator('[data-detail=reading]')).to_contain_text(data['subscriptions'][0]['name'])
        self.assertEqual(self.raw_data_and_fx(),before)


if __name__ == '__main__':
    unittest.main()
