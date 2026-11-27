-- pg_dump assumes pre-existing public schema defaults, which a newly created schema lacks.
-- Explicit grants preserve those defaults and grant options during isolated recovery.
\pset tuples_only on
\pset format unaligned
SELECT format('GRANT %s ON SCHEMA %I TO %s%s;',a.privilege_type,n.nspname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 WHERE n.nspname IN ('public','mf_next') ORDER BY n.nspname,a.grantee,a.privilege_type;

