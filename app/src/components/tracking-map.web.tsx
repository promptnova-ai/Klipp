/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MapCoordinate } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';
import { loadGoogleMapsLibrary } from '@/lib/google-maps';

export function TrackingMap({ clientCoordinate, proCoordinate }: { clientCoordinate: MapCoordinate; proCoordinate: MapCoordinate }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const professionalMarker = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = useRef(clientCoordinate);
  const professional = useRef(proCoordinate);

  useEffect(() => {
    destination.current = clientCoordinate;
    professional.current = proCoordinate;
  }, [clientCoordinate, proCoordinate]);

  useEffect(() => {
    let active = true;
    void loadGoogleMapsLibrary()
      .then(({ Map, Polyline }) => {
        if (!active || !mapElement.current) return;
        const clientPosition = { lat: destination.current.latitude, lng: destination.current.longitude };
        const proPosition = { lat: professional.current.latitude, lng: professional.current.longitude };
        const googleMap = new Map(mapElement.current, {
          center: clientPosition,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const clientMarker = new google.maps.Marker({ map: googleMap, position: clientPosition, title: 'Tu ubicación' });
        const proMarker = new google.maps.Marker({ map: googleMap, position: proPosition, title: 'Tu profesional', icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#F59E0B',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
          scale: 9,
        } });
        new Polyline({
          map: googleMap,
          path: [proPosition, clientPosition],
          strokeColor: '#0052FF',
          strokeOpacity: 0.85,
          strokeWeight: 5,
        });
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(clientPosition);
        bounds.extend(proPosition);
        googleMap.fitBounds(bounds, 50);
        map.current = googleMap;
        professionalMarker.current = proMarker;
        setMapReady(true);
        return () => {
          clientMarker.setMap(null);
          proMarker.setMap(null);
        };
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el mapa de seguimiento.');
      });
    return () => {
      active = false;
      professionalMarker.current?.setMap(null);
      professionalMarker.current = null;
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const position = { lat: proCoordinate.latitude, lng: proCoordinate.longitude };
    professionalMarker.current?.setPosition(position);
    map.current?.panTo(position);
  }, [proCoordinate.latitude, proCoordinate.longitude, mapReady]);

  return (
    <View style={styles.container}>
      <div ref={mapElement} style={{ width: '100%', height: '100%' }} />
      {error && <View accessibilityRole="alert" style={styles.error}>
        <Text style={styles.errorText}>{error}</Text>
      </View>}
      {!mapReady && !error && <View pointerEvents="none" style={styles.loading}>
        <Text style={styles.loadingText}>Cargando mapa de seguimiento…</Text>
      </View>}
      {mapReady && <Text pointerEvents="none" style={styles.legend}>● Profesional　 ● Tu destino</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 360, overflow: 'hidden', borderRadius: 20, backgroundColor: '#E8EEF7' },
  error: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#FFFFFFE8' },
  errorText: { color: KlippColors.slate, fontSize: 13, textAlign: 'center' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFD9' },
  loadingText: { color: KlippColors.slate, fontSize: 13, fontWeight: '600' },
  legend: { position: 'absolute', right: 10, bottom: 10, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FFFFFFE8', color: KlippColors.navy, fontSize: 11, fontWeight: '700' },
});
