"""Preset search, real local brand assets, and safe custom-logo interactions."""
import copy
from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import unittest

from PIL import Image
from playwright.sync_api import expect

from browser_support import Harness, FIXTURE, PREFS, FX_LATEST, FX_CURRENCIES, SIZES


class StageFourTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages = []
        self.errors, self.messages = [], []
        self.page = self.attach(self.h.page())

    def attach(self, page):
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

    def store(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def raw(self):
        return self.page.evaluate("['sumi-data-v1','sumi-prefs-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")

    def seed(self, data, prefs=PREFS):
        self.page.evaluate('''([data,prefs])=>{
            localStorage.setItem('sumi-data-v1',JSON.stringify(data));
            localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
        }''', [data,prefs])
        self.page.reload()
        self.page.wait_for_function('!fxManager.getState().loading')

    def catalog(self, name):
        entry=self.page.evaluate('name=>SumiCatalog.findExact(name)',name)
        self.assertIsNotNone(entry, name)
        return entry

    def open_form(self, name='', amount='', date='2026-11-15'):
        self.page.locator('[data-add]').click()
        if name:
            self.page.locator('#name').fill(name)
        if amount:
            self.page.locator('#amount').fill(amount)
        self.page.locator('#nextDate').fill(date)

    def submit(self):
        self.page.locator('#subscriptionForm [type=submit]').click()
        expect(self.page.locator('#subscriptionForm')).to_have_count(0)

    def choose_suggestion(self, name='GitHub', query=None):
        entry=self.catalog(name)
        self.page.locator('#name').fill(query or name)
        self.page.locator(f'[data-suggest="{entry["id"]}"]').click()
        return entry

    def choose_logo(self, name='GitHub'):
        entry=self.catalog(name)
        self.page.locator('#openPicker').click()
        self.page.locator('#pickerSearch').fill(name)
        self.page.locator(f'[data-pick="{entry["id"]}"]').click()
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        return entry

    @staticmethod
    def picture(format='PNG', color='red', size=(8,8)):
        buffer=BytesIO()
        Image.new('RGB',size,color).save(buffer,format=format)
        mime={'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[format]
        return {'name':'custom.'+format.lower(),'mimeType':mime,'buffer':buffer.getvalue()}

    def upload(self, picture=None):
        self.page.locator('#openPicker').click()
        self.page.locator('#uploadLogo').set_input_files(picture or self.picture())
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        expect(self.page.locator('#openPicker img')).to_have_count(1)

    def edit_first(self):
        self.page.locator('[data-nav=list]').click()
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-edit]').click()

    def assert_loaded(self, locator, expected):
        expect(locator).to_have_attribute('src',expected)
        expect(locator).to_be_visible()
        locator.evaluate('image=>image.decode()')
        self.assertTrue(locator.evaluate('image=>image.complete&&image.naturalWidth>0'))

    def test_alias_suggestions_include_name_logo_category_and_preserve_blank_price(self):
        self.open_form()
        entry=self.catalog('Netflix')
        self.page.locator('#name').fill('奈飞')
        option=self.page.locator(f'[data-suggest="{entry["id"]}"]')
        expect(option).to_contain_text(entry['name'])
        expect(option).to_contain_text(entry['category'])
        expect(option.locator('.logo')).to_have_count(1)
        option.click()
        expect(self.page.locator('#name')).to_have_value(entry['name'])
        expect(self.page.locator('#category')).to_have_value(entry['category'])
        expect(self.page.locator('#amount')).to_have_value('')
        expect(self.page.locator('#months')).to_have_value('1')
        expect(self.page.locator('#formCurrency')).to_have_value('CNY')
        expect(self.page.locator('#nextDate')).to_have_value('2026-11-15')

    def test_chinese_and_fullwidth_search_select_the_correct_service(self):
        self.open_form()
        github=self.catalog('GitHub')
        self.page.locator('#name').fill('ｇｉｔｈｕｂ')
        expect(self.page.locator('[data-suggest]').first).to_have_attribute('data-suggest',github['id'])
        bilibili=self.catalog('B站')
        self.page.locator('#name').fill('B站')
        expect(self.page.locator('[data-suggest]').first).to_have_attribute('data-suggest',bilibili['id'])
        expect(self.page.locator('#amount')).to_have_value('')

    def test_suggestion_keeps_user_price_cycle_and_explicit_category(self):
        self.open_form(amount='73.50',date='2027-01-31')
        self.page.locator('#months').select_option('3')
        self.page.locator('#formCurrency').select_option('USD')
        self.page.locator('#category').fill('我的分类')
        entry=self.choose_suggestion()
        expect(self.page.locator('#category')).to_have_value('我的分类')
        expect(self.page.locator('#amount')).to_have_value('73.50')
        expect(self.page.locator('#months')).to_have_value('3')
        self.submit()
        saved=self.store()['subscriptions'][0]
        self.assertEqual((saved['name'],saved['logo']),(entry['name'],entry['logo']))
        self.assertEqual((saved['amount'],saved['currency'],saved['category']),(73.5,'USD','我的分类'))

    def test_keyboard_selection_does_not_submit_the_form(self):
        self.open_form(amount='20')
        entry=self.catalog('GitHub')
        field=self.page.locator('#name')
        expect(field).to_have_attribute('role','combobox')
        field.fill('github')
        expect(field).to_have_attribute('aria-expanded','true')
        field.press('ArrowDown')
        active=field.get_attribute('aria-activedescendant')
        self.assertTrue(active)
        expect(self.page.locator('#'+active)).to_have_attribute('aria-selected','true')
        field.press('Enter')
        expect(field).to_have_value(entry['name'])
        expect(field).to_have_attribute('aria-expanded','false')
        expect(self.page.locator('#subscriptionForm')).to_have_count(1)
        self.assertIsNone(self.store())

    def test_escape_and_tab_close_search_without_changing_custom_name(self):
        self.open_form()
        field=self.page.locator('#name')
        field.fill('git')
        field.press('ArrowDown')
        field.press('Escape')
        expect(field).to_have_attribute('aria-expanded','false')
        expect(field).to_have_value('git')
        field.fill('github')
        field.press('Tab')
        expect(field).to_have_attribute('aria-expanded','false')
        expect(field).to_have_value('github')
        self.assertNotEqual(self.page.evaluate('document.activeElement.id'),'name')

    def test_ime_enter_does_not_select_or_submit_while_composing(self):
        self.open_form(amount='20')
        field=self.page.locator('#name')
        field.focus()
        field.dispatch_event('compositionstart')
        field.evaluate("input=>{input.value='B站';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}))}")
        field.dispatch_event('keydown',{'key':'Enter','isComposing':True,'bubbles':True})
        expect(field).to_have_value('B站')
        expect(self.page.locator('#subscriptionForm')).to_have_count(1)
        self.assertIsNone(self.store())
        field.dispatch_event('compositionend')
        entry=self.catalog('B站')
        expect(self.page.locator(f'[data-suggest="{entry["id"]}"]')).to_be_visible()

    def test_rate_refresh_preserves_active_ime_node_and_committed_search(self):
        self.open_form(amount='36.50',date='2027-01-31')
        field=self.page.locator('#name')
        field.focus()
        self.page.evaluate('''() => {
            const input=document.querySelector('#name');
            window.__composingName=input;
            input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
            input.value='哔';
            input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
        }''')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.page.wait_for_function('!fxManager.getState().loading')
        self.assertTrue(self.page.evaluate("window.__composingName===document.querySelector('#name')"))
        expect(field).to_be_focused()
        expect(field).to_have_value('哔')
        expect(self.page.locator('#amount')).to_have_value('36.50')
        self.page.evaluate('''() => {
            const input=window.__composingName;
            input.value='B站';
            input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'B站'}));
            input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:false,inputType:'insertCompositionText'}));
        }''')
        self.page.clock.run_for(1)
        entry=self.catalog('B站')
        expect(self.page.locator(f'[data-suggest="{entry["id"]}"]')).to_be_visible()
        expect(field).to_have_value('B站')
        field.press('ArrowDown')
        field.press('Enter')
        expect(field).to_have_value(entry['name'])
        expect(self.page.locator('#subscriptionForm')).to_have_count(1)
        expect(self.page.locator('#amount')).to_have_value('36.50')
        expect(self.page.locator('#nextDate')).to_have_value('2027-01-31')
        self.assertIsNone(self.store())
        self.submit()
        saved=self.store()['subscriptions'][0]
        self.assertEqual((saved['name'],saved['logo'],saved['amount']),(entry['name'],entry['logo'],36.5))

    def test_rate_refresh_preserves_picker_ime_node_query_and_focus(self):
        self.open_form(name='我的视频套餐',amount='27.50',date='2027-01-31')
        self.page.locator('#openPicker').click()
        field=self.page.locator('#pickerSearch')
        field.focus()
        self.page.evaluate('''() => {
            const input=document.querySelector('#pickerSearch');
            window.__composingPicker=input;
            input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
            input.value='哔';
            input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
        }''')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.page.wait_for_function('!fxManager.getState().loading')
        self.assertTrue(self.page.evaluate("window.__composingPicker===document.querySelector('#pickerSearch')"))
        expect(field).to_be_focused()
        expect(field).to_have_value('哔')
        self.page.evaluate('''() => {
            const input=window.__composingPicker;
            input.value='B站';
            input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'B站'}));
            input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:false,inputType:'insertCompositionText'}));
        }''')
        self.page.clock.run_for(1)
        expect(field).to_be_focused()
        expect(field).to_have_value('B站')
        entry=self.catalog('B站')
        choice=self.page.locator(f'[data-pick="{entry["id"]}"]')
        expect(choice).to_be_visible()
        choice.click()
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        expect(self.page.locator('#name')).to_have_value('我的视频套餐')
        expect(self.page.locator('#amount')).to_have_value('27.50')
        expect(self.page.locator('#nextDate')).to_have_value('2027-01-31')
        self.submit()
        saved=self.store()['subscriptions'][0]
        self.assertEqual((saved['name'],saved['logo'],saved['amount']),('我的视频套餐',entry['logo'],27.5))

    def test_no_match_allows_custom_name_and_neutral_logo(self):
        self.open_form(name='自己家的订阅计划',amount='19.99')
        self.page.locator('#name').fill('自己家的订阅计划')
        expect(self.page.locator('[data-suggest]')).to_have_count(0)
        expect(self.page.locator('#suggestions')).to_contain_text('可直接使用')
        self.submit()
        saved=self.store()['subscriptions'][0]
        self.assertEqual(saved['name'],'自己家的订阅计划')
        self.assertEqual(saved['logo'],'')
        fallback=self.page.locator('tr[data-detail] .logo.fallback')
        expect(fallback).to_have_text('')
        expect(fallback.locator('svg')).to_have_count(1)

    def test_first_click_on_a_field_below_open_suggestions_keeps_focus(self):
        self.open_form()
        self.page.locator('#name').fill('我的自定义价格计划')
        expect(self.page.locator('#suggestions')).to_be_visible()
        self.page.locator('#amount').click()
        expect(self.page.locator('#amount')).to_be_focused()
        expect(self.page.locator('#suggestions')).to_be_hidden()
        self.page.locator('#amount').fill('18.75')
        self.page.locator('#category').fill('个人用途')
        self.submit()
        saved=self.store()['subscriptions'][0]
        self.assertEqual((saved['name'],saved['amount'],saved['category']),('我的自定义价格计划',18.75,'个人用途'))

    def test_picker_changes_logo_without_renaming_custom_subscription(self):
        self.open_form(name='我的代码工具套餐',amount='24.50',date='2027-02-28')
        self.page.locator('#category').fill('团队工具')
        entry=self.choose_logo('GitHub')
        expect(self.page.locator('#name')).to_have_value('我的代码工具套餐')
        expect(self.page.locator('#category')).to_have_value('团队工具')
        expect(self.page.locator('#amount')).to_have_value('24.50')
        self.assert_loaded(self.page.locator('#openPicker img'),entry['logo'])
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],entry['logo'])

    def test_picker_can_fill_an_empty_name_without_filling_price(self):
        self.open_form()
        entry=self.choose_logo('GitHub')
        expect(self.page.locator('#name')).to_have_value(entry['name'])
        expect(self.page.locator('#amount')).to_have_value('')

    def test_picker_empty_search_result_keeps_upload_available(self):
        self.open_form(name='自定义图片')
        self.page.locator('#openPicker').click()
        self.page.locator('#pickerSearch').fill('完全不在目录的服务')
        expect(self.page.locator('[data-pick]')).to_have_count(0)
        expect(self.page.locator('#uploadLogo')).to_have_count(1)
        self.page.locator('#uploadLogo').set_input_files(self.picture())
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        expect(self.page.locator('#name')).to_have_value('自定义图片')

    def test_preset_without_a_reliable_logo_uses_neutral_placeholder(self):
        entry=self.page.evaluate('SumiCatalog.all.find(entry=>!entry.logo)')
        self.assertIsNotNone(entry)
        self.open_form(amount='10')
        self.page.locator('#name').fill(entry['name'])
        option=self.page.locator(f'[data-suggest="{entry["id"]}"]')
        expect(option.locator('img')).to_have_count(0)
        expect(option.locator('.logo.fallback svg')).to_have_count(1)
        option.click()
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],'')
        expect(self.page.locator('tr[data-detail] .logo.fallback')).to_have_text('')

    def test_supported_raster_formats_decode_and_save(self):
        for format in ['PNG','JPEG','WEBP']:
            with self.subTest(format=format):
                self.open_form(name='图片 '+format,amount='10')
                self.upload(self.picture(format=format))
                self.submit()
                record=self.store()['subscriptions'][-1]
                self.assertTrue(record['logo'].startswith('data:'+self.picture(format=format)['mimeType']+';base64,'))
        self.page.reload()
        expect(self.page.locator('tr[data-detail] img.logo')).to_have_count(3)

    def test_replace_custom_logo_and_remove_survive_reload_and_edit(self):
        self.open_form(name='我的会员',amount='10')
        self.upload(self.picture(color='red'))
        first=self.page.locator('#openPicker img').get_attribute('src')
        self.upload(self.picture(color='blue'))
        second=self.page.locator('#openPicker img').get_attribute('src')
        self.assertNotEqual(first,second)
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],second)
        self.page.reload()
        self.edit_first()
        self.assert_loaded(self.page.locator('#openPicker img'),second)
        self.page.locator('#openPicker').click()
        self.page.locator('#removeLogo').click()
        expect(self.page.locator('#openPicker .logo.fallback')).to_have_count(1)
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],'')
        self.page.reload()
        self.edit_first()
        expect(self.page.locator('#openPicker img')).to_have_count(0)
        expect(self.page.locator('#openPicker .logo.fallback svg')).to_have_count(1)

    def test_removed_preset_logo_is_not_automatically_restored_by_name(self):
        self.open_form(amount='10')
        entry=self.choose_suggestion('GitHub')
        self.page.locator('#openPicker').click()
        self.page.locator('#removeLogo').click()
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['name'],entry['name'])
        self.assertEqual(self.store()['subscriptions'][0]['logo'],'')
        self.page.reload()
        self.edit_first()
        expect(self.page.locator('#openPicker .logo.fallback svg')).to_have_count(1)
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],'')

    def test_upload_rejects_spoofed_type_oversize_and_huge_dimensions(self):
        self.open_form(name='保留原图',amount='10')
        entry=self.choose_logo('GitHub')
        invalid=[
            {'name':'bad.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'},
            {'name':'fake.png','mimeType':'image/png','buffer':b'<svg onload="window.injected=1"></svg>'},
            {'name':'wrong.jpeg','mimeType':'image/jpeg','buffer':self.picture()['buffer']},
            {'name':'big.png','mimeType':'image/png','buffer':b'x'*500001},
            self.picture(size=(4097,1)),
        ]
        self.page.locator('#openPicker').click()
        for picture in invalid:
            with self.subTest(name=picture['name'],length=len(picture['buffer'])):
                self.page.locator('#uploadLogo').set_input_files(picture)
                expect(self.page.locator('#logoError')).not_to_have_text('')
                expect(self.page.locator('#pickerOverlay')).to_have_count(1)
                self.assertEqual(self.page.evaluate('selectedLogo'),entry['logo'])
        self.assertFalse(self.page.evaluate('Boolean(window.injected)'))
        self.page.locator('#closePicker').click()
        self.assert_loaded(self.page.locator('#openPicker img'),entry['logo'])
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],entry['logo'])

    def test_broken_local_image_falls_back_to_neutral_svg_without_data_loss(self):
        entry=self.catalog('GitHub')
        self.page.route('**/'+entry['logo'],lambda route:route.abort())
        fixture=copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0].update(name=entry['name'],logo=entry['logo'])
        self.seed(fixture)
        before=self.raw()
        fallback=self.page.locator('tr[data-detail]').first.locator('.logo.fallback')
        expect(fallback).to_have_count(1)
        expect(fallback).to_have_text('')
        expect(fallback.locator('svg')).to_have_count(1)
        self.assertEqual(self.raw(),before)
        self.page.locator('tr[data-detail]').first.click()
        expect(self.page.locator('.detail-hero .logo.fallback svg')).to_have_count(1)

    def test_local_brand_asset_loads_when_external_network_is_unavailable(self):
        entry=self.catalog('GitHub')
        self.page.route('https://**',lambda route:route.abort('internetdisconnected'))
        self.open_form(amount='10')
        self.choose_suggestion('GitHub')
        self.assert_loaded(self.page.locator('#openPicker img'),entry['logo'])
        self.submit()
        self.page.reload()
        self.assert_loaded(self.page.locator('tr[data-detail] img.logo'),entry['logo'])

    def test_every_bundled_brand_asset_loads_in_the_browser(self):
        results=self.page.evaluate('''async () => {
            const paths=[...new Set(SumiCatalog.all.map(entry=>entry.logo).filter(Boolean))];
            return Promise.all(paths.map(src=>new Promise(resolve=>{
                const image=new Image();
                image.onload=()=>resolve({src,loaded:image.naturalWidth>0&&image.naturalHeight>0});
                image.onerror=()=>resolve({src,loaded:false});
                image.src=src;
            })));
        }''')
        self.assertGreater(len(results),20)
        self.assertEqual([result['src'] for result in results if not result['loaded']],[])

    def test_logo_is_consistent_in_list_detail_form_and_statistics(self):
        self.open_form(amount='10')
        entry=self.choose_suggestion('GitHub')
        self.submit()
        self.page.locator('[data-nav=list]').click()
        self.assert_loaded(self.page.locator('tr[data-detail] img.logo'),entry['logo'])
        self.page.locator('tr[data-detail]').click()
        self.assert_loaded(self.page.locator('.detail-hero img.logo'),entry['logo'])
        self.page.locator('[data-confirm]').click()
        self.page.locator('[data-edit]').click()
        self.assert_loaded(self.page.locator('#openPicker img'),entry['logo'])
        self.page.locator('[data-close]').first.click()
        self.page.locator('[data-nav=stats]').click()
        self.assert_loaded(self.page.locator('[data-shares=service] img.logo'),entry['logo'])
        self.assert_loaded(self.page.locator('.stats-payments img.logo'),entry['logo'])

    def test_legacy_records_and_fx_cache_remain_untouched_during_browsing(self):
        fixture=copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0].update(logo='https://cdn.simpleicons.org/github',customExtension={'keep':True})
        fixture['payments']=[{'id':'legacy-paid','subscriptionId':'reading','name':'阅读会员','amount':28,
                              'currency':'CNY','date':'2026-09-01','customNote':'保留旧历史'}]
        self.seed(fixture)
        before=self.raw()
        for view in ['list','stats','settings','home']:
            self.page.locator(f'[data-nav={view}]').click()
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-edit]').click()
        self.page.locator('#openPicker').click()
        self.page.locator('#pickerSearch').fill('GitHub')
        self.page.locator('#closePicker').click()
        self.page.locator('[data-close]').first.click()
        self.page.reload()
        self.assertEqual(self.raw(),before)

    def test_logo_change_and_backup_preserve_payments_originals_and_fx_cache(self):
        fixture=copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['customExtension']={'keep':True}
        fixture['payments']=[{'id':'paid','subscriptionId':'reading','name':'阅读会员','date':'2026-10-21',
            'amount':20,'currency':'USD','status':'succeeded','customNote':'keep',
            'fxSnapshot':{'version':1,'status':'available','provider':'frankfurter','sourceCurrency':'USD',
                'sourceAmount':20,'displayCurrency':'CNY','base':'EUR','rate':7.8/1.1,'convertedAmount':141.82,
                'date':'2026-10-20','fetchedAt':'2026-10-20T16:00:00.000Z','confirmedAt':'2026-10-21T16:00:00.000Z',
                'rates':{'EUR':1,'USD':1.1,'CNY':7.8},'reason':None}}]
        self.seed(fixture)
        old_cache=self.raw()[2]
        self.edit_first()
        entry=self.choose_logo('GitHub')
        self.submit()
        saved=self.store()
        self.assertEqual(saved['payments'],fixture['payments'])
        for key in ['name','amount','currency','nextDate','customExtension']:
            self.assertEqual(saved['subscriptions'][0][key],fixture['subscriptions'][0][key])
        self.assertEqual(saved['subscriptions'][0]['logo'],entry['logo'])
        self.assertEqual(self.raw()[2],old_cache)
        self.page.locator('[data-nav=settings]').click()
        with self.page.expect_download() as result:
            self.page.locator('#export').click()
        backup=json.loads(Path(result.value.path()).read_text())
        self.assertEqual(backup['data'],saved)
        self.page.locator('#importFile').set_input_files({'name':'round-trip.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
        self.page.wait_for_function("document.querySelector('#importFile').value===''")
        self.assertEqual(self.store(),saved)
        self.assertEqual(self.raw()[2],old_cache)

    def test_cancelled_upload_cannot_overwrite_a_later_form(self):
        self.open_form(name='第一个草稿',amount='10')
        self.page.locator('#openPicker').click()
        # A deliberately slow FileReader reproduces cancellation while a read is pending.
        self.page.clock.pause_at(self.page.evaluate('new Date(Date.now()+1000).toISOString()'))
        self.page.evaluate('''() => {
            const original=FileReader.prototype.readAsDataURL;
            FileReader.prototype.readAsDataURL=function(file){setTimeout(()=>original.call(this,file),350)};
        }''')
        self.page.locator('#uploadLogo').set_input_files(self.picture())
        self.page.locator('#closePicker').click()
        self.page.locator('[data-close]').first.click()
        self.open_form(name='第二个草稿',amount='20')
        self.page.clock.run_for(700)
        expect(self.page.locator('#name')).to_have_value('第二个草稿')
        expect(self.page.locator('#openPicker img')).to_have_count(0)
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],'')

    def test_suggestions_and_picker_fit_narrow_and_wide_screens(self):
        for width,height in [(320,740),(390,844),(820,1180),(1440,1000)]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width':width,'height':height})
                self.open_form()
                self.page.locator('#name').fill('a')
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                self.assertTrue(self.page.locator('.modal').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                suggestion=self.page.locator('[data-suggest]').first
                expect(suggestion).to_be_visible()
                self.assertGreaterEqual(suggestion.bounding_box()['height'],40)
                self.page.locator('#name').press('Escape')
                self.page.locator('#openPicker').click()
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                self.assertTrue(self.page.locator('#pickerOverlay .modal').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                self.assertGreaterEqual(self.page.locator('[data-pick]').first.bounding_box()['height'],44)
                self.page.locator('#closePicker').click()
                self.page.locator('[data-close]').first.click()
                chart=self.page.locator('.home-chart')
                if width<=720:
                    expect(chart).to_be_hidden()
                else:
                    expect(chart).to_be_visible()

    def test_touch_can_select_suggestion_and_replace_logo(self):
        context=self.h.browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,
                                          timezone_id='Asia/Shanghai',locale='zh-CN')
        def fx(route):
            payload=FX_CURRENCIES if route.request.url.endswith('/currencies') else FX_LATEST
            route.fulfill(status=200,content_type='application/json',body=json.dumps(payload))
        context.route('https://api.frankfurter.dev/v1/**',fx)
        context.route('https://cdn.simpleicons.org/**',lambda route:route.abort())
        self.page=self.attach(context.new_page())
        self.page.clock.install(time=datetime(2026,10,21,16,tzinfo=timezone.utc))
        self.page.goto(self.h.url)
        self.page.wait_for_function('!fxManager.getState().loading')
        self.page.locator('[data-add]').tap()
        self.page.locator('#name').fill('github')
        entry=self.catalog('GitHub')
        self.page.locator(f'[data-suggest="{entry["id"]}"]').tap()
        expect(self.page.locator('#name')).to_have_value(entry['name'])
        self.page.locator('#openPicker').tap()
        other=self.catalog('Netflix')
        self.page.locator('#pickerSearch').fill(other['name'])
        self.page.locator(f'[data-pick="{other["id"]}"]').tap()
        expect(self.page.locator('#name')).to_have_value(entry['name'])
        self.assert_loaded(self.page.locator('#openPicker img'),other['logo'])
