import { POSTGRES_BIGINT_MAX, formatInrMinor } from '../customerDues/money.js';
import { AppError } from '../../utils/AppError.js';

const pricePattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;

export const parseInrPriceToMinor = (value: string): bigint => {
  const normalized = value.trim();
  const match = pricePattern.exec(normalized);
  if (!match) {
    throw new AppError('Price must be a non-negative INR decimal string with at most two decimal places', 400);
  }
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minor = whole * 100n + BigInt(fraction || '0');
  if (minor > POSTGRES_BIGINT_MAX) throw new AppError('Price exceeds the supported INR range', 400);
  return minor;
};

export const legacyNumberToInrPriceMinor = (value: number): bigint => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Legacy price must be a non-negative finite number');
  }
  let minor: bigint;
  try {
    minor = parseInrPriceToMinor(value.toString());
  } catch {
    throw new Error('Legacy price is not exactly representable with INR two-decimal precision');
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || Number(minor) / 100 !== value) {
    throw new Error('Legacy price cannot be converted to paise without precision loss');
  }
  return minor;
};

export { formatInrMinor };
