# Klipp — sistema UX/UI móvil

**Producto:** servicios a domicilio bajo demanda en República Dominicana.  
**Plataformas:** React Native + Expo, iOS y Android.  
**Dirección:** clara, útil y confiable; azul profundo, turquesa y acento cálido.  
**Alcance:** cliente y Klipp PRO.

## 1. Principios de experiencia

1. Una acción principal por pantalla, ubicada en una barra inferior segura.
2. El cliente debe poder iniciar una solicitud en tres decisiones: servicio, profesional/modo de asignación y confirmación.
3. Mostrar precio exacto antes del pago; no presentar estimaciones como importes cobrables.
4. Mostrar identidad, verificación, valoración y trabajos completados antes de confirmar.
5. No depender de conexión continua: conservar borradores localmente, mostrar cuándo se actualizó la información y reintentar operaciones idempotentes.
6. Usar lenguaje directo y dominicano neutro: “Buscar profesional”, “Está en camino”, “Escribir”, “Llamar”, “Volver a intentar”.
7. No ocultar cargos, condiciones de cancelación ni forma de pago.
8. Mantener controles táctiles de al menos 48 dp y contraste WCAG AA.

## 2. Identidad y tokens

Los tokens exportables viven en `app/src/lib/design-tokens.ts`; la paleta compartida existente está en `app/src/lib/brand.ts`.

### Colores

| Token | Claro | Uso |
|---|---|---|
| background | #F5F7FA | Fondo de pantalla |
| surface | #FFFFFF | Tarjetas y formularios |
| text | #142B45 | Texto principal |
| textSecondary | #526579 | Texto secundario |
| primary | #153B66 | Acción principal |
| secondary | #16B8AD | Confirmación, estados positivos |
| accent | #F4A340 | Atención y acción destacada |
| border | #DCE5EC | Separadores y contornos |
| danger | #B42318 | Errores y acciones destructivas |

El modo oscuro utiliza superficies azul pizarra y texto claro, no invierte colores de forma automática. El hook `useKlippTheme()` entrega el tema según el esquema del dispositivo.

### Tipografía

Familia objetivo: **Inter** (alternativa: Plus Jakarta Sans).  
Escala: 12 / 14 / 16 / 20 / 24 dp.  
Pesos: 400, 500, 600 y 700.  
Máximo tres tamaños simultáneos por pantalla. No usar mayúsculas sostenidas para mensajes largos.

**Pendiente de integración:** los archivos de fuente Inter deben incorporarse y cargarse con `expo-font` antes de aplicar el fontFamily en producción. Mientras tanto, React Native usa la fuente de sistema.

### Espaciado y forma

- Base de 8 dp; subunidad de 4 dp para microajustes.
- Espaciado frecuente: 8, 12, 16, 24 y 32 dp.
- Tarjetas: 16 dp de radio.
- Campos y botones: 12 dp.
- Chips: píldora.
- Botón principal: 52–60 dp; área táctil nunca inferior a 48 dp.
- Márgenes laterales: 16 dp en móviles compactos y 24 dp en pantallas grandes.

## 3. Componentes reutilizables

Implementados en `app/src/components/design-system.tsx`:

- `KlippButton`: primary, secondary, outline, ghost y danger; small, medium y large; loading y disabled.
- `KlippCard`: superficie consistente con borde y radio de tarjeta.
- `KlippBadge`: verified, success, warning, danger, neutral e info.
- `KlippChip`: seleccionado/no seleccionado y deshabilitado.
- `KlippField`: etiqueta, placeholder, ayuda y error accesible.
- `KlippScreenState`: loading, empty, error y offline.
- `KlippBottomAction`: acción fija inferior con zona segura gestionada por la pantalla anfitriona.

Reglas para componentes adicionales:
- Avatares: foto, iniciales de respaldo y estado de verificación separado.
- Valoración: número + estrella + total de reseñas; nunca sólo una estrella.
- Tarjeta de profesional: nombre, oficio, distancia, valoración, trabajos y precio confirmado.
- Filtros: chips horizontales con opción “Limpiar”.
- Campos: texto de error asociado al campo, no sólo un toast.
- Diálogos: reservar para confirmaciones destructivas, permisos o decisiones que no puedan deshacerse.

## 4. Navegación y arquitectura de pantallas

### Cliente — navegación principal

Barra inferior: **Inicio · Actividad · Mensajes · Perfil**.  
La búsqueda, filtros y detalle se abren como pantallas de navegación; la selección de fecha, hora y dirección puede presentarse en hojas modales.

### Cliente — pantallas

| Pantalla | Estructura y contenido | Acción principal |
|---|---|---|
| Splash | Marca, indicador discreto y carga de sesión | Automática |
| Onboarding 1 | “Resuelve lo de casa”, ilustración mínima de servicio | Continuar |
| Onboarding 2 | “Elige con confianza”, perfil verificado y reseñas | Continuar |
| Onboarding 3 | “Sigue cada paso”, mapa y chat | Empezar |
| Acceso / registro | Teléfono con prefijo RD, selector de país, aviso de privacidad | Enviar código |
| OTP | Seis dígitos, reenvío con temporizador y edición del teléfono | Verificar |
| Inicio | Dirección activa, búsqueda, categorías, profesionales cercanos, reserva reciente | Buscar servicio |
| Categoría | Descripción, filtros por precio, valoración, disponibilidad y distancia | Ver profesionales |
| Solicitud | Servicio, detalle opcional, fotos, dirección, fecha y hora en pasos cortos | Continuar |
| Búsqueda | Estado de búsqueda, tiempo estimado si está disponible, cancelar | Esperar / cancelar |
| Perfil profesional | Foto, verificación, oficio, experiencia, reseñas, trabajos, precio y disponibilidad | Elegir profesional |
| Seguimiento | Mapa, ubicación del profesional, ETA con hora de actualización, estado y datos de contacto | Contactar |
| Chat | Mensajes, adjuntar foto, estados de envío y aviso de conexión | Enviar mensaje |
| Llamada | Acción de llamada con consentimiento y número protegido si el proveedor lo permite | Llamar |
| Pago | Resumen, desglose, método habilitado, estado y recibo | Confirmar pago |
| Calificación | Estrellas, etiquetas rápidas, comentario opcional y propina voluntaria | Enviar valoración |
| Actividad | Próximos, en curso, completados y cancelados | Ver reserva |
| Perfil y ajustes | Datos, direcciones, métodos de pago, ayuda, privacidad y cerrar sesión | Guardar cambios |

### Profesional — navegación principal

Barra inferior: **Inicio · Trabajos · Ganancias · Perfil**.

| Pantalla | Estructura y contenido | Acción principal |
|---|---|---|
| Registro | Datos personales, teléfono, oficio único, zona de cobertura y disponibilidad | Continuar |
| Verificación | Documento, selfie/prueba de vida mediante proveedor habilitado, estado de revisión y motivo de rechazo | Enviar verificación |
| Inicio PRO | Estado online/offline, resumen de hoy, zona activa, próximas reservas y conectividad | Ponerse en línea |
| Solicitud entrante | Servicio, zona aproximada, precio/neto estimado, distancia, hora y cuenta regresiva | Aceptar |
| Rechazar | Acción secundaria protegida contra toque accidental | Rechazar |
| Trabajo activo | Dirección, mapa, contacto, instrucciones y checklist de estados | Iniciar / completar |
| Trabajos | Solicitudes, próximos, historial y cancelaciones | Abrir trabajo |
| Ganancias | Bruto, comisión Klipp, neto, disponible, pendiente e historial de liquidaciones | Solicitar retiro |
| Retiro | Método de cobro verificado, importe, comisiones y plazo | Confirmar retiro |
| Perfil PRO | Oficio, documentos, reseñas, zona, disponibilidad, tarifas y soporte | Guardar cambios |

## 5. Flujos críticos

### Pedir un servicio

1. Cliente toca una categoría o busca el oficio.
2. Elige un profesional o “Buscar cerca de mí”; ve precio y disponibilidad.
3. Confirma dirección, horario y detalles en una hoja de revisión. Se solicita pago sólo después de validar disponibilidad y precio exacto.

Para reservas con más datos, el formulario debe recordar el borrador y no perder fotos ni dirección al retroceder.

### Asignación automática

- La solicitud muestra búsqueda y tiempo de espera, no un falso profesional asignado.
- Si un profesional acepta, se presenta su perfil y comienza el seguimiento.
- Si nadie acepta, ofrecer ampliar zona, cambiar horario o elegir manualmente.
- Si se pierde la conexión, mostrar última actualización y reintentar consulta sin duplicar la reserva.

### Trabajo profesional

- Solicitud entrante con vibración opcional y notificación push.
- Aceptación explícita; rechazo separado y protegido.
- Al aceptar, mostrar dirección completa sólo cuando corresponda según reglas de privacidad y reserva.
- Estados claros: aceptado, en camino, llegó, trabajando y completado.

### Pago y cancelación

- El resumen muestra precio del servicio, cargos, descuento y total.
- No ofrecer efectivo, transferencia o tarjeta si el método no está habilitado y conciliado en el backend.
- Nunca marcar una reserva como pagada por una respuesta del cliente móvil: la confirmación proviene del servidor/proveedor.
- Mostrar política de cancelación antes de confirmar.

## 6. Estados universales

Cada pantalla con datos remotos debe cubrir:

- **Loading:** skeleton con la misma geometría del contenido; evitar pantalla blanca.
- **Empty:** explicación breve y acción útil (“Aún no tienes servicios. Busca uno para comenzar”).
- **Error:** mensaje comprensible, conservar lo escrito y ofrecer reintento.
- **Offline:** indicar que no hay conexión, mostrar datos guardados con fecha de actualización y deshabilitar acciones que no puedan completarse con seguridad.
- **Success:** confirmación concreta y siguiente paso.
- **Permission denied:** explicar por qué se necesita ubicación/cámara/notificaciones y ofrecer alternativa manual cuando sea posible.

## 7. Accesibilidad, rendimiento y conectividad

- Contraste mínimo WCAG AA: 4.5:1 para texto normal y 3:1 para texto grande y controles relevantes.
- No comunicar estado sólo con color: añadir icono y texto.
- Etiquetas accesibles para iconos; orden de lectura lógico.
- Fuentes escalables y formularios compatibles con teclado.
- Imágenes comprimidas, carga diferida y placeholders.
- No reproducir mapas continuamente en segundo plano; limitar actualizaciones de ubicación según estado del trabajo.
- Persistir borradores de solicitudes localmente; no persistir documentos de identidad ni datos de pago sensibles en almacenamiento no seguro.
- Reintentos con backoff y claves de idempotencia para operaciones de reserva/pago.
- Chat con cola local de mensajes no enviados y estado “Pendiente de conexión”.

## 8. Componentes visuales por estado

| Componente | Variantes |
|---|---|
| Botón | Principal, secundario, contorno, discreto, peligro |
| Campo | Normal, enfocado, error, solo lectura, deshabilitado |
| Tarjeta | Servicio, profesional, reserva, pago, resumen |
| Badge | Verificado, nuevo, en camino, completado, pendiente, cancelado |
| Selector | Chip, radio, checkbox, selector de fecha/hora |
| Navegación | Tab inferior, encabezado con volver, menú contextual |
| Aviso | Información, éxito, advertencia, error, sin conexión |
| Skeleton | Tarjeta, lista, perfil, mapa |
| Hoja modal | Selector, filtro, confirmación, detalle |

## 9. Criterios de aceptación antes de producción

- [ ] Todas las pantallas implementadas para cliente y profesional.
- [ ] Tema claro y oscuro revisados pantalla por pantalla.
- [ ] Estados loading, empty, error y offline en cada vista con datos remotos.
- [ ] Pruebas de accesibilidad y contraste en Android de gama media.
- [ ] Flujo completo de reserva, pago, webhook, asignación y cancelación validado en QA.
- [ ] Navegación probada con conexión intermitente.
- [ ] Textos revisados por hablantes de RD.
- [ ] Fuentes Inter integradas y verificadas en iOS/Android.
- [ ] No hay precios estimados presentados como cobros finales.
- [ ] No hay controles táctiles inferiores a 48 dp.

## 10. Estado de implementación

Este documento define el contrato visual y funcional. Los tokens y componentes base están añadidos al código. Las pantallas de producto existentes aún requieren migración progresiva a estos componentes y una auditoría visual en dispositivos; no se consideran rediseñadas por el mero hecho de haber actualizado los tokens.
