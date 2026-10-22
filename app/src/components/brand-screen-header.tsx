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
    paddingHorizontal: 22,
    paddingTop: 58,
    paddingBottom: 24,
    gap: 22,
    backgroundColor: KlippColors.navyDeep,
    borderBottomWidth: 3,
    borderBottomColor: KlippColors.teal,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.blue },
  logoLetter: { color: KlippColors.white, fontSize: 22, fontWeight: '900' },
  brandCopy: { gap: 2 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brand: { color: KlippColors.white, fontSize: 20, fontWeight: '900' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: KlippColors.gold },
  badgeText: { color: KlippColors.navy, fontSize: 9, fontWeight: '900' },
  location: { color: '#CBD5E1', fontSize: 9, fontWeight: '700' },
  heading: { gap: 5 },
  eyebrow: { color: KlippColors.teal, fontSize: 10, fontWeight: '800' },
  title: { color: KlippColors.white, fontSize: 26, lineHeight: 32, fontWeight: '800' },
  subtitle: { color: '#CBD5E1', fontSize: 13, lineHeight: 19 },
});