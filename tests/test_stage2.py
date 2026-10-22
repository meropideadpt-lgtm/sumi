"""Stage-two billing, payment-history, and responsive-home regressions."""
import copy
import json
from pathlib import Path
import unittest

from playwright.sync_api import expect
from browser_support import Harness, FIXTURE, PREFS


class StageTwoTests(unittest.TestCase):
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
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))

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

    def seed(self, *, due='2026-01-31', months=1, anchor=None, payments=None, extra=None):
        subscription = copy.deepcopy(FIXTURE['subscriptions'][0])
        subscription.update(nextDate=due, months=months)
        if anchor is not None:
            subscription['billingAnchor'] = anchor
        if extra:
            subscription.update(extra)
        data = {'subscriptions': [subscription], 'payments': copy.deepcopy(payments or [])}
        self.page.evaluate('''value => {
            localStorage.setItem('sumi-data-v1', JSON.stringify(value));
            localStorage.setItem('sumi-prefs-v1', JSON.stringify({currency:'CNY',reminder:3,theme:'light',language:'zh-CN'}));
        }''', data)
        self.page.reload()
        return data

    def detail(self):
        self.page.locator('tr[data-detail=reading]').click()
        expect(self.page.locator('.drawer')).to_be_visible()

    def confirm(self):
        self.page.locator('[data-confirm]').click()
        self.page.clock.run_for(1000)

    def payment(self, *, date='2026-10-22', amount='28', cycle='', status='succeeded'):
        self.page.locator('[data-payment]').click()
        self.fill_payment(date=date, amount=amount, cycle=cycle, status=status)

    def fill_payment(self, *, date='2026-10-22', amount='28', cycle='', status='succeeded'):
        self.page.locator('#paymentDate').fill(date)
        self.page.locator('#paymentAmount').fill(amount)
        self.page.locator('#paymentCycleDate').fill(cycle)
        self.page.locator('#paymentStatus').select_option(status)
        self.page.locator('#paymentForm [type=submit]').click()

    def navigate(self, view):
        self.page.locator(f'.nav [data-nav={view}]').click()

    def import_backup(self, backup):
        self.navigate('settings')
        self.page.locator('#importFile').set_input_files({
            'name': 'backup.json', 'mimeType': 'application/json',
            'buffer': json.dumps(backup).encode(),
        })
        self.page.wait_for_function("document.querySelector('#importFile').value === ''")

    def export_backup(self):
        self.navigate('settings')
        with self.page.expect_download() as download:
            self.page.locator('#export').click()
        return json.loads(Path(download.value.path()).read_text())

    @staticmethod
    def paid(payment_id, cycle, *, status='succeeded', managed=True):
        return {'id': payment_id, 'subscriptionId': 'reading', 'name': '阅读会员',
                'date': '2026-10-22', 'cycleDate': cycle, 'amount': 28,
                'currency': 'CNY', 'status': status, 'advancesSchedule': managed}

    def test_month_end_anchor_and_overdue_cycles_are_not_skipped(self):
        self.seed(anchor='2026-01-31')
        self.detail()
        self.confirm()
        first = self.store()
        self.assertEqual(first['subscriptions'][0]['nextDate'], '2026-02-28')
        self.assertEqual(first['payments'][0]['cycleDate'], '2026-01-31')
        self.confirm()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-03-31')
        self.assertEqual(saved['subscriptions'][0]['billingAnchor'], '2026-01-31')
        self.assertEqual([p['cycleDate'] for p in saved['payments']], ['2026-01-31', '2026-02-28'])
        self.assertTrue(all(p['status'] == 'succeeded' for p in saved['payments']))
        self.page.reload()
        self.assertEqual(self.store(), saved)

    def test_new_subscription_persists_its_billing_anchor(self):
        self.page.locator('[data-add]').click()
        self.page.locator('#name').fill('月底新增订阅')
        self.page.locator('#amount').fill('28')
        self.page.locator('#nextDate').fill('2026-10-31')
        self.page.locator('#subscriptionForm [type=submit]').click()
        created = self.store()['subscriptions'][0]
        self.assertEqual(created['billingAnchor'], '2026-10-31')
        self.page.locator('tr[data-detail]').click()
        self.confirm()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-11-30')
        self.confirm()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-12-31')

    def test_quarterly_and_annual_renewals_cross_years(self):
        for due, months, expected_date in [('2026-11-30', 3, '2027-02-28'), ('2024-02-29', 12, '2025-02-28')]:
            with self.subTest(months=months):
                self.seed(due=due, months=months, anchor=due)
                self.detail()
                self.confirm()
                self.assertEqual(self.store()['subscriptions'][0]['nextDate'], expected_date)
                self.page.locator('[data-close-detail]').click()

    def test_legacy_subscription_acquires_anchor_without_losing_fields(self):
        original = self.seed(extra={'legacyNote': {'keep': True}})
        before = self.raw()
        self.page.reload()
        self.assertEqual(self.raw(), before)
        self.detail()
        self.confirm()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['legacyNote'], original['subscriptions'][0]['legacyNote'])
        self.assertEqual(saved['subscriptions'][0]['billingAnchor'], '2026-01-31')
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-02-28')

    def test_failed_payment_does_not_count_as_success_or_advance(self):
        self.seed(anchor='2026-01-31')
        self.detail()
        self.page.locator('[data-fail-payment]').click()
        failed = self.store()
        self.assertEqual(failed['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertEqual(len(failed['payments']), 1)
        self.assertEqual(failed['payments'][0]['status'], 'failed')
        expect(self.page.locator('.drawer')).to_contain_text('失败')
        self.confirm()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-02-28')
        self.assertEqual(sum(p.get('status', 'succeeded') == 'succeeded' for p in saved['payments']), 1)
        self.assertEqual(sum(p.get('status') == 'failed' for p in saved['payments']), 1)
        self.page.locator('[data-close-detail]').click()
        self.navigate('stats')
        expect(self.page.locator('.payment')).to_have_count(1)

    def test_rapid_confirmation_cannot_pay_two_cycles(self):
        self.seed(anchor='2026-01-31')
        self.detail()
        self.page.evaluate('''() => {
            document.querySelector('[data-confirm]').click();
            document.querySelector('[data-confirm]').click();
        }''')
        self.assertEqual(len(self.store()['payments']), 1)
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-02-28')

    def test_legacy_successful_cycle_cannot_be_confirmed_again(self):
        payment = self.paid('legacy', '2026-01-31')
        del payment['status']
        del payment['advancesSchedule']
        self.seed(anchor='2026-01-31', payments=[payment])
        before = self.raw()
        self.detail()
        self.page.locator('[data-confirm]').click()
        self.assertEqual(self.raw(), before)
        self.assertTrue(any('已记录付款' in message or '已付款' in message for message in self.messages))

    def test_cancel_restore_preserves_schedule_and_history(self):
        payment = self.paid('old', '2025-12-31')
        self.seed(anchor='2026-01-31', payments=[payment])
        self.detail()
        self.page.locator('[data-toggle]').click()
        cancelled = self.store()
        self.assertEqual(cancelled['subscriptions'][0]['status'], 'cancelled')
        expect(self.page.locator('[data-confirm]')).to_have_count(0)
        self.assertEqual(cancelled['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertEqual(cancelled['payments'], [payment])
        self.page.locator('[data-toggle]').click()
        expect(self.page.locator('[data-confirm]')).to_be_visible()
        self.assertEqual(self.store()['subscriptions'][0]['status'], 'active')
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertEqual(self.store()['payments'], [payment])

    def test_unrelated_edit_preserves_anchor_but_schedule_edit_resets_it(self):
        self.seed(due='2026-02-28', anchor='2026-01-31')
        self.detail()
        self.page.locator('[data-edit]').click()
        self.page.locator('#name').fill('更名订阅')
        self.page.locator('#amount').fill('36')
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.assertEqual(self.store()['subscriptions'][0]['billingAnchor'], '2026-01-31')
        self.detail()
        self.page.locator('[data-edit]').click()
        self.page.locator('#months').select_option('3')
        self.page.locator('#nextDate').fill('2026-04-30')
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.assertEqual(self.store()['subscriptions'][0]['billingAnchor'], '2026-04-30')
        self.assertEqual(self.store()['subscriptions'][0]['months'], 3)

    def change_subscription_plan(self, *, due, months=3):
        self.page.locator('[data-edit]').click()
        self.page.locator('#months').select_option(str(months))
        self.page.locator('#nextDate').fill(due)
        self.page.locator('#subscriptionForm [type=submit]').click()
        self.detail()

    def test_schedule_edit_archives_old_history_before_deletion(self):
        old_payment = self.paid('old-plan', '2026-05-31')
        self.seed(due='2026-06-30', anchor='2026-05-31', payments=[old_payment])
        self.detail()
        self.change_subscription_plan(due='2026-08-31')
        archived = self.store()['payments'][0]
        self.assertTrue(archived['scheduleArchived'])
        self.assertFalse(archived['advancesSchedule'])
        for key in ['id', 'date', 'amount', 'currency', 'status', 'cycleDate']:
            self.assertEqual(archived[key], old_payment[key])
        self.page.locator('[data-remove-payment=old-plan]').click()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-08-31')
        self.assertEqual(saved['subscriptions'][0]['billingAnchor'], '2026-08-31')
        self.assertEqual(saved['payments'], [])

    def test_editing_archived_history_cannot_rebind_to_new_plan(self):
        # May31 aligns with the new Aug31 quarterly plan, but is off-cycle
        # for the Sep30 quarterly plan. Neither case should silently rebind.
        for new_due in ['2026-08-31', '2026-09-30']:
            with self.subTest(due=new_due):
                self.seed(due='2026-06-30', anchor='2026-05-31', payments=[self.paid('old-plan', '2026-05-31')])
                self.detail()
                self.change_subscription_plan(due=new_due)
                for status in ['failed', 'succeeded']:
                    self.page.locator('[data-edit-payment=old-plan]').click()
                    self.fill_payment(date='2026-10-21', amount='31.50', cycle='2026-05-31', status=status)
                    expect(self.page.locator('#paymentForm')).to_have_count(0)
                    saved = self.store()
                    self.assertEqual(saved['subscriptions'][0]['nextDate'], new_due)
                    self.assertEqual(saved['subscriptions'][0]['billingAnchor'], new_due)
                    self.assertTrue(saved['payments'][0]['scheduleArchived'])
                    self.assertFalse(saved['payments'][0]['advancesSchedule'])
                    self.assertEqual(saved['payments'][0]['status'], status)
                    self.assertEqual(saved['payments'][0]['amount'], 31.5)
                    self.assertEqual(saved['payments'][0]['date'], '2026-10-21')
                    self.assertEqual(saved['payments'][0]['cycleDate'], '2026-05-31')
                self.page.locator('[data-close-detail]').click()

    def test_archived_history_remains_detached_after_backup_round_trip(self):
        self.seed(due='2026-06-30', anchor='2026-05-31', payments=[self.paid('old-plan', '2026-05-31')])
        self.detail()
        self.change_subscription_plan(due='2026-08-31')
        self.page.locator('[data-close-detail]').click()
        backup = self.export_backup()
        self.assertTrue(backup['data']['payments'][0]['scheduleArchived'])
        self.assertFalse(backup['data']['payments'][0]['advancesSchedule'])
        self.import_backup({'version': 1, 'data': {'subscriptions': [], 'payments': []}, 'preferences': PREFS})
        self.import_backup(backup)
        self.page.reload()
        self.assertEqual(self.store(), backup['data'])
        self.navigate('home')
        self.detail()
        self.page.locator('[data-remove-payment=old-plan]').click()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-08-31')

    def test_out_of_order_history_does_not_skip_unpaid_cycle(self):
        self.seed(anchor='2026-01-31')
        self.detail()
        self.payment(cycle='2026-03-31')
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-01-31')
        self.payment(cycle='2026-01-31')
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-02-28')
        self.payment(cycle='2026-02-28')
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-04-30')
        self.assertEqual(len(saved['payments']), 3)

    def test_duplicate_linked_payment_is_rejected(self):
        self.seed(anchor='2026-01-31', payments=[self.paid('paid', '2026-01-31')])
        before = self.raw()
        self.detail()
        self.payment(cycle='2026-01-31')
        expect(self.page.locator('#paymentForm')).to_be_visible()
        self.assertEqual(self.raw(), before)
        self.assertTrue(any('付款' in message or '重复' in message for message in self.messages))

    def test_deleting_linked_success_reopens_oldest_unpaid_cycle(self):
        payments = [self.paid('january', '2026-01-31'), self.paid('february', '2026-02-28'), self.paid('march', '2026-03-31')]
        self.seed(due='2026-04-30', anchor='2026-01-31', payments=payments)
        self.detail()
        self.page.locator('[data-remove-payment=february]').click()
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-02-28')
        self.assertEqual([p['id'] for p in saved['payments']], ['january', 'march'])
        self.confirm()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-04-30')

    def test_editing_success_to_failed_reopens_cycle(self):
        self.seed(due='2026-02-28', anchor='2026-01-31', payments=[self.paid('paid', '2026-01-31')])
        self.detail()
        self.page.locator('[data-edit-payment=paid]').click()
        self.fill_payment(cycle='2026-01-31', status='failed')
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertEqual(saved['payments'][0]['status'], 'failed')
        self.assertFalse(saved['payments'][0]['advancesSchedule'])

    def test_editing_failed_attempt_to_success_advances_once(self):
        self.seed(anchor='2026-01-31', payments=[self.paid('retry', '2026-01-31', status='failed', managed=False)])
        self.detail()
        self.page.locator('[data-edit-payment=retry]').click()
        self.fill_payment(cycle='2026-01-31', status='succeeded')
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-02-28')
        self.assertEqual(len(saved['payments']), 1)
        self.assertEqual(saved['payments'][0]['id'], 'retry')
        self.assertEqual(saved['payments'][0]['status'], 'succeeded')
        self.assertTrue(saved['payments'][0]['advancesSchedule'])

    def test_deleting_failed_attempt_does_not_change_schedule(self):
        self.seed(anchor='2026-01-31', payments=[self.paid('failure', '2026-01-31', status='failed', managed=False)])
        self.detail()
        self.page.locator('[data-remove-payment=failure]').click()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertEqual(self.store()['payments'], [])

    def test_cancelled_confirmation_records_nothing(self):
        self.seed(anchor='2026-01-31')
        before = self.raw()
        self.detail()
        self.page.remove_listener('dialog', self.dialog)
        self.page.on('dialog', lambda dialog: dialog.dismiss())
        self.page.locator('[data-confirm]').click()
        self.assertEqual(self.raw(), before)
        expect(self.page.locator('.drawer')).to_contain_text('暂无付款记录')

    def test_history_amount_edit_preserves_cycle_and_unknown_fields(self):
        payment = self.paid('paid', '2026-01-31')
        payment['receiptNote'] = '保留旧备注'
        self.seed(due='2026-02-28', anchor='2026-01-31', payments=[payment])
        self.detail()
        self.page.locator('[data-edit-payment=paid]').click()
        self.fill_payment(date='2026-10-21', amount='31.50', cycle='2026-01-31')
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-02-28')
        self.assertEqual(saved['payments'][0]['id'], 'paid')
        self.assertEqual(saved['payments'][0]['receiptNote'], '保留旧备注')
        self.assertEqual(saved['payments'][0]['amount'], 31.5)
        self.assertEqual(saved['payments'][0]['date'], '2026-10-21')

    def test_unlinked_legacy_history_is_not_assigned_a_cycle(self):
        payment = {'id': 'manual-old', 'subscriptionId': 'reading', 'name': '阅读会员',
                   'date': '2026-01-15', 'amount': 14.123, 'currency': 'CNY', 'legacy': True}
        self.seed(anchor='2026-01-31', payments=[payment])
        self.detail()
        self.page.locator('[data-remove-payment=manual-old]').click()
        self.assertEqual(self.store()['subscriptions'][0]['nextDate'], '2026-01-31')
        self.payment(cycle='', amount='14')
        saved = self.store()
        self.assertEqual(saved['subscriptions'][0]['nextDate'], '2026-01-31')
        self.assertFalse(saved['payments'][0].get('cycleDate'))

    def test_failed_storage_keeps_payment_form_and_schedule(self):
        self.seed(anchor='2026-01-31')
        before = self.raw()
        self.detail()
        self.page.evaluate("() => {Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}}")
        self.payment(cycle='2026-01-31', amount='39.50')
        self.assertEqual(self.raw(), before)
        expect(self.page.locator('#paymentForm')).to_be_visible()
        expect(self.page.locator('#paymentAmount')).to_have_value('39.50')
        self.assertTrue(any('保存失败' in message for message in self.messages))

    def test_future_actual_payment_date_and_off_schedule_cycle_rejected(self):
        self.seed(anchor='2026-01-31')
        before = self.raw()
        self.detail()
        self.payment(date='2026-10-23', cycle='2026-01-31')
        self.assertEqual(self.raw(), before)
        expect(self.page.locator('#paymentForm')).to_be_visible()
        self.page.get_by_role('button', name='关闭付款表单').click()
        self.payment(cycle='2026-02-27')
        self.assertEqual(self.raw(), before)
        expect(self.page.locator('#paymentForm')).to_be_visible()

    def test_enriched_backup_round_trip_preserves_new_and_old_fields(self):
        old = {'id': 'old', 'subscriptionId': 'reading', 'name': '阅读会员', 'date': '2025-12-01', 'amount': 8.123, 'currency': 'CNY'}
        original = self.seed(anchor='2026-01-31', payments=[old, self.paid('failed', '2026-01-31', status='failed', managed=False)])
        exported = self.export_backup()
        self.assertEqual(exported['data'], original)
        self.import_backup({'version': 1, 'data': {'subscriptions': [], 'payments': []}, 'preferences': PREFS})
        self.import_backup(exported)
        self.page.reload()
        self.assertEqual(self.store(), original)
        self.assertEqual(self.export_backup(), exported)

    def test_compact_phone_home_keeps_core_information_in_view(self):
        self.seed(due='2026-11-15')
        self.page.set_viewport_size({'width': 390, 'height': 844})
        expect(self.page.locator('.mobile-summary')).to_be_visible()
        expect(self.page.locator('.home-chart')).to_be_hidden()
        expect(self.page.locator('.home-metrics')).to_be_hidden()
        expect(self.page.locator('.home-table')).to_be_hidden()
        expect(self.page.locator('.mobile-subscriptions')).to_be_visible()
        self.assertTrue(self.page.evaluate('document.documentElement.scrollHeight <= innerHeight + 2'))
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        nav = self.page.locator('.sidebar').bounding_box()
        self.assertAlmostEqual(nav['y'] + nav['height'], 844, delta=2)
        expect(self.page.locator('.nav svg')).to_have_count(5)
        self.navigate('list')
        expect(self.page.locator('tr[data-detail]')).to_have_count(1)

    def test_reminders_are_never_truncated_to_fit_phone(self):
        items = []
        for index in range(8):
            sub = copy.deepcopy(FIXTURE['subscriptions'][0])
            sub.update(id=f'due-{index}', name=f'重要续费 {index+1}', nextDate='2026-10-20')
            items.append(sub)
        self.page.evaluate("value=>localStorage.setItem('sumi-data-v1',JSON.stringify(value))", {'subscriptions': items, 'payments': []})
        self.page.reload()
        self.page.set_viewport_size({'width': 390, 'height': 844})
        expect(self.page.locator('.reminder-item')).to_have_count(8)
        for reminder in self.page.locator('.reminder-item').all():
            expect(reminder).to_be_visible()
            self.assertNotEqual(reminder.evaluate('el=>getComputedStyle(el).visibility'), 'hidden')
        self.assertEqual(self.page.locator('.mobile-subscription').count(), 3)
        self.assertTrue(self.page.evaluate('document.documentElement.scrollHeight > innerHeight'))

    def test_chart_adapts_to_width_and_reduced_motion(self):
        self.seed(due='2026-11-15')
        for width in [320, 390, 720]:
            self.page.set_viewport_size({'width': width, 'height': 844})
            expect(self.page.locator('.home-chart')).to_be_hidden()
            expect(self.page.locator('.mobile-summary')).to_be_visible()
        for width in [721, 820, 1024, 1440]:
            self.page.set_viewport_size({'width': width, 'height': 1000})
            expect(self.page.locator('.home-chart')).to_be_visible()
            expect(self.page.locator('.mobile-summary')).to_be_hidden()
        self.page.emulate_media(reduced_motion='reduce')
        self.detail()
        durations = self.page.locator('.drawer').evaluate('el=>({animation:getComputedStyle(el).animationDuration,transition:getComputedStyle(el).transitionDuration})')
        self.assertTrue(all(float(x.rstrip('s')) <= .01 for value in durations.values() for x in value.split(', ')))
