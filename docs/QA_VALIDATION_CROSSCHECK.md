# Klipp — Cruce de validación QA

**Corte:** 20 de noviembre de 2026  
**Rama:** `feat/uber-airbnb-onboarding-rebuild-20261120`  
**Propósito:** contrastar la lista manual de `QA_SCENARIOS.md` con el trabajo realizado en la rama.  
**Regla de evidencia:** implementar código o documentar un escenario no equivale a ejecutar una prueba. Ningún caso se marca como aprobado sin evidencia reproducible del resultado.

## Resultado del cruce

Se identifican **52 escenarios** en `QA_SCENARIOS.md`. En esta iteración se revisaron estáticamente los cambios del onboarding progresivo cliente/PRO y sus componentes compartidos. No se ejecutaron sesiones E2E, pruebas en dispositivos físicos ni pentest automatizado. Por tanto, no se declara ningún escenario como aprobado.

| ID | Escenario | Estado verificable |
|---|---|---|
| QA-SEC-01 | Privilegios del rol anónimo | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-01 | Validación del formulario profesional | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-01A | Medio de traslado del profesional | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-02 | Profesión única, detalles y tarifas por modalidad | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-02A | Catálogo de modalidades antes de crear la cuenta | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-03 | Centro GPS, pin y radio de cobertura | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-04 | Permiso de ubicación denegado | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-05 | Registro, correo y reingreso | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-05A | Compromiso de herramientas y materiales | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-06 | Guardado del perfil profesional | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-01 | Permiso GPS y dirección detectada | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-02 | Ubicación del cliente fuera de cobertura | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-03 | Disponibilidad por fecha y hora | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-04 | Crear reserva con ubicación e indicaciones | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-04A | Seguimiento en pantalla completa cuando va en camino | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-05 | Reserva automática sin profesional elegible | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-OPS-01 | Permisos y errores de red | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-01 | Precio independiente por variante | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-02 | Rango estimado de Cerca de mí | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-03 | Precio definitivo al aceptar | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-04 | Comisión de Klipp del 7% | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-05 | Servicio sin variantes en asignación automática | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRC-06 | Oferta con tarifa individual del profesional | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-04 | Expiración real y desconexión por oferta no respondida | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-04A | Temporizador independiente por ronda | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-01 | Servicio desactivado y RPC heredado | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-02 | Servicio que cruza la medianoche | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-03 | Reserva aceptada pendiente de pago visible al profesional | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-04 | No despachar reservas vencidas | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-05 | Reasignación con tarifa propia del sustituto | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-06 | No reasignar sin tarifa de variante | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-07 | Conflicto calculado con la duración del sustituto | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-08 | Bloquear reasignación con fondos retenidos | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-09 | Despacho concurrente sin ofertas solapadas | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-10 | Aceptación concurrente de dos ofertas incompatibles | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-BOOK-11 | Margen de desplazamiento de 60 minutos | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-05 | Cuenta atrás real de 45 segundos | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-01 | Alerta entrante tipo Uber | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-02 | Deslizar para aceptar | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-03 | Rechazar y siguiente oferta | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-04 | Push con app en segundo plano | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-06 | Confirmación obligatoria de herramientas y materiales | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-07 | Gestos diferenciados para aceptar y rechazar | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-PRO-REQ-08 | Mapa y ubicación exacta del servicio en la oferta | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-06 | Acceso directo al chat desde seguimiento | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-07 | Reintento seguro al crear una reserva | Pendiente de ejecución; sin evidencia registrada en esta revisión. |
| QA-CLI-08 | Idempotencia del alta de reserva prepaga | Implementación en la rama; prueba E2E pendiente. |
| QA-UI-01 | Recuperación de errores en bandejas de trabajo | Implementación revisada en código; prueba de red y recuperación pendiente. |
| QA-UI-02 | Liberación de controles después de fallos RPC | Implementación revisada en código; pruebas de fallo RPC pendientes. |
| QA-UI-03 | Consistencia de fichas de servicio, profesionales y reservas | Componentes implementados y escenario añadido; validación visual/dispositivo pendiente. |
| QA-UI-04 | Login y registro de cliente y profesional | Recorrido cliente de tres pasos y entrada dominicana implementados; pruebas E2E pendientes. OTP SMS real pendiente de configuración del proveedor. |
| QA-UI-05 | Onboarding profesional progresivo de siete pasos | Refactor de interfaz y validaciones implementado; prueba E2E transaccional pendiente. |
| QA-UI-06 | Componentes compartidos de onboarding y accesibilidad | Componentes nativos implementados; validación en dispositivos y lectores de pantalla pendiente. |

## Hallazgos de revisión por disciplina

- **Producto / UX:** la ficha de servicio diferencia precio orientativo y duración; la ficha profesional identifica tarifa base, valoración y distancia solo cuando hay datos válidos.
- **UI / accesibilidad:** se incorporan componentes reutilizables `KlippServiceCard` y `KlippProfessionalCard`; la selección de profesional expone el estado seleccionado como control de tipo radio. Falta verificar contraste y tamaño táctil en dispositivos.
- **Frontend:** Inicio cliente, resultados de búsqueda, selección de oferta y seguimiento usan la ficha profesional compartida; Mis reservas usa la superficie común `KlippCard`.
- **Datos:** las tarjetas consumen campos ya devueltos por `get_nearby_service_offers` y `get_client_booking_pro_cards`; no se añaden consultas ni se fabrican puntuaciones, distancias o tarifas.
- **Backend / seguridad:** esta iteración no cambia RPC, RLS, políticas ni migraciones. Los casos de autorización y concurrencia siguen requiriendo ejecución independiente.
- **QA:** se añadió `QA-UI-03` para comprobar estados ausentes, selección accesible y consistencia de precios. Los casos `QA-UI-01/02` tienen implementación revisada, pero no evidencia de ejecución.

## Bloqueos y límites

1. La prueba de tarjetas requiere al menos un profesional de QA aprobado con oferta, y un perfil sin foto o sin reseñas para validar fallbacks.
2. El chequeo de despliegue del nuevo commit debe terminar antes de considerar siquiera la validación de build. Un estado de despliegue correcto tampoco sustituye lint, TypeScript ni pruebas E2E.
3. No se ha probado Stripe real, no se han usado datos de clientes reales y no se ha tocado producción.
4. Para cerrar los escenarios críticos hacen falta cuentas sintéticas cliente/PRO, reservas sintéticas y evidencia sin datos personales.

## Criterio para cambiar un estado

- **Aprobado:** pasos ejecutados y resultado esperado observado, con evidencia segura.
- **Fallido:** discrepancia reproducible; registrar paso, resultado y log.
- **Bloqueado:** no se puede ejecutar por dependencia o entorno ausente.
- **Pendiente:** todavía no ejecutado.



## Anexo — Autenticación y registro

Se revisaron los componentes `auth-screen.tsx` y `pro-registration-screen.tsx`. La iteración visual actualiza la jerarquía del acceso, la cabecera de marca, las tarjetas de rol y la presentación del onboarding PRO. El registro cliente ahora solicita confirmar la contraseña y valida coincidencia antes de habilitar el envío.

**Limitación funcional importante:** el flujo conectado actualmente usa `signInWithPassword` y `signUp` de Supabase con correo y contraseña y confirmación por correo. No hay evidencia en el código revisado de un OTP SMS de seis dígitos ni de un flujo de autenticación telefónica RD (+1 809/829/849). No se debe presentar el teléfono como verificado ni simular un OTP en UI. QA-UI-04 debe mantenerse pendiente hasta ejecutar pruebas reales en QA y resolver esa brecha de producto/backend.


## Iteración onboarding progresivo — 20/11/2026

- Reemplaza el formulario de registro cliente por tres pasos: perfil, contacto y cuenta.
- Añade selector telefónico dominicano reutilizable para +1 con prefijos 809, 829 y 849.
- Separa el onboarding PRO en siete pasos: identidad, profesión, especialidad, tarifas/equipamiento, cobertura, disponibilidad y cuenta.
- Mantiene la profesión única y el payload que valida y persiste el trigger transaccional de alta profesional.
- Añade `OnboardingProgress`, `OnboardingChoiceCard` y `DominicanPhoneField` nativos, sin nuevas dependencias.
- Actualiza QA-UI-04 y añade QA-UI-05/06.

**Limitaciones verificables:** la captura de teléfono no es una verificación SMS. La autenticación sigue siendo correo/contraseña con confirmación por correo; el proveedor SMS y OTP real no están configurados ni probados. No se han ejecutado TypeScript, lint, pruebas E2E ni pruebas visuales/dispositivo en esta revisión.
