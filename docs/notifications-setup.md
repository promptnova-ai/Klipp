# Notificaciones y despacho de Klipp

Última revisión: 6 de noviembre de 2026.

## Arquitectura

Klipp separa la notificación in-app del envío push:

1. Los cambios de reserva, mensajes, incidencias, reseñas y solicitudes generan notificaciones en la base de datos.
2. Las notificaciones que requieren push se colocan en `push_delivery_queue`.
3. Un trigger de inserción solicita el despacho urgente.
4. El worker `dispatch-notifications` reclama entregas, llama a Expo Push Service, procesa tickets y elimina tokens que Expo marque como no registrados.
5. Un trabajo de `pg_cron` ejecuta el worker cada minuto para recordatorios, comprobaciones de ETA y rondas de asignación automática vencidas.

La bandeja in-app funciona aunque el usuario no conceda permiso push o el dispositivo no tenga token.

## Edge Functions

| Función | Autenticación en gateway | Uso |
|---|---|---|
| `dispatch-notifications` | JWT gateway desactivado | Valida internamente bearer de service role o el secreto exclusivo del cron |
| `auto-assign-booking` | JWT requerido | Inicia el despacho solicitado por el cliente autenticado |
| `booking-route-eta` | JWT requerido | Calcula/actualiza la ruta de una reserva autorizada |

No cambies la verificación JWT de estas funciones sin revisar primero su método de autenticación. El secreto del cron nunca debe enviarse desde la aplicación móvil ni desde el navegador.

## Configuración de secretos del servidor

En Supabase Edge Function Secrets:

- `NOTIFICATION_CRON_SECRET`: secreto aleatorio robusto para el worker programado.
- `GOOGLE_MAPS_SERVER_API_KEY`: clave de servidor restringida a Routes API para ETA con tráfico.

La función valida el secreto del cron mediante el RPC restringido `verify_notification_cron_secret`. No guardes estos valores en variables `EXPO_PUBLIC_*`, en el repositorio ni en logs.

Las claves Android/iOS de mapas y las credenciales FCM/APNs pertenecen a la configuración de la aplicación/EAS, no a los secretos del worker.

## Programación y disparadores

El proyecto conectado tiene instalado y activo el trabajo:

- Nombre: `klipp-dispatch-notifications`
- Frecuencia: cada minuto (`* * * * *`)

También está activo el trigger `push_delivery_queue_dispatch_immediately` después de insertar en `push_delivery_queue`. Los eventos de solicitudes, estados de reserva, mensajes, incidencias, pagos y reseñas tienen sus propios triggers de notificación.

**No programes una segunda copia del cron.** Las migraciones versionadas ya crean la programación y los triggers. Antes de tocar esta configuración, consulta `cron.job`, `pg_trigger` y el historial real de migraciones del proyecto; no ejecutes manualmente bloques SQL antiguos de este documento.

## Notificaciones y despacho automático

- Una solicitud nueva avisa al profesional destinatario.
- La oferta automática tiene una ventana de 45 segundos.
- El despacho avanza al siguiente grupo cuando las ofertas vencen o se rechazan.
- Las ofertas automáticas rechazadas o vencidas no deben generar ruido al cliente mientras el sistema sigue buscando.
- Las solicitudes manuales pueden avisar al cliente cuando el profesional rechaza o no responde.
- Los recordatorios programados se generan aproximadamente 24 horas y una hora antes del servicio, con claves de deduplicación.
- La ETA se recalcula para reservas `en_route` cuando la ubicación del profesional es reciente. Las notificaciones de retraso deben respetar umbrales y deduplicación para evitar avisos repetidos.
- Los mensajes push no deben incluir el contenido privado de los mensajes de chat.

La entrega push no debe considerarse garantizada dentro de los 45 segundos: depende del sistema operativo, conectividad, permisos y proveedor push. La decisión de aceptación/expiración siempre la resuelve el backend.

## Configuración móvil

La app ofrece una acción explícita para activar push desde el centro de notificaciones. Solo registra el token después de que el usuario concede permiso y activa la opción. Al cerrar sesión, elimina el token de ese dispositivo.

Para pruebas reales:

1. Vincula el proyecto EAS de Klipp.
2. Configura credenciales FCM v1 para Android.
3. Configura una clave APNs válida para iOS.
4. Genera e instala un development build o production build.
5. Inicia sesión en un dispositivo físico, activa push y comprueba el registro en `notification_devices`.
6. Envía una solicitud de prueba y comprueba la notificación in-app, la cola, el ticket de Expo y el recibo.

Expo Go no sustituye una prueba de push nativo en builds de producción; en particular, las capacidades push pueden variar por plataforma y versión de Expo.

## Verificación operativa

Consultas útiles en Supabase:

- `cron.job`: comprobar que `klipp-dispatch-notifications` está activo y tiene una sola entrada.
- `pg_trigger`: comprobar los triggers de notificaciones y el disparador de `push_delivery_queue`.
- `public.notifications`: revisar la creación de notificaciones in-app.
- `public.push_delivery_queue`: revisar pendientes, intentos y fallos.
- `public.notification_devices`: comprobar tokens registrados por usuario/dispositivo.

No borres tokens por errores transitorios. Elimina solo tokens que el proveedor identifique de forma concluyente como no registrados.

## Estado observado en producción (6 de noviembre de 2026)

- El cron `klipp-dispatch-notifications` está activo cada minuto.
- El trigger de despacho inmediato está instalado.
- Las tres Edge Functions están activas; `dispatch-notifications` tiene JWT gateway desactivado y valida el secreto internamente.
- En el momento de la revisión había cero dispositivos registrados, cero notificaciones y cero elementos en la cola.

Por tanto, la infraestructura está configurada, pero la entrega push de extremo a extremo sigue pendiente de una prueba en dispositivos físicos con credenciales FCM/APNs y tokens reales.
