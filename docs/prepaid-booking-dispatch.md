# Modelo de reservas prepago y asignación tipo Uber

## Decisión de producto: precio profesional, no tarifa central

Cada profesional define sus propios precios al registrarse y puede actualizarlos desde su configuración. Klipp no sustituye esas tarifas por un precio fijo impuesto por la plataforma.

La base de datos ya contempla:
- `pro_services.base_price_dop`: precio del profesional para servicios sin variantes.
- `pro_service_tier_prices.price_dop`: precio propio del profesional para cada variante.
- `get_auto_service_price_estimate`: rango indicativo (mínimo/máximo) de profesionales que cubren una ubicación.

El cliente debe ver dos niveles de precio, como en Uber:

1. **Búsqueda / descubrimiento:** importe aproximado o rango de precios calculado con tarifas reales de profesionales activos que cubren esa zona y variante. Nunca usar el precio genérico de `pricing_tiers` como si fuera la tarifa final.
2. **Ventana de reserva / confirmación:** importe final exacto, asociado a un profesional concreto (elegido por el cliente o recomendado/preseleccionado por Klipp). Mostrar el profesional, servicio/variante, duración y total DOP antes del botón de confirmar y pagar.

Al confirmar, el backend vuelve a consultar la tarifa activa del profesional y crea un snapshot inmutable en la reserva: `pro_id`, `pro_service_id`, `price_dop`, `est_minutes`, `commission_pct`, `commission_dop`, `pro_payout_dop`, variante y hora. Si la tarifa cambió entre la pantalla y la confirmación, devolver el nuevo importe y pedir aceptación expresa; nunca cobrar un importe distinto al que el cliente vio.

## Modalidades de asignación

- **Profesional elegido:** la cotización final procede de la tarifa vigente de ese profesional. Tras el pago verificado, se le envía la oferta.
- **Cerca de mí / asignación automática:** búsqueda muestra un rango. Antes del checkout, Klipp selecciona un profesional candidato según cobertura, disponibilidad, ETA/distancia y ranking; la pantalla de confirmación muestra el nombre y su precio exacto. Tras el pago, la primera oferta va a ese profesional.
- Si el profesional recomendado rechaza o deja vencer la oferta, Klipp no puede cambiar silenciosamente el precio. Puede buscar otro profesional con exactamente el mismo precio, o solicitar al cliente que acepte una nueva cotización antes de cobrar cualquier diferencia. Si no hay alternativa aceptable, se aplica la política de cancelación/reembolso.

Así se conserva el flujo prepago sin que un profesional acepte una reserva a un precio distinto del mostrado y aceptado por el cliente.

## Ciclo de reserva

1. Cliente selecciona servicio, variante, ubicación y hora.
2. Klipp muestra rango aproximado usando tarifas profesionales activas y disponibilidad en la zona.
3. Klipp resuelve el profesional concreto y consulta su tarifa exacta.
4. Cliente ve y acepta el precio final y las condiciones.
5. Backend crea la reserva en `payment_pending`, con snapshot de precio y ventana de pago de 10 minutos. No se envían ofertas ni se activa el despacho.
6. El cliente paga mediante AZUL alojado.
7. Solo un callback AZUL firmado y verificado puede pasar el pago a `held` y la reserva a `requested`.
8. Se crea la oferta para el profesional ya cotizado. La aceptación confirma el servicio; no modifica el precio ni el payout.
9. Para reservas programadas, el profesional se cotiza antes del pago y la oferta se activa en la ventana programada; si ya no está disponible, se vuelve a cotizar y se pide consentimiento si cambia el importe.

## Comisión y liquidación

- Comisión Klipp: 7 % del importe final aceptado.
- Payout profesional: 93 % antes de ajustes fiscales/contractuales.
- La comisión y el payout se calculan en backend y se guardan como snapshot.
- Un cambio futuro de tarifa del profesional no modifica una reserva ya confirmada.
- `held` es un estado interno; no implica que AZUL ofrezca escrow o split settlement. Confirmar con AZUL captura, preautorización, liquidación, reembolsos y contracargos.

## Estados de negocio

| Reserva | Significado |
| --- | --- |
| `payment_pending` | Cotización aceptada; esperando pago. Sin oferta/despacho. |
| `requested` | Pago verificado; oferta pendiente o búsqueda en curso con precio bloqueado. |
| `scheduled` | Profesional ha aceptado la oferta y la reserva está confirmada. |
| `en_route`, `arrived`, `in_progress` | Ejecución del servicio. |
| `completed`, `confirmed` | Servicio terminado y confirmado. |
| `cancelled`, `disputed`, `expired` | Resolución/cierre según política. |

Pago:
- `pending`: intento creado.
- `held`: aprobación verificada por backend.
- `released`: liquidación/payout conciliado.
- `refunded`: devolución confirmada.
- `failed`: pago rechazado o fallido.

## Motor de asignación

La modalidad inmediata y programada utiliza las mismas reglas de elegibilidad. Cambia únicamente cuándo se activa la oferta.

- Verificar `payments.status = 'held'` y reserva `requested`.
- Profesional activo, aprobado, con servicio y variante exactos, tarifa activa, política de equipamiento aceptada, cobertura y disponibilidad.
- Para servicios inmediatos: online y GPS reciente. Para programados: disponibilidad declarada y reconfirmación antes de enviar oferta.
- Comprobar duración real del profesional, margen de desplazamiento de 60 minutos y conflictos de agenda.
- Ordenar por ETA cuando exista proveedor de rutas; fallback a distancia, valoración y rendimiento.
- No enviar oferta a un profesional cuya tarifa difiera del precio bloqueado de la reserva.
- Si no existe candidato al mismo precio, solicitar nueva aceptación del cliente o iniciar cancelación/reembolso. No sobrescribir `price_dop`.
- La aceptación es atómica: asigna una sola vez, conserva el snapshot financiero y cierra ofertas competidoras.

## Reservas programadas

- No bloquear profesional durante todo el periodo entre compra y prestación.
- Cotizar y mostrar el precio final antes del pago, pero programar la oferta para la ventana de asignación.
- Antes de enviar la oferta, reconfirmar cobertura, disponibilidad, presencia y tarifa.
- Si el profesional ya no puede atender, buscar una alternativa con el mismo precio o pedir consentimiento para la nueva cotización.
- Si no hay alternativa, aplicar cancelación/reembolso; nunca cambiar el importe pagado sin consentimiento.

## Cancelaciones y reembolsos

Antes de producción hay que definir y publicar política para cancelación del cliente, cancelación/no-show profesional, ausencia de oferta, reasignación, reembolso parcial/total, contracargos y disputas. Reembolsos deben ser idempotentes y confirmados por AZUL.

## Seguridad e idempotencia

- Precio, moneda, comisión y payout calculados en backend.
- El cliente no puede marcar un pago aprobado ni llamar a dispatch directamente.
- Validar firma, orden, importe exacto, moneda, comercio y código de respuesta.
- Callbacks duplicados idénticos son idempotentes; callbacks contradictorios se rechazan.
- Ningún despacho antes del pago verificado.
- No guardar PAN, CVV ni fecha de expiración.
- Toda modificación de tarifa posterior a la reserva afecta solo a nuevas cotizaciones.

## Plan de implementación

1. Adaptar RPCs de cotización y creación para profesional concreto y snapshot de precio.
2. Crear flujo de preselección de candidato para «Cerca de mí» y precio final visible antes del checkout.
3. Asegurar que ninguna oferta se crea hasta que AZUL confirma el pago.
4. Cambiar aceptación para que nunca recalcule ni cambie el precio cobrado.
5. Conectar checkout alojado AZUL y callback firmado.
6. Adaptar UI cliente, profesional, reservas programadas y panel de operaciones.
7. Probar cambios concurrentes de tarifa, rechazo del primer candidato, sustitución con precio distinto, callbacks y reembolsos en QA.

No activar pagos reales hasta completar homologación AZUL, pruebas de extremo a extremo y políticas comerciales/legales.


## Implementación QA — estado actual

La rama de trabajo implementa:
- `get_auto_service_quote`: elige un profesional concreto elegible y devuelve su precio y duración reales para la pantalla de confirmación.
- `create_prepaid_booking_at_location` y `create_prepaid_tier_booking_at_location`: exigen el precio y duración que vio el cliente; si la tarifa cambió, la transacción falla y la app debe volver a cotizar.
- Los RPC inferiores de creación sin precio esperado quedan revocados a clientes autenticados.
- La reserva nace en `payment_pending` con una ventana de 10 minutos y sin ofertas.
- La aprobación AZUL verificada activa la reserva y envía la primera oferta al profesional cotizado.
- La aceptación comprueba pago `held` y tarifa/duración coincidentes; no reescribe precio, comisión ni payout.
- En asignación automática, un rechazo/vencimiento libera al primer profesional y busca alternativas con el mismo precio y duración. Una tarifa diferente no recibe oferta.

**QA Sandbox:** validada transacción completa con cotización, rechazo de precio manipulado, creación sin oferta anticipada, intento de pago idempotente, callback aprobado, oferta posterior al pago y aceptación sin alterar el precio. También se probó rechazo y sustitución por profesional con la misma tarifa, y se comprobó que una tarifa distinta no recibe oferta. Todos los datos sintéticos se revirtieron.

**Pendiente:** integración de checkout alojado AZUL y su Edge Function de firma/callback real, navegación de pago en la app, expiración programada, pruebas E2E en dispositivos y certificación de AZUL. No aplicar a producción hasta cerrar esos puntos.
