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

### QA-PRO-02 — Selección de servicios y tarifas

**Prioridad:** Alta  
**Precondición:** Estar en el paso de servicios del registro profesional.

1. Continuar sin seleccionar servicios.
2. Seleccionar una especialidad y dejar el precio vacío.
3. Introducir un precio positivo en RD$ y una duración positiva en minutos.
4. Seleccionar una segunda especialidad y completar sus propios valores.

**Resultado esperado:** No se avanza sin al menos un servicio y sin precio y
duración válidos para cada servicio seleccionado. Cada servicio conserva su
precio y duración independientes.

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
