# MisFinanzas — alcance monousuario aprobado (2026-11-23)

## Titular y experiencia
La aplicación es exclusivamente personal. Un solo titular consulta, registra y valida sus finanzas, con experiencia de banca personal. No ofrecer alta de otros usuarios, invitaciones, roles, permisos delegados, administradores de usuarios ni colaboración.

## Seguridad no negociable
Conservar autenticación robusta, recuperación de acceso verificada, cierre de sesión, controles de sesión y políticas de propiedad de datos (RLS). La existencia de pruebas de aislamiento entre identidades de prueba NO implica habilitar cuentas de terceros en la interfaz.

## Arquitectura y pendientes reales
La candidata contiene una interfaz local de demostración y un módulo Supabase DEV de consulta aislada. No confundir ambas fuentes ni afirmar sincronización integral. Escrituras remotas bloqueadas hasta verificar esquema, respaldo y pruebas seguras sin tocar datos reales. Pendientes: integración de cuentas, movimientos, tarjetas, obligaciones, recurrencias, presupuestos, notificaciones y respaldos; sincronización web-Android, recuperación, APK y E2E.

## Criterio de aceptación
Una sola identidad titular, cero interfaces de gestión multiusuario, integridad contable, persistencia remota verificada, pruebas de regresión y seguridad, recuperación y publicación web + Android comprobadas. No declarar producción hasta contar con evidencia.
