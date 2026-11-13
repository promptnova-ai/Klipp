import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { KlippColors, KlippLayout, KlippShadows, KlippSpacing, KlippTypography } from '@/theme/tokens';
import { KlippMark } from '@/components/klipp-mark';
import { ThemedView } from './themed-view';


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
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <View style={styles.brandLockup}>
          <KlippMark size={26} />
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
  innerContainer: { paddingVertical: KlippSpacing[3], paddingHorizontal: KlippSpacing[4], borderRadius: KlippLayout.radiusCard, flexDirection: 'row', alignItems: 'center', flexGrow: 1, gap: KlippSpacing[2], maxWidth: KlippLayout.contentMaxWidth, backgroundColor: KlippColors.white, borderWidth: 1, borderColor: KlippColors.border, ...KlippShadows.floating },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: KlippSpacing[2], marginRight: 'auto', paddingRight: 8 },
  brandName: { color: KlippColors.ink, fontSize: KlippTypography.size.bodyLarge, fontWeight: '900', letterSpacing: -0.6 },
  pressed: { opacity: 0.7 },
  tabText: { color: KlippColors.muted, fontSize: KlippTypography.size.small, fontWeight: '700' },
  tabTextSelected: { color: KlippColors.cobaltDark, fontWeight: '900' },
  tabButtonView: { paddingVertical: KlippSpacing[2], paddingHorizontal: KlippSpacing[4], borderRadius: KlippLayout.radiusControl, backgroundColor: 'transparent' },
});
