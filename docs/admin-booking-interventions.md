# Intervenciones administrativas de reservas

## Acciones disponibles
- Consultar candidatos elegibles para una reserva sin asignar.
- Enviar una solicitud manual a un profesional; el profesional debe aceptarla desde Klipp PRO.
- Cancelar una solicitud todavía no asignada, dejando motivo, actor y marca temporal en auditoría.
- Las transiciones de estado se mantienen en el historial existente de reservas.

## Restricciones intencionales
- Las RPC exigen `bookings.manage` en el servidor.
- El despacho solo admite reservas `requested` sin profesional asignado y con coordenadas del cliente.
- Los candidatos deben estar activos, aprobados, haber aceptado la política de herramientas propias, ofrecer el servicio, cubrir la zona, tener agenda compatible y no presentar conflictos de horario.
- Para servicios que empiezan dentro de 20 minutos, el profesional debe estar conectado y tener GPS actualizado en los últimos 90 segundos.
- Un profesional no puede recibir otra solicitud para la misma reserva si ya figura en su historial de solicitudes.
- La cancelación solo admite reservas `requested` sin profesional asignado y bloquea pagos en estado `held`, `released` o `refunded`.
- Las acciones se guardan en `admin_audit_log`; el trigger de historial registra el cambio de estado y el sistema de notificaciones existente informa al cliente de la cancelación.

## Fuera de alcance
No se cambia directamente el profesional de una reserva ya aceptada, pagada, en camino o en curso. Ese proceso requiere que el profesional sustituto acepte primero, que el profesional anterior sea notificado y que el estado de los fondos retenidos permanezca correcto. Tampoco se cancelan desde aquí reservas con fondos retenidos o liberados.

## Despliegue
1. Aplicar migraciones base y RBAC 013–014.
2. Aplicar historial y notificaciones 024–025.
3. Aplicar centro de operaciones 026.
4. Aplicar `027_admin_booking_interventions.sql`.
5. Desplegar frontend después de validar las RPC en staging.

No aplicar esta migración en producción sin probar antes las restricciones y la auditoría en un entorno de staging.