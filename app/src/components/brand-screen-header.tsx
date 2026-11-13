import type { ReactNode } from 'react';
import { KlippMark } from '@/components/klipp-mark';
import { StyleSheet, Text, View } from 'react-native';

import { KlippColors, KlippLayout, RoleThemes, type KlippRole } from '@/lib/brand';

type BrandScreenHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  role?: KlippRole;
  trailing?: ReactNode;
};

export function BrandScreenHeader({
  eyebrow,
  title,
  subtitle,
  role = 'client',
  trailing,
}: BrandScreenHeaderProps) {
  const theme = RoleThemes[role];
  const roleLabel = role === 'pro' ? 'PRO' : role === 'admin' ? 'ADMIN' : 'RD';

  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}><KlippMark size={34} /></View>
        <View style={styles.brandCopy}>
          <View style={styles.brandLine}>
            <Text style={styles.brand}>klipp</Text>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.badgeText, { color: theme.accentStrong }]}>{roleLabel}</Text>
            </View>
          </View>
          <Text style={styles.location}>REPÚBLICA DOMINICANA</Text>
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.accentStrong }]}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: KlippLayout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: KlippLayout.pageGutter,
    paddingTop: 28,
    paddingBottom: 10,
    gap: 18,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42 },
  logoMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  brandCopy: { gap: 2 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: KlippColors.navy, fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  location: { color: KlippColors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  trailing: { marginLeft: 'auto' },
  heading: { gap: 6, marginTop: 2 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
  title: { color: KlippColors.navy, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  subtitle: { maxWidth: 720, color: KlippColors.muted, fontSize: 14, lineHeight: 21 },
});
