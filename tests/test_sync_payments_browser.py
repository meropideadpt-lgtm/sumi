"""Payment sync acceptance through app forms, the vendored SDK and mock HTTP.

Independent Chromium contexts simulate devices. Offline auth/RPC/FX requests
fail, while the local test server still serves the shell on reload (SW blocked).
SQL/RLS and real Supabase/Storage/iPadOS are not exercised by this fixture.
"""
import copy
import json
from pathlib import Path
import unittest
from playwright.sync_api import expect
from browser_support import Harness, FX_LATEST, FX_CURRENCIES, PREFS
from auth_support import AuthSite, URL
from test_sync_subscriptions_browser import SubscriptionCloud


class PaymentCloud(SubscriptionCloud):
    def business_conflicts(self, changes):
        # The subset of the reviewed SQL contract needed by these scenarios:
        # successful paid-cycle uniqueness and tombstoned-parent/dependent rows.
        # Ownership/version CAS/operation receipts use the existing fixture.
        next_rows = copy.deepcopy(self.rows)
        for change in changes:
            next_rows[(change['kind'], change['id'])] = change
        conflicts = []

        def conflict(change, reason, remote):
            conflicts.append({'kind': change['kind'], 'id': change['id'],
                              'baseRevision': change['baseRevision'], 'reason': reason,
                              'remote': copy.deepcopy(remote)})

        for change in changes:
            if change['kind'] == 'payments' and not change['deleted']:
                payment = change['payload']
                parent = self.rows.get(('subscriptions', payment['subscriptionId']))
                final_parent = next_rows.get(('subscriptions', payment['subscriptionId']))
                if parent and parent['deleted'] and final_parent['deleted']:
                    conflict(change, 'parent-deleted', parent)
                if payment.get('status') != 'failed' and payment.get('cycleDate'):
                    for row in next_rows.values():
                        other = row['payload']
                        if (row['kind'] == 'payments' and row['id'] != change['id'] and not row['deleted']
                                and other.get('status') != 'failed' and other.get('cycleDate') == payment['cycleDate']
                                and other['subscriptionId'] == payment['subscriptionId']):
                            conflict(change, 'paid-cycle', self.rows.get(('payments', row['id'])))
            if change['kind'] == 'subscriptions' and change['deleted']:
                for row in self.rows.values():
                    if (row['kind'] == 'payments' and not row['deleted'] and row['payload']['subscriptionId'] == change['id']
                            and not next_rows[('payments', row['id'])]['deleted']):
                        conflict(change, 'dependent-records', row)
        return conflicts


class PaymentSyncBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def setUp(self):
        self.cloud = PaymentCloud()
        self.sites = []

    def tearDown(self):
        errors = []
        for site in self.sites:
            errors.extend(site.errors)
            site.close()
        self.assertEqual(errors, [], 'Unhandled JavaScript errors')

    def site(self, size=(1440, 1000), touch=False):
        site = AuthSite(self.h, size=size, touch=touch)
        self.sites.append(site)
        site.context.route(URL + '/rest/v1/rpc/**', lambda route: route.abort('internetdisconnected') if site.offline else self.cloud.route(route))
        offline = "Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>sessionStorage.getItem('sync-test-offline')!=='yes'});"
        site.context.add_init_script(offline)
        site.page.evaluate(offline)
        site.login()
        expect(site.page.locator('[data-add]')).to_be_visible()
        site.page.wait_for_function("typeof fxState!=='undefined' && fxState.snapshot && !fxState.loading")
        return site

    @staticmethod
    def state(site):
        return site.page.evaluate('structuredClone(data)')

    @staticmethod
    def close_detail(site):
        if site.page.locator('[data-close-detail]').count():
            site.page.locator('[data-close-detail]').click()
            expect(site.page.locator('#drawerOverlay')).to_have_count(0)

    def settings(self, site):
        self.close_detail(site)
        site.page.locator('[data-nav=settings]').click()

    def connect(self, site, choice):
        self.settings(site)
        site.page.locator('[data-sync-action=inspect]').click()
        expect(site.page.locator('.sync-preview')).to_be_visible()
        site.page.locator(f'[data-sync-action={choice}]').click()
        self.synced(site)

    @staticmethod
    def synced(site):
        site.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='synced' && syncController.model().pending===0")

    def sync(self, site):
        self.settings(site)
        site.page.wait_for_function('!syncController.isBusy()')
        site.page.locator('[data-sync-action=retry]').click()
        self.synced(site)

    def add_subscription(self, site):
        site.page.locator('[data-nav=home]').click()
        site.page.locator('[data-add]').click()
        site.page.locator('#name').fill('Frozen USD subscription')
        site.page.locator('#amount').fill('11.23')
        site.page.locator('#formCurrency').select_option('USD')
        site.page.locator('#nextDate').fill('2026-10-31')
        site.page.locator('#subscriptionForm [type=submit]').click()
        expect(site.page.locator('#subscriptionForm')).to_have_count(0)
        return self.state(site)['subscriptions'][0]['id']

    def details(self, site, subscription_id):
        self.close_detail(site)
        site.page.locator('[data-nav=list]').click()
        site.page.locator(f'[data-detail="{subscription_id}"]').first.click()
        expect(site.page.locator('[data-confirm]')).to_be_visible()

    def confirm(self, site, subscription_id, double=False):
        self.details(site, subscription_id)
        if double:
            site.page.locator('[data-confirm]').dblclick()
        else:
            site.page.locator('[data-confirm]').click()
        # Existing UI guards repeat confirmation for 750 ms; advance the test
        # clock, not real sleeps or changes to the application debounce.
        site.page.clock.run_for(800)
        return next(p for p in self.state(site)['payments'] if p.get('status') == 'succeeded')

    def edit(self, site, payment_id, **values):
        payment = next(p for p in self.state(site)['payments'] if p['id'] == payment_id)
        self.details(site, payment['subscriptionId'])
        site.page.locator(f'[data-edit-payment="{payment_id}"]').click()
        for name, value in values.items():
            field = site.page.locator('#payment' + name)
            if name in ('Currency', 'Status'):
                field.select_option(value)
            else:
                field.fill(value)
        site.page.locator('#paymentForm [type=submit]').click()
        expect(site.page.locator('#paymentForm')).to_have_count(0)
        return next(p for p in self.state(site)['payments'] if p['id'] == payment_id)

    @staticmethod
    def offline(site, value):
        site.offline = value
        site.page.evaluate("value=>{sessionStorage.setItem('sync-test-offline',value?'yes':'no');window.dispatchEvent(new Event(value?'offline':'online'))}", value)

    def refreshed_rates(self, site):
        changed = {**FX_LATEST, 'rates': {**FX_LATEST['rates'], 'CNY': 9.912345, 'USD': 1.223456}}
        def response(route):
            route.fulfill(json=FX_CURRENCIES if route.request.url.endswith('/currencies') else changed)
        site.context.route('https://api.frankfurter.dev/v1/**', response)
        self.settings(site)
        site.page.locator('#refreshRates').click()
        site.page.wait_for_function('!fxState.loading && fxState.snapshot.rates.CNY===9.912345')

    def initial_pair(self, paid=True, phone=False):
        desktop = self.site()
        sid = self.add_subscription(desktop)
        self.connect(desktop, 'upload')
        payment = self.confirm(desktop, sid) if paid else None
        if paid:
            self.sync(desktop)
        second = self.site(size=(390, 844) if phone else (820, 1180), touch=True)
        self.connect(second, 'restore')
        return desktop, second, sid, payment

    def test_payment_crud_failure_backfill_restore_and_frozen_fx_after_refresh(self):
        desktop = self.site()
        sid = self.add_subscription(desktop)
        self.connect(desktop, 'upload')
        paid = self.confirm(desktop, sid)
        frozen = copy.deepcopy(paid['fxSnapshot'])
        self.assertEqual(frozen['rate'], 7.8 / 1.1)
        self.assertEqual(frozen['convertedAmount'], 79.63)
        self.assertEqual(self.state(desktop)['subscriptions'][0]['nextDate'], '2026-11-30')
        self.sync(desktop)
        batch = next(p['p_changes'] for p in self.cloud.pushes if any(c['id'] == paid['id'] for c in p['p_changes']))
        self.assertEqual({c['kind'] for c in batch}, {'subscriptions', 'payments'})

        self.details(desktop, sid)
        desktop.page.locator('[data-fail-payment]').click()
        failed = next(p for p in self.state(desktop)['payments'] if p['status'] == 'failed')
        self.assertNotIn('fxSnapshot', failed)
        self.assertFalse(failed['advancesSchedule'])
        self.assertEqual(self.state(desktop)['subscriptions'][0]['nextDate'], '2026-11-30')
        desktop.page.locator('[data-payment]').click()
        desktop.page.locator('#paymentDate').fill('2026-10-20')
        desktop.page.locator('#paymentAmount').fill('2.22')
        desktop.page.locator('#paymentForm [type=submit]').click()
        expect(desktop.page.locator('#paymentForm')).to_have_count(0)
        backfill = next(p for p in self.state(desktop)['payments'] if p['id'] not in (paid['id'], failed['id']))
        self.assertNotIn('cycleDate', backfill)
        self.assertFalse(backfill['advancesSchedule'])
        self.sync(desktop)
        original = copy.deepcopy(self.state(desktop)['payments'])
        tablet = self.site(size=(820, 1180), touch=True)
        local_sid = self.add_subscription(tablet)
        self.confirm(tablet, local_sid)
        before_restore = self.state(tablet)
        pushes = len(self.cloud.pushes)
        self.connect(tablet, 'restore')
        self.assertEqual(tablet.page.evaluate('storage.snapshot().metadata.backup.data'), before_restore)
        self.assertEqual(len(self.cloud.pushes), pushes, 'restore must not upload the replaced local payments')
        self.assertCountEqual(self.state(tablet)['payments'], original)
        for site in (desktop, tablet):
            self.refreshed_rates(site)
            site.page.reload()
            expect(site.page.locator('[data-add]')).to_be_visible()
            self.synced(site)
            self.assertCountEqual(self.state(site)['payments'], original)
            self.assertEqual(site.page.evaluate("SumiFx.valuePayment(data.payments.find(p=>p.id===%s),'CNY').amount" % json.dumps(paid['id'])), 79.63)

        edited = self.edit(tablet, paid['id'], Date='2026-10-19')
        self.assertEqual(edited['fxSnapshot'], frozen)
        self.sync(tablet)
        self.sync(desktop)
        self.assertEqual(next(p for p in self.state(desktop)['payments'] if p['id'] == paid['id']), edited)
        edited_money = self.edit(tablet, paid['id'], Amount='15.55')
        self.assertEqual(edited_money['fxSnapshot']['rate'], frozen['rate'])
        self.assertEqual(edited_money['fxSnapshot']['rates'], frozen['rates'])
        self.assertEqual(edited_money['fxSnapshot']['confirmedAt'], frozen['confirmedAt'])
        self.assertEqual(edited_money['fxSnapshot']['convertedAmount'], 110.26)
        self.sync(tablet)
        self.sync(desktop)
        self.assertEqual(next(p for p in self.state(desktop)['payments'] if p['id'] == paid['id']), edited_money)

        self.details(tablet, sid)
        tablet.page.locator(f'[data-remove-payment="{paid["id"]}"]').click()
        self.sync(tablet)
        self.sync(desktop)
        for site in (desktop, tablet):
            self.assertNotIn(paid['id'], [p['id'] for p in self.state(site)['payments']])
            self.assertEqual(self.state(site)['subscriptions'][0]['nextDate'], '2026-10-31')
            self.assertEqual(next(p for p in self.state(site)['payments'] if p['id'] == failed['id']), failed)
        self.assertTrue(self.cloud.rows[('payments', paid['id'])]['deleted'])

    def test_legacy_precision_unknown_fields_and_missing_rates_are_not_repriced(self):
        desktop = self.site()
        sid = self.add_subscription(desktop)
        imported = self.state(desktop)
        imported['subscriptions'][0]['amount'] = 3.12345678901234
        imported['payments'] = [{'id': 'legacy/payment:precision', 'subscriptionId': sid, 'name': '原始記錄',
                                 'date': '2026-10-20', 'amount': 7.12345678901234, 'currency': 'USD',
                                 'extension': {'receipt': '保留精度', 'nested': [0.123456789012345]}}]
        self.settings(desktop)
        desktop.page.locator('#importFile').set_input_files({'name': 'legacy.json', 'mimeType': 'application/json',
            'buffer': json.dumps({'version': 1, 'data': imported, 'preferences': PREFS}).encode()})
        desktop.page.wait_for_function("document.querySelector('#importFile').value === ''")
        paid = self.confirm(desktop, sid)
        self.assertEqual(paid['amount'], 3.12345678901234)
        original = copy.deepcopy(self.state(desktop)['payments'])
        self.connect(desktop, 'upload')
        phone = self.site(size=(390, 844), touch=True)
        self.connect(phone, 'restore')
        for site in (desktop, phone):
            self.refreshed_rates(site)
            site.page.reload()
            expect(site.page.locator('[data-add]')).to_be_visible()
            self.synced(site)
            self.assertCountEqual(self.state(site)['payments'], original)
        edited = self.edit(phone, paid['id'], Date='2026-10-18')
        self.assertEqual(edited['amount'], paid['amount'])
        self.assertEqual(edited['fxSnapshot'], paid['fxSnapshot'])
        self.sync(phone)
        self.sync(desktop)
        self.settings(desktop)
        with desktop.page.expect_download() as download:
            desktop.page.locator('#export').click()
        exported = json.loads(Path(download.value.path()).read_text())
        self.assertCountEqual(exported['data']['payments'], self.state(phone)['payments'])
        legacy = next(p for p in exported['data']['payments'] if p['id'].startswith('legacy/'))
        self.assertEqual(legacy, imported['payments'][0])
        self.assertNotIn('fxSnapshot', legacy)

    def test_offline_edit_reopen_lost_ack_and_failed_readback_keep_one_operation(self):
        desktop, phone, sid, paid = self.initial_pair(phone=True)
        self.offline(phone, True)
        edited = self.edit(phone, paid['id'], Amount='21.11')
        op = phone.page.evaluate('storage.snapshot().metadata.outbox[0].id')
        phone.page.reload()
        expect(phone.page.locator('[data-add]')).to_be_visible()
        self.assertEqual(phone.page.evaluate('storage.snapshot().metadata.outbox[0].id'), op)
        self.assertEqual(self.state(phone)['payments'][0], edited)
        self.assertEqual(phone.page.evaluate('syncController.model().status'), 'offline')
        self.cloud.drop_next_ack = True
        self.offline(phone, False)
        phone.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='error'")
        self.assertEqual(self.cloud.rows[('payments', paid['id'])]['payload'], edited)
        self.assertEqual(phone.page.evaluate('storage.snapshot().metadata.outbox[0].id'), op)
        wire = phone.page.evaluate('structuredClone(storage.snapshot().metadata.outbox[0].wire)')
        phone.page.reload()
        expect(phone.page.locator('[data-add]')).to_be_visible()
        self.synced(phone)
        retries = [p for p in self.cloud.pushes if p['p_operation_id'] == op]
        self.assertGreaterEqual(len(retries), 2)
        self.assertTrue(all(p['p_changes'] == wire for p in retries))
        self.assertEqual(self.cloud.rows[('payments', paid['id'])]['revision'], 2)
        self.sync(desktop)
        self.assertEqual(self.state(desktop)['payments'], [edited])
        self.assertEqual(self.state(desktop)['subscriptions'][0]['nextDate'], '2026-11-30')

        self.offline(phone, True)
        amended = self.edit(phone, paid['id'], Date='2026-10-18')
        op = phone.page.evaluate('storage.snapshot().metadata.outbox[0].id')
        self.cloud.fail_readback = True
        self.offline(phone, False)
        phone.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='error'")
        self.assertEqual(self.cloud.rows[('payments', paid['id'])]['payload'], amended)
        self.assertEqual(phone.page.evaluate('storage.snapshot().metadata.outbox[0].id'), op)
        self.cloud.fail_reads = False
        self.sync(phone)
        self.sync(desktop)
        self.assertEqual(self.state(desktop)['payments'], [amended])
        self.assertEqual(amended['fxSnapshot'], edited['fxSnapshot'])
        self.assertEqual(self.cloud.rows[('payments', paid['id'])]['revision'], 3)

    def test_two_devices_confirming_same_cycle_keep_one_payment_and_one_schedule_advance(self):
        desktop, tablet, sid, _ = self.initial_pair(paid=False)
        self.offline(tablet, True)
        local_paid = self.confirm(tablet, sid, double=True)
        self.assertEqual(len(self.state(tablet)['payments']), 1)
        remote_paid = self.confirm(desktop, sid)
        self.sync(desktop)
        self.offline(tablet, False)
        tablet.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='conflict'")
        conflicts = tablet.page.evaluate('syncController.model().conflicts')
        self.assertTrue(any(c['reason'] == 'paid-cycle' for c in conflicts))
        self.assertEqual(self.state(tablet)['payments'], [local_paid])
        self.assertNotIn(('payments', local_paid['id']), self.cloud.rows)
        self.settings(tablet)
        tablet.page.locator('.sync-conflict summary').click()
        expect(tablet.page.locator('[data-sync-action=local]')).to_be_disabled()
        tablet.page.locator('[data-sync-action=remote]').click()
        self.synced(tablet)
        self.assertEqual(self.state(tablet)['payments'], [remote_paid])
        self.assertEqual(self.state(tablet)['subscriptions'][0]['nextDate'], '2026-11-30')
        tablet.page.reload()
        expect(tablet.page.locator('[data-add]')).to_be_visible()
        self.synced(tablet)
        self.assertEqual(self.state(tablet)['payments'], [remote_paid])

    def test_same_payment_conflict_preserves_both_frozen_versions_until_explicit_choice(self):
        desktop, tablet, sid, paid = self.initial_pair()
        for choice, left, right in [('remote', '25.15', '31.17'), ('local', '41.21', '52.23')]:
            with self.subTest(choice=choice):
                self.offline(tablet, True)
                local = self.edit(tablet, paid['id'], Amount=right)
                remote = self.edit(desktop, paid['id'], Amount=left)
                self.sync(desktop)
                self.offline(tablet, False)
                tablet.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='conflict'")
                conflict = tablet.page.evaluate('syncController.model().conflicts[0]')
                versions = next(r for r in conflict['records'] if r['kind'] == 'payments')
                self.assertEqual(versions['local'], local)
                self.assertEqual(versions['remote'], remote)
                self.assertEqual(versions['local']['fxSnapshot']['rates'], paid['fxSnapshot']['rates'])
                self.assertEqual(versions['remote']['fxSnapshot']['rates'], paid['fxSnapshot']['rates'])
                self.assertEqual(self.cloud.rows[('payments', paid['id'])]['payload'], remote)
                self.settings(tablet)
                tablet.page.locator('.sync-conflict summary').click()
                expect(tablet.page.locator('.sync-versions pre')).to_have_count(2)
                tablet.page.locator(f'[data-sync-action={choice}]').click()
                self.synced(tablet)
                self.sync(desktop)
                wanted = remote if choice == 'remote' else local
                self.assertEqual(self.state(tablet)['payments'], [wanted])
                self.assertEqual(self.state(desktop)['payments'], [wanted])
                self.assertEqual(self.state(desktop)['subscriptions'][0]['nextDate'], '2026-11-30')

    def test_parent_deletion_and_offline_payment_edit_cannot_restore_an_orphan(self):
        desktop, tablet, sid, paid = self.initial_pair()
        self.offline(tablet, True)
        local = self.edit(tablet, paid['id'], Date='2026-10-18')
        self.details(desktop, sid)
        desktop.page.locator('[data-delete]').click()
        self.sync(desktop)
        batch = self.cloud.pushes[-1]['p_changes']
        self.assertEqual({(c['kind'], c['id']) for c in batch if c['deleted']}, {('subscriptions', sid), ('payments', paid['id'])})
        self.offline(tablet, False)
        tablet.page.wait_for_function("!syncController.isBusy() && syncController.model().status==='conflict'")
        self.assertEqual(self.state(tablet)['payments'], [local])
        self.assertTrue(self.cloud.rows[('subscriptions', sid)]['deleted'])
        self.assertTrue(self.cloud.rows[('payments', paid['id'])]['deleted'])
        self.settings(tablet)
        tablet.page.locator('.sync-conflict summary').click()
        expect(tablet.page.locator('[data-sync-action=local]')).to_be_disabled()
        tablet.page.locator('[data-sync-action=remote]').click()
        self.synced(tablet)
        for site in (desktop, tablet):
            self.assertEqual(self.state(site)['payments'], [])
            self.assertEqual(self.state(site)['subscriptions'], [])
        tablet.page.reload()
        expect(tablet.page.locator('[data-add]')).to_be_visible()
        self.synced(tablet)
        self.assertEqual(self.state(tablet)['payments'], [])


if __name__ == '__main__':
    unittest.main()
