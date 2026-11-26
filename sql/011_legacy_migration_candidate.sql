-- Candidate administrative migration, isolated QA first. No production execution authorized.
-- Additive only: leaves public.mf_* unchanged and keeps book_sync disabled.
-- 001/004/006/006b + owner binding required; rerun 010 AFTER this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS mf_next.legacy_imports(
 owner_id uuid NOT NULL REFERENCES auth.users(id),source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),
 plan_sha256 text NOT NULL CHECK(plan_sha256~'^[0-9a-f]{64}$'),backup_sha256 text NOT NULL CHECK(backup_sha256~'^[0-9a-f]{64}$'),
 source_snapshot jsonb NOT NULL,applied_modules jsonb NOT NULL,reverted boolean NOT NULL DEFAULT false,
 applied_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,source_sha256)
);
ALTER TABLE mf_next.legacy_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_next.legacy_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mf_next.legacy_imports FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION mf_next.canonical_json(v jsonb) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE s text;
BEGIN
 IF jsonb_typeof(v)='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||mf_next.canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO s FROM jsonb_each(v);
 ELSIF jsonb_typeof(v)='array' THEN
  SELECT '['||coalesce(string_agg(mf_next.canonical_json(value),',' ORDER BY ord),'')||']' INTO s FROM jsonb_array_elements(v) WITH ORDINALITY x(value,ord);
 ELSE s:=v::text;
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION mf_next.export_legacy_snapshot(p_owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t text; rows jsonb; tables jsonb:='{}';
BEGIN
 IF (SELECT count(*) FROM auth.users)<>1 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND email_confirmed_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id=p_owner) THEN RAISE EXCEPTION 'Single verified bound titular required'; END IF;
 FOREACH t IN ARRAY ARRAY['mf_accounts','mf_allocations','mf_audit','mf_beneficiaries','mf_categories','mf_due','mf_events','mf_notifications','mf_obligations','mf_tariffs'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id::text COLLATE "C"),''[]''::jsonb) FROM public.%I t WHERE owner_id=$1',t) INTO rows USING p_owner;
  tables:=tables||jsonb_build_object(t,rows);
 END LOOP;
 RETURN jsonb_build_object('version',1,'owner_id',p_owner,'tables',tables);
END $$;

CREATE OR REPLACE FUNCTION mf_next.apply_legacy_plan(p_plan jsonb,p_verified_backup_sha256 text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE titular uuid;snapshot jsonb;source_hash text;plan_hash text;existing mf_next.legacy_imports%ROWTYPE;
 book jsonb;r record;e jsonb;a jsonb;m text;payload jsonb;modules jsonb:='{}';n bigint;
BEGIN
 IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR p_plan->'scope' IS DISTINCT FROM '"legacy_assets_only"'::jsonb OR p_plan->'version' IS DISTINCT FROM '1'::jsonb OR p_plan->'ready' IS DISTINCT FROM 'true'::jsonb OR p_plan->'blockers' IS DISTINCT FROM '[]'::jsonb
  OR p_verified_backup_sha256 IS NULL OR p_verified_backup_sha256!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Reviewed ready plan and verified backup digest required'; END IF;
 titular:=(p_plan->>'owner_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(titular::text,817263));
 IF EXISTS(SELECT 1 FROM mf_next.feature_flags WHERE feature='book_sync' AND enabled) THEN RAISE EXCEPTION 'Synchronization must remain disabled during migration'; END IF;
 source_hash:=encode(sha256(convert_to(mf_next.canonical_json(p_plan->'source_snapshot'),'UTF8')),'hex');
 plan_hash:=encode(sha256(convert_to(mf_next.canonical_json(p_plan-'plan_sha256'),'UTF8')),'hex');
 IF source_hash IS DISTINCT FROM p_plan->>'source_sha256' OR plan_hash IS DISTINCT FROM p_plan->>'plan_sha256' THEN RAISE EXCEPTION 'Migration integrity mismatch'; END IF;
 SELECT * INTO existing FROM mf_next.legacy_imports WHERE owner_id=titular AND source_sha256=source_hash;
 IF FOUND THEN
  IF existing.reverted OR existing.plan_sha256<>plan_hash THEN RAISE EXCEPTION 'Import identity already used by another or reverted plan'; END IF;
  RETURN existing.applied_modules;
 END IF;
 snapshot:=mf_next.export_legacy_snapshot(titular);
 IF snapshot IS DISTINCT FROM p_plan->'source_snapshot' THEN RAISE EXCEPTION 'Source changed since dry run; export and reconcile again'; END IF;
 IF EXISTS(SELECT 1 FROM mf_next.module_state WHERE owner_id=titular) THEN RAISE EXCEPTION 'Existing candidate state requires a separate merge; no overwrite allowed'; END IF;
 book:=p_plan->'book';PERFORM mf_next.validate_book(book);
 IF EXISTS(SELECT 1 FROM public.mf_accounts WHERE owner_id=titular AND kind<>'asset') OR
  EXISTS(SELECT 1 FROM public.mf_events WHERE owner_id=titular AND (event_type NOT IN('income','expense','transfer') OR source='scheduled_estimate')) THEN
  RAISE EXCEPTION 'Legacy debt/automatic estimates require separately reconciled financial contracts'; END IF;
 IF coalesce(jsonb_array_length(book->'debt'->'loans'),-1)<>0 OR coalesce(jsonb_array_length(book->'debt'->'cards'),-1)<>0 OR coalesce(jsonb_array_length(book->'debt'->'entries'),-1)<>0
  OR (book->'bank' ? 'openingAdjustments' AND book->'bank'->'openingAdjustments'<>'[]'::jsonb) THEN RAISE EXCEPTION 'Unexpected debt or opening adjustments'; END IF;
 SELECT count(*) INTO n FROM jsonb_object_keys(book->'bank'->'accounts');
 IF n<>(SELECT count(*) FROM public.mf_accounts WHERE owner_id=titular) THEN RAISE EXCEPTION 'Account count mismatch'; END IF;
 FOR r IN SELECT * FROM public.mf_accounts WHERE owner_id=titular LOOP
  a:=book->'bank'->'accounts'->r.id::text;
  IF a IS NULL OR a->>'id'<>r.id::text OR a->>'name' IS DISTINCT FROM r.name OR a->>'kind'<>'asset' OR (a->>'opening')::numeric<>r.opening THEN RAISE EXCEPTION 'Account reconciliation mismatch'; END IF;
 END LOOP;
 IF jsonb_array_length(book->'bank'->'events')<>(SELECT count(*) FROM public.mf_events WHERE owner_id=titular) THEN RAISE EXCEPTION 'Event count mismatch'; END IF;
 FOR r IN SELECT * FROM public.mf_events WHERE owner_id=titular LOOP
  SELECT value INTO STRICT e FROM jsonb_array_elements(book->'bank'->'events') WHERE value->>'id'=r.id::text;
  IF e->>'key' IS DISTINCT FROM r.idempotency_key OR e->>'type' IS DISTINCT FROM r.event_type OR e->>'date' IS DISTINCT FROM r.event_date::text
   OR e->>'from' IS DISTINCT FROM r.from_account::text OR e->>'to' IS DISTINCT FROM r.to_account::text
   OR (e->>'amount')::numeric IS DISTINCT FROM r.amount OR e->>'concept' IS DISTINCT FROM r.concept THEN RAISE EXCEPTION 'Event reconciliation mismatch'; END IF;
 END LOOP;
 FOR r IN SELECT a.*,c.name category_name FROM public.mf_allocations a LEFT JOIN public.mf_categories c ON(c.id,c.owner_id)=(a.category_id,a.owner_id) WHERE a.owner_id=titular LOOP
  SELECT x INTO a FROM jsonb_array_elements(book->'bank'->'events') e, LATERAL jsonb_array_elements(coalesce(e->'allocations','[]')) x
   WHERE e->>'id'=r.event_id::text AND x->>'legacyAllocationId'=r.id::text;
  IF a IS NULL OR (a->>'amount')::numeric IS DISTINCT FROM r.amount OR a->>'category' IS DISTINCT FROM coalesce(r.category_name,'Sin categoría') THEN RAISE EXCEPTION 'Allocation reconciliation mismatch'; END IF;
 END LOOP;
 FOR m IN SELECT key FROM jsonb_each(p_plan->'modules') LOOP IF m NOT IN('catalogs','reminders') THEN RAISE EXCEPTION 'Unexpected import module'; END IF; END LOOP;
 FOR m IN SELECT unnest(ARRAY['book','catalogs','reminders']) LOOP
  payload:=CASE WHEN m='book' THEN book ELSE p_plan->'modules'->m END;
  IF payload IS NULL OR octet_length(payload::text)>4194304 THEN RAISE EXCEPTION 'Missing or oversized module'; END IF;
  INSERT INTO mf_next.module_state(owner_id,module,revision,payload) VALUES(titular,m,1,payload);
  modules:=modules||jsonb_build_object(m,jsonb_build_object('revision',1,'payload_sha256',encode(sha256(convert_to(mf_next.canonical_json(payload),'UTF8')),'hex')));
 END LOOP;
 INSERT INTO mf_next.legacy_imports(owner_id,source_sha256,plan_sha256,backup_sha256,source_snapshot,applied_modules)
  VALUES(titular,source_hash,plan_hash,p_verified_backup_sha256,snapshot,modules);
 RETURN modules;
END $$;
REVOKE ALL ON FUNCTION mf_next.canonical_json(jsonb),mf_next.export_legacy_snapshot(uuid),mf_next.apply_legacy_plan(jsonb,text) FROM PUBLIC,anon,authenticated,mf_backup;
COMMIT;
