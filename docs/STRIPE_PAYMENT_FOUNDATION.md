# Klipp — evaluación legal y base técnica de Stripe

**Estado:** preparación técnica en QA; no habilitado para cobros reales.

## 1. Decisión de jurisdicción

### España — sociedad limitada

Ventajas:
- España figura entre los países donde Stripe permite abrir cuentas de empresa.
- Permite que una sociedad real, gestionada desde España, contrate Stripe Payments y reciba liquidaciones en una cuenta bancaria admitida.
- Puede simplificar la dirección y supervisión del producto si la gestión efectiva se realiza desde España.

Obligaciones y riesgos:
- Constitución, contabilidad, cuentas anuales, Impuesto sobre Sociedades y obligaciones de administrador.
- El tipo general del Impuesto sobre Sociedades es del 25%; existen tipos reducidos según tamaño y condiciones. El 15% para entidades de nueva creación se aplica sólo si se cumplen los requisitos legales y en los períodos indicados.
- Operar y captar profesionales en República Dominicana puede generar obligaciones de registro, tributación indirecta, consumo, protección de datos, laboral/seguridad social o establecimiento permanente. No asumir que una SL española elimina obligaciones dominicanas.
- La entidad debe ser realmente titular del negocio, de los contratos, de la cuenta Stripe y de la actividad que declara.

### República Dominicana — SRL

Ventajas:
- Encaja con la operación local, los contratos con profesionales, la facturación y las relaciones bancarias dominicanas.
- El proceso formal pasa por ONAPI, Registro Mercantil, DGII y obtención del RNC.

Limitación de Stripe:
- República Dominicana no aparece en la lista pública de países en los que una empresa puede abrir una cuenta Stripe estándar.
- Por tanto, una SRL dominicana no puede activar Stripe Payments directamente con los datos de esa sociedad bajo la disponibilidad estándar publicada.

### Recomendación provisional

Si la dirección efectiva y la gestión del negocio van a estar en España, estudiar primero una SL española como entidad operadora real, con asesoría fiscal española y dominicana antes de iniciar actividad en RD.

Si la dirección efectiva, la contratación y la operación comercial se trasladan a RD, estudiar una SRL dominicana y un adquirente/pasarela local, en vez de crear una sociedad española sólo para acceder a Stripe.

No constituir todavía ni abrir una cuenta Stripe con datos prestados o una entidad que no sea la verdadera titular del negocio. La elección debe cerrarse con asesor fiscal/mercantil de ambos países y confirmación escrita de Stripe para el modelo marketplace.

## 2. Cobro y liquidación: separar dos problemas

- **Cobro del cliente:** Stripe Payments puede presentar pagos con tarjeta en DOP. DOP figura en la lista de monedas de presentación. Los importes DOP se representan con dos decimales en la API (importe en céntimos).
- **Liquidación del saldo de Klipp:** depende del país de la cuenta, banco y monedas de settlement admitidas.
- **Pago al profesional dominicano:** no asumir que Stripe Connect permite onboarding o payout a una cuenta conectada dominicana. La documentación de Stripe exige que plataforma y cuentas conectadas estén en países admitidos para cross-border Connect.
- **Global Payouts:** la página localizada para España indica que el producto no está disponible en el país de la plataforma. La tabla de disponibilidad muestra DOP/ACH en República Dominicana en estado Preview; esto no equivale a disponibilidad contractual para una plataforma española.

Por tanto, la arquitectura deja el payout desacoplado de Stripe Payments. Antes del lanzamiento hay que seleccionar un proveedor de transferencias a bancos dominicanos y obtener confirmación de elegibilidad, tarifas, límites, tiempos, KYC/AML, reversos y responsabilidades regulatorias. No pagar profesionales desde un saldo de Stripe manualmente ni asumir que Klipp puede custodiar fondos sin revisar la regulación de servicios de pago.

## 3. Impacto de comisiones sobre el 7% de Klipp

La tarifa pública de Stripe España indica para tarjetas internacionales un 3,15% + 0,25 € por operación, más un 2% si se requiere conversión de divisas. Una tarjeta emitida en República Dominicana sería internacional para una cuenta española. Si los cobros DOP se liquidan en EUR y Stripe aplica conversión, la hipótesis de coste de trabajo es aproximadamente **5,15% + 0,25 €** por cobro; Stripe debe confirmar la tarifa exacta aplicable a la cuenta y al flujo DOP.

Esto es un riesgo serio para el margen de Klipp: con una comisión de plataforma del 7% sobre el importe bruto, quedarían sólo 1,85 puntos porcentuales antes de descontar el fijo de 0,25 €, las transferencias a profesionales, impuestos, reembolsos, contracargos y costes operativos. En servicios de bajo importe, el fijo puede consumir casi toda la comisión de Klipp.

Antes de cerrar precios hay que simular la tarifa real por importe medio, importe mínimo y porcentaje de pagos con tarjeta dominicana. Si el modelo no soporta ese coste, habrá que negociar precios personalizados con Stripe, revisar la comisión de Klipp o usar un adquirente local para el cobro en RD. No ocultar ni trasladar recargos al cliente sin revisar las reglas de Stripe y la normativa aplicable.

## 4. Flujo de pago propuesto

1. El cliente confirma una reserva y el precio final queda bloqueado en backend.
2. La reserva entra en `payment_pending`; todavía no se inicia la asignación ni se muestra como pagada.
3. Edge Function autenticada crea una Checkout Session alojada con importe leído de Postgres, moneda DOP, metadata vinculada a payment_id/booking_id e idempotency key estable.
4. La app abre Stripe Checkout en una sesión segura del navegador y vuelve al esquema nativo `klipp://payment-return`. La app nunca confirma el pago por sí misma.
5. Stripe envía eventos firmados `checkout.session.completed` y `payment_intent.succeeded`; el webhook admite que lleguen en distinto orden.
6. El webhook verifica la firma sobre el cuerpo HTTP original, vincula el PaymentIntent a la fila de pago y llama a la RPC de servicio.
7. La RPC comprueba evento único, PaymentIntent asociado, importe, moneda, caducidad y estado de reserva.
8. Sólo una confirmación válida y dentro del plazo cambia la reserva a `requested` y permite iniciar dispatch. Una captura tardía se registra como `refund_required` y no crea ofertas.
9. La comisión del 7% y el neto profesional se calculan en backend; el payout sólo se registra cuando se complete el servicio y se cumplan las reglas de liberación.

## 5. Preparación técnica incluida

- Migración `20261117173605_stripe_payment_foundation`:
  - Tabla privada `stripe_webhook_events` para deduplicar eventos.
  - Índice único para el PaymentIntent de Stripe.
  - RPC autenticada `create_stripe_payment_attempt`.
  - RPC de servicio `attach_stripe_payment_intent`.
  - RPC de servicio `process_stripe_webhook_event`.
- Migración `20261117173647_stripe_webhook_event_identity_guard`:
  - Un event ID de Stripe queda vinculado a su tipo y PaymentIntent originales.
- Migraciones `20261117173823_stripe_expired_attempt_retry`, `20261117173844_stripe_payment_intent_retry_after_failed_attempt` y `20261117173945_stripe_retry_same_payment_intent`:
  - Los reintentos reutilizan el mismo PaymentIntent mientras la reserva siga siendo pagable; se amplía la ventana en backend sin crear un segundo intento activo.
  - Un fallo de un método de tarjeta no se interpreta como fallo definitivo si Stripe aún permite reintentar el mismo PaymentIntent.
  - Una confirmación tardía tras cerrar el intento no activa dispatch y se marca para conciliación/reembolso.
- Edge Functions en el repositorio:
  - `stripe-create-payment-intent`: valida usuario y reserva, lee el importe en backend, crea el PaymentIntent y lo asocia a la fila de pago.
  - `stripe-webhook`: valida la firma Stripe-Signature con HMAC SHA-256 y procesa eventos idempotentemente.
- Configuración local de Edge Functions: JWT obligatorio para crear pagos; JWT desactivado sólo para el endpoint webhook, que valida la firma Stripe.
- Migración `20261118121500_stripe_prepaid_booking_creation`:
  - Nueva RPC `create_stripe_prepaid_booking_at_location`, que crea reservas en `payment_pending`, valida tarifa y duración contra el catálogo profesional, bloquea el precio y fija `payment_due_at`.
  - No crea `booking_requests` antes de que el pago esté confirmado.
  - Admite selección manual y selección automática de una cotización exacta de profesional; el cliente no puede alterar el importe.
  - Pruebas transaccionales en QA para reserva manual y automática completadas con rollback; no quedaron reservas ni pagos de prueba.
- Migración `20261118120000_stripe_paid_auto_dispatch`:
  - Añade un trigger interno para iniciar el dispatch automático cuando una reserva `payment_pending` pasa a `requested` después de una confirmación de pago.
  - El trigger no es ejecutable por `anon` ni `authenticated` y no requiere que el móvil permanezca abierto.

## 6. Bloqueos antes de integrar con la app

- La app sigue llamando a las RPC antiguas de reserva normal; todavía no utiliza `create_stripe_prepaid_booking_at_location` ni inicia el checkout Stripe.
- La pantalla debe obtener una cotización exacta (profesional, precio y duración) antes de crear una reserva prepago. Para asignación automática se debe usar `get_auto_service_quote`; no se debe cobrar un rango estimado.
- El webhook actual activa solicitudes al profesional seleccionado tras el pago confirmado. El trigger nuevo cubre además reservas automáticas sin profesional preasignado.
- Las reservas programadas siguen dependiendo de `process_scheduled_booking_dispatch`; QA no tiene los jobs `pg_cron`/`pg_net` de producción y falta validar ese worker con el nuevo ciclo de pago.
- Las RPC prepago antiguas de AZUL siguen bloqueadas para clientes. No reactivarlas.
- Falta integrar `@stripe/stripe-react-native` y PaymentSheet en Expo. Expo SDK 58 recomienda instalar la versión compatible mediante `npx expo install @stripe/stripe-react-native`; después hay que configurar el plugin nativo y compilar un development build.
- Falta definir política de cancelación, autorización/captura, reembolsos, disputas, reservas tardías y conciliación.
- Falta decidir proveedor y reglas de payout dominicano.
- Faltan claves de prueba Stripe y secreto de webhook. Nunca se guardan en Git ni en el cliente; se configurarán como secretos de Supabase cuando exista una cuenta real.
- No se ha desplegado ninguna Edge Function Stripe ni se ha procesado ningún pago real.

## 7. Variables de entorno previstas

- `STRIPE_SECRET_KEY`: clave secreta de Stripe (sólo backend).
- `STRIPE_WEBHOOK_SECRET`: secreto de firma del endpoint (sólo backend).
- Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime.

Nunca usar `sk_live_...` en QA. Para pruebas futuras usar exclusivamente claves `sk_test_...` y un endpoint webhook de test.

## 8. Criterios de aceptación QA

- Usuario no autenticado no puede crear intento.
- Cliente no puede pagar reserva de otro usuario.
- Importe enviado por cliente se ignora; sólo se usa el precio bloqueado en base de datos.
- Repetir la petición con la misma clave no duplica el PaymentIntent.
- Reintentar tras un fallo reutiliza el PaymentIntent activo y no crea una segunda operación cobrable.
- Firma webhook incorrecta se rechaza.
- Evento repetido no duplica transición ni dispatch.
- Importe/moneda incorrectos o aprobación tardía no activan la reserva y generan estado de reembolso requerido.
- Fallo de pago no activa dispatch.
- Sólo el webhook firmado puede confirmar el pago.
- Ningún cobro real ni payout se activa hasta completar E2E con cuentas Stripe de prueba.

## Referencias oficiales consultadas

- Stripe global availability: https://stripe.com/global
- Stripe supported currencies: https://docs.stripe.com/currencies
- Stripe Connect cross-border payouts: https://support.stripe.com/questions/pay-out-to-connected-accounts-in-other-countries
- Stripe Global Payouts availability: https://stripe.com/es/payouts
- Stripe pricing Spain: https://stripe.com/es/pricing
- Stripe money-management availability by destination country: https://stripe.com/money-management/availability
- DGII — Personas Jurídicas: https://dgii.gov.do/contribuyentesRegistrados/personasJuridicas/Paginas/default.aspx
- Formalízate RD: https://formalizate.gob.do/procesodetalladodeformalizacion/
- BOE — Ley del Impuesto sobre Sociedades: https://www.boe.es/buscar/act.php?id=BOE-A-2014-12328


## 6. Actualización de integración QA (2026-11-20)

- La pantalla de nueva reserva usa `create_stripe_prepaid_service_booking_at_location`; ya no llama a los RPC antiguos que podían crear una reserva sin pago.
- La integración de cliente usa Checkout alojado, no Stripe React Native PaymentSheet. La función `stripe-create-checkout-session` valida el JWT y crea el intento mediante la RPC autenticada; no acepta importe enviado por el cliente.
- `stripe-webhook` procesa Checkout completado y PaymentIntent, enlazando el ID del pago desde metadata firmada por Stripe. La RPC `attach_stripe_payment_intent` sigue restringida a `service_role` y permite enlazar capturas tardías para que la RPC de procesamiento las marque para revisión en vez de perder el evento.
- La pantalla Mis reservas permite reabrir el checkout de la misma reserva en estado `payment_pending`; no crea una segunda reserva al reintentar.
- QA usa un plazo de pago de 10 minutos, mientras que Stripe Checkout alojado impone una expiración mínima de 30 minutos. El backend impide que una captura posterior active dispatch y la marca `refund_required`, pero el reembolso debe completarlo el operador. Este desajuste debe resolverse antes de producción; no se considera una experiencia de pago terminada.
- QA dispone de un cron cada minuto para llamar a `dispatch-notifications`, con un secreto aleatorio almacenado en Supabase Vault y validado por RPC. La prueba HTTP devolvió 200; no se enviaron push porque QA no tiene dispositivos registrados.
- Las pruebas de webhook de esta iteración fueron simulaciones SQL con IDs sintéticos y rollback. No se ha realizado ningún cargo Stripe real ni se ha probado un webhook firmado real.
- Las Edge Functions de Stripe requieren `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. No se han configurado credenciales en esta iteración ni se ha tocado producción.
