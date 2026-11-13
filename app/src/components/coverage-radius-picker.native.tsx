import { useEffect, useMemo, useRef } from 'react';
import MapView, { Circle, Marker, type MapPressEvent, type Region } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';
import { KlippColors } from '@/theme/tokens';

export type CoverageCoordinate = { latitude: number; longitude: number };

export function CoverageRadiusPicker({
  center,
  radiusMeters,
  onChange,
}: {
  center: CoverageCoordinate;
  radiusMeters: number;
  onChange: (center: CoverageCoordinate) => void;
}) {
  const map = useRef<MapView>(null);
  const region: Region = useMemo(() => ({
    ...center,
    latitudeDelta: Math.max(radiusMeters / 111_000 * 3, 0.02),
    longitudeDelta: Math.max(radiusMeters / 80_000 * 3, 0.02),
  }), [center, radiusMeters]);

  useEffect(() => {
    map.current?.animateToRegion(region, 500);
  }, [region]);

  return (
    <View style={styles.container}>
      <MapView
        ref={map}
        initialRegion={region}
        onPress={(event: MapPressEvent) => onChange(event.nativeEvent.coordinate)}
        style={StyleSheet.absoluteFill}>
        <Circle
          center={center}
          radius={radiusMeters}
          fillColor="rgba(32,138,239,0.16)"
          strokeColor={KlippColors.cobalt}
          strokeWidth={2}
        />
        <Marker
          coordinate={center}
          draggable
          onDragEnd={({ nativeEvent }) => onChange(nativeEvent.coordinate)}
          title="Centro de cobertura"
        />
      </MapView>
      <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText}>Mueve el pin o toca el mapa para elegir el centro</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 245, overflow: 'hidden', borderRadius: 16, backgroundColor: KlippColors.surfaceBlue },
  hint: { position: 'absolute', right: 8, bottom: 8, left: 8, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FFFFFFE8' },
  hintText: { color: KlippColors.slate, fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
