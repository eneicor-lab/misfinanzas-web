-- Read-only catalog preflight, no identity values or financial rows are queried.
BEGIN READ ONLY;
SELECT jsonb_build_object('postgres_version_num',current_setting('server_version_num'),'backup_role',current_user='mf_backup',
 'candidate_schema_present',to_regnamespace('mf_next') IS NOT NULL,
 'auth_columns',coalesce((SELECT jsonb_object_agg(meta.t,meta.cols) FROM(
  SELECT c.relname t,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated::text,'identity',a.attidentity::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) cols
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON(d.adrelid,d.adnum)=(a.attrelid,a.attnum)
  WHERE n.nspname='auth' AND c.relname IN('users','identities') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname
 )meta),'{}'::jsonb),
 'auth_constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',p.conname,'definition',pg_get_constraintdef(p.oid)) ORDER BY c.relname,p.conname)
  FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname IN('users','identities')),'[]'::jsonb),
 'auth_triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname IN('users','identities') AND NOT t.tgisinternal),'[]'::jsonb),
 'direct_auth_read',coalesce((SELECT jsonb_object_agg(c.relname,has_table_privilege(current_user,c.oid,'SELECT')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname IN('users','identities')),'{}'::jsonb));
ROLLBACK;
