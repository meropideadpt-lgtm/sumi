"""Deterministic browser harness; no application dependencies or external services."""
from functools import partial
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = {'subscriptions': [
    {'id': 'reading', 'name': '阅读会员', 'amount': 28, 'currency': 'CNY', 'months': 1, 'nextDate': '2026-11-15', 'status': 'active', 'autoRenew': True, 'logo': ''},
    {'id': 'music', 'name': '音乐订阅', 'amount': 120, 'currency': 'CNY', 'months': 12, 'nextDate': '2026-12-01', 'status': 'active', 'autoRenew': True, 'logo': ''},
], 'payments': []}
PREFS = {'currency': 'CNY', 'reminder': 3, 'theme': 'light', 'language': 'zh-CN'}
SIZES = {'desktop': (1440, 1000), 'ipad': (820, 1180), 'phone': (390, 844)}
# Deterministic API fixtures, not assertions about a live provider response.
FX_LATEST = {'amount': 1, 'base': 'EUR', 'date': '2026-10-21', 'rates': {
    'CNY': 7.8, 'USD': 1.1, 'JPY': 160, 'HKD': 8.6, 'GBP': .85, 'KRW': 1500,
}}
FX_CURRENCIES = {'EUR': 'Euro', 'CNY': 'Chinese Renminbi Yuan', 'USD': 'United States Dollar',
                 'JPY': 'Japanese Yen', 'HKD': 'Hong Kong Dollar', 'GBP': 'British Pound',
                 'KRW': 'South Korean Won'}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class Harness:
    def __enter__(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=os.environ.get('SUMI_SITE_ROOT', str(ROOT))))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.pw = sync_playwright().start()
        executable = os.environ.get('SUMI_CHROMIUM') or shutil.which('chromium')
        self.browser = self.pw.chromium.launch(executable_path=executable, headless=True)
        return self

    def page(self, size=(1440, 1000), data=None, prefs=None, init=None, fx=None):
        context = self.browser.new_context(viewport={'width': size[0], 'height': size[1]}, timezone_id='Asia/Shanghai', locale='zh-CN', device_scale_factor=1)
        context.route('https://cdn.simpleicons.org/**', lambda route: route.abort())
        fx_requests = []
        def fx_route(route):
            fx_requests.append(route.request.url)
            if callable(fx):
                return fx(route)
            if fx is False:
                return route.abort('internetdisconnected')
            path = route.request.url.split('?', 1)[0]
            if path.endswith('/currencies'):
                payload = FX_CURRENCIES
            elif path.endswith('/latest'):
                payload = FX_LATEST
            else:
                return route.fulfill(status=404, content_type='application/json', body='{}')
            route.fulfill(status=200, content_type='application/json', body=json.dumps(payload),
                          headers={'access-control-allow-origin':'*'})
        context.route('https://api.frankfurter.dev/v1/**', fx_route)
        page = context.new_page()
        page.fx_requests = fx_requests
        page.clock.install(time=datetime(2026,10,21,16,tzinfo=timezone.utc))  # 2026-10-22 00:00 Asia/Shanghai
        if init:
            page.add_init_script(init)
        page.goto(self.url)
        if data is not None or prefs is not None:
            page.evaluate('''({data,prefs}) => {
                if(data!==null)localStorage.setItem('sumi-data-v1',JSON.stringify(data));
                if(prefs!==null)localStorage.setItem('sumi-prefs-v1',JSON.stringify(prefs));
            }''', {'data': data, 'prefs': prefs})
            page.reload()
        page.wait_for_function("typeof fxManager==='undefined'||!fxManager.getState().loading")
        return page

    def __exit__(self, *args):
        self.browser.close()
        self.pw.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
