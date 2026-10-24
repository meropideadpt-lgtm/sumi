"""Actual vendored SDK with a deterministic GoTrue HTTP stub; never a live account."""
import base64
import copy
from datetime import datetime, timezone
import json
from browser_support import FIXTURE, PREFS, FX_CURRENCIES, FX_LATEST

URL='https://personal.supabase.co'
KEY='sb_publishable_test_public_only'
A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
STORAGE='sumi-auth-v1:https%3A%2F%2Fpersonal.supabase.co'
NOW=int(datetime(2026,10,21,16,tzinfo=timezone.utc).timestamp())

def session(uid=A, email='owner@example.test', expires=NOW+3600, refresh='refresh-test-only'):
    def encode(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    token=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':uid,'aud':'authenticated','role':'authenticated','exp':expires,'iat':NOW})+'.test-signature'
    return {'access_token':token,'refresh_token':refresh,'token_type':'bearer','expires_in':3600,'expires_at':expires,
            'user':{'id':uid,'email':email,'aud':'authenticated','role':'authenticated','app_metadata':{'provider':'email'},'user_metadata':{},'created_at':'2026-10-21T00:00:00Z'}}

class AuthSite:
    def __init__(self,h,language='zh-CN',theme='light',size=(1440,1000),cached=None,choice=None,touch=False,init=None,offline=False,refresh_error=False,user_error=False):
        self.calls=[];self.offline=offline;self.password_error=None;self.refresh_error=refresh_error
        self.next_user=A;self.rotations=0;self.errors=[]
        self.current_session=cached or session();self.user_error=user_error
        self.context=h.browser.new_context(viewport={'width':size[0],'height':size[1]},locale='en',
            timezone_id='Asia/Shanghai',has_touch=touch,is_mobile=touch,service_workers='block')
        self.context.route('**/auth-config.js',lambda route:route.fulfill(content_type='text/javascript',body='globalThis.SumiAuthConfig='+json.dumps({'url':URL,'publishableKey':KEY})+';'))
        self.context.route(URL+'/auth/v1/**',self.auth_route)
        self.context.route('https://api.frankfurter.dev/v1/**',lambda route:route.abort('internetdisconnected') if self.offline else route.fulfill(content_type='application/json',body=json.dumps(FX_CURRENCIES if route.request.url.endswith('/currencies') else FX_LATEST)))
        data=copy.deepcopy(FIXTURE)
        data['payments']=[{'id':'guest-history','subscriptionId':'reading','name':'Original payment','date':'2026-10-20','amount':3.123,'currency':'USD','note':'keep verbatim'}]
        data['extension']={'retained':'旧版数据'}
        values={'sumi-data-v1':json.dumps(data,ensure_ascii=False,indent=2),
                'sumi-prefs-v1':json.dumps({**PREFS,'language':language,'theme':theme}),
                'sumi-fx-cache-v1':'guest FX bytes must not change in account mode'}
        if cached:values[STORAGE]=json.dumps(cached)
        if choice:values['sumi-workspace-choice-v1']=json.dumps(choice)
        self.context.add_init_script('''(()=>{if(!localStorage.getItem('auth-test-seeded')){
            for(const [key,value] of Object.entries(%s))localStorage.setItem(key,value);
            localStorage.setItem('auth-test-seeded','yes');
        }})();'''%json.dumps(values))
        if init:self.context.add_init_script(init)
        self.page=self.new_page(h.url)
    def new_page(self,url):
        page=self.context.new_page();page.on('pageerror',lambda error:self.errors.append(str(error)))
        page.on('dialog',lambda dialog:dialog.accept())
        page.clock.install(time=datetime(2026,10,21,16,tzinfo=timezone.utc));page.goto(url);return page
    def auth_route(self,route):
        request=route.request
        # Test passwords are intentionally not retained in evidence.
        self.calls.append({'method':request.method,'url':request.url,'authorization':request.headers.get('authorization','')})
        if self.offline:return route.abort('internetdisconnected')
        if request.method=='OPTIONS':return route.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'})
        if '/token?' in request.url:
            refresh='grant_type=refresh_token' in request.url
            error_headers={'access-control-allow-origin':'*','x-supabase-api-version':'2024-01-01','access-control-expose-headers':'X-Supabase-Api-Version'}
            if self.password_error and not refresh:return route.fulfill(status=400,content_type='application/json',body=json.dumps({'code':self.password_error,'msg':'Do not expose raw server details'}),headers=error_headers)
            if refresh and self.refresh_error:return route.fulfill(status=400,content_type='application/json',body=json.dumps({'code':'refresh_token_not_found','msg':'Refresh token invalid'}),headers=error_headers)
            if refresh:self.rotations+=1
            result=session(uid=self.next_user,expires=NOW+3600*(1+self.rotations),refresh='refresh-rotated-'+str(self.rotations))
            self.current_session=result
            return route.fulfill(content_type='application/json',body=json.dumps(result),headers={'access-control-allow-origin':'*'})
        if '/logout' in request.url:return route.fulfill(status=204,headers={'access-control-allow-origin':'*'})
        if '/user' in request.url:
            if self.user_error:return route.fulfill(status=401,content_type='application/json',body=json.dumps({'error_code':'bad_jwt','msg':'Invalid user'}),headers={'access-control-allow-origin':'*'})
            return route.fulfill(content_type='application/json',body=json.dumps(self.current_session['user']),headers={'access-control-allow-origin':'*'})
        return route.fulfill(status=404,content_type='application/json',body='{}')
    def login(self,email='owner@example.test',password='test-password-never-save'):
        self.page.locator('#auth-email').fill(email);self.page.locator('#auth-password').fill(password)
        self.page.locator('#auth-submit').click()
    def raw_guest(self):return self.page.evaluate("['sumi-data-v1','sumi-prefs-v1','sumi-fx-cache-v1'].map(key=>localStorage.getItem(key))")
    def close(self):self.context.close()
