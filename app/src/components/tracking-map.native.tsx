import { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline, type MapMarker, type Region, type LatLng } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import type { MapCoordinate } from '@/components/location-picker';
import { KlippColors } from '@/theme/tokens';

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export function TrackingMap({
  clientCoordinate,
  proCoordinate,
  routePolyline,
}: {
  clientCoordinate: MapCoordinate;
  proCoordinate: MapCoordinate;
  routePolyline?: string | null;
}) {
  const map = useRef<MapView>(null);
  const marker = useRef<MapMarker>(null);
  const region = useMemo<Region>(() => ({
    latitude: (clientCoordinate.latitude + proCoordinate.latitude) / 2,
    longitude: (clientCoordinate.longitude + proCoordinate.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(clientCoordinate.latitude - proCoordinate.latitude) * 1.8, 0.012),
    longitudeDelta: Math.max(Math.abs(clientCoordinate.longitude - proCoordinate.longitude) * 1.8, 0.012),
  }), [clientCoordinate.latitude, clientCoordinate.longitude, proCoordinate.latitude, proCoordinate.longitude]);
  const routeCoordinates = useMemo(() => {
    if (routePolyline) {
      const decoded = decodePolyline(routePolyline);
      if (decoded.length > 1) return decoded;
    }
    return [proCoordinate, clientCoordinate];
  }, [clientCoordinate, proCoordinate, routePolyline]);

  useEffect(() => {
    marker.current?.animateMarkerToCoordinate(proCoordinate, 1100);
    map.current?.animateToRegion(region, 800);
  }, [proCoordinate, region]);

  return (
    <View style={styles.container}>
      <MapView ref={map} initialRegion={region} style={StyleSheet.absoluteFill}>
        <Polyline coordinates={routeCoordinates} strokeColor={KlippColors.cobalt} strokeWidth={4} />
        <Marker coordinate={clientCoordinate} title="Tu destino" description="Dirección del servicio" pinColor={KlippColors.cobalt} />
        <Marker ref={marker} coordinate={proCoordinate} title="Tu profesional" description="Ubicación actual" pinColor={KlippColors.coral} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 360, overflow: 'hidden', borderRadius: 20, backgroundColor: '#E8EEF7' },
});
