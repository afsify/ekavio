import { useId, useState } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { normalizePhone } from '../../utils/phone';

interface Props { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean }
const countries = getCountries();
const flag = (country: string) => [...country].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
export function PhoneInput({ label, value, onChange, error, required }: Props) {
  const id = useId();
  const parsed = parsePhoneNumberFromString(value, 'IN');
  const [selected, setSelected] = useState<CountryCode>(parsed?.country ?? 'IN');
  const country = parsed?.country ?? selected;
  const callingCode = getCountryCallingCode(country);
  const national = value.startsWith(`+${callingCode}`) ? value.slice(callingCode.length + 1) : value;
  const update = (digits: string, nextCountry = country) => {
    const clean = digits.replace(/\D/g, '');
    onChange(clean ? normalizePhone(clean, nextCountry) ?? `+${getCountryCallingCode(nextCountry)}${clean}` : '');
  };
  return <div className="field"><label htmlFor={id}>{label}</label><div className="phone-field">
    <select aria-label={`${label} country`} value={country} onChange={(event) => { const next = event.target.value as CountryCode; setSelected(next); update(national, next); }}>
      {countries.map((code) => <option key={code} value={code}>{flag(code)} {regions.of(code)} (+{getCountryCallingCode(code)})</option>)}
    </select><span aria-label="Calling code">+{callingCode}</span>
    <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={national} required={required} maxLength={20} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => update(event.target.value)} />
  </div>{error && <p id={`${id}-error`} role="alert" className="error-text">{error}</p>}</div>;
}
