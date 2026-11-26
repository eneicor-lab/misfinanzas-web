\set ON_ERROR_STOP on
SELECT set_config('mf.synthetic_book',:'book_fixture',false) AS ignored \gset
SELECT set_config('mf.synthetic_book_next',:'next_fixture',false) AS ignored \gset
SELECT set_config('mf.synthetic_book_fresh',:'fresh_fixture',false) AS ignored \gset
DO $$ BEGIN
 PERFORM mf_next.validate_debt_replay(current_setting('mf.synthetic_book')::jsonb);
 PERFORM mf_next.validate_book(current_setting('mf.synthetic_book')::jsonb);
 PERFORM mf_next.validate_book(current_setting('mf.synthetic_book_fresh')::jsonb);
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ DECLARE rejected boolean:=false;BEGIN
 BEGIN PERFORM mf_next.put_module_state('book',0,current_setting('mf.synthetic_book')::jsonb);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Book writes enabled before deployment acceptance';END IF;
 rejected:=false;BEGIN UPDATE mf_next.feature_flags SET enabled=true;EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'App user can enable privileged feature';END IF;
 RAISE NOTICE 'PASS default-disabled book writes and protected activation';
END $$;
RESET ROLE;
\set owner_uuid '11111111-1111-4111-8111-111111111111'
\ir ../../sql/009_bind_owner_before_enable.sql
\ir ../../sql/008_enable_book_sync_after_qa.sql
SET ROLE authenticated;
DO $$ DECLARE b jsonb:=current_setting('mf.synthetic_book')::jsonb;bad jsonb;rejected boolean;r int;BEGIN
 IF (mf_next.book_sync_contract()->>'protected')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Unsafe book contract';END IF;
 r:=mf_next.put_module_state('book',0,b);IF r<>1 THEN RAISE EXCEPTION 'Initial book revision failed';END IF;
 rejected:=false;BEGIN PERFORM mf_next.put_module_state('book',0,b);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'Book CAS failed';END IF;
 FOREACH bad IN ARRAY ARRAY[
  jsonb_set(b,'{bank,accounts,z,opening}','0.5'),
  jsonb_set(b,'{bank,events,0,type}','null'),
  jsonb_set(b,'{bank,events,1,amount}','301'),
  jsonb_set(b,'{debt,loans,0,principal}','9999'),
  jsonb_set(b,'{debt,loans,0,closed}','true'),
  jsonb_set(b,'{debt,entries,2,allocations,0,capital}','5001'),
  jsonb_set(b,'{debt,cards,0,purchases,0,active}','true'),
  jsonb_set(b,'{debt,cards,0,purchases,1,paid}','1')
 ] LOOP
  rejected:=false;BEGIN PERFORM mf_next.put_module_state('book',1,bad);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Malformed book accepted';END IF;
 END LOOP;
 rejected:=false;BEGIN PERFORM mf_next.put_module_state('book',1,current_setting('mf.synthetic_book_fresh')::jsonb);EXCEPTION WHEN invalid_parameter_value THEN rejected:=SQLERRM='Financial history is append-only';END;IF NOT rejected THEN RAISE EXCEPTION 'Financial history replacement allowed';END IF;
 r:=mf_next.put_module_state('book',1,current_setting('mf.synthetic_book_next')::jsonb);IF r<>2 THEN RAISE EXCEPTION 'Book append failed';END IF;
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 IF EXISTS(SELECT 1 FROM mf_next.get_module_state('book')) THEN RAISE EXCEPTION 'Book owner isolation failed';END IF;
 rejected:=false;BEGIN PERFORM mf_next.put_module_state('book',0,b);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'Another identity can create a financial book';END IF;
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 RAISE NOTICE 'PASS book persistence: verified singleton owner, CAS, readback, append-only history, invalid money/allocations/journals and cross-identity denial';
END $$;
RESET ROLE;
