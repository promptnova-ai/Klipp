# Centro de operaciones de Klipp — Fase 3

## Qué incorpora
- Pestaña **Operaciones** en el panel administrativo existente.
- Listado de reservas en estados activos y en disputa.
- Resumen de órdenes abiertas, órdenes que requieren revisión, profesionales en camino y servicios en curso.
- Filtros para órdenes activas, órdenes con alertas orientativas y todas las órdenes incluidas.
- Consulta de cliente, profesional, servicio, dirección, precio, hora programada y número de eventos.
- Última ubicación GPS del profesional, antigüedad de la señal y enlace para abrir las coordenadas en Google Maps.
- Historial cronológico de estados y actor cuando está disponible.
- Actualización del listado cada 15 segundos y actualización manual.
- Mapa multiprofesional para órdenes en camino, con marcadores seleccionables y señal visual para GPS desactualizado.
- Visualización del último ETA calculado por el worker de notificaciones, con fecha de actualización.
- Alertas de GPS sin señal o sin actualización durante más de 2 minutos.
- Cálculo manual de ETA por carretera con tráfico mediante la Edge Function `booking-route-eta`, solo para reservas `en_route`.

## Permisos y seguridad
- La pestaña aparece para superadministrador o personal con `bookings.read`.
- Las funciones SQL `admin_list_operational_bookings` y `admin_get_booking_timeline` validan `has_admin_permission('bookings.read')` en servidor.
- La app no consulta directamente reservas, ubicaciones ni eventos para este panel.
- La función ETA admite al cliente de la reserva o a un empleado con `bookings.read`.
- El cálculo de ETA desde administración envía `notifyDelay: false`: consultar una ETA no genera una notificación de retraso al cliente.
- Las intervenciones requieren `bookings.manage`; consultar el panel solo requiere `bookings.read`.
- Se puede enviar una solicitud manual a un profesional elegible cuando la reserva está en `requested` y aún no tiene profesional asignado. El profesional debe aceptarla desde su app.
- Se puede cancelar desde el panel una solicitud `requested` sin profesional asignado y sin pagos pendientes, retenidos, liberados o reembolsados. El motivo y el actor quedan registrados en `admin_audit_log`; el cambio de estado se añade al historial y dispara la notificación normal al cliente.
- No se permite desde este control reasignar reservas ya aceptadas/pagadas, en camino o en curso, ni cancelar reservas con fondos retenidos/liberados. Esos casos requieren un flujo explícito de aceptación del profesional sustituto y tratamiento del pago/reembolso; no se fuerza el cambio de `pro_id`.

## Dependencias de base de datos
Aplicar en el proyecto de Supabase, en orden y solo después de revisar el SQL:
1. Esquema base 001–007 — perfiles, reservas, pagos, direcciones, áreas de servicio y auditoría.
2. Migración 013 — identidad del superadministrador y RBAC.
3. Migración 014 — enforcement de permisos y gestión de personal.
4. Migración 015 de política de equipamiento — aceptación obligatoria del profesional.
5. Migración 018 — presencia profesional y GPS online.
6. Migración 023 — confirmación de equipamiento por reserva.
7. Migración 024 — historial inmutable de estados.
8. Migración 025 — tabla de seguimiento de ETA y notificaciones (requerida para mostrar el último ETA calculado).
9. Migración 026 — RPCs del centro de operaciones.
10. Migración 027 — despacho administrativo auditado y cancelación segura de solicitudes sin asignar.
11. Migración 028 — reasignación segura de reservas confirmadas.

La migración 026 también requiere el esquema base de reservas, perfiles, servicios, direcciones y ubicaciones GPS. La migración 028 requiere además pagos/payouts, presencia profesional, columnas de confirmación de equipamiento creadas en 023, historial 024 y la función de notificaciones creada en 025. La migración 027 requiere además la política de equipamiento de la migración 015, las áreas de cobertura de la 005 y la presencia GPS de la 018. Revisa los nombres/versiones de migración del repositorio antes de aplicarlas: actualmente existen dos archivos con prefijo `015` (`015_equipment_policy_and_remove_massage.sql` y `015_staff_issue_resolution.sql`), por lo que hay que resolver esa colisión de versión antes de ejecutar el conjunto con Supabase CLI. La migración 025 es necesaria para la columna de ETA que consume el panel; además instala el worker que recalcula el ETA y gestiona las notificaciones de retraso.

**Estado:** la migración 026 está guardada en GitHub, pero no se ha aplicado a Supabase. La Edge Function modificada tampoco se ha desplegado.

## Configuración necesaria para ETA
- Configurar `GOOGLE_MAPS_SERVER_API_KEY` como secreto de la Edge Function.
- Habilitar Google Routes API y restringir la clave de servidor a esa API.
- Para el mapa en navegador, configurar también `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` y habilitar Maps JavaScript API; restringir esa clave por dominio y API. El mapa nativo usa `react-native-maps`.
- Desplegar `booking-route-eta` después de aplicar las migraciones necesarias.
- La ETA requiere que la reserva esté en `en_route` y que el GPS del profesional tenga menos de 120 segundos de antigüedad.
- Si falta configuración, el GPS está desactualizado o no hay ruta, el panel debe mostrar que la ETA no está disponible; no debe inventar un tiempo.

## Umbrales orientativos de revisión
- `requested`: 10 minutos sin asignación.
- `awaiting_payment`: 15 minutos desde la aceptación.
- `scheduled`: más de 15 minutos después de la hora prevista.
- `en_route`: 45 minutos en camino.
- `in_progress`: duración estimada más 30 minutos.
- `disputed`: siempre requiere revisión.

Estos umbrales son señales operativas para priorizar una revisión humana; no cambian automáticamente el estado de una reserva ni prueban por sí solos que exista un fallo.

## Validación antes de producción
- Ejecutar las migraciones en un proyecto de staging, nunca directamente en producción como primera prueba.
- Verificar que un usuario cliente y un profesional reciben error de permiso al llamar ambos RPCs.
- Verificar que el superadministrador y empleados con `bookings.read` pueden consultar órdenes.
- Verificar que empleados sin `bookings.read` no ven la pestaña y reciben denegación en el RPC.
- Verificar que empleados con `bookings.read` pero sin `bookings.manage` no ven las acciones y reciben denegación en las RPC de intervención.
- Probar candidatos con equipamiento aceptado, servicio activo, cobertura, agenda, conflictos, presencia online reciente y ubicación GPS ausente.
- Comprobar que el despacho crea una solicitud con caducidad, notifica al profesional y exige su aceptación.
- Comprobar que la cancelación solo funciona para reservas solicitadas sin profesional y sin pagos protegidos, y que genera auditoría e historial.
- Comprobar reservas sin profesional, sin ubicación GPS, con ubicación reciente y con ubicación antigua.
- Comprobar todos los umbrales de alertas con fechas controladas.
- Verificar el historial cuando el actor sea un usuario y cuando el cambio venga de backend sin `auth.uid()`.
- Probar ETA con GPS reciente, GPS antiguo, API no configurada y reserva que no esté `en_route`.
- Confirmar que calcular ETA desde administración no envía notificaciones al cliente.
- Validar build web y development build iOS/Android.

## Limitaciones conocidas de esta entrega
- El mapa muestra profesionales en camino con ubicación registrada; las reservas en otros estados no mantienen ubicación GPS porque el sistema la limpia al terminar el trayecto.
- El worker `dispatch-notifications` ya recalcula ETA en segundo plano aproximadamente cada 3 minutos cuando la ubicación tiene menos de 2 minutos y Google Routes está configurado. El panel muestra ese último dato; el cálculo manual sigue disponible para una consulta puntual.
- Las alertas se calculan en el cliente a partir de marcas temporales y umbrales fijos; no ejecutan acciones automáticas.
- La migración 028 añade una reasignación controlada de reservas `scheduled`: el sustituto debe aceptar, el profesional actual queda bloqueado mientras espera, los pagos siguen ligados a la reserva y solo se actualiza un payout todavía pendiente. No permite reasignar servicios en camino o iniciados.
- El panel muestra como máximo 150 reservas operativas por consulta.
