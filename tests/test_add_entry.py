"""The subscription entry belongs to Home on every supported layout."""
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS, SIZES


class AddEntryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def test_entry_is_absent_from_other_pages_through_repeated_navigation(self):
        for size in SIZES.values():
            with self.subTest(size=size):
                page = self.h.page(size, FIXTURE, PREFS)
                try:
                    # Observe both DOM mutations and animation frames: hidden buttons
                    # left behind in a non-Home page are also regressions.
                    page.evaluate('''() => {
                        window.wrongAddEntries = [];
                        window.checkAddEntry = () => {
                            const main = document.querySelector('main');
                            if (main && !main.classList.contains('view-home') && main.querySelector('[data-add]')) {
                                wrongAddEntries.push(main.className);
                            }
                        };
                        new MutationObserver(checkAddEntry).observe(document.querySelector('#app'), {childList:true, subtree:true});
                    }''')
                    for view in ('home', 'list', 'calendar', 'stats', 'settings', 'list', 'home'):
                        page.locator(f'[data-nav={view}]').click()
                        expect(page.locator('[data-add]')).to_have_count(1 if view == 'home' else 0)
                        page.clock.run_for(350)
                        page.evaluate('checkAddEntry()')
                        self.assertTrue(page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                    self.assertEqual(page.evaluate('wrongAddEntries'), [])
                    expect(page.locator('[data-add]')).to_be_visible()
                finally:
                    page.context.close()

    def test_home_entry_adds_and_list_still_edits_after_navigation(self):
        page = self.h.page(SIZES['phone'], FIXTURE, PREFS)
        try:
            page.locator('[data-nav=list]').click()
            expect(page.locator('[data-add]')).to_have_count(0)
            page.locator('[data-nav=home]').click()
            page.locator('[data-add]').click()
            page.locator('#name').fill('Home entry')
            page.locator('#amount').fill('21.50')
            page.locator('#subscriptionForm [type=submit]').click()
            expect(page.locator('#subscriptionForm')).to_have_count(0)
            page.locator('[data-nav=list]').click()
            page.locator('tr[data-detail]').filter(has_text='Home entry').click()
            page.locator('[data-edit]').click()
            page.locator('#name').fill('Edited from list')
            page.locator('#subscriptionForm [type=submit]').click()
            page.reload()
            saved = page.evaluate("JSON.parse(localStorage.getItem('sumi-data-v1'))")
            self.assertEqual(len(saved['subscriptions']), len(FIXTURE['subscriptions']) + 1)
            self.assertEqual(saved['subscriptions'][-1]['name'], 'Edited from list')
            self.assertEqual(saved['subscriptions'][-1]['amount'], 21.5)
            self.assertEqual(saved['payments'], FIXTURE['payments'])
        finally:
            page.context.close()


if __name__ == '__main__':
    unittest.main()
