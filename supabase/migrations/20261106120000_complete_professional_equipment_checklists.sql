-- Complete the professional-owned equipment checklist in production.
-- Keep entries service-specific and idempotent by service code + item name.
with additions(service_code, item_name, details, sort_order) as (
  values
    ('barberia', 'Cuchillas y protección desechable', 'Hojas nuevas, protección de cuello y consumibles de un solo uso cuando corresponda.', 10),
    ('barberia', 'Desinfección entre clientes', 'Productos propios para limpiar y desinfectar máquinas, tijeras y peines.', 20),
    ('carwash', 'Cubos, guantes y útiles de lavado', 'Cubos, guantes, cepillos y accesorios propios adecuados al vehículo.', 10),
    ('carwash', 'Secado y protección de superficies', 'Toallas de microfibra limpias y productos seguros para pintura, cristales y llantas.', 20),
    ('detailing', 'Pads y aplicadores', 'Pads, aplicadores y cepillos adecuados al tratamiento y a cada superficie.', 10),
    ('detailing', 'Protección personal', 'Guantes y protección necesaria para manipular productos de detailing.', 20),
    ('estetica', 'Aparatos específicos del tratamiento', 'Equipos propios correspondientes únicamente a los tratamientos que ofreces.', 10),
    ('estetica', 'Cosméticos y consumibles propios', 'Productos adecuados, etiquetados y dentro de su fecha de uso.', 20),
    ('limpieza_profunda', 'Mopa, cubos y cepillos', 'Útiles propios para suelos, juntas y superficies de difícil acceso.', 10),
    ('limpieza_profunda', 'Microfibras y consumibles', 'Paños limpios, esponjas y consumibles suficientes para el trabajo contratado.', 20),
    ('limpieza_profunda', 'Guantes y protección personal', 'Protección adecuada a las tareas y a los productos utilizados.', 30),
    ('limpieza_regular', 'Mopa, cubos y útiles de fregado', 'Herramientas propias; no se utilizarán utensilios del cliente.', 10),
    ('limpieza_regular', 'Microfibras, cepillos y protección', 'Paños limpios, cepillos, guantes y bolsas para completar el servicio.', 20),
    ('limpieza-oficinas', 'Aspiradora y útiles de suelo', 'Equipo propio para las superficies y áreas incluidas en el servicio.', 10),
    ('limpieza-oficinas', 'Microfibras, bolsas y protección', 'Material propio y diferenciado por zonas, con consumibles suficientes.', 20),
    ('mantenimiento', 'Herramientas manuales y eléctricas', 'Caja de herramientas, taladro u otros equipos propios según los trabajos ofrecidos.', 10),
    ('mantenimiento', 'Medición, diagnóstico y protección', 'Instrumentos adecuados a la tarea y equipo de protección personal.', 20),
    ('peluqueria', 'Capa y protección higiénica', 'Capas limpias y protección adecuada para cada cliente.', 10),
    ('peluqueria', 'Protección térmica y desinfección', 'Productos para proteger el cabello y medios propios para limpiar las herramientas.', 20)
)
insert into public.service_equipment_requirements
  (service_type_id, item_name, details, required, sort_order, active)
select st.id, a.item_name, a.details, true, a.sort_order, true
from additions a
join public.service_types st on st.code = a.service_code and st.active
where not exists (
  select 1
  from public.service_equipment_requirements existing
  where existing.service_type_id = st.id
    and existing.item_name = a.item_name
);
