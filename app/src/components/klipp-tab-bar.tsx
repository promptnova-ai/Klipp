import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { KlippMark } from '@/components/klipp-mark';
import { KlippColors } from '@/theme/tokens';
import { RoleThemes, type KlippRole } from '@/theme/themes';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
export type KlippTabItem = { name: string; href: string; label: string; icon: SymbolName };

type KlippTabBarProps = {
  items: KlippTabItem[];
  actionHref: string;
  actionLabel: string;
  role?: KlippRole;
};

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: SymbolName;
};

function TabButton({ label, icon, isFocused, onPress, accent, accentSoft }: TabButtonProps & { accent: string; accentSoft: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tabButton, isFocused && { backgroundColor: accentSoft }, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor={isFocused ? accent : KlippColors.muted} size={21} />
      <Text style={[styles.tabLabel, isFocused && { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

export function KlippTabBar({ items, actionHref, actionLabel, role = 'client' }: KlippTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const router = useRouter();
  const theme = RoleThemes[role];
  const accent = theme.accent;

  return (
    <View style={[styles.navigation, desktop && styles.navigationDesktop, { paddingBottom: desktop ? 0 : Math.max(insets.bottom, 8) }]}>
      <View style={[styles.bar, desktop && styles.barDesktop]}>
        {items.slice(0, 2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <TabButton label={item.label} icon={item.icon} accent={accent} accentSoft={theme.accentSoft} />
          </TabTrigger>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => router.navigate(actionHref as never)}
          style={({ pressed }) => [styles.centerButton, desktop && styles.centerButtonDesktop, pressed && styles.pressed]}>
          <View style={styles.markPlate}><KlippMark size={34} /></View>
        </Pressable>
        {items.slice(2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <TabButton label={item.label} icon={item.icon} accent={accent} accentSoft={theme.accentSoft} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: {
    backgroundColor: KlippColors.white,
    borderTopWidth: 1,
    borderTopColor: KlippColors.border,
    shadowColor: KlippColors.ink,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: -5 },
    shadowRadius: 16,
    elevation: 8,
  },
  bar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingTop: 7,
  },
  tabButton: {
    minWidth: 64,
    minHeight: 54,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
  },
  tabLabel: { color: KlippColors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  centerButton: {
    width: 66,
    height: 66,
    marginTop: -28,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: KlippColors.canvas,
    borderWidth: 4,
    borderColor: KlippColors.white,
    shadowColor: '#171B2D',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  centerButtonDesktop: { width: 52, height: 52, marginTop: 0, borderWidth: 0, backgroundColor: KlippColors.ivory, shadowOpacity: 0.04, elevation: 1 },
  markPlate: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
});
