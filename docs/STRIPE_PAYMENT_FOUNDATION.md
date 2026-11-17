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

## 3. Flujo de pago propuesto

1. El cliente confirma una reserva y el precio final queda bloqueado en backend.
2. La reserva entra en `payment_pending`; todavía no se inicia la asignación ni se muestra como pagada.
3. Edge Function autenticada crea un PaymentIntent con importe leído de Postgres, moneda DOP e idempotency key estable.
4. La app confirma el PaymentIntent mediante Stripe React Native SDK / PaymentSheet y gestiona autenticación adicional (3DS) cuando Stripe la requiera.
5. Stripe envía un webhook firmado.
6. El webhook verifica la firma sobre el cuerpo HTTP original y llama a una RPC de servicio.
7. La RPC comprueba evento único, PaymentIntent asociado, importe, moneda, caducidad y estado de reserva.
8. Sólo una confirmación válida cambia la reserva a `requested` y permite iniciar dispatch.
9. La comisión del 7% y el neto profesional se calculan en backend; el payout sólo se registra cuando se complete el servicio y se cumplan las reglas de liberación.

## 4. Preparación técnica incluida

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

## 5. Bloqueos antes de integrar con la app

- La app actual crea reservas con estado `requested`; el flujo Stripe requiere una reserva `payment_pending`. No se ha cambiado el comportamiento de reservas existente.
- Las RPC de reserva prepago siguen bloqueadas para clientes mientras se adapta el flujo completo. No reactivar las antiguas RPC de AZUL.
- Falta adaptar creación de reserva y cotización para soportar asignación manual y automática con pago previo sin romper el modelo actual.
- Falta integrar Stripe PaymentSheet en Expo (requiere configurar el plugin y compilar un development build; Expo Go no basta para el módulo nativo).
- Falta definir política de cancelación, autorización/captura, reembolsos, disputas, reservas tardías y conciliación.
- Falta decidir proveedor y reglas de payout dominicano.
- Faltan claves de prueba Stripe y secreto de webhook. Nunca se guardan en Git ni en el cliente; se configurarán como secretos de Supabase cuando exista una cuenta real.
- No se ha desplegado ninguna Edge Function Stripe ni se ha procesado ningún pago real.

## 6. Variables de entorno previstas

- `STRIPE_SECRET_KEY`: clave secreta de Stripe (sólo backend).
- `STRIPE_WEBHOOK_SECRET`: secreto de firma del endpoint (sólo backend).
- Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime.

Nunca usar `sk_live_...` en QA. Para pruebas futuras usar exclusivamente claves `sk_test_...` y un endpoint webhook de test.

## 7. Criterios de aceptación QA

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
- DGII — Personas Jurídicas: https://dgii.gov.do/contribuyentesRegistrados/personasJuridicas/Paginas/default.aspx
- Formalízate RD: https://formalizate.gob.do/procesodetalladodeformalizacion/
- BOE — Ley del Impuesto sobre Sociedades: https://www.boe.es/buscar/act.php?id=BOE-A-2014-12328
