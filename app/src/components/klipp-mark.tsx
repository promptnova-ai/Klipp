import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type KlippMarkProps = { size?: number };

/** Scalable vector reconstruction of the Klipp mark, guided by the supplied identity artwork. */
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
