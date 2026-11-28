# Estado vigente — Misión I.1 / retorno Chat 6

Versión preparada 2.7.1 (Android código30), pendiente de publicación. Este apartado sustituye los estados históricos inferiores. Reanudación 27/11/2026 Colombia; interrupción posterior del entorno y acceso al navegador. Sin cambios de aplicación ni repetición de pruebas durante esta reanudación.

Rama integration/misfinanzas-2.7.1, HEAD previo a este checkpoint 1b4f4f0fb855ae533e6ab568bbe1e60c9f561106. PR3 abierto, listo, sin fusionar: https://github.com/eneicor-lab/misfinanzas-web/pull/3 . Main continúa 409f7445a68e910b29123a019321ab1a0d0525e1.

Aplicación y APK probadas corresponden a b7c636d7bcb1ce55c57e401a27bb2327d8f20e00. Los cambios posteriores solo afectan pruebas y entrega. Reutilizar run46084541514 (interfaz, servicios reales aislados, transición recuperable, APK firmada/emulador) y run46085339536 (orientación/zoom/foco). No recompilar ni repetir estas pruebas sin cambios.

APK MisFinanzas-2.7.1-signed.apk SHA256 bd95512c42cbe8a35ddff2c482d879ef34369211ef2366ae9cbb7f78b6e5ee3d. Artifact15239030118: https://github.com/eneicor-lab/misfinanzas-web/actions/runs/46084541514/artifacts/15239030118 . Firma original preservada;38 recursos web/Android iguales.

Integración terminada y probada de navegación única, sesión central, libro compartido, privacidad local, sincronización, crédito, planificación, notificaciones y recuperación. Lanzar definitiva probado con Auth/PostgreSQL reales aislados e interrupciones; NO ejecutado sobre datos del titular. Biometría opcional no habilitada; no se afirma prueba financiera autenticada en Android físico.

Bloqueo inmediato: actualización del componente de transición desplegado aún sin confirmar. El navegador mostró inicio de sesión Supabase; solicitud segura de acceso terminó por timeout y el entorno/navegador quedaron indisponibles. No se confirmó autenticación ni despliegue. No modificar datos ni ejecutar transición real.

Primera acción: confirmar actualización autorizada del componente de transición; después recuperar HEAD, fusionar PR3 con SHA esperado y observar qa-published-web. El workflow verifica HTTPS y38 recursos, publica la APK ya aprobada sin recompilar y comprueba descarga. No declarar web2.7.1 ni release disponibles antes de observarlo. Ante cambio de HEAD, revisar solo el delta. Preservar main hasta resolver dependencia; no nuevas instalaciones ni servicios.

El checkpoint privado canónico conserva versión52; esta reanudación no pudo reemplazarlo por indisponibilidad del entorno. Este apéndice técnico público no contiene componentes ni documentación privados. Retorno manual Chat6; aceptación exclusivamente del titular.

---

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
