COPY (
 SELECT 'schema' AS kind,n.nspname AS object_name,coalesce(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable,grantor.rolname AS grantor
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 LEFT JOIN pg_roles r ON r.oid=a.grantee LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor WHERE n.nspname IN ('auth','mf_next')
 UNION ALL
 SELECT 'relation',n.nspname||'.'||c.relname,coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable,grantor.rolname
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
 LEFT JOIN pg_roles r ON r.oid=a.grantee LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor WHERE n.nspname IN ('auth','mf_next') AND c.relkind IN ('r','p','v','S')
 UNION ALL
 SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable,grantor.rolname
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 LEFT JOIN pg_roles r ON r.oid=a.grantee LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor WHERE n.nspname IN ('auth','mf_next')
 ORDER BY 1,2,3,4,5,6
) TO STDOUT WITH CSV;
