import { StyleSheet, Text, View } from 'react-native';

import type { MapCoordinate } from '@/components/location-picker';
import { KlippColors } from '@/lib/brand';

export function TrackingMap({ clientCoordinate, proCoordinate }: { clientCoordinate: MapCoordinate; proCoordinate: MapCoordinate }) {
  return (
    <View accessibilityLabel="Ubicación del profesional y destino" style={styles.container}>
      <Text style={styles.pin}>●</Text>
      <Text style={styles.title}>El profesional va hacia tu ubicación</Text>
      <Text style={styles.body}>Profesional: {proCoordinate.latitude.toFixed(4)}, {proCoordinate.longitude.toFixed(4)}</Text>
      <Text style={styles.body}>Destino: {clientCoordinate.latitude.toFixed(4)}, {clientCoordinate.longitude.toFixed(4)}</Text>
      <Text style={styles.hint}>El mapa interactivo está disponible en la app móvil.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 280, alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 18, backgroundColor: '#EEF4FF', gap: 9 },
  pin: { color: KlippColors.blue, fontSize: 30 },
  title: { color: KlippColors.navy, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  body: { color: KlippColors.slate, fontSize: 12 },
  hint: { color: KlippColors.muted, fontSize: 11, textAlign: 'center' },
});
