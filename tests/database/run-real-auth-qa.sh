#!/usr/bin/env bash
set -euo pipefail
: "${MF_QA_CONTAINER:?isolated PostgreSQL service required}"
mkdir -p evidence /tmp/mf-auth
docker cp . "$MF_QA_CONTAINER:/project"
pg() { docker exec -i "$MF_QA_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
auth_bin=$(find /tmp/mf-auth -type f -name auth -print -quit)
test -n "$auth_bin"
chmod +x "$auth_bin"
pg -d postgres -c 'CREATE SCHEMA auth;'
pg -d postgres -c 'ALTER ROLE postgres SET search_path=auth,public;'
"$auth_bin" > /tmp/mf-auth-source.log 2>&1 & auth_pid=$!
cleanup() { kill "${auth_pid:-}" "${restore_pid:-}" 2>/dev/null || true; rm -f evidence/auth-private-session.json; }
trap cleanup EXIT
python tests/auth_service.py source
kill "$auth_pid"; wait "$auth_pid" || true
# Real Auth tables/migrations now exist. Every application table remains synthetic.
pg -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
SQL
pg -d postgres -f /project/tests/database/legacy-contract.sql
for f in 001_ledger_isolated.sql 004_module_state.sql 006_book_state.sql 006b_book_replay.sql 011_legacy_migration_candidate.sql 012_legacy_migration_revert_candidate.sql; do
 pg -d postgres -f "/project/sql/$f"
done
pg -d postgres -f /project/sql/009b_bind_sole_verified_owner_sql_editor.sql
pg -d postgres <<'SQL'
INSERT INTO public.mf_accounts(id,owner_id,name,kind,opening,currency)
 SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,'Synthetic recovery account','asset',123456,'COP' FROM auth.users;
SQL
pg -d postgres -f /project/sql/013_auth_backup_candidate.sql
pg -d postgres -f /project/sql/010_backup_candidate_read_only.sql
pg -d postgres -f /project/tests/database/backup-schema-acl.sql > /tmp/mf-auth-schema-acl.sql
pg -d postgres -f /project/sql/BACKUP_INVENTORY_READ_ONLY.sql > evidence/real-auth-source.inventory
PGCLIENT_CONTAINER="$MF_QA_CONTAINER" PGUSER=mf_backup PGPASSWORD=synthetic-backup-only python tools/backup_snapshot.py /tmp/mf-auth-bundle
cp /tmp/mf-auth-schema-acl.sql /tmp/mf-auth-bundle/schema-acl.sql
openssl rand -hex 48 > /tmp/mf-auth-qa-key
tar -C /tmp/mf-auth-bundle -czf /tmp/mf-auth-bundle.tar.gz .
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-auth-qa-key --symmetric --cipher-algo AES256 --output evidence/real-auth-bundle.gpg /tmp/mf-auth-bundle.tar.gz
mkdir /tmp/mf-auth-recovered
gpg --batch --yes --pinentry-mode loopback --passphrase-file /tmp/mf-auth-qa-key --decrypt evidence/real-auth-bundle.gpg | tar -xz -C /tmp/mf-auth-recovered
python - <<'PY'
import hashlib,json
from pathlib import Path
p=Path('/tmp/mf-auth-recovered');m=json.loads((p/'MANIFEST.json').read_text())
for name,info in m['files'].items():
 data=(p/name).read_bytes()
 assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256'],'Recovered bundle integrity failed'
PY
docker exec "$MF_QA_CONTAINER" createdb -U postgres mf_real_auth_restore
pg -d mf_real_auth_restore -c 'CREATE SCHEMA auth;'
# Boot the same verified service/migrations against an EMPTY isolated target, then stop.
DATABASE_URL=postgres://postgres:synthetic-auth-db-only@localhost:5432/mf_real_auth_restore \
 PORT=10000 GOTRUE_API_PORT=10000 API_EXTERNAL_URL=http://127.0.0.1:10000 \
 GOTRUE_JWT_SECRET=synthetic-new-recovery-epoch-not-production-1234567890 \
 "$auth_bin" > /tmp/mf-auth-restore.log 2>&1 & restore_pid=$!
python - <<'PY'
import time,urllib.request
for _ in range(60):
 try:
  if urllib.request.urlopen('http://127.0.0.1:10000/health',timeout=2).status==200:break
 except Exception:time.sleep(1)
else:raise RuntimeError('Restored isolated Auth schema initialization failed')
PY
kill "$restore_pid"; wait "$restore_pid" || true
pg -d mf_real_auth_restore -v auth_snapshot="$(cat /tmp/mf-auth-recovered/auth-source.json)" -f /project/tools/restore-auth-snapshot.sql
pg -d mf_real_auth_restore <<'SQL'
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
SQL
docker exec -i "$MF_QA_CONTAINER" pg_restore --list < /tmp/mf-auth-recovered/financial.dump > /tmp/mf-auth-restore.toc
sed -i '/ SCHEMA - public /s/^/;/' /tmp/mf-auth-restore.toc
docker cp /tmp/mf-auth-restore.toc "$MF_QA_CONTAINER:/tmp/mf-auth-restore.toc"
docker exec -i "$MF_QA_CONTAINER" pg_restore -U postgres --exit-on-error --use-list=/tmp/mf-auth-restore.toc -d mf_real_auth_restore < /tmp/mf-auth-recovered/financial.dump
pg -d mf_real_auth_restore < /tmp/mf-auth-recovered/schema-acl.sql
pg -d mf_real_auth_restore -f /project/sql/BACKUP_INVENTORY_READ_ONLY.sql > evidence/real-auth-restored.inventory
diff -u evidence/real-auth-source.inventory evidence/real-auth-restored.inventory > evidence/real-auth-restore.diff
pg -d mf_real_auth_restore <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.mf_accounts a JOIN auth.users u ON u.id=a.owner_id WHERE a.opening=123456)<>1 THEN RAISE EXCEPTION 'Financial balance/owner recovery failed'; END IF;
 IF EXISTS(SELECT 1 FROM auth.sessions) OR EXISTS(SELECT 1 FROM auth.refresh_tokens) THEN RAISE EXCEPTION 'Excluded sessions restored'; END IF;
 IF (SELECT enabled FROM mf_next.feature_flags WHERE feature='book_sync') THEN RAISE EXCEPTION 'Restore enabled writes'; END IF;
END $$;
SQL
DATABASE_URL=postgres://postgres:synthetic-auth-db-only@localhost:5432/mf_real_auth_restore \
 PORT=10000 GOTRUE_API_PORT=10000 API_EXTERNAL_URL=http://127.0.0.1:10000 \
 GOTRUE_JWT_SECRET=synthetic-new-recovery-epoch-not-production-1234567890 \
 "$auth_bin" > /tmp/mf-auth-restore.log 2>&1 & restore_pid=$!
python tests/auth_service.py restored http://127.0.0.1:10000
sha256sum evidence/real-auth-bundle.gpg > evidence/REAL_AUTH_SHA256SUMS.txt
rm /tmp/mf-auth-qa-key
printf '%s\n' 'PASS financial/Auth consistent read-only snapshot, encrypted readback, real schema restore and unchanged financial contracts.' >> evidence/real-auth-result.txt
