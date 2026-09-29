import { AppError } from '../../utils/AppError.js';

export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

const decimalMoneyPattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;

export const parseInrDecimalToMinor = (value: string): bigint => {
  const normalized = value.trim();
  const match = decimalMoneyPattern.exec(normalized);
  if (!match) {
    throw new AppError('Amount must be a positive INR decimal string with at most two decimal places', 400);
  }
  const whole = BigInt(match[1]!);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minor = whole * 100n + BigInt(fraction || '0');
  if (minor <= 0n) throw new AppError('Amount must be greater than zero', 400);
  if (minor > POSTGRES_BIGINT_MAX) throw new AppError('Amount exceeds the supported INR range', 400);
  return minor;
};

export const legacyNumberToInrMinor = (value: number): bigint => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Legacy amount must be a positive finite number');
  }
  const source = value.toString();
  if (!decimalMoneyPattern.test(source)) {
    throw new Error('Legacy amount is not exactly representable with INR two-decimal precision');
  }
  const minor = parseInrDecimalToMinor(source);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || Number(minor) / 100 !== value) {
    throw new Error('Legacy amount cannot be converted to paise without precision loss');
  }
  return minor;
};

export const formatInrMinor = (minor: bigint): string => {
  const sign = minor < 0n ? '-' : '';
  const magnitude = minor < 0n ? -minor : minor;
  return `${sign}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
};
