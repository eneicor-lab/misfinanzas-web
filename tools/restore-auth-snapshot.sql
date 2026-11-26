-- ADMIN-only on an EMPTY ISOLATED recovery database after matching Auth migrations.
-- Never run over hosted production or an existing identity. Pass auth_snapshot via psql.
-- Raw snapshot contains password hashes: encrypted archive only, no public artifacts/logs.
BEGIN;
SELECT set_config('mf.restore_auth_snapshot',:'auth_snapshot',true) AS ignored \gset
DO $$
DECLARE snapshot jsonb:=current_setting('mf.restore_auth_snapshot')::jsonb;columns_data jsonb;row_data jsonb;t text;names text;owner uuid;
BEGIN
 IF snapshot->'format' IS DISTINCT FROM '1'::jsonb OR snapshot->'sessions_excluded' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Unsupported Auth snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM auth.identities) THEN RAISE EXCEPTION 'Auth restore target is not empty'; END IF;
 IF jsonb_array_length(snapshot->'tables'->'users')<>1 THEN RAISE EXCEPTION 'Single titular snapshot required'; END IF;
 owner:=(snapshot->>'owner_id')::uuid;
 SELECT jsonb_object_agg(meta.t,meta.cols) INTO columns_data FROM (
  SELECT c.relname t,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated::text,'identity',a.attidentity::text) ORDER BY a.attnum) cols
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='auth' AND c.relname IN('users','identities') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname
 ) meta;
 IF columns_data IS DISTINCT FROM snapshot->'columns' THEN RAISE EXCEPTION 'Auth schema version mismatch; migrate isolated target before recovery'; END IF;
 FOREACH t IN ARRAY ARRAY['users','identities'] LOOP
  FOR row_data IN SELECT value FROM jsonb_array_elements(snapshot->'tables'->t) LOOP
   IF (t='users' AND ((row_data->>'id')::uuid IS DISTINCT FROM owner OR row_data->>'email_confirmed_at' IS NULL))
    OR (t='identities' AND (row_data->>'user_id')::uuid IS DISTINCT FROM owner) THEN RAISE EXCEPTION 'Auth snapshot owner mismatch'; END IF;
   IF t='users' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(snapshot->'excluded_token_columns') x WHERE row_data ? x) THEN RAISE EXCEPTION 'Transient Auth token in snapshot'; END IF;
   SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) INTO names
    FROM pg_attribute a WHERE a.attrelid=format('auth.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped
     AND a.attgenerated='' AND a.attidentity<>'a' AND row_data ? a.attname;
   IF names IS NULL THEN RAISE EXCEPTION 'Empty Auth record'; END IF;
   EXECUTE format('INSERT INTO auth.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::auth.%I,$1)',t,names,names,t) USING row_data;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
