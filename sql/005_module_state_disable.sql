-- Containment rollback: preserve every saved payload and revision; disable module RPC writes.
BEGIN;
REVOKE EXECUTE ON FUNCTION mf_next.put_module_state(text,integer,jsonb) FROM authenticated;
COMMIT;
