import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, type Region } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import { KlippColors } from '@/lib/brand';

import type { OperationsMapPoint } from './admin-operations-map.types';

function isStale(updatedAt: string | null) {
  return !updatedAt || Date.now() - new Date(updatedAt).getTime() > 120_000;
}

export function AdminOperationsMap({ points }: { points: OperationsMapPoint[] }) {
  const map = useRef<MapView>(null);
  const validPoints = useMemo(() => points.filter((point) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
  ), [points]);
  const region: Region = useMemo(() => {
    if (!validPoints.length) return { latitude: 18.4861, longitude: -69.9312, latitudeDelta: 0.45, longitudeDelta: 0.45 };
    const latitudes = validPoints.map((point) => point.latitude);
    const longitudes = validPoints.map((point) => point.longitude);
    const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.7, 0.035),
      longitudeDelta: Math.max((maxLng - minLng) * 1.7, 0.035),
    };
  }, [validPoints]);

  useEffect(() => {
    if (validPoints.length) map.current?.animateToRegion(region, 500);
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta, validPoints.length]);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Mapa de profesionales en servicio</Text>
        <Text style={styles.caption}>{validPoints.length} ubicación{validPoints.length === 1 ? '' : 'es'} vinculada{validPoints.length === 1 ? '' : 's'} a órdenes activas</Text>
      </View>
      <View style={styles.map}>
        <MapView ref={map} initialRegion={region} style={StyleSheet.absoluteFill} showsCompass showsUserLocation={false}>
          {validPoints.map((point) => {
            const stale = isStale(point.updatedAt);
            return (
              <Marker
                key={point.bookingId}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={point.professionalName || 'Profesional'}
                description={`${point.serviceName || 'Servicio Klipp'} · ${stale ? 'GPS desactualizado' : point.status}`}
                pinColor={stale ? '#DC2626' : point.selected ? '#F59E0B' : '#208AEF'}
                onPress={point.onSelect}
              />
            );
          })}
        </MapView>
        {!validPoints.length && <View pointerEvents="none" style={styles.empty}><Text style={styles.emptyText}>No hay profesionales con GPS registrado en órdenes activas.</Text></View>}
      </View>
      <Text style={styles.legend}>Azul: activo · Naranja: orden seleccionada · Rojo: GPS con más de 2 min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  heading: { gap: 3 },
  title: { color: KlippColors.navy, fontSize: 15, fontWeight: '800' },
  caption: { color: KlippColors.muted, fontSize: 11 },
  map: { height: 310, overflow: 'hidden', borderRadius: 13, backgroundColor: '#E8EEF7' },
  empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFFFFFB8' },
  emptyText: { color: KlippColors.slate, textAlign: 'center', fontSize: 13 },
  legend: { color: KlippColors.muted, fontSize: 10 },
});
