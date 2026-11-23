#!/usr/bin/env bash
# Runs the permission tests against a local Postgres: ./supabase/test/run.sh "host=127.0.0.1 port=5432 user=postgres"
set -euo pipefail
CONN="${1:-host=127.0.0.1 port=5432 user=postgres}"
DIR="$(cd "$(dirname "$0")" && pwd)"
psql "$CONN dbname=postgres" -qc "drop database if exists qc_perm_test" -c "create database qc_perm_test" 2>/dev/null
psql "$CONN dbname=qc_perm_test" -q -v ON_ERROR_STOP=1 -f "$DIR/supabase_stub.sql" -f "$DIR/../schema.sql" 2>/dev/null
OUT=$(psql "$CONN dbname=qc_perm_test" -q -v ON_ERROR_STOP=1 -f "$DIR/permissions_test.sql" 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/.*NOTICE:  //')
echo "$OUT"
echo "---"; echo "$(grep -c PASS <<<"$OUT") passed, $(grep -cE 'FAIL|ERROR' <<<"$OUT" || true) failed"
! grep -qE 'FAIL|ERROR' <<<"$OUT"
