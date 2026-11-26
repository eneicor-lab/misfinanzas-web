-- Run only after the controller accepts the exact deployed migration and isolated QA evidence.
-- This file is prepared, NOT executed on the user's Supabase project.
BEGIN;
DO $$ BEGIN
 IF NOT coalesce((SELECT enabled FROM mf_next.feature_flags WHERE feature='book_validator'),false) THEN RAISE EXCEPTION 'Complete book validator is not installed';END IF;
 IF NOT EXISTS(SELECT 1 FROM mf_next.app_owner o JOIN auth.users u ON u.id=o.owner_id WHERE u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'No verified application owner configured';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='mf_next.module_state'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR has_table_privilege('anon','mf_next.module_state','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','mf_next.module_state','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Unsafe module storage permissions';END IF;
END $$;
UPDATE mf_next.feature_flags SET enabled=true WHERE feature='book_sync';
COMMIT;
