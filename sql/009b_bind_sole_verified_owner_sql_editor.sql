-- Candidate alternative to 009 for Supabase SQL Editor; NEVER execute both blindly.
-- Administrative, transactional, no psql variables and no identifiers printed.
-- Requires exactly ONE Auth identity in total, verified email, existing candidate schema.
-- Does not enable book_sync or modify financial data. Supervisor approval required remotely.
BEGIN;
DO $$
DECLARE titular uuid; total bigint; verified bigint;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE email_confirmed_at IS NOT NULL) INTO total,verified FROM auth.users;
 IF total<>1 OR verified<>1 THEN RAISE EXCEPTION 'Expected exactly one registered, email-verified titular'; END IF;
 SELECT id INTO STRICT titular FROM auth.users WHERE email_confirmed_at IS NOT NULL;
 IF to_regclass('mf_next.app_owner') IS NULL THEN RAISE EXCEPTION 'Candidate schema missing'; END IF;
 IF EXISTS(SELECT 1 FROM mf_next.feature_flags WHERE feature='book_sync' AND enabled) THEN
  RAISE EXCEPTION 'Disable book synchronization before reviewing owner binding';
 END IF;
 IF EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id<>titular) THEN
  RAISE EXCEPTION 'Existing binding requires a separately reviewed migration';
 END IF;
 INSERT INTO mf_next.app_owner(slot,owner_id) VALUES(true,titular) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM mf_next.app_owner WHERE slot AND owner_id=titular) THEN
  RAISE EXCEPTION 'Owner binding verification failed';
 END IF;
END $$;
COMMIT;

