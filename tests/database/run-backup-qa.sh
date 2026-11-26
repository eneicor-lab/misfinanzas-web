#!/usr/bin/env bash
set -euo pipefail
# Ephemeral QA only. Same PG17 container supplies server AND client, no host apt install.
: "${MF_QA_CONTAINER:?Set PostgreSQL service container ID}"
mkdir -p evidence
node tests/test-owner-binding.cjs
docker cp . "$MF_QA_CONTAINER:/project"
pg() { docker exec -i "$MF_QA_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"; }
node tests/make-book-fixture.cjs
pg -d postgres -f /project/tests/database/bootstrap.sql
pg -d postgres -f /project/tests/database/legacy-contract.sql
for f in 001_ledger_isolated.sql 004_module_state.sql 006_book_state.sql 006b_book_replay.sql; do
 pg -d postgres -f "/project/sql/$f"
done
pg -d postgres -f /project/evidence/test-owner-binding.sql
pg -d postgres -v book_fixture="$(cat evidence/book-book.json)" -v next_fixture="$(cat evidence/book-next.json)" -v fresh_fixture="$(cat evidence/book-fresh.json)" -f /project/tests/database/book_state.sql
pg -d postgres -f /project/sql/007_disable_book_sync.sql
pg -d postgres -f /project/tests/database/backup-data.sql
# Idempotence is part of the administrative grant contract.
pg -d postgres -f /project/sql/010_backup_candidate_read_only.sql
pg -d postgres -f /project/sql/010_backup_candidate_read_only.sql
pg -d postgres -f /project/tests/database/backup-permissions.sql
pg -q -d postgres -f /project/tests/database/backup-inventory.sql > evidence/source.inventory
pg -q -d postgres -f /project/tests/database/backup-schema-acl.sql > evidence/schema-acl.sql
docker exec -e PGPASSWORD=synthetic-backup-only "$MF_QA_CONTAINER" pg_dump -h localhost -U mf_backup -d postgres --schema=public --schema=mf_next --enable-row-security --format=custom > evidence/financial.dump
sha256sum evidence/financial.dump > evidence/plain.sha256
# Synthetic encryption key is generated for this run, never uploaded or reused for production.
openssl rand -hex 48 > /tmp/mf-qa-backup-key
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-qa-backup-key --symmetric --cipher-algo AES256 --output evidence/financial.dump.gpg evidence/financial.dump
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-qa-backup-key --output evidence/recovered.dump --decrypt evidence/financial.dump.gpg
cmp evidence/financial.dump evidence/recovered.dump
rm /tmp/mf-qa-backup-key
docker exec "$MF_QA_CONTAINER" createdb -U postgres mf_restore
# Authentication is a separately provisioned prerequisite, not included in financial dump.
pg -d mf_restore <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DROP SCHEMA public;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
SQL
docker exec -i "$MF_QA_CONTAINER" pg_restore -U postgres --exit-on-error -d mf_restore < evidence/recovered.dump
pg -d mf_restore < evidence/schema-acl.sql
pg -q -d mf_restore -f /project/tests/database/backup-inventory.sql > evidence/restored.inventory
if ! diff -u evidence/source.inventory evidence/restored.inventory > evidence/restore.diff; then
 cat evidence/restore.diff
 exit 1
fi
pg -d mf_restore -f /project/tests/database/backup-permissions.sql
pg -d mf_restore <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mf_accounts)<>1 THEN RAISE EXCEPTION 'Restored legacy RLS isolation failed'; END IF;
 IF (mf_next.book_sync_contract()->>'enabled')::boolean THEN RAISE EXCEPTION 'Restore enabled financial writes'; END IF;
END $$;
RESET ROLE;
SELECT mf_next.validate_book(payload) FROM mf_next.module_state WHERE module='book';
SQL
# Historical public-only backup must RESTORE, not merely list archive entries.
docker exec -e PGPASSWORD=synthetic-backup-only "$MF_QA_CONTAINER" pg_dump -h localhost -U mf_backup -d postgres --schema=public --enable-row-security --format=custom > evidence/historical-public.dump
docker exec -i "$MF_QA_CONTAINER" pg_restore --list < evidence/historical-public.dump > evidence/historical.toc
docker exec "$MF_QA_CONTAINER" createdb -U postgres mf_historical
pg -d mf_historical <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DROP SCHEMA public;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
SQL
docker exec -i "$MF_QA_CONTAINER" pg_restore -U postgres --exit-on-error -d mf_historical < evidence/historical-public.dump
grep 'ON SCHEMA public ' evidence/schema-acl.sql | pg -d mf_historical
pg -d mf_historical <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mf_accounts)<>2 OR (SELECT count(*) FROM public.mf_events)<>2 THEN RAISE EXCEPTION 'Historical restore incomplete'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace)<>60 THEN RAISE EXCEPTION 'Historical constraints missing'; END IF;
END $$;
SQL
sha256sum evidence/financial.dump.gpg evidence/source.inventory evidence/restored.inventory > evidence/SHA256SUMS.txt
printf '%s\n' 'PASS: full financial schemas, data, constraints, indexes, owners, ACL, RLS, functions, triggers and sequence state match after encrypted round trip.' 'PASS: restricted role cannot write, execute financial RPC or advance audit sequence; restored RLS isolates owner.' 'LIMITATION: Auth fixture only supplies synthetic identities; Auth service/session/provider recovery is NOT certified.' 'LIMITATION: legacy source metadata did not include all nullabilities, type lengths or six trigger definitions; fixture limitations remain explicit.' > evidence/backup-result.txt
cat evidence/backup-result.txt
rm evidence/financial.dump evidence/recovered.dump evidence/historical-public.dump
