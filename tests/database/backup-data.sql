-- Synthetic data only, all ten legacy tables, two owner scopes for isolation QA.
DO $$
DECLARE o uuid; a uuid; b uuid; c uuid; ob uuid; d uuid; e uuid;
BEGIN
 FOR o IN SELECT id FROM auth.users ORDER BY id LOOP
  INSERT INTO public.mf_accounts(owner_id,name,kind,opening) VALUES(o,'Synthetic account','asset',100000) RETURNING id INTO a;
  INSERT INTO public.mf_beneficiaries(owner_id,name) VALUES(o,'Synthetic beneficiary') RETURNING id INTO b;
  INSERT INTO public.mf_categories(owner_id,name,kind) VALUES(o,'Synthetic category','expense') RETURNING id INTO c;
  INSERT INTO public.mf_obligations(owner_id,name,amount,account_id,first_due,frequency)
   VALUES(o,'Synthetic obligation',1000,a,'2026-01-01','monthly') RETURNING id INTO ob;
  INSERT INTO public.mf_due(owner_id,obligation_id,due_date,amount) VALUES(o,ob,'2026-01-01',1000) RETURNING id INTO d;
  INSERT INTO public.mf_events(owner_id,idempotency_key,event_date,event_type,from_account,amount,concept)
   VALUES(o,'qa-expense','2026-01-01','expense',a,1000,'Synthetic expense') RETURNING id INTO e;
  INSERT INTO public.mf_allocations(owner_id,event_id,amount,category_id,beneficiary_id) VALUES(o,e,1000,c,b);
  INSERT INTO public.mf_tariffs(owner_id,obligation_id,effective_from,amount) VALUES(o,ob,'2026-01-01',1000);
  INSERT INTO public.mf_notifications(owner_id,kind,reference_key,critical,risk_active) VALUES(o,'qa','fixture',true,true);
  INSERT INTO public.mf_audit(owner_id,action,entity,entity_id,details) VALUES(o,'qa','event',e,'{"synthetic":true}');
 END LOOP;
END $$;
INSERT INTO mf_next.accounts(id,owner_id,name,kind,opening_balance,currency)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','QA bank','bank',10000,'COP');
INSERT INTO mf_next.movements(owner_id,idempotency_key,kind,source_id,amount,concept,occurred_on)
 VALUES('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','expense','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,'Synthetic expense','2026-01-01');
CREATE ROLE qa_object_owner NOLOGIN;
ALTER TABLE public.mf_notifications OWNER TO qa_object_owner;
