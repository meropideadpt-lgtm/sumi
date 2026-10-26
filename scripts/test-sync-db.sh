#!/usr/bin/env bash
# Run against a disposable, network-isolated PostgreSQL container only.
# No DATABASE_URL or production credentials are read or accepted.
set -euo pipefail
script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
container="sumi-sync-test-$$"
image="postgres:17-alpine@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb"
docker_cmd=(env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock)
artifacts="$script_root/tests/artifacts/sync-database"
mkdir -p "$artifacts"
exec > >(tee "$artifacts/runner.log") 2>&1
stage=container-start
cleanup() {
  local result=$?
  if (( result != 0 )); then
    echo "FAIL: stage=$stage exit=$result (SQL assertions are not retried)" >&2
    timeout 5 "${docker_cmd[@]}" inspect --format '{{json .State}}' "$container" > "$artifacts/container-state.json" 2>&1 || true
    timeout 5 "${docker_cmd[@]}" logs --timestamps "$container" > "$artifacts/postgres.log" 2>&1 || true
    cat "$artifacts/container-state.json" "$artifacts/postgres.log" >&2
  fi
  timeout 10 "${docker_cmd[@]}" rm -fv "$container" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
"${docker_cmd[@]}" image inspect "$image" >/dev/null 2>&1 || "${docker_cmd[@]}" pull "$image"
"${docker_cmd[@]}" run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
source "$script_root/scripts/sync-db-ready.sh"
stage=readiness
wait_sync_db "$container" 60
sql() { "${docker_cmd[@]}" exec -i "$container" psql -X -w -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
run_sql() { stage="$1"; sql < "$script_root/supabase/$1"; }
run_sql tests/bootstrap.sql
# Apply twice to catch non-repeatable DDL and preserve existing records/policies.
run_sql migrations/202610250001_sync_foundation.sql
run_sql migrations/202610250001_sync_foundation.sql
run_sql tests/sync_permissions.sql
# Keep tests with real concurrent DB sessions separate from the SQL assertions.
run_sql tests/concurrency_setup.sql
stage=concurrency
sql < "$script_root/supabase/tests/concurrency_a.sql" > "$artifacts/concurrency-a.log" 2>&1 &
first_pid=$!
# The first transaction obtains its clock lock before sleeping. Probe readiness
# rather than relying on timing for the second caller.
for attempt in $(seq 1 50); do
  locked=$(sql -tAc "select count(*) from pg_stat_activity where application_name='sumi-concurrency-a' and wait_event='PgSleep'")
  if [ "$locked" -ge 1 ]; then break; fi
  if [ "$attempt" = 50 ]; then echo 'Concurrent test A never reached its lock' >&2; exit 1; fi
  sleep 0.1
done
sql < "$script_root/supabase/tests/concurrency_b.sql" > "$artifacts/concurrency-b.log" 2>&1
wait "$first_pid"
cat "$artifacts/concurrency-a.log" "$artifacts/concurrency-b.log"
run_sql tests/concurrency_verify.sql
run_sql rollback/202610250001_disable_sync.sql
run_sql tests/rollback_verify.sql
# A reapplication after real records exist must not clear history or receipts.
run_sql migrations/202610250001_sync_foundation.sql
stage=reapply-verification
sql -c "select test_support.ok('reapply retains existing accepted records',exists(select 1 from public.sumi_sync_records where id='legacy/subscription:one')); set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select test_support.ok('reapply restores own private image access',(select count(*)=1 from storage.objects)); select test_support.ok('reapply restores scoped RPC',jsonb_array_length(public.sumi_sync_pull(auth.uid())->'records')=1); reset role; select count(*) as passed_assertions from test_support.results;"
echo 'PASS: disposable PostgreSQL RLS/CAS/Storage/concurrency checks; no production database contacted'
