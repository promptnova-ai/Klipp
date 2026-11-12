# Modelo de reservas prepago y asignación tipo Uber

## Decisión de producto

Klipp funciona como plataforma de servicios bajo demanda. El cliente compra un servicio del catálogo a un precio cerrado y paga antes de que se active la búsqueda del profesional. El profesional acepta una oferta de Klipp; no negocia el precio con el cliente después de la compra.

Se mantienen dos modalidades, con un único motor de asignación:

- **Inmediata:** pago confirmado -> búsqueda inmediata -> ofertas a profesionales -> aceptación -> confirmación al cliente -> seguimiento.
- **Programada:** pago confirmado -> reserva futura sin profesional asignado -> activación automática de búsqueda cuando se aproxime la hora -> ofertas -> aceptación -> confirmación al cliente -> recordatorios y seguimiento.

## Precio y catálogo

- El precio mostrado en el checkout es el total final del servicio seleccionado.
- El precio debe proceder de una tarifa de catálogo aprobada y guardarse como snapshot en la reserva antes de abrir AZUL.
- La asignación nunca cambia el precio pagado. La tarifa individual del profesional no puede sobrescribir el importe que el cliente ya aceptó.
- La duración operativa puede ajustarse a la modalidad del profesional solo si sigue cumpliendo el tiempo y alcance que se vendieron; no debe alterar el precio.
- La comisión de Klipp es 7% del importe del servicio; payout profesional 93%, salvo ajustes fiscales o contractuales que se definan antes de operar.
- No permitir checkout con tarifas placeholder (p. ej. DOP 1). La base de datos debe rechazar esos intentos. Un servicio sin precio real aprobado permanece no vendible hasta que administración configure su tarifa.
- Antes de activar prepago, hay que armonizar las tarifas profesionales por variante con el precio de catálogo: la implementación anterior permitía que el precio final cambiara cuando el profesional aceptaba, lo cual no es compatible con prepago.

## Estados de negocio propuestos

No reutilizar `awaiting_payment` como estado normal después de que un profesional acepte: ese estado pertenece al flujo antiguo y contradice el prepago.

Separar el estado de reserva del estado del pago:

| Reserva | Significado |
| --- | --- |
| `payment_pending` (nuevo) | Pedido creado; esperando confirmación de la pasarela. No se busca profesional. |
| `requested` | Pago confirmado; pendiente de asignación o con ofertas activas. |
| `scheduled` | Profesional asignado y reserva pagada/confirmada. |
| `en_route`, `arrived`, `in_progress` | Ejecución del servicio. |
| `completed`, `confirmed` | Servicio terminado y confirmado. |
| `cancelled`, `disputed`, `expired` | Resolución/cierre según política. |

Pago:
- `pending`: intento creado, sin confirmación fiable.
- `held`: cobro aprobado y verificado en backend; Klipp registra el importe como cobrado y pendiente de liquidación al profesional.
- `released`: payout liberado/conciliado según la política.
- `refunded`: devolución confirmada por el proveedor.
- `failed`: pago rechazado o fallido.

**Importante:** `held` es un estado interno de Klipp, no implica que AZUL ofrezca escrow o split settlement. Confirmar con AZUL la liquidación al comercio, preautorización/captura, reembolsos y contracargos antes de anunciar retención de fondos.

## Motor unificado de asignación

La asignación inmediata y la programada deben invocar las mismas funciones de dominio y las mismas reglas de elegibilidad. Solo cambia el momento de activación.

1. Verificar pago confirmado (`payments.status = 'held'`) y que la reserva sigue `requested`.
2. Buscar profesionales activos, verificados, online y con presencia GPS reciente para servicios inmediatos; para programados, considerar disponibilidad declarada y confirmar presencia/aceptación cuando se active la búsqueda.
3. Exigir que el profesional ofrezca el servicio y variante exactos, tenga tarifa activa para esa variante y cumpla política de equipamiento.
4. Filtrar por radio de cobertura, distancia/ETA, disponibilidad, duración real del profesional y conflictos de agenda.
5. Ordenar por ETA de ruta cuando el proveedor de rutas esté configurado; fallback a distancia geográfica, valoración y rendimiento.
6. Enviar rondas de ofertas con expiración, sin duplicar ofertas ni asignar al profesional a dos reservas incompatibles.
7. Al aceptar, bloquear concurrentemente la reserva y al profesional, asignar una única vez, fijar el payout a partir del precio snapshot y cerrar ofertas competidoras.
8. Si rechaza/expira, continuar con la siguiente ronda automáticamente.
9. Si no hay profesional, mantener la reserva pagada en estado de búsqueda y escalar a soporte/recuperación; nunca expirar silenciosamente una compra pagada.

## Reservas programadas: ventana de búsqueda

- No bloquear a un profesional desde que el cliente compra la reserva.
- El worker programado calcula el momento de activación usando ETA estimada, margen operativo y duración del servicio.
- Cuando llega la ventana, ejecutar el mismo motor de búsqueda de la modalidad inmediata.
- Antes de aceptar, comprobar que el profesional puede llegar al punto de servicio y terminar dentro de su disponibilidad.
- Si el primer profesional cancela o pierde disponibilidad, reabrir la búsqueda con el mismo motor y conservar precio/condiciones del cliente.
- Enviar notificación al cliente solo cuando exista una asignación confirmada; antes puede mostrarse “Reserva pagada; Klipp asignará un profesional más cerca de la fecha”.
- Enviar recordatorios separados para cliente y profesional, con deduplicación.

## Cancelaciones, falta de asignación y reembolsos

Antes de activar el flujo real se debe acordar y publicar una política para:
- cancelación por cliente antes/después de asignación;
- cancelación por profesional;
- no-show del profesional o cliente;
- ausencia de profesionales disponibles;
- reasignación y hora límite para garantizar el servicio;
- reembolso total/parcial, contracargos y disputas.

Un pago no puede quedarse indefinidamente en estado pendiente de asignación sin un límite de resolución. El sistema debe disparar recuperación, ofrecer alternativas cuando proceda y ejecutar reembolso mediante una operación idempotente confirmada por AZUL.

## Seguridad e idempotencia

- El importe, moneda, comisión y payout se calculan exclusivamente en backend.
- El cliente nunca puede marcar un pago como aprobado ni llamar directamente a la función de dispatch.
- Solo un callback firmado y validado de AZUL puede pasar un pago a `held`.
- Verificar firma, número de orden, importe exacto, moneda, comercio, resultado y estado esperado.
- Idempotencia por referencia/orden del proveedor; soportar callbacks duplicados y fuera de orden.
- No iniciar dispatch antes de la confirmación del pago.
- No guardar PAN, CVV ni fecha de expiración de tarjeta en Klipp.
- Los reintentos de creación de pedido/pago no deben crear cobros ni reservas duplicados.

## Plan de implementación

1. Migración de estados y guardas DB para que ningún dispatch ocurra sin pago verificado.
2. Cambiar RPC de creación: crear pedido y snapshot de precio; no enviar ofertas ni activar asignación antes del pago.
3. Implementar checkout AZUL y callback firmado/idempotente con credenciales de certificación.
4. Tras confirmar pago, activar el motor unificado; aceptación profesional pasa a `scheduled`, no a `awaiting_payment`.
5. Ajustar UI cliente y profesional, notificaciones, agenda y panel admin.
6. Implementar cancelación/reembolso/reasignación y payout conciliado.
7. Ejecutar pruebas de concurrencia, pago duplicado, callback tardío, pago rechazado, reserva futura, falta de oferta, cancelación y reembolso en QA.

No activar pagos reales hasta recibir credenciales de comercio, completar homologación AZUL y validar las políticas comerciales/legales.
