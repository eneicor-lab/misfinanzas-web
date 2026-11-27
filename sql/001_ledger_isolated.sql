-- MisFinanzas: isolated opt-in ledger, no modification of existing mf_* tables.
-- REVIEW BEFORE APPLYING. This is NOT deployed, and not a production migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mf_next;
REVOKE ALL ON SCHEMA mf_next FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA mf_next TO authenticated;
CREATE TABLE IF NOT EXISTS mf_next.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100), kind text NOT NULL CHECK(kind IN ('cash','bank')),
 opening_balance bigint NOT NULL DEFAULT 0 CHECK(opening_balance>=0), currency text NOT NULL DEFAULT 'COP' CHECK(currency='COP'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id)
);
CREATE TABLE IF NOT EXISTS mf_next.movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('income','expense','transfer')),
 source_id uuid, destination_id uuid, amount bigint NOT NULL CHECK(amount>0),
 concept text NOT NULL CHECK(length(btrim(concept)) BETWEEN 1 AND 300),
 occurred_on date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key),
 FOREIGN KEY(source_id,owner_id) REFERENCES mf_next.accounts(id,owner_id),
 FOREIGN KEY(destination_id,owner_id) REFERENCES mf_next.accounts(id,owner_id),
 CHECK ((kind='income' AND source_id IS NULL AND destination_id IS NOT NULL)
     OR (kind='expense' AND source_id IS NOT NULL AND destination_id IS NULL)
     OR (kind='transfer' AND source_id IS NOT NULL AND destination_id IS NOT NULL AND source_id<>destination_id))
);
CREATE INDEX IF NOT EXISTS mf_next_movements_owner_date ON mf_next.movements(owner_id,occurred_on DESC);
ALTER TABLE mf_next.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_next.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE mf_next.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_next.movements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mf_next FROM PUBLIC, anon, authenticated;
GRANT SELECT ON mf_next.accounts,mf_next.movements TO authenticated;
DROP POLICY IF EXISTS mf_accounts_owner_read ON mf_next.accounts;
CREATE POLICY mf_accounts_owner_read ON mf_next.accounts FOR SELECT TO authenticated USING (owner_id=(select auth.uid()));
DROP POLICY IF EXISTS mf_movements_owner_read ON mf_next.movements;
CREATE POLICY mf_movements_owner_read ON mf_next.movements FOR SELECT TO authenticated USING (owner_id=(select auth.uid()));
-- Only transactional RPCs below can write. Neither browser nor mobile gets direct table writes.
CREATE OR REPLACE FUNCTION mf_next.create_account(p_name text,p_kind text,p_opening_balance bigint DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid:=auth.uid(); v_id uuid;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('cash','bank') OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR p_opening_balance IS NULL OR p_opening_balance<0 OR p_opening_balance>999999999999 THEN RAISE EXCEPTION 'Invalid account'; END IF;
 INSERT INTO mf_next.accounts(owner_id,name,kind,opening_balance) VALUES(v_owner,btrim(p_name),p_kind,p_opening_balance) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION mf_next.post_movement(p_key uuid,p_kind text,p_source uuid,p_destination uuid,p_amount bigint,p_concept text,p_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid:=auth.uid(); v_id uuid; v_existing mf_next.movements%ROWTYPE; v_count int; v_balance numeric;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_key IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>999999999999 OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'America/Bogota')::date OR p_concept IS NULL OR length(btrim(p_concept)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid movement'; END IF;
 IF p_kind IS NULL OR NOT ((p_kind='income' AND p_source IS NULL AND p_destination IS NOT NULL)
   OR (p_kind='expense' AND p_source IS NOT NULL AND p_destination IS NULL)
   OR (p_kind='transfer' AND p_source IS NOT NULL AND p_destination IS NOT NULL AND p_source<>p_destination)) THEN RAISE EXCEPTION 'Invalid movement routing'; END IF;
 -- Lock relevant accounts to serialize with concurrent postings and prevent inconsistent ownership checks.
 SELECT count(*) INTO v_count FROM (SELECT id FROM mf_next.accounts WHERE owner_id=v_owner AND id IN (p_source,p_destination) ORDER BY id FOR UPDATE) q;
 IF v_count <> (CASE WHEN p_kind='transfer' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'Account not found or unauthorized'; END IF;
 SELECT * INTO v_existing FROM mf_next.movements WHERE owner_id=v_owner AND idempotency_key=p_key;
 IF FOUND THEN
  IF (v_existing.kind,v_existing.source_id,v_existing.destination_id,v_existing.amount,v_existing.concept,v_existing.occurred_on)
     IS DISTINCT FROM (p_kind,p_source,p_destination,p_amount,btrim(p_concept),p_date) THEN RAISE EXCEPTION 'Idempotency key conflict'; END IF;
  RETURN v_existing.id;
 END IF;
 -- Account rows are already locked in deterministic order. Retry identity was checked first.
 IF p_source IS NOT NULL THEN
  SELECT a.opening_balance
    +COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=v_owner AND m.destination_id=a.id),0)
    -COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=v_owner AND m.source_id=a.id),0)
  INTO v_balance FROM mf_next.accounts a WHERE a.id=p_source AND a.owner_id=v_owner;
  IF v_balance IS NULL OR v_balance<p_amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
 END IF;
 IF p_destination IS NOT NULL THEN
  SELECT a.opening_balance
    +COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=v_owner AND m.destination_id=a.id),0)
    -COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=v_owner AND m.source_id=a.id),0)
  INTO v_balance FROM mf_next.accounts a WHERE a.id=p_destination AND a.owner_id=v_owner;
  IF v_balance IS NULL OR v_balance+p_amount>999999999999 THEN RAISE EXCEPTION 'Destination balance exceeds supported range'; END IF;
 END IF;
 INSERT INTO mf_next.movements(owner_id,idempotency_key,kind,source_id,destination_id,amount,concept,occurred_on)
 VALUES(v_owner,p_key,p_kind,p_source,p_destination,p_amount,btrim(p_concept),p_date)
 ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT * INTO v_existing FROM mf_next.movements WHERE owner_id=v_owner AND idempotency_key=p_key;
  IF (v_existing.kind,v_existing.source_id,v_existing.destination_id,v_existing.amount,v_existing.concept,v_existing.occurred_on)
    IS DISTINCT FROM (p_kind,p_source,p_destination,p_amount,btrim(p_concept),p_date) THEN RAISE EXCEPTION 'Idempotency key conflict'; END IF;
  RETURN v_existing.id;
 END IF;
 RETURN v_id;
END $$;
-- Derived balances, not independently mutable balances; transfers net to zero.
-- PostgreSQL bigint arithmetic raises on overflow rather than silently rounding currency.
-- SQL execution, RLS policies and concurrent transactions must be tested on an isolated DB before deployment.
CREATE OR REPLACE FUNCTION mf_next.my_balances()
RETURNS TABLE(account_id uuid,account_name text,account_kind text,balance bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT a.id,a.name,a.kind,a.opening_balance
 + COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=auth.uid() AND m.destination_id=a.id),0)
 - COALESCE((SELECT sum(m.amount) FROM mf_next.movements m WHERE m.owner_id=auth.uid() AND m.source_id=a.id),0)
 FROM mf_next.accounts a WHERE a.owner_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION mf_next.create_account(text,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION mf_next.post_movement(uuid,text,uuid,uuid,bigint,text,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION mf_next.my_balances() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mf_next.create_account(text,text,bigint),mf_next.post_movement(uuid,text,uuid,uuid,bigint,text,date),mf_next.my_balances() TO authenticated;
COMMIT;
