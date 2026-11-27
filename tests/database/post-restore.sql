DO $$ DECLARE n int;v bigint;called boolean; BEGIN
 SELECT count(*) INTO n FROM auth.users;IF n<>2 THEN RAISE EXCEPTION 'Synthetic auth identities not restored';END IF;
 SELECT last_value,is_called INTO v,called FROM mf_next.qa_restore_sequence;IF v<>38 OR NOT called THEN RAISE EXCEPTION 'Sequence state not restored exactly';END IF;
 IF EXISTS(SELECT 1 FROM mf_next.qa_restore_trigger) THEN RAISE EXCEPTION 'Trigger fixture expected empty at restore';END IF;
 INSERT INTO mf_next.qa_restore_trigger DEFAULT VALUES;
 IF NOT (SELECT checked FROM mf_next.qa_restore_trigger LIMIT 1) THEN RAISE EXCEPTION 'Restored empty-table trigger did not fire';END IF;
 RAISE NOTICE 'PASS isolated restore: synthetic Auth identities, exact sequence state, empty-table trigger';
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM mf_next.module_state WHERE owner_id<>auth.uid()) OR EXISTS(SELECT 1 FROM mf_next.accounts WHERE owner_id<>auth.uid()) THEN RAISE EXCEPTION 'Restored RLS isolation failed';END IF;
 IF (SELECT revision FROM mf_next.get_module_state('planning'))<>2 THEN RAISE EXCEPTION 'Restored module version mismatch';END IF;
 RAISE NOTICE 'PASS restored RLS and module revision';
END $$;
RESET ROLE;
