import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KlippMark } from '@/components/klipp-mark';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
export type KlippTabItem = { name: string; href: string; label: string; icon: SymbolName };

type KlippTabBarProps = {
  items: KlippTabItem[];
  actionHref: string;
  actionLabel: string;
};

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon?: SymbolName;
  center?: boolean;
};

function TabButton({ label, icon, center = false, isFocused, ...props }: TabButtonProps) {
  if (center) {
    return (
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.centerButton, pressed && styles.pressed]}>
        <View style={styles.markPlate}>
          <KlippMark size={34} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tabButton, isFocused && styles.tabButtonActive, pressed && styles.pressed]}>
      {icon ? <SymbolView name={icon} tintColor={isFocused ? '#3D5AFE' : '#8A8D98'} size={21} /> : null}
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function KlippTabBar({ items, actionHref, actionLabel }: KlippTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {items.slice(0, 2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <TabButton label={item.label} icon={item.icon} />
          </TabTrigger>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => router.navigate(actionHref as never)}
          style={({ pressed }) => [styles.centerButton, pressed && styles.pressed]}>
          <View style={styles.markPlate}><KlippMark size={34} /></View>
        </Pressable>
        {items.slice(2).map((item) => (
          <TabTrigger key={item.name} name={item.name} asChild>
            <TabButton label={item.label} icon={item.icon} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEECE6',
    shadowColor: '#171B2D',
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
  tabButtonActive: { backgroundColor: '#F4F6FF' },
  tabLabel: { color: '#8A8D98', fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },
  tabLabelActive: { color: '#3D5AFE' },
  centerButton: {
    width: 66,
    height: 66,
    marginTop: -28,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F5F0',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#171B2D',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  markPlate: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.86 },
});
