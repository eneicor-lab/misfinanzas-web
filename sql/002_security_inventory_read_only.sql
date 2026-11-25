-- Inventario de seguridad SOLO LECTURA para revisión manual en Supabase SQL Editor.
-- No modifica datos, esquemas, políticas ni permisos.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','mf_next') AND c.relkind IN ('r','p') ORDER BY 1,2;
SELECT n.nspname AS schema_name, p.proname AS function_name, p.prosecdef AS security_definer, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mf_next' ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='mf_next' ORDER BY tablename,policyname;
