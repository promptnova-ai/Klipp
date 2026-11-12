# Integración de pagos de Klipp con AZUL

## Decisión técnica

Usar inicialmente la **Página de Pago AZUL** para web y app móvil. El cliente introduce los datos de tarjeta en la página alojada por AZUL; Klipp no captura ni almacena PAN, fecha de expiración ni CVV.

Documentación oficial:
- https://dev.azul.com.do/Pages/developer/pages/documents/index.aspx
- https://dev.azul.com.do/Pages/developer/documentos/plugins/Documento-E-Commerce-AZUL-Pagina-Pagos-(Espanol)-2023-08.pdf

AZUL exige afiliación, credenciales de pruebas, certificación y credenciales de producción. Las URLs y credenciales de pruebas son distintas de producción.

## Flujo objetivo: cotización profesional + prepago

1. El cliente selecciona servicio/variante, ubicación y horario.
2. En búsqueda se muestra un rango aproximado calculado a partir de tarifas activas de profesionales que cubren la zona.
3. Antes del pago, Klipp selecciona o el cliente elige un profesional concreto. La ventana de reserva muestra el precio exacto de ese profesional, duración y nombre.
4. El backend vuelve a consultar la tarifa activa y crea una reserva `payment_pending` con snapshot inmutable: profesional, servicio/variante, precio, duración, comisión y payout. Si la tarifa cambió, se presenta el nuevo importe y se exige aceptación expresa.
5. No se crea ninguna oferta ni se ejecuta dispatch en `payment_pending`.
6. Una Edge Function autenticada valida que el usuario es el cliente propietario, crea un intento idempotente y calcula el importe exclusivamente desde el snapshot.
7. El backend genera el formulario POST de AZUL y su `AuthHash` HMAC-SHA512 usando `AuthKey` guardada como secreto. La app abre la página alojada por AZUL.
8. La página de retorno no cambia por sí sola el estado del pago ni activa la búsqueda.
9. Una Edge Function verifica AuthHash, orden, importe exacto, moneda, comercio y código de respuesta.
10. Solo tras aprobación verificada se registra pago `held` y reserva `requested` en una operación atómica. Se crea la oferta al profesional cotizado.
11. El profesional acepta y la reserva pasa a `scheduled`. La aceptación nunca recalcula ni modifica el precio o payout.
12. Si el profesional rechaza, solo se puede probar otro profesional con la misma tarifa bloqueada. Si el nuevo profesional tiene otro precio, Klipp solicita consentimiento para una nueva cotización antes de cobrar una diferencia; si no se acepta, aplica la política de cancelación/reembolso.
13. Para una reserva programada, el precio final se acepta y paga al reservar; la oferta se activa en la ventana de búsqueda programada. Si la tarifa ya no está disponible, se requiere nueva aceptación o reembolso.
14. Reembolsos, conciliación y liquidación se ejecutan desde backend, son idempotentes y dejan trazabilidad.

## Reglas financieras

- Moneda: DOP, confirmando con AZUL el valor exacto exigido por `CurrencyCode`.
- Comisión Klipp: 7 % del precio final aceptado.
- Payout profesional: 93 % antes de ajustes fiscales/contractuales.
- El importe de cobro sale del snapshot de la reserva, nunca de datos enviados por el dispositivo ni del precio genérico de catálogo.
- ITBIS y configuración fiscal deben definirse con asesoría fiscal.
- No almacenar datos de tarjeta ni incluirlos en logs.
- Los pagos capturados por AZUL se liquidan al comercio afiliado. Payout a profesionales requiere proceso separado; no asumir split automático.

## Secretos necesarios

Guardar exclusivamente en Supabase Edge Function Secrets:
- `AZUL_MERCHANT_ID`
- `AZUL_MERCHANT_NAME`
- `AZUL_MERCHANT_TYPE`
- `AZUL_CURRENCY_CODE`
- `AZUL_AUTH_KEY`
- `AZUL_ENV` (`test` o `production`)
- `AZUL_ITBIS_POLICY` / configuración fiscal aprobada

También hacen falta URLs autorizadas de aprobado/declinado/cancelado, credenciales de certificación, confirmación de HOLD/POST, liquidación, devoluciones, contracargos y calendario de abono.

## Implementación de funciones Edge

La rama contiene estas funciones, todavía no desplegadas:

- `azul-create-checkout`: autentica al cliente, verifica que la reserva le pertenece y sigue en `payment_pending`, crea/reutiliza un intento idempotente y genera una URL de checkout de corta duración.
- `azul-checkout-page`: consume una sesión de un solo uso y genera el formulario HTML POST que el navegador envía a AZUL. Esto respeta el requisito de AZUL de que el POST lo ejecute el navegador del cliente, no el servidor de Klipp.
- `azul-payment-return`: procesa la redirección de AZUL, verifica el AuthHash de respuesta en servidor y solo entonces llama a `finalize_azul_payment_attempt`. Las redirecciones de cancelación sin firma no cambian el estado financiero.
- `_shared/azul.ts`: genera/verifica HMAC-SHA512, sesiones firmadas y conversión de importes.

La sesión de checkout se guarda como hash SHA-256 en `payments`, expira como máximo a los 5 minutos o al vencer el checkout y solo puede reclamarse una vez. El pago conserva su ventana máxima de 10 minutos.

## AuthHash según el manual oficial AZUL

El manual de AZUL indica HMAC-SHA512 y exige concatenar los campos sin separadores, en este orden.

**Requerimiento de venta:**

`MerchantId + MerchantName + MerchantType + CurrencyCode + OrderNumber + Amount + ITBIS + ApprovedUrl + DeclinedUrl + CancelUrl + UseCustomField1 + CustomField1Label + CustomField1Value + UseCustomField2 + CustomField2Label + CustomField2Value + AuthKey`

**Respuesta de AZUL:**

`OrderNumber + Amount + AuthorizationCode + DateTime + ResponseCode + IsoCode + ResponseMessage + ErrorDescription + RRN + AuthKey`

El manual especifica codificación Unicode; el código usa UTF-16LE para el mensaje HMAC. No se confía en la URL de retorno ni en el texto visual de AZUL: el callback debe llevar una firma válida y coincidir con el número de orden y el importe guardados en Supabase.

Fuente oficial: https://dev.azul.com.do/Pages/developer/documentos/plugins/Documento-E-Commerce-AZUL-Pagina-Pagos-(Espanol)-2023-08.pdf

## Configuración obligatoria antes de usar el checkout

Además de las credenciales de comercio, las funciones requieren:
- `AZUL_CHECKOUT_PAGE_URL`: URL pública de `azul-checkout-page`.
- `AZUL_CHECKOUT_TOKEN_SECRET`: secreto independiente para firmar la sesión de navegador.
- `AZUL_APPROVED_URL`, `AZUL_DECLINED_URL`, `AZUL_CANCEL_URL`: URLs públicas registradas/autorizadas por AZUL.
- `AZUL_PAYMENT_PAGE_URL` y `AZUL_PAYMENT_PAGE_FALLBACK_URL`: opcionales; si no se indican, se usan las URLs documentadas para el ambiente.
- `AZUL_ITBIS_RATE` o `AZUL_ITBIS_EXEMPT=true`: configuración fiscal explícita. No se inventa ni se asume una exención.
- `KLIPP_WEB_APP_URL`: URL de retorno web de Klipp (por defecto, la URL de preview/producción conocida).
- `AZUL_ENABLE_LIVE_PAYMENTS=true`: requisito adicional para permitir el ambiente de producción. Sin este valor, producción permanece bloqueada.

El campo `Amount` se envía en unidades menores (dos decimales, sin punto ni coma), y representa el total aceptado por el cliente. `ITBIS` se calcula como componente incluido en ese total según la política fiscal aprobada; si la configuración fiscal no está definida, el checkout se bloquea.

## Checkout sin retorno del navegador

La Página de Pago AZUL devuelve el resultado mediante redirección del navegador. Si el usuario cierra el navegador antes de que Klipp reciba el retorno firmado, Klipp no puede asumir que el pago no se procesó. Al vencer el checkout, el worker marca `payments.reconciliation_required_at` y la reserva queda `expired`, sin despacho. Mis reservas muestra al cliente que no debe volver a pagar hasta completar la conciliación con los reportes/portal AZUL. Una aprobación firmada tardía pasa a revisión de devolución; una declinación firmada limpia la marca de conciliación.

## Aprobaciones tardías o importes no coincidentes

Una respuesta AZUL con HMAC válido que confirme un cobro no puede descartarse como `failed` solo porque llegue tarde o el importe difiera del snapshot. En esos casos el backend:
- registra el importe real recibido en `provider_amount_dop`;
- marca el pago como `held` y establece `refund_required_at` y `refund_reason`;
- deja la reserva `expired` y no activa despacho;
- muestra al cliente que el cobro está en revisión para devolución.

Esto también cubre callbacks que llegan después de que el worker local haya marcado el intento como expirado. Los callbacks repetidos son idempotentes. Hasta que AZUL y Klipp tengan un flujo de devolución certificado, estos casos requieren conciliación y devolución desde el comercio; no se debe intentar un segundo cobro al cliente.

## Condiciones para activar pagos

No habilitar checkout real hasta:
- disponer de afiliación y credenciales AZUL;
- homologar callbacks y firmas;
- probar doble callback, callback fuera de orden, importe manipulado, pago repetido y timeout;
- validar cambios de tarifa entre cotización y confirmación;
- probar rechazo del profesional cotizado y sustitución con tarifa igual/distinta;
- disponer de política pública de cancelación/reembolso, privacidad y términos.

## Estado actual

La integración sigue en QA. No se ha simulado un cobro ni conectado una cuenta de comercio. El backend de intentos y callback verificado está preparado parcialmente, pero aún falta cablear el flujo completo de cotización, reserva, checkout y asignación en la app.
