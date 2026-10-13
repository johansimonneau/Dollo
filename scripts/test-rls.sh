#!/usr/bin/env bash
# Rejoue TOUTES les migrations + les tests de sécurité (RLS, invitations) sur un Postgres JETABLE.
# Jamais sur votre base Supabase : le stub crée des rôles et un faux schéma `auth`.
# Usage : PGURL="postgresql://postgres@localhost:5432" ./scripts/test-rls.sh
set -euo pipefail
: "${PGURL:?Définissez PGURL vers un Postgres local jetable}"
cd "$(dirname "$0")/.."

run() { psql "$PGURL/dollo_rls_test" -v ON_ERROR_STOP=1 -q -f "$1"; }

psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -q -c "drop database if exists dollo_rls_test" -c "create database dollo_rls_test"
run supabase/tests/00_supabase_stub.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done
run supabase/tests/00_helpers.sql

out=$(mktemp)
status=0
for suite in supabase/tests/0[1-9]_*.sql; do
  echo "── $suite"
  run "$suite" >"$out" 2>&1 || status=$?
  grep -E "PASS|FAIL|TESTS .* SONT PASSÉS|ERROR" "$out" || true
done
rm -f "$out"
if [ "$status" -ne 0 ]; then echo "ÉCHEC : au moins une suite a échoué"; exit "$status"; fi
echo "OK : toutes les suites sont passées"
