# Klipp — app de servicios autónomos a domicilio (RD)

> Nombre de la app: **Klipp**
> Guarda este archivo en la raíz del repositorio y pásalo como contexto a la IA en cada sesión.

## 1. Concepto
Marketplace tipo Uber para servicios presenciales a domicilio. **Primera categoría: limpieza.**
**Lanzamiento solo en Santo Domingo** (Distrito Nacional, SD Este, SD Norte, SD Oeste). Moneda: DOP.

## 2. Decisiones tomadas
- Servicios **presenciales**.
- **Todos los pagos dentro de la app** (pago retenido hasta que el cliente confirma el servicio).
- El cliente puede **elegir al profesional** o dejar que la app lo **asigne automáticamente**.
- La asignación automática **filtra por zona y ordena por cercanía** (después calificación, aceptación y rotación).
- El profesional **selecciona sus sectores de trabajo** dentro de Santo Domingo.
- **Seguimiento en tiempo real** del profesional (ubicación y estados), estilo Uber.
- Desarrollo en solitario, con ayuda de IA, por fases.
- Precio **cerrado** por tipo de servicio y tamaño de vivienda (no hay negociación).

## 3. Roles
- `client`: reserva y paga servicios.
- `pro`: profesional de limpieza (verificado con cédula).
- `admin`: verifica profesionales y gestiona reclamaciones.

Una sola app móvil con dos experiencias según el rol.

## 4. Flujo de una reserva
1. Cliente: servicio + tamaño + dirección (pin en mapa) + fecha/hora.
2. Modalidad: **manual** (elige perfil) o **automática**.
3. El profesional acepta o rechaza (plazo corto: 2 h manual; pocos minutos en automática).
4. Si acepta, el cliente paga y el dinero queda **retenido**.
5. Estados en vivo: en camino → llegó → en servicio → terminado.
6. El cliente confirma (o se confirma solo tras un plazo) → se libera el pago menos la comisión.
7. Reseñas mutuas / reclamación si hay problema.

### Estados de `bookings.status`
`requested` → `awaiting_payment` → `scheduled` → `en_route` → `arrived` → `in_progress` → `completed` → `confirmed`
Laterales: `cancelled`, `disputed`, `expired`.

## 5. Reglas de negocio
- Comisión de plataforma: 20 % (ajustable; revisar tras estudiar el mercado).
- Asignación automática: filtro duro por sector del cliente ∈ sectores del profesional, verificado, activo, con disponibilidad y sin solape (margen de 60 min entre servicios por el tráfico). Orden: distancia → calificación → rotación (rotación pendiente).
- Ubicación en vivo: solo visible para el cliente mientras la reserva esté en `scheduled`/`en_route`/`arrived`; el profesional solo la comparte durante `en_route`.
- No se muestran teléfonos; comunicación por chat dentro de la app.
- Nunca manejar datos de tarjeta en la app ni en el servidor propio: usar la página de pago alojada de la pasarela (AZUL / CardNET).
- Los precios, comisiones y cambios de estado **siempre se calculan en el servidor** (funciones RPC / Edge Functions), nunca los decide el cliente móvil.

## 6. Stack
- App: React Native + Expo (TypeScript), una sola app con dos roles.
- Backend: Supabase (Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions).
- Mapas/ETA: Google Maps Platform.
- Push: Expo Notifications / Firebase Cloud Messaging.
- Pagos: AZUL o CardNET (confirmar con ellos: pagos divididos, retención de fondos, figura de facilitador de pagos).
- Admin: panel básico (Supabase Studio al principio).

## 7. Hoja de ruta
1. **Base:** auth, roles, perfiles de profesional, sectores, base de datos y RLS.
2. **Reserva manual:** elegir profesional, disponibilidad, aceptar/rechazar, estados.
3. **Pagos:** pago retenido y liberación (pasarela local).
4. **Reseñas, chat y notificaciones push.**
5. **Asignación automática** por zona y cercanía.
6. **Mapa en vivo y ETA.**
> El piloto real con pocos profesionales y clientes debería ser posible al terminar la fase 3.

## 8. Pendiente / por investigar
- Condiciones reales de AZUL/CardNET para marketplace (pagos divididos, retención, comisiones, plazos de liquidación).
- Obligaciones fiscales (RNC, ITBIS, DGII) para la plataforma y los profesionales.
- Política de privacidad y consentimiento de ubicación (Ley 172-13 de protección de datos).
- Política de cancelaciones, penalizaciones y garantía por daños.
- Tarifas de mercado por tipo/tamaño de limpieza en Santo Domingo.
- Verificación de antecedentes de los profesionales.

## 9. Convenciones para trabajar con IA
- Trabajar en **tramos verticales pequeños** (por ejemplo, "crear reserva de punta a punta") y probar antes de seguir.
- Cambios de base de datos siempre como **migraciones SQL versionadas**.
- Escribir **pruebas** para precios, asignación, transiciones de estado y liberación de pagos.
- Revisar manualmente todo lo relacionado con **RLS, pagos y permisos de ubicación**.
- Ninguna clave secreta en el código de la app móvil.
