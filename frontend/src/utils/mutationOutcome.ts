import { isAxiosError } from 'axios';
import { z } from 'zod';
/** Creates with no server command key must not be replayed after response loss. */
export function uncertainWrite(error: unknown) {
  return Boolean(error) && (!isAxiosError(error) || !error.response || error.response.status >= 500);
}
export const optionalEmailValid = (value: string) => !value || z.email().safeParse(value).success;
