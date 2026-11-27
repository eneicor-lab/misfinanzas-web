-- Administrative deployment step before 008. Supply the reviewed owner_uuid through psql.
-- No app user can change this binding. No production execution performed by this mission.
BEGIN;
SELECT set_config('mf.reviewed_owner',:'owner_uuid',true);
DO $$ DECLARE selected uuid:=current_setting('mf.reviewed_owner')::uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=selected AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Owner email is not verified';END IF;
 IF EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id<>selected) THEN RAISE EXCEPTION 'Existing owner requires a separately reviewed migration';END IF;
 INSERT INTO mf_next.app_owner(slot,owner_id) VALUES(true,selected) ON CONFLICT DO NOTHING;
END $$;
COMMIT;
