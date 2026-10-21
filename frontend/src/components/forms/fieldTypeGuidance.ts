import type { Definition } from './formSchema';

export const fieldTypeGuidance: Record<Definition['field_type'], string> = {
  text: 'A short, single-line value.', textarea: 'A longer, multi-line note.', number: 'An exact decimal value; not a calculated formula.',
  currency: 'A non-negative whole number of INR minor units; 100 minor units is ₹1.', date: 'A calendar date without a time.',
  datetime: 'A date and time represented in UTC.', email: 'An email address, not an account credential.', phone: 'A valid international phone number.',
  checkbox: 'An explicit Yes or No value.', select: 'One option from the configured list.', multiselect: 'Multiple distinct options from the configured list.',
  radio: 'One choice from the configured options.', url: 'An HTTP or HTTPS address without credentials.',
};
