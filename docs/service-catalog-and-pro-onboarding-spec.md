# Klipp — Catálogo de servicios y registro profesional

Fecha: 2026-11-05  
Estado: propuesta funcional y de datos para implementar en la rama `fix/auth-ui-klipp-services`.

## Decisión de producto

- Cada cuenta Klipp PRO tiene **una profesión/servicio principal activo**.
- El profesional puede configurar varias modalidades dentro de esa profesión (por ejemplo, un barbero puede ofrecer corte, barba y afeitado), pero no puede anunciarse simultáneamente como barbero, peluquero y técnico.
- El cliente reserva **un servicio por solicitud**. Las variantes y respuestas de esa solicitud pertenecen a ese servicio.
- El registro debe ser progresivo dentro de una sola pantalla: elegir profesión, completar solo sus campos, configurar modalidades y tarifas, cobertura, disponibilidad y cuenta.
- El catálogo, las opciones, los requisitos y las tarifas son datos de base de datos; no deben depender de etiquetas o precios escritos a mano en la interfaz.
- Los profesionales llevan sus propias herramientas, equipos, productos y consumibles. La interfaz debe mostrar los requisitos aplicables y recoger una aceptación explícita.

## Catálogo y formularios por profesión

### Barbería a domicilio (`barberia`)
- Modalidades configurables: corte clásico, degradado/fade, arreglo de barba, afeitado y diseño de cejas (si se habilita en catálogo).
- Por modalidad: precio DOP y duración estimada.
- Detalles de perfil: estilos dominados y años de experiencia (el campo general de experiencia se reutiliza).
- Requisitos propios: máquina, tijeras/peines, capa limpia, hojas desechables y desinfección.
- No preguntar por habitaciones, metros cuadrados ni datos de peluquería.

### Peluquería a domicilio (`peluqueria`)
- Modalidades: corte, lavado/secado, peinado, coloración, tratamientos capilares y trenzas (cada una activable según catálogo).
- Por modalidad: precio y duración; para coloración/tratamientos se debe indicar si el precio es desde o requiere valoración previa.
- Detalles relevantes: longitudes de cabello atendidas y servicios que requieren consulta previa.
- Requisitos: secador/herramientas térmicas, tijeras, peines, capa, productos capilares y protección térmica.

### Estética a domicilio (`estetica`)
- Modalidades configurables: manicura, pedicura, maquillaje, cejas/pestañas, depilación y tratamientos estéticos no médicos.
- Por modalidad: precio y duración.
- Detalles: técnicas ofrecidas, si trabaja con productos propios y notas de preparación del cliente.
- Requisitos: instrumental, cosméticos, aplicadores desechables e higiene/desinfección.
- No incluir masajes; el servicio de masajes permanece inactivo y oculto.

### Carwash a domicilio (`carwash`)
- Modalidades: lavado exterior, limpieza interior, lavado completo y aspirado (según catálogo).
- Precio por modalidad y clase de vehículo: automóvil, SUV/crossover y pickup/vehículo grande.
- Detalles operativos: si lleva solución autónoma de agua y energía; nunca depender de herramientas o productos del cliente.
- Requisitos: equipo portátil, productos automotrices, microfibras, cubos y aspiradora cuando se anuncie.

### Detailing a domicilio (`detailing`)
- Modalidades: detailing interior, exterior, pulido, encerado/protección y limpieza profunda de tapicería.
- Precio y duración por modalidad; los trabajos de corrección o protección avanzada pueden marcarse como “desde” o “requiere valoración”.
- Detalles: tipos de vehículo atendidos y alcance de los trabajos.
- Requisitos: pulidora cuando corresponda, pads, microfibras, productos específicos, equipo de secado y protección personal.

### Limpieza regular (`limpieza_regular`)
- Mantener variantes por tamaño de vivienda (habitaciones/baños) y tarifa por variante.
- Detalles: áreas incluidas, frecuencia disponible y si acepta viviendas ocupadas o vacías.
- Requisitos: aspiradora, mopa/cubo, paños, cepillos, productos, guantes y bolsas propios.

### Limpieza profunda (`limpieza_profunda`)
- Mantener variantes por tamaño de vivienda y tarifa por variante.
- Detalles: alcance incluido, áreas de mayor intensidad y tareas que requieren presupuesto adicional.
- Requisitos: equipo y productos de limpieza profunda, consumibles y protección propios.

### Limpieza de oficinas (`limpieza-oficinas`)
- Datos: rango de metros cuadrados, número de baños/puestos, frecuencia (puntual, semanal, varias veces por semana) y franjas horarias.
- Precio: tarifa por tamaño/frecuencia o solicitud de valoración si el alcance no es estándar.
- Requisitos: aspiradora, útiles de suelo, paños, productos, bolsas, guantes y consumibles propios.

### Mantenimiento técnico (`mantenimiento`)
- Especialidades seleccionables: plomería, electricidad, montaje de muebles, pintura y reparaciones generales (cada una habilitada por catálogo).
- Datos: tipos de trabajo aceptados, experiencia por especialidad, herramientas disponibles y si requiere visita de valoración.
- Precio: visita/diagnóstico y mano de obra; materiales y repuestos se presupuestan aparte y requieren aprobación del cliente antes de comprarse.
- Requisitos: herramientas manuales/eléctricas, instrumentos de medición y protección personal.
- No presentar trabajos regulados o de riesgo como disponibles sin requisitos y revisión de Klipp.

## Experiencia de registro

1. **Profesión principal**: selector de opción única (radio cards), con nombre y descripción claros.
2. **Detalles del servicio**: formulario dinámico basado en el servicio seleccionado. Solo aparecen preguntas relevantes.
3. **Modalidades y tarifas**: activar una o más modalidades dentro de la profesión elegida; cada una tiene precio y duración o regla de valoración.
4. **Herramientas y materiales**: checklist informativo por profesión y aceptación explícita de que el profesional lleva su propio equipo.
5. **Zona y disponibilidad**: ubicación, radio, días y horarios.
6. **Cuenta y revisión**: credenciales, resumen y confirmación. El perfil queda pendiente de verificación; no recibe solicitudes hasta cumplir las reglas de aprobación y equipamiento.

Validación: no permitir enviar si no hay profesión, modalidad/precio requerido, campos obligatorios, cobertura válida, horario o aceptación de equipamiento. Mantener valores al corregir errores.

## Modelo de datos objetivo

Tablas existentes que se reutilizan:
- `service_categories`, `service_types`: catálogo de categorías y profesiones.
- `pro_profiles`: datos generales, cobertura, transporte, experiencia, estado de verificación y aceptación de equipamiento.
- `pro_availability`: franjas semanales.
- `pro_services`: una fila activa por profesional y profesión principal.
- `pro_service_tier_prices`: tarifas por variante cuando aplique.
- `bookings`: una profesión y una modalidad por reserva.

Extensiones necesarias:
- `service_form_fields`: definición de campos por `service_type_id` (clave, etiqueta, tipo, requerido, opciones, ayuda y orden). Esto permite que el formulario sea configurable desde catálogo.
- `pro_services.details jsonb`: respuestas estructuradas del formulario específico del profesional.
- `service_options`: modalidades que puede elegir el cliente dentro de una profesión (corte, barba, lavado exterior, etc.).
- `pro_service_option_prices`: precio, duración y tipo de tarifa por modalidad ofrecida por cada profesional.
- `bookings.service_option_id` y `bookings.service_details jsonb`: modalidad y respuestas concretas de la solicitud, conservadas como snapshot para el historial.
- `service_equipment_requirements`: equipamiento requerido por profesión; tabla referenciada por el perfil PRO y por el checklist de registro.

Reglas de integridad:
- Índice único parcial para impedir más de una fila activa en `pro_services` por `pro_id`.
- Claves foráneas entre profesión, opciones, tarifas, profesional y reserva.
- RLS: un profesional solo crea/edita sus datos; el catálogo activo es legible; los datos públicos de perfil no exponen documentos ni datos privados.
- Guardar el alta completa de forma atómica. No dejar la configuración del profesional únicamente en `auth.users.raw_user_meta_data` ni depender de que después visite “Mi perfil” y pulse Guardar.
- Guardar en la reserva el precio, duración, modalidad y detalles aceptados para que futuros cambios de tarifa no alteren reservas antiguas.

## Desincronización detectada antes de implementar

En la base Supabase activa `hxjwibtpxgpdxemqqwjh` no aparecen `service_equipment_requirements` ni `pro_portfolio`, aunque el código actual de Mi perfil consulta ambas. El historial de migraciones también muestra huecos respecto a los archivos versionados (entre ellos estándares de equipamiento y portfolio). Hay que reconciliar migraciones pendientes de forma controlada antes de desplegar el nuevo flujo; no aplicar todas a ciegas.

## Criterios de aceptación

- Un profesional no puede seleccionar dos profesiones principales, ni desde la interfaz ni saltándose la interfaz.
- Cada profesión presenta únicamente sus campos, opciones y requisitos.
- Se pueden activar varias modalidades dentro de una sola profesión.
- Cada modalidad tiene tarifa y duración o una regla explícita de valoración.
- El alta persiste perfil, profesión, detalles, tarifas, cobertura y disponibilidad aunque Auth requiera confirmar el correo.
- El cliente solo reserva una modalidad por solicitud y el precio queda congelado en la reserva.
- Las políticas RLS impiden consultar o modificar datos privados de otros profesionales.
