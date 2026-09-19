export const normalizeServiceName = (value: string): { display: string; key: string } => {
  const display = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!display) throw new Error('Service name is required');
  return { display, key: display.toLocaleLowerCase('en-US') };
};
