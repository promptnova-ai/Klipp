# QA — protección de coste del ETA

Ejecutar únicamente en un proyecto Supabase de QA con Google Routes configurado y cuentas sintéticas. No ejecutar pruebas de carga contra producción.

## QA-ETA-01 — Límite de frecuencia por reserva
1. Con el cliente propietario de una reserva en estado `en_route`, invocar `booking-route-eta`.
2. Repetir la llamada inmediatamente con la misma sesión.
3. Verificar que la primera llamada puede calcular la ruta y la segunda devuelve HTTP `429`, código `ETA_RATE_LIMITED`, `retryAfterSeconds: 30` y cabecera `Retry-After: 30`.
4. Esperar al menos 30 segundos y repetir; debe poder reclamar un nuevo cálculo.
5. Verificar en los logs de Google Routes que las llamadas rechazadas por el límite no llegan al proveedor.

## QA-ETA-02 — Concurrencia y bypasses
1. Lanzar dos llamadas simultáneas para la misma reserva con el cliente autorizado.
2. Verificar que solo una obtiene el derecho a llamar a Google Routes y la otra recibe `429`.
3. Repetir con `notifyDelay: false`; el límite debe seguir aplicándose.
4. Repetir desde otra sesión del mismo cliente; el límite sigue siendo global por reserva.
5. Llamar desde una cuenta que no sea cliente ni administrador con permiso `bookings.read`; debe recibir `403` y no consumir el límite.
6. Probar un identificador que no sea UUID; debe recibir `400` sin consultar reservas ni Google Routes.

## QA-ETA-03 — Estado y recuperación
1. Probar reserva que no esté en `en_route`; debe recibir `409` sin reclamar el límite.
2. Probar ubicación profesional ausente o con más de 120 segundos; debe devolver `202` y no consumir el límite.
3. Simular error de Google Routes después de reclamar el límite; debe respetarse el cooldown para evitar reintentos que generen gasto repetido.
4. Confirmar que el worker de notificaciones conserva su cálculo de ETA independiente y no queda bloqueado por este límite interactivo.

## Criterio de aceptación
El bloqueo se aplica de forma atómica en PostgreSQL, antes de la llamada facturable, y no depende de memoria local de la Edge Function. La prueba debe verificar tanto respuestas HTTP como el número real de peticiones al proveedor.
