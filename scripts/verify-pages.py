"""Verify that GitHub Pages serves the exact bytes of the uploaded static site.

This is a post-deployment check, not a publisher. It uses normal HTTPS requests
and never modifies the artifact, browser data, repository or deployment.
"""
from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor, as_completed
from hashlib import sha256
from http.client import HTTPException
from pathlib import Path
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import json
import socket
import sys


class VerificationError(ValueError):
    """The artifact, deployment URL or published bytes cannot be verified."""


def deployment_base(value):
    """Keep the repository subpath; reject credentials and ambiguous URLs."""
    try:
        parsed = urlsplit(value)
        _ = parsed.port  # Validate malformed port syntax too.
    except (TypeError, ValueError) as error:
        raise VerificationError('The deployment URL is invalid.') from error
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.query or parsed.fragment
            or any(character.isspace() or ord(character) < 32 for character in value)
            or '\\' in value
            or any(part in ('.', '..') for part in unquote(parsed.path).split('/'))):
        raise VerificationError('Use an HTTPS deployment URL without credentials, query or fragment.')
    path = parsed.path or '/'
    if not path.endswith('/'):
        path += '/'
    return urlunsplit(('https', parsed.netloc, path, '', ''))


def snapshot_site(site):
    """Read each regular artifact file once; .nojekyll is a hosting marker."""
    site = Path(site)
    if not site.is_dir() or site.is_symlink():
        raise VerificationError('The site must be a regular artifact directory.')
    expected = {}
    for path in sorted(site.rglob('*')):
        name = path.relative_to(site).as_posix()
        if path.is_symlink():
            raise VerificationError('Artifact symlinks are not supported: ' + json.dumps(name))
        if path.is_dir():
            continue
        if not path.is_file():
            raise VerificationError('Artifact contains a non-regular file: ' + json.dumps(name))
        if name == '.nojekyll':
            continue
        content = path.read_bytes()
        expected[name] = (len(content), sha256(content).hexdigest())
    if 'index.html' not in expected:
        raise VerificationError('The artifact must contain index.html.')
    return expected


class HTTPSRedirects(HTTPRedirectHandler):
    """A redirect must not silently verify a different origin or plain HTTP."""
    def redirect_request(self, request, response, code, message, headers, new_url):
        original, target = urlsplit(request.full_url), urlsplit(new_url)
        if (target.scheme != 'https' or target.netloc != original.netloc
                or target.username is not None or target.password is not None):
            raise VerificationError('Unsafe publication redirect.')
        return super().redirect_request(request, response, code, message, headers, new_url)


def fetch_bytes(url, timeout, max_bytes):
    """Fetch a bounded response without credentials, caches or content logging."""
    request = Request(url, headers={
        'User-Agent': 'sumi-pages-verifier/1.0',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'identity',
    })
    deadline = monotonic() + timeout
    with build_opener(HTTPSRedirects()).open(request, timeout=timeout) as response:
        if response.status != 200:
            raise HTTPError(url, response.status, 'Unexpected HTTP status', response.headers, None)
        chunks, received = [], 0
        # read1 returns the available network chunk instead of waiting to fill a
        # large buffer. Check the request deadline between chunks as well as
        # applying the connection/read socket timeout.
        read = getattr(response, 'read1', response.read)
        while received < max_bytes:
            if monotonic() >= deadline:
                raise TimeoutError('Publication request timed out.')
            chunk = read(min(65536, max_bytes - received))
            if not chunk:
                break
            chunks.append(chunk)
            received += len(chunk)
        return b''.join(chunks)


def verify_site(url, site, *, fetcher=fetch_bytes, workers=6, request_timeout=10,
                retry_budget=120, retry_delay=5, clock=monotonic, sleeper=sleep,
                report=None):
    """Retry only failed files within one shared propagation budget.

    The fetcher adapter is for deterministic tests. Production always uses the
    normal HTTPS implementation above. The budget includes request time; an
    in-flight socket read can take at most its remaining configured timeout.
    """
    base = deployment_base(url)
    if workers < 1 or workers > 6 or request_timeout <= 0 or retry_budget <= 0 or retry_delay < 0:
        raise VerificationError('Invalid verification limits.')
    expected = snapshot_site(site)
    deadline = clock() + retry_budget
    pending, failures, attempt = set(expected), {}, 0

    def check(name):
        remaining = deadline - clock()
        if remaining <= 0:
            return 'Verification time budget exhausted'
        size, digest = expected[name]
        try:
            actual = fetcher(base + quote(name, safe='/'), min(request_timeout, remaining), size + 1)
            if not isinstance(actual, bytes):
                return 'Invalid response type'
            if len(actual) != size:
                return 'Published size differs from artifact'
            if sha256(actual).hexdigest() != digest:
                return 'Published SHA-256 differs from artifact'
            return None
        except HTTPError as error:
            return f'HTTP {error.code}'
        except (TimeoutError, socket.timeout):
            return 'HTTP request timed out'
        except URLError:
            return 'Network or TLS request failed'
        except VerificationError:
            return 'Unsafe publication redirect'
        except HTTPException:
            return 'Invalid HTTP response'
        except OSError:
            return 'Network request failed'

    with ThreadPoolExecutor(max_workers=workers) as pool:
        while pending and clock() < deadline:
            attempt += 1
            futures = {pool.submit(check, name): name for name in sorted(pending)}
            remaining = set()
            for future in as_completed(futures):
                name = futures[future]
                reason = future.result()
                if reason:
                    failures[name] = reason
                    remaining.add(name)
                else:
                    failures.pop(name, None)
            pending = remaining
            if report:
                report(f'Attempt {attempt}: verified {len(expected) - len(pending)}/{len(expected)} published files.')
            if pending:
                left = deadline - clock()
                if left <= 0:
                    break
                sleeper(min(retry_delay, left))
    if pending:
        details = '\n'.join(f'  {json.dumps(name)}: {failures.get(name, "Verification time budget exhausted")}'
                            for name in sorted(pending))
        raise VerificationError(f'{len(pending)}/{len(expected)} published files failed verification:\n{details}')
    return {'files': len(expected), 'attempts': attempt, 'url': base}


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='HTTPS page_url returned by actions/deploy-pages')
    parser.add_argument('--site', type=Path, required=True, help='Exact uploaded artifact directory')
    args = parser.parse_args(argv)
    try:
        result = verify_site(args.url, args.site, report=print)
    except (VerificationError, OSError) as error:
        print(f'Pages verification failed: {error}', file=sys.stderr)
        return 1
    print(f'Pages verification passed: {result["files"]} published files match the uploaded artifact.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
