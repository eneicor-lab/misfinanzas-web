-- Independent replay of debt operations. Completes 006; deployment still defaults to disabled.
BEGIN;
CREATE OR REPLACE FUNCTION mf_next.validate_debt_replay(b jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE debt jsonb:=b->'debt';p jsonb;l jsonb;c jsonb;a jsonb;j jsonb;plan jsonb;actual_plan jsonb;
 plans jsonb:='{}';loan_balances jsonb:='{}';loan_terms jsonb:='{}';card_balances jsonb:='{}';
 id text;card_id text;purchase_id text;kind text;role text;target text;origin text;
 amount bigint;capital bigint;interest bigint;fees bigint;terms bigint;paid bigint;previous_paid bigint;
 before_amount numeric;after_amount numeric;delta numeric;allocated numeric;expected_delta numeric;card_balance numeric;
 count_all bigint;count_unique bigint;
BEGIN
 SELECT count(*),count(DISTINCT ids.id) INTO count_all,count_unique FROM (
  SELECT key AS id FROM jsonb_each(b#>'{bank,accounts}') UNION ALL
  SELECT value->>'id' FROM jsonb_array_elements(debt->'loans') UNION ALL
  SELECT value->>'id' FROM jsonb_array_elements(debt->'cards')
 ) ids;IF count_all<>count_unique THEN RAISE EXCEPTION 'Repeated product identity';END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(debt->'loans') LOOP
  id:=l->>'id';IF jsonb_typeof(l->'id')<>'string' OR length(id) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid loan identity';END IF;
  terms:=mf_next.book_int(l->'terms',1,600);paid:=mf_next.book_int(l->'openingPaidTerms',0,terms);
  loan_balances:=jsonb_set(loan_balances,ARRAY[id],to_jsonb(mf_next.book_int(l->'openingPrincipal')));loan_terms:=jsonb_set(loan_terms,ARRAY[id],to_jsonb(paid));
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(debt->'cards') LOOP
  id:=c->>'id';IF jsonb_typeof(c->'id')<>'string' OR length(id) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid card identity';END IF;
  card_balances:=jsonb_set(card_balances,ARRAY[id],'0'::jsonb);plans:=jsonb_set(plans,ARRAY[id],'{}'::jsonb);
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(debt->'entries') LOOP
  id:=p->>'id';kind:=p->>'kind';amount:=mf_next.book_int(p->'amount',1);card_id:=p->>'cardId';purchase_id:=p->>'purchaseId';delta:=0;
  IF kind='card_purchase' THEN
   IF card_id IS NULL OR NOT(card_balances?card_id) OR coalesce(length(purchase_id),0)=0 OR (plans->card_id)?purchase_id THEN RAISE EXCEPTION 'Invalid purchase identity';END IF;
   terms:=mf_next.book_int(p->'terms',1,600);paid:=mf_next.book_int(p->'paid',0,terms);delta:=amount-floor(amount::numeric*paid/terms);
   plan:=jsonb_build_object('amount',amount,'terms',terms,'paid',paid,'active',true);
   plans:=jsonb_set(plans,ARRAY[card_id],jsonb_set(plans->card_id,ARRAY[purchase_id],plan));
   card_balances:=jsonb_set(card_balances,ARRAY[card_id],to_jsonb((card_balances->>card_id)::numeric+delta));
  ELSIF kind='card_unify' THEN
   IF card_id IS NULL OR NOT(card_balances?card_id) OR coalesce(length(purchase_id),0)=0 OR (plans->card_id)?purchase_id OR jsonb_typeof(p->'originIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'originIds')=0 OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR coalesce(length(btrim(p->>'reason')),0)<15 THEN RAISE EXCEPTION 'Invalid negotiation';END IF;
   SELECT count(*),count(DISTINCT value) INTO count_all,count_unique FROM jsonb_array_elements_text(p->'originIds');IF count_all<>count_unique THEN RAISE EXCEPTION 'Repeated negotiation origin';END IF;
   before_amount:=0;FOR origin IN SELECT value FROM jsonb_array_elements_text(p->'originIds') LOOP
    plan:=plans#>ARRAY[card_id,origin];IF plan IS NULL OR plan->'active' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Inactive negotiation origin';END IF;
    before_amount:=before_amount+(plan->>'amount')::numeric-floor((plan->>'amount')::numeric*(plan->>'paid')::numeric/(plan->>'terms')::numeric);
    plans:=jsonb_set(plans,ARRAY[card_id,origin,'active'],'false'::jsonb);
   END LOOP;
   terms:=mf_next.book_int(p->'terms',1,600);delta:=amount-before_amount;
   IF before_amount<=0 OR mf_next.book_int(p->'before')<>before_amount OR mf_next.book_int(p->'difference',-999999999999)<>delta THEN RAISE EXCEPTION 'Negotiation amount mismatch';END IF;
   plan:=jsonb_build_object('amount',amount,'terms',terms,'paid',0,'active',true,'originIds',p->'originIds');plans:=jsonb_set(plans,ARRAY[card_id],jsonb_set(plans->card_id,ARRAY[purchase_id],plan));
   card_balances:=jsonb_set(card_balances,ARRAY[card_id],to_jsonb((card_balances->>card_id)::numeric+delta));
  ELSIF kind IN ('loan_payment','card_payment') THEN
   capital:=mf_next.book_int(p->'capital');interest:=mf_next.book_int(p->'interest');fees:=mf_next.book_int(p->'fees');IF capital+interest+fees<>amount OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Unconfirmed or inconsistent payment';END IF;
   IF kind='loan_payment' THEN
    target:=p->>'loanId';IF target IS NULL OR NOT(loan_balances?target) OR (loan_balances->>target)::numeric<=0 OR capital>(loan_balances->>target)::numeric THEN RAISE EXCEPTION 'Invalid loan payment';END IF;
    IF p->'settlement'='true'::jsonb AND (capital<>(loan_balances->>target)::numeric OR coalesce(length(btrim(p->>'reason')),0)<15) THEN RAISE EXCEPTION 'Invalid loan settlement';END IF;
    loan_balances:=jsonb_set(loan_balances,ARRAY[target],to_jsonb((loan_balances->>target)::numeric-capital));
    IF p?'paidTerms' THEN SELECT value INTO l FROM jsonb_array_elements(debt->'loans') WHERE value->>'id'=target;paid:=mf_next.book_int(p->'paidTerms',(loan_terms->>target)::bigint,mf_next.book_int(l->'terms',1,600));loan_terms:=jsonb_set(loan_terms,ARRAY[target],to_jsonb(paid));END IF;
   ELSE
    IF card_id IS NULL OR NOT(card_balances?card_id) OR jsonb_typeof(p->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'allocations')=0 THEN RAISE EXCEPTION 'Invalid card payment';END IF;
    SELECT count(*),count(DISTINCT value->>'purchaseId') INTO count_all,count_unique FROM jsonb_array_elements(p->'allocations');IF count_all<>count_unique THEN RAISE EXCEPTION 'Repeated purchase allocation';END IF;
    allocated:=0;FOR a IN SELECT value FROM jsonb_array_elements(p->'allocations') LOOP
     target:=a->>'purchaseId';plan:=plans#>ARRAY[card_id,target];IF target IS NULL OR plan IS NULL OR plan->'active' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Invalid payment purchase';END IF;
     previous_paid:=(plan->>'paid')::bigint;terms:=(plan->>'terms')::bigint;paid:=mf_next.book_int(a->'paidTerms',previous_paid,terms);
     before_amount:=(plan->>'amount')::numeric-floor((plan->>'amount')::numeric*previous_paid/terms);after_amount:=(plan->>'amount')::numeric-floor((plan->>'amount')::numeric*paid/terms);
     IF mf_next.book_int(a->'capital')<>before_amount-after_amount THEN RAISE EXCEPTION 'Installment allocation mismatch';END IF;allocated:=allocated+before_amount-after_amount;plans:=jsonb_set(plans,ARRAY[card_id,target,'paid'],to_jsonb(paid));
    END LOOP;
    IF allocated<>capital THEN RAISE EXCEPTION 'Card capital mismatch';END IF;
    card_balances:=jsonb_set(card_balances,ARRAY[card_id],to_jsonb((card_balances->>card_id)::numeric-capital));
   END IF;
  END IF;
  IF kind IN ('card_purchase','card_payment','card_unify') THEN
   SELECT value INTO c FROM jsonb_array_elements(debt->'cards') WHERE value->>'id'=card_id;card_balance:=(card_balances->>card_id)::numeric;
   IF card_balance<0 OR c->'limit'<>'null'::jsonb AND card_balance>mf_next.book_int(c->'limit') THEN RAISE EXCEPTION 'Card limit exceeded during replay';END IF;
  END IF;
  FOR j IN SELECT value FROM jsonb_array_elements(p->'journal') LOOP
   role:=j->>'type';target:=j->>'id';
   CASE role
    WHEN 'asset_cash' THEN IF kind NOT IN ('loan_payment','card_payment') OR target IS DISTINCT FROM p->>'accountId' THEN RAISE EXCEPTION 'Invalid cash journal';END IF;expected_delta:=-amount;
    WHEN 'liability_loan' THEN IF kind<>'loan_payment' OR target IS DISTINCT FROM p->>'loanId' THEN RAISE EXCEPTION 'Invalid loan journal';END IF;expected_delta:=-capital;
    WHEN 'liability_card' THEN IF kind NOT IN ('card_purchase','card_payment','card_unify') OR target IS DISTINCT FROM card_id THEN RAISE EXCEPTION 'Invalid card journal';END IF;expected_delta:=CASE WHEN kind='card_payment' THEN -capital ELSE delta END;
    WHEN 'expense_purchase' THEN IF kind<>'card_purchase' OR target IS DISTINCT FROM purchase_id THEN RAISE EXCEPTION 'Invalid purchase journal';END IF;expected_delta:=delta;
    WHEN 'expense_interest' THEN IF kind NOT IN ('loan_payment','card_payment') OR target IS DISTINCT FROM id THEN RAISE EXCEPTION 'Invalid interest journal';END IF;expected_delta:=interest;
    WHEN 'expense_fees' THEN IF kind NOT IN ('loan_payment','card_payment') OR target IS DISTINCT FROM id THEN RAISE EXCEPTION 'Invalid fees journal';END IF;expected_delta:=fees;
    WHEN 'adjustment_negotiation' THEN IF kind<>'card_unify' OR target IS DISTINCT FROM purchase_id THEN RAISE EXCEPTION 'Invalid negotiation journal';END IF;expected_delta:=delta;
    ELSE RAISE EXCEPTION 'Invalid journal role';
   END CASE;
   IF mf_next.book_int(j->'delta',-999999999999)<>expected_delta THEN RAISE EXCEPTION 'Journal delta mismatch';END IF;
  END LOOP;
 END LOOP;
 FOR l IN SELECT value FROM jsonb_array_elements(debt->'loans') LOOP id:=l->>'id';IF mf_next.book_int(l->'principal')<>(loan_balances->>id)::numeric OR mf_next.book_int(l->'paidTerms',0,600)<>(loan_terms->>id)::bigint THEN RAISE EXCEPTION 'Loan state does not match replay';END IF;END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(debt->'cards') LOOP
  card_id:=c->>'id';IF jsonb_array_length(c->'purchases')<>(SELECT count(*) FROM jsonb_each(plans->card_id)) THEN RAISE EXCEPTION 'Purchase history missing';END IF;
  SELECT count(*),count(DISTINCT value->>'id') INTO count_all,count_unique FROM jsonb_array_elements(c->'purchases');IF count_all<>count_unique THEN RAISE EXCEPTION 'Repeated purchase identity';END IF;
  FOR actual_plan IN SELECT value FROM jsonb_array_elements(c->'purchases') LOOP
   plan:=plans#>ARRAY[card_id,actual_plan->>'id'];IF plan IS NULL OR plan->'amount' IS DISTINCT FROM actual_plan->'amount' OR plan->'terms' IS DISTINCT FROM actual_plan->'terms' OR plan->'paid' IS DISTINCT FROM actual_plan->'paid' OR plan->'active' IS DISTINCT FROM actual_plan->'active' OR coalesce(plan->'originIds','null') IS DISTINCT FROM coalesce(actual_plan->'originIds','null') THEN RAISE EXCEPTION 'Purchase state does not match replay';END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION mf_next.validate_debt_replay(jsonb) FROM PUBLIC,anon,authenticated;
UPDATE mf_next.feature_flags SET enabled=true WHERE feature='book_validator';
COMMIT;
