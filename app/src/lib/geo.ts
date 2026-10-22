export function sectorCenterToEwkt(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'type' in value && 'coordinates' in value) {
    const point = value as { type: unknown; coordinates: unknown };
    if (point.type === 'Point' && Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
      const [longitude, latitude] = point.coordinates;
      if (typeof longitude === 'number' && typeof latitude === 'number') {
        return coordinatesToEwkt(longitude, latitude);
      }
    }
    return null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const pointMatch = trimmed.match(/^(?:SRID=4326;)?POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (pointMatch) return coordinatesToEwkt(Number(pointMatch[1]), Number(pointMatch[2]));

  const hex = trimmed.replace(/^\\x/i, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  if (bytes.length < 21) return null;

  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  if (!littleEndian && bytes[0] !== 0) return null;
  const geometryType = view.getUint32(1, littleEndian);
  if ((geometryType & 0xff) !== 1) return null;
  const hasSrid = (geometryType & 0x20000000) !== 0;
  let offset = 5;
  if (hasSrid) {
    if (bytes.length < 25 || view.getUint32(offset, littleEndian) !== 4326) return null;
    offset += 4;
  }
  if (bytes.length < offset + 16) return null;

  const longitude = view.getFloat64(offset, littleEndian);
  const latitude = view.getFloat64(offset + 8, littleEndian);
  return coordinatesToEwkt(longitude, latitude);
}

function coordinatesToEwkt(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}