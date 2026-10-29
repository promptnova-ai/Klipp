import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KlippColors } from '@/lib/brand';

export type MapCoordinate = { latitude: number; longitude: number };

export function LocationPicker({ coordinate, onChange }: { coordinate: MapCoordinate; onChange: (coordinate: MapCoordinate) => void }) {
  const [latitude, setLatitude] = useState(String(coordinate.latitude));
  const [longitude, setLongitude] = useState(String(coordinate.longitude));

  useEffect(() => {
    setLatitude(String(coordinate.latitude));
    setLongitude(String(coordinate.longitude));
  }, [coordinate.latitude, coordinate.longitude]);

  function applyCoordinates() {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (Number.isFinite(parsedLatitude) && parsedLatitude >= -90 && parsedLatitude <= 90
      && Number.isFinite(parsedLongitude) && parsedLongitude >= -180 && parsedLongitude <= 180) {
      onChange({ latitude: parsedLatitude, longitude: parsedLongitude });
    }
  }

  return (
    <View accessibilityLabel="Ubicación actual" style={styles.container}>
      <View style={styles.pin}><Text style={styles.pinText}>●</Text></View>
      <Text style={styles.title}>Punto de recogida</Text>
      <Text style={styles.coordinates}>{coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text>
      <View style={styles.coordinateFields}>
        <TextInput accessibilityLabel="Latitud del punto" keyboardType="numbers-and-punctuation" onChangeText={setLatitude} style={styles.coordinateInput} value={latitude} />
        <TextInput accessibilityLabel="Longitud del punto" keyboardType="numbers-and-punctuation" onChangeText={setLongitude} style={styles.coordinateInput} value={longitude} />
      </View>
      <Pressable accessibilityRole="button" onPress={applyCoordinates} style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
        <Text style={styles.applyText}>Aplicar punto</Text>
      </Pressable>
      <Text style={styles.hint}>Ajusta el punto cambiando las coordenadas o desde el mapa en la app móvil.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 190, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 16, backgroundColor: '#EEF4FF', gap: 7 },
  pin: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: KlippColors.white },
  pinText: { color: KlippColors.blue, fontSize: 26 },
  title: { color: KlippColors.navy, fontSize: 14, fontWeight: '700' },
  coordinates: { color: KlippColors.slate, fontSize: 12 },
  hint: { color: KlippColors.muted, fontSize: 11 },
  coordinateFields: { flexDirection: 'row', gap: 8 },
  coordinateInput: { width: 120, minHeight: 38, paddingHorizontal: 8, borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 8, backgroundColor: '#FFFFFF', color: KlippColors.slate, fontSize: 12 },
  applyButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: KlippColors.blue },
  applyText: { color: KlippColors.white, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.86 },
});
