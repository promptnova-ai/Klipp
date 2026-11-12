/** Local, controlled illustrations per service (no dependency on remote images). */
const art = {
  barberia: require('../../assets/illustrations/barberia.svg'),
  peluqueria: require('../../assets/illustrations/peluqueria.svg'),
  estetica: require('../../assets/illustrations/estetica.svg'),
  carwash: require('../../assets/illustrations/carwash.svg'),
  detailing: require('../../assets/illustrations/detailing.svg'),
  limpieza_regular: require('../../assets/illustrations/limpieza_regular.svg'),
  limpieza_profunda: require('../../assets/illustrations/limpieza_profunda.svg'),
  oficinas: require('../../assets/illustrations/oficinas.svg'),
  mantenimiento: require('../../assets/illustrations/mantenimiento.svg'),
  fallback: require('../../assets/illustrations/default.svg'),
} as const;

export const heroArt = require('../../assets/illustrations/hero.svg');

export function serviceArt(code: string) {
  const c = code.toLowerCase();
  if (c.includes('barber')) return art.barberia;
  if (c.includes('peluquer')) return art.peluqueria;
  if (c.includes('estetica')) return art.estetica;
  if (c.includes('carwash')) return art.carwash;
  if (c.includes('detailing')) return art.detailing;
  if (c.includes('oficina')) return art.oficinas;
  if (c.includes('mantenimiento')) return art.mantenimiento;
  if (c.includes('profunda')) return art.limpieza_profunda;
  if (c.includes('limpieza')) return art.limpieza_regular;
  return art.fallback;
}
