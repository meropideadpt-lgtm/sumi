"""Cloud-sync settings DOM tests: Chromium viewports, never real Safari or cloud API."""
import json
from pathlib import Path
import unittest
from playwright.sync_api import expect
from browser_support import Harness, ROOT
from auth_support import AuthSite, URL

COUNTS={'subscriptions':2,'payments':3,'costHistory':4,'preferences':4,'extensions':1,'images':1}
PREVIEW={'id':'preview-1','localCounts':COUNTS,'cloudCounts':{**COUNTS,'subscriptions':0},'differences':2}
CONFLICT={'id':'conflict-1','records':[{'kind':'payments','id':'old-payment',
    'local':{'id':'old-payment','name':'Payment <img src=x onerror=alert(1)>','amount':3.123456789,'currency':'USD','fxSnapshot':{'rate':7.8123456789,'convertedAmount':24.3981481515}},
    'remote':{'id':'old-payment','amount':99.875,'currency':'USD'},'localDeleted':False,'remoteDeleted':False}]}

class SyncViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.h=Harness().__enter__()
    @classmethod
    def tearDownClass(cls):cls.h.__exit__()
    def setUp(self):self.contexts=[];self.errors=[]
    def tearDown(self):
        for context in self.contexts:context.close()
        self.assertEqual(self.errors,[])
    def page(self,model=None,language='en',theme='light',width=820,touch=False):
        context=self.h.browser.new_context(viewport={'width':width,'height':1000},has_touch=touch,service_workers='block')
        self.contexts.append(context);page=context.new_page();page.on('pageerror',lambda error:self.errors.append(str(error)))
        page.set_content('<!doctype html><html><head></head><body><div id="outside"><button id="outsideFocus">Outside</button></div><div id="fixture" class="card" style="margin:16px;max-width:1000px"></div></body></html>')
        page.add_style_tag(path=str(ROOT/'styles.css'))
        for name in ['locales/sync.js','i18n.js','sync-view.js']:page.add_script_tag(path=str(ROOT/name))
        page.evaluate('''({model,language,theme,preview})=>{
          SumiI18n.setLanguage(language);document.documentElement.lang=language;document.documentElement.dataset.theme=theme;
          window.model=model;window.calls=[];window.previewFixture=preview;
          window.actions={
            inspect:async()=>{calls.push(['inspect']);model.preview=previewFixture;SumiSyncView.refresh(document.getElementById('syncPanel'),model,actions)},
            upload:async id=>{calls.push(['upload',id]);model.enabled=true;model.status='synced';model.preview=null;model.hasBackup=true;SumiSyncView.refresh(document.getElementById('syncPanel'),model,actions)},
            restore:async id=>{calls.push(['restore',id])},cancelPreview:async()=>{calls.push(['cancelPreview'])},
            retry:async()=>{calls.push(['retry'])},exportBackup:async()=>{calls.push(['exportBackup'])},
            resolve:async(id,choice)=>{calls.push(['resolve',id,choice])}
          };
          document.getElementById('fixture').innerHTML=SumiSyncView.markup(model);
          SumiSyncView.bind(document.getElementById('fixture'),actions);
        }''',{'model':model or {'enabled':False,'status':'disabled','pending':0},'language':language,'theme':theme,'preview':PREVIEW})
        return page

    def test_explicit_preview_and_upload_actions_are_usable_without_refreshing_page(self):
        p=self.page();p.locator('[data-sync-action=inspect]').click()
        expect(p.locator('#syncPreviewTitle')).to_be_visible()
        expect(p.locator('.sync-counts tbody tr')).to_have_count(6)
        p.locator('[data-sync-action=upload]').click()
        expect(p.locator('[data-sync-status]')).to_have_text('Synced')
        expect(p.locator('.sync-preview')).to_have_count(0)
        p.locator('[data-sync-action=exportBackup]').click()
        self.assertEqual(p.evaluate('calls'),[['inspect'],['upload','preview-1'],['exportBackup']])

    def test_touch_restore_and_keyboard_conflict_choices_use_exact_ids(self):
        p=self.page({'enabled':False,'status':'disabled','pending':0,'preview':PREVIEW},width=390,touch=True)
        p.locator('[data-sync-action=restore]').tap()
        self.assertEqual(p.evaluate('calls'),[['restore','preview-1']])
        p.evaluate('''conflict=>{model={enabled:true,status:'conflict',pending:1,conflicts:[conflict]};SumiSyncView.refresh(document.getElementById('syncPanel'),model,actions,{force:true})}''',CONFLICT)
        p.locator('summary').focus();p.keyboard.press('Enter')
        expect(p.locator('[data-sync-action=remote]')).to_be_visible()
        p.locator('[data-sync-action=remote]').focus();p.keyboard.press('Enter')
        self.assertEqual(p.evaluate('calls').pop(),['resolve','conflict-1','remote'])
        expect(p.locator('.sync-versions')).to_contain_text('24.3981481515')
        self.assertEqual(p.locator('.sync-versions img').count(),0)

    def test_background_updates_preserve_focused_action_and_native_controls(self):
        p=self.page({'enabled':True,'status':'synced','pending':0,'lastSuccess':'2026-10-25T12:34:00Z','conflicts':[CONFLICT]})
        p.evaluate("document.getElementById('outside').insertAdjacentHTML('beforeend','<select id=untouched><option>One</option></select>');window.outsideSelect=document.getElementById('untouched')")
        p.locator('summary').click();p.locator('[data-sync-action=retry]').focus()
        p.evaluate("window.retryNode=document.querySelector('[data-sync-action=retry]');model.status='offline';model.pending=2;SumiSyncView.refresh(document.getElementById('syncPanel'),model,actions)")
        self.assertTrue(p.evaluate("retryNode===document.querySelector('[data-sync-action=retry]')&&document.activeElement===retryNode&&outsideSelect===document.getElementById('untouched')"))
        expect(p.locator('[data-sync-status]')).to_have_text('Offline — waiting to sync')
        expect(p.locator('[data-sync-pending]')).to_have_text('2')
        p.locator('#outsideFocus').focus()
        expect(p.locator('[data-sync-action=retry]')).to_have_text('Retry sync')
        self.assertTrue(p.locator('details').evaluate('(node)=>node.open'))
        self.assertTrue(p.evaluate("outsideSelect===document.getElementById('untouched')"))

    def test_one_pending_action_cannot_be_submitted_twice_and_error_is_sanitized(self):
        p=self.page({'enabled':True,'status':'error','pending':1})
        p.evaluate("actions.retry=()=>new Promise((resolve,reject)=>{calls.push(['retry']);window.rejectAction=reject});SumiSyncView.bind(document.getElementById('syncPanel'),actions)")
        p.locator('[data-sync-action=retry]').click()
        p.evaluate("document.querySelector('[data-sync-action=retry]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        self.assertEqual(p.evaluate('calls'),[['retry']])
        p.evaluate("rejectAction(Error('secret server body'))")
        expect(p.locator('[data-sync-error]')).to_be_visible()
        self.assertNotIn('secret server body',p.locator('#syncPanel').inner_text())
        expect(p.locator('[data-sync-action=retry]')).to_be_enabled()

    def test_four_languages_themes_and_touch_viewports_keep_content_within_page(self):
        titles={'zh-CN':'云端同步','zh-TW':'雲端同步','ja-JP':'クラウド同期','en':'Cloud sync'}
        for language,title in titles.items():
            for width in [320,390,820,1440]:
                with self.subTest(language=language,width=width):
                    p=self.page({'enabled':False,'status':'conflict','pending':1,'lastSuccess':'2026-10-25T12:34:00Z','preview':PREVIEW,'conflicts':[CONFLICT],'hasBackup':True},language=language,width=width,touch=width<1000)
                    p.locator('summary').click();expect(p.locator('#syncTitle')).to_have_text(title)
                    for theme in ['light','dark']:
                        p.evaluate('theme=>document.documentElement.dataset.theme=theme',theme)
                        self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                        self.assertTrue(p.locator('[data-sync-action]').evaluate_all('nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)'))
                        self.assertNotIn('undefined',p.locator('#syncPanel').inner_text())
                    p.context.close();self.contexts.remove(p.context)

    def test_guest_panel_never_binds_a_cloud_action(self):
        p=self.page({'guest':True,'enabled':True,'preview':PREVIEW,'conflicts':[CONFLICT]})
        expect(p.locator('[data-sync-action]')).to_have_count(0)
        expect(p.locator('.sync-counts')).to_have_count(0)
        self.assertEqual(p.evaluate('calls'),[])

    def test_lock_guidance_is_translated_and_readable_on_touch_in_both_themes(self):
        for language in ['zh-CN','zh-TW','ja-JP','en']:
            for code,key in [('sync-other-tab','otherTab'),('sync-lock-unavailable','lockUnavailable')]:
                with self.subTest(language=language,code=code):
                    p=self.page({'enabled':False,'status':'paused','error':code},language=language,width=390,touch=True)
                    expected=p.evaluate('key=>SumiI18n.t("sync.error."+key)',key)
                    expect(p.locator('[data-sync-error]')).to_have_text(expected)
                    for theme in ['light','dark']:
                        p.evaluate('theme=>document.documentElement.dataset.theme=theme',theme)
                        expect(p.locator('[data-sync-error]')).to_be_visible()
                        self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    p.context.close();self.contexts.remove(p.context)


class SyncReadinessAppTests(unittest.TestCase):
    """Real app/official SDK with mock Auth only; no real account or RPC."""
    @classmethod
    def setUpClass(cls):cls.h=Harness().__enter__()
    @classmethod
    def tearDownClass(cls):cls.h.__exit__()
    def setUp(self):self.sites=[];self.cloud_calls=[]
    def tearDown(self):
        for site in self.sites:
            site.close();self.assertEqual(site.errors,[])
        self.assertEqual(self.cloud_calls,[], 'A lock failure must not issue private RPC')
    def site(self,**kwargs):
        site=AuthSite(self.h,**kwargs);self.sites.append(site)
        def blocked(route):
            self.cloud_calls.append(route.request.url);route.abort('blockedbyclient')
        site.context.route(URL+'/rest/v1/**',blocked)
        site.login();expect(site.page.locator('[data-add]')).to_be_visible()
        site.page.locator('[data-nav=settings]').click()
        site.page.locator('#language').select_option('en')
        return site

    def test_actual_second_tab_explains_pause_and_can_reclaim_after_owner_closes(self):
        site=self.site()
        original=site.page.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        second=site.new_page(self.h.url)
        expect(second.locator('[data-add]')).to_be_visible()
        second.locator('[data-nav=settings]').click()
        expect(second.locator('[data-sync-error]')).to_contain_text('another tab')
        self.assertEqual(second.evaluate('syncController.model().error'),'sync-other-tab')
        self.assertEqual(second.evaluate("workspaceStorage.getItem('sumi-data-v1')"),original)
        site.page.close()
        second.locator('[data-sync-action=inspect]').click()
        expect(second.locator('[data-add]')).to_be_visible()  # reclaim reloads current workspace
        second.locator('[data-nav=settings]').click()
        expect(second.locator('[data-sync-error]')).to_be_hidden()
        self.assertTrue(second.evaluate('SumiSyncLock.isOwner()'))
        self.assertEqual(second.evaluate("workspaceStorage.getItem('sumi-data-v1')"),original)

    def test_unsupported_locks_explain_secure_context_and_keep_local_account_data(self):
        site=self.site(init="Object.defineProperty(navigator,'locks',{value:undefined});")
        expect(site.page.locator('[data-sync-error]')).to_contain_text('Web Locks')
        expect(site.page.locator('[data-sync-error]')).to_contain_text('HTTPS')
        site.page.locator('[data-nav=home]').click()
        site.page.locator('[data-add]').click()
        site.page.locator('#name').fill('Local account still usable')
        site.page.locator('#amount').fill('1.23')
        site.page.locator('#subscriptionForm [type=submit]').click()
        expect(site.page.locator('#subscriptionForm')).to_have_count(0)
        original=site.page.evaluate("workspaceStorage.getItem('sumi-data-v1')")
        site.page.locator('[data-nav=settings]').click()
        site.page.locator('[data-sync-action=inspect]').click()
        expect(site.page.locator('[data-sync-error]')).to_contain_text('Web Locks')
        self.assertEqual(site.page.evaluate("workspaceStorage.getItem('sumi-data-v1')"),original)
        self.assertFalse(site.page.evaluate('syncController.model().enabled'))
