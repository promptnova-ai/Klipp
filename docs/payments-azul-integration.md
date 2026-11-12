# Integración de pagos de Klipp con AZUL

## Decisión técnica

Usar inicialmente la **Página de Pago AZUL** para web y app móvil. El cliente introduce los datos de tarjeta en la página alojada por AZUL; Klipp no debe capturar ni almacenar PAN, fecha de expiración ni CVV.

Documentación oficial consultada:
- https://dev.azul.com.do/Pages/developer/pages/documents/index.aspx
- https://dev.azul.com.do/Pages/developer/documentos/plugins/Documento-E-Commerce-AZUL-Pagina-Pagos-(Espanol)-2023-08.pdf

AZUL exige afiliación, credenciales de pruebas, pruebas de certificación y credenciales de producción. La URL de pruebas y las credenciales son distintas de producción.

## Flujo objetivo: prepago antes de asignar

1. El cliente selecciona un servicio/variante del catálogo y ve un precio cerrado antes de confirmar.
2. El backend crea un pedido en `payment_pending`, guardando snapshots de precio, duración, variante y condiciones. No se envía ninguna oferta a profesionales en este estado.
3. Una Edge Function autenticada valida que el usuario es el cliente propietario, crea un intento idempotente y calcula el importe exclusivamente desde el snapshot de la reserva.
4. El backend genera el formulario POST de AZUL y su `AuthHash` HMAC-SHA512 usando `AuthKey` guardada como secreto. El navegador/app abre la página de pago alojada por AZUL.
5. AZUL devuelve al cliente a las URLs de aprobado, declinado o cancelado. La página de retorno no cambia por sí sola el estado de pago ni activa la búsqueda.
6. Una Edge Function verifica el `AuthHash` de respuesta, número de orden, importe exacto, moneda, comercio y código de respuesta. Debe bloquear repetición de callbacks y resultados incompatibles.
7. Sólo después de verificar la aprobación se registra el pago como `held` y el pedido pasa a `requested` de forma atómica. Ese cambio activa el motor de asignación compartido.
8. El profesional acepta una oferta de Klipp; la reserva pasa a `scheduled`. El precio pagado no cambia por la identidad del profesional que acepte. Se crea/actualiza el payout calculado desde el snapshot.
9. En una reserva programada, el pedido permanece pagado y sin profesional hasta que el worker alcance la ventana de búsqueda; entonces utiliza el mismo motor de asignación que una solicitud inmediata.
10. Si AZUL declina, se registra `failed` y no se inicia búsqueda. Si el cliente cancela el checkout, puede reintentarlo mientras el pedido siga siendo válido.
11. Las cancelaciones, conciliaciones y reembolsos se ejecutan desde backend, son idempotentes y dejan trazabilidad.

El diseño completo de estados, asignación, ventanas programadas y escenarios de recuperación está en `docs/prepaid-booking-dispatch.md`.

## Reglas financieras

- Moneda: DOP, confirmando con AZUL el valor exacto que exige su campo `CurrencyCode`.
- Comisión Klipp: 7 %, calculada en la reserva por backend.
- Importe de cobro: el precio total aceptado por el cliente, sin confiar en datos del dispositivo.
- El importe de ITBIS debe definirse con asesoría fiscal y la configuración de AZUL; no asumir automáticamente que es cero.
- No almacenar datos de tarjeta ni incluirlos en logs.
- La aprobación del navegador no equivale a una señal fiable hasta validar la firma HMAC y todos los campos de la transacción.
- Los pagos capturados por AZUL se liquidan al comercio afiliado. Los pagos a profesionales requieren un proceso separado de payout y conciliación; no asumir que AZUL hace split automático.

## Datos que Klipp necesita recibir de AZUL

Guardar exclusivamente en Supabase Edge Function Secrets:
- `AZUL_MERCHANT_ID`
- `AZUL_MERCHANT_NAME`
- `AZUL_MERCHANT_TYPE`
- `AZUL_CURRENCY_CODE`
- `AZUL_AUTH_KEY`
- `AZUL_ENV` (`test` o `production`)
- `AZUL_ITBIS_POLICY` / configuración fiscal aprobada

Además:
- URLs autorizadas para aprobado, declinado y cancelado.
- Credenciales de pruebas y documentación vigente entregada al comercio.
- Confirmación de si el producto contratado permite venta inmediata o preautorización HOLD/POST y cuáles son sus plazos y condiciones.
- Confirmación de liquidación, comisiones, devoluciones, contracargos y calendario de abono.

## Condiciones para activar pagos

No habilitar el botón de pago ni confirmar reservas hasta:
- tener afiliación y credenciales de AZUL;
- completar las pruebas en su entorno de certificación;
- validar firmas y callbacks de éxito, declinación y cancelación;
- probar doble callback, callback fuera de orden, importe manipulado, pago repetido y timeout;
- disponer de política pública de cancelación y reembolso, privacidad, términos y datos de contacto.

## Estado actual

La aplicación ya muestra el estado de pago asociado a la reserva y deja claro cuando el pago no está disponible. No se ha simulado un cobro ni se ha conectado una cuenta de comercio. La integración de AZUL queda preparada a nivel de especificación, pendiente de credenciales y homologación.
