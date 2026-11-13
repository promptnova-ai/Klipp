import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type KlippMarkProps = { size?: number };

const KLIPP_SYMBOL_URL =
  'https://promptnova-ai.github.io/Klipp/assets/assets/images/klipp-symbol.23d3a45d74d57d23e0235ca4dba6bcd2.png';

export function KlippMark({ size = 40 }: KlippMarkProps) {
  return (
    <Image
      accessibilityLabel="Símbolo de Klipp"
      contentFit="contain"
      source={{ uri: KLIPP_SYMBOL_URL }}
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
