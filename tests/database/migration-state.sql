-- Synthetic database only. The actual plan is passed by psql variable, never printed.
SELECT set_config('mf.qa_plan',:'migration_plan',false) AS ignored \gset
DO $$ DECLARE p jsonb:=current_setting('mf.qa_plan')::jsonb;r jsonb;same jsonb;denied boolean;before jsonb;BEGIN
 before:=mf_next.export_legacy_snapshot((p->>'owner_id')::uuid);
 denied:=false;BEGIN PERFORM mf_next.apply_legacy_plan(jsonb_set(p,'{book,bank,accounts}','{}'),repeat('a',64));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Altered plan hash accepted';END IF;
 -- The snapshot check must notice even changes outside cash/events.
 INSERT INTO public.mf_notifications(owner_id,kind,reference_key) VALUES((p->>'owner_id')::uuid,'qa','stale-source');
 denied:=false;BEGIN PERFORM mf_next.apply_legacy_plan(p,repeat('a',64));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale source accepted';END IF;
 DELETE FROM public.mf_notifications WHERE kind='qa' AND reference_key='stale-source';
 r:=mf_next.apply_legacy_plan(p,repeat('a',64));same:=mf_next.apply_legacy_plan(p,repeat('a',64));
 IF r<>same OR (SELECT count(*) FROM mf_next.module_state)<>3 OR (SELECT count(*) FROM mf_next.legacy_imports)<>1 THEN RAISE EXCEPTION 'Import idempotence failed';END IF;
 IF mf_next.export_legacy_snapshot((p->>'owner_id')::uuid)<>before THEN RAISE EXCEPTION 'Migration changed legacy source';END IF;
 IF EXISTS(SELECT 1 FROM mf_next.feature_flags WHERE feature='book_sync' AND enabled) THEN RAISE EXCEPTION 'Migration enabled sync';END IF;
 UPDATE mf_next.module_state SET revision=2 WHERE module='book';
 denied:=false;BEGIN PERFORM mf_next.revert_legacy_plan(p->>'source_sha256');EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Reversal discarded subsequent changes';END IF;
 UPDATE mf_next.module_state SET revision=1 WHERE module='book';
 PERFORM mf_next.revert_legacy_plan(p->>'source_sha256');PERFORM mf_next.revert_legacy_plan(p->>'source_sha256');
 IF EXISTS(SELECT 1 FROM mf_next.module_state) OR NOT EXISTS(SELECT 1 FROM mf_next.legacy_imports WHERE reverted) THEN RAISE EXCEPTION 'Reversal incomplete';END IF;
 IF mf_next.export_legacy_snapshot((p->>'owner_id')::uuid)<>before THEN RAISE EXCEPTION 'Reversal changed legacy source';END IF;
 denied:=false;BEGIN PERFORM mf_next.apply_legacy_plan(p,repeat('a',64));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Reverted identity silently reused';END IF;
 RAISE NOTICE 'PASS actual migration: SHA validation, stale detection, replay, idempotence, ten-table preservation, disabled sync, protected reversal and retained receipt';
END $$;
SET ROLE authenticated;
DO $$ DECLARE denied boolean:=false;BEGIN
 BEGIN PERFORM mf_next.apply_legacy_plan('{}',repeat('a',64));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Application can invoke administrative migration';END IF;
END $$;
RESET ROLE;
