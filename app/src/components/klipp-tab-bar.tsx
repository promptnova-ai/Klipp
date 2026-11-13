import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KlippMark } from '@/components/klipp-mark';

type KlippTabBarProps = BottomTabBarProps & {
  actionLabel: string;
  actionHref: '/(client)/new-booking' | '/(pro)';
};

export function KlippTabBar({ actionLabel, actionHref, ...props }: KlippTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <BottomTabBar {...props} />
      <View pointerEvents="box-none" style={[styles.centerAction, { bottom: Math.max(insets.bottom, 8) + 28 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint="Acceso principal de Klipp"
          onPress={() => router.navigate(actionHref)}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
          <View style={styles.markPlate}>
            <KlippMark size={34} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', backgroundColor: '#FFFFFF' },
  centerAction: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, alignItems: 'center' },
  actionButton: {
    width: 66,
    height: 66,
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
    elevation: 8,
  },
  markPlate: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  actionPressed: { transform: [{ scale: 0.94 }], opacity: 0.88 },
});
