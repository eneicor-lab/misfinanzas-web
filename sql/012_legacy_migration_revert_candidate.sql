-- Defines an ADMIN-only reversal. Never restores/deletes public financial records.
-- Receipt stays for audit; application writes must be disabled and imported modules unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION mf_next.revert_legacy_plan(p_source_sha256 text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r mf_next.legacy_imports%ROWTYPE;m record;current_row mf_next.module_state%ROWTYPE;
BEGIN
 SELECT * INTO STRICT r FROM mf_next.legacy_imports WHERE source_sha256=p_source_sha256 FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.owner_id::text,817263));
 IF EXISTS(SELECT 1 FROM mf_next.feature_flags WHERE feature='book_sync' AND enabled) THEN RAISE EXCEPTION 'Disable sync before reversal'; END IF;
 IF r.reverted THEN RETURN; END IF;
 FOR m IN SELECT key,value FROM jsonb_each(r.applied_modules) LOOP
  SELECT * INTO STRICT current_row FROM mf_next.module_state WHERE owner_id=r.owner_id AND module=m.key FOR UPDATE;
  IF current_row.revision<>(m.value->>'revision')::bigint OR encode(sha256(convert_to(mf_next.canonical_json(current_row.payload),'UTF8')),'hex')<>m.value->>'payload_sha256' THEN
   RAISE EXCEPTION 'Imported module changed; cannot discard subsequent work'; END IF;
 END LOOP;
 DELETE FROM mf_next.module_state WHERE owner_id=r.owner_id AND module IN(SELECT key FROM jsonb_each(r.applied_modules));
 UPDATE mf_next.legacy_imports SET reverted=true WHERE owner_id=r.owner_id AND source_sha256=r.source_sha256;
END $$;
REVOKE ALL ON FUNCTION mf_next.revert_legacy_plan(text) FROM PUBLIC,anon,authenticated,mf_backup;
COMMIT;
