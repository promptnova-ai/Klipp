import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { KlippColors } from '@/lib/brand';
import { KlippTokens } from './tokens';

export type KlippSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  onClear?: () => void;
};

export function KlippSearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onClear,
}: KlippSearchBarProps) {
  return (
    <View style={styles.container}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        tintColor={KlippColors.muted}
        size={20}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={KlippColors.muted}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {!!value && onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          hitSlop={8}
          onPress={onClear}
          style={styles.clearButton}>
          <SymbolView
            name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
            tintColor={KlippColors.muted}
            size={18}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: KlippTokens.size.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: KlippTokens.radius.lg,
    backgroundColor: KlippColors.white,
    borderWidth: 1,
    borderColor: KlippColors.border,
    shadowColor: KlippColors.navy,
    shadowOpacity: 0.045,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },
  input: {
    flex: 1,
    minHeight: KlippTokens.size.input,
    color: KlippColors.navy,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
