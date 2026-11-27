-- Synthetic Auth shape exercises password hashes, transient defaults and generated columns.
-- This fixture does NOT claim to reproduce every hosted GoTrue migration.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL,encrypted_password text NOT NULL,email_confirmed_at timestamptz,
 created_at timestamptz DEFAULT now(),confirmation_token text NOT NULL DEFAULT '',recovery_token text NOT NULL DEFAULT '',
 raw_app_meta_data jsonb NOT NULL DEFAULT '{}',raw_user_meta_data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),provider_id text NOT NULL,provider text NOT NULL,
 identity_data jsonb NOT NULL,email text GENERATED ALWAYS AS(lower(identity_data->>'email')) STORED,UNIQUE(provider_id,provider));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
