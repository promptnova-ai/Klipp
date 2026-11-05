import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { KlippColors, KlippLayout } from '@/lib/brand';

export function BrandScreenHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>K</Text>
          <View style={styles.logoSpark} />
        </View>
        <View style={styles.brandCopy}>
          <View style={styles.brandLine}>
            <Text style={styles.brand}>Klipp</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>RD</Text></View>
          </View>
          <Text style={styles.location}>SERVICIOS QUE SE MUEVEN CONTIGO</Text>
        </View>
      </View>
      <View style={styles.heading}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: KlippLayout.pageGutter,
    paddingTop: 58,
    paddingBottom: 8,
    gap: 27,
    backgroundColor: KlippColors.canvas,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: KlippColors.blue, overflow: 'hidden' },
  logoLetter: { color: KlippColors.white, fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  logoSpark: { position: 'absolute', right: 0, bottom: 0, width: 13, height: 4, backgroundColor: KlippColors.cyan },
  brandCopy: { gap: 2 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: KlippColors.navy, fontSize: 21, fontWeight: '900', letterSpacing: -0.8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: KlippLayout.pillRadius, backgroundColor: KlippColors.violetSoft },
  badgeText: { color: KlippColors.violet, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  location: { color: KlippColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.75 },
  heading: { gap: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: KlippColors.cyan },
  eyebrow: { color: KlippColors.blueDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: KlippColors.navy, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.9 },
  subtitle: { color: KlippColors.muted, fontSize: 15, lineHeight: 22, maxWidth: 560 },
});
