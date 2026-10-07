import { createHash } from 'node:crypto';
import { formatInrMinor, parseInrPriceToMinor } from '../domains/inventory/money.js';
import { parseNonNegativeQuantity, parsePositiveQuantity } from '../domains/inventory/quantity.js';
import type {
  InventoryItemProjection,
  PostgresInventoryRepository,
  StockMovementProjection,
} from '../domains/inventory/repository.js';
import { inventoryUnitLabel, inventoryUnits } from '../domains/inventory/units.js';
import type {
  AddInventoryItemInput,
  AdjustStockInput,
  ConsumeStockInput,
  InventoryListQuery,
  InventoryMovementListQuery,
  ReceiveStockInput,
  ReverseStockMovementInput,
  UpdateInventoryItemInput,
} from '../schemas/inventorySchemas.js';
import { AppError } from '../utils/AppError.js';
import type { AuthorizationContext } from './requestContextService.js';

const branchIdFor = (context: AuthorizationContext): string => {
  if (!context.branchId) throw new AppError('An active branch context is required', 400);
  return context.branchId;
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const parseOccurredAt = (value: string | undefined, now: () => Date): Date => {
  if (!value) return now();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError('Occurrence time is invalid', 400);
  return parsed;
};

const normalizeOptional = (value: string | null | undefined): string | null =>
  value?.trim() || null;

const serializeItem = (item: InventoryItemProjection) => ({
  id: item.id,
  organizationId: item.organizationId,
  branchId: item.branchId,
  locationId: item.locationId,
  locationName: item.locationName,
  name: item.name,
  sku: item.sku,
  barcode: item.barcode,
  unitCode: item.unitCode,
  unit: { code: item.unitCode, label: inventoryUnitLabel(item.unitCode) },
  status: item.status,
  priceMinor: item.priceMinor,
  price: item.priceMinor === null ? null : formatInrMinor(BigInt(item.priceMinor)),
  currency: item.currency,
  quantity: item.quantity,
  reorderThreshold: item.reorderThreshold,
  isLowStock: item.isLowStock,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const serializeMovement = (movement: StockMovementProjection) => ({
  id: movement.id,
  organizationId: movement.organizationId,
  branchId: movement.branchId,
  itemId: movement.itemId,
  itemName: movement.itemName,
  unitCode: movement.unitCode,
  unit: { code: movement.unitCode, label: inventoryUnitLabel(movement.unitCode) },
  locationId: movement.locationId,
  locationName: movement.locationName,
  movementType: movement.movementType,
  quantityDelta: movement.quantityDelta,
  quantity: movement.quantityDelta.startsWith('-')
    ? movement.quantityDelta.slice(1)
    : movement.quantityDelta,
  reason: movement.reason,
  reference: movement.reference,
  reversesMovementId: movement.reversesMovementId,
  reversedByMovementId: movement.reversedByMovementId,
  actorMembershipId: movement.actorMembershipId,
  actorName: movement.actorName,
  occurredAt: movement.occurredAt.toISOString(),
  createdAt: movement.createdAt.toISOString(),
});

const mapInventoryError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : 'Inventory request failed';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '23505') {
    if (/sku/i.test(message)) return new AppError('SKU is already used by another inventory item', 409);
    if (/barcode/i.test(message)) return new AppError('Barcode is already used by another inventory item', 409);
    return new AppError('Inventory command conflicts with an existing record', 409);
  }
  if (/unit cannot change|already reversed|cannot make the balance negative|idempotency/i.test(message)) {
    return new AppError(message, 409);
  }
  if (['23503', '23514', '22P02', '22003'].includes(code)
    || /must|required|invalid|outside|assigned|authorized scope/i.test(message)) {
    return new AppError(message, 400);
  }
  return new AppError('Inventory request failed safely', 500);
};

export const createInventoryService = (
  repository: PostgresInventoryRepository,
  now: () => Date = () => new Date(),
) => ({
  units() {
    return inventoryUnits.map((unit) => ({ ...unit }));
  },

  async createItem(context: AuthorizationContext, input: AddInventoryItemInput) {
    try {
      const branchId = branchIdFor(context);
      const reorderThreshold = parseNonNegativeQuantity(input.reorderThreshold);
      const parsedOpening = input.openingQuantity === undefined
        ? null
        : parseNonNegativeQuantity(input.openingQuantity);
      const openingQuantity = parsedOpening === '0.000' ? null : parsedOpening;
      const priceMinor = input.price == null ? null : parseInrPriceToMinor(input.price);
      const normalized = {
        ...(input.customFields ? {customFields:input.customFields} : {}),
        branchId,
        name: input.name.trim(),
        sku: normalizeOptional(input.sku),
        barcode: normalizeOptional(input.barcode),
        unitCode: input.unitCode,
        priceMinor: priceMinor?.toString() ?? null,
        currency: input.currency,
        reorderThreshold,
        openingQuantity,
        occurredAt: input.occurredAt ?? null,
      };
      return serializeItem(await repository.createItem({
        organizationId: context.organizationId,
        branchId,
        name: normalized.name,
        sku: normalized.sku,
        barcode: normalized.barcode,
        unitCode: normalized.unitCode,
        priceMinor,
        currency: normalized.currency,
        reorderThreshold,
        openingQuantity,
        actorMembershipId: context.membershipId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: fingerprint(normalized),
        occurredAt: parseOccurredAt(input.occurredAt, now),
      }));
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async listItems(context: AuthorizationContext, query: InventoryListQuery) {
    try {
      const result = await repository.listItems({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
        page: query.page,
        limit: query.limit,
      });
      return {
        data: result.data.map(serializeItem),
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      };
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async getItem(context: AuthorizationContext, itemId: string) {
    try {
      const item = await repository.findItem({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        itemId,
      });
      if (!item) throw new AppError('Inventory item not found', 404);
      return serializeItem(item);
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async updateItem(
    context: AuthorizationContext,
    itemId: string,
    input: UpdateInventoryItemInput,
  ) {
    try {
      const priceMinor = input.price === undefined
        ? undefined
        : input.price === null ? null : parseInrPriceToMinor(input.price);
      return serializeItem(await repository.updateItem({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        itemId,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sku !== undefined ? { sku: normalizeOptional(input.sku) } : {}),
        ...(input.barcode !== undefined ? { barcode: normalizeOptional(input.barcode) } : {}),
        ...(input.unitCode !== undefined ? { unitCode: input.unitCode } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(priceMinor !== undefined ? { priceMinor } : {}),
        ...(input.reorderThreshold !== undefined
          ? { reorderThreshold: parseNonNegativeQuantity(input.reorderThreshold) }
          : {}),
      }));
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async receive(context: AuthorizationContext, itemId: string, input: ReceiveStockInput) {
    return this.change(context, itemId, 'receive', input);
  },

  async consume(context: AuthorizationContext, itemId: string, input: ConsumeStockInput) {
    return this.change(context, itemId, 'consume', input);
  },

  async adjust(context: AuthorizationContext, itemId: string, input: AdjustStockInput) {
    const movementType = input.direction === 'increase'
      ? 'adjustment_increase' as const
      : 'adjustment_decrease' as const;
    return this.change(context, itemId, movementType, input);
  },

  async change(
    context: AuthorizationContext,
    itemId: string,
    movementType: 'receive' | 'consume' | 'adjustment_increase' | 'adjustment_decrease',
    input: ReceiveStockInput | ConsumeStockInput | AdjustStockInput,
  ) {
    try {
      const branchId = branchIdFor(context);
      const quantity = parsePositiveQuantity(input.quantity);
      const normalized = {
        branchId,
        itemId,
        movementType,
        quantity,
        reason: normalizeOptional(input.reason),
        reference: normalizeOptional(input.reference),
        occurredAt: input.occurredAt ?? null,
      };
      return serializeMovement(await repository.changeStock({
        organizationId: context.organizationId,
        branchId,
        itemId,
        movementType,
        quantity,
        reason: normalized.reason,
        reference: normalized.reference,
        actorMembershipId: context.membershipId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: fingerprint(normalized),
        occurredAt: parseOccurredAt(input.occurredAt, now),
      }));
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async reverse(
    context: AuthorizationContext,
    targetMovementId: string,
    input: ReverseStockMovementInput,
  ) {
    try {
      const branchId = branchIdFor(context);
      const normalized = {
        branchId,
        targetMovementId,
        reason: input.reason.trim(),
        occurredAt: input.occurredAt ?? null,
      };
      return serializeMovement(await repository.reverse({
        organizationId: context.organizationId,
        branchId,
        targetMovementId,
        reason: normalized.reason,
        actorMembershipId: context.membershipId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: fingerprint(normalized),
        occurredAt: parseOccurredAt(input.occurredAt, now),
      }));
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async listMovements(
    context: AuthorizationContext,
    itemId: string,
    query: InventoryMovementListQuery,
  ) {
    try {
      const result = await repository.listMovements({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        itemId,
        page: query.page,
        limit: query.limit,
      });
      return {
        data: result.data.map(serializeMovement),
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      };
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async lowStock(context: AuthorizationContext, query: InventoryMovementListQuery) {
    try {
      const result = await repository.listLowStock({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        page: query.page,
        limit: query.limit,
      });
      return {
        data: result.data.map(serializeItem),
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      };
    } catch (error) {
      throw mapInventoryError(error);
    }
  },

  async countLowStock(context: AuthorizationContext) {
    try {
      return await repository.countLowStock(context.organizationId, branchIdFor(context));
    } catch (error) {
      throw mapInventoryError(error);
    }
  },
});

export type InventoryService = ReturnType<typeof createInventoryService>;
