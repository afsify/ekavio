/** Display/preview only. The server remains money, quantity and time authority. */
export function decimalUnits(value: string, scale: number): bigint | null {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value) || value.length > 32) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
}
export function quantityText(milli: bigint): string {
  const a = milli < 0n ? -milli : milli;
  return `${milli < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`;
}
export function branchTime(instant: string | null | undefined, timezone?: string, date = false): string {
  if (!instant || !timezone) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, ...(date ? { year: 'numeric', month: 'short', day: 'numeric' } as const : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));
}
export function shiftBusinessDate(date: string, days: number): string {
  const instant = new Date(date + 'T12:00:00Z');
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
export function nominalEnd(date: string, time: string, minutes?: number): string {
  if (!date || !time || !minutes) return 'Select a service and start time';
  const instant = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(instant.getTime())) return 'Choose a valid time';
  instant.setUTCMinutes(instant.getUTCMinutes() + minutes);
  return instant.toISOString().slice(0, 16).replace('T', ' ');
}
