/**
 * Photography-led service imagery for Klipp.
 * Remote Unsplash images are used as visual content, not decorative placeholders.
 * Keep these URLs stable and map every service family to a distinct photograph.
 */
const photo = (id: string, width = 1200) => ({
  uri: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`,
});

export const heroArt = photo('photo-1600607687939-ce8a6c25118c', 1800);

const art = {
  barberia: photo('photo-1503951914875-452162b0f3f1'),
  peluqueria: photo('photo-1560066984-138dadb4c035'),
  estetica: photo('photo-1570172619644-dfd03ed5d881'),
  carwash: photo('photo-1600320254374-ce2d293c324e'),
  detailing: photo('photo-1492144534655-ae79c964c9d7'),
  limpieza_regular: photo('photo-1581578731548-c64695cc6952'),
  limpieza_profunda: photo('photo-1584622650111-993a426fbf0a'),
  oficinas: photo('photo-1497215728101-856f4ea42174'),
  mantenimiento: photo('photo-1621905251918-48416bd8575a'),
  fallback: photo('photo-1600607687939-ce8a6c25118c'),
} as const;

export function serviceArt(code: string) {
  const c = code.toLowerCase();
  if (c.includes('barber')) return art.barberia;
  if (c.includes('peluquer') || c.includes('hair')) return art.peluqueria;
  if (c.includes('estetica') || c.includes('belleza') || c.includes('spa')) return art.estetica;
  if (c.includes('carwash') || c.includes('lavado')) return art.carwash;
  if (c.includes('detailing') || c.includes('auto')) return art.detailing;
  if (c.includes('oficina')) return art.oficinas;
  if (c.includes('mantenimiento') || c.includes('repar')) return art.mantenimiento;
  if (c.includes('profunda')) return art.limpieza_profunda;
  if (c.includes('limpieza') || c.includes('clean')) return art.limpieza_regular;
  return art.fallback;
}
