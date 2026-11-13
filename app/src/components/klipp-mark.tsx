import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type KlippMarkProps = { size?: number };

const KLIPP_SYMBOL = require('../../assets/images/klipp-symbol.png');

export function KlippMark({ size = 40 }: KlippMarkProps) {
  return (
    <Image
      accessibilityLabel="Símbolo de Klipp"
      contentFit="contain"
      source={KLIPP_SYMBOL}
      cachePolicy="memory-disk"
      transition={180}
      style={[styles.mark, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    flexShrink: 0,
    alignSelf: 'center',
  },
});
