import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
export const normalizePhone = (value: string, country: CountryCode = 'IN'): string | undefined => {
  const phone = parsePhoneNumberFromString(value, country);
  return phone?.isValid() ? phone.number : undefined;
};
