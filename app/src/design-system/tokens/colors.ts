import { KlippColors } from '@/theme/tokens';
import { RoleThemes, type KlippRole } from '@/theme/themes';

/** Compatibility names backed by the canonical Klipp palette. */
export const colors = {
  cobalt: KlippColors.cobalt, cobaltDark: KlippColors.cobaltDark,
  coral: KlippColors.coral, mint: KlippColors.mint, ivory: KlippColors.ivory,
  ink: KlippColors.ink, white: KlippColors.white, muted: KlippColors.muted,
  border: KlippColors.border, surface: KlippColors.surface,
  surfaceMuted: KlippColors.surfaceMuted, surfaceBlue: KlippColors.surfaceBlue,
  surfaceCoral: KlippColors.surfaceCoral, success: KlippColors.success,
  warning: KlippColors.warning, danger: KlippColors.danger,
} as const;
export type DesignRole = KlippRole;
export const roleColor = (role: DesignRole) => RoleThemes[role].accent;
