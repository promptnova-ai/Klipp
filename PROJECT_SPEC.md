# Klipp — especificación funcional vigente

> Última revisión: 6 de noviembre de 2026  
> Mercado inicial: República Dominicana · Moneda: DOP  
> Este documento refleja las decisiones funcionales y el comportamiento actual del producto. No sustituye la documentación de despliegue ni las condiciones contractuales de proveedores externos.

## 1. Producto

Klipp es una plataforma de servicios presenciales a domicilio, con una experiencia de reserva y seguimiento inspirada en las aplicaciones de movilidad. Conecta clientes con profesionales independientes y permite elegir un profesional concreto o solicitar asignación automática por cercanía.

El piloto inicial se concentra en Santo Domingo y su área metropolitana. La cobertura comercial debe ampliarse de forma controlada, no suponerse nacional desde el primer día.

## 2. Roles

- **Cliente:** elige el servicio y su modalidad, define la ubicación y horario, reserva, paga dentro de la aplicación cuando la pasarela esté habilitada y sigue el servicio.
- **Klipp PRO:** profesional independiente que ofrece una sola profesión principal, configura sus modalidades, precios, duración, cobertura y disponibilidad, y recibe solicitudes.
- **Administración:** verifica profesionales, gestiona el catálogo, soporte, incidencias y configuración operativa. Los permisos de personal se gestionan mediante RBAC; las acciones sensibles quedan auditadas.

## 3. Catálogo de servicios

El catálogo activo tiene nueve profesiones y cuarenta modalidades:

- Limpieza regular.
- Limpieza profunda.
- Barbería a domicilio.
- Peluquería a domicilio.
- Estética a domicilio.
- Carwash a domicilio.
- Detailing a domicilio.
- Limpieza de oficinas.
- Mantenimiento técnico.

Masajes está excluido del catálogo.

El cliente selecciona **una profesión y una modalidad concreta** antes de elegir cómo encontrar profesional. Las modalidades son específicas de cada profesión; no se debe mostrar un precio genérico de catálogo como si fuera el importe final.

## 4. Registro y perfil Klipp PRO

Cada cuenta profesional puede publicar exactamente una profesión principal. El alta recoge:

- Datos de contacto, descripción, experiencia y medio de transporte.
- Detalles específicos de la profesión.
- Las modalidades que ofrece, cada una con su propio precio en DOP y duración estimada.
- Centro y radio geográfico de cobertura.
- Días y horarios de disponibilidad.
- Aceptación expresa del compromiso de llevar sus propias herramientas, equipos, productos y materiales.

El profesional debe trabajar con sus propios medios. No debe depender de herramientas, productos ni materiales del cliente.

El onboarding se valida y persiste en una operación de base de datos vinculada al alta de Auth. Un registro profesional incompleto no debe crear un perfil publicable. La aceptación de equipamiento queda registrada y se exige tanto para descubrimiento manual como para asignación automática.

El profesional puede editar y publicar/despublicar sus modalidades sin cambiar su profesión principal. Los cambios de tarifa deben quedar asociados a la modalidad correspondiente.

## 5. Reserva del cliente

Flujo previsto:

1. Elegir profesión y modalidad.
2. Introducir o seleccionar la ubicación del servicio.
3. Elegir fecha y hora, o solicitar disponibilidad inmediata cuando corresponda.
4. Elegir una de dos opciones:
   - **Elegir profesional:** muestra profesionales elegibles para esa modalidad, con su tarifa y duración exactas.
   - **Cerca de mí:** solicita asignación automática a profesionales cercanos y disponibles.
5. Revisar la información de la reserva y confirmar la solicitud.
6. Si el profesional acepta, confirmar el precio exacto antes de pasar al pago.

La ubicación del cliente es voluntaria: Klipp no debe abrir el diálogo GPS al entrar en Inicio, Direcciones o Nueva reserva. Se solicita solo después de que la persona pulse una acción explícita para compartir o detectar su ubicación. El cliente también debe poder introducir o ajustar manualmente el punto del servicio.

## 6. Precios y comisión

- El profesional define el precio y la duración de cada modalidad.
- Los valores de catálogo con precio cero son marcadores de configuración, no precios cobrables.
- En selección manual se muestra la tarifa exacta del profesional para la modalidad elegida.
- En asignación automática se calcula un rango estimado usando tarifas reales de profesionales elegibles que cubren la ubicación.
- Al aceptar una solicitud, el backend vuelve a comprobar y guarda la tarifa y duración del profesional seleccionado. El cliente debe aceptar ese importe antes de pagar.
- La comisión configurada actualmente es del **7 %**. El backend calcula comisión y liquidación; la aplicación cliente no puede decidir estos importes.

Los importes, la duración, la comisión y el profesional asignado se validan y guardan en el servidor. Nunca se confía en importes enviados por el dispositivo.

## 7. Asignación automática «Cerca de mí»

Los candidatos deben cumplir simultáneamente:

- Perfil activo y aprobado.
- Aceptación vigente del compromiso de equipamiento.
- Profesión y modalidad exactas, con tarifa activa.
- Cobertura geográfica del punto solicitado.
- Presencia online y ubicación reciente.
- Disponibilidad para la duración publicada, sin solapamientos ni margen de desplazamiento incompatible.
- Preferencia por cercanía; después se consideran valoración y trabajos completados.

Klipp ofrece solicitudes individuales con cuenta atrás de **45 segundos**. El primer grupo puede incluir hasta cinco profesionales. Si una solicitud vence o se rechaza, el sistema avanza al siguiente grupo sin crear rondas concurrentes. Una aceptación válida bloquea las demás ofertas y conserva la tarifa exacta del profesional aceptante.

La interfaz del profesional debe distinguir claramente una solicitud nueva, el tiempo restante, el servicio/modalidad, la ubicación, la duración y el importe que recibirá. Debe permitir aceptar o rechazar y exigir confirmación de que llevará sus propios materiales antes de aceptar.

## 8. Estados, seguimiento y comunicación

El ciclo de reserva incluye solicitud, aceptación pendiente de pago, reserva confirmada, profesional en camino, llegada, servicio en curso, finalización y confirmación del cliente. También existen estados laterales para cancelaciones, incidencias y expiración.

- El seguimiento GPS del profesional se comparte solo durante el desplazamiento asociado a una reserva activa.
- El cliente ve mapa, última actualización y ETA cuando estén disponibles.
- Las notificaciones in-app son independientes del envío push. El dispatcher procesa ofertas, recordatorios y actualizaciones de ETA.
- El contacto entre las partes se mantiene dentro de Klipp. No se debe exponer el teléfono personal como canal alternativo de contacto.

## 9. Pagos

El objetivo de producto es cobrar dentro de Klipp mediante la página alojada de **AZUL**, sin capturar ni almacenar datos de tarjeta en la aplicación o en el backend propio.

El flujo seguro está definido en [Integración de pagos AZUL](docs/payments-azul-integration.md): el backend crea el intento con el importe de la reserva, genera la solicitud firmada y valida la respuesta HMAC de AZUL antes de confirmar el pago y la reserva. Un retorno del navegador no constituye por sí solo prueba de pago.

**Los pagos reales no están habilitados todavía.** Faltan afiliación, credenciales, certificación de AZUL, validación de callbacks y pruebas de conciliación/reembolso. No se debe simular un cobro ni marcar una reserva como pagada sin una respuesta verificada.

## 10. Seguridad y datos

- Supabase Auth, PostgreSQL, PostGIS, RLS, Realtime, Storage y Edge Functions.
- Ninguna clave de service role, secreto de cron, clave privada de mapas o credencial AZUL dentro del cliente.
- El rol anónimo solo necesita leer el catálogo público de profesiones, modalidades y requisitos de herramientas. No debe acceder a perfiles privados, reservas, pagos, mensajes, ubicaciones ni notificaciones.
- Las funciones SECURITY DEFINER deben tener `search_path` controlado y comprobar identidad/permiso dentro de la función.
- Los documentos de identidad permanecen en almacenamiento privado.
- Las ubicaciones y datos personales solo se muestran a participantes autorizados y durante el propósito operativo correspondiente.

## 11. Estado de validación y condiciones para el piloto

A fecha de revisión:

- El catálogo de producción contiene 40 modalidades en 9 profesiones activas.
- La lectura anónima de las modalidades y los requisitos de herramientas está probada; no hay permisos de escritura anónimos.
- El onboarding profesional se ha probado de forma transaccional en QA: perfil, profesión, tarifa, cobertura, equipamiento y disponibilidad se crean juntos y se revierten al terminar la prueba.
- En QA se han probado cinco ofertas simultáneas, el avance al siguiente candidato y la aceptación con cálculo de comisión del 7 %.
- La compilación TypeScript, el lint dirigido a las pantallas modificadas, las pruebas Deno, el chequeo de Edge Functions y la exportación web han pasado en CI.
- El despliegue web de producción más reciente consultado está en estado READY.

**No está listo para un lanzamiento comercial todavía:** producción no tiene tarifas profesionales activas, reservas ni pagos registrados; hay un perfil aprobado que todavía no ha aceptado el compromiso de equipamiento ni configurado cobertura. Tampoco se ha completado la prueba real de pago AZUL ni la validación de push en dispositivos físicos.

Antes de abrir el piloto deben completarse, como mínimo, el onboarding real de profesionales, la verificación documental, la prueba manual y automática con cuentas controladas, la certificación de pagos, la prueba de cancelaciones/reembolsos y la validación de ubicación/notificaciones en Android e iOS.

## 12. Principios de desarrollo

1. Cambios de esquema mediante migraciones SQL versionadas.
2. Probar primero en QA; no usar clientes ni datos reales para pruebas.
3. Cubrir precios, disponibilidad, asignación, transiciones de estado, permisos y pagos con pruebas.
4. No habilitar una funcionalidad financiera o de localización hasta validar backend, permisos y experiencia de usuario.
5. Mantener esta especificación y los escenarios de QA alineados con el comportamiento real del código y la base de datos.
