# MisFinanzas — checkpoint técnico de integración

Misión MF-WORK-LIBERACION-20261126-D. Autoridad de aceptación: Chat 5. Estado: EN EJECUCIÓN; preparación de liberación. Actualización 26/11/2026, Colombia.

Rama: integration/misfinanzas-2.7-rc2. PR 2 en borrador. Base protegida de main: 762d66b409a7e4f9c6b2e0ae833eb05017d42ae5. Inicio D: 3991314b039c8534c68bff739e585a8162756458. Aplicación privada probada: d5fed5c20cdbd71d7c8f698175bb2b33d977eddc. Candidata firmada: 95d664a1a7435122591cca4478779229ebc60b49. Consultar HEAD vigente antes de escribir.

## Evidencias aprobadas

- Respaldo financiero completo y restauración de public/mf_next, ACL, propietarios, RLS, restricciones, índices, funciones, triggers y secuencias: Actions 45843015184. Restauración histórica public-only incluida.
- Migración administrativa limitada a activos legados: Actions 45844682956. Exportación, SHA-256, saldos, discriminaciones, catálogos, agenda, fuente inmutable, idempotencia y reversión protegida. Los productos de deuda sin contrato suficiente quedan bloqueados conservando sus filas.
- Identidades Auth y verificador de contraseña con vínculos financieros: Actions 45845399001. Tokens transitorios excluidos; recuperación con esquema compatible. Servicio GoTrue/SMTP/proveedores y MFA requieren validación específica.
- Privacidad local: Actions 45848896956, 46 casos de navegador aprobados, regresión Node/Python/candidata aprobada, 9 grupos de bóveda aprobados, 29 recursos web/Android idénticos. Android instalado y arrancado en emulador con almacenamiento cifrado comprobado.
- APK debug de esa prueba SHA-256: 53e482ea37afb329298285ba594933ee79f8baaddb5890b6c13e65a5e5d55641. Artifact 15134290122 del run 45848896956.
- APK con firma estable: Actions 45849972250. Clave recuperada desde almacenamiento privado cifrado con relectura verificada. Certificado SHA-256: 08da57bab4097f2ae71f4093a14d220e44c660f456a152ee01f8d224ab73d94b. Artifact 15132887184. Instalación específica de release todavía pendiente de automatizar.

## Estado técnico y controles

index.html contiene el acceso privado; app.html preserva los módulos y exige la bóveda abierta. AES-GCM y PBKDF2-SHA256, exclusión de pestañas simultáneas, bloqueo al ocultar/inactividad y persistencia cifrada atómica. La identidad remota se vincula a la bóveda. El servidor local de QA separa las pruebas sintéticas de componentes de los casos reales de acceso privado.

Ícono original conservado: SHA-256 2d3ea14e55f5aa5896212b63ec239ad9142d79349658744363818cb7b8f6a78b. Atribución: Creado por: Eduardo Neisa Cortés.

main, publicación actual y workflow activo de respaldo permanecen preservados. No se ejecutaron migraciones, restauraciones ni escrituras financieras sobre Supabase real. book_sync requiere aceptación y activación administrativa; esta misión no lo habilita remotamente.

## Próxima operación

Validar instalación y conservación de datos del APK release firmado; completar respaldo candidato consistente con ambos esquemas y Auth, mantener su workflow inactivo; completar persistencia de preferencias/notificaciones/períodos y notificaciones nativas; comprobar Auth con servicio efímero; actualizar matrices, manuales y paquete integral después de los controles afectados. Reutilizar evidencias válidas.

Los runs intermedios fallidos/cancelados y sus correcciones están conservados en el historial de Actions. Revisar logs, nunca inferir aprobación por existencia de un artifact. El checkpoint privado contiene el detalle operativo y las rutas locales; no se publica documentación privada aquí.


## Continuity update 2026-11-26 15:06 America/Bogota

Mission MF-WORK-LIBERACION-20261126-D. Candidate 2.7.0-rc2, NOT production-certified. Main and active backup remain protected; PR2 remains draft.

Verified consolidated QA: run45887326622 on5596f71344e5445ed2829403d9401dbdffbb8a05 passed all jobs: 58 browser cases, Node/Python regression, isolated PostgreSQL/PostgREST and restore, Android build/install/native notification, source/web package integrity. Preferences/agenda and notification read-state sync are included. Private vault uses encrypted local storage and requests remote logout before decrypted frame teardown. Remote financial writes remain gated.

Official isolated GoTrue+captured SMTP and consistent financial/Auth recovery passed run45886469377. Verified signup/email confirmation, password complexity/recovery, preserved identity/password, previous JWT epoch rejection, excluded refresh sessions and logout. This is synthetic QA; hosted provider/JWT/SMTP/MFA configuration is not certified. Full financial/historical recovery passed45843015184 and45885469786; reversible legacy asset migration passed45844682956. Complex legacy debt contracts remain blocked rather than inferred or discarded.

Stable signed release run45886635594 passed UI open/lock/reinstall and original icon parity; APK SHA256 dcc99913c61d7959b6abca66a474af3899d231948ffcacb61831d87cde57956a. Latest application logout update is in run45887574532 atddfdda349d6e2f1501b32c9d1cbbf9f8edcfaa4d. First attempt compiled/verified but emulator Pixel Launcher ANR blocked UI; one targeted rerun is pending. Do not mark that latest signed installation approved until observed. App files equal tested5596; subsequent commits are workflow/continuity only, verified by application diff.

Read-only hosted compatibility remains blocked on the verified public Supabase CA input. System trust failed TLS; attempted old public download URL returned404. No TLS downgrade. No hosted identity/financial rows queried. Require the dashboard CA certificate and re-run only the compatibility check. No installation/migration/activation in hosted production.

Next operation: inspect45887574532 latest attempt; preserve signed artifact and hashes after actual UI result. Recover latest source/web package and compare manifests with APK assets. Private checkpoint/manuals/matrices and preparatory restricted procedures are delivered separately. Supervisor must review critical hosted backup/migration/configuration and authorize production integration before merge/release. No automatic handoff or acceptance.
