"""Editable category picker: localized display, canonical data and touch lifecycle.

Chromium touch/viewports are simulations; physical iPadOS Safari and its software
keyboard still require manual acceptance. No native datalist popup is used here.
"""
import copy
import json
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, FX_LATEST, FX_CURRENCIES

CANONICAL = ['未分类', '影音娱乐', '音乐音频', 'AI 工具', '工作效率', '办公效率',
             '云存储', '游戏', '设计', '学习教育', '开发工具', '生活服务', '其他']
LABELS = {
    'zh-CN': CANONICAL,
    'zh-TW': ['未分類', '影音娛樂', '音樂與音訊', 'AI 工具', '工作效率', '辦公效率',
              '雲端儲存', '遊戲', '設計', '學習教育', '開發工具', '生活服務', '其他'],
    'ja-JP': ['未分類', '動画・エンタメ', '音楽・オーディオ', 'AI ツール', '仕事効率化',
              'オフィス・仕事効率化', 'クラウドストレージ', 'ゲーム', 'デザイン', '学習・教育',
              '開発ツール', '暮らしのサービス', 'その他'],
    'en': ['Uncategorized', 'Video & entertainment', 'Music & audio', 'AI tools',
           'Productivity', 'Office & productivity', 'Cloud storage', 'Gaming',
           'Design', 'Learning & education', 'Developer tools', 'Lifestyle', 'Other'],
}


class CategoryPickerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.pages, self.errors = [], []

    def track(self, page):
        self.pages.append(page)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        return page

    def page(self, language='zh-CN', theme='light', size=(1440, 1000), data=None):
        return self.track(self.h.page(size=size, data=copy.deepcopy(FIXTURE if data is None else data),
                                    prefs={**PREFS, 'language': language, 'theme': theme, 'motion': 'reduce'}))

    def tearDown(self):
        for page in self.pages:
            page.context.close()
        self.assertEqual(self.errors, [], 'Unhandled JavaScript error')

    @staticmethod
    def open_form(page):
        page.locator('[data-add]').click()
        page.locator('#name').fill('Category regression')
        page.locator('#amount').fill('12.50')

    @staticmethod
    def saved(page):
        return page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")

    def test_default_click_displays_every_localized_preset_without_filtering(self):
        for language, labels in LABELS.items():
            with self.subTest(language=language):
                page = self.page(language)
                before = page.evaluate("localStorage.getItem('sumi-data-v1')")
                self.open_form(page)
                expect(page.locator('#category')).to_have_value(labels[0])
                expect(page.locator('#categoryOptions')).to_be_hidden()
                self.assertIsNone(page.locator('#category').get_attribute('list'))
                page.locator('#category').click()
                expect(page.locator('#category')).to_have_attribute('aria-expanded', 'true')
                expect(page.locator('#categoryOptions')).to_be_visible()
                self.assertEqual(page.locator('[data-category]').all_text_contents(), labels)
                self.assertEqual(page.locator('[data-category]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.category)'), CANONICAL)
                self.assertEqual(page.locator('[data-category]').count(), len(set(CANONICAL)))
                self.assertNotIn('undefined', page.locator('.category-field').inner_text())
                page.locator('#category').fill('A private category')
                self.assertEqual(page.locator('[data-category]').all_text_contents(), labels)
                page.locator('#category').press('Escape')
                expect(page.locator('#categoryOptions')).to_be_hidden()
                expect(page.locator('#subscriptionForm')).to_be_visible()
                page.locator('#modalOverlay [data-close]').last.click()
                self.assertEqual(before, page.evaluate("localStorage.getItem('sumi-data-v1')"))

    def test_all_presets_capture_canonical_values_and_save_in_every_language(self):
        for language, labels in LABELS.items():
            with self.subTest(language=language):
                page = self.page(language)
                self.open_form(page)
                for category, label in zip(CANONICAL, labels):
                    page.locator('#categoryToggle').click()
                    page.locator('[data-category]').nth(CANONICAL.index(category)).click()
                    expect(page.locator('#categoryOptions')).to_be_hidden()
                    expect(page.locator('#category')).to_have_value(label)
                    self.assertEqual(page.evaluate('formDraft.category'), category)
                    expect(page.locator('#category')).to_have_attribute('aria-expanded', 'false')
                page.locator('#subscriptionForm [type=submit]').click()
                expect(page.locator('#subscriptionForm')).to_have_count(0)
                self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], '其他')
                page.reload()
                last_id = self.saved(page)['subscriptions'][-1]['id']
                page.locator(f'tr[data-detail="{last_id}"]').click()
                page.locator('[data-edit]').click()
                expect(page.locator('#category')).to_have_value(labels[-1])
                page.locator('#categoryToggle').click()
                page.locator('[data-category]').nth(6).click()
                page.locator('#subscriptionForm [type=submit]').click()
                self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], '云存储')

    def test_custom_category_can_be_typed_saved_and_reopened_in_every_language(self):
        for language in LABELS:
            with self.subTest(language=language):
                page = self.page(language)
                self.open_form(page)
                page.locator('#category').click()
                page.locator('#category').fill('My <private> 分类')
                page.locator('#category').press('Enter')
                expect(page.locator('#categoryOptions')).to_be_hidden()
                expect(page.locator('#subscriptionForm')).to_be_visible()
                page.locator('#subscriptionForm [type=submit]').click()
                self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], 'My <private> 分类')
                page.reload()
                last_id = self.saved(page)['subscriptions'][-1]['id']
                page.locator(f'tr[data-detail="{last_id}"]').click()
                page.locator('[data-edit]').click()
                expect(page.locator('#category')).to_have_value('My <private> 分类')
                page.locator('#category').click()
                self.assertEqual(page.locator('[data-category]').count(), 13)
                expect(page.locator('#modalOverlay private')).to_have_count(0)

    def test_existing_custom_name_matching_translation_stays_literal_until_explicit_choice(self):
        fixture = copy.deepcopy(FIXTURE)
        fixture['subscriptions'][0]['category'] = 'Uncategorized'
        fixture['subscriptions'][0]['note'] = 'Do not translate my data'
        fixture['payments'] = [{'id': 'old-payment', 'subscriptionId': 'reading', 'name': 'Original',
                                'amount': 27.125, 'currency': 'CNY', 'date': '2026-10-21'}]
        for language in LABELS:
            with self.subTest(language=language):
                page = self.page(language, data=fixture)
                before = self.saved(page)
                cache_before = page.evaluate("localStorage.getItem('sumi-fx-cache-v1')")
                page.locator('tr[data-detail=reading]').click()
                page.locator('[data-edit]').click()
                expect(page.locator('#category')).to_have_value('Uncategorized')
                page.locator('#category').click()
                page.locator('#category').press('Escape')
                page.locator('#subscriptionForm [type=submit]').click()
                unchanged = self.saved(page)
                self.assertEqual(unchanged['subscriptions'], before['subscriptions'])
                self.assertEqual(unchanged['payments'], before['payments'])
                # Existing accounting behavior materializes legacy cost baselines
                # on the first save; preserving categories must not disable it.
                self.assertEqual([item['kind'] for item in unchanged['costHistory']], ['baseline', 'baseline'])
                page.locator('tr[data-detail=reading]').click()
                page.locator('[data-edit]').click()
                page.locator('#categoryToggle').click()
                page.locator('[data-category]').first.click()
                page.locator('#subscriptionForm [type=submit]').click()
                after = self.saved(page)
                expected = copy.deepcopy(before)
                expected['subscriptions'][0]['category'] = '未分类'
                self.assertEqual(after['subscriptions'], expected['subscriptions'])
                self.assertEqual(after['payments'], expected['payments'])
                self.assertEqual(after['costHistory'][:-1], unchanged['costHistory'])
                self.assertEqual(after['costHistory'][-1]['category'], '未分类')
                self.assertEqual(cache_before, page.evaluate("localStorage.getItem('sumi-fx-cache-v1')"))

    def test_keyboard_navigation_selection_escape_tab_and_no_focus_reopen(self):
        page = self.page('en')
        self.open_form(page)
        page.locator('#category').focus()
        expect(page.locator('#categoryOptions')).to_be_hidden()
        page.locator('#category').press('ArrowDown')
        expect(page.locator('#categoryOptions')).to_be_visible()
        page.locator('#category').press('ArrowDown')
        expect(page.locator('#category')).to_have_attribute('aria-activedescendant', 'category-option-1')
        page.locator('#category').press('Enter')
        expect(page.locator('#category')).to_have_value('Video & entertainment')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        expect(page.locator('#subscriptionForm')).to_be_visible()
        page.locator('#category').focus()
        expect(page.locator('#categoryOptions')).to_be_hidden()
        page.locator('#category').click()
        page.locator('#category').fill('Custom')
        page.locator('#category').press('ArrowUp')
        expect(page.locator('#category')).to_have_attribute('aria-activedescendant', 'category-option-12')
        page.locator('#category').press('Enter')
        expect(page.locator('#category')).to_have_value('Other')
        page.locator('#category').press('ArrowDown')
        page.locator('#category').press('Escape')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        expect(page.locator('#subscriptionForm')).to_be_visible()
        page.locator('#category').press('ArrowDown')
        page.locator('#category').press('Tab')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        expect(page.locator('#categoryToggle')).to_be_focused()
        page.locator('#categoryToggle').press('Enter')
        expect(page.locator('#categoryOptions')).to_be_visible()
        page.locator('#categoryToggle').press('Enter')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        expect(page.locator('#subscriptionForm')).to_be_visible()
        page.locator('#categoryToggle').press('Enter')
        expect(page.locator('#categoryOptions')).to_be_visible()
        page.locator('#categoryToggle').press('Escape')
        expect(page.locator('#categoryOptions')).to_be_hidden()

    def test_focused_option_keyboard_uses_its_own_value_and_arrow_position(self):
        page = self.page('en')
        self.open_form(page)
        page.locator('#categoryToggle').click()
        page.locator('[data-category="云存储"]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#category')).to_have_value('Cloud storage')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        self.assertEqual(page.evaluate('formDraft.category'), '云存储')
        page.locator('#categoryToggle').click()
        page.locator('[data-category="游戏"]').focus()
        page.keyboard.press('ArrowDown')
        expect(page.locator('[data-category="设计"]')).to_be_focused()
        expect(page.locator('#category')).to_have_attribute('aria-activedescendant', 'category-option-8')
        page.keyboard.press('ArrowDown')
        expect(page.locator('[data-category="学习教育"]')).to_be_focused()
        page.keyboard.press('ArrowUp')
        page.keyboard.press('Enter')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        expect(page.locator('#category')).to_have_value('Design')
        expect(page.locator('#subscriptionForm')).to_be_visible()
        self.assertEqual(page.evaluate('formDraft.category'), '设计')

    def test_composition_does_not_select_close_or_cancel_before_commit(self):
        page = self.page('ja-JP')
        self.open_form(page)
        page.locator('#category').click()
        page.locator('#category').dispatch_event('compositionstart', {'data': ''})
        page.locator('#category').fill('自分の分類')
        for key in ('ArrowDown', 'Enter', 'Escape'):
            page.locator('#category').dispatch_event('keydown', {'key': key, 'isComposing': True})
            expect(page.locator('#categoryOptions')).to_be_visible()
            expect(page.locator('#subscriptionForm')).to_be_visible()
            expect(page.locator('#category')).to_have_value('自分の分類')
        page.locator('#category').dispatch_event('compositionend', {'data': '自分の分類'})
        page.locator('#category').press('Enter')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        page.locator('#subscriptionForm [type=submit]').click()
        self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], '自分の分類')

    def test_fx_notifications_do_not_detach_active_category_controls_or_reopen_menu(self):
        page = self.page('en')
        self.open_form(page)
        page.locator('#category').click()
        page.locator('#category').fill('FX draft')
        page.evaluate("window.originalCategory=document.querySelector('#category');window.originalCategoryList=document.querySelector('#categoryOptions')")
        # Safari may leave focus on body when a touch opens a button control.
        # An open list is itself sufficient to protect an in-progress gesture.
        page.evaluate('document.activeElement.blur()')
        page.evaluate('fxManager.refresh({force:true})')
        self.assertTrue(page.evaluate("originalCategory===document.querySelector('#category')&&originalCategoryList===document.querySelector('#categoryOptions')"))
        expect(page.locator('#categoryOptions')).to_be_visible()
        expect(page.locator('#category')).to_have_value('FX draft')
        for selector in ('#category', '#categoryToggle', '[data-category="学习教育"]'):
            with self.subTest(control=selector):
                page.locator(selector).focus()
                page.evaluate('fxManager.refresh({force:true})')
                self.assertTrue(page.evaluate("originalCategory===document.querySelector('#category')&&originalCategoryList===document.querySelector('#categoryOptions')&&originalCategory.isConnected"))
                expect(page.locator('#categoryOptions')).to_be_visible()
                expect(page.locator('#category')).to_have_value('FX draft')
        page.locator('[data-category="学习教育"]').click()
        expect(page.locator('#categoryOptions')).to_be_hidden()
        page.locator('#category').focus()
        page.evaluate('fxManager.refresh({force:true})')
        expect(page.locator('#categoryOptions')).to_be_hidden()
        self.assertTrue(page.evaluate("originalCategory===document.querySelector('#category')"))
        page.locator('#subscriptionForm [type=submit]').click()
        self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], '学习教育')
        expect(page.locator('#subscriptionForm')).to_have_count(0)

    def test_clicking_save_with_menu_open_submits_on_first_click(self):
        page = self.page('en', size=(390, 844))
        self.open_form(page)
        page.locator('#category').click()
        page.locator('#category').fill('Save on first click')
        page.locator('#subscriptionForm [type=submit]').click()
        expect(page.locator('#subscriptionForm')).to_have_count(0)
        self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], 'Save on first click')

    def test_all_languages_and_themes_fit_phone_tablet_and_desktop(self):
        for language in LABELS:
            for width, height in ((320, 740), (390, 844), (820, 1180), (1440, 1000)):
                with self.subTest(language=language, width=width):
                    page = self.page(language, size=(width, height))
                    self.open_form(page)
                    page.locator('#categoryToggle').click()
                    for theme in ('light', 'dark'):
                        page.evaluate('theme=>SumiTheme.apply(theme)', theme)
                        result = page.locator('.category-field').evaluate('''field=>{
                            const list=field.querySelector('[role=listbox]'),r=list.getBoundingClientRect();
                            return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
                              fieldWidth:field.scrollWidth,fieldClient:field.clientWidth,
                              bounded:r.height<=220&&r.height>0,
                              buttons:[...list.children].every(n=>n.getBoundingClientRect().height>=44&&n.scrollWidth<=n.clientWidth),
                              outside:r.left<0||r.right>innerWidth};
                        }''')
                        self.assertLessEqual(result['pageWidth'], result['viewport'], result)
                        self.assertLessEqual(result['fieldWidth'], result['fieldClient'], result)
                        self.assertTrue(result['bounded'], result)
                        self.assertTrue(result['buttons'], result)
                        self.assertFalse(result['outside'], result)
                    page.locator('[data-category]').last.click()
                    expect(page.locator('#categoryOptions')).to_be_hidden()
                    page.locator('#subscriptionForm [type=submit]').click()
                    expect(page.locator('#subscriptionForm')).to_have_count(0)

    def test_simulated_touch_select_close_reopen_and_save_without_lost_activation(self):
        for width, height in ((390, 844), (820, 1180)):
            with self.subTest(width=width):
                context = self.h.browser.new_context(viewport={'width': width, 'height': height},
                                                     has_touch=True, is_mobile=True, service_workers='block')
                context.route('https://api.frankfurter.dev/v1/**', lambda route: route.fulfill(
                    status=200, content_type='application/json', body=json.dumps(
                        FX_CURRENCIES if route.request.url.endswith('/currencies') else FX_LATEST)))
                page = self.track(context.new_page())
                page.add_init_script("localStorage.setItem('sumi-prefs-v1'," + json.dumps(json.dumps({**PREFS, 'language': 'en', 'motion': 'reduce'})) + ");")
                page.goto(self.h.url)
                page.wait_for_function('!fxManager.getState().loading')
                page.locator('[data-add]').tap()
                page.locator('#name').fill('Touch category')
                page.locator('#amount').fill('12.50')
                page.evaluate('''()=>{
                    window.categorySelections=0;window.categoryFocusCalls=0;
                    document.querySelector('#category').addEventListener('change',()=>categorySelections++);
                    const focus=HTMLElement.prototype.focus;
                    HTMLElement.prototype.focus=function(...args){if(this.id==='category')categoryFocusCalls++;return focus.apply(this,args)};
                }''')
                for index in (1, 12, 6, 0):
                    page.locator('#categoryToggle').tap()
                    expect(page.locator('#categoryOptions')).to_be_visible()
                    page.locator('[data-category]').nth(index).tap()
                    expect(page.locator('#categoryOptions')).to_be_hidden()
                    expect(page.locator('#category')).to_have_value(LABELS['en'][index])
                    page.wait_for_timeout(80)
                    expect(page.locator('#categoryOptions')).to_be_hidden()
                self.assertEqual(page.evaluate('categorySelections'), 4)
                self.assertEqual(page.evaluate('categoryFocusCalls'), 0)
                page.locator('#category').tap()
                page.locator('#category').fill('Touch custom')
                page.locator('#subscriptionForm [type=submit]').tap()
                expect(page.locator('#subscriptionForm')).to_have_count(0)
                self.assertEqual(self.saved(page)['subscriptions'][-1]['category'], 'Touch custom')


if __name__ == '__main__':
    unittest.main()
