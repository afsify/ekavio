export interface PhoneNormalizationPolicy {
  defaultCallingCode?: string;
}

export const normalizeCustomerName = (value: string): { display: string; key: string } => {
  const display = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!display) throw new Error('Customer name is required');
  return { display, key: display.toLocaleLowerCase('en-US') };
};

export const normalizePhone = (
  value: string | null | undefined,
  policy: PhoneNormalizationPolicy = {},
): string | null => {
  if (value === null || value === undefined || !value.trim()) return null;
  let candidate = value.normalize('NFKC').trim().replace(/[\s().-]/g, '');
  if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
  if (!candidate.startsWith('+')) {
    const callingCode = policy.defaultCallingCode?.replace(/^\+/, '');
    if (!callingCode || !/^[1-9][0-9]{0,2}$/.test(callingCode)) {
      throw new Error('A reviewed default calling code is required for a local phone number');
    }
    candidate = `+${callingCode}${candidate.replace(/^0+/, '')}`;
  }
  if (!/^\+[1-9][0-9]{5,14}$/.test(candidate)) {
    throw new Error('Phone must normalize to E.164 format');
  }
  return candidate;
};
