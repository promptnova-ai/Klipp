import type { ServiceType } from '@/lib/types';

export type CatalogServiceLike = Pick<ServiceType, 'code' | 'name'> & { category_name?: string | null };

export function isCatalogServiceVisible(service: Pick<ServiceType, 'code'>) {
  return service.code !== 'masajes';
}

export function getCatalogServiceName(service: CatalogServiceLike) {
  switch (service.code) {
    case 'barberia': return 'Barbería para hombre';
    case 'peluqueria': return 'Peluquería para mujer';
    case 'estetica': return 'Estética y cuidado personal';
    case 'carwash': return 'Lavado de vehículos a domicilio';
    case 'detailing': return 'Detailing automotriz a domicilio';
    default: return service.name;
  }
}

export function getCatalogCategoryName(service: CatalogServiceLike) {
  switch (service.code) {
    case 'barberia': return 'Barbería para hombre';
    case 'peluqueria': return 'Peluquería para mujer';
    case 'estetica': return 'Estética y cuidado personal';
    case 'carwash': return 'Lavado de vehículos';
    case 'detailing': return 'Detailing automotriz';
    case 'limpieza_regular':
    case 'limpieza_profunda':
    case 'limpieza-oficinas':
      return 'Limpieza de casas y oficinas';
    case 'mantenimiento':
      return 'Mantenimiento y reparaciones';
    default:
      return service.category_name || 'Otros servicios';
  }
}

export function getCatalogCategoryDescription(category: string) {
  switch (category) {
    case 'Barbería para hombre': return 'Corte, barba y cuidado masculino';
    case 'Peluquería para mujer': return 'Corte, peinado y cuidado capilar';
    case 'Estética y cuidado personal': return 'Tratamientos y cuidado personal';
    case 'Lavado de vehículos': return 'Limpieza exterior e interior';
    case 'Detailing automotriz': return 'Acabado y cuidado especializado';
    case 'Limpieza de casas y oficinas': return 'Tu hogar o espacio de trabajo';
    case 'Mantenimiento y reparaciones': return 'Soluciones para tu hogar';
    default: return 'Servicios profesionales a domicilio';
  }
}
