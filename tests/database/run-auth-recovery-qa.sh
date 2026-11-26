#!/usr/bin/env bash
set -euo pipefail
: "${MF_QA_CONTAINER:?QA PostgreSQL container required}"
pg() { docker exec -i "$MF_QA_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"; }
# Isolated, richer Auth fixture; never touches hosted Supabase.
docker exec "$MF_QA_CONTAINER" createdb -U postgres mf_auth_source
pg -d mf_auth_source -f /project/tests/database/auth-recovery-fixture.sql
pg -d mf_auth_source <<'SQL'
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA mf_next;
CREATE TABLE mf_next.app_owner(slot boolean PRIMARY KEY,owner_id uuid REFERENCES auth.users(id));
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token)
 VALUES('11111111-1111-4111-8111-111111111111','synthetic@example.invalid',extensions.crypt('Synthetic+Password!123',extensions.gen_salt('bf')),now(),'synthetic-expired-confirmation','synthetic-expired-recovery');
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
 VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','email','{"email":"Synthetic@example.invalid","email_verified":true}');
INSERT INTO mf_next.app_owner VALUES(true,'11111111-1111-4111-8111-111111111111');
SQL
pg -d mf_auth_source -f /project/sql/013_auth_backup_candidate.sql
pg -qAt -d mf_auth_source <<'SQL' > evidence/auth-source.json
SET ROLE mf_backup;
SELECT mf_next.backup_auth_snapshot();
SQL
# One-titular financial source was already migrated/reverted without altering legacy data.
docker exec -e PGPASSWORD=synthetic-backup-only "$MF_QA_CONTAINER" pg_dump -h localhost -U mf_backup -d mf_migrate --schema=public --schema=mf_next --enable-row-security --format=custom > evidence/auth-financial.dump
(cd evidence && sha256sum auth-source.json auth-financial.dump schema-acl.sql > AUTH_BUNDLE_SHA256SUMS.txt && tar -czf auth-financial.tar.gz auth-source.json auth-financial.dump schema-acl.sql AUTH_BUNDLE_SHA256SUMS.txt)
openssl rand -hex 48 > /tmp/mf-qa-auth-key
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-qa-auth-key --symmetric --cipher-algo AES256 --output evidence/auth-financial.tar.gz.gpg evidence/auth-financial.tar.gz
mkdir evidence/auth-recovered
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-qa-auth-key --decrypt evidence/auth-financial.tar.gz.gpg | tar -xz -C evidence/auth-recovered
(cd evidence/auth-recovered && sha256sum -c AUTH_BUNDLE_SHA256SUMS.txt)
rm /tmp/mf-qa-auth-key
docker exec "$MF_QA_CONTAINER" createdb -U postgres mf_auth_restore
pg -d mf_auth_restore -f /project/tests/database/auth-recovery-fixture.sql
pg -d mf_auth_restore -v auth_snapshot="$(cat evidence/auth-recovered/auth-source.json)" -f /project/tools/restore-auth-snapshot.sql
pg -d mf_auth_restore <<'SQL'
DROP SCHEMA public;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
SQL
docker exec -i "$MF_QA_CONTAINER" pg_restore -U postgres --exit-on-error -d mf_auth_restore < evidence/auth-recovered/auth-financial.dump
pg -d mf_auth_restore < evidence/auth-recovered/schema-acl.sql
pg -d mf_auth_restore -f /project/sql/013_auth_backup_candidate.sql
pg -d mf_auth_restore <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE email_confirmed_at IS NOT NULL AND encrypted_password=extensions.crypt('Synthetic+Password!123',encrypted_password)) THEN RAISE EXCEPTION 'Recovered password verifier or confirmation lost'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE confirmation_token<>'' OR recovery_token<>'') THEN RAISE EXCEPTION 'Expired Auth tokens resurrected'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.identities WHERE email='synthetic@example.invalid') THEN RAISE EXCEPTION 'Generated identity column not recovered'; END IF;
 IF (SELECT count(*) FROM public.mf_events)<>1 OR (SELECT count(*) FROM public.mf_audit)<>1 THEN RAISE EXCEPTION 'Financial/Auth recovery not connected'; END IF;
 IF EXISTS(SELECT 1 FROM public.mf_accounts a LEFT JOIN auth.users u ON u.id=a.owner_id WHERE u.id IS NULL) THEN RAISE EXCEPTION 'Financial orphan after Auth recovery'; END IF;
 IF has_function_privilege('anon','mf_next.backup_auth_snapshot()','EXECUTE') OR has_function_privilege('authenticated','mf_next.backup_auth_snapshot()','EXECUTE') THEN RAISE EXCEPTION 'Auth export visible to application'; END IF;
END $$;
SQL
pg -qAt -d mf_auth_restore -c 'SELECT mf_next.backup_auth_snapshot();' > evidence/auth-restored.json
cmp evidence/auth-source.json evidence/auth-restored.json
sha256sum evidence/auth-financial.tar.gz.gpg > evidence/AUTH_ENCRYPTED_SHA256SUMS.txt
printf '%s\n' 'PASS Auth snapshot and identity/password verifier recovered with financial foreign keys, generated fields and confirmation state.' 'PASS transient Auth tokens excluded, application export denied, encrypted bundle integrity verified.' 'NOT CERTIFIED: GoTrue login/recovery service, SMTP/provider/JWT configuration and MFA enrollment recovery.' > evidence/auth-recovery-result.txt
cat evidence/auth-recovery-result.txt
rm evidence/auth-source.json evidence/auth-restored.json evidence/auth-financial.dump evidence/auth-financial.tar.gz
rm evidence/auth-recovered/auth-source.json evidence/auth-recovered/auth-financial.dump
