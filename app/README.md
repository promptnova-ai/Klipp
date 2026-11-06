# Klipp — aplicación Expo

Esta carpeta contiene el cliente universal de Klipp para web, Android e iOS. El backend y las migraciones Supabase están en `../supabase`.

## Stack

- Expo SDK 58, React 19 y React Native 0.88.
- TypeScript y Expo Router.
- Supabase Auth, Postgres/PostGIS, RLS, Realtime, Storage y Edge Functions.
- Google Maps para mapas web y rutas; mapas nativos según la plataforma.
- Expo Notifications para notificaciones push.

## Configuración local

Instala Node.js 22 o una versión compatible con el SDK actual. Desde esta carpeta:

```bash
npm ci
```

Configura estas variables en tu entorno local, sin subirlas al repositorio:

| Variable | Uso |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clave pública/anon de Supabase |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API en web |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Maps SDK for Android en builds nativos |
| `GOOGLE_MAPS_IOS_API_KEY` | Maps SDK for iOS cuando se utilice Google Maps en iOS |

La clave anon de Supabase puede estar en el cliente; nunca pongas aquí `SUPABASE_SERVICE_ROLE_KEY`, secretos de cron, credenciales de AZUL ni claves privadas del servidor.

Para arrancar:

```bash
npx expo start
```

Para web:

```bash
npx expo start --web
```

## Validación local y CI

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform web
```

El workflow de GitHub también ejecuta pruebas Deno y chequeos de tipo de las Edge Functions. El lint global conserva algunos avisos/errores históricos en pantallas no modificadas; las pantallas tocadas deben pasar su lint dirigido.

## Backend y migraciones

Las migraciones versionadas están en `../supabase/migrations`. Antes de aplicar cambios:

1. Identifica el proyecto Supabase correcto (QA o producción).
2. Consulta su historial de migraciones.
3. Aplica las migraciones en orden y primero en QA.
4. Verifica RLS, permisos de tabla y funciones SECURITY DEFINER.
5. No uses datos de clientes reales para pruebas.

Las Edge Functions se encuentran en `../supabase/functions`. Las funciones que usan service role se ejecutan solo en servidor. No copies secretos al código Expo.

## Ubicación, mapas y notificaciones

- Klipp no solicita GPS automáticamente al entrar en Inicio, Direcciones o Nueva reserva. El cliente comparte ubicación después de pulsar una acción explícita.
- Las claves de Google Maps deben restringirse por API, dominio, paquete Android o bundle iOS.
- Los cambios de permisos, mapas o módulos nativos pueden requerir un nuevo build nativo.
- Las notificaciones in-app no requieren permisos push. Para push real se necesitan credenciales FCM/APNs en EAS y pruebas en dispositivos físicos.
- La ETA de servidor utiliza `GOOGLE_MAPS_SERVER_API_KEY` como secreto de Supabase, nunca como variable pública del cliente.

Consulta [configuración de notificaciones](../docs/notifications-setup.md).

## Pagos AZUL

El cliente no debe capturar ni almacenar números de tarjeta, CVV ni fecha de caducidad. La integración prevista utiliza la página de pago alojada por AZUL y validación HMAC en backend.

Los pagos reales siguen deshabilitados hasta disponer de afiliación, credenciales de certificación y producción, callbacks verificados y pruebas de conciliación y reembolso. Consulta [Integración de pagos AZUL](../docs/payments-azul-integration.md).

## Reglas de producto que no deben romperse

- Un profesional tiene una sola profesión principal.
- Cada modalidad tiene su propio precio y duración definidos por el profesional.
- El profesional lleva sus herramientas, equipos, productos y materiales; no utiliza los del cliente.
- El cliente elige una modalidad antes de seleccionar profesional o «Cerca de mí».
- La asignación automática envía ofertas con cuenta atrás y avanza al siguiente candidato cuando vence o se rechaza.
- El contacto entre cliente y profesional se mantiene dentro de Klipp.
- La comisión actual configurada es del 7 % y se calcula en backend.

La especificación funcional vigente está en [PROJECT_SPEC.md](../PROJECT_SPEC.md); los casos de prueba están en [QA_SCENARIOS.md](../QA_SCENARIOS.md).
