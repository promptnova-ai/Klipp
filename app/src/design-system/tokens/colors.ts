export const colors = {
  cobalt: '#3D5AFE', cobaltDark: '#3048D8', coral: '#FF7058', mint: '#BCEBD8',
  ivory: '#F7F5F0', ink: '#171B2D', white: '#FFFFFF', muted: '#72778A', border: '#E8E5DE',
  surface: '#FFFFFF', surfaceMuted: '#F1EFE9', surfaceBlue: '#E9EDFF', surfaceCoral: '#FFF0EC',
  success: '#247A5A', warning: '#A85A25', danger: '#C43F35',
} as const;
export type DesignRole = 'client' | 'pro';
export const roleColor = (role: DesignRole) => role === 'pro' ? colors.coral : colors.cobalt;
