# Klipp — Estándar de compatibilidad móvil iOS y Android

## Alcance

Este estándar aplica a toda la aplicación móvil: cliente, profesional Klipp PRO, administración disponible en móvil, autenticación, reservas, seguimiento, chat, notificaciones, perfiles y formularios.

## Reglas de implementación

- Usar React Native y componentes compatibles con iOS y Android; no asumir dimensiones fijas de un único dispositivo.
- Medir el espacio disponible con `useWindowDimensions` cuando la composición dependa del ancho o alto.
- Preferir `flex`, `flexWrap`, `minWidth: 0`, `maxWidth` y anchuras relativas frente a anchuras rígidas.
- Mantener safe areas para notch, Dynamic Island, cámara frontal, barra de estado y gesto/barra inferior.
- Mantener navegación inferior dentro del área segura y ocultarla cuando el teclado está abierto.
- Formularios desplazables: teclado numérico/email correcto, `keyboardShouldPersistTaps="handled"`, ajuste de teclado por plataforma y posibilidad de desplazar el campo activo a la vista.
- No comprimir pasos, etiquetas o botones en una fila estrecha; reducir la información secundaria antes de reducir la legibilidad.
- Objetivos táctiles de al menos 44 pt en iOS y 48 dp en Android siempre que el patrón lo permita.
- Respetar el escalado de texto del sistema. No desactivar `allowFontScaling` para ocultar problemas de layout.
- Revisar contraste, orden de lectura, etiquetas accesibles y estados seleccionados más allá del color.
- Mapas, modales, selectores y notificaciones deben tener estados alternativos cuando permisos o servicios del dispositivo no estén disponibles.

## Matriz de dispositivos de QA

| Plataforma | Ancho lógico de referencia | Cobertura |
|---|---:|---|
| iPhone compacto | 375 pt | Formularios, cabecera, tab bar, teclado |
| iPhone estándar | 390 pt | Flujos completos cliente y PRO |
| iPhone grande | 430 pt | Flujos completos y escalado de texto |
| Android compacto | 320 dp | Sin desbordamiento horizontal |
| Android estándar | 360 dp | Flujos completos y navegación |
| Android medio | 393 dp | Flujos completos |
| Android grande | 412 dp | Flujos completos y escalado de texto |

Añadir pruebas en dispositivos reales de al menos dos fabricantes Android y en iPhone con notch o Dynamic Island.

## Evidencia obligatoria para cerrar QA

Por cada caso registrar dispositivo, versión de sistema, versión/build de Klipp, tamaño lógico, tamaño de fuente, pantalla, pasos, resultado y captura sin datos personales. Ejecutar los flujos en ambos sistemas; un pase en web o en un único emulador no demuestra compatibilidad móvil.

## Estado de esta iteración

Se han aplicado ajustes globales de safe area y teclado a las rutas Cliente y PRO, compactación de la navegación inferior, y ajustes de teclado y anchura en login/onboarding. Se han actualizado los controles compartidos de teléfono y progreso.

**No se declara compatibilidad certificada:** faltan builds iOS/Android, compilación TypeScript/lint, ejecución en simuladores y dispositivos físicos, pruebas de accesibilidad y evidencia visual por tamaño.
