import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KlippColors, RoleThemes, type KlippRole } from '@/lib/brand';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
export type KlippTabItem = { name: string; href: string; label: string; icon: SymbolName };
type KlippTabBarProps = { items: KlippTabItem[]; actionHref: string; actionLabel: string; role?: KlippRole };
type TabButtonProps = TabTriggerSlotProps & { label: string; icon: SymbolName; accent: string; accentSoft: string; compact: boolean };

function TabButton({ label, icon, isFocused, onPress, accent, accentSoft, compact }: TabButtonProps) {
  return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
        style={({ pressed }) => [styles.tabButton, compact && styles.tabButtonCompact, isFocused && { backgroundColor: accentSoft }, pressed && styles.pressed]}>
        <SymbolView name={icon} tintColor={isFocused ? accent : KlippColors.muted} size={21} />
        <Text style={[styles.tabLabel, compact && styles.tabLabelCompact, isFocused && { color: accent }]}>{label}</Text>
      </Pressable>
  );
}

export function KlippTabBar({ items, actionHref, actionLabel, role = 'client' }: KlippTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const compact = width < 360;
  const router = useRouter();
  const theme = RoleThemes[role];
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View style={[styles.navigation, desktop && styles.navigationDesktop, { paddingBottom: desktop ? 0 : Math.max(insets.bottom, 8) }]}>
      <View style={[styles.bar, compact && styles.barCompact, desktop && styles.barDesktop]}>
        {items.slice(0, 2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild><TabButton label={item.label} icon={item.icon} accent={theme.accent} accentSoft={theme.accentSoft} compact={compact} /></TabTrigger>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => router.navigate(actionHref as never)}
          style={({ pressed }) => [styles.centerButton, compact && styles.centerButtonCompact, desktop && styles.centerButtonDesktop, { backgroundColor: KlippColors.navy }, pressed && styles.pressed]}>
          <Text style={styles.centerMark}>K</Text>
        </Pressable>
        {items.slice(2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild><TabButton label={item.label} icon={item.icon} accent={theme.accent} accentSoft={theme.accentSoft} compact={compact} /></TabTrigger>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: { backgroundColor: KlippColors.white, borderTopWidth: 1, borderTopColor: KlippColors.border, shadowColor: KlippColors.navy, shadowOpacity: 0.06, shadowOffset: { width: 0, height: -5 }, shadowRadius: 16, elevation: 8 },
  navigationDesktop: { position: 'absolute', top: 14, left: 0, right: 0, zIndex: 50, alignItems: 'center', paddingHorizontal: 24, backgroundColor: 'transparent', borderTopWidth: 0, shadowOpacity: 0, elevation: 0 },
  bar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 12, paddingTop: 7 },
  barCompact: { paddingHorizontal: 6, minHeight: 66, paddingTop: 5 },
  barDesktop: { width: '100%', maxWidth: 760, minHeight: 64, paddingHorizontal: 20, paddingTop: 0, borderWidth: 1, borderColor: KlippColors.border, borderRadius: 999, backgroundColor: KlippColors.white, shadowColor: KlippColors.navy, shadowOpacity: 0.09, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 8 },
  tabButton: { minWidth: 64, minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14 },
  tabButtonCompact: { minWidth: 0, minHeight: 48, gap: 3 },
  tabLabel: { color: KlippColors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  tabLabelCompact: { fontSize: 9, letterSpacing: 0 },
  centerButton: { width: 66, height: 66, marginTop: -28, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: KlippColors.white, shadowColor: KlippColors.navy, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 9 },
  centerButtonDesktop: { width: 52, height: 52, marginTop: 0, borderWidth: 0, shadowOpacity: 0.04, elevation: 1 },
  centerButtonCompact: { width: 56, height: 56, marginTop: -22, borderWidth: 3 },
  centerMark: { color: KlippColors.white, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -1 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
});
