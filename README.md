# Klipp

Klipp es una plataforma de servicios presenciales a domicilio para República Dominicana. El cliente elige una profesión y modalidad, selecciona un profesional o utiliza **Cerca de mí** para asignación automática, confirma el precio y sigue el servicio desde la aplicación.

## Aplicación y tecnología

- Cliente universal en `app/`: Expo SDK 58, React Native, React y TypeScript.
- Backend en `supabase/`: PostgreSQL/PostGIS, Supabase Auth, RLS, Realtime, Storage y Edge Functions.
- Moneda: DOP. Comisión configurada actualmente: 7 %.
- Profesiones activas: limpieza regular, limpieza profunda, barbería, peluquería, estética, carwash, detailing, limpieza de oficinas y mantenimiento técnico. Masajes está excluido.
- Cada profesional publica una sola profesión principal y configura precio/duración por modalidad. Debe llevar sus propias herramientas, equipos, productos y materiales.

## Empezar

Consulta [la guía de configuración de la aplicación](app/README.md) para variables de entorno, instalación, desarrollo local y validación.

Comandos principales:

```bash
cd app
npm ci
npx expo start
```

## Documentación principal

- [Especificación funcional vigente](PROJECT_SPEC.md)
- [Escenarios de QA](QA_SCENARIOS.md)
- [Pagos AZUL](docs/payments-azul-integration.md)
- [Notificaciones y despacho](docs/notifications-setup.md)

## Estado del piloto

El código principal está en `main` y los cambios recientes pasan CI. El último despliegue web READY consultado corresponde al commit `586400f`; el cambio de autenticación fusionado después aún no está publicado porque Vercel ha alcanzado el límite diario de builds. La base de producción tiene el catálogo de 40 modalidades y las migraciones de seguridad/onboarding. No se deben considerar habilitados los pagos reales: la afiliación y certificación AZUL siguen pendientes. También faltan tarifas profesionales reales, pruebas push en dispositivos físicos y validación final de los flujos completos con profesionales/clientes de piloto.

No uses datos de clientes reales para pruebas. Aplica migraciones primero en QA y revisa el historial del proyecto Supabase antes de cualquier cambio de esquema.
