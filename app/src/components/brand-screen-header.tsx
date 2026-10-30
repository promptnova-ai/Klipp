import { StyleSheet, Text, View } from 'react-native';

import { KlippColors, RoleThemes, type KlippRole } from '@/lib/brand';

export function BrandScreenHeader({
  eyebrow,
  title,
  subtitle,
  role = 'client',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  role?: KlippRole;
}) {
  const theme = RoleThemes[role];
  return (
    <View style={[styles.header, { backgroundColor: theme.canvas }]}>
      <View style={styles.brandRow}>
        <View style={[styles.logoMark, { backgroundColor: KlippColors.navyDeep }]}>
          <Text style={styles.logoLetter}>K</Text>
        </View>
        <View style={styles.brandCopy}>
          <View style={styles.brandLine}>
            <Text style={styles.brand}>klipp</Text>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.badgeText, { color: theme.accentStrong }]}>RD</Text>
            </View>
          </View>
          <Text style={styles.location}>SERVICIOS A DOMICILIO</Text>
        </View>
      </View>
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.accentStrong }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop: 58,
    paddingBottom: 12,
    gap: 25,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101A30',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  logoLetter: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  brandCopy: { gap: 2 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: KlippColors.navy, fontSize: 21, fontWeight: '900', letterSpacing: -0.8 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  location: { color: '#8792A5', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  heading: { gap: 7 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.25 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9 },
  subtitle: { color: '#66748A', fontSize: 15, lineHeight: 22, maxWidth: 520 },
});
