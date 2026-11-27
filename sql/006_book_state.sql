-- Application revision conflicts use PT409; never signal a retryable database serialization failure.
-- Additive extension of the isolated candidate schema. Never applied to production by this mission.
BEGIN;
CREATE TABLE IF NOT EXISTS mf_next.feature_flags(feature text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS mf_next.app_owner(slot boolean PRIMARY KEY DEFAULT true CHECK(slot),owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id));
REVOKE ALL ON mf_next.feature_flags FROM PUBLIC,anon,authenticated;
REVOKE ALL ON mf_next.app_owner FROM PUBLIC,anon,authenticated;
INSERT INTO mf_next.feature_flags(feature,enabled) VALUES('book_sync',false) ON CONFLICT DO NOTHING;
INSERT INTO mf_next.feature_flags(feature,enabled) VALUES('book_validator',false) ON CONFLICT DO NOTHING;
ALTER TABLE mf_next.module_state DROP CONSTRAINT IF EXISTS module_state_module_check;
ALTER TABLE mf_next.module_state ADD CONSTRAINT module_state_module_check CHECK(module IN ('book','planning','catalogs','reminders','preferences','notifications'));
ALTER TABLE mf_next.module_state DROP CONSTRAINT IF EXISTS module_state_payload_check;
ALTER TABLE mf_next.module_state ADD CONSTRAINT module_state_payload_check CHECK(jsonb_typeof(payload) IN ('object','array') AND octet_length(payload::text)<=4194304);

CREATE OR REPLACE FUNCTION mf_next.book_int(v jsonb,lo bigint DEFAULT 0,hi bigint DEFAULT 999999999999)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n numeric;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Invalid integer' USING ERRCODE='22023';END IF;
 n:=(v#>>'{}')::numeric;
 IF n<>trunc(n) OR n<lo OR n>hi THEN RAISE EXCEPTION 'Integer outside range' USING ERRCODE='22023';END IF;
 RETURN n::bigint;
END $$;

CREATE OR REPLACE FUNCTION mf_next.validate_debt_replay(b jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Complete book validator is not installed' USING ERRCODE='22023';END $$;

CREATE OR REPLACE FUNCTION mf_next.validate_book(b jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record;e jsonb;p jsonb;j jsonb;l jsonb;c jsonb;purchase jsonb;adjustment jsonb;
 balances jsonb:='{}';bank jsonb;debt jsonb;id text;k text;source text;dest text;kind text;d date;
 amount bigint;n bigint;capital bigint;interest bigint;fees bigint;terms bigint;paid bigint;
 cash numeric;liability numeric;cost numeric;actual numeric;expected numeric;row_count int;
BEGIN
 IF b IS NULL OR jsonb_typeof(b)<>'object' OR mf_next.book_int(b->'version',1,1)<>1 THEN RAISE EXCEPTION 'Invalid book';END IF;
 bank:=b->'bank';debt:=b->'debt';
 IF jsonb_typeof(bank->'accounts') IS DISTINCT FROM 'object' OR jsonb_typeof(debt) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid accounts';END IF;
 FOREACH k IN ARRAY ARRAY['events','keys','obligations','notifications'] LOOP IF jsonb_typeof(bank->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid bank array';END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['accounts','loans','cards','entries','keys'] LOOP IF jsonb_typeof(debt->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid debt array';END IF;END LOOP;
 FOR a IN SELECT key,value FROM jsonb_each(bank->'accounts') LOOP
  IF length(a.key) NOT BETWEEN 1 AND 180 OR a.value->>'id' IS DISTINCT FROM a.key OR a.value->>'kind' IS DISTINCT FROM 'asset' THEN RAISE EXCEPTION 'Invalid cash account';END IF;
  balances:=jsonb_set(balances,ARRAY[a.key],to_jsonb(mf_next.book_int(a.value->'opening')));
 END LOOP;
 FOR adjustment IN SELECT value FROM jsonb_array_elements(coalesce(bank->'openingAdjustments','[]')) LOOP
  id:=adjustment->>'accountId';IF id IS NULL OR NOT(balances?id) THEN RAISE EXCEPTION 'Invalid opening adjustment';END IF;
  n:=(balances->>id)::bigint+mf_next.book_int(adjustment->'delta',-999999999999);
  IF n<0 OR n>999999999999 THEN RAISE EXCEPTION 'Opening adjustment outside range';END IF;
  balances:=jsonb_set(balances,ARRAY[id],to_jsonb(n));
 END LOOP;
 SELECT count(*),count(DISTINCT value->>'id') INTO row_count,n FROM jsonb_array_elements(bank->'events');IF row_count<>n THEN RAISE EXCEPTION 'Repeated movement identity';END IF;
 SELECT count(DISTINCT value->>'key') INTO n FROM jsonb_array_elements(bank->'events');IF row_count<>n THEN RAISE EXCEPTION 'Repeated movement event key';END IF;
 SELECT count(*),count(DISTINCT value) INTO row_count,n FROM jsonb_array_elements_text(bank->'keys');IF row_count<>n OR row_count<>jsonb_array_length(bank->'events') THEN RAISE EXCEPTION 'Repeated movement key';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(bank->'events') LOOP
  id:=e->>'id';k:=e->>'key';kind:=e->>'type';source:=e->>'from';dest:=e->>'to';amount:=mf_next.book_int(e->'amount',1);
  IF id IS NULL OR length(id) NOT BETWEEN 1 AND 180 OR k IS NULL OR length(k) NOT BETWEEN 1 AND 180 OR NOT(bank->'keys'?k) OR kind IS NULL OR kind NOT IN ('income','expense','transfer') THEN RAISE EXCEPTION 'Invalid movement';END IF;
  IF coalesce(e->>'date','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid date';END IF;d:=(e->>'date')::date;
  IF to_char(d,'YYYY-MM-DD')<>e->>'date' OR d>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Invalid financial date';END IF;
  IF e?'allocations' THEN
   IF jsonb_typeof(e->'allocations')<>'array' OR jsonb_array_length(e->'allocations')=0 OR kind='transfer' THEN RAISE EXCEPTION 'Invalid allocation';END IF;
   actual:=0;FOR p IN SELECT value FROM jsonb_array_elements(e->'allocations') LOOP IF coalesce(length(btrim(p->>'category')),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid allocation category';END IF;actual:=actual+mf_next.book_int(p->'amount',1);END LOOP;
   IF actual<>amount THEN RAISE EXCEPTION 'Allocation mismatch';END IF;
  END IF;
  IF kind<>'income' THEN IF source IS NULL OR NOT(balances?source) OR (balances->>source)::bigint<amount THEN RAISE EXCEPTION 'Insufficient cash';END IF;balances:=jsonb_set(balances,ARRAY[source],to_jsonb((balances->>source)::bigint-amount));END IF;
  IF kind<>'expense' THEN IF dest IS NULL OR NOT(balances?dest) OR kind='transfer' AND source=dest THEN RAISE EXCEPTION 'Invalid destination';END IF;n:=(balances->>dest)::bigint+amount;IF n>999999999999 THEN RAISE EXCEPTION 'Cash range exceeded';END IF;balances:=jsonb_set(balances,ARRAY[dest],to_jsonb(n));END IF;
 END LOOP;
 SELECT count(*),count(DISTINCT value->>'id') INTO row_count,n FROM jsonb_array_elements(debt->'accounts');IF row_count<>n OR row_count<>(SELECT count(*) FROM jsonb_each(balances)) THEN RAISE EXCEPTION 'Cash projection mismatch';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(debt->'accounts') LOOP id:=p->>'id';IF id IS NULL OR NOT(balances?id) OR mf_next.book_int(p->'balance')<>(balances->>id)::bigint THEN RAISE EXCEPTION 'Cash projection mismatch';END IF;END LOOP;
 SELECT count(*),count(DISTINCT value->>'id') INTO row_count,n FROM jsonb_array_elements(debt->'entries');IF row_count<>n THEN RAISE EXCEPTION 'Repeated debt identity';END IF;
 SELECT count(DISTINCT value->>'key') INTO n FROM jsonb_array_elements(debt->'entries');IF row_count<>n THEN RAISE EXCEPTION 'Repeated debt event key';END IF;
 SELECT count(*),count(DISTINCT value) INTO row_count,n FROM jsonb_array_elements_text(debt->'keys');IF row_count<>n OR row_count<>jsonb_array_length(debt->'entries') THEN RAISE EXCEPTION 'Repeated debt key';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(debt->'entries') LOOP
  id:=p->>'id';k:=p->>'key';kind:=p->>'kind';amount:=mf_next.book_int(p->'amount',1);
  IF id IS NULL OR length(id) NOT BETWEEN 1 AND 180 OR k IS NULL OR NOT(debt->'keys'?k) OR kind IS NULL OR kind NOT IN ('loan_payment','card_payment','card_purchase','card_unify','schedule') OR jsonb_typeof(p->'journal') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid debt event';END IF;
  IF coalesce(p->>'date','')!~'^\d{4}-\d{2}-\d{2}$' OR (p->>'date')::date>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Invalid debt date';END IF;
  cash:=0;liability:=0;cost:=0;
  FOR j IN SELECT value FROM jsonb_array_elements(p->'journal') LOOP
   n:=mf_next.book_int(j->'delta',-999999999999);IF coalesce(length(j->>'id'),0)=0 THEN RAISE EXCEPTION 'Missing journal identity';END IF;
   CASE j->>'type' WHEN 'asset_cash' THEN cash:=cash+n;WHEN 'liability_loan' THEN liability:=liability+n;WHEN 'liability_card' THEN liability:=liability+n;WHEN 'expense_purchase' THEN cost:=cost+n;WHEN 'expense_interest' THEN cost:=cost+n;WHEN 'expense_fees' THEN cost:=cost+n;WHEN 'adjustment_negotiation' THEN cost:=cost+n;ELSE RAISE EXCEPTION 'Invalid journal type';END CASE;
  END LOOP;
  IF cash-liability+cost<>0 THEN RAISE EXCEPTION 'Unbalanced journal';END IF;
  IF kind IN ('loan_payment','card_payment') THEN
   capital:=mf_next.book_int(p->'capital');interest:=mf_next.book_int(p->'interest');fees:=mf_next.book_int(p->'fees');
   IF capital+interest+fees<>amount OR cash<>-amount OR liability<>-capital OR cost<>interest+fees OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Payment mismatch';END IF;
   SELECT count(*) INTO n FROM jsonb_array_elements(bank->'events') x WHERE x.value->>'financialClass'='debt_payment' AND x.value->>'debtEntryId'=id AND x.value->>'from'=p->>'accountId' AND x.value->'amount'=p->'amount' AND x.value->'date'=p->'date';IF n<>1 THEN RAISE EXCEPTION 'Missing unique cash debit';END IF;
  ELSIF cash<>0 THEN RAISE EXCEPTION 'Unexpected cash change';END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(bank->'events') WHERE value->>'financialClass'='debt_payment' LOOP IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(debt->'entries') p WHERE p.value->>'id'=e->>'debtEntryId' AND p.value->>'kind' IN ('loan_payment','card_payment')) THEN RAISE EXCEPTION 'Orphan cash debit';END IF;END LOOP;
 FOR l IN SELECT value FROM jsonb_array_elements(debt->'loans') LOOP
  id:=l->>'id';amount:=mf_next.book_int(l->'openingPrincipal');capital:=mf_next.book_int(l->'principal');n:=mf_next.book_int(l->'original',1);terms:=mf_next.book_int(l->'terms',1,600);paid:=mf_next.book_int(l->'paidTerms',0,terms);
  IF id IS NULL OR amount>n OR capital>n OR jsonb_typeof(l->'closed')<>'boolean' OR (l->>'closed')::boolean IS DISTINCT FROM (capital=0) THEN RAISE EXCEPTION 'Invalid loan';END IF;
  SELECT coalesce(sum(mf_next.book_int(j.value->'delta',-999999999999)),0) INTO actual FROM jsonb_array_elements(debt->'entries') p CROSS JOIN LATERAL jsonb_array_elements(p.value->'journal') j WHERE j.value->>'type'='liability_loan' AND j.value->>'id'=id;
  IF amount+actual<>capital THEN RAISE EXCEPTION 'Loan capital mismatch';END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(debt->'cards') LOOP
  id:=c->>'id';IF id IS NULL OR jsonb_typeof(c->'purchases') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid card';END IF;actual:=0;
  FOR purchase IN SELECT value FROM jsonb_array_elements(c->'purchases') LOOP
   amount:=mf_next.book_int(purchase->'amount',1);terms:=mf_next.book_int(purchase->'terms',1,600);paid:=mf_next.book_int(purchase->'paid',0,terms);
   IF jsonb_typeof(purchase->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid purchase status';END IF;
   IF (purchase->>'active')::boolean THEN actual:=actual+amount-floor(amount::numeric*paid/terms);END IF;
  END LOOP;
  IF c->'limit'<>'null'::jsonb AND actual>mf_next.book_int(c->'limit') THEN RAISE EXCEPTION 'Card limit exceeded';END IF;
  SELECT coalesce(sum(mf_next.book_int(j.value->'delta',-999999999999)),0) INTO expected FROM jsonb_array_elements(debt->'entries') p CROSS JOIN LATERAL jsonb_array_elements(p.value->'journal') j WHERE j.value->>'type'='liability_card' AND j.value->>'id'=id;
  IF actual<>expected THEN RAISE EXCEPTION 'Card balance mismatch';END IF;
 END LOOP;
 PERFORM mf_next.validate_debt_replay(b);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Book integrity validation failed' USING ERRCODE='22023';
END $$;

CREATE OR REPLACE FUNCTION mf_next.put_module_state(p_module text,p_expected_revision integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid:=auth.uid();v_revision integer;v_old jsonb;item record;previous jsonb;next_item jsonb;section text;history_key text;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM mf_next.app_owner) AND NOT EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id=v_owner) THEN RAISE EXCEPTION 'Identity is not enabled for this application' USING ERRCODE='42501';END IF;
 IF p_module IS NULL OR p_module NOT IN ('book','planning','catalogs','reminders','preferences','notifications') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_payload IS NULL OR jsonb_typeof(p_payload) NOT IN ('object','array') OR octet_length(p_payload::text)>(CASE WHEN p_module='book' THEN 4194304 ELSE 1048576 END) THEN RAISE EXCEPTION 'Invalid module state' USING ERRCODE='22023';END IF;
 IF p_module='book' AND NOT coalesce((SELECT enabled FROM mf_next.feature_flags WHERE feature='book_sync'),false) THEN RAISE EXCEPTION 'Book synchronization is disabled' USING ERRCODE='42501';END IF;
 IF p_module='book' AND NOT coalesce((SELECT enabled FROM mf_next.feature_flags WHERE feature='book_validator'),false) THEN RAISE EXCEPTION 'Complete book validator is required' USING ERRCODE='42501';END IF;
 IF p_module='book' AND (NOT EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id=v_owner) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_owner AND email_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'A verified application owner is required' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||p_module,0));
 SELECT revision,payload INTO v_revision,v_old FROM mf_next.module_state WHERE owner_id=v_owner AND module=p_module;
 IF coalesce(v_revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Module revision conflict' USING ERRCODE='PT409';END IF;
 IF p_module='book' THEN
  PERFORM mf_next.validate_book(p_payload);
  IF v_old IS NOT NULL THEN
   FOREACH section IN ARRAY ARRAY['bank','debt'] LOOP
    history_key:=CASE WHEN section='bank' THEN 'events' ELSE 'entries' END;
    FOR item IN SELECT value,ordinality FROM jsonb_array_elements(v_old#>ARRAY[section,history_key]) WITH ORDINALITY LOOP
     next_item:=(p_payload#>ARRAY[section,history_key])->((item.ordinality-1)::int);
     IF next_item IS DISTINCT FROM item.value THEN RAISE EXCEPTION 'Financial history is append-only' USING ERRCODE='22023';END IF;
    END LOOP;
   END LOOP;
   FOR item IN SELECT key,value FROM jsonb_each(v_old#>'{bank,accounts}') LOOP IF p_payload#>ARRAY['bank','accounts',item.key,'opening'] IS DISTINCT FROM item.value->'opening' THEN RAISE EXCEPTION 'Opening balance is immutable' USING ERRCODE='22023';END IF;END LOOP;
   FOR previous IN SELECT value FROM jsonb_array_elements(v_old#>'{debt,loans}') LOOP
    SELECT value INTO next_item FROM jsonb_array_elements(p_payload#>'{debt,loans}') WHERE value->>'id'=previous->>'id';
    IF next_item IS NULL OR next_item->'original' IS DISTINCT FROM previous->'original' OR next_item->'openingPrincipal' IS DISTINCT FROM previous->'openingPrincipal' OR next_item->'terms' IS DISTINCT FROM previous->'terms' OR next_item->'openingPaidTerms' IS DISTINCT FROM previous->'openingPaidTerms' THEN RAISE EXCEPTION 'Loan basis is immutable' USING ERRCODE='22023';END IF;
   END LOOP;
   FOR previous IN SELECT value FROM jsonb_array_elements(v_old#>'{debt,cards}') LOOP
    SELECT value INTO next_item FROM jsonb_array_elements(p_payload#>'{debt,cards}') WHERE value->>'id'=previous->>'id';
    IF next_item IS NULL OR next_item->'limit' IS DISTINCT FROM previous->'limit' THEN RAISE EXCEPTION 'Card basis is immutable' USING ERRCODE='22023';END IF;
   END LOOP;
   IF coalesce(v_old#>'{bank,openingAdjustments}','[]') IS DISTINCT FROM coalesce(p_payload#>'{bank,openingAdjustments}','[]') THEN RAISE EXCEPTION 'Opening adjustments require a reviewed migration' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
 IF coalesce(v_revision,0)=2147483647 THEN RAISE EXCEPTION 'Revision range exhausted';END IF;v_revision:=coalesce(v_revision,0)+1;
 INSERT INTO mf_next.module_state(owner_id,module,revision,payload) VALUES(v_owner,p_module,v_revision,p_payload)
 ON CONFLICT(owner_id,module) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=now();RETURN v_revision;
END $$;

CREATE OR REPLACE FUNCTION mf_next.book_sync_contract()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE protected boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 SELECT relrowsecurity AND relforcerowsecurity INTO protected FROM pg_catalog.pg_class WHERE oid='mf_next.module_state'::regclass;
 protected:=coalesce(protected,false) AND NOT has_table_privilege('anon','mf_next.module_state','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','mf_next.module_state','INSERT,UPDATE,DELETE');
 RETURN jsonb_build_object('version',1,'protected',protected,'enabled',coalesce((SELECT enabled FROM mf_next.feature_flags WHERE feature='book_sync'),false),'authorized',EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION mf_next.book_int(jsonb,bigint,bigint),mf_next.validate_book(jsonb),mf_next.validate_debt_replay(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION mf_next.put_module_state(text,integer,jsonb),mf_next.book_sync_contract() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mf_next.put_module_state(text,integer,jsonb),mf_next.book_sync_contract() TO authenticated;
COMMIT;
