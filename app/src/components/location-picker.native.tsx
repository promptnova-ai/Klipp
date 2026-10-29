import MapView, { Marker, type Region } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

export type MapCoordinate = { latitude: number; longitude: number };

export function LocationPicker({ coordinate, onChange }: { coordinate: MapCoordinate; onChange: (coordinate: MapCoordinate) => void }) {
  const region: Region = {
    ...coordinate,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  };

  return (
    <View style={styles.container}>
      <MapView
        initialRegion={region}
        onRegionChangeComplete={(nextRegion: Region) => onChange({ latitude: nextRegion.latitude, longitude: nextRegion.longitude })}
        region={region}
        style={StyleSheet.absoluteFill}>
        <Marker coordinate={coordinate} draggable onDragEnd={({ nativeEvent }) => onChange(nativeEvent.coordinate)} />
      </MapView>
      <View pointerEvents="none" style={styles.hint}><Text style={styles.hintText}>Arrastra el mapa o el pin para ajustar el punto</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 190, overflow: 'hidden', borderRadius: 16, backgroundColor: '#E8EEF7' },
  hint: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFFFFE8' },
  hintText: { color: '#334155', fontSize: 11, fontWeight: '600' },
});
