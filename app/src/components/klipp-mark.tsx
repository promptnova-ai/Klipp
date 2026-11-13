import { StyleSheet, View } from 'react-native';

type KlippMarkProps = { size?: number };

/** Klipp's location-and-movement symbol, built as a crisp scalable native mark. */
export function KlippMark({ size = 36 }: KlippMarkProps) {
  const stroke = size * 0.17;
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <View style={[styles.motionLine, { width: size * 0.28, height: stroke * 0.48, left: 0, top: size * 0.31 }]} />
      <View style={[styles.motionLine, { width: size * 0.21, height: stroke * 0.48, left: size * 0.04, top: size * 0.48, opacity: 0.82 }]} />
      <View style={[styles.motionLine, { width: size * 0.14, height: stroke * 0.48, left: size * 0.08, top: size * 0.65, opacity: 0.68 }]} />
      <View style={[styles.diagonal, {
        width: stroke, height: size * 0.76, left: size * 0.31, top: size * 0.15,
        backgroundColor: '#7C3AED', transform: [{ rotate: '42deg' }],
      }]} />
      <View style={[styles.diagonal, {
        width: stroke, height: size * 0.76, left: size * 0.48, top: size * 0.14,
        backgroundColor: '#2563EB', transform: [{ rotate: '-42deg' }],
      }]} />
      <View style={[styles.pinOuter, {
        width: size * 0.44, height: size * 0.44, right: size * 0.02, top: 0,
      }]}>
        <View style={styles.pinInner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'relative' },
  motionLine: { position: 'absolute', borderRadius: 999, backgroundColor: '#06B6D4' },
  diagonal: { position: 'absolute', borderRadius: 999 },
  pinOuter: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
    borderWidth: 0, borderRadius: 999, backgroundColor: '#06B6D4',
  },
  pinInner: { width: '36%', height: '36%', borderRadius: 999, backgroundColor: '#FFFFFF' },
});
