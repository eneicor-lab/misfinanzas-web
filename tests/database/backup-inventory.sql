-- Deterministic inventory; QA values only. Never publish production output.
\pset tuples_only on
\pset format unaligned
SELECT 'TABLE|'||n.nspname||'.'||c.relname||'|'||pg_get_userbyid(c.relowner)||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity||'|'||coalesce(c.relacl::text,'')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','mf_next') AND c.relkind IN ('r','p','S') ORDER BY 1;
SELECT 'SCHEMA|'||nspname||'|'||pg_get_userbyid(nspowner)||'|'||coalesce(nspacl::text,'') FROM pg_namespace WHERE nspname IN ('public','mf_next') ORDER BY 1;
SELECT 'COLUMN|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'')||'|'||is_identity||'|'||coalesce(identity_generation,'')
 FROM information_schema.columns WHERE table_schema IN ('public','mf_next') ORDER BY 1;
SELECT 'CONSTRAINT|'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)||'|'||convalidated
 FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'mf_next'::regnamespace) ORDER BY 1;
SELECT 'POLICY|'||schemaname||'.'||tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
 FROM pg_policies WHERE schemaname IN ('public','mf_next') ORDER BY 1;
SELECT 'FUNCTION|'||p.oid::regprocedure::text||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mf_next' OR (n.nspname='public' AND left(p.proname,3)='mf_') ORDER BY 1;
SELECT 'TRIGGER|'||tgrelid::regclass::text||'|'||pg_get_triggerdef(oid)||'|'||tgenabled FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','mf_next')) ORDER BY 1;
SELECT 'INDEX|'||schemaname||'.'||tablename||'|'||indexname||'|'||indexdef FROM pg_indexes WHERE schemaname IN ('public','mf_next') ORDER BY 1;
SELECT format('SELECT %L || COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'') FROM %I.%I t;',
 'DATA|'||n.nspname||'.'||c.relname||'|',n.nspname,c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','mf_next') AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname \gexec
SELECT format('SELECT %L || last_value || ''|'' || is_called FROM %I.%I;', 'SEQUENCE|'||schemaname||'.'||sequencename||'|',schemaname,sequencename)
 FROM pg_sequences WHERE schemaname IN ('public','mf_next') ORDER BY schemaname,sequencename \gexec
