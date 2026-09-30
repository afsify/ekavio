export const inventoryUnits = [
  { code: 'unit', label: 'Unit' },
  { code: 'piece', label: 'Piece' },
  { code: 'pack', label: 'Pack' },
  { code: 'box', label: 'Box' },
  { code: 'kg', label: 'Kilogram' },
  { code: 'g', label: 'Gram' },
  { code: 'litre', label: 'Litre' },
  { code: 'ml', label: 'Millilitre' },
] as const;

export type InventoryUnitCode = (typeof inventoryUnits)[number]['code'];

const supportedUnits = new Set<string>(inventoryUnits.map(({ code }) => code));

export const isInventoryUnitCode = (value: string): value is InventoryUnitCode =>
  supportedUnits.has(value);

export const inventoryUnitLabel = (code: InventoryUnitCode): string =>
  inventoryUnits.find((unit) => unit.code === code)?.label ?? code;
