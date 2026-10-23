"""Four-language currency labels without changing stored ISO codes or money.

Chromium automation (including simulated viewports), not real iPadOS Safari.
"""
import copy
import json
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, SIZES


CATALOGUE = 'AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR AED'.split()
LANGUAGES = ('zh-CN', 'zh-TW', 'ja-JP', 'en')
NAMES = {
    'zh-CN': {'CNY':'人民币', 'USD':'美元', 'JPY':'日元', 'HKD':'港元', 'EUR':'欧元', 'TWD':'新台币'},
    'zh-TW': {'CNY':'人民幣', 'USD':'美元', 'JPY':'日圓', 'HKD':'港幣', 'EUR':'歐元', 'TWD':'新臺幣'},
    'ja-JP': {'CNY':'人民元', 'USD':'米ドル', 'JPY':'日本円', 'HKD':'香港ドル', 'EUR':'ユーロ', 'TWD':'新台湾ドル'},
    'en': {'CNY':'Chinese yuan', 'USD':'US dollar', 'JPY':'Japanese yen', 'HKD':'Hong Kong dollar', 'EUR':'Euro', 'TWD':'New Taiwan dollar'},
}
UNSUPPORTED = {'zh-CN':'（未支持换算）', 'zh-TW':'（不支援換算）', 'ja-JP':'（換算非対応）', 'en':' (conversion unavailable)'}


def api_response(route):
    if route.request.url.split('?', 1)[0].endswith('/currencies'):
        result = {code:'API name ' + code for code in CATALOGUE}
    else:
        result = {'base':'EUR', 'amount':1, 'date':'2026-10-21',
                  'rates':{code:1.25 for code in CATALOGUE if code != 'EUR'}}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(result))


class CurrencyNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages = []
        self.errors = []

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [])

    def page(self, **kwargs):
        data = copy.deepcopy(FIXTURE)
        data['subscriptions'][0].update(currency='USD', amount=3.123, extension={'unchanged':'原始数据'})
        data['subscriptions'][1]['currency'] = 'ZZZ'
        data['payments'] = [{'id':'old-money', 'subscriptionId':'reading', 'name':'Original payment',
                             'date':'2026-10-21', 'amount':3.123, 'currency':'USD', 'note':'keep original'}]
        page = self.h.page(data=data, fx=api_response, **kwargs)
        page.on('pageerror', lambda error:self.errors.append(str(error)))
        page.on('dialog', lambda dialog:dialog.accept())
        self.pages.append(page)
        return page

    def assert_labels(self, page, selector, language):
        options = page.locator(selector + ' option').evaluate_all('(options)=>options.map(option=>({value:option.value,label:option.label,text:option.textContent}))')
        values = [option['value'] for option in options]
        self.assertEqual(len(values), len(set(values)))
        self.assertEqual(set(values), set(CATALOGUE) | {'TWD', 'ZZZ'})
        for option in options:
            self.assertEqual(option['label'], option['text'])
            self.assertTrue(option['label'].startswith(option['value']))
            self.assertNotEqual(option['label'], option['value'])
            self.assertNotIn('API name', option['label'])
            self.assertNotIn('undefined', option['label'])
            if language == 'en':
                self.assertNotRegex(option['label'], r'[\u3400-\u9fff]')
        for code, name in NAMES[language].items():
            label = f'{code} ({name})' if language == 'en' else f'{code}（{name}）'
            if code == 'TWD':
                label += UNSUPPORTED[language]
            expect(page.locator(f'{selector} option[value={code}]')).to_have_text(label)
        selected = page.locator(selector).evaluate('(select)=>({value:select.value,label:select.selectedOptions[0].label})')
        self.assertEqual(selected['label'], next(option['label'] for option in options if option['value'] == selected['value']))

    def test_settings_all_currencies_switch_language_in_place_and_preserve_raw_data(self):
        page = self.page(prefs={**PREFS, 'currency':'USD'})
        raw = page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")
        page.locator('[data-nav=settings]').click()
        page.evaluate("window.currencySelect=document.querySelector('#currency');window.currencyOptionsBefore=[...currencySelect.options]")
        for language in LANGUAGES:
            page.locator('#language').select_option(language)
            self.assert_labels(page, '#currency', language)
            expect(page.locator('#currency')).to_have_value('USD')
            self.assertTrue(page.evaluate("currencySelect===document.querySelector('#currency')&&currencyOptionsBefore.every((option,index)=>option===currencySelect.options[index])"))
            self.assertEqual(page.evaluate("['sumi-data-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))"), raw)
        page.reload()
        page.locator('[data-nav=settings]').click()
        self.assert_labels(page, '#currency', 'en')
        expect(page.locator('#currency')).to_have_value('USD')

    def test_add_edit_and_payment_options_share_localized_labels_in_every_language(self):
        for language in LANGUAGES:
            with self.subTest(language=language):
                page = self.page(prefs={**PREFS, 'language':language})
                raw = page.evaluate("localStorage.getItem('sumi-data-v1')")
                page.locator('[data-add]').click()
                self.assert_labels(page, '#formCurrency', language)
                page.locator('#formCurrency').select_option('JPY')
                self.assert_labels(page, '#formCurrency', language)
                page.locator('[data-close]').first.click()
                page.clock.run_for(350)
                page.locator('[data-nav=list]').click()
                page.locator('[data-detail=reading]').click()
                page.locator('[data-edit]').click()
                expect(page.locator('#formCurrency')).to_have_value('USD')
                self.assert_labels(page, '#formCurrency', language)
                page.locator('[data-close]').first.click()
                page.clock.run_for(350)
                page.locator('[data-detail=reading]').click()
                page.locator('[data-payment]').click()
                self.assert_labels(page, '#paymentCurrency', language)
                self.assertEqual(page.evaluate("localStorage.getItem('sumi-data-v1')"), raw)

    def test_selecting_names_saves_only_currency_codes_and_original_amounts(self):
        page = self.page(prefs={**PREFS, 'language':'en'})
        page.locator('[data-add]').click()
        page.locator('#name').fill('Currency name test')
        page.locator('#amount').fill('14.25')
        page.locator('#formCurrency').select_option('EUR')
        page.locator('#subscriptionForm [type=submit]').click()
        record = page.evaluate('data.subscriptions.at(-1)')
        self.assertEqual((record['currency'], record['amount']), ('EUR', 14.25))
        page.locator('[data-nav=list]').click()
        page.locator('tr[data-detail]').filter(has_text='Currency name test').click()
        page.locator('[data-payment]').click()
        page.locator('#paymentCurrency').select_option('HKD')
        page.locator('#paymentAmount').fill('8.75')
        page.locator('#paymentForm [type=submit]').click()
        stored = page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")
        self.assertEqual((stored['payments'][-1]['currency'], stored['payments'][-1]['amount']), ('HKD', 8.75))
        self.assertEqual((stored['payments'][0]['currency'], stored['payments'][0]['amount']), ('USD', 3.123))
        page.reload()
        self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))"), stored)

    def test_localized_currency_fields_fit_phone_ipad_desktop_and_both_themes(self):
        for size_name, size in {**SIZES, 'narrow':(320,740)}.items():
            for language in LANGUAGES:
                with self.subTest(viewport=size_name, language=language):
                    page = self.page(size=size, prefs={**PREFS, 'language':language, 'theme':'dark'})
                    page.locator('[data-nav=settings]').click()
                    page.locator('#currency').select_option('BGN')
                    for theme in ('dark','light'):
                        page.locator('#theme').select_option(theme)
                        self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                        self.assertTrue(page.locator('#currency').evaluate('el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0'))
                    page.locator('[data-nav=home]').click()
                    page.locator('[data-add]').click()
                    page.locator('#formCurrency').select_option('BGN')
                    self.assertTrue(page.locator('.modal').evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.context.close()
                    self.pages.remove(page)

    def test_catalogue_names_remain_localized_when_display_names_api_is_missing(self):
        for language in LANGUAGES:
            with self.subTest(language=language):
                page = self.page(prefs={**PREFS, 'language':language}, init="Object.defineProperty(Intl,'DisplayNames',{value:undefined,configurable:true})")
                page.locator('[data-nav=settings]').click()
                self.assert_labels(page, '#currency', language)
                label = page.locator('#currency option[value=BGN]').inner_text()
                self.assertNotRegex(label, '未知|不明|Unknown')


if __name__ == '__main__':
    unittest.main()
