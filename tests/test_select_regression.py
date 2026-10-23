"""Native picker lifecycle regressions in Chromium, including simulated touch.

Node identity and focus-call checks target the application cause of iPad reopening.
They cannot observe or certify the real iPadOS Safari native picker UI.
"""
import copy
import json
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, SIZES, FX_LATEST, FX_CURRENCIES


class NativeSelectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages = []
        self.errors = []
        self.page = self.h.page(data=copy.deepcopy(FIXTURE), prefs=PREFS)
        self.track(self.page)

    def track(self, page):
        self.pages.append(page)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [])

    def settings(self):
        self.page.locator('[data-nav=settings]').click()

    def watch(self, selector):
        self.page.locator(selector).focus()
        self.page.evaluate('''selector => {
            window.watchedPicker = document.querySelector(selector);
            window.watchedOptions = [...watchedPicker.querySelectorAll('option')];
            window.pickerFocusCalls = 0;
            window.removedPicker = false;
            const originalFocus = HTMLElement.prototype.focus;
            if (!window.originalPickerFocus) window.originalPickerFocus = originalFocus;
            HTMLElement.prototype.focus = function(...args) {
                if (this.matches('select,input[list],input[type=date],input[type=month]')) pickerFocusCalls++;
                return originalPickerFocus.apply(this, args);
            };
            window.pickerObserver?.disconnect();
            window.pickerObserver = new MutationObserver(records => {
                for (const record of records) for (const node of record.removedNodes) {
                    if (node === watchedPicker || node.contains?.(watchedPicker)) removedPicker = true;
                }
            });
            pickerObserver.observe(document.querySelector('#app'), {subtree:true,childList:true});
        }''', selector)

    def assert_stable(self, selector, options=True):
        result = self.page.evaluate('''selector => ({
            same: watchedPicker === document.querySelector(selector),
            connected: watchedPicker.isConnected, removed: removedPicker, focusCalls: pickerFocusCalls,
            options: watchedOptions.every((option,index) => option === watchedPicker.options?.[index])
        })''', selector)
        self.assertTrue(result['same'], result)
        self.assertTrue(result['connected'], result)
        self.assertFalse(result['removed'], result)
        self.assertEqual(result['focusCalls'], 0, result)
        if options:
            self.assertTrue(result['options'], result)

    def test_language_select_and_options_remain_attached_through_repeated_switches(self):
        self.settings()
        before = self.page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")
        self.watch('#language')
        for language, title in [('en','Settings'),('ja-JP','設定'),('zh-TW','設定'),('zh-CN','设置'),('en','Settings')]:
            self.page.locator('#language').select_option(language)
            expect(self.page.locator('.top h1')).to_have_text(title)
            expect(self.page.locator('html')).to_have_attribute('lang',language)
            expect(self.page.locator('#language')).to_be_focused()
            self.assert_stable('#language')
            self.assertEqual(self.page.evaluate("JSON.parse(localStorage.getItem('sumi-prefs-v1')).language"),language)
        self.assertEqual(before,self.page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))"))
        self.page.reload()
        expect(self.page.locator('html')).to_have_attribute('lang','en')

    def test_all_settings_selects_retain_identity_and_allow_repeated_keyboard_changes(self):
        self.settings()
        for selector, choices in [('#currency',['USD','CNY']),('#theme',['dark','system','light']),
                                  ('#motion',['reduce','system']),('#reminder',['14','0','3'])]:
            with self.subTest(control=selector):
                self.watch(selector)
                for choice in choices:
                    self.page.locator(selector).select_option(choice)
                    self.assert_stable(selector)
                    expect(self.page.locator(selector)).to_have_value(choice)
                # Standard native keyboard interaction remains available after repeated changes.
                self.page.locator(selector).press('ArrowDown')
                self.page.locator(selector).press('Escape')
                self.assert_stable(selector)
                self.assertEqual(self.page.evaluate("key=>String(JSON.parse(localStorage.getItem('sumi-prefs-v1'))[key])",selector[1:]),self.page.locator(selector).input_value())

    def test_failed_preference_save_rolls_back_same_select_without_refocusing(self):
        self.settings()
        self.watch('#language')
        self.page.evaluate('''() => {
            const save=Storage.prototype.setItem;
            Storage.prototype.setItem=function(key,value){
                if(key==='sumi-prefs-v1')throw new DOMException('No space','QuotaExceededError');
                return save.call(this,key,value);
            };
        }''')
        self.page.locator('#language').select_option('en')
        expect(self.page.locator('#language')).to_have_value('zh-CN')
        expect(self.page.locator('html')).to_have_attribute('lang','zh-CN')
        self.assert_stable('#language')

    def test_background_pwa_status_does_not_refocus_an_unrelated_settings_select(self):
        self.settings()
        self.watch('#language')
        for event in ('offline','online','offline'):
            self.page.evaluate('event=>window.dispatchEvent(new Event(event))',event)
            self.assert_stable('#language')
            expect(self.page.locator('#language')).to_be_focused()

    def test_fx_refresh_keeps_native_select_attached_until_natural_focus_exit(self):
        self.settings()
        self.watch('#currency')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.assert_stable('#currency')
        self.assertTrue(self.page.evaluate('fxRenderPending'))
        expect(self.page.locator('#refreshRates')).to_be_enabled()
        self.page.locator('#currency').select_option('USD')
        self.assert_stable('#currency')
        self.page.locator('[data-nav=home]').click()
        self.page.wait_for_function('!fxRenderPending')
        self.assertEqual(self.page.evaluate('preferences.currency'),'USD')

    def test_pending_fx_refresh_on_tab_preserves_the_next_native_select(self):
        self.settings()
        self.watch('#language')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.page.locator('#language').press('Tab')
        expect(self.page.locator('#currency')).to_be_focused()
        self.assert_stable('#language')
        self.page.keyboard.press('Tab')
        expect(self.page.locator('#refreshRates')).to_be_focused()
        self.page.wait_for_function('!fxRenderPending')

    def test_pending_fx_does_not_detach_native_import_chooser_cancel_or_reopen(self):
        self.settings()
        self.watch('#currency')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.page.evaluate("window.originalImport=document.querySelector('#importFile')")
        with self.page.expect_file_chooser() as first:
            self.page.locator('#import').click()
        self.assertTrue(self.page.evaluate("originalImport===document.querySelector('#importFile')&&originalImport.isConnected"))
        first.value.set_files([])
        with self.page.expect_file_chooser() as second:
            self.page.locator('#import').click()
        self.assertTrue(self.page.evaluate("originalImport===document.querySelector('#importFile')&&originalImport.isConnected"))
        imported=copy.deepcopy(FIXTURE)
        imported['subscriptions'][0]['name']='Imported after picker cancel'
        second.value.set_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps({'version':1,'data':imported,'preferences':PREFS}).encode()})
        self.page.wait_for_function("data.subscriptions[0].name==='Imported after picker cancel'")
        self.assertFalse(self.page.evaluate('fxRenderPending'))

    def test_subscription_native_controls_and_category_survive_background_fx_update(self):
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('Keep my draft')
        self.page.locator('#amount').fill('19.25')
        for selector, choice in [('#formCurrency','USD'),('#months','3'),('#status','cancelled'),('#autoRenew','false')]:
            with self.subTest(control=selector):
                self.watch(selector)
                self.page.locator(selector).select_option(choice)
                self.page.evaluate('fxManager.refresh({force:true})')
                self.assert_stable(selector)
        self.watch('#category')
        self.page.locator('#category').fill('My category')
        self.page.evaluate('fxManager.refresh({force:true})')
        self.assert_stable('#category',options=False)
        expect(self.page.locator('#name')).to_have_value('Keep my draft')
        expect(self.page.locator('#amount')).to_have_value('19.25')
        self.page.locator('#subscriptionForm [type=submit]').click()
        expect(self.page.locator('#subscriptionForm')).to_have_count(0)
        record = self.page.evaluate('data.subscriptions.at(-1)')
        self.assertEqual((record['currency'],record['months'],record['status'],record['autoRenew'],record['category']),('USD',3,'cancelled',False,'My category'))

    def test_statistics_period_change_retains_native_select_and_updates_date_fields(self):
        self.page.locator('[data-nav=stats]').click()
        self.watch('#statsMode')
        for mode, expected in [('month','#statsMonth'),('custom','#statsStart'),('year','#statsYear'),('custom','#statsEnd')]:
            self.page.locator('#statsMode').select_option(mode)
            self.assert_stable('#statsMode')
            expect(self.page.locator(expected)).to_be_visible()
            expect(self.page.locator('#statsMode')).to_be_focused()
        self.page.locator('#statsStart').fill('2026-01-01')
        self.page.locator('#statsEnd').fill('2026-10-22')
        self.page.locator('#statsFilters [type=submit]').click()
        self.assertEqual(self.page.evaluate('statsFilters.start'),'2026-01-01')

    def test_payment_native_selects_keep_draft_and_identity_during_fx_notifications(self):
        self.page.locator('tr[data-detail=reading]').click()
        self.page.locator('[data-payment]').click()
        self.page.locator('#paymentAmount').fill('12.75')
        for selector, choice in [('#paymentCurrency','USD'),('#paymentStatus','failed')]:
            self.watch(selector)
            self.page.locator(selector).select_option(choice)
            self.page.evaluate('fxManager.refresh({force:true})')
            self.assert_stable(selector)
        self.page.locator('#paymentForm [type=submit]').click()
        expect(self.page.locator('#paymentForm')).to_have_count(0)
        payment=self.page.evaluate('data.payments.at(-1)')
        self.assertEqual((payment['amount'],payment['currency'],payment['status']),(12.75,'USD','failed'))

    def test_touch_settings_selection_repeated_activation_and_navigation(self):
        for name in ('phone','ipad'):
            with self.subTest(viewport=name):
                size=SIZES[name]
                context=self.h.browser.new_context(viewport={'width':size[0],'height':size[1]},has_touch=True,is_mobile=True)
                context.route('https://api.frankfurter.dev/v1/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(FX_CURRENCIES if route.request.url.endswith('/currencies') else FX_LATEST)))
                page=context.new_page();self.track(page);self.page=page
                page.goto(self.h.url);page.wait_for_function('!fxManager.getState().loading')
                page.locator('[data-nav=settings]').tap()
                self.watch('#language')
                page.evaluate('''() => {window.touchActivations=0;document.querySelector('#language').addEventListener('click',()=>touchActivations++)}''')
                for language in ('en','ja-JP','zh-CN'):
                    # Real touch events reach the unchanged native select. Playwright selects
                    # the option; the operating-system popup is outside browser DOM coverage.
                    page.locator('#language').tap()
                    page.locator('#language').select_option(language)
                    page.keyboard.press('Escape')
                    self.assert_stable('#language')
                    expect(page.locator('#language')).to_have_value(language)
                self.assertEqual(page.evaluate('touchActivations'),3)
                page.locator('[data-nav=home]').tap()
                expect(page.locator('.top h1')).to_have_text('首页')
                self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))


if __name__ == '__main__':
    unittest.main()
