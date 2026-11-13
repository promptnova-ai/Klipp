import { StyleSheet, View } from 'react-native';

type KlippMarkProps = { size?: number };

/** The Klipp symbol: two fast, intersecting strokes in the brand's coral and cobalt. */
export function KlippMark({ size = 36 }: KlippMarkProps) {
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <View style={[styles.stroke, {
        width: size * 0.27, height: size * 0.88, left: size * 0.2, top: size * 0.06,
        backgroundColor: '#FF7058', transform: [{ rotate: '24deg' }],
      }]} />
      <View style={[styles.stroke, {
        width: size * 0.27, height: size * 0.88, left: size * 0.48, top: size * 0.06,
        backgroundColor: '#3D5AFE', transform: [{ rotate: '-24deg' }],
      }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  stroke: { position: 'absolute', borderRadius: 999 },
});
