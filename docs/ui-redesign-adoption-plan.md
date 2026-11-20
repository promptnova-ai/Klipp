# Klipp — adopción del nuevo sistema de interfaz

## Decisión técnica

Usar **[almasriprojects/expo-ui-kit](https://github.com/almasriprojects/expo-ui-kit)** como referencia y fuente selectiva de componentes, no instalar el repositorio completo como dependencia ni sustituir la aplicación Expo existente.

Motivos:
- Klipp ya usa Expo Router, React Native y TypeScript; el kit también está construido para Expo Router y TypeScript.
- El kit incluye patrones de Booking, Marketplace, autenticación, OTP, mensajería, mapas y seguimiento, que cubren partes relevantes del producto.
- Centraliza tipografía, color, espaciado, radios, sombras y movimiento; facilita sustituir estilos inconsistentes por tokens compartidos.
- Licencia MIT declarada en su package.json y README.
- La versión publicada del kit declara Expo SDK 54 / React Native 0.81.5; Klipp está en Expo SDK 58 / React Native 0.88.0. Aunque sus peerDependencies declaran compatibilidad amplia, no se debe instalar el árbol completo ni asumir compatibilidad de todos sus componentes sin compilar y probar. Se portarán componentes concretos y se adaptarán a las dependencias ya presentes en Klipp.

## Alternativas evaluadas

| Repositorio | Encaje | Decisión |
|---|---|---|
| [almasriprojects/expo-ui-kit](https://github.com/almasriprojects/expo-ui-kit) | Componentes y plantillas de reserva/marketplace; estilos por tokens; MIT. No depende de NativeWind. | **Base recomendada para port selectivo** |
| [gluestack/gluestack-ui](https://github.com/gluestack/gluestack-ui) | Componentes Expo/React Native, accesibles y modulares. v5 orientado a NativeWind v5/Tailwind v4. | No introducir ahora: exige cambiar la base de estilos |
| [founded-labs/react-native-reusables](https://github.com/founded-labs/react-native-reusables) | Componentes estilo shadcn para React Native, MIT, basados en NativeWind. | Alternativa si se decide adoptar NativeWind |
| [iharshyadav/GoTrail](https://github.com/iharshyadav/GoTrail) | Clone educativo de ride-hailing con Expo, mapas, pagos y seguimiento. | Referencia de flujos, no copiar backend: usa Clerk/Neon y no coincide con Klipp |

## Dirección visual para Klipp

- Identidad corporativa como fuente de verdad: azul marino `#153B66`, azul profundo `#0E2D50`, turquesa `#16B8AD` y dorado cálido `#F4A340`.
- La experiencia principal conserva el lienzo claro `#F5F7FA`, superficies blancas y texto azul marino. El modo oscuro opcional usa fondos azul profundo y los mismos acentos turquesa/dorado; no se introduce una paleta negra/dorada ajena a la marca.
- Tipografía consistente, jerarquía fuerte y espaciado amplio.
- Cliente: búsqueda y elección de servicio primero; reserva guiada en pasos cortos; mapa y estado como foco durante el servicio.
- Klipp PRO: panel operativo; disponibilidad y solicitudes en primer plano; oferta entrante de pantalla completa con temporizador, ubicación, precio neto y acciones inequívocas.
- Mantener componentes nativos y navegación accesible; evitar que la estética de lujo reduzca legibilidad, contraste o velocidad de uso.

## Orden de implementación

1. Inventariar rutas, componentes compartidos, estados y estilos hardcodeados.
2. Definir tokens y componentes base compatibles con Expo SDK 58.
3. Rediseñar autenticación y selección de rol.
4. Rediseñar inicio del cliente y catálogo.
5. Rediseñar reserva y checkout sin modificar sus RPC de negocio.
6. Rediseñar Klipp PRO: inicio, disponibilidad, ofertas, agenda y tracking.
7. Unificar seguimiento, chat, historial y perfil.
8. Añadir pruebas visuales, accesibilidad, TypeScript, lint y export web.

## Restricciones

- No copiar ni sustituir código de backend, Auth, pagos o asignación de los repositorios de referencia.
- No introducir dependencias incompatibles con Expo SDK 58.
- No modificar contratos RPC ni estados de reserva como parte de un cambio puramente visual.
- Conservar los flujos existentes y comparar capturas antes/después por pantalla.
