#!/usr/bin/env bash
# Sourced by the disposable DB runner; docker_cmd is pinned to the local daemon.
wait_sync_db() {
  local container="$1" budget="${2:-60}" deadline remaining probe state result
  [[ "$budget" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid readiness timeout' >&2; return 1; }
  deadline=$((SECONDS + budget))
  while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    probe=$((remaining < 3 ? remaining : 3))
    state=$(timeout "$probe" "${docker_cmd[@]}" inspect --format '{{.State.Status}}' "$container") || return 1
    if [[ "$state" != running ]]; then
      echo "PostgreSQL container stopped before readiness: $state" >&2; return 1
    fi
    remaining=$((deadline - SECONDS))
    (( remaining > 0 )) || break
    probe=$((remaining < 3 ? remaining : 3))
    # Official postgres images start a socket-only temporary server during
    # initdb, then stop it. Probe TCP and execute SQL against the FINAL server.
    # Only this readiness query is retried, never migration/RLS assertions.
    if result=$(timeout "$probe" "${docker_cmd[@]}" exec -e PGCONNECT_TIMEOUT=2 "$container" \
      psql -X -w -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc 'SELECT 1'); then
      if [[ "$result" == 1 ]]; then echo 'PostgreSQL TCP query ready'; return 0; fi
      echo 'Unexpected readiness query result' >&2; return 1
    fi
    (( SECONDS < deadline )) && sleep 1
  done
  echo "PostgreSQL TCP readiness timed out after ${budget}s" >&2
  return 1
}
