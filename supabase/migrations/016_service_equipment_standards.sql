-- Klipp: transparent, service-specific professional equipment standards.
create table if not exists public.service_equipment_requirements (
  id bigint generated always as identity primary key,
  service_type_id integer not null references public.service_types(id) on delete cascade,
  item_name text not null,
  details text not null default '',
  required boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (service_type_id, item_name)
);

alter table public.service_equipment_requirements enable row level security;

drop policy if exists service_equipment_requirements_read on public.service_equipment_requirements;
create policy service_equipment_requirements_read
  on public.service_equipment_requirements
  for select to authenticated
  using (active);

-- Catalog standards are deliberately conservative: the exact kit depends on
-- the selected service and its scope. No customer-owned tools or products are assumed.
with standards(service_code, item_name, details, sort_order) as (
  values
    ('barberia', 'Máquina de corte y batería/cargador', 'Equipo propio, limpio y en buen estado.', 10),
    ('barberia', 'Tijeras, peines y cepillos', 'Herramientas profesionales adecuadas al corte.', 20),
    ('barberia', 'Capa y protección higiénica', 'Incluye protección limpia para cada cliente.', 30),
    ('barberia', 'Navajas y consumibles desechables', 'Hojas nuevas y material de un solo uso cuando corresponda.', 40),
    ('barberia', 'Desinfección y limpieza de herramientas', 'Productos y medios propios para higienizar el equipo.', 50),

    ('peluqueria', 'Secador y herramientas térmicas', 'Plancha, rizador u otros equipos según el servicio anunciado.', 10),
    ('peluqueria', 'Cepillos, peines y tijeras', 'Herramientas profesionales propias.', 20),
    ('peluqueria', 'Capa y protección higiénica', 'Material limpio para cada cliente.', 30),
    ('peluqueria', 'Champú, acondicionador y productos de acabado', 'Productos profesionales adecuados al tratamiento contratado.', 40),
    ('peluqueria', 'Protección térmica e higiene', 'Productos de protección y limpieza del equipo.', 50),

    ('estetica', 'Aparatos y herramientas del tratamiento', 'Solo los equipos correspondientes al servicio de estética ofrecido.', 10),
    ('estetica', 'Productos cosméticos y consumibles', 'Productos propios, adecuados y dentro de su fecha de uso.', 20),
    ('estetica', 'Material desechable e higiene', 'Guantes, aplicadores y consumibles de un solo uso cuando proceda.', 30),
    ('estetica', 'Desinfección del instrumental', 'Medios propios para limpiar y desinfectar el material reutilizable.', 40),

    ('carwash', 'Equipo portátil de lavado', 'Mangueras, pulverizadores o equipo portátil según el servicio.', 10),
    ('carwash', 'Agua y alimentación autónomas cuando sean necesarias', 'Si el servicio requiere una fuente de agua o energía, el profesional debe llevar una solución propia o confirmar previamente las condiciones.', 20),
    ('carwash', 'Champú y productos de limpieza automotriz', 'Productos adecuados para la superficie del vehículo.', 30),
    ('carwash', 'Cubos, guantes de lavado y microfibras', 'Material propio y limpio para evitar daños en la pintura.', 40),
    ('carwash', 'Aspiradora y accesorios cuando estén incluidos', 'No se utilizará equipo del cliente.', 50),

    ('detailing', 'Pulidora y accesorios cuando correspondan', 'Equipo profesional con pads adecuados al acabado.', 10),
    ('detailing', 'Microfibras, aplicadores y cepillos', 'Material propio, limpio y separado por uso/superficie.', 20),
    ('detailing', 'Químicos y productos de detailing', 'Productos adecuados para pintura, cristales, llantas e interiores.', 30),
    ('detailing', 'Aspiradora y equipo de secado', 'Equipo propio según el paquete contratado.', 40),
    ('detailing', 'Protección personal', 'Guantes y protección necesaria para los productos utilizados.', 50),

    ('limpieza_regular', 'Aspiradora y accesorios', 'Equipo propio para suelos, tapicerías y rincones según el servicio.', 10),
    ('limpieza_regular', 'Mopa, cubo y útiles de fregado', 'No se utilizarán utensilios del cliente.', 20),
    ('limpieza_regular', 'Paños de microfibra, cepillos y esponjas', 'Material propio, limpio y diferenciado por zonas.', 30),
    ('limpieza_regular', 'Productos de limpieza', 'Detergentes y desinfectantes adecuados a las superficies.', 40),
    ('limpieza_regular', 'Guantes, bolsas y protección', 'Consumibles y protección personal propios.', 50),

    ('limpieza_profunda', 'Aspiradora y accesorios especializados', 'Equipo propio para limpieza profunda.', 10),
    ('limpieza_profunda', 'Mopa, cubos, cepillos y útiles', 'Herramientas propias para distintas superficies.', 20),
    ('limpieza_profunda', 'Productos de limpieza profunda', 'Desengrasantes y productos adecuados a cada superficie.', 30),
    ('limpieza_profunda', 'Microfibras y consumibles', 'Material limpio y suficiente para el alcance contratado.', 40),
    ('limpieza_profunda', 'Guantes y equipo de protección', 'Protección acorde con los productos y tareas.', 50),

    ('limpieza-oficinas', 'Aspiradora y útiles de suelo', 'Equipo propio para las superficies del espacio.', 10),
    ('limpieza-oficinas', 'Paños, microfibras y cepillos', 'Material propio y diferenciado por zonas.', 20),
    ('limpieza-oficinas', 'Productos de limpieza', 'Productos adecuados para mobiliario y superficies de oficina.', 30),
    ('limpieza-oficinas', 'Bolsas, guantes y consumibles', 'Suministros propios para completar el servicio.', 40),

    ('mantenimiento', 'Caja de herramientas manuales', 'Destornilladores, alicates, llaves y herramientas según el trabajo.', 10),
    ('mantenimiento', 'Herramientas eléctricas y baterías', 'Taladro u otros equipos solo cuando el trabajo lo requiera.', 20),
    ('mantenimiento', 'Instrumentos de medición y diagnóstico', 'Multímetro, nivel o medidores según la tarea.', 30),
    ('mantenimiento', 'Consumibles y repuestos acordados', 'Materiales necesarios, presupuestados y aprobados antes del trabajo.', 40),
    ('mantenimiento', 'Equipo de protección personal', 'Guantes, gafas y protección adecuada al riesgo.', 50)
)
insert into public.service_equipment_requirements
  (service_type_id, item_name, details, sort_order)
select st.id, standards.item_name, standards.details, standards.sort_order
from standards
join public.service_types st on st.code = standards.service_code
on conflict (service_type_id, item_name) do update
set details = excluded.details,
    sort_order = excluded.sort_order,
    active = true;

grant select on public.service_equipment_requirements to authenticated;
