export function formatDop(amount: number) {
  return `RD$ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)}`;
}

export function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santo_Domingo',
  }).format(new Date(value));
}