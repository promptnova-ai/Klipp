import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type KlippMarkProps = { size?: number };

/** Official Klipp location-and-motion symbol from the supplied brand artwork. */
export function KlippMark({ size = 36 }: KlippMarkProps) {
  return (
    <Image
      accessibilityLabel="Klipp"
      contentFit="contain"
      source={require('../../assets/images/klipp-symbol.svg')}
      style={[styles.mark, { width: size * 1.27, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  mark: { flexShrink: 0 },
});
