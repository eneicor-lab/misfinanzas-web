SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ DECLARE version integer; rejected boolean; body jsonb; BEGIN
 version:=mf_next.put_module_state('planning',0,'{"version":1,"budgets":[],"goals":[],"reservations":[]}'::jsonb);
 IF version<>1 THEN RAISE EXCEPTION 'Initial revision failed'; END IF;
 rejected:=false;BEGIN PERFORM mf_next.put_module_state('planning',0,'{}');EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'Concurrent state overwrite allowed'; END IF;
 version:=mf_next.put_module_state('planning',1,'{"version":1,"budgets":[],"goals":[],"reservations":[],"synthetic":true}'::jsonb);
 IF version<>2 THEN RAISE EXCEPTION 'Revision increment failed'; END IF;
 SELECT payload INTO body FROM mf_next.get_module_state('planning');IF body->>'synthetic'<>'true' THEN RAISE EXCEPTION 'Readback mismatch'; END IF;
 rejected:=false;BEGIN INSERT INTO mf_next.module_state(module,revision,payload) VALUES('preferences',1,'{}');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'Direct module write allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 IF EXISTS(SELECT 1 FROM mf_next.get_module_state('planning')) THEN RAISE EXCEPTION 'Module isolation failed'; END IF;
 PERFORM mf_next.put_module_state('planning',0,'{"syntheticOtherOwner":true}');
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 IF (SELECT revision FROM mf_next.get_module_state('planning'))<>2 THEN RAISE EXCEPTION 'Other owner replaced existing state'; END IF;
 RAISE NOTICE 'PASS module persistence: CAS, readback, RLS, direct-write restriction, independent identities';
END $$;
RESET ROLE;
