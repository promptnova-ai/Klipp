/// <reference types="google.maps" />

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { KlippColors } from '@/theme/tokens';
import { loadGoogleMapsLibrary } from '@/lib/google-maps';
import type { OperationsMapPoint } from './admin-operations-map.types';

function isStale(updatedAt: string | null) {
  return !updatedAt || Date.now() - new Date(updatedAt).getTime() > 120_000;
}

export function AdminOperationsMap({ points }: { points: OperationsMapPoint[] }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validPoints = useMemo(() => points.filter((point) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
  ), [points]);

  useEffect(() => {
    let active = true;
    void loadGoogleMapsLibrary().then(({ Map }) => {
      if (!active || !element.current) return;
      map.current = new Map(element.current, {
        center: { lat: 18.4861, lng: -69.9312 },
        zoom: 9,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      setReady(true);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar Google Maps.');
    });
    return () => {
      active = false;
      markers.current.forEach((marker) => marker.setMap(null));
      markers.current = [];
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    markers.current.forEach((marker) => marker.setMap(null));
    markers.current = [];
    const bounds = new google.maps.LatLngBounds();
    validPoints.forEach((point) => {
      const position = { lat: point.latitude, lng: point.longitude };
      const stale = isStale(point.updatedAt);
      const marker = new google.maps.Marker({
        map: map.current,
        position,
        title: `${point.professionalName || 'Profesional'} · ${point.serviceName || 'Servicio Klipp'}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: stale ? KlippColors.danger : point.selected ? KlippColors.coral : KlippColors.cobalt,
          fillOpacity: 1,
          strokeColor: KlippColors.white,
          strokeWeight: 2,
          scale: point.selected ? 9 : 7,
        },
      });
      marker.addListener('click', point.onSelect);
      markers.current.push(marker);
      bounds.extend(position);
    });
    if (validPoints.length === 1) {
      map.current.setCenter(bounds.getCenter());
      map.current.setZoom(14);
    } else if (validPoints.length > 1) {
      map.current.fitBounds(bounds, 45);
    } else {
      map.current.setCenter({ lat: 18.4861, lng: -69.9312 });
      map.current.setZoom(9);
    }
  }, [ready, validPoints]);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Mapa de profesionales en servicio</Text>
        <Text style={styles.caption}>{validPoints.length} ubicación{validPoints.length === 1 ? '' : 'es'} vinculada{validPoints.length === 1 ? '' : 's'} a órdenes activas</Text>
      </View>
      <View style={styles.map}>
        <div ref={element} style={{ width: '100%', height: '100%' }} />
        {error && <View style={styles.overlay}><Text style={styles.error}>{error}</Text></View>}
        {!ready && !error && <View pointerEvents="none" style={styles.overlay}><Text style={styles.caption}>Cargando mapa…</Text></View>}
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
  map: { height: 310, overflow: 'hidden', borderRadius: 13, backgroundColor: KlippColors.surfaceBlue },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#FFFFFFD9' },
  error: { color: KlippColors.danger, fontSize: 12, textAlign: 'center' },
  legend: { color: KlippColors.muted, fontSize: 10 },
});
