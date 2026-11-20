-- Starter knowledge articles grounded in current Klipp app behaviour.
-- ON CONFLICT DO NOTHING preserves any later edits made by the operator.
insert into public.support_knowledge_articles (slug, title, content, category, published)
values
(
  'estados-de-una-reserva',
  'Estados de una reserva en Klipp',
  'Una reserva puede pasar por distintos estados. Solicitud enviada significa que Klipp está buscando o esperando la aceptación de un profesional. Pago pendiente significa que hace falta completar el paso de pago. Programada significa que la reserva está confirmada para la fecha indicada. En camino indica que el profesional ha iniciado el desplazamiento. Profesional en el lugar indica que ha llegado. Servicio en curso significa que el trabajo ha comenzado. Servicio terminado indica que el profesional ha marcado el trabajo como completado. Servicio confirmado indica que el cliente ha confirmado la finalización. Cancelada significa que la reserva fue cancelada. En revisión indica que existe una incidencia o disputa. Expirada significa que la solicitud dejó de estar disponible. Si el estado no coincide con lo que ocurre, abre una consulta vinculada a esa reserva.',
  'reservas',
  true
),
(
  'contacto-y-consultas',
  'Cómo contactar con el equipo Klipp',
  'Puedes abrir el Centro de ayuda desde tu cuenta Klipp. Selecciona la categoría que mejor describa tu consulta, vincula una reserva si corresponde y explica lo ocurrido. Puedes continuar la conversación desde el mismo caso. Si el asistente no encuentra información fiable o el asunto requiere una decisión humana, el caso se deriva al equipo Klipp. No compartas contraseñas, códigos OTP ni datos completos de tarjetas.',
  'soporte',
  true
),
(
  'privacidad-de-ubicacion',
  'Privacidad de la dirección y ubicación',
  'Klipp limita el acceso a la ubicación exacta del cliente. Antes de aceptar una solicitud, el profesional recibe únicamente una zona aproximada para valorar el servicio. La dirección completa, las referencias y las coordenadas exactas se habilitan para el profesional asignado una vez aceptada la reserva. No envíes direcciones completas ni coordenadas por el chat de soporte.',
  'privacidad',
  true
),
(
  'pagos-y-reembolsos',
  'Consultas sobre pagos y reembolsos',
  'Si detectas un cobro que no reconoces, un importe incorrecto o necesitas solicitar una devolución, abre una consulta en la categoría Pago y reembolso y vincula la reserva cuando sea posible. El asistente puede ayudarte a identificar la información necesaria, pero no puede aprobar reembolsos, prometer compensaciones ni confirmar plazos. El equipo Klipp revisará el estado del pago y te responderá por el caso.',
  'pagos',
  true
),
(
  'comunicacion-dentro-de-klipp',
  'Comunicación dentro de Klipp',
  'La comunicación relacionada con una reserva debe mantenerse dentro de Klipp mediante las funciones disponibles en la aplicación. Usa el chat de la reserva para coordinar el servicio y el Centro de ayuda para consultas o reclamaciones. No publiques ni compartas datos personales de otras personas.',
  'privacidad',
  true
),
(
  'herramientas-del-profesional',
  'Herramientas y preparación del servicio',
  'El profesional debe acudir con sus propias herramientas para realizar el servicio. Antes de iniciar el trabajo debe confirmar la preparación y los materiales requeridos en la aplicación. Si el servicio no puede realizarse por falta de herramientas o materiales, comunícalo mediante el Centro de ayuda y vincula la reserva.',
  'profesionales',
  true
)
on conflict (slug) do nothing;
