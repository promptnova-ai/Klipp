export type ProKitItem = { id: string; label: string; required?: boolean };
export type ProKitCustomItem = { id: string; label: string; ready: boolean };
export type ProKitEntry = { readyIds: string[]; customItems: ProKitCustomItem[] };
export type ProKitMap = Record<string, ProKitEntry>;

const kits: Record<string, ProKitItem[]> = {
  barberia: [
    { id: 'clipper', label: 'Máquina cortapelo y cargador' },
    { id: 'trimmer', label: 'Patillera o perfiladora' },
    { id: 'guards', label: 'Peines guía y accesorios' },
    { id: 'scissors', label: 'Tijeras y peines profesionales' },
    { id: 'cape', label: 'Capa de barbería y protección' },
    { id: 'razors', label: 'Cuchillas y consumibles desechables' },
    { id: 'mirror', label: 'Espejo portátil' },
    { id: 'hygiene', label: 'Desinfectante y material de higiene' },
  ],
  peluqueria: [
    { id: 'hair-scissors', label: 'Tijeras profesionales y peines' },
    { id: 'dryer', label: 'Secador y difusor' },
    { id: 'styling-tools', label: 'Plancha, tenacillas o herramientas de peinado' },
    { id: 'brushes', label: 'Cepillos y accesorios de peinado' },
    { id: 'cape', label: 'Capas y toallas profesionales' },
    { id: 'spray', label: 'Atomizador y útiles de aplicación' },
    { id: 'hair-products', label: 'Champú, acondicionador y productos acordes al servicio' },
    { id: 'thermal', label: 'Protector térmico y productos de acabado' },
    { id: 'hygiene', label: 'Desinfección y material de higiene' },
  ],
  estetica: [
    { id: 'portable-tools', label: 'Equipo portátil propio para el tratamiento' },
    { id: 'beauty-products', label: 'Productos profesionales para el servicio contratado' },
    { id: 'disposables', label: 'Material desechable de un solo uso' },
    { id: 'gloves', label: 'Guantes y protección personal' },
    { id: 'towels', label: 'Toallas y textiles profesionales' },
    { id: 'sanitation', label: 'Desinfectante y material de higiene' },
    { id: 'lighting', label: 'Luz o lámpara portátil, cuando sea necesaria', required: false },
  ],
  limpieza: [
    { id: 'cleaning-products', label: 'Productos de limpieza propios' },
    { id: 'microfiber', label: 'Paños y mopas de microfibra' },
    { id: 'mop', label: 'Mopa o fregona y palo' },
    { id: 'broom', label: 'Escoba y recogedor' },
    { id: 'bucket', label: 'Cubo y útiles portátiles' },
    { id: 'brushes', label: 'Cepillos, estropajos y bayetas' },
    { id: 'gloves', label: 'Guantes y protección personal' },
    { id: 'bags', label: 'Bolsas y consumibles propios' },
    { id: 'vacuum', label: 'Aspiradora propia, si el servicio la requiere', required: false },
  ],
  carwash: [
    { id: 'wash-equipment', label: 'Equipo portátil de lavado' },
    { id: 'hoses', label: 'Mangueras y conexiones propias' },
    { id: 'buckets', label: 'Cubetas y accesorios de lavado' },
    { id: 'microfiber', label: 'Paños de microfibra limpios' },
    { id: 'brushes', label: 'Cepillos para carrocería y llantas' },
    { id: 'chemicals', label: 'Champú y productos de lavado propios' },
    { id: 'interior', label: 'Útiles y productos para el interior' },
    { id: 'protection', label: 'Guantes y protección personal' },
  ],
  detailing: [
    { id: 'polisher', label: 'Pulidora y accesorios' },
    { id: 'vacuum', label: 'Aspiradora o extractor propio' },
    { id: 'microfiber', label: 'Paños de microfibra por uso' },
    { id: 'brushes', label: 'Brochas y cepillos de detailing' },
    { id: 'chemicals', label: 'Químicos y productos profesionales' },
    { id: 'applicators', label: 'Aplicadores y pads' },
    { id: 'extension', label: 'Alargadores y conexiones propios' },
    { id: 'protection', label: 'Guantes y protección personal' },
  ],
  mantenimiento: [
    { id: 'toolbox', label: 'Caja de herramientas propia' },
    { id: 'hand-tools', label: 'Destornilladores, llaves y alicates' },
    { id: 'power-tools', label: 'Herramientas eléctricas necesarias' },
    { id: 'tester', label: 'Multímetro o equipo de medición, según el trabajo', required: false },
    { id: 'consumables', label: 'Tornillería y consumibles habituales' },
    { id: 'ppe', label: 'Equipo de protección personal' },
    { id: 'clean-up', label: 'Útiles propios para dejar el área recogida' },
  ],
};

export function getServiceKitItems(code: string, serviceName = ''): ProKitItem[] {
  const normalized = (code + ' ' + serviceName).toLocaleLowerCase();
  if (normalized.includes('masaj')) return [];
  if (normalized.includes('barber')) return kits.barberia;
  if (normalized.includes('peluquer')) return kits.peluqueria;
  if (normalized.includes('estet') || normalized.includes('belleza')) return kits.estetica;
  if (normalized.includes('limpieza') || normalized.includes('clean')) return kits.limpieza;
  if (normalized.includes('carwash') || normalized.includes('lavado')) return kits.carwash;
  if (normalized.includes('detailing')) return kits.detailing;
  if (normalized.includes('manten') || normalized.includes('repar')) return kits.mantenimiento;
  return [
    { id: 'own-tools', label: 'Herramientas propias adecuadas al servicio' },
    { id: 'own-products', label: 'Productos y consumibles propios' },
    { id: 'hygiene', label: 'Material de higiene y protección' },
  ];
}

export function parseProKit(value: unknown): ProKitMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: ProKitMap = {};
  for (const [serviceId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as { readyIds?: unknown; customItems?: unknown };
    const readyIds = Array.isArray(entry.readyIds)
      ? entry.readyIds.filter((item): item is string => typeof item === 'string')
      : [];
    const customItems = Array.isArray(entry.customItems)
      ? entry.customItems.filter((item): item is ProKitCustomItem => {
          if (!item || typeof item !== 'object') return false;
          const candidate = item as Partial<ProKitCustomItem>;
          return typeof candidate.id === 'string'
            && typeof candidate.label === 'string'
            && typeof candidate.ready === 'boolean';
        }).map((item) => ({ id: item.id, label: item.label.trim().slice(0, 80), ready: item.ready }))
      : [];
    result[serviceId] = { readyIds, customItems };
  }
  return result;
}

export function getKitReadiness(code: string, name: string, entry?: ProKitEntry) {
  const configured = entry ?? { readyIds: [], customItems: [] };
  const ready = new Set(configured.readyIds);
  const items = getServiceKitItems(code, name).map((item) => ({ ...item, available: ready.has(item.id) }));
  const customItems = configured.customItems.map((item) => ({ ...item, available: item.ready, required: true }));
  const all = [...items, ...customItems].filter((item) => item.required !== false);
  const missing = all.filter((item) => !item.available);
  return {
    items,
    customItems,
    total: all.length,
    readyCount: all.length - missing.length,
    missing,
    complete: all.length > 0 && missing.length === 0,
  };
}
