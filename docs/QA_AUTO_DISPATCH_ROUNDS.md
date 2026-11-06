# QA — Despacho automático por lotes (Cerca de mí)

Usar exclusivamente un proyecto y cuentas de prueba. No crear reservas ficticias en producción.

## QA-AUTO-01 — Primera ronda simultánea
- Precondición: al menos 6 profesionales de prueba aprobados, conectados, con GPS reciente, servicio/modalidad/precio, cobertura y horario válidos.
- Crear una reserva en modalidad **Lo antes posible / Cerca de mí**.
- Verificar en `booking_requests` que la primera ronda contiene como máximo 5 profesionales.
- Comprobar que son los 5 candidatos elegibles más cercanos, ordenados por distancia (desempate por valoración y trabajos completados).
- Resultado esperado: todos los profesionales de la ronda reciben la misma reserva con vencimiento de 45 segundos; ningún profesional ajeno a la ronda recibe una oferta.

## QA-AUTO-02 — Gana el primero que acepta
- Con dos dispositivos de profesionales de la misma ronda, intentar aceptar casi simultáneamente.
- Resultado esperado: una sola llamada gana; `bookings.pro_id` contiene un único profesional; el estado pasa a `awaiting_payment`; se fija el precio y duración del ganador.
- Resultado esperado: las demás solicitudes pasan a `expired` y desaparecen en vivo de sus dispositivos, sin recargar manualmente.
- Resultado esperado: no se inicia otra ronda para esa reserva.

## QA-AUTO-03 — Siguiente lote inmediato por rechazo
- Precondición: al menos 6 candidatos elegibles.
- Rechazar desde todos los profesionales de la primera ronda.
- Medir desde el último rechazo hasta la inserción de la siguiente ronda.
- Resultado esperado: la siguiente ronda se crea dentro de la misma operación transaccional, sin esperar al cron de un minuto; contiene los siguientes profesionales elegibles más cercanos y no repite a los ya notificados.

## QA-AUTO-04 — Siguiente lote tras expiración
- Dejar vencer los 45 segundos de todas las ofertas de la ronda.
- Resultado esperado: al marcarse expiradas, se inicia el siguiente lote sin esperar al siguiente ciclo completo del cron. No se crean rondas duplicadas aunque el cron y el trigger coincidan.

## QA-AUTO-05 — Rechazo y aceptación concurrentes
- Enviar rechazo desde un profesional mientras otro acepta la misma reserva.
- Repetir con varias combinaciones y con respuestas casi simultáneas.
- Resultado esperado: no hay deadlocks; la reserva termina asignada a un solo ganador o sigue solicitándose; nunca se asigna a dos profesionales ni se abre una ronda después de una aceptación.

## QA-AUTO-06 — Actualización en vivo
- Mantener abiertas las pantallas de varios profesionales de la misma ronda y la pantalla de reservas del cliente.
- Aceptar desde un profesional.
- Resultado esperado: los otros profesionales reciben el cambio de estado por Supabase Realtime y la oferta desaparece automáticamente; el cliente recibe el cambio de reserva en vivo.
- Comprobar que `booking_requests` está incluida en la publicación `supabase_realtime`.

## QA-AUTO-07 — Candidatos agotados
- Usar una reserva de prueba con un número finito de candidatos elegibles y hacer que todos rechacen o expiren.
- Resultado esperado: no se repiten profesionales; no se crean ofertas vacías ni infinitas; la reserva permanece sin asignar y el cliente recibe un estado claro de búsqueda sin disponibilidad.

## QA-AUTO-08 — Exclusiones correctas
- Probar candidatos fuera de cobertura, sin tarifa para la modalidad, no aprobados, desconectados, GPS con más de 90 segundos, horario incompatible, con reserva solapada o con otra oferta pendiente.
- Resultado esperado: ninguno entra en la ronda.

## QA-AUTO-09 — Expiración desde el dispositivo
- Mantener abierta la oferta en la app profesional hasta que llegue a cero.
- Resultado esperado: la app invoca `pro_expire_booking_request`; el backend marca la oferta como expirada y activa la siguiente ronda de inmediato si no quedan ofertas vivas.
- Repetir con la app en segundo plano o sin conexión.
- Resultado esperado: al volver a conectarse se recupera el estado correcto; el cron del servidor sigue siendo el mecanismo de respaldo.
