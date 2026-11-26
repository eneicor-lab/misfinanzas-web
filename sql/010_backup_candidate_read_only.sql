-- Candidate only. Do not run on hosted production until supervisor accepts backup QA.
-- Run after 001,004,006,006b. Does not enable synchronization.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mf_backup' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
   RAISE EXCEPTION 'Expected restricted backup role missing';
 END IF;
 IF pg_has_role('anon','mf_backup','MEMBER') OR pg_has_role('authenticated','mf_backup','MEMBER') THEN
   RAISE EXCEPTION 'Unsafe backup role membership';
 END IF;
END $$;
GRANT USAGE ON SCHEMA mf_next TO mf_backup;
GRANT SELECT ON mf_next.accounts,mf_next.movements,mf_next.module_state,mf_next.feature_flags,mf_next.app_owner TO mf_backup;
CREATE POLICY mf_backup_read ON mf_next.accounts FOR SELECT TO mf_backup USING (true);
CREATE POLICY mf_backup_read ON mf_next.movements FOR SELECT TO mf_backup USING (true);
CREATE POLICY mf_backup_read ON mf_next.module_state FOR SELECT TO mf_backup USING (true);
DO $$
DECLARE t regclass;
BEGIN
 FOREACH t IN ARRAY ARRAY['mf_next.accounts'::regclass,'mf_next.movements'::regclass,'mf_next.module_state'::regclass,'mf_next.feature_flags'::regclass,'mf_next.app_owner'::regclass] LOOP
  IF NOT has_table_privilege('mf_backup',t,'SELECT') OR has_table_privilege('mf_backup',t,'INSERT,UPDATE,DELETE,TRUNCATE') THEN
   RAISE EXCEPTION 'Unexpected backup privileges on %',t;
  END IF;
 END LOOP;
END $$;
COMMIT;
-- A dump must explicitly cover public AND mf_next and be tested with row security enabled.
-- This script alone does not certify dump completeness or Auth recovery.
