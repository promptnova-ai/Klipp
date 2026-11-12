# Escenarios de prueba manuales — Klipp

Guía para validar en el entorno de pruebas los flujos de registro profesional,
ubicación GPS, descubrimiento y reservas. No usar cuentas ni datos de clientes
reales.

## Preparación

- Abrir `http://localhost:8081` y confirmar que la app termina de cargar.
- Usar correos de prueba distintos para cada cuenta; tener acceso a la bandeja
  para confirmar el registro.
- Usar ubicaciones de prueba conocidas dentro y fuera de las áreas de cobertura.
- Para comprobar descubrimiento, el profesional de prueba debe tener el perfil
  aprobado y activo; los profesionales pendientes no deben aparecer en los
  resultados públicos.
- Verificar que el proyecto de Supabase de pruebas tenga aplicada la migración
  de áreas geográficas `005_radius_based_service_areas.sql`.
- Registrar para cada caso el resultado: **Aprobado**, **Fallido** o **Bloqueado**,
  más el mensaje observado y una captura sin datos personales.

## QA-SEC-01 — Privilegios del rol anónimo

**Prioridad:** Alta  
**Precondición:** Sesión cerrada.

1. Abrir el registro profesional.
2. Comprobar que se leen profesiones, modalidades y requisitos de herramientas.
3. Comprobar que no se puede acceder a perfiles, reservas, mensajes, notificaciones ni ubicaciones de profesionales sin iniciar sesión.
4. Verificar en Supabase que `anon` solo tiene SELECT sobre `service_types`, `pricing_tiers` y `service_equipment_requirements`, sin permisos de escritura.

**Resultado esperado:** El registro puede cargar el catálogo público; el resto de los datos de la plataforma no son accesibles para el rol anónimo.

## Casos de prueba

### QA-PRO-01 — Validación del formulario profesional

**Prioridad:** Alta  
**Precondición:** Sesión cerrada.

1. Abrir el registro profesional.
2. Intentar continuar con el nombre vacío.
3. Escribir un teléfono incompleto e intentar continuar.
4. Completar nombre y teléfono válidos y avanzar.

**Resultado esperado:** No se avanza si falta el nombre o el teléfono no tiene
10 dígitos. Al corregirlos, se puede avanzar. Los valores ingresados sobreviven
al retroceder y continuar entre pasos.

### QA-PRO-01A — Medio de traslado del profesional

**Prioridad:** Media  
**Precondición:** Estar en el primer paso del registro profesional.

1. Seleccionar cómo llegará el profesional al domicilio: motor, automóvil,
   transporte público, bicicleta, a pie u otro.
2. Si se elige **Otro**, escribir el medio de traslado.
3. Completar el registro, confirmar el correo e iniciar sesión.
4. Abrir **Mi perfil** y revisar el medio de transporte guardado.

**Resultado esperado:** La elección se conserva en el borrador de registro y se
recupera en el perfil. La opción **Otro** requiere una descripción.

### QA-PRO-02 — Profesión única, detalles y tarifas por modalidad

**Prioridad:** Alta  
**Precondición:** Estar en el paso de profesión del registro profesional.

1. Intentar continuar sin elegir una profesión.
2. Seleccionar una profesión y comprobar que solo puede quedar una seleccionada.
3. Cambiar a otra profesión y comprobar que se limpian los detalles y precios de la anterior.
4. Completar el campo de especialidad y el dato específico que corresponda a esa profesión.
5. Dejar vacía una tarifa de modalidad e intentar continuar.
6. Completar el precio y la duración de cada modalidad de la profesión.

**Resultado esperado:** Solo se registra una profesión principal. Cada modalidad conserva su propio precio y duración. No se avanza con datos específicos incompletos ni con modalidades sin tarifa válida.

### QA-PRO-02A — Catálogo de modalidades antes de crear la cuenta

**Prioridad:** Alta  
**Precondición:** Sesión cerrada, antes de completar el registro profesional.

1. Abrir el registro profesional y elegir una profesión.
2. Comprobar que aparecen sus modalidades y que se pueden introducir precio y duración.
3. Confirmar que los precios de catálogo no se presentan como tarifas cobradas al cliente.
4. Intentar consultar el catálogo sin iniciar sesión.

**Resultado esperado:** Las modalidades se pueden leer antes del alta (rol anónimo), pero el catálogo no admite inserciones ni modificaciones desde el cliente. El profesional define sus tarifas al registrarse.

### QA-PRO-03 — Centro GPS, pin y radio de cobertura

**Prioridad:** Alta  
**Precondición:** Permiso de ubicación disponible en el navegador o dispositivo.

1. En el paso de cobertura, pulsar **Usar mi ubicación actual** y permitir GPS.
2. Comprobar que se coloca un centro en el mapa.
3. Ajustar el centro con el mapa y cambiar el radio.
4. Intentar continuar sin seleccionar días de trabajo.

**Resultado esperado:** Se obtiene una ubicación válida y se puede ajustar el
centro y radio. No se solicita seleccionar sectores. No se avanza sin días
seleccionados ni con un horario inválido.

### QA-PRO-04 — Permiso de ubicación denegado

**Prioridad:** Media  
**Precondición:** Poder cambiar el permiso de ubicación del sitio o dispositivo.

1. Denegar el permiso GPS.
2. Pulsar **Usar mi ubicación actual**.

**Resultado esperado:** Se muestra un mensaje indicando que hace falta permiso
para definir la cobertura; la app no guarda coordenadas ficticias ni queda
cargando indefinidamente. Conceder el permiso y reintentar debe permitir seguir.

### QA-PRO-05 — Registro, correo y reingreso

**Prioridad:** Alta  
**Precondición:** Correo de prueba no registrado.

1. Completar todos los pasos del registro con correo y contraseña de prueba.
2. Crear la cuenta.
3. Abrir el correo de confirmación y seguir el enlace.
4. Volver a `localhost:8081`, iniciar sesión y abrir **Mi perfil**.

**Resultado esperado:** La cuenta se crea; si Supabase exige confirmación, la
app informa que hay que confirmar el correo. El enlace vuelve al host de pruebas
y no a un puerto inexistente. Los datos del onboarding aparecen como borrador
en el perfil para poder guardarlos.

### QA-PRO-05A — Compromiso de herramientas y materiales

**Prioridad:** Alta  
**Precondición:** Estar en el paso de profesión del registro profesional.

1. Completar profesión, detalles y tarifas.
2. Intentar continuar sin aceptar el compromiso de herramientas.
3. Marcar la confirmación y continuar el registro.

**Resultado esperado:** El registro no se completa sin aceptar expresamente que el profesional llevará sus propias herramientas y materiales y que no utilizará los del cliente. La aceptación queda registrada en `pro_profiles.equipment_policy_accepted_at`.

### QA-PRO-06 — Guardado del perfil profesional

**Prioridad:** Alta  
**Precondición:** Profesional registrado, sesión iniciada y perfil aprobado o
listo para configurar.

1. Revisar que estén precargados los datos del onboarding.
2. Guardar perfil, cobertura, servicios y disponibilidad.
3. Recargar la página e iniciar sesión nuevamente.

**Resultado esperado:** La app confirma el guardado y los valores permanecen
después de recargar. En Supabase, comprobar `pro_profiles` (centro y radio),
`pro_services` (servicio, tarifa, duración) y `pro_availability` (días y horas).

### QA-CLI-01 — Permiso GPS y dirección detectada

**Prioridad:** Alta  
**Precondición:** Sesión iniciada como cliente.

1. Abrir una nueva reserva y permitir ubicación.
2. Revisar la dirección detectada.
3. Ajustar el pin y agregar indicaciones de referencia.

**Resultado esperado:** El pin representa la ubicación actual; al cambiarlo,
se actualiza la dirección y se vuelven a consultar disponibilidad y profesionales.
Las indicaciones pueden editarse sin seleccionar un sector.

### QA-CLI-02 — Ubicación del cliente fuera de cobertura

**Prioridad:** Alta  
**Precondición:** Tener un servicio profesional activo y aprobado, con cobertura
configurada.

1. Buscar el servicio desde un punto dentro del radio.
2. Repetir desde un punto claramente fuera del radio.

**Resultado esperado:** El profesional puede aparecer dentro del radio y no
aparece fuera de él. Si no existen resultados, la app informa que no hay
profesionales disponibles para ese punto sin bloquear la pantalla.

### QA-CLI-03 — Disponibilidad por fecha y hora

**Prioridad:** Alta  
**Precondición:** Profesional aprobado, servicio activo y horario configurado.

1. Seleccionar un servicio, una fecha futura y revisar los horarios disponibles.
2. Seleccionar un horario libre.
3. Intentar una fecha pasada o un horario ya ocupado, si la interfaz lo permite.

**Resultado esperado:** Solo se pueden elegir horarios futuros y disponibles
dentro del horario laboral. Los espacios ocupados o fuera de cobertura no se
ofrecen como disponibles.

### QA-CLI-04 — Crear reserva con ubicación e indicaciones

**Prioridad:** Alta  
**Precondición:** Cliente con ubicación válida y al menos un profesional elegible.

1. Elegir servicio, profesional, fecha y hora.
2. Revisar precio, dirección y referencia.
3. Confirmar la reserva.
4. Abrir **Reservas** como cliente y **Solicitudes/Agenda** como profesional.

**Resultado esperado:** Se crea una sola reserva, con profesional y hora
seleccionados. En la tabla `bookings`, comprobar `client_lat`, `client_lng`,
`address_text` y `landmark_notes`. La reserva debe mostrarse en las vistas de
cliente y profesional con un estado coherente.

### QA-CLI-04A — Seguimiento en pantalla completa cuando va en camino

**Prioridad:** Alta  
**Precondición:** Reserva asignada y estado `en_route`; el profesional comparte
su ubicación activa.

1. En **Mis reservas**, pulsar **Ver seguimiento en vivo**.
2. Revisar la ETA aproximada, el mapa, el punto de destino y la ficha del
   profesional, incluyendo su medio de traslado.
3. Mover la ubicación del profesional y observar las actualizaciones en vivo.
4. Marcar llegada o inicio del servicio desde la sesión profesional.

**Resultado esperado:** El cliente ve una pantalla dedicada de seguimiento con
el mapa actualizado y la ETA identificada como aproximada. Al cambiar el estado
a llegada o servicio en curso, la pantalla muestra el nuevo estado y deja de
presentar ubicación en vivo.

### QA-CLI-05 — Reserva automática sin profesional elegible

**Prioridad:** Media  
**Precondición:** Ubicación o servicio sin profesionales elegibles.

1. Iniciar una reserva automática para ese servicio y punto.
2. Revisar el resultado y la vista de reservas.

**Resultado esperado:** La app muestra claramente que no pudo asignar un
profesional o que la búsqueda automática está en curso. No presenta una reserva
como asignada cuando aún no hay profesional confirmado.

### QA-OPS-01 — Permisos y errores de red

**Prioridad:** Media  
**Precondición:** Poder denegar GPS o desconectar temporalmente la red.

1. Denegar GPS en checkout.
2. Restaurar GPS y desconectar la red durante una búsqueda o guardado.
3. Reconectar y reintentar.

**Resultado esperado:** Se muestra un error recuperable y comprensible; no se
pierden silenciosamente datos ya introducidos ni se duplican reservas al reintentar.

## Evidencia sugerida

Para un caso fallido, anotar el ID del caso, navegador/dispositivo, pasos,
resultado esperado y resultado observado. Adjuntar capturas sin correos, teléfonos,
tokens de sesión, enlaces de confirmación ni coordenadas privadas.


### QA-PRC-01 — Precio independiente por variante

**Prioridad:** Alta  
**Precondición:** Profesional aprobado, con cobertura y equipamiento confirmados; servicio con dos o más variantes.

1. En el perfil profesional, publicar un precio y duración diferentes para cada variante.
2. Guardar, cerrar sesión y volver a entrar.
3. Revisar que cada variante conserve su tarifa y duración.
4. Repetir la consulta como cliente.

**Resultado esperado:** Cada variante muestra la tarifa publicada por ese profesional. No se reutiliza automáticamente el precio base para otra variante.

### QA-PRC-02 — Rango estimado de Cerca de mí

**Prioridad:** Alta  
**Precondición:** Al menos dos profesionales auto-asignables, aprobados y con cobertura del punto; ambos han publicado precio para la misma variante.

1. Seleccionar el servicio, variante y ubicación.
2. Elegir asignación automática.
3. Comparar el rango mostrado con las tarifas publicadas de los profesionales de la zona.
4. Repetir en una ubicación sin profesionales con tarifa configurada.

**Resultado esperado:** El rango usa el mínimo y máximo de las tarifas publicadas que cubren el punto. Si no hay tarifas válidas, la app no inventa un precio ni crea una solicitud automática.

### QA-PRC-03 — Precio definitivo al aceptar

**Prioridad:** Alta  
**Precondición:** Dos profesionales reciben una oferta de la misma reserva y tienen tarifas distintas.

1. Hacer que ambos profesionales intenten aceptar casi simultáneamente.
2. Consultar la reserva después de la aceptación.
3. Revisar pro_id, pro_service_id, price_dop y est_minutes.
4. Verificar que el cliente ve el precio definitivo antes de iniciar el pago.

**Resultado esperado:** Solo un profesional queda asignado. El precio y duración guardados corresponden a su tarifa publicada; las otras ofertas quedan expiradas. El importe estimado inicial no prevalece sobre la tarifa aceptada.

### QA-PRC-04 — Comisión de Klipp del 7%

**Prioridad:** Alta  
**Precondición:** Reserva aceptada con un precio definitivo conocido.

1. Aceptar un servicio con precio de RD$ 1.000.
2. Revisar commission_pct, commission_dop y pro_payout_dop.
3. Repetir con un importe que produzca decimales.

**Resultado esperado:** La comisión es el 7% del precio del servicio y el pago profesional es el 93% restante, con importes redondeados a dos decimales. Para RD$ 1.000, comisión RD$ 70 y pago profesional RD$ 930.

### QA-PRC-05 — Servicio sin variantes en asignación automática

**Prioridad:** Alta  
**Precondición:** Servicio sin pricing_tiers y al menos un profesional auto-asignable con tarifa base publicada.

1. Crear una reserva automática inmediata y otra programada.
2. Comprobar el rango estimado, los horarios disponibles y las ofertas enviadas.
3. Aceptar desde un profesional elegible.

**Resultado esperado:** La reserva se crea sin pricing_tier_id, el profesional recibe la solicitud y al aceptar se fija su tarifa base real antes del pago.


### QA-PRC-06 — Oferta con tarifa individual del profesional

**Prioridad:** Alta  
**Precondición:** Dos profesionales auto-asignables con precios y duraciones diferentes para la misma modalidad.

1. Crear una reserva automática para una ubicación cubierta por ambos.
2. Comparar el precio, duración y pago neto que aparece en la oferta de cada profesional.
3. Consultar la lista de solicitudes entrantes desde ambas cuentas.
4. Aceptar desde uno de los profesionales.

**Resultado esperado:** Cada profesional ve su propio precio y su pago neto después de comisión, no el precio provisional mínimo de la reserva. La duración de la oferta coincide con la modalidad publicada por ese profesional y la reserva definitiva conserva esos valores.

### QA-PRO-REQ-04 — Expiración real y desconexión por oferta no respondida

**Prioridad:** Alta  
**Precondición:** Profesional online y elegible; reserva automática con una oferta dirigida a su cuenta.

1. Recibir una oferta y no aceptar ni rechazar.
2. Esperar hasta que el servidor alcance `expires_at` y ejecute el proceso programado de expiración.
3. Consultar la fila de `booking_requests` y el estado de `pro_presence`.
4. Comprobar que se inicia otra ronda sin volver a ofrecer la misma reserva al profesional que no respondió.
5. Repetir aceptando o rechazando explícitamente una oferta para comprobar que esos casos no se marcan como ausencia.

**Resultado esperado:** La oferta queda `expired`, `missed_at` queda informado y el profesional pasa a offline. Un rechazo explícito no se considera una ausencia. La siguiente ronda conserva sus propios 45 segundos completos.

### QA-PRO-REQ-04A — Temporizador independiente por ronda

**Prioridad:** Alta  
**Precondición:** Al menos dos rondas de profesionales elegibles para la misma reserva automática.

1. Rechazar una oferta pocos segundos después de recibirla.
2. Comprobar que el servidor inicia la siguiente ronda.
3. Medir el plazo de la nueva oferta desde su propio `expires_at`.
4. Verificar que el temporizador de la ronda anterior no caduca la nueva antes de tiempo.

**Resultado esperado:** Cada oferta dispone de 45 segundos completos desde su creación. Ningún temporizador de una ronda anterior puede expirar ofertas posteriores.

### QA-BOOK-01 — Servicio desactivado y RPC heredado

**Prioridad:** Alta  
**Precondición:** Servicio activo y una sesión de cliente autenticada.

1. Cargar el formulario de reserva con un servicio activo.
2. Desactivar el servicio desde el catálogo de administración mientras el formulario sigue abierto.
3. Intentar crear una reserva usando el formulario ya abierto.
4. Intentar invocar el antiguo RPC `create_booking` con el mismo usuario.

**Resultado esperado:** El servidor rechaza la creación porque el servicio ya no está activo. El RPC heredado no está disponible para clientes autenticados; la aplicación usa los RPC actuales con precio profesional.

### QA-BOOK-02 — Servicio que cruza la medianoche

**Prioridad:** Alta  
**Precondición:** Servicio con duración positiva y cliente autenticado.

1. Intentar crear una reserva que empiece antes de medianoche y termine al día siguiente en hora local de Santo Domingo.
2. Repetir con una reserva cuyo inicio y fin estén en el mismo día local.

**Resultado esperado:** El servidor rechaza cualquier reserva que cruce el día local, incluso si se invoca directamente el RPC. Las reservas dentro del mismo día siguen funcionando.

### QA-BOOK-03 — Reserva aceptada pendiente de pago visible al profesional

**Prioridad:** Alta  
**Precondición:** El profesional ha aceptado una solicitud y la reserva está en `awaiting_payment`.

1. Abrir Agenda profesional.
2. Comprobar que la reserva sigue visible con el estado pendiente de pago.
3. Verificar que no se ofrece ninguna acción para iniciar el desplazamiento o el servicio.
4. Confirmar que el mensaje indica que no debe desplazarse hasta que Klipp confirme la reserva.

**Resultado esperado:** La aceptación no hace desaparecer la reserva de la agenda. El profesional entiende que todavía no debe prestar el servicio.

### QA-BOOK-04 — No despachar reservas vencidas

**Prioridad:** Crítica  
**Precondición:** Reserva automática con inicio programado hace más de 10 minutos y profesionales conectados, online y elegibles.

1. Crear una reserva de prueba cuyo `scheduled_start` haya pasado más de 10 minutos.
2. Invocar manualmente `dispatch_auto_booking`.
3. Ejecutar `process_scheduled_booking_dispatch`.
4. Simular una oferta que sigue pendiente cuando la reserva supera el margen de 10 minutos.
5. Intentar aceptar esa oferta desde la sesión profesional.
6. Repetir con una reserva que todavía esté dentro del margen de tolerancia.

**Resultado esperado:** Una reserva vencida pasa a `expired`, no recibe nuevas ofertas y no puede aceptarse aunque el contador de una oferta siga activo. El profesional que no respondió a una oferta vencida se marca como ausencia. Una reserva dentro del margen de 10 minutos conserva el flujo normal.

### QA-BOOK-05 — Reasignación con tarifa propia del sustituto

**Prioridad:** Crítica  
**Precondición:** Reserva futura en estado `scheduled`, profesional original asignado, sustituto aprobado y con servicio activo.

1. Configurar al sustituto con una tarifa y duración distintas para la misma variante.
2. Crear una reasignación administrativa y aceptar desde la cuenta del sustituto.
3. Revisar `bookings.pro_id`, `pro_service_id`, `est_minutes`, `price_dop`, `commission_dop` y `pro_payout_dop`.
4. Si existe una liquidación en estado `pending`, revisar también `payouts.pro_id` y `payouts.amount_dop`.

**Resultado esperado:** La reserva queda vinculada al servicio del sustituto. Precio, duración, comisión y liquidación se recalculan con su tarifa real. La confirmación de equipamiento anterior se reinicia.

### QA-BOOK-06 — No reasignar sin tarifa de variante

**Prioridad:** Alta  
**Precondición:** Sustituto aprobado con el servicio principal, pero sin precio activo para la variante de la reserva.

1. Abrir la lista de candidatos de reasignación.
2. Intentar crear una solicitud al sustituto sin tarifa para esa variante.
3. Repetir después de publicar la tarifa correspondiente.

**Resultado esperado:** El sustituto no aparece como elegible ni puede aceptar mientras no tenga una tarifa activa para esa variante.

### QA-BOOK-07 — Conflicto calculado con la duración del sustituto

**Prioridad:** Alta  
**Precondición:** El sustituto tiene una duración de servicio mayor que el profesional original y otra reserva cercana en su agenda.

1. Crear una reserva que, con la duración original, no solape el margen de la segunda reserva.
2. Configurar al sustituto con una duración que sí genere solapamiento.
3. Consultar candidatos y tratar de reasignar.

**Resultado esperado:** El servidor calcula disponibilidad y margen de desplazamiento usando la duración del sustituto. La reasignación se rechaza si existe solapamiento.

### QA-PRO-REQ-05 — Cuenta atrás real de 45 segundos

**Prioridad:** Alta  
**Precondición:** Reserva automática con al menos un profesional elegible y conectado.

1. Crear una reserva automática inmediata.
2. Medir el vencimiento de la oferta desde que se inserta en `booking_requests`.
3. Intentar aceptar antes y después de los 45 segundos.
4. Comprobar que el siguiente ciclo de despacho puede enviar la oferta a otros candidatos que aún no la hayan recibido.

**Resultado esperado:** La oferta automática vence a los 45 segundos, aunque exista otro plazo configurado para solicitudes manuales. El servidor rechaza una aceptación tardía y el contador de la app coincide con `expires_at`.

### QA-PRO-REQ-01 — Alerta entrante tipo Uber

**Prioridad:** Alta  
**Precondición:** Profesional conectado, online y con push habilitado; cliente crea una reserva automática compatible.

1. Enviar una solicitud desde un cliente.
2. Con la app profesional abierta, comprobar que aparece el aviso a pantalla completa sin tener que entrar manualmente en Solicitudes.
3. Verificar nombre del cliente, servicio, variante, dirección, referencia, fecha/hora, duración e importe neto estimado.
4. Comprobar cuenta atrás desde el tiempo restante de la oferta.

**Resultado esperado:** La oferta aparece como una alerta prioritaria, no como una tarjeta discreta ni una notificación genérica. Los datos corresponden a la reserva real y solo son visibles para el profesional destinatario.

### QA-PRO-REQ-02 — Deslizar para aceptar

**Prioridad:** Alta  
**Precondición:** Oferta entrante pendiente y no expirada.

1. Deslizar el control de aceptar hasta el extremo.
2. Repetir soltándolo antes del umbral.
3. Probar una respuesta después de expirar la oferta.

**Resultado esperado:** Solo completar el gesto acepta la oferta. Si se suelta antes, el control vuelve al inicio. Una oferta expirada no se puede aceptar.

### QA-PRO-REQ-03 — Rechazar y siguiente oferta

**Prioridad:** Alta  
**Precondición:** Dos o más solicitudes pendientes recibidas por el profesional.

1. Rechazar la primera oferta.
2. Revisar la siguiente solicitud disponible.
3. Aceptar una oferta y comprobar que las demás se retiran cuando el servidor confirma al ganador.

**Resultado esperado:** Rechazar no acepta la reserva. Las ofertas siguen la cuenta atrás del servidor y no se puede aceptar una reserva que otro profesional ya haya ganado.

### QA-PRO-REQ-04 — Push con app en segundo plano

**Prioridad:** Alta  
**Precondición:** Dispositivo físico con permisos push y credenciales APNs/FCM configuradas; webhook inmediato o scheduler sub-minute habilitado.

1. Poner la app en segundo plano y generar una solicitud.
2. Comprobar sonido, vibración, prioridad y texto con cliente/servicio.
3. Tocar la notificación y comprobar que abre el espacio de solicitudes.

**Resultado esperado:** La alerta llega antes de que venza la ventana de 45 segundos. El canal de notificaciones urgente está habilitado en Android y la presentación de iOS se valida en un dispositivo real.


### QA-PRO-REQ-06 — Confirmación obligatoria de herramientas y materiales

**Prioridad:** Crítica  
**Precondición:** Oferta entrante pendiente y no expirada.

1. Abrir la oferta y comprobar que la confirmación aparece en el mismo popup, antes del control deslizante.
2. Intentar deslizar para aceptar sin marcar la casilla.
3. Comprobar vibración, movimiento breve del bloque y resaltado del check con un mensaje explicativo.
4. Marcar la casilla y comprobar el estado visual confirmado.
5. Deslizar para aceptar y consultar `booking_requests.materials_confirmed_at`.
6. Intentar llamar al RPC antiguo de dos parámetros como usuario autenticado y comprobar que no tiene permiso.
7. Intentar llamar al nuevo RPC con `p_materials_confirmed = false`.

**Resultado esperado:** Sin marcar el check, la app no envía la aceptación y el servidor rechaza cualquier intento de aceptación sin confirmación. Al aceptar correctamente, el servidor registra la fecha de confirmación en esa solicitud concreta. La confirmación del perfil profesional no sustituye esta acción por viaje.


### QA-PRO-REQ-07 — Gestos diferenciados para aceptar y rechazar

**Prioridad:** Alta  
**Precondición:** Oferta entrante pendiente y confirmación de materiales marcada.

1. Deslizar el control de aceptación lentamente desde el inicio y comprobar que el carril negro se rellena progresivamente en verde, siguiendo el desplazamiento.
2. Soltar antes del umbral: el control debe volver suavemente al inicio y no aceptar.
3. Continuar el gesto hasta el umbral: el texto debe cambiar a «ACEPTAR TRABAJO» y completar la aceptación.
4. En otra oferta, mantener pulsado el botón rojo de rechazo durante menos de dos segundos y soltar: la cuenta atrás se cancela y la solicitud permanece pendiente.
5. Mantener pulsado durante dos segundos: mostrar la cuenta atrás 2–1, emitir vibración háptica durante el gesto y rechazar al completar el tiempo.
6. Repetir ambos gestos con la oferta expirada o mientras se envía una respuesta.

**Resultado esperado:** Aceptar requiere deslizar; rechazar requiere mantener pulsado dos segundos. Los gestos no se confunden, no se ejecutan al soltar antes de tiempo y quedan deshabilitados cuando la oferta expira o hay una respuesta en curso.


### QA-PRO-REQ-08 — Mapa y ubicación exacta del servicio en la oferta

**Prioridad:** Alta  
**Precondición:** Oferta pendiente con dirección y coordenadas del cliente.

1. Abrir la oferta y comprobar que el servicio, modalidad, fecha, duración y dirección aparecen antes de las acciones.
2. Verificar que el mapa muestra un marcador en las coordenadas `client_lat/client_lng` de la reserva.
3. Comprobar que el mapa no usa la ubicación del profesional ni una coordenada aproximada inventada.
4. Abrir una solicitud sin coordenadas y comprobar que se muestra un estado alternativo, sin colocar un pin ficticio.
5. Verificar que la RPC solo devuelve las coordenadas de las solicitudes pendientes del profesional autenticado.

**Resultado esperado:** El profesional identifica visualmente el punto de prestación del servicio antes de confirmar materiales y aceptar o rechazar. Si no hay coordenadas, la interfaz lo indica con claridad y conserva la dirección textual.


### QA-CLI-06 — Acceso directo al chat desde seguimiento

**Prioridad:** Alta  
**Precondición:** Cliente con una reserva en estado `en_route`, profesional asignado y conversación habilitada.

1. Abrir el seguimiento de esa reserva desde Mis reservas.
2. Pulsar «Contactar por el chat de Klipp».
3. Comprobar que se abre Mis reservas con el chat de esa misma reserva desplegado, sin tener que buscarla.
4. Verificar que aparecen los últimos mensajes ordenados y que no se duplican al recibir el mismo mensaje por Realtime.
5. Enviar un mensaje y comprobar que se guarda asociado a la reserva correcta.
6. Cambiar el estado de la reserva a `arrived` o `completed` y verificar que el mapa/ETA anterior deja de mostrarse.

**Resultado esperado:** El CTA abre la conversación correspondiente, conserva el aislamiento por reserva y no deja datos de ubicación o ETA antiguos visibles cuando el servicio deja de estar en camino.


### QA-CLI-07 — Reintento seguro al crear una reserva

**Prioridad:** Crítica  
**Precondición:** Cliente autenticado, servicio y modalidad válidos, ubicación y horario disponibles.

1. Pulsar dos veces rápidamente «Solicitar servicio» y comprobar que solo se crea una reserva.
2. Repetir una vez en modo «Cerca de mí» inmediato y comprobar que no aparecen dos solicitudes para el mismo envío.
3. Simular una interrupción de red durante la llamada que crea la reserva, incluyendo el caso en que Supabase devuelve un error de transporte en `result.error` en lugar de lanzar una excepción.
4. Comprobar que la interfaz no invita a volver a enviar la solicitud y ofrece abrir Mis reservas para verificar el resultado.
5. Simular un error SQL de validación devuelto por el RPC y comprobar que se muestra el mensaje del servidor y que el cliente puede corregir los datos e intentarlo de nuevo.
6. Simular una respuesta HTTP 5xx o una respuesta sin código SQL identificable y comprobar que se trata como resultado incierto.
7. Simular un error al iniciar el despacho automático después de crear correctamente la reserva y comprobar que el mensaje informa de que la solicitud ya existe y puede seguirse desde Mis reservas.

**Resultado esperado:** Una doble pulsación no ejecuta dos envíos concurrentes. Si el resultado del envío es incierto por un corte de red, la app no permite un reintento ciego que pueda duplicar la reserva; guía al cliente a comprobar primero el estado persistido. Un error explícito del servidor deja disponible el reintento una vez corregidos los datos.
