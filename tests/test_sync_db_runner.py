"""Bounded startup probes and diagnostic preservation; no production connection.

Set SUMI_TEST_DB_STARTUP=1 for the Docker entrypoint regression (DB CI job).
Other cases use a fake local Docker executable and run in regular browser CI.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'postgres:17-alpine@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb'
DOCKER = ['env', '-u', 'DOCKER_HOST', '-u', 'DOCKER_CONTEXT', '-u', 'DOCKER_TLS', '-u', 'DOCKER_TLS_VERIFY', '-u', 'DOCKER_CERT_PATH', 'docker', '--host=unix:///var/run/docker.sock']
FAKE = '''#!/usr/bin/env python3
import os,sys,time
from pathlib import Path
args=sys.argv[1:];mode=os.environ['DB_TEST_MODE']
with open(os.environ['DB_TEST_CALLS'],'a') as f:f.write(' '.join(args)+'\\n')
if 'inspect' in args:
 print('exited' if mode=='stopped' else 'running');sys.exit(0)
if 'logs' in args:print('diagnostic postgres log');sys.exit(0)
if 'SELECT 1' in args:
 if mode=='hang':time.sleep(15)
 if mode=='retry':
  p=Path(os.environ['DB_TEST_CALLS']+'.count');n=int(p.read_text()) if p.exists() else 0;p.write_text(str(n+1))
  if n==0:sys.exit(2)
 print('1');sys.exit(0)
if 'psql' in args:
 print('ERROR: deliberate SQL permission failure',file=sys.stderr);sys.exit(3)
sys.exit(0)
'''


class DatabaseRunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        fake = self.root / 'docker'
        fake.write_text(FAKE)
        fake.chmod(0o755)
        self.calls = self.root / 'calls'
        self.env = {**os.environ, 'PATH': str(self.root) + os.pathsep + os.environ['PATH'],
                    'DB_TEST_CALLS': str(self.calls)}

    def probe(self, mode, budget=2):
        command = 'source "$1"; docker_cmd=(docker); wait_sync_db disposable "$2"'
        return subprocess.run(['bash', '-c', command, 'test', str(ROOT / 'scripts/sync-db-ready.sh'), str(budget)],
                              env={**self.env, 'DB_TEST_MODE': mode}, capture_output=True, text=True, timeout=8)

    def test_connection_failure_retries_then_runs_tcp_select(self):
        result = self.probe('retry', 4)
        self.assertEqual(result.returncode, 0, result.stderr)
        queries = [s for s in self.calls.read_text().splitlines() if 'SELECT 1' in s]
        self.assertEqual(len(queries), 2)
        self.assertTrue(all('-h 127.0.0.1' in q and 'ON_ERROR_STOP=1' in q for q in queries))

    def test_hanging_probe_has_deadline(self):
        started = time.monotonic()
        result = self.probe('hang')
        self.assertNotEqual(result.returncode, 0)
        self.assertLess(time.monotonic() - started, 5)
        self.assertIn('timed out', result.stderr)

    def test_stopped_container_fails_without_query_retries(self):
        result = self.probe('stopped')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('stopped before readiness', result.stderr)
        self.assertNotIn('SELECT 1', self.calls.read_text())

    def test_sql_error_is_not_retried_and_diagnostics_survive_cleanup(self):
        scripts = self.root / 'scripts'
        scripts.mkdir()
        for name in ('test-sync-db.sh', 'sync-db-ready.sh'):
            shutil.copyfile(ROOT / 'scripts' / name, scripts / name)
        sql = self.root / 'supabase/tests'
        sql.mkdir(parents=True)
        (sql / 'bootstrap.sql').write_text('SELECT deliberately_invalid_sql;')
        result = subprocess.run(['bash', str(scripts / 'test-sync-db.sh')], env={**self.env, 'DB_TEST_MODE': 'sql-error'},
                                capture_output=True, text=True, timeout=8)
        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        artifacts = self.root / 'tests/artifacts/sync-database'
        self.assertIn('permission failure', (artifacts / 'runner.log').read_text())
        self.assertIn('stage=tests/bootstrap.sql exit=3', result.stdout + result.stderr)
        self.assertIn('diagnostic postgres log', (artifacts / 'postgres.log').read_text())
        self.assertTrue((artifacts / 'container-state.json').exists())
        calls = self.calls.read_text().splitlines()
        self.assertEqual(len([s for s in calls if 'psql' in s and 'SELECT 1' not in s]), 1)
        self.assertTrue(any('rm -fv' in s for s in calls))

    @unittest.skipUnless(os.environ.get('SUMI_TEST_DB_STARTUP') == '1', 'Docker startup regression runs in sync-database CI')
    def test_temporary_init_server_is_rejected_then_final_server_accepted(self):
        def docker(*args):
            return subprocess.run(DOCKER + list(args), capture_output=True, text=True, timeout=90)
        if docker('image', 'inspect', IMAGE).returncode:
            result = docker('pull', IMAGE)
            self.assertEqual(result.returncode, 0, result.stderr)
        name = 'sumi-startup-test-' + str(os.getpid())
        hold = self.root / 'hold.sh'
        hold.write_text('touch /tmp/initializing\nfor i in $(seq 1 30); do [ -f /tmp/release-init ] && break; sleep 1; done\n')
        hold.chmod(0o644)
        self.root.chmod(0o755)
        result = docker('run', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                        '--mount', f'type=bind,src={hold},dst=/docker-entrypoint-initdb.d/hold.sh,readonly', IMAGE)
        self.assertEqual(result.returncode, 0, result.stderr)
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                if docker('exec', name, 'test', '-f', '/tmp/initializing').returncode == 0:
                    break
                time.sleep(.1)
            else:
                self.fail('Initialization marker not reached')
            self.assertEqual(docker('exec', name, 'pg_isready', '-U', 'postgres').returncode, 0, 'old check is prematurely ready')
            command = 'source "$1"; docker_cmd=(env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock); wait_sync_db "$2" "$3"'
            def probe(budget):
                return subprocess.run(['bash', '-c', command, 'test', str(ROOT / 'scripts/sync-db-ready.sh'), name, str(budget)], capture_output=True, text=True, timeout=budget+5)
            premature = probe(2)
            self.assertNotEqual(premature.returncode, 0)
            self.assertIn('timed out', premature.stderr)
            self.assertEqual(docker('exec', name, 'touch', '/tmp/release-init').returncode, 0)
            ready = probe(15)
            self.assertEqual(ready.returncode, 0, ready.stderr)
        finally:
            log = ROOT / 'tests/artifacts/sync-database/startup-regression.log'
            log.parent.mkdir(parents=True, exist_ok=True)
            log.write_text(docker('logs', '--timestamps', name).stdout + docker('logs', '--timestamps', name).stderr)
            docker('rm', '-fv', name)


if __name__ == '__main__':
    unittest.main()
