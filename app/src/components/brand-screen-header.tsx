import { StyleSheet, Text, View } from 'react-native';

import { KlippColors } from '@/lib/brand';

export function BrandScreenHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}><Text style={styles.logoLetter}>K</Text></View>
        <View style={styles.brandCopy}>
          <View style={styles.brandLine}>
            <Text style={styles.brand}>klipp</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>RD</Text></View>
          </View>
          <Text style={styles.location}>REPÚBLICA DOMINICANA</Text>
        </View>
      </View>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 8,
    gap: 24,
    backgroundColor: KlippColors.canvas,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.navy },
  logoLetter: { color: KlippColors.white, fontSize: 22, fontWeight: '800' },
  brandCopy: { gap: 2 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brand: { color: KlippColors.navy, fontSize: 20, fontWeight: '800' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: KlippColors.goldLight },
  badgeText: { color: KlippColors.navy, fontSize: 9, fontWeight: '900' },
  location: { color: KlippColors.muted, fontSize: 9, fontWeight: '700' },
  heading: { gap: 7 },
  eyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: KlippColors.navy, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22 },
});