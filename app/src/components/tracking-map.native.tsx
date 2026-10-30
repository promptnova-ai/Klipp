import { useEffect, useRef } from 'react';
import MapView, { Marker, Polyline, type MapMarker, type Region } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import type { MapCoordinate } from '@/components/location-picker';

export function TrackingMap({ clientCoordinate, proCoordinate }: { clientCoordinate: MapCoordinate; proCoordinate: MapCoordinate }) {
  const map = useRef<MapView>(null);
  const marker = useRef<MapMarker>(null);
  const region: Region = {
    latitude: (clientCoordinate.latitude + proCoordinate.latitude) / 2,
    longitude: (clientCoordinate.longitude + proCoordinate.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(clientCoordinate.latitude - proCoordinate.latitude) * 1.8, 0.012),
    longitudeDelta: Math.max(Math.abs(clientCoordinate.longitude - proCoordinate.longitude) * 1.8, 0.012),
  };

  useEffect(() => {
    marker.current?.animateMarkerToCoordinate(proCoordinate, 1100);
    map.current?.animateToRegion(region, 800);
  }, [proCoordinate.latitude, proCoordinate.longitude]);

  return (
    <View style={styles.container}>
      <MapView ref={map} initialRegion={region} style={StyleSheet.absoluteFill}>
        <Polyline coordinates={[proCoordinate, clientCoordinate]} strokeColor="#0052FF" strokeWidth={4} />
        <Marker coordinate={clientCoordinate} title="Tu ubicación" pinColor="#0052FF" />
        <Marker ref={marker} coordinate={proCoordinate} title="Profesional" pinColor="#F59E0B" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 280, overflow: 'hidden', borderRadius: 18, backgroundColor: '#E8EEF7' },
});
