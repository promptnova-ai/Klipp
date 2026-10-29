import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KlippColors } from '@/lib/brand';

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
  const [mapSize, setMapSize] = useState({ width: 320, height: 245 });

  function moveCoverageCenter(locationX: number, locationY: number) {
    const metersPerPixel = radiusMeters / 72;
    const latitude = center.latitude - ((locationY - mapSize.height / 2) * metersPerPixel) / 111_320;
    const longitudeScale = Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01);
    const longitude = center.longitude + ((locationX - mapSize.width / 2) * metersPerPixel) / (111_320 * longitudeScale);
    onChange({
      latitude: Math.max(-90, Math.min(90, latitude)),
      longitude: Math.max(-180, Math.min(180, longitude)),
    });
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="Mapa para ajustar el centro del área de cobertura"
        accessibilityRole="button"
        onLayout={({ nativeEvent }) => setMapSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}
        onPress={({ nativeEvent }) => moveCoverageCenter(nativeEvent.locationX, nativeEvent.locationY)}
        style={styles.map}>
        <View pointerEvents="none" style={styles.roadHorizontal} />
        <View pointerEvents="none" style={styles.roadVertical} />
        <View pointerEvents="none" style={styles.roadDiagonal} />
        <View pointerEvents="none" style={styles.coverageCircle} />
        <View pointerEvents="none" style={styles.pin}>
          <Text style={styles.pinText}>●</Text>
        </View>
        <Text pointerEvents="none" style={styles.mapHint}>Toca el mapa para mover el centro</Text>
      </Pressable>
      <Text style={styles.coordinates}>{center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}</Text>
      <Text style={styles.hint}>Círculo azul = radio de {Math.round(radiusMeters / 1000)} km. Pulsa sobre el mapa para ajustar el área.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#EEF4FF', gap: 8 },
  map: { width: '100%', maxWidth: 320, height: 245, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E8F0E7' },
  roadHorizontal: { position: 'absolute', width: '115%', height: 22, transform: [{ rotate: '-13deg' }], backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D5DFD3' },
  roadVertical: { position: 'absolute', width: 18, height: '120%', transform: [{ rotate: '29deg' }], backgroundColor: '#FFFFFF', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#D5DFD3' },
  roadDiagonal: { position: 'absolute', width: '110%', height: 10, transform: [{ rotate: '41deg' }], backgroundColor: '#DCE8F7' },
  coverageCircle: { position: 'absolute', width: 144, height: 144, borderWidth: 2, borderColor: KlippColors.blue, borderRadius: 72, backgroundColor: 'rgba(32,138,239,0.2)' },
  pin: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: KlippColors.white, borderRadius: 17, backgroundColor: KlippColors.blue },
  pinText: { color: KlippColors.white, fontSize: 15 },
  mapHint: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, overflow: 'hidden', backgroundColor: '#FFFFFFE8', color: '#334155', fontSize: 11, fontWeight: '600' },
  coordinates: { color: KlippColors.slate, fontSize: 12 },
  hint: { color: KlippColors.muted, fontSize: 11, textAlign: 'center' },
});
