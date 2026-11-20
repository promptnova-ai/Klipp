# Klipp — Sistema UX/UI móvil

**Producto:** servicios a domicilio bajo demanda en República Dominicana.  
**Plataformas:** React Native + Expo, Android e iOS.  
**Dirección:** moderna, clara y confiable; azul profundo, turquesa y acento cálido.  
**Alcance:** cliente y Klipp PRO.

## Principios de experiencia

1. Una acción principal por pantalla, ubicada en la zona inferior segura.
2. Precio final, profesional, dirección y horario visibles antes de confirmar.
3. Tres decisiones para solicitudes simples con datos guardados; no ocultar pasos cuando falten dirección, fotos o detalles.
4. Verificación, valoración y trabajos completados visibles antes de contratar.
5. Conectividad intermitente contemplada: conservar borradores, indicar última actualización y reintentar sin duplicar reservas ni pagos.
6. Lenguaje directo y dominicano neutro: “Pide un servicio”, “Buscar profesional”, “Está en camino”, “Confirmar y pagar”.
7. No mostrar métodos de pago que el backend no tenga habilitados y conciliados.
8. Controles táctiles de al menos 48 dp y contraste WCAG AA.

## Identidad y tokens

La fuente exportable es `app/src/design-system/tokens.ts`. Los componentes nativos base están en `app/src/design-system/components.tsx`. La paleta histórica de `app/src/lib/brand.ts` se conserva para no romper las pantallas actuales durante la migración.

### Colores

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| background | #F7F9FC | #0C1724 | Fondo de pantalla |
| surface | #FFFFFF | #142437 | Tarjetas y formularios |
| text | #102A43 | #F4F7FA | Texto principal |
| textSecondary | #526579 | #B6C4D2 | Texto secundario |
| primary | #123B66 | #78AEE4 | Acción principal |
| secondary | #13AFA5 | #45C9BF | Acciones secundarias |
| accent | #F2A541 | #F6B95F | Atención y énfasis |
| border | #DCE5EE | #2A4056 | Separadores y contornos |
| danger | #B42318 | #FF8D83 | Errores y acciones destructivas |

El tema oscuro es una paleta diseñada expresamente; no es una inversión automática del tema claro. Turquesa y ámbar se usan con texto de alto contraste, nunca con texto blanco pequeño si no alcanza AA.

### Tipografía

Familia objetivo: Inter; alternativa Plus Jakarta Sans; fallback del sistema operativo. Escala de tokens: 12 / 14 / 16 / 22 / 28 dp. Pesos: 400, 500, 600, 700 y 800. Máximo tres tamaños visuales por pantalla. Las fuentes deben incorporarse con `expo-font` antes de fijar una familia personalizada en producción.

### Espaciado y forma

- Cuadrícula base de 8 dp, subunidad de 4 dp.
- Espaciados habituales: 8, 12, 16, 24 y 32 dp.
- Tarjetas: 16 dp de radio; paneles destacados: 20–24 dp.
- Campos y botones: 12 dp.
- CTA principal: 52 dp; controles nunca inferiores a 48 dp.
- Márgenes laterales: 16 dp en móviles compactos, 24 dp en pantallas amplias.

### Movimiento y elevación

- Microfeedback: 120 ms; interacción: 200 ms; transición: 260 ms.
- Animaciones cortas y discretas; respetar Reduce Motion.
- Elevación sutil en tarjetas; sombras fuertes sólo para elementos flotantes.
- No animar continuamente elementos que consuman batería o distraigan.

## Componentes nativos base

Importar desde `app/src/design-system/components.tsx`:

- `KlippButton`: primary, secondary, outline, ghost y danger; large/medium; loading y disabled.
- `KlippCard`: superficie consistente, borde, radio y elevación discreta.
- `KlippField`: etiqueta, ayuda, error y props estándar de `TextInput`.
- `KlippStatus`: neutral, success, warning, danger e info.
- `KlippScreenState`: loading, empty, error y offline con CTA opcional.
- `KlippServiceCard`: tarjeta de catálogo con categoría, descripción, precio orientativo y duración, sobre la superficie compartida.
- `KlippProfessionalCard`: ficha reutilizable para resultados, selección de oferta y seguimiento; admite avatar, valoración, reseñas, trabajos, distancia, tarifa base y duración sin inventar datos ausentes.
- `KlippCard`: contenedor base compartido para tarjetas de reservas y otros bloques de contenido.

Estos componentes no requieren dependencias adicionales. Los iconos de línea deben mantener un solo lenguaje visual y medir 20–24 dp. Usar `expo-symbols` donde esté soportado o el paquete de iconos ya adoptado por la app; no mezclar packs arbitrariamente.

Componentes a estandarizar en siguientes iteraciones: avatar verificado, tarjeta de profesional, tarjeta de reserva, filtros, navegación inferior, barra de acción segura, selector de fecha/hora, mapa con tarjeta ETA, skeletons y hoja modal.

## Navegación

### Cliente

Tabs: **Inicio · Actividad · Mensajes · Perfil**.

- Inicio: buscar servicio, categorías y profesionales cercanos.
- Actividad: reservas en curso e historial.
- Mensajes: conversaciones ligadas a una reserva.
- Perfil: datos, direcciones, pagos, soporte y ajustes.

### Profesional

Tabs: **Trabajos · Ganancias · Perfil**.

- Inicio/Trabajos: estado En línea/Desconectado, solicitudes y agenda.
- Ganancias: disponible, pendiente, retirado, comisión y liquidaciones.
- Perfil: oficio, zona, horarios, tarifa, verificación y reseñas.

## Inventario de pantallas — Cliente

| Pantalla | Estructura y contenido | Acción principal |
|---|---|---|
| Splash | Marca y carga de sesión; sin animación bloqueante | Automática |
| Onboarding 1 | “Resuelve lo de casa”, ilustración mínima | Continuar |
| Onboarding 2 | “Elige con confianza”, verificación y reseñas | Continuar |
| Onboarding 3 | “Sigue cada paso”, mapa y chat | Empezar |
| Registro | Teléfono, prefijo RD +1 y opciones 809/829/849 | Enviar código |
| OTP | Seis dígitos, reenvío con temporizador y editar número | Verificar |
| Inicio | Saludo, ubicación editable, búsqueda, categorías, cercanos y servicio reciente | Buscar servicio |
| Categoría | Descripción, filtros por disponibilidad, distancia, precio y valoración | Ver profesionales |
| Solicitud | Servicio, variante, descripción, fotos, dirección, referencia y horario | Continuar |
| Búsqueda | Estado de espera, cancelación y actualización; sin spinner infinito | Esperar |
| Perfil profesional | Foto, nombre, verificado, rating + reseñas, trabajos, experiencia y precio | Elegir |
| Seguimiento | Mapa, ETA, última actualización, dirección, chat y llamada | Contactar |
| Chat | Mensajes, fotos, estados de envío y conexión | Enviar |
| Llamada | Acción de llamada y alternativa de chat | Llamar |
| Pago | Resumen, total final, métodos habilitados y recibo | Confirmar pago |
| Calificación | Estrellas, etiquetas, comentario opcional y propina voluntaria | Enviar valoración |
| Historial | En curso, completados y cancelados | Ver reserva |
| Perfil/ajustes | Datos, direcciones, pagos, notificaciones, privacidad y soporte | Guardar |

## Inventario de pantallas — Profesional

| Pantalla | Estructura y contenido | Acción principal |
|---|---|---|
| Registro | Teléfono OTP, datos, oficio principal único y zona | Continuar |
| Verificación | Documento, selfie/prueba de vida, estado y motivo de rechazo | Enviar verificación |
| Inicio PRO | Toggle online/offline, resumen del día, agenda y conexión | Ponerse en línea |
| Solicitud entrante | Servicio, zona, distancia, horario, bruto, comisión y neto estimado | Aceptar |
| Rechazo | Acción secundaria separada y protegida de toques accidentales | Rechazar |
| Trabajo activo | Dirección, mapa, instrucciones, chat y estados del trabajo | Iniciar / terminar |
| Trabajos | Solicitudes, próximos, historial y cancelaciones | Abrir trabajo |
| Ganancias | Bruto, comisión Klipp, neto, disponible y pendiente | Ver movimientos |
| Retiro | Método verificado, importe, comisiones y plazo | Confirmar retiro |
| Perfil PRO | Oficio, documentos, zona, disponibilidad, tarifas y reseñas | Guardar |

## Flujos críticos

### Pedir un servicio

1. El cliente toca una categoría o busca un oficio.
2. Elige profesional o “Buscar cerca de mí”; ve disponibilidad y tarifa.
3. Revisa dirección, horario, detalles y precio final antes de pagar.

El objetivo de tres decisiones sólo aplica a solicitudes simples con dirección y método guardados. No sacrificar claridad ni pedir datos ocultos para forzar ese número.

### Asignación automática

- Mostrar “Buscando profesionales” hasta que exista aceptación real.
- No inventar un profesional asignado ni un ETA no calculado.
- La cotización final debe corresponder a un profesional y tarifa concretos antes del pago.
- Si no hay disponibilidad, ofrecer cambiar horario/zona o elegir manualmente.
- Si se pierde conexión, mostrar la última actualización y reintentar la consulta sin crear otra reserva.

### Trabajo profesional

- Notificación entrante con vibración opcional.
- Aceptar es acción primaria; rechazar es secundaria y deliberada.
- Mostrar dirección completa según estado y reglas de privacidad.
- Estados: aceptado, en camino, llegó, trabajando y completado.

### Pago y cancelación

- Desglosar servicio, cargos, descuentos y total.
- Nunca marcar una reserva como pagada desde una respuesta del cliente móvil: la confirmación procede del backend/proveedor.
- Mostrar política de cancelación antes de confirmar.
- No presentar efectivo, transferencia o tarjeta como disponibles si no están integrados y conciliados.

## Estados universales

Toda pantalla con datos remotos debe definir:

- **Loading:** skeleton con geometría del contenido final.
- **Empty:** explicación y acción útil.
- **Error:** mensaje claro, datos conservados y reintento.
- **Offline:** aviso de desconexión, datos guardados con fecha y acciones no seguras deshabilitadas.
- **Success:** confirmación concreta y siguiente paso.
- **Sin permiso:** explicar el beneficio y permitir alternativa manual cuando sea posible.

## Accesibilidad y resiliencia

- WCAG AA: contraste 4.5:1 para texto normal y 3:1 para texto grande y controles relevantes.
- No comunicar estados sólo con color: incluir texto e icono.
- Etiquetas accesibles, orden de lectura lógico y fuentes escalables.
- Teclado adecuado por campo: teléfono numérico, OTP numérico, comentarios estándar.
- Imágenes comprimidas, carga diferida y placeholders estables.
- La dirección manual debe funcionar aunque falle geolocalización.
- Borradores locales; nunca guardar documentos de identidad o datos de pago sensibles en almacenamiento no seguro.
- Reintentos con backoff e idempotencia en reserva y pago.
- Chat con cola de mensajes no enviados y estado “Pendiente de conexión”.
- Seguimiento con hora de última actualización; no fingir tiempo real si la conexión se pierde.

## Criterios de aceptación

- [ ] Todas las pantallas de cliente y profesional implementadas.
- [ ] Tema claro y oscuro revisados pantalla por pantalla.
- [ ] Loading, empty, error y offline en cada vista remota.
- [ ] Contraste y tamaños táctiles comprobados en Android de gama media.
- [ ] Reserva, pago, webhook, asignación y cancelación validados en QA.
- [ ] Navegación probada con conexión intermitente.
- [ ] Textos revisados con hablantes de República Dominicana.
- [ ] Fuentes integradas y verificadas en iOS/Android.
- [ ] Ningún precio estimado presentado como total cobrable.
- [ ] Ningún toque principal inferior a 48 dp.

## Estado de implementación

En esta rama se añaden tokens exportables y componentes nativos reutilizables. El documento define el contrato visual y el inventario de producto; no significa que todas las pantallas existentes ya hayan sido migradas. La adopción debe hacerse por flujo, con revisión visual y pruebas en dispositivos reales.
