import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet, Text } from 'react-native';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';


export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explore</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <Text style={[styles.tabText, isFocused && styles.tabTextSelected]}>{children}</Text>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}><SymbolView name={{ ios: 'sparkle', android: 'auto_awesome', web: 'auto_awesome' }} tintColor="#FFFFFF" size={14} /></View>
          <Text style={styles.brandName}>klipp</Text>
        </View>
        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', flexGrow: 1, gap: 10, maxWidth: MaxContentWidth, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E5DE', shadowColor: '#171B2D', shadowOpacity: 0.09, shadowOffset: { width: 0, height: 8 }, shadowRadius: 22, elevation: 5 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 7, marginRight: 'auto', paddingRight: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3D5AFE' },
  brandName: { color: '#171B2D', fontSize: 16, fontWeight: '900', letterSpacing: -0.6 },
  pressed: { opacity: 0.7 },
  tabText: { color: '#72778A', fontSize: 12, fontWeight: '700' },
  tabTextSelected: { color: '#3048D8', fontWeight: '900' },
  tabButtonView: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 11, backgroundColor: 'transparent' },
});
