#!/usr/bin/env bash
set -euo pipefail
: "${MF_QA_CONTAINER:?isolated container required}"
mkdir -p evidence /tmp/mf-auth /tmp/mf-postgrest
pg() { docker exec -i "$MF_QA_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
pg -d postgres <<'SQL'
CREATE SCHEMA auth;
ALTER ROLE postgres SET search_path=auth,public;
SQL
auth_bin=$(find /tmp/mf-auth -type f -name auth -print -quit)
test -n "$auth_bin"
chmod +x "$auth_bin"
"$auth_bin" > /tmp/mf-ui-auth.log 2>&1 &
auth_pid=$!
trap 'kill "${auth_pid:-}" "${rest_pid:-}" 2>/dev/null || true' EXIT
node tests/seed-ui-auth.cjs
pg -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
SQL
docker cp sql "$MF_QA_CONTAINER:/sql"
for f in 001_ledger_isolated.sql 004_module_state.sql 006_book_state.sql 006b_book_replay.sql 009b_bind_sole_verified_owner_sql_editor.sql 008_enable_book_sync_after_qa.sql; do
 pg -d postgres -f "/sql/$f"
done
# This test covers real Auth and financial persistence, not the private transition.
pg -d postgres <<'SQL'
CREATE FUNCTION mf_next.release_status() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('phase','unavailable','test_mode',false,'can_launch',false) $$;
REVOKE ALL ON FUNCTION mf_next.release_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mf_next.release_status() TO authenticated;
SQL
export PGRST_DB_URI=postgres://postgres:synthetic-auth-db-only@127.0.0.1:5432/postgres PGRST_DB_SCHEMAS=mf_next PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$GOTRUE_JWT_SECRET" PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1
/tmp/mf-postgrest/postgrest > /tmp/mf-ui-postgrest.log 2>&1 & rest_pid=$!
for i in $(seq 1 40); do if curl --fail --silent http://127.0.0.1:3001/ >/dev/null; then break; fi; sleep 1; done
npx playwright test --config=playwright.integrated.config.cjs --project=desktop-1366 --grep 'real isolated'
pg -d postgres <<'SQL' > evidence/integrated-real-db-result.txt
DO $$ DECLARE b jsonb; BEGIN
 SELECT payload INTO STRICT b FROM mf_next.module_state WHERE module='book';
 PERFORM mf_next.validate_book(b);
 IF jsonb_array_length(b->'bank'->'events')<>1 THEN RAISE EXCEPTION 'Expected exactly one isolated UI expense';END IF;
END $$;
SELECT 'PASS actual persisted book validated after desktop-to-mobile UI journey';
SQL
