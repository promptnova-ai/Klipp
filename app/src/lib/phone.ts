/** Convert a user-entered phone number to E.164 without forcing a country picker. */
export function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;

  // Dominican Republic and the US share the +1 numbering plan.
  const international = hasPlus ? digits : digits.length === 10 ? `1${digits}` : digits.length === 11 && digits.startsWith('1') ? digits : null;
  if (!international || international.length < 8 || international.length > 15) return null;
  return `+${international}`;
}
