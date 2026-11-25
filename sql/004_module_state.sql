-- Additive opt-in persistence for non-posting modules. No production execution authorized here.
-- Ledger writes remain exclusively in the transactional ledger RPCs; no background postings.
BEGIN;
CREATE TABLE IF NOT EXISTS mf_next.module_state (
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 module text NOT NULL CHECK(module IN ('planning','catalogs','reminders','preferences','notifications')),
 revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload) IN ('object','array') AND octet_length(payload::text)<=1048576),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,module)
);
ALTER TABLE mf_next.module_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_next.module_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mf_next.module_state FROM PUBLIC,anon,authenticated;
GRANT SELECT ON mf_next.module_state TO authenticated;
DROP POLICY IF EXISTS mf_module_owner_read ON mf_next.module_state;
CREATE POLICY mf_module_owner_read ON mf_next.module_state FOR SELECT TO authenticated USING(owner_id=(select auth.uid()));
CREATE OR REPLACE FUNCTION mf_next.put_module_state(p_module text,p_expected_revision integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid:=auth.uid(); v_revision integer;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_module IS NULL OR p_module NOT IN ('planning','catalogs','reminders','preferences','notifications') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_payload IS NULL OR jsonb_typeof(p_payload) NOT IN ('object','array') OR octet_length(p_payload::text)>1048576 THEN RAISE EXCEPTION 'Invalid module state'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text||':'||p_module,0));
 SELECT revision INTO v_revision FROM mf_next.module_state WHERE owner_id=v_owner AND module=p_module;
 IF coalesce(v_revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Module revision conflict' USING ERRCODE='40001'; END IF;
 IF coalesce(v_revision,0)=2147483647 THEN RAISE EXCEPTION 'Revision range exhausted'; END IF;
 v_revision:=coalesce(v_revision,0)+1;
 INSERT INTO mf_next.module_state(owner_id,module,revision,payload) VALUES(v_owner,p_module,v_revision,p_payload)
 ON CONFLICT(owner_id,module) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=now();
 RETURN v_revision;
END $$;
CREATE OR REPLACE FUNCTION mf_next.get_module_state(p_module text)
RETURNS TABLE(revision integer,payload jsonb,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT s.revision,s.payload,s.updated_at FROM mf_next.module_state s WHERE s.owner_id=auth.uid() AND s.module=p_module
$$;
REVOKE ALL ON FUNCTION mf_next.put_module_state(text,integer,jsonb),mf_next.get_module_state(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION mf_next.put_module_state(text,integer,jsonb),mf_next.get_module_state(text) TO authenticated;
COMMIT;
