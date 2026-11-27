-- Optional ADMINISTRATIVE candidate. Extends backup confidentiality scope to password hashes.
-- Requires encrypted-only handling and supervisor approval BEFORE any hosted installation.
-- No password/token/identity values are embedded here. Does not enable application writes.
BEGIN;
CREATE OR REPLACE FUNCTION mf_next.backup_auth_snapshot() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE titular uuid;users_data jsonb;identities_data jsonb;columns_data jsonb;mfa_count bigint:=0;
 excluded text[]:=ARRAY['confirmation_token','recovery_token','email_change_token_new','email_change_token_current','phone_change_token','reauthentication_token'];
BEGIN
 IF (SELECT count(*) FROM auth.users)<>1 THEN RAISE EXCEPTION 'Auth backup requires exactly one registered titular'; END IF;
 SELECT id INTO STRICT titular FROM auth.users WHERE email_confirmed_at IS NOT NULL;
 IF NOT EXISTS(SELECT 1 FROM mf_next.app_owner WHERE owner_id=titular) THEN RAISE EXCEPTION 'Verified bound titular required'; END IF;
 IF to_regclass('auth.identities') IS NULL THEN RAISE EXCEPTION 'Auth identities schema unavailable'; END IF;
 IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM auth.mfa_factors WHERE user_id=$1' INTO mfa_count USING titular;
 END IF;
 IF mfa_count<>0 THEN RAISE EXCEPTION 'MFA recovery requires a separately reviewed protected enrollment procedure'; END IF;
 SELECT jsonb_agg(to_jsonb(u)-excluded ORDER BY id) INTO users_data FROM auth.users u WHERE id=titular;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) INTO identities_data FROM auth.identities i WHERE user_id=titular;
 SELECT jsonb_object_agg(t,cols) INTO columns_data FROM (
  SELECT c.relname t,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated::text,'identity',a.attidentity::text) ORDER BY a.attnum) cols
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='auth' AND c.relname IN('users','identities') AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname
 ) meta;
 RETURN jsonb_build_object('format',1,'owner_id',titular,'tables',jsonb_build_object('users',users_data,'identities',identities_data),'columns',columns_data,
  'excluded_token_columns',to_jsonb(excluded),'sessions_excluded',true,'provider_configuration_external',true,'mfa_enrollment_excluded',true);
END $$;
REVOKE ALL ON FUNCTION mf_next.backup_auth_snapshot() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mf_next TO mf_backup;
GRANT EXECUTE ON FUNCTION mf_next.backup_auth_snapshot() TO mf_backup;
COMMIT;
