import { AppError } from '../../utils/AppError.js';

export const MAX_QUANTITY_MILLI = 999_999_999_999_999_999n;

const quantityPattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/;

export const parseQuantityToMilli = (value: string): bigint => {
  const normalized = value.trim();
  const match = quantityPattern.exec(normalized);
  if (!match) {
    throw new AppError('Quantity must be a non-negative decimal string with at most three decimal places', 400);
  }
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? '').padEnd(3, '0');
  const milli = whole * 1000n + BigInt(fraction || '0');
  if (milli > MAX_QUANTITY_MILLI) {
    throw new AppError('Quantity exceeds the supported NUMERIC(18,3) range', 400);
  }
  return milli;
};

export const formatQuantityMilli = (milli: bigint): string => {
  const sign = milli < 0n ? '-' : '';
  const magnitude = milli < 0n ? -milli : milli;
  return `${sign}${magnitude / 1000n}.${(magnitude % 1000n).toString().padStart(3, '0')}`;
};

export const parseNonNegativeQuantity = (value: string): string =>
  formatQuantityMilli(parseQuantityToMilli(value));

export const parsePositiveQuantity = (value: string): string => {
  const milli = parseQuantityToMilli(value);
  if (milli <= 0n) throw new AppError('Quantity must be greater than zero', 400);
  return formatQuantityMilli(milli);
};

export const legacyNumberToQuantity = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Legacy quantity must be a non-negative finite number');
  }
  const source = value.toString();
  let canonical: string;
  try {
    canonical = parseNonNegativeQuantity(source);
  } catch {
    throw new Error('Legacy quantity is not exactly representable with three-decimal precision');
  }
  if (Number(canonical) !== value) {
    throw new Error('Legacy quantity cannot be converted without precision loss');
  }
  return canonical;
};
