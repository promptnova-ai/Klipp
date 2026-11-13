import { KlippColors } from './tokens';

/** Role changes accent and semantic emphasis, never the underlying page template. */
export const RoleThemes = {
  client: { accent: KlippColors.cobalt, accentStrong: KlippColors.cobaltDark, accentSoft: KlippColors.surfaceBlue, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'CLIENTE' },
  pro: { accent: KlippColors.coral, accentStrong: KlippColors.coralDark, accentSoft: KlippColors.surfaceCoral, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'KLIPP PRO' },
  admin: { accent: KlippColors.cobalt, accentStrong: KlippColors.cobaltDark, accentSoft: KlippColors.surfaceBlue, canvas: KlippColors.ivory, ink: KlippColors.ink, label: 'ADMINISTRACIÓN' },
} as const;

export type KlippRole = keyof typeof RoleThemes;
