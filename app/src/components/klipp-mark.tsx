import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

type KlippMarkProps = { size?: number };

export function KlippMark({ size = 36 }: KlippMarkProps) {
  return (
    <Image
      accessibilityLabel="Símbolo de Klipp"
      contentFit="contain"
      source={require('../../assets/images/klipp-symbol.png')}
      style={[styles.mark, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({ mark: { flexShrink: 0 } });
