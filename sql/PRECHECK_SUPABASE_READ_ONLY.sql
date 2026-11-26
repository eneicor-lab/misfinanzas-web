-- MisFinanzas: comprobación administrativa opcional de solo lectura.
-- No modifica esquema, permisos, usuarios ni datos. No devuelve identidades,
-- correos, claves, tokens, importes, cuentas ni movimientos financieros.
-- Ejecutar el bloque completo en el SQL Editor del proyecto correcto.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';

SELECT 'contexto' AS control,current_timestamp AS checked_at,
 current_setting('server_version') AS postgres_version,
 to_regnamespace('mf_next') IS NOT NULL AS candidate_schema_exists,
 to_regnamespace('auth') IS NOT NULL AS auth_schema_exists;

SELECT 'tablas_y_rls' AS control,n.nspname AS schema_name,c.relname AS table_name,
 c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') AS anon_write,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS authenticated_direct_write
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND (n.nspname='mf_next' OR n.nspname='public' AND c.relname LIKE 'mf\_%' ESCAPE '\')
ORDER BY n.nspname,c.relname;

SELECT 'politicas_sin_expresiones_privadas' AS control,schemaname,tablename,
 policyname,permissive,roles,cmd,
 qual IS NOT NULL AS has_using,with_check IS NOT NULL AS has_check,
 md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) AS policy_expression_fingerprint
FROM pg_catalog.pg_policies
WHERE schemaname='mf_next' OR schemaname='public' AND tablename LIKE 'mf\_%' ESCAPE '\'
ORDER BY schemaname,tablename,policyname;

SELECT 'contratos_rpc' AS control,n.nspname AS schema_name,p.proname AS function_name,
 pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef AS security_definer,p.provolatile AS volatility,
 EXISTS(SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) x WHERE x LIKE 'search_path=%') AS has_fixed_search_path,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 p.prosrc ~* '(ERRCODE|sqlstate)[[:space:]=]*''40001''' AS contains_custom_serialization_code,
 md5(p.prosrc) AS implementation_fingerprint
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND (n.nspname='mf_next' OR n.nspname='public' AND p.proname LIKE 'mf\_%' ESCAPE '\')
ORDER BY n.nspname,p.proname,arguments;

SELECT 'triggers_sin_cuerpos' AS control,n.nspname AS schema_name,c.relname AS table_name,
 t.tgname AS trigger_name,t.tgenabled AS enabled
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND (n.nspname='mf_next' OR n.nspname='public' AND c.relname LIKE 'mf\_%' ESCAPE '\')
ORDER BY n.nspname,c.relname,t.tgname;

SELECT 'secuencias_sin_contadores_reales' AS control,schemaname,sequencename,
 start_value,min_value,max_value,increment_by,cycle
FROM pg_catalog.pg_sequences
WHERE schemaname='mf_next' OR schemaname='public' AND sequencename LIKE 'mf\_%' ESCAPE '\'
ORDER BY schemaname,sequencename;

SELECT 'auth_solo_agregados' AS control,count(*) AS identities,
 count(*) FILTER(WHERE email_confirmed_at IS NOT NULL) AS verified_identities
FROM auth.users;

SELECT 'realtime_solo_metadata' AS control,pubname,schemaname,tablename
FROM pg_catalog.pg_publication_tables
WHERE schemaname='mf_next' OR schemaname='public' AND tablename LIKE 'mf\_%' ESCAPE '\'
ORDER BY pubname,schemaname,tablename;

ROLLBACK;
-- El resultado no certifica SMTP, backups, retención, restore ni producción.
-- No ejecutar 008/009 ni habilitar escrituras basándose únicamente en este preflight.
