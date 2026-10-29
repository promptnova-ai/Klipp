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
