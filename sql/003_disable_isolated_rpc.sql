-- Emergency containment only. NOT a deletion or schema/data rollback.
-- Apply only to mf_next if it was explicitly installed and must be disabled.
-- Keep all rows and the existing public.mf_* system intact.
BEGIN;
REVOKE EXECUTE ON FUNCTION mf_next.create_account(text,text,bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION mf_next.post_movement(uuid,text,uuid,uuid,bigint,text,date) FROM authenticated;
COMMIT;
-- Re-enabling is a separate reviewed deployment, never automatic.
