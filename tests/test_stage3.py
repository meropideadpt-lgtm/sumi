"""Deterministic browser coverage for reference FX and independent statistics."""
import copy
import json
from pathlib import Path
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, FX_LATEST, FX_CURRENCIES, SIZES


class StageThreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages = []
        self.messages, self.errors = [], []
        self.page = self.new_page()

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [], 'Unhandled JavaScript error')

    def new_page(self, **kwargs):
        page = self.h.page(**kwargs)
        self.pages.append(page)
        page.on('dialog', self.dialog)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        return page

    def dialog(self, dialog):
        self.messages.append(dialog.message)
        dialog.accept()

    def settled(self):
        self.page.wait_for_function("typeof fxManager!=='undefined'&&!fxManager.getState().loading")

    def state(self):
        return self.page.evaluate('fxManager.getState()')

    def store(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def raw(self):
        return self.page.evaluate("[localStorage.getItem('sumi-data-v1'),localStorage.getItem('sumi-prefs-v1')]")

    def seed(self, data, prefs=PREFS):
        self.page.evaluate('''([data,prefs])=>{
            localStorage.setItem('sumi-data-v1',JSON.stringify(data));
            localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
        }''', [data, prefs])
        self.page.reload()
        self.settled()

    def navigate(self, view):
        self.page.locator(f'.nav [data-nav={view}]').click()

    def refresh(self):
        self.navigate('settings')
        self.page.locator('#refreshRates').click()
        self.settled()

    def change_display(self, currency):
        self.navigate('settings')
        self.page.locator('#currency').select_option(currency)

    @staticmethod
    def cache(*, fetched_at='2026-10-21T16:00:00.000Z', date='2026-10-21'):
        return {'version':1,'base':'EUR','date':date,'rates':{'EUR':1,**copy.deepcopy(FX_LATEST['rates'])},
                'fetchedAt':fetched_at,'currencies':copy.deepcopy(FX_CURRENCIES)}

    @staticmethod
    def cache_init(value):
        raw = value if isinstance(value,str) else json.dumps(value)
        return "if(localStorage.getItem('sumi-fx-cache-v1')===null)localStorage.setItem('sumi-fx-cache-v1'," + json.dumps(raw) + ');'

    @staticmethod
    def one_subscription(currency='USD', amount=20):
        subscription=copy.deepcopy(FIXTURE['subscriptions'][0])
        subscription.update(currency=currency, amount=amount, billingAnchor=subscription['nextDate'], category='工作效率')
        return {'subscriptions':[subscription],'payments':[]}

    def confirm(self):
        self.page.locator('tr[data-detail]').first.click()
        self.page.locator('[data-confirm]').click()
        self.page.clock.run_for(1000)

    def export_backup(self):
        self.navigate('settings')
        with self.page.expect_download() as result:
            self.page.locator('#export').click()
        return json.loads(Path(result.value.path()).read_text())

    def import_backup(self, backup):
        self.navigate('settings')
        self.page.locator('#importFile').set_input_files({'name':'backup.json','mimeType':'application/json',
                                                        'buffer':json.dumps(backup).encode()})
        self.page.wait_for_function("document.querySelector('#importFile').value===''")

    @staticmethod
    def history_fixture():
        sub=copy.deepcopy(FIXTURE['subscriptions'][0])
        sub.update(amount=60,category='工作效率')
        common={'subscriptionId':sub['id'],'name':sub['name'],'currency':'CNY','months':1,'status':'active'}
        history=[{**common,'id':'created','category':'影音娱乐','amount':30,'effectiveDate':'2026-09-01',
                  'observedAt':'2026-09-01T00:00:00.000Z','kind':'created'},
                 {**common,'id':'changed','category':'工作效率','amount':60,'effectiveDate':'2026-09-16',
                  'observedAt':'2026-09-16T00:00:00.000Z','kind':'changed'}]
        payments=[{'id':'payment-1','subscriptionId':sub['id'],'name':sub['name'],'date':'2026-09-05','amount':25,'currency':'CNY'},
                  {'id':'payment-2','subscriptionId':sub['id'],'name':sub['name'],'date':'2026-09-20','amount':40,'currency':'CNY'}]
        return {'subscriptions':[sub],'payments':payments,'costHistory':history}

    def apply_month(self, month):
        self.navigate('stats')
        self.page.locator('#statsMode').select_option('month')
        self.page.locator('#statsMonth').fill(month)
        self.page.locator('#statsFilters [type=submit]').click()

    def test_initial_fetch_populates_cache_and_shows_reference_dates(self):
        self.settled()
        state=self.state()
        self.assertEqual(state['cacheState'],'fresh')
        self.assertEqual(state['snapshot']['base'],'EUR')
        self.assertEqual(state['snapshot']['rates']['CNY'],7.8)
        self.assertEqual(state['snapshot']['date'],'2026-10-21')
        self.assertEqual(len(self.page.fx_requests),2)
        self.navigate('settings')
        expect(self.page.locator('#fxRateDate')).to_contain_text('2026-10-21')
        expect(self.page.locator('#fxFetchedAt')).not_to_have_text('')
        expect(self.page.locator('#fxStatus')).to_contain_text('缓存')
        expect(self.page.locator('.fx-panel')).to_contain_text('参考')

    def test_fresh_cache_prevents_navigation_and_reload_refetch(self):
        self.page=self.new_page(init=self.cache_init(self.cache()))
        self.settled()
        self.assertEqual(self.page.fx_requests,[])
        for view in ['settings','stats','home','settings']:
            self.navigate(view)
        self.page.reload();self.settled()
        self.assertEqual(self.page.fx_requests,[])

    def test_manual_refresh_and_concurrent_requests_are_deduplicated(self):
        self.settled()
        before=len(self.page.fx_requests)
        self.page.evaluate('Promise.all(Array.from({length:5},()=>fxManager.refresh({force:true})))')
        self.assertEqual(len(self.page.fx_requests)-before,2)
        self.refresh()
        self.assertEqual(len(self.page.fx_requests)-before,4)

    def test_24_hour_expiry_refreshes_without_repeated_requests(self):
        self.page=self.new_page(init=self.cache_init(self.cache()))
        self.settled()
        self.page.clock.fast_forward(24*60*60*1000+1)
        self.page.evaluate('fxManager.refresh()');self.settled()
        self.assertEqual(len(self.page.fx_requests),2)
        self.page.evaluate('Promise.all([fxManager.refresh(),fxManager.refresh()])')
        self.assertEqual(len(self.page.fx_requests),2)
        self.assertEqual(self.state()['cacheState'],'fresh')

    def test_offline_uses_stale_cache_without_claiming_fresh(self):
        cache=self.cache(fetched_at='2026-10-19T16:00:00.000Z',date='2026-10-19')
        self.page=self.new_page(init=self.cache_init(cache),fx=False)
        self.settled()
        self.assertEqual(self.state()['cacheState'],'stale')
        self.assertEqual(self.state()['snapshot']['fetchedAt'],cache['fetchedAt'])
        self.assertTrue(self.state()['error'])
        self.navigate('settings')
        expect(self.page.locator('#fxStatus')).to_contain_text('缓存')
        expect(self.page.locator('#fxRateDate')).to_contain_text('2026-10-19')
        self.assertTrue(any(word in self.page.locator('#fxStatus').inner_text() for word in ['过期','旧','失败','离线']))

    def test_failed_manual_refresh_preserves_last_success_and_data(self):
        self.seed(self.one_subscription())
        before=self.raw()
        cached=self.page.evaluate("localStorage.getItem('sumi-fx-cache-v1')")
        self.page.context.route('https://api.frankfurter.dev/v1/**',lambda route:route.fulfill(status=500,body='{}',content_type='application/json'))
        self.refresh()
        self.assertTrue(self.state()['error'])
        self.assertEqual(self.page.evaluate("localStorage.getItem('sumi-fx-cache-v1')"),cached)
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('#fxStatus')).to_contain_text('失败')

    def test_invalid_response_does_not_replace_cache(self):
        self.settled()
        original=self.state()['snapshot']
        for payload in [dict(FX_LATEST,rates={**FX_LATEST['rates'],'USD':0}),{'base':'EUR','rates':FX_LATEST['rates'],'date':'2026-02-31'}]:
            with self.subTest(payload=payload):
                def route_handler(route):
                    response=FX_CURRENCIES if route.request.url.endswith('/currencies') else payload
                    route.fulfill(status=200,body=json.dumps(response),content_type='application/json')
                self.page.context.route('https://api.frankfurter.dev/v1/**',route_handler)
                self.refresh()
                self.assertTrue(self.state()['error'])
                self.assertEqual(self.state()['snapshot'],original)
                self.page.context.unroute('https://api.frankfurter.dev/v1/**',route_handler)

    def test_catalog_currency_missing_from_latest_is_explicitly_unavailable(self):
        missing=copy.deepcopy(FX_LATEST)
        del missing['rates']['KRW']
        def route_handler(route):
            response=FX_CURRENCIES if route.request.url.endswith('/currencies') else missing
            route.fulfill(status=200,body=json.dumps(response),content_type='application/json')
        self.page.context.route('https://api.frankfurter.dev/v1/**',route_handler)
        self.refresh()
        self.assertIn('KRW',self.state()['snapshot']['missingCurrencies'])
        self.assertTrue(self.state()['coverageWarning'])
        quoted=self.page.evaluate("SumiFx.quote(1000,'KRW','CNY',fxManager.getState().snapshot)")
        self.assertIsNone(quoted['amount'])
        self.assertIsNone(quoted['rate'])
        expect(self.page.locator('.fx-panel')).to_contain_text('KRW')

    def test_corrupt_cache_is_preserved_when_offline(self):
        original='{not-json'
        self.page=self.new_page(init=self.cache_init(original),fx=False)
        self.settled()
        self.assertEqual(self.state()['cacheState'],'empty')
        self.assertTrue(self.state()['cacheWarning'])
        self.assertEqual(self.page.evaluate("localStorage.getItem('sumi-fx-cache-v1')"),original)
        self.navigate('settings')
        expect(self.page.locator('#fxStatus')).to_contain_text('缓存')

    def test_display_currency_changes_do_not_mutate_original_subscription(self):
        data=self.one_subscription()
        self.seed(data)
        before=self.store()['subscriptions']
        self.change_display('JPY')
        self.assertEqual(self.store()['subscriptions'],before)
        self.navigate('home')
        expect(self.page.locator('.home-metrics').first).to_contain_text('2,909')
        self.change_display('USD')
        self.assertEqual(self.store()['subscriptions'],before)
        self.navigate('home')
        expect(self.page.locator('.home-metrics').first).to_contain_text('20.00')

    def test_payment_conversion_is_frozen_across_rate_refresh_and_display_change(self):
        self.seed(self.one_subscription())
        self.confirm()
        payment=copy.deepcopy(self.store()['payments'][0])
        frozen=payment['fxSnapshot']
        self.assertEqual(frozen['status'],'available')
        self.assertEqual(frozen['sourceCurrency'],'USD')
        self.assertAlmostEqual(frozen['rate'],7.8/1.1)
        self.assertAlmostEqual(frozen['convertedAmount'],141.82)
        self.page.locator('[data-close-detail]').click()
        changed={**FX_LATEST,'rates':{**FX_LATEST['rates'],'CNY':8.8,'JPY':220}}
        def newer_rates(route):
            response=FX_CURRENCIES if route.request.url.endswith('/currencies') else changed
            route.fulfill(status=200,body=json.dumps(response),content_type='application/json')
        self.page.context.route('https://api.frankfurter.dev/v1/**',newer_rates)
        self.refresh()
        self.assertIsNone(self.state()['error'])
        self.assertEqual(self.state()['snapshot']['rates']['CNY'],8.8)
        self.assertEqual(self.state()['snapshot']['rates']['JPY'],220)
        self.assertEqual(self.store()['payments'][0],payment)
        self.navigate('stats')
        expect(self.page.locator('[data-stat=paid-total]')).to_contain_text('141.82')
        self.change_display('JPY');self.navigate('stats')
        expect(self.page.locator('[data-stat=paid-total]')).to_contain_text('2,909')
        self.assertEqual(self.store()['payments'][0],payment)

    def test_payment_metadata_edit_preserves_frozen_snapshot(self):
        self.seed(self.one_subscription())
        self.confirm()
        payment=self.store()['payments'][0]
        self.page.locator(f'[data-edit-payment="{payment["id"]}"]').click()
        self.page.locator('#paymentDate').fill('2026-10-20')
        self.page.locator('#paymentForm [type=submit]').click()
        edited=self.store()['payments'][0]
        self.assertEqual(edited['date'],'2026-10-20')
        self.assertEqual(edited['fxSnapshot'],payment['fxSnapshot'])

    def test_legacy_foreign_payment_is_not_backfilled_at_current_rates(self):
        data=self.one_subscription()
        data['payments']=[{'id':'legacy','subscriptionId':'reading','name':'旧付款','date':'2026-10-21','amount':20,'currency':'USD'}]
        self.seed(data)
        before=self.raw()
        self.page.reload();self.settled()
        self.assertEqual(self.raw(),before)
        self.assertNotIn('fxSnapshot',self.store()['payments'][0])
        self.navigate('stats')
        expect(self.page.locator('[data-stat=paid-count]')).to_contain_text('1')
        expect(self.page.locator('[data-paid-unconverted]')).to_be_visible()
        self.assertNotIn('141.82',self.page.locator('[data-stat=paid-total]').inner_text())

    def test_editing_legacy_payment_date_does_not_invent_confirmation_rates(self):
        data=self.one_subscription()
        data['payments']=[{'id':'legacy','subscriptionId':'reading','name':'旧付款','date':'2026-10-21','amount':20,'currency':'USD'}]
        self.seed(data)
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-edit-payment=legacy]').click()
        self.page.locator('#paymentDate').fill('2026-10-20')
        self.page.locator('#paymentForm [type=submit]').click()
        payment=self.store()['payments'][0]
        self.assertEqual(payment['date'],'2026-10-20')
        self.assertEqual(payment['amount'],20)
        self.assertNotIn('fxSnapshot',payment)
        self.page.locator('[data-close-detail]').click();self.navigate('stats')
        expect(self.page.locator('[data-paid-unconverted]')).to_be_visible()

    def test_unsupported_twd_never_uses_silent_one_to_one_rate(self):
        self.seed(self.one_subscription('TWD'))
        quoted=self.page.evaluate("SumiFx.quote(20,'TWD','CNY',fxManager.getState().snapshot)")
        self.assertIsNone(quoted['amount'])
        self.assertIsNone(quoted['rate'])
        self.confirm()
        payment=self.store()['payments'][0]
        self.assertEqual(payment['currency'],'TWD')
        self.assertEqual(payment['amount'],20)
        self.assertEqual(payment['fxSnapshot']['status'],'unavailable')
        self.assertIsNone(payment['fxSnapshot']['rate'])
        self.assertIsNone(payment['fxSnapshot']['convertedAmount'])
        self.assertTrue(any(any(word in message for word in ['换算','支持','汇率']) for message in self.messages))
        self.page.locator('[data-close-detail]').click();self.navigate('stats')
        expect(self.page.locator('[data-paid-unconverted]')).to_be_visible()

    def test_frozen_payments_and_cost_history_survive_backup_round_trip(self):
        self.seed(self.one_subscription())
        self.confirm();self.page.locator('[data-close-detail]').click()
        exported=self.export_backup()
        self.assertIn('fxSnapshot',exported['data']['payments'][0])
        self.assertIn('costHistory',exported['data'])
        self.import_backup({'version':1,'data':{'subscriptions':[],'payments':[]},'preferences':PREFS})
        self.import_backup(exported)
        self.assertEqual(self.export_backup(),exported)

    def test_independent_statistics_distinguishes_amortized_cost_and_actual_payments(self):
        self.seed(self.history_fixture())
        self.apply_month('2026-09')
        expect(self.page.locator('h1')).to_have_text('统计')
        expect(self.page.locator('[data-stat=monthly-average]')).to_contain_text('45.00')
        expect(self.page.locator('[data-stat=amortized-total]')).to_contain_text('45.00')
        expect(self.page.locator('[data-stat=paid-total]')).to_contain_text('65.00')
        expect(self.page.locator('[data-stat=paid-count]')).to_contain_text('2')
        expect(self.page.locator('[data-shares=service]')).to_contain_text('阅读会员')
        expect(self.page.locator('[data-shares=category]')).to_contain_text('影音娱乐')
        expect(self.page.locator('[data-shares=category]')).to_contain_text('工作效率')
        expect(self.page.locator('.stats-payments .payment')).to_have_count(2)
        self.navigate('home')
        expect(self.page.locator('#statsFilters')).to_have_count(0)

    def test_custom_date_range_is_inclusive_and_filters_actual_count(self):
        self.seed(self.history_fixture());self.navigate('stats')
        self.page.locator('#statsMode').select_option('custom')
        self.page.locator('#statsStart').fill('2026-09-16')
        self.page.locator('#statsEnd').fill('2026-09-30')
        self.page.locator('#statsFilters [type=submit]').click()
        expect(self.page.locator('[data-stat=amortized-total]')).to_contain_text('30.00')
        expect(self.page.locator('[data-stat=paid-total]')).to_contain_text('40.00')
        expect(self.page.locator('[data-stat=paid-count]')).to_contain_text('1')
        self.page.locator('#statsStart').fill('2026-09-30')
        self.page.locator('#statsEnd').fill('2026-09-01')
        self.page.locator('#statsFilters [type=submit]').click()
        self.assertTrue(any(word in self.page.locator('.view-stats').inner_text() for word in ['开始','范围','日期']))

    def test_empty_statistics_does_not_draw_fake_trends(self):
        self.seed({'subscriptions':[],'payments':[]});self.navigate('stats')
        expect(self.page.locator('[data-stats-empty]')).to_be_visible()
        expect(self.page.locator('.stats-bar')).to_have_count(0)
        expect(self.page.locator('.stats-payments .payment')).to_have_count(0)
        expect(self.page.locator('.stats-summary')).to_have_count(0)

    def test_legacy_cost_prehistory_is_not_invented(self):
        self.seed(self.one_subscription('CNY',30))
        self.apply_month('2026-09')
        expect(self.page.locator('.stats-bar')).to_have_count(0)
        expect(self.page.locator('[data-stats-empty]')).to_be_visible()
        expect(self.page.locator('.stats-summary')).to_have_count(0)
        self.apply_month('2026-10')
        expect(self.page.locator('[data-stats-partial]')).to_be_visible()

    def test_category_is_saved_and_recorded_without_rewriting_prior_revisions(self):
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('分类订阅')
        self.page.locator('#amount').fill('60')
        self.page.locator('#nextDate').fill('2026-11-15')
        self.page.locator('#category').fill('工作效率')
        self.page.locator('#subscriptionForm [type=submit]').click()
        saved=self.store()
        self.assertEqual(saved['subscriptions'][0]['category'],'工作效率')
        self.assertTrue(any(row['category']=='工作效率' for row in saved['costHistory']))
        first=copy.deepcopy(saved['costHistory'])
        self.page.locator('tr[data-detail]').click();self.page.locator('[data-edit]').click()
        self.page.locator('#category').fill('影音娱乐')
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.assertEqual(self.store()['costHistory'][:len(first)],first)
        self.assertEqual(self.store()['subscriptions'][0]['category'],'影音娱乐')

    def test_category_markup_is_rendered_as_text(self):
        category='<svg onload=window.x=1>'
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('安全分类')
        self.page.locator('#amount').fill('10')
        self.page.locator('#nextDate').fill('2026-11-15')
        self.page.locator('#category').fill(category)
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.navigate('stats')
        expect(self.page.locator('[data-shares=category]')).to_contain_text(category)
        self.assertFalse(self.page.evaluate('Boolean(window.x)'))

    def test_explicit_history_start_preserves_legacy_records_and_no_passive_rewrites(self):
        legacy=self.one_subscription('CNY',30)
        legacy['payments']=[{'id':'old','subscriptionId':'reading','name':'旧付款','date':'2026-10-21','amount':20,'currency':'CNY'}]
        self.seed(legacy)
        before=self.raw()
        self.navigate('stats')
        self.assertEqual(self.raw(),before)
        expect(self.page.locator('#startCostHistory')).to_be_visible()
        self.refresh()
        self.assertEqual(self.raw(),before)
        self.navigate('stats')
        self.page.locator('#startCostHistory').click()
        saved=self.store()
        self.assertEqual(saved['subscriptions'],legacy['subscriptions'])
        self.assertEqual(saved['payments'],legacy['payments'])
        self.assertEqual(len(saved['costHistory']),1)
        self.assertEqual(saved['costHistory'][0]['kind'],'baseline')
        self.assertEqual(saved['costHistory'][0]['effectiveDate'],'2026-10-22')
        expect(self.page.locator('#startCostHistory')).to_have_count(0)
        history=copy.deepcopy(saved['costHistory'])
        self.change_display('USD')
        self.assertEqual(self.store()['costHistory'],history)
        self.assertEqual(self.store()['subscriptions'],legacy['subscriptions'])
        self.assertEqual(self.store()['payments'],legacy['payments'])

    def test_async_rate_refresh_preserves_pending_subscription_and_payment_drafts(self):
        legacy=self.one_subscription('CNY',30)
        self.seed(legacy)
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('等待汇率的草稿')
        self.page.locator('#amount').fill('42.50')
        self.page.locator('#category').fill('自定义分类')
        self.page.locator('#nextDate').fill('2026-12-31')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.settled()
        expect(self.page.locator('#name')).to_have_value('等待汇率的草稿')
        expect(self.page.locator('#amount')).to_have_value('42.50')
        expect(self.page.locator('#category')).to_have_value('自定义分类')
        expect(self.page.locator('#nextDate')).to_have_value('2026-12-31')
        self.page.get_by_role('button',name='关闭订阅表单').click()
        self.page.locator('tr[data-detail]').click()
        self.page.locator('[data-payment]').click()
        self.page.locator('#paymentDate').fill('2026-10-20')
        self.page.locator('#paymentAmount').fill('36.50')
        self.page.locator('#paymentCurrency').select_option('USD')
        self.page.locator('#paymentStatus').select_option('failed')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.settled()
        expect(self.page.locator('#paymentForm')).to_be_visible()
        expect(self.page.locator('#paymentDate')).to_have_value('2026-10-20')
        expect(self.page.locator('#paymentAmount')).to_have_value('36.50')
        expect(self.page.locator('#paymentCurrency')).to_have_value('USD')
        expect(self.page.locator('#paymentStatus')).to_have_value('failed')
        self.assertEqual(self.store(),legacy)

    def test_pending_logo_upload_survives_async_rate_refresh(self):
        import base64
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('异步上传草稿')
        self.page.locator('#amount').fill('36.50')
        self.page.locator('#category').fill('工作效率')
        self.page.locator('#nextDate').fill('2026-12-31')
        self.page.locator('#openPicker').click()
        # Freeze timers after the picker animation so completion order is deterministic.
        self.page.clock.pause_at(self.page.evaluate('new Date(Date.now()+1000).toISOString()'))
        self.page.evaluate('''() => {
            const original=FileReader.prototype.readAsDataURL;
            window.__logoReadStarted=false;
            FileReader.prototype.readAsDataURL=function(file){
                setTimeout(()=>{window.__logoReadStarted=true;original.call(this,file)},350);
            };
        }''')
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        self.page.locator('#uploadLogo').set_input_files({'name':'logo.png','mimeType':'image/png','buffer':png})
        self.assertFalse(self.page.evaluate('window.__logoReadStarted'))
        self.page.evaluate('fxManager.refresh({force:true})')
        self.settled()
        self.assertFalse(self.page.evaluate('window.__logoReadStarted'))
        self.page.clock.run_for(500)
        expect(self.page.locator('#pickerOverlay')).to_have_count(0)
        self.page.clock.run_for(350)
        expect(self.page.locator('#name')).to_have_value('异步上传草稿')
        expect(self.page.locator('#amount')).to_have_value('36.50')
        expect(self.page.locator('#category')).to_have_value('工作效率')
        expect(self.page.locator('#nextDate')).to_have_value('2026-12-31')
        expect(self.page.locator('#openPicker img')).to_have_count(1)
        self.page.locator('#subscriptionForm [type=submit]').click()
        saved=self.store()['subscriptions'][0]
        self.assertEqual(saved['name'],'异步上传草稿')
        self.assertEqual(saved['amount'],36.5)
        self.assertEqual(saved['category'],'工作效率')
        self.assertTrue(saved['logo'].startswith('data:image/png;base64,'))

    def test_statistics_remains_responsive_and_mobile_home_chart_stays_hidden(self):
        self.seed(self.history_fixture())
        for width,height in [*SIZES.values(),(320,740),(1024,768)]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width':width,'height':height})
                self.navigate('stats')
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                expect(self.page.locator('[data-chart=monthly]')).to_be_visible()
                self.navigate('home')
                if width<=720:
                    expect(self.page.locator('.home-chart')).to_be_hidden()
                    expect(self.page.locator('.mobile-summary')).to_be_visible()
                else:
                    expect(self.page.locator('.home-chart')).to_be_visible()
