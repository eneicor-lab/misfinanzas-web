-- Assert restrictive backup identity, without printing any stored row.
SET ROLE mf_backup;
DO $$ DECLARE rejected boolean; r record; BEGIN
 FOR r IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('public','mf_next') AND c.relkind IN('r','p') LOOP
  IF NOT has_table_privilege(current_user,r.oid,'SELECT') OR has_table_privilege(current_user,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
   RAISE EXCEPTION 'Invalid table privileges'; END IF;
 END LOOP;
 rejected:=false; BEGIN UPDATE mf_next.feature_flags SET enabled=true; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Backup can change flags'; END IF;
 rejected:=false; BEGIN PERFORM nextval('public.mf_audit_id_seq'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Backup can advance audit sequence'; END IF;
 rejected:=false; BEGIN PERFORM public.mf_post_basic('x',CURRENT_DATE,'income',NULL,gen_random_uuid(),1,'x'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Backup can execute financial RPC'; END IF;
 RAISE NOTICE 'PASS restricted backup privileges, writes/RPC/sequence advancement denied';
END $$;
RESET ROLE;
