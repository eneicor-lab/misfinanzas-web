-- ADMINISTRATIVE CANDIDATE: changes grants/policies; NOT a read-only diagnostic.
-- Makes the BACKUP ROLE read-only. Never apply to hosted production before approval.
-- Apply AFTER all approved schema migrations, then repeat full dump/restore QA.
-- No passwords, role creation, sync activation or financial data changes here.
BEGIN;
DO $$
DECLARE t record; s record; f record; role_oid oid;
BEGIN
 SELECT oid INTO role_oid FROM pg_roles WHERE rolname='mf_backup' AND rolcanlogin
  AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF role_oid IS NULL THEN RAISE EXCEPTION 'Restricted login backup role required'; END IF;
 IF pg_has_role('anon','mf_backup','MEMBER') OR pg_has_role('authenticated','mf_backup','MEMBER') THEN
  RAISE EXCEPTION 'Application roles must not assume backup role';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_oid) THEN
  RAISE EXCEPTION 'Backup role must not inherit other roles';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('public','mf_next') AND nspowner=role_oid) THEN
  RAISE EXCEPTION 'Backup role must not own project schemas';
 END IF;
 IF to_regclass('mf_next.module_state') IS NULL THEN RAISE EXCEPTION 'Full candidate schema missing'; END IF;
 GRANT USAGE ON SCHEMA public,mf_next TO mf_backup;
 FOR t IN SELECT c.oid,n.nspname,c.relname,c.relowner,c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname='mf_next' OR (n.nspname='public' AND left(c.relname,3)='mf_')) AND c.relkind IN ('r','p') LOOP
  IF t.relowner=role_oid THEN RAISE EXCEPTION 'Backup must not own tables'; END IF;
  EXECUTE format('GRANT SELECT ON TABLE %I.%I TO mf_backup',t.nspname,t.relname);
  IF t.relrowsecurity THEN
   EXECUTE format('DROP POLICY IF EXISTS mf_backup_read ON %I.%I',t.nspname,t.relname);
   EXECUTE format('CREATE POLICY mf_backup_read ON %I.%I FOR SELECT TO mf_backup USING(true)',t.nspname,t.relname);
  END IF;
  IF has_table_privilege('mf_backup',t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'Unsafe backup table privileges: %.%',t.nspname,t.relname;
  END IF;
 END LOOP;
 FOR s IN SELECT c.oid,n.nspname,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','mf_next') AND c.relkind='S' LOOP
  IF s.relowner=role_oid THEN RAISE EXCEPTION 'Backup must not own sequences'; END IF;
  EXECUTE format('GRANT SELECT ON SEQUENCE %I.%I TO mf_backup',s.nspname,s.relname);
  IF has_sequence_privilege('mf_backup',s.oid,'USAGE,UPDATE') THEN RAISE EXCEPTION 'Backup can advance sequences'; END IF;
 END LOOP;
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','mf_next') AND p.prosecdef LOOP
  IF has_function_privilege('mf_backup',f.oid,'EXECUTE') THEN
   RAISE EXCEPTION 'Backup can execute a security definer function: %',f.oid::regprocedure;
  END IF;
 END LOOP;
 IF has_schema_privilege('mf_backup','public','CREATE') OR has_schema_privilege('mf_backup','mf_next','CREATE') THEN
  RAISE EXCEPTION 'Backup can create project objects';
 END IF;
END $$;
COMMIT;
-- Dump BOTH schemas, enable row security and compare privileged source inventory.
-- Auth configuration/identities are a separate recovery dependency, not covered here.
