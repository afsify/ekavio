// Decimal strings at the UI boundary; integer paise remains the server authority.
export const rupeesToPaise = (value: string): string | null => {
  if (!/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
};
export const paiseToRupees = (value: string | null | undefined): string => {
  if (value == null || !/^\d+$/.test(value)) return '';
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
};
