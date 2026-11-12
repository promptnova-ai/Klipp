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
