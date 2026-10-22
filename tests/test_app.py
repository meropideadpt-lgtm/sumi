"""Browser regressions for the existing static app. Run with unittest discovery."""
import copy
import json
import unittest
from pathlib import Path
from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, SIZES

class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.page = self.h.page()
        self.messages, self.errors = [], []
        self.page.on('dialog', self.dialog)
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def tearDown(self):
        self.page.context.close()
        self.assertEqual(self.errors, [], 'Unhandled JavaScript error')

    def dialog(self, dialog):
        self.messages.append(dialog.message)
        dialog.accept()

    def store(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def raw(self):
        return self.page.evaluate("[localStorage.getItem('sumi-data-v1'),localStorage.getItem('sumi-prefs-v1')]")

    def seed(self, data=None, prefs=PREFS):
        self.page.evaluate('''([data,prefs])=>{
            localStorage.setItem('sumi-data-v1',JSON.stringify(data));
            localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
        }''', [data if data is not None else FIXTURE, prefs])
        self.page.reload()

    def fill_form(self, name='测试订阅', amount='30', date='2026-11-15'):
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill(name)
        self.page.locator('#amount').fill(amount)
        self.page.locator('#nextDate').fill(date)

    def submit(self):
        self.page.locator('#subscriptionForm [type=submit]').click()

    def add(self):
        self.fill_form()
        self.submit()
        expect(self.page.locator('tr[data-detail]')).to_have_count(1)

    def import_backup(self, value):
        self.page.locator('[data-nav=settings]').click()
        self.page.locator('#importFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
        self.page.wait_for_function("document.querySelector('#importFile').value === ''")

    def export_backup(self):
        self.page.locator('[data-nav=settings]').click()
        with self.page.expect_download() as result:
            self.page.locator('#export').click()
        return json.loads(Path(result.value.path()).read_text())

    def test_create_edit_reload_cancel_reactivate_delete(self):
        self.add()
        self.page.reload()
        expect(self.page.locator('tr[data-detail]')).to_have_count(1)
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-edit]').click()
        self.page.locator('#name').fill('已编辑')
        self.page.locator('#amount').fill('45.50')
        self.submit()
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-toggle]').click()
        self.assertEqual(self.store()['subscriptions'][0]['status'], 'cancelled')
        self.page.locator('[data-toggle]').click()
        self.assertEqual(self.store()['subscriptions'][0]['amount'], 45.5)
        self.assertEqual(self.store()['subscriptions'][0]['name'], '已编辑')
        self.page.locator('[data-delete]').click()
        deleted=self.store()
        self.assertEqual(deleted['subscriptions'],[])
        self.assertEqual(deleted['payments'],[])
        self.assertEqual(deleted['costHistory'][0]['kind'],'created')
        self.assertEqual(deleted['costHistory'][-1]['status'],'deleted')
        self.assertEqual(deleted['costHistory'][-1]['amount'],45.5)

    def test_renewal_is_persisted_with_payment(self):
        self.add()
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-confirm]').click()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-12-15')
        self.assertEqual(len(saved['payments']), 1)
        self.assertEqual(saved['payments'][0]['cycleDate'], '2026-11-15')
        self.assertEqual(saved['payments'][0]['amount'], 30)
        self.page.reload()
        self.assertEqual(self.store(), saved)

    def test_existing_cycle_duplicate_is_blocked(self):
        data=copy.deepcopy(FIXTURE)
        data['payments']=[{'id':'paid','subscriptionId':'reading','name':'阅读会员','amount':28,'currency':'CNY','date':'2026-10-22','cycleDate':'2026-11-15'}]
        self.seed(data)
        before=self.raw()
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-confirm]').click()
        self.assertIn('该续费周期已记录付款', self.messages)
        self.assertEqual(self.raw(), before)

    def test_legacy_records_and_unknown_fields_survive(self):
        data=copy.deepcopy(FIXTURE)
        data['subscriptions'][0]['customLegacyField']={'note':'保留'}
        data['payments']=[{'id':'old-payment','subscriptionId':'reading','name':'阅读会员','date':'2026-09-01','amount':3.123,'currency':'CNY'}]
        self.seed(data)
        before=self.raw()
        self.page.reload()
        self.assertEqual(self.raw(), before, 'Startup must not rewrite legacy data')
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-edit]').click()
        self.page.locator('#name').fill('旧数据编辑')
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['customLegacyField'], {'note':'保留'})
        self.assertEqual(self.store()['payments'], data['payments'])
        self.assertEqual(self.store()['subscriptions'][1], data['subscriptions'][1])

    def test_export_and_import_round_trip(self):
        self.seed()
        exported=self.export_backup()
        self.assertEqual(exported, {'version':1,'data':FIXTURE,'preferences':{**PREFS,'motion':'system'}})
        self.import_backup({'version':1,'data':{'subscriptions':[],'payments':[]},'preferences':PREFS})
        self.import_backup(exported)
        self.page.reload()
        self.assertEqual(self.store(), FIXTURE)
        self.assertEqual(self.export_backup(), exported)

    def test_cancel_import_keeps_data(self):
        self.seed()
        self.page.remove_listener('dialog', self.dialog)
        self.page.on('dialog',lambda d:d.dismiss())
        before=self.raw()
        self.import_backup({'version':1,'data':{'subscriptions':[],'payments':[]}})
        self.assertEqual(self.raw(),before)

    def test_invalid_imports_leave_both_keys_unchanged(self):
        self.seed()
        before=self.raw()
        samples=[None, {}, {'version':2,'data':FIXTURE}, {'version':1,'data':{'subscriptions':[None],'payments':[]}}]
        for field,value in [('name',None),('months','<img src=x onerror="window.injected=1">'),('months',0),('amount',-1),('amount','20'),('nextDate','2026-02-31'),('currency','INVALID'),('autoRenew','false'),('logo','javascript:alert(1)')]:
            data=copy.deepcopy(FIXTURE);data['subscriptions'][0][field]=value
            samples.append({'version':1,'data':data})
        dup=copy.deepcopy(FIXTURE);dup['subscriptions'].append(dup['subscriptions'][0].copy())
        samples.append({'version':1,'data':dup})
        samples.append({'version':1,'data':FIXTURE,'preferences':{'currency':'INVALID'}})
        for value in samples:
            with self.subTest(value=value):
                self.import_backup(value)
                self.assertTrue(self.messages[-1].startswith('导入失败：'))
                self.assertEqual(self.raw(),before)
                self.assertFalse(self.page.evaluate('Boolean(window.injected)'))

    def test_untrusted_names_ids_and_fallback_are_text(self):
        data=copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update({'name':'<img src=x onerror="window.injected=1">','id':'x"><img src=x onerror="window.injected=1">','logo':'https://cdn.simpleicons.org/missing'})
        self.import_backup({'version':1,'data':data})
        self.page.locator('[data-nav=home]').click()
        fallback=self.page.locator('tr[data-detail]').first.locator('.logo.fallback')
        expect(fallback).to_have_text('')
        expect(fallback.locator('svg')).to_have_count(1)
        self.assertFalse(self.page.evaluate('Boolean(window.injected)'))
        self.page.locator('tr[data-detail]').first.click()
        expect(self.page.locator('.detail-hero h2')).to_have_text(data['subscriptions'][0]['name'])

    def test_corrupt_data_keeps_raw_and_allows_explicit_recovery(self):
        for raw in ['{broken', json.dumps({'subscriptions':[{},FIXTURE['subscriptions'][0]],'payments':[]}), 'null']:
            with self.subTest(raw=raw):
                self.page.evaluate("v=>localStorage.setItem('sumi-data-v1',v)",raw)
                self.page.reload()
                expect(self.page.locator('[role=alert]')).to_contain_text('暂停写入')
                self.fill_form();self.submit()
                self.assertEqual(self.raw()[0],raw)
                self.page.locator('[data-close]').first.click()
                with self.page.expect_download() as d:
                    self.page.locator('#exportRaw').click()
                self.assertEqual(json.loads(Path(d.value.path()).read_text())['raw']['sumi-data-v1'],raw)
                self.assertEqual(self.export_backup()['raw']['sumi-data-v1'],raw)
                self.import_backup({'version':1,'data':FIXTURE,'preferences':{**PREFS,'motion':'system'}})
                expect(self.page.locator('[role=alert]')).to_have_count(0)
                self.assertEqual(self.store(),FIXTURE)

    def test_corrupt_preferences_do_not_erase_subscriptions(self):
        self.seed(prefs={'currency':'UNKNOWN'})
        expect(self.page.locator('tr[data-detail]')).to_have_count(2)
        expect(self.page.locator('[role=alert]')).to_contain_text('偏好设置异常')
        self.assertEqual(self.store(),FIXTURE)

    def test_storage_read_unavailable_still_renders(self):
        self.page.context.close()
        self.page=self.h.page(init="Storage.prototype.getItem=function(){throw new DOMException('denied','SecurityError')}")
        self.page.on('dialog',self.dialog)
        expect(self.page.locator('h1')).to_have_text('首页')
        expect(self.page.locator('[role=alert]')).to_contain_text('无法安全读取')
        self.fill_form();self.submit()
        expect(self.page.locator('#name')).to_have_value('测试订阅')

    def test_quota_failure_preserves_form_and_old_store(self):
        self.seed()
        before=self.raw()
        self.page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}}")
        self.fill_form();self.submit()
        self.assertIn('保存失败',self.messages[-1])
        expect(self.page.locator('#name')).to_have_value('测试订阅')
        expect(self.page.locator('#amount')).to_have_value('30')
        self.assertEqual(self.raw(),before)
        self.page.reload()
        expect(self.page.locator('tr[data-detail]')).to_have_count(2)

    def test_partial_import_write_rolls_back(self):
        self.seed()
        before=self.raw()
        self.page.evaluate('''()=>{const original=Storage.prototype.setItem;let failed=false;
          Storage.prototype.setItem=function(key,value){
            if(key==='sumi-prefs-v1'&&!failed){failed=true;throw new DOMException('full','QuotaExceededError')}
            return original.call(this,key,value);
          }}''')
        self.import_backup({'version':1,'data':{'subscriptions':[],'payments':[]},'preferences':{**PREFS,'theme':'dark'}})
        self.assertIn('保存失败',self.messages[-1])
        self.assertEqual(self.raw(),before)
        self.page.reload()
        expect(self.page.locator('tr[data-detail]')).to_have_count(2)

    def test_interrupted_write_recovers_on_reload(self):
        self.seed()
        before=self.raw()
        self.page.evaluate('''([data,prefs])=>{
          localStorage.setItem('sumi-write-journal-v1',JSON.stringify({'sumi-data-v1':data,'sumi-prefs-v1':prefs}));
          localStorage.setItem('sumi-data-v1',JSON.stringify({subscriptions:[],payments:[]}));
        }''',before)
        self.page.reload()
        self.assertEqual(self.raw(),before)
        self.assertIsNone(self.page.evaluate("localStorage.getItem('sumi-write-journal-v1')"))

    def test_stale_tab_cannot_overwrite_newer_records(self):
        self.seed()
        changed=copy.deepcopy(FIXTURE);changed['subscriptions'][0]['name']='另一标签页的修改'
        self.page.evaluate("v=>localStorage.setItem('sumi-data-v1',JSON.stringify(v))",changed)
        self.fill_form();self.submit()
        self.assertIn('其他页面',self.messages[-1])
        self.assertEqual(self.store(),changed)

    def test_settings_save_failure_reverts_selection(self):
        self.seed()
        before=self.raw()
        self.page.locator('[data-nav=settings]').click()
        self.page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}}")
        self.page.locator('#theme').select_option('dark')
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('#theme')).to_have_value('light')
        self.assertIn('保存失败',self.messages[-1])

    def test_icon_picker_preserves_draft_and_selected_logo(self):
        self.fill_form(name='未保存草稿',amount='42.50',date='2027-01-15')
        self.page.locator('#months').select_option('3')
        self.page.locator('#openPicker').click()
        self.page.locator('#pickerSearch').fill('GitHub')
        self.page.locator('[data-pick=github]').click()
        expect(self.page.locator('#amount')).to_have_value('42.50')
        expect(self.page.locator('#nextDate')).to_have_value('2027-01-15')
        expect(self.page.locator('#months')).to_have_value('3')
        self.page.locator('#openPicker').click()
        self.page.locator('#closePicker').click()
        expect(self.page.locator('#name')).to_have_value('未保存草稿')
        self.submit()
        self.assertEqual(self.store()['subscriptions'][0]['logo'],self.page.evaluate("SumiCatalog.findExact('GitHub').logo"))
        self.assertEqual(self.store()['subscriptions'][0]['amount'],42.5)

    def test_form_rejects_blank_name_and_bad_amount(self):
        self.fill_form(name='   ')
        self.submit()
        self.assertIsNone(self.store())
        self.assertIn('名称无效',self.messages[-1])
        self.page.locator('#name').fill('有效名称')
        for amount in ['-1','0.001','']:
            self.page.locator('#amount').fill(amount)
            self.submit()
            self.assertIsNone(self.store())
            expect(self.page.locator('#subscriptionForm')).to_be_visible()

    def test_invalid_manual_payment_date_and_amount(self):
        self.add();self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-payment]').click()
        # Exercise the JS boundary as well as native input validation.
        self.page.locator('#paymentDate').evaluate("el=>{el.type='text';el.value='2026-02-31'}")
        self.page.locator('#paymentAmount').fill('10')
        self.page.locator('#paymentForm').dispatch_event('submit')
        self.assertEqual(self.store()['payments'],[])
        self.assertIn('真实付款日期',self.messages[-1])
        self.page.locator('#paymentDate').evaluate("el=>{el.type='date';el.value='2026-10-22'}")
        self.page.locator('#paymentAmount').fill('')
        self.page.locator('#paymentForm').dispatch_event('submit')
        self.assertEqual(self.store()['payments'],[])
        self.assertIn('有效金额',self.messages[-1])

    def test_local_date_at_shanghai_midnight(self):
        # At 00:00 Shanghai, UTC is still the previous day.
        self.fill_form()
        self.page.locator('[data-close]').first.click()
        self.page.locator('[data-add]').click()
        expect(self.page.locator('#nextDate')).to_have_value('2026-10-22')

    def test_uploaded_logo_preserves_form(self):
        import base64
        self.fill_form(name='上传图片订阅', amount='36.50')
        self.page.locator('#openPicker').click()
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        self.page.locator('#uploadLogo').set_input_files({'name':'logo.png','mimeType':'image/png','buffer':png})
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        expect(self.page.locator('#name')).to_have_value('上传图片订阅')
        expect(self.page.locator('#amount')).to_have_value('36.50')
        expect(self.page.locator('#openPicker img')).to_have_count(1)
        self.submit()
        reference=self.store()['subscriptions'][0]['logo']
        self.assertRegex(reference,r'^sumi-logo:[a-f0-9]{64}$')
        self.assertTrue(self.page.evaluate('(reference)=>SumiLogoStore.resolve(reference)',reference).startswith(('data:image/webp;base64,','data:image/png;base64,')))

    def test_failed_renewal_does_not_advance_or_record_payment(self):
        self.add()
        before=self.raw()
        self.page.locator('tr[data-detail]').click()
        self.page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}}")
        self.page.locator('[data-confirm]').click()
        self.assertIn('保存失败',self.messages[-1])
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('.drawer')).to_contain_text('2026/11/15')
        expect(self.page.locator('.drawer')).to_contain_text('暂无付款记录')

    def test_failed_rollback_keeps_recovery_journal(self):
        self.seed()
        before=self.raw()
        self.page.evaluate('''() => {const original=Storage.prototype.setItem;let writes=0;
            Storage.prototype.setItem=function(key,value){
                if(++writes>=3)throw new DOMException('full','QuotaExceededError');
                return original.call(this,key,value);
            }}''')
        self.import_backup({'version':1,'data':{'subscriptions':[],'payments':[]},'preferences':{**PREFS,'theme':'dark'}})
        self.assertIn('恢复未完成',self.messages[-1])
        self.assertIsNotNone(self.page.evaluate("localStorage.getItem('sumi-write-journal-v1')"))
        self.page.reload()
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('tr[data-detail]')).to_have_count(2)

    def test_layouts_and_navigation(self):
        long_data=copy.deepcopy(FIXTURE)
        long_data['subscriptions'][0].update(name='W'*70,nextDate='2026-10-22')
        self.seed(long_data)
        for width,height in [*SIZES.values(),(320,740),(1024,768)]:
            with self.subTest(size=(width,height)):
                self.page.set_viewport_size({'width':width,'height':height})
                for view in ['home','list','stats','calendar','settings']:
                    self.page.locator(f'[data-nav={view}]').click()
                    self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'),view)
                self.page.locator('[data-nav=home]').click()
                self.page.locator('[data-add]').click()
                self.assertTrue(self.page.locator('.modal').evaluate('el=>el.scrollWidth<=el.clientWidth'))
                self.assertGreaterEqual(self.page.locator('#name').bounding_box()['width'],140)
                self.page.locator('#subscriptionForm [type=submit]').scroll_into_view_if_needed()
                self.page.locator('[data-close]').first.click()
