"""Published-byte verification with deterministic adapters; no public requests."""
from contextlib import redirect_stderr, redirect_stdout
from http.client import IncompleteRead
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
import importlib.util
from pathlib import Path
import tempfile
from threading import Lock, Thread
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('sumi_pages_verify', ROOT / 'scripts/verify-pages.py')
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
BUILD_SPEC = importlib.util.spec_from_file_location('sumi_pages_build_verify', ROOT / 'scripts/build-pages.py')
BUILD = importlib.util.module_from_spec(BUILD_SPEC)
BUILD_SPEC.loader.exec_module(BUILD)


class FakeClock:
    def __init__(self):
        self.now = 0
        self.sleeps = []

    def __call__(self):
        return self.now

    def sleep(self, amount):
        self.sleeps.append(amount)
        self.now += amount


class PagesVerifyTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='sumi-pages-verify-')
        self.addCleanup(temporary.cleanup)
        self.site = Path(temporary.name) / '_site'
        self.site.mkdir()
        self.contents = {
            'index.html': b'<main>sumi</main>',
            'app.js': b'const stage = 6;',
            'styles.css': b'body { color: black; }',
            'assets/brands/logo.svg': b'<svg xmlns="http://www.w3.org/2000/svg"/>',
            '.nojekyll': b'',
        }
        self.write(self.contents)
        self.clock = FakeClock()
        self.calls = []

    def write(self, contents):
        for name, content in contents.items():
            target = self.site / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

    def fetch(self, url, timeout, max_bytes):
        self.calls.append((url, timeout, max_bytes))
        name = url.removeprefix('https://example.test/sumi/')
        return self.contents[name]

    def run_verify(self, **kwargs):
        options = dict(fetcher=self.fetch, clock=self.clock, sleeper=self.clock.sleep,
                       retry_budget=10, retry_delay=2)
        options.update(kwargs)
        return VERIFY.verify_site('https://example.test/sumi/', self.site, **options)

    def test_exact_files_are_checked_under_project_subpath_without_nojekyll(self):
        before = {path.relative_to(self.site).as_posix():path.read_bytes()
                  for path in self.site.rglob('*') if path.is_file()}
        result = self.run_verify()
        self.assertEqual(result, {'files':4, 'attempts':1, 'url':'https://example.test/sumi/'})
        self.assertEqual({call[0] for call in self.calls},
                         {'https://example.test/sumi/' + name for name in self.contents if name != '.nojekyll'})
        for url, timeout, limit in self.calls:
            self.assertEqual(timeout, 10)
            self.assertEqual(limit, len(self.contents[url.removeprefix('https://example.test/sumi/')]) + 1)
        self.assertEqual(before, {path.relative_to(self.site).as_posix():path.read_bytes()
                                 for path in self.site.rglob('*') if path.is_file()})

    def test_real_packaged_release_verifies_all_90_published_resources(self):
        files, _ = BUILD.verified_files(ROOT)
        directory = self.site.parent / 'actual-release'
        directory.mkdir()
        for name, content in files.items():
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        calls = []
        def fetch(url, timeout, limit):
            name = url.removeprefix('https://example.test/sumi/')
            calls.append(name)
            return files[name]
        result = VERIFY.verify_site('https://example.test/sumi/', directory, fetcher=fetch)
        self.assertEqual(result['files'], len(files) - 1)
        self.assertEqual(result['files'], 90)
        self.assertEqual(set(calls), set(files) - {'.nojekyll'})
        for name in ('index.html','sw.js','sw-assets.js','manifest.webmanifest',
                     'locales/pwa.js',*BUILD.BRAND_METADATA):
            self.assertIn(name,calls)

    def test_transient_missing_and_stale_files_retry_without_refetching_successes(self):
        attempts = {}
        def fetch(url, timeout, limit):
            name = url.removeprefix('https://example.test/sumi/')
            attempts[name] = attempts.get(name, 0) + 1
            if name == 'app.js' and attempts[name] == 1:
                raise HTTPError(url, 404, 'not propagated', None, None)
            if name == 'styles.css' and attempts[name] < 3:
                return b'old CSS response'
            return self.contents[name]
        result = self.run_verify(fetcher=fetch)
        self.assertEqual(result['attempts'], 3)
        self.assertEqual(attempts, {'app.js':2, 'assets/brands/logo.svg':1, 'index.html':1, 'styles.css':3})
        self.assertEqual(self.clock.sleeps, [2,2])

    def test_equal_length_wrong_body_fails_sha_not_only_status_or_size(self):
        def fetch(url, timeout, limit):
            body = self.fetch(url, timeout, limit)
            return b'x' * len(body) if url.endswith('app.js') else body
        with self.assertRaisesRegex(VERIFY.VerificationError, '"app.js": Published SHA-256 differs'):
            self.run_verify(fetcher=fetch, retry_budget=1)
        self.assertEqual(self.clock.now, 1)

    def test_html_error_page_and_missing_files_never_count_as_success(self):
        def fetch(url, timeout, limit):
            if url.endswith('app.js'):
                return b'<html>Not the app</html>'
            if url.endswith('logo.svg'):
                raise HTTPError(url, 404, 'missing', None, None)
            return self.fetch(url,timeout,limit)
        with self.assertRaises(VERIFY.VerificationError) as failure:
            self.run_verify(fetcher=fetch, retry_budget=1)
        message = str(failure.exception)
        self.assertIn('2/4 published files failed',message)
        self.assertIn('"app.js": Published size differs',message)
        self.assertIn('"assets/brands/logo.svg": HTTP 404',message)
        self.assertNotIn('<html>',message)

    def test_request_failures_are_sanitized_without_response_bodies_or_urls(self):
        errors = [URLError('https://secret:token@private.invalid/body'),
                  TimeoutError('private value'), OSError('private value'),
                  IncompleteRead(b'private value'), VERIFY.VerificationError('private value')]
        for error in errors:
            with self.subTest(error=type(error).__name__):
                clock = FakeClock()
                def fetch(*args):
                    raise error
                with self.assertRaises(VERIFY.VerificationError) as failure:
                    self.run_verify(fetcher=fetch, clock=clock, sleeper=clock.sleep, retry_budget=1)
                self.assertNotIn('private',str(failure.exception))
                self.assertNotIn('token',str(failure.exception))
                self.assertIn('"index.html"',str(failure.exception))

    def test_https_base_rejects_credentials_queries_fragments_and_traversal(self):
        self.assertEqual(VERIFY.deployment_base('https://example.test/sumi'), 'https://example.test/sumi/')
        self.assertEqual(VERIFY.deployment_base('https://example.test'), 'https://example.test/')
        for url in ('http://example.test/sumi/', 'https://user:secret@example.test/',
                    'https://example.test/sumi/?token=secret', 'https://example.test/#fragment',
                    'https://example.test/a/../sumi/', 'https://example.test/a/%2e%2e/sumi/',
                    'https://example.test:broken/', 'https://example.test/\npath',
                    'file:///tmp/site', 'https://example.test\\evil/path'):
            with self.subTest(url=url), self.assertRaises(VERIFY.VerificationError):
                VERIFY.deployment_base(url)

    def test_relative_filenames_are_url_encoded_without_dropping_scope(self):
        (self.site / 'a logo.svg').write_bytes(b'logo')
        def fetch(url, timeout, limit):
            if url.endswith('a%20logo.svg'):
                return b'logo'
            return self.fetch(url,timeout,limit)
        self.assertEqual(self.run_verify(fetcher=fetch)['files'],5)

    def test_concurrency_is_bounded_at_six(self):
        for i in range(18):
            name = f'asset-{i}.js'
            self.contents[name] = str(i).encode()
        self.write(self.contents)
        lock = Lock()
        active = maximum = 0
        def fetch(url, timeout, limit):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum,active)
            time.sleep(.01)
            body = self.fetch(url,timeout,limit)
            with lock:
                active -= 1
            return body
        result = self.run_verify(fetcher=fetch)
        self.assertEqual(result['files'],22)
        self.assertGreater(maximum,1)
        self.assertLessEqual(maximum,6)

    def test_global_budget_includes_request_time_and_bounds_remaining_timeout(self):
        calls = []
        def fetch(url, timeout, limit):
            calls.append(timeout)
            self.clock.now += timeout
            raise TimeoutError()
        with self.assertRaises(VERIFY.VerificationError):
            self.run_verify(fetcher=fetch, workers=1, request_timeout=10, retry_budget=3)
        self.assertEqual(calls,[3])
        self.assertEqual(self.clock.now,3)
        self.assertEqual(self.clock.sleeps,[])

    def test_artifact_requires_index_and_refuses_symlinks(self):
        (self.site / 'index.html').unlink()
        with self.assertRaisesRegex(VERIFY.VerificationError,'index.html'):
            self.run_verify()
        (self.site / 'index.html').symlink_to(self.site/'app.js')
        with self.assertRaisesRegex(VERIFY.VerificationError,'symlinks'):
            self.run_verify()
        self.assertEqual(self.calls,[])

    def test_redirect_guard_allows_same_origin_https_and_rejects_downgrade_or_other_hosts(self):
        guard = VERIFY.HTTPSRedirects()
        request = Request('https://example.test/sumi/index.html')
        redirect = guard.redirect_request(request,None,301,'Moved',{},'https://example.test/sumi/')
        self.assertEqual(redirect.full_url,'https://example.test/sumi/')
        for target in ('http://example.test/sumi/', 'https://elsewhere.test/sumi/',
                       'https://secret@example.test/sumi/'):
            with self.subTest(target=target),self.assertRaises(VERIFY.VerificationError):
                guard.redirect_request(request,None,301,'Moved',{},target)

    def test_http_fetcher_checks_status_caps_body_and_sends_normal_cache_headers(self):
        seen = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):
                pass
            def do_GET(self):
                seen.append((self.path,self.headers))
                if self.path == '/missing':
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header('Content-Length','100')
                self.end_headers()
                self.wfile.write(b'a'*100)
        server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread = Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            # Only this low-level adapter test uses localhost HTTP. verify_site
            # and the CLI always reject non-HTTPS deployment URLs.
            self.assertEqual(VERIFY.fetch_bytes(base+'/asset',1,11),b'a'*11)
            with self.assertRaises(HTTPError):
                VERIFY.fetch_bytes(base+'/missing',1,11)
            self.assertEqual(seen[0][1]['Cache-Control'],'no-cache')
            self.assertEqual(seen[0][1]['Accept-Encoding'],'identity')
            self.assertIsNone(seen[0][1]['Authorization'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_cli_returns_nonzero_on_failure_without_echoing_sensitive_url(self):
        output, errors = StringIO(), StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            result = VERIFY.main(['--url','https://secret:token@example.test/sumi/','--site',str(self.site)])
        self.assertEqual(result,1)
        self.assertNotIn('secret',errors.getvalue())
        self.assertNotIn('token',errors.getvalue())
        with patch.object(VERIFY,'verify_site',return_value={'files':90,'attempts':1}), redirect_stdout(output):
            self.assertEqual(VERIFY.main(['--url','https://example.test/sumi/','--site',str(self.site)]),0)
        self.assertIn('90 published files match',output.getvalue())


if __name__ == '__main__':
    unittest.main()
