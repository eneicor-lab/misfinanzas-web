// Generates a PostgreSQL harness around the ACTUAL SQL Editor body, not a mirrored implementation.
const fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../sql/009b_bind_sole_verified_owner_sql_editor.sql'),'utf8');
const body=source.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];if(!body||body.includes('$mf_source$'))throw Error('Binding source not recognized');
const out=`BEGIN;
CREATE FUNCTION pg_temp.bind_actual() RETURNS void LANGUAGE plpgsql AS $runner$ BEGIN EXECUTE $mf_source$${body}$mf_source$; END $runner$;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.bind_actual(); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Accepted multiple Auth identities'; END IF;
END $$;
DELETE FROM auth.users WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.bind_actual();
SELECT pg_temp.bind_actual();
DO $$ BEGIN IF(SELECT count(*) FROM mf_next.app_owner)<>1 THEN RAISE EXCEPTION 'Idempotent binding failed';END IF; END $$;
UPDATE mf_next.feature_flags SET enabled=true WHERE feature='book_sync';
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.bind_actual(); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Accepted enabled synchronization'; END IF;
END $$;
UPDATE mf_next.feature_flags SET enabled=false WHERE feature='book_sync';
UPDATE auth.users SET email_confirmed_at=NULL;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.bind_actual(); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Accepted unverified identity'; END IF;
END $$;
DELETE FROM mf_next.app_owner;
DELETE FROM auth.users;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.bind_actual(); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Accepted absent identity'; END IF;
 RAISE NOTICE 'PASS SQL Editor actual binding: multiple/absent/unverified/enabled rejected, single verified idempotent accepted';
END $$;
ROLLBACK;
`;
fs.mkdirSync(path.join(__dirname,'../evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../evidence/test-owner-binding.sql'),out);

