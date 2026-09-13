const readHttpUrl = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
};

export const frontendConfig = Object.freeze({
  apiUrl: readHttpUrl('VITE_API_URL', import.meta.env.VITE_API_URL),
  socketUrl: readHttpUrl('VITE_SOCKET_URL', import.meta.env.VITE_SOCKET_URL),
});
