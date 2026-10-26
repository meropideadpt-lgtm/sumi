"""One bounded subscription-sync flow through the real app and official SDK.

RPC/GoTrue responses are fixtures, with separate browser contexts as devices.
This is Chromium touch emulation, not Supabase or real iPadOS Safari acceptance.
"""
import base64
import copy
import json
import unittest
from playwright.sync_api import expect
from browser_support import Harness
from auth_support import AuthSite, A, URL


class SubscriptionCloud:
    def __init__(self):
        self.rows = {}
        self.receipts = {}
        self.sequence = 0
        self.calls = []

    def route(self, route):
        request = route.request
        headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'POST,OPTIONS'}
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=headers)
        args = request.post_data_json
        token = request.headers.get('authorization', '').split('.')
        claims = json.loads(base64.urlsafe_b64decode(token[1] + '==')) if len(token) == 3 else {}
        # This fixture checks request wiring; real database RLS has its own tests.
        if claims.get('sub') != A or args.get('p_expected_owner') != A:
            return route.fulfill(status=403, headers=headers, json={'code': '42501'})
        name = request.url.rsplit('/', 1)[1]
        self.calls.append(name)
        if name == 'sumi_sync_pull':
            rows = sorted((r for r in self.rows.values() if int(r['seq']) > int(args['p_after'])), key=lambda r: int(r['seq']))
            page = rows[:args['p_limit']]
            more = len(rows) > len(page)
            result = {'version': 1, 'records': page, 'more': more,
                      'cursor': page[-1]['seq'] if more else str(self.sequence)}
        else:
            assert name == 'sumi_sync_push'
            operation = args['p_operation_id']
            changes = args['p_changes']
            if operation in self.receipts:
                body, result = self.receipts[operation]
                assert changes == body
            else:
                conflicts = [{'kind': c['kind'], 'id': c['id'], 'baseRevision': c['baseRevision'],
                              'reason': 'revision', 'remote': self.rows.get((c['kind'], c['id']))}
                             for c in changes if self.rows.get((c['kind'], c['id']), {}).get('revision', 0) != c['baseRevision']]
                if conflicts:
                    result = {'ok': False, 'conflicts': conflicts}
                else:
                    records = []
                    for change in changes:
                        self.sequence += 1
                        row = {k: copy.deepcopy(change[k]) for k in ('kind', 'id', 'payload', 'deleted')}
                        row.update(revision=change['baseRevision'] + 1, seq=str(self.sequence))
                        self.rows[(row['kind'], row['id'])] = row
                        records.append(row)
                    result = {'ok': True, 'records': records}
                    self.receipts[operation] = (copy.deepcopy(changes), copy.deepcopy(result))
        route.fulfill(headers=headers, json=result)


class SubscriptionSyncBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = Harness().__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.h.__exit__()

    def test_desktop_upload_tablet_restore_edit_and_guest_preservation(self):
        cloud = SubscriptionCloud()
        sites = []
        try:
            for size, touch in [((1440, 1000), False), ((820, 1180), True)]:
                site = AuthSite(self.h, size=size, touch=touch)
                sites.append(site)
                site.context.route(URL + '/rest/v1/rpc/**', cloud.route)
                site.login()
                expect(site.page.locator('[data-add]')).to_be_visible()
            desktop, tablet = sites
            original_guest = [s.raw_guest() for s in sites]
            self.assertEqual(cloud.calls, [], 'login alone must not access cloud records')

            def add(page, name):
                page.locator('[data-add]').click()
                page.locator('#name').fill(name)
                page.locator('#amount').fill('19.25')
                page.locator('#subscriptionForm [type=submit]').click()
                expect(page.locator('#subscriptionForm')).to_have_count(0)

            def connect(page, choice):
                page.locator('[data-nav=settings]').click()
                page.locator('[data-sync-action=inspect]').click()
                expect(page.locator('.sync-preview')).to_be_visible()
                page.locator(f'[data-sync-action={choice}]').click()
                page.wait_for_function("syncController.model().status === 'synced' && syncController.model().pending === 0")
                expect(page.locator('[data-sync-status]')).to_have_attribute('data-state', 'synced')

            add(desktop.page, 'Desktop subscription')
            original = desktop.page.evaluate('structuredClone(data.subscriptions[0])')
            self.assertEqual(cloud.calls, [])
            connect(desktop.page, 'upload')
            self.assertEqual(cloud.rows[('subscriptions', original['id'])]['payload'], original)
            self.assertEqual(cloud.calls[-1], 'sumi_sync_pull')

            add(tablet.page, 'Keep in restore backup')
            local_id = tablet.page.evaluate('data.subscriptions[0].id')
            push_count = cloud.calls.count('sumi_sync_push')
            connect(tablet.page, 'restore')
            self.assertEqual(tablet.page.evaluate('data.subscriptions[0]'), original)
            self.assertEqual(tablet.page.evaluate('storage.snapshot().metadata.backup.data.subscriptions[0].id'), local_id)
            self.assertEqual(cloud.calls.count('sumi_sync_push'), push_count)

            tablet.page.locator('[data-nav=home]').click()
            tablet.page.locator('[data-detail]').first.click()
            tablet.page.locator('[data-edit]').click()
            tablet.page.locator('#amount').fill('25.5')
            tablet.page.locator('#subscriptionForm [type=submit]').click()
            tablet.page.wait_for_function("syncController.model().pending === 0 && Object.values(storage.snapshot().metadata.base).some(r => r.kind === 'subscriptions' && r.payload.amount === 25.5)")
            self.assertEqual(cloud.rows[('subscriptions', original['id'])]['payload']['amount'], 25.5)
            desktop.page.locator('[data-sync-action=retry]').click()
            desktop.page.wait_for_function('data.subscriptions[0].amount === 25.5')
            self.assertEqual(desktop.page.evaluate('data.subscriptions[0].id'), original['id'])
            self.assertEqual([s.raw_guest() for s in sites], original_guest)
            self.assertFalse(tablet.page.evaluate('document.documentElement.scrollWidth > innerWidth'))

            # Reopen the account and leave it: its records/sidecar and guest bytes survive.
            tablet.page.reload()
            expect(tablet.page.locator('[data-add]')).to_be_visible()
            self.assertEqual(tablet.page.evaluate('data.subscriptions[0].amount'), 25.5)
            stored = tablet.page.evaluate("workspaceStorage.getItem('sumi-data-v1')")
            prefix = tablet.page.evaluate('SumiWorkspace.current().prefix')
            tablet.page.locator('[data-nav=settings]').click()
            tablet.page.locator('#accountGuest').click()
            expect(tablet.page.locator('[data-add]')).to_be_visible()
            self.assertEqual(tablet.page.evaluate('(key) => localStorage.getItem(key)', prefix + 'sumi-data-v1'), stored)
            calls = len(cloud.calls)
            tablet.page.locator('[data-nav=settings]').click()
            expect(tablet.page.locator('#syncPanel [data-sync-action]')).to_have_count(0)
            tablet.page.evaluate("window.dispatchEvent(new Event('online'))")
            self.assertEqual(len(cloud.calls), calls)
        finally:
            for site in sites:
                errors = list(site.errors)
                site.close()
                self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
