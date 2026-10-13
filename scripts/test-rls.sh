#!/usr/bin/env bash
# Rejoue la migration + les tests RLS sur un Postgres JETABLE (jamais sur votre base Supabase de production :
# le stub crée des rôles et un faux schéma `auth`).
# Usage : PGURL="postgresql://postgres@localhost:5432" ./scripts/test-rls.sh
set -euo pipefail
: "${PGURL:?Définissez PGURL vers un Postgres local jetable}"
cd "$(dirname "$0")/.."
psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -q -c "drop database if exists dollo_rls_test" -c "create database dollo_rls_test"
psql "$PGURL/dollo_rls_test" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_supabase_stub.sql
psql "$PGURL/dollo_rls_test" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_init.sql
psql "$PGURL/dollo_rls_test" -v ON_ERROR_STOP=1 -q -f supabase/tests/01_rls.sql 2>&1 | grep -E "PASS|FAIL|TESTS RLS" 
