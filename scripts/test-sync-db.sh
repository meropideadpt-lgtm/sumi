#!/usr/bin/env bash
# Run against a disposable, network-isolated PostgreSQL container only.
# No DATABASE_URL or production credentials are read or accepted.
set -euo pipefail
script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
container="sumi-sync-test-$$"
image="postgres:17-alpine@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb"
docker_cmd=(env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock)
cleanup() { "${docker_cmd[@]}" rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${docker_cmd[@]}" image inspect "$image" >/dev/null 2>&1 || "${docker_cmd[@]}" pull "$image"
"${docker_cmd[@]}" run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
for attempt in $(seq 1 60); do
  if "${docker_cmd[@]}" exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 60 ]; then echo 'Disposable PostgreSQL did not start' >&2; exit 1; fi
  sleep 1
done
sql() { "${docker_cmd[@]}" exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
sql < "$script_root/supabase/tests/bootstrap.sql"
# Apply twice to catch non-repeatable DDL and preserve existing records/policies.
sql < "$script_root/supabase/migrations/202610250001_sync_foundation.sql"
sql < "$script_root/supabase/migrations/202610250001_sync_foundation.sql"
sql < "$script_root/supabase/tests/sync_permissions.sql"
# Keep tests with real concurrent DB sessions separate from the SQL assertions.
"${docker_cmd[@]}" exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script_root/supabase/tests/concurrency_setup.sql"
"${docker_cmd[@]}" exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script_root/supabase/tests/concurrency_a.sql" >/tmp/"$container"-a.log 2>&1 &
first_pid=$!
# The first transaction obtains its clock lock before sleeping. Probe readiness
# rather than relying on timing for the second caller.
for attempt in $(seq 1 50); do
  locked=$(sql -tAc "select count(*) from pg_stat_activity where application_name='sumi-concurrency-a' and wait_event='PgSleep'")
  if [ "$locked" -ge 1 ]; then break; fi
  if [ "$attempt" = 50 ]; then echo 'Concurrent test A never reached its lock' >&2; exit 1; fi
  sleep 0.1
done
"${docker_cmd[@]}" exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script_root/supabase/tests/concurrency_b.sql" >/tmp/"$container"-b.log 2>&1
wait "$first_pid"
cat /tmp/"$container"-a.log /tmp/"$container"-b.log
rm /tmp/"$container"-a.log /tmp/"$container"-b.log
sql < "$script_root/supabase/tests/concurrency_verify.sql"
sql < "$script_root/supabase/rollback/202610250001_disable_sync.sql"
sql < "$script_root/supabase/tests/rollback_verify.sql"
# A reapplication after real records exist must not clear history or receipts.
sql < "$script_root/supabase/migrations/202610250001_sync_foundation.sql"
sql -c "select test_support.ok('reapply retains existing accepted records',exists(select 1 from public.sumi_sync_records where id='legacy/subscription:one')); set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select test_support.ok('reapply restores own private image access',(select count(*)=1 from storage.objects)); select test_support.ok('reapply restores scoped RPC',jsonb_array_length(public.sumi_sync_pull(auth.uid())->'records')=1); reset role; select count(*) as passed_assertions from test_support.results;"
echo 'PASS: disposable PostgreSQL RLS/CAS/Storage/concurrency checks; no production database contacted'
