import type { ReactNode } from 'react';
import { KlippMark } from '@/components/klipp-mark';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { KlippColors, KlippLayout, KlippSpacing, KlippTypography } from '@/theme/tokens';
import { RoleThemes, type KlippRole } from '@/theme/themes';

type BrandScreenHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  role?: KlippRole;
  trailing?: ReactNode;
  inset?: boolean;
};

export function BrandScreenHeader({
  eyebrow,
  title,
  subtitle,
  role = 'client',
  trailing,
  inset = true,
}: BrandScreenHeaderProps) {
  const theme = RoleThemes[role];
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const gutter = width < 390 ? KlippLayout.pageGutterCompact : KlippLayout.pageGutter;
  const roleLabel = role === 'pro' ? 'PRO' : role === 'admin' ? 'ADMIN' : 'RD';

  return (
    <View style={[styles.header, { paddingHorizontal: inset ? gutter : 0, paddingTop: compact ? 18 : 28, gap: compact ? 14 : 18 }]}>
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
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: KlippSpacing[2], minHeight: 42 },
  logoMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  brandCopy: { gap: KlippSpacing[1] },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: KlippSpacing[2] },
  brand: { color: KlippColors.ink, fontSize: KlippTypography.size.title, fontWeight: '800', letterSpacing: KlippTypography.tracking.tight },
  badge: { paddingHorizontal: KlippSpacing[2], paddingVertical: KlippSpacing[1], borderRadius: KlippLayout.radiusPill },
  badgeText: { fontSize: KlippTypography.size.micro, fontWeight: '800', letterSpacing: KlippTypography.tracking.label },
  location: { color: KlippColors.muted, fontSize: KlippTypography.size.micro, fontWeight: '700', letterSpacing: KlippTypography.tracking.label },
  trailing: { marginLeft: 'auto' },
  heading: { gap: KlippSpacing[2], marginTop: KlippSpacing[1] },
  eyebrow: { fontSize: KlippTypography.size.caption, fontWeight: '800', letterSpacing: KlippTypography.tracking.eyebrow },
  title: { color: KlippColors.ink, fontSize: KlippTypography.size.titleLarge, lineHeight: KlippTypography.lineHeight.titleLarge, fontWeight: '800', letterSpacing: KlippTypography.tracking.tight },
  titleCompact: { fontSize: KlippTypography.size.compactTitle, lineHeight: KlippTypography.lineHeight.compactTitle, letterSpacing: KlippTypography.tracking.tight },
  subtitle: { maxWidth: 720, color: KlippColors.muted, fontSize: KlippTypography.size.bodySmall, lineHeight: KlippTypography.lineHeight.bodyLarge },
});
