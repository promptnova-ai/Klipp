import { KlippTypography } from '@/theme/tokens';

/** Compatibility text presets composed only from canonical type tokens. */
export const typography = {
  display: { fontSize: KlippTypography.size.display, lineHeight: KlippTypography.lineHeight.display, fontWeight: '800' as const, letterSpacing: KlippTypography.tracking.tight },
  h1: { fontSize: KlippTypography.size.titleLarge, lineHeight: KlippTypography.lineHeight.titleLarge, fontWeight: '800' as const, letterSpacing: KlippTypography.tracking.tight },
  h2: { fontSize: KlippTypography.size.title, lineHeight: KlippTypography.lineHeight.title, fontWeight: '800' as const, letterSpacing: KlippTypography.tracking.tight },
  h3: { fontSize: KlippTypography.size.titleSmall, lineHeight: KlippTypography.lineHeight.titleSmall, fontWeight: '700' as const, letterSpacing: KlippTypography.tracking.normal },
  body: { fontSize: KlippTypography.size.body, lineHeight: KlippTypography.lineHeight.body, fontWeight: '400' as const },
  caption: { fontSize: KlippTypography.size.bodySmall, lineHeight: KlippTypography.lineHeight.bodySmall, fontWeight: '500' as const },
  tiny: { fontSize: KlippTypography.size.small, lineHeight: KlippTypography.lineHeight.small, fontWeight: '600' as const },
} as const;
