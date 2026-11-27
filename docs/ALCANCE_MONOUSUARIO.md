# MisFinanzas — alcance monousuario y uso de la candidata
Un solo titular consulta, registra y valida sus finanzas. No se ofrecen usuarios colaboradores, invitaciones ni administración multiusuario.
Creado por: Eduardo Neisa Cortés.

## Uso
Servir web/ con node tools/serve.cjs y abrir http://127.0.0.1:8765. Evitar file://: el libro necesita un origen seguro y Web Locks.
Configuración permite cuentas bancarias y efectivo. Movimientos registra ingresos, gastos y transferencias; categorías/beneficiarios y componentes deben reconciliar el total en COP enteros.
Deudas comparte saldos con ese mismo libro: compras/cuotas, préstamos, intereses/cargos, pagos explícitos y negociación. Indicar cuotas previamente pagadas y cuotas cubiertas por el nuevo pago;0 permite abonos o intereses sin avanzar cuotas.
Capital pagado reduce deuda y efectivo; no duplica consumo. Compras con tarjeta cuentan una sola vez. Los recordatorios, suscripciones y reservas no generan movimientos automáticamente.
Planificación incorpora presupuestos por categoría/mes, metas y reservas; el resumen presenta saldos y consumo del libro. Los escenarios históricos siguen separados y conservados.

## Sincronización y recuperación
Abrir consulta Supabase e iniciar sesión con correo verificado. Contraseña de12caracteres mínimo con mayúscula/minúscula/número/símbolo. Usar solo URL y clave pública. Contraseñas/tokens no se persisten.
La sincronización es explícita por módulo: libro, planificación, categorías/beneficiarios, obligaciones/suscripciones. Envía solo después de confirmación y de que el servidor valide titular y habilitación. No es una orden bancaria.
Una revisión remota en conflicto no reemplaza datos silenciosamente. Recuperar una versión distinta requiere confirmación y conserva una copia local previa. Respaldar cifrado antes de cualquier cambio; exportación JSON del laboratorio no está cifrada.
Cerrar sesión revoca localmente y solicita cierre remoto. Recuperación por correo requiere enlace verificado del proveedor; seguir instrucciones del formulario. No compartir credenciales.
Las pruebas usan datos sintéticos; no introducir finanzas reales hasta la aceptación.

## Android y verificación
Compilar con Java17/SDK35: gradle -p android :app:assembleDebug --no-daemon. La APK candidata debug conserva el ícono original y recursos web; verificar COMMIT.txt/SHA256SUMS.txt del artifact.
No desinstalar una instalación con datos para resolver diferencias de firma. La APK debug no es una versión de producción.
npm test; npm run test:browser; python -m unittest discover -s tests -v; python tests/check_candidate.py.
Actions entrega evidencias de navegador, PostgreSQL/PostgREST aislado, restauración y emulador; solo declarar aprobadas las ejecuciones concluidas satisfactoriamente.

## Entrega y aceptación
El ZIP source contiene MANIFIESTO_SHA256.json y SOURCE_COMMIT.txt. La raíz publicada y main se conservan. Este código es una candidata no liberada; pruebas aisladas no acreditan el servicio real ni autorizan publicar producción.
La aceptación y la integración corresponden aChat5.
