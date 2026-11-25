\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE a uuid; b uuid; mid uuid; replay uuid; rejected boolean; n int;
BEGIN
 a:=mf_next.create_account('Banco sintético','bank',10000);b:=mf_next.create_account('Efectivo sintético','cash',2000);
 mid:=mf_next.post_movement('33333333-3333-4333-8333-333333333333','income',null,a,1000,'Ingreso sintético','2026-01-01');
 replay:=mf_next.post_movement('33333333-3333-4333-8333-333333333333','income',null,a,1000,'Ingreso sintético','2026-01-01');
 IF mid<>replay THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
 rejected:=false;BEGIN PERFORM mf_next.post_movement('33333333-3333-4333-8333-333333333333','income',null,a,2000,'Ingreso sintético','2026-01-01');EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Idempotency key conflict';END;IF NOT rejected THEN RAISE EXCEPTION 'Conflicting request accepted'; END IF;
 PERFORM mf_next.post_movement(gen_random_uuid(),'expense',a,null,500,'Gasto sintético','2026-01-01');
 PERFORM mf_next.post_movement(gen_random_uuid(),'transfer',a,b,300,'Transferencia sintética','2026-01-01');
 IF (SELECT sum(balance) FROM mf_next.my_balances())<>12500 THEN RAISE EXCEPTION 'Accounting conservation failed'; END IF;
 IF (SELECT balance FROM mf_next.my_balances() WHERE account_id=a)<>10200 THEN RAISE EXCEPTION 'Source balance failed'; END IF;
 rejected:=false;BEGIN PERFORM mf_next.post_movement(gen_random_uuid(),'expense',a,null,999999,'Rechazado','2026-01-01');EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Insufficient funds';END;IF NOT rejected THEN RAISE EXCEPTION 'Overdraft accepted'; END IF;
 rejected:=false;BEGIN PERFORM mf_next.post_movement(gen_random_uuid(),'income',null,a,1,'Futuro',current_date+1);EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Invalid movement';END;IF NOT rejected THEN RAISE EXCEPTION 'Future date accepted'; END IF;
 rejected:=false;BEGIN INSERT INTO mf_next.accounts(name,kind) VALUES('Direct bypass','bank');EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'Direct table write allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 SELECT count(*) INTO n FROM mf_next.accounts;IF n<>0 THEN RAISE EXCEPTION 'Owner isolation failed'; END IF;
 rejected:=false;BEGIN PERFORM mf_next.post_movement(gen_random_uuid(),'income',null,a,1,'Cross owner','2026-01-01');EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Account not found or unauthorized';END;IF NOT rejected THEN RAISE EXCEPTION 'Cross owner posting allowed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',false);
 rejected:=false;BEGIN PERFORM mf_next.create_account('Anonymous','bank',0);EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Authentication required';END;IF NOT rejected THEN RAISE EXCEPTION 'Unauthenticated RPC accepted'; END IF;
 RAISE NOTICE 'PASS: balances, transfer conservation, replay, conflict, overdraft, future date, direct writes, RLS, ownership, missing auth';
END $$;
RESET ROLE;
