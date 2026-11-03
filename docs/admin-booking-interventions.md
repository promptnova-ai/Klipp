# Intervenciones administrativas de reservas

## Acciones disponibles
- Consultar candidatos elegibles para una reserva sin asignar.
- Enviar una solicitud manual a un profesional; el profesional debe aceptarla desde Klipp PRO.
- Cancelar una solicitud todavía no asignada, dejando motivo, actor y marca temporal en auditoría.
- Reasignar una reserva confirmada en estado `scheduled`: administración envía una invitación a un sustituto elegible y el profesional actual conserva la asignación hasta que el sustituto acepte.
- Las transiciones de estado se mantienen en el historial existente de reservas.

## Restricciones intencionales
- Las RPC exigen `bookings.manage` en el servidor.
- El despacho solo admite reservas `requested` sin profesional asignado y con coordenadas del cliente.
- Los candidatos deben estar activos, aprobados, haber aceptado la política de herramientas propias, ofrecer el servicio, cubrir la zona, tener agenda compatible y no presentar conflictos de horario.
- Para servicios que empiezan dentro de 20 minutos, el profesional debe estar conectado y tener GPS actualizado en los últimos 90 segundos.
- Un profesional no puede recibir otra solicitud para la misma reserva si ya figura en su historial de solicitudes.
- La cancelación solo admite reservas `requested` sin profesional asignado y bloquea pagos en estado `pending`, `held`, `released` o `refunded`.
- Las acciones se guardan en `admin_audit_log`; el trigger de historial registra el cambio de estado y el sistema de notificaciones existente informa al cliente de la cancelación.

## Reasignación segura (migración 028)
- Solo se permite en reservas confirmadas `scheduled`, antes de que el profesional marque `en_route`. No se reasignan reservas en camino, con llegada registrada o en curso.
- El candidato debe estar activo, aprobado, haber aceptado la política de herramientas propias, ofrecer el servicio, cubrir la dirección, tener agenda compatible y no tener conflictos de horario.
- Si faltan 20 minutos o menos para el inicio, el sustituto debe estar conectado y con GPS actualizado en los últimos 90 segundos.
- La invitación expira en 15 minutos. Si `pg_cron` está disponible, un worker la marca expirada cada minuto; si no, la caducidad también se aplica de forma diferida cuando el profesional abre Solicitudes o administración inicia otra sustitución. Hasta la aceptación, `bookings.pro_id` no cambia; el profesional actual recibe aviso y la API bloquea sus transiciones de estado mientras la invitación siga pendiente.
- Al aceptar, una transacción cambia el profesional asignado, actualiza el destinatario de un payout únicamente si sigue `pending`, limpia el GPS ligado a la reserva y restablece la confirmación de equipamiento. El profesional sustituto debe confirmar sus propias herramientas al iniciar el servicio.
- Los pagos siguen vinculados a la misma reserva y no se reembolsan ni se vuelven a cobrar. Se bloquea el cambio si hay pagos `pending`, `released` o `refunded`, o si un payout ya no está `pending`.
- El profesional actual, el sustituto y el cliente reciben notificaciones. El sustituto acepta o rechaza desde Klipp PRO > Solicitudes; el profesional actual ve el bloqueo en su agenda.
- La petición, aceptación, rechazo y expiración quedan en `admin_audit_log` y aparecen en la cronología administrativa.

## Fuera de alcance
No se reasignan reservas en camino, con llegada registrada o en curso, ni se alteran pagos o payouts ya procesados. Para esos casos hace falta una intervención financiera y operativa específica.

## Despliegue
1. Aplicar migraciones base 001–007.
2. Aplicar RBAC 013–014.
3. Aplicar la política de equipamiento 015 y presencia profesional 018.
4. Aplicar confirmación de equipamiento por reserva 023.
5. Aplicar historial de estados 024 y notificaciones 025.
6. Aplicar centro de operaciones 026.
7. Aplicar `027_admin_booking_interventions.sql`.
8. Aplicar `028_safe_booking_reassignment.sql`.
9. Desplegar frontend después de validar las RPC en staging.

**Atención:** hay dos archivos con prefijo de versión `015` en el repositorio. Resolver la colisión de versión antes de ejecutar migraciones con Supabase CLI.

No aplicar esta migración en producción sin probar antes las restricciones y la auditoría en un entorno de staging.