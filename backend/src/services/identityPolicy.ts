import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AppError } from '../utils/AppError.js';

// bcrypt accepts at most 72 UTF-8 bytes. Never silently truncate a new password.
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(72)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Use at most 72 UTF-8 bytes');
export const requireNewPassword = (value: unknown): string => {
  const result = passwordSchema.safeParse(value);
  if (!result.success) throw new AppError('Use a password of 12 characters to 72 UTF-8 bytes', 400);
  return result.data;
};
export const emailSchema = z.string().trim().email().max(254);
export const normalizeEmail = (value: string): string => emailSchema.parse(value).toLowerCase();
export const canonicalPhone = (value: string): string | null => {
  const text = value.trim();
  if (!/^[+\d().\s-]+$/.test(text)) return null;
  const parsed = parsePhoneNumberFromString(text, { defaultCountry: 'IN', extract: false });
  return parsed?.isValid() ? parsed.number : null;
};
export const requirePhone = (value: string): string => {
  const phone = canonicalPhone(value);
  if (!phone) throw new AppError('Enter a valid international or Indian local phone number', 400);
  return phone;
};
export const classifyIdentifier = (value: string) => {
  const identifier = value.trim();
  return identifier.includes('@')
    ? { kind: 'email' as const, value: identifier.toLowerCase() }
    : { kind: 'phone' as const, value: identifier };
};

// Compare legacy formats without rewriting them. An invalid legacy value matches
// only its exact trimmed representation. Canonical collisions remain ambiguous.
export const phoneUserIds = async (client: { query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>> }, value: string): Promise<string[]> => {
  const canonical = canonicalPhone(value);
  const nationalDigits = canonical ? parsePhoneNumberFromString(canonical)!.nationalNumber : '';
  const result = await client.query<{ id: string; phone: string }>(
    `SELECT id, phone FROM users WHERE btrim(phone) = $1
     OR ($2 <> '' AND right(regexp_replace(phone, '[^0-9]', '', 'g'), length($2)) = $2)`,
    // Candidate suffix includes legacy trunk/dialing prefixes. Only the complete
    // library-normalized equality below decides identity; suffixes never do.
    [value.trim(), nationalDigits],
  );
  return result.rows.filter((row) => row.phone.trim() === value.trim() ||
    (canonical !== null && canonicalPhone(row.phone) === canonical)).map((row) => row.id);
};
export const lockNewPhone = async (client: PoolClient, phone: string, conflictMessage = 'Identity already exists; authenticated account linking is not supported'): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`identity-phone:${phone}`]);
  if ((await phoneUserIds(client, phone)).length) throw new AppError(conflictMessage, 409);
};
