import type { PoolClient, QueryResultRow } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { AppError } from '../../utils/AppError.js';
import type { InventoryUnitCode } from './units.js';

export type InventoryItemStatus = 'active' | 'inactive';
export type StockMovementType =
  | 'opening'
  | 'receive'
  | 'consume'
  | 'adjustment_increase'
  | 'adjustment_decrease'
  | 'reversal';
export type StockCommandType = Exclude<StockMovementType, 'opening' | 'reversal'>;

export interface InventoryItemProjection {
  id: string;
  organizationId: string;
  branchId: string;
  locationId: string;
  locationName: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitCode: InventoryUnitCode;
  status: InventoryItemStatus;
  priceMinor: string | null;
  currency: 'INR';
  quantity: string;
  reorderThreshold: string;
  isLowStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementProjection {
  id: string;
  organizationId: string;
  branchId: string;
  itemId: string;
  itemName: string;
  unitCode: InventoryUnitCode;
  locationId: string;
  locationName: string;
  movementType: StockMovementType;
  quantityDelta: string;
  reason: string | null;
  reference: string | null;
  reversesMovementId: string | null;
  reversedByMovementId: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  occurredAt: Date;
  createdAt: Date;
}

interface InventoryItemRow extends QueryResultRow {
  id: string;
  organization_id: string;
  branch_id: string;
  location_id: string;
  location_name: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit_code: InventoryUnitCode;
  status: InventoryItemStatus;
  price_minor: string | null;
  currency: 'INR';
  quantity: string;
  reorder_threshold: string;
  is_low_stock: boolean;
  created_at: Date;
  updated_at: Date;
  creation_command_fingerprint: string | null;
}

interface StockMovementRow extends QueryResultRow {
  id: string;
  organization_id: string;
  branch_id: string;
  item_id: string;
  item_name: string;
  unit_code: InventoryUnitCode;
  location_id: string;
  location_name: string;
  movement_type: StockMovementType;
  quantity_delta: string;
  reason: string | null;
  source_type: string | null;
  source_id: string | null;
  reverses_movement_id: string | null;
  reversed_by_movement_id: string | null;
  created_by_membership_id: string | null;
  actor_name: string | null;
  occurred_at: Date;
  created_at: Date;
  command_fingerprint: string | null;
}

const itemSelect = `
  i.id, i.organization_id, l.branch_id, l.id AS location_id, l.name AS location_name,
  i.name, i.sku, i.barcode, i.unit_code, i.status,
  i.price_minor::text, i.currency,
  COALESCE(b.quantity, 0::numeric(18,3))::numeric(18,3)::text AS quantity,
  COALESCE(b.reorder_threshold, 0::numeric(18,3))::numeric(18,3)::text AS reorder_threshold,
  (COALESCE(b.quantity, 0::numeric) <= COALESCE(b.reorder_threshold, 0::numeric)) AS is_low_stock,
  i.created_at, GREATEST(i.updated_at, COALESCE(b.updated_at, i.updated_at)) AS updated_at,
  i.creation_command_fingerprint
`;

const itemJoins = `
  JOIN stock_locations l
    ON l.organization_id = i.organization_id
    AND l.branch_id = $2
    AND l.is_default = TRUE
    AND l.status = 'active'
  LEFT JOIN stock_balances b
    ON b.item_id = i.id AND b.location_id = l.id
`;

const movementSelect = `
  m.id, m.organization_id, m.branch_id, m.item_id, i.name AS item_name,
  i.unit_code, m.location_id, l.name AS location_name, m.movement_type,
  m.quantity_delta::text, m.reason, m.source_type, m.source_id,
  m.reverses_movement_id, reversed.id AS reversed_by_movement_id,
  m.created_by_membership_id, u.name AS actor_name, m.occurred_at, m.created_at,
  m.command_fingerprint
`;

const movementJoins = `
  JOIN inventory_items i ON i.id = m.item_id AND i.organization_id = m.organization_id
  JOIN stock_locations l
    ON l.id = m.location_id
    AND l.organization_id = m.organization_id
    AND l.branch_id = m.branch_id
  LEFT JOIN memberships actor ON actor.id = m.created_by_membership_id
  LEFT JOIN users u ON u.id = actor.user_id
  LEFT JOIN stock_movements reversed ON reversed.reverses_movement_id = m.id
`;

const projectItem = (row: InventoryItemRow): InventoryItemProjection => ({
  id: row.id,
  organizationId: row.organization_id,
  branchId: row.branch_id,
  locationId: row.location_id,
  locationName: row.location_name,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  unitCode: row.unit_code,
  status: row.status,
  priceMinor: row.price_minor,
  currency: row.currency,
  quantity: row.quantity,
  reorderThreshold: row.reorder_threshold,
  isLowStock: row.is_low_stock,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const projectMovement = (row: StockMovementRow): StockMovementProjection => ({
  id: row.id,
  organizationId: row.organization_id,
  branchId: row.branch_id,
  itemId: row.item_id,
  itemName: row.item_name,
  unitCode: row.unit_code,
  locationId: row.location_id,
  locationName: row.location_name,
  movementType: row.movement_type,
  quantityDelta: row.quantity_delta,
  reason: row.reason,
  reference: row.source_type === 'manual_reference' ? row.source_id : null,
  reversesMovementId: row.reverses_movement_id,
  reversedByMovementId: row.reversed_by_movement_id,
  actorMembershipId: row.created_by_membership_id,
  actorName: row.actor_name,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

const lockCommand = async (
  client: PoolClient,
  organizationId: string,
  key: string,
): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `inventory-command:${organizationId}:${key}`,
  ]);
};

const defaultLocation = async (
  client: PoolClient,
  organizationId: string,
  branchId: string,
): Promise<{ id: string }> => {
  const result = await client.query<{ id: string }>(`
    SELECT l.id
    FROM stock_locations l
    JOIN branches b ON b.id = l.branch_id AND b.organization_id = l.organization_id
    WHERE l.organization_id = $1 AND l.branch_id = $2
      AND l.is_default = TRUE AND l.status = 'active' AND b.status = 'active'
    FOR UPDATE OF l
  `, [organizationId, branchId]);
  const location = result.rows[0];
  if (!location) throw new AppError('An active default stock location is required for the selected branch', 400);
  return location;
};

const selectItem = async (
  client: PoolClient,
  organizationId: string,
  branchId: string,
  itemId: string,
): Promise<InventoryItemRow | null> => {
  const result = await client.query<InventoryItemRow>(`
    SELECT ${itemSelect}
    FROM inventory_items i
    ${itemJoins}
    WHERE i.organization_id = $1 AND i.id = $3
  `, [organizationId, branchId, itemId]);
  return result.rows[0] ?? null;
};

const selectMovementByIdempotency = async (
  client: PoolClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<StockMovementRow | null> => {
  const result = await client.query<StockMovementRow>(`
    SELECT ${movementSelect}
    FROM stock_movements m
    ${movementJoins}
    WHERE m.organization_id = $1 AND m.idempotency_key = $2
  `, [organizationId, idempotencyKey]);
  return result.rows[0] ?? null;
};

const ensureBalanceAndLock = async (
  client: PoolClient,
  input: { organizationId: string; branchId: string; itemId: string; locationId: string },
): Promise<string> => {
  await client.query(`
    INSERT INTO stock_balances (
      organization_id, branch_id, item_id, location_id, quantity, reorder_threshold
    ) VALUES ($1, $2, $3, $4, 0, 0)
    ON CONFLICT (item_id, location_id) DO NOTHING
  `, [input.organizationId, input.branchId, input.itemId, input.locationId]);
  const result = await client.query<{ quantity: string }>(`
    SELECT quantity::text
    FROM stock_balances
    WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3 AND location_id = $4
    FOR UPDATE
  `, [input.organizationId, input.branchId, input.itemId, input.locationId]);
  const quantity = result.rows[0]?.quantity;
  if (quantity === undefined) throw new Error('Stock balance boundary could not be locked');
  return quantity;
};

const assertNonNegativeResult = async (
  client: PoolClient,
  current: string,
  delta: string,
): Promise<void> => {
  const result = await client.query<{ valid: boolean }>(`
    SELECT ($1::numeric(18,3) + $2::numeric(18,3)) >= 0 AS valid
  `, [current, delta]);
  if (!result.rows[0]?.valid) throw new AppError('Stock command cannot make the balance negative', 409);
};

export class PostgresInventoryRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public createItem(input: {
    organizationId: string;
    branchId: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    unitCode: InventoryUnitCode;
    priceMinor: bigint | null;
    currency: 'INR';
    reorderThreshold: string;
    openingQuantity: string | null;
    actorMembershipId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    occurredAt: Date;
  }): Promise<InventoryItemProjection> {
    return this.database.transaction(async (client) => {
      await lockCommand(client, input.organizationId, `item:${input.idempotencyKey}`);
      const retry = await client.query<InventoryItemRow>(`
        SELECT ${itemSelect}
        FROM inventory_items i
        ${itemJoins}
        WHERE i.organization_id = $1 AND i.creation_idempotency_key = $3
      `, [input.organizationId, input.branchId, input.idempotencyKey]);
      if (retry.rows[0]) {
        if (retry.rows[0].creation_command_fingerprint?.trim() !== input.commandFingerprint) {
          throw new AppError('Inventory item idempotency key was used with a different command', 409);
        }
        return projectItem(retry.rows[0]);
      }

      const location = await defaultLocation(client, input.organizationId, input.branchId);
      const item = await client.query<{ id: string }>(`
        INSERT INTO inventory_items (
          organization_id, name, sku, barcode, unit_code, status, price_minor,
          currency, creation_idempotency_key, creation_command_fingerprint
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)
        RETURNING id
      `, [
        input.organizationId, input.name, input.sku, input.barcode, input.unitCode,
        input.priceMinor?.toString() ?? null, input.currency, input.idempotencyKey,
        input.commandFingerprint,
      ]);
      const itemId = item.rows[0]?.id;
      if (!itemId) throw new Error('Inventory item was not returned after insertion');
      await client.query(`
        INSERT INTO stock_balances (
          organization_id, branch_id, item_id, location_id, quantity, reorder_threshold
        ) VALUES ($1, $2, $3, $4, 0, $5)
      `, [input.organizationId, input.branchId, itemId, location.id, input.reorderThreshold]);
      if (input.openingQuantity !== null) {
        await client.query(`
          INSERT INTO stock_movements (
            organization_id, branch_id, item_id, location_id, movement_type,
            quantity_delta, created_by_membership_id, idempotency_key,
            command_fingerprint, occurred_at
          ) VALUES ($1, $2, $3, $4, 'opening', $5, $6, $7, $8, $9)
        `, [
          input.organizationId, input.branchId, itemId, location.id,
          input.openingQuantity, input.actorMembershipId, input.idempotencyKey,
          input.commandFingerprint, input.occurredAt,
        ]);
        await client.query(`
          UPDATE stock_balances
          SET quantity = quantity + $5::numeric(18,3), updated_at = NOW()
          WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3 AND location_id = $4
        `, [input.organizationId, input.branchId, itemId, location.id, input.openingQuantity]);
      }
      const created = await selectItem(client, input.organizationId, input.branchId, itemId);
      if (!created) throw new Error('Inventory item was not available after insertion');
      return projectItem(created);
    });
  }

  public async listItems(input: {
    organizationId: string;
    branchId: string;
    search?: string;
    status?: InventoryItemStatus;
    page: number;
    limit: number;
  }): Promise<{ data: InventoryItemProjection[]; total: number }> {
    const values = [
      input.organizationId, input.branchId, input.search ?? null, input.status ?? null,
    ];
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const where = `
        i.organization_id = $1
        AND ($3::text IS NULL OR i.name ILIKE '%' || $3 || '%'
          OR i.sku ILIKE '%' || $3 || '%' OR i.barcode ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR i.status = $4)
      `;
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total
        FROM inventory_items i
        ${itemJoins}
        WHERE ${where}
      `, values);
      const rows = await client.query<InventoryItemRow>(`
        SELECT ${itemSelect}
        FROM inventory_items i
        ${itemJoins}
        WHERE ${where}
        ORDER BY LOWER(i.name), i.id
        LIMIT $5 OFFSET $6
      `, [...values, input.limit, (input.page - 1) * input.limit]);
      return { data: rows.rows.map(projectItem), total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async findItem(input: {
    organizationId: string;
    branchId: string;
    itemId: string;
  }): Promise<InventoryItemProjection | null> {
    return this.database.withClient(async (client) => {
      const row = await selectItem(client, input.organizationId, input.branchId, input.itemId);
      return row ? projectItem(row) : null;
    });
  }

  public updateItem(input: {
    organizationId: string;
    branchId: string;
    itemId: string;
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    unitCode?: InventoryUnitCode;
    status?: InventoryItemStatus;
    priceMinor?: bigint | null;
    reorderThreshold?: string;
  }): Promise<InventoryItemProjection> {
    return this.database.transaction(async (client) => {
      const location = await defaultLocation(client, input.organizationId, input.branchId);
      const locked = await client.query<{ id: string }>(`
        SELECT id FROM inventory_items
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE
      `, [input.itemId, input.organizationId]);
      if (!locked.rows[0]) throw new AppError('Inventory item not found', 404);
      await client.query(`
        UPDATE inventory_items SET
          name = CASE WHEN $3::boolean THEN $4 ELSE name END,
          sku = CASE WHEN $5::boolean THEN $6 ELSE sku END,
          barcode = CASE WHEN $7::boolean THEN $8 ELSE barcode END,
          unit_code = CASE WHEN $9::boolean THEN $10 ELSE unit_code END,
          status = CASE WHEN $11::boolean THEN $12 ELSE status END,
          price_minor = CASE WHEN $13::boolean THEN $14::bigint ELSE price_minor END,
          updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
      `, [
        input.itemId, input.organizationId,
        input.name !== undefined, input.name ?? null,
        input.sku !== undefined, input.sku ?? null,
        input.barcode !== undefined, input.barcode ?? null,
        input.unitCode !== undefined, input.unitCode ?? null,
        input.status !== undefined, input.status ?? null,
        input.priceMinor !== undefined, input.priceMinor?.toString() ?? null,
      ]);
      if (input.reorderThreshold !== undefined) {
        await client.query(`
          INSERT INTO stock_balances (
            organization_id, branch_id, item_id, location_id, quantity, reorder_threshold
          ) VALUES ($1, $2, $3, $4, 0, $5)
          ON CONFLICT (item_id, location_id) DO UPDATE SET
            reorder_threshold = EXCLUDED.reorder_threshold,
            updated_at = NOW()
        `, [input.organizationId, input.branchId, input.itemId, location.id, input.reorderThreshold]);
      }
      const updated = await selectItem(client, input.organizationId, input.branchId, input.itemId);
      if (!updated) throw new AppError('Inventory item not found', 404);
      return projectItem(updated);
    });
  }

  public changeStock(input: {
    organizationId: string;
    branchId: string;
    itemId: string;
    movementType: StockCommandType;
    quantity: string;
    reason: string | null;
    reference: string | null;
    actorMembershipId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    occurredAt: Date;
  }): Promise<StockMovementProjection> {
    return this.database.transaction(async (client) => {
      await lockCommand(client, input.organizationId, `movement:${input.idempotencyKey}`);
      const retry = await selectMovementByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (retry) {
        if (retry.command_fingerprint?.trim() !== input.commandFingerprint) {
          throw new AppError('Inventory idempotency key was used with a different command', 409);
        }
        return projectMovement(retry);
      }
      const location = await defaultLocation(client, input.organizationId, input.branchId);
      const item = await client.query<{ status: InventoryItemStatus }>(`
        SELECT status FROM inventory_items
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE
      `, [input.itemId, input.organizationId]);
      if (!item.rows[0]) throw new AppError('Inventory item not found', 404);
      if (item.rows[0].status !== 'active') {
        throw new AppError('Inactive inventory items cannot receive new stock movements', 409);
      }
      const balanceInput = {
        organizationId: input.organizationId,
        branchId: input.branchId,
        itemId: input.itemId,
        locationId: location.id,
      };
      const current = await ensureBalanceAndLock(client, balanceInput);
      const decreases = input.movementType === 'consume' || input.movementType === 'adjustment_decrease';
      const delta = decreases ? `-${input.quantity}` : input.quantity;
      await assertNonNegativeResult(client, current, delta);
      await client.query(`
        INSERT INTO stock_movements (
          organization_id, branch_id, item_id, location_id, movement_type,
          quantity_delta, source_type, source_id, created_by_membership_id,
          reason, idempotency_key, command_fingerprint, occurred_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          CASE WHEN $7::text IS NULL THEN NULL ELSE 'manual_reference' END,
          $7, $8, $9, $10, $11, $12
        )
      `, [
        input.organizationId, input.branchId, input.itemId, location.id,
        input.movementType, delta, input.reference, input.actorMembershipId,
        input.reason, input.idempotencyKey, input.commandFingerprint, input.occurredAt,
      ]);
      await client.query(`
        UPDATE stock_balances
        SET quantity = quantity + $5::numeric(18,3), updated_at = NOW()
        WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3 AND location_id = $4
      `, [input.organizationId, input.branchId, input.itemId, location.id, delta]);
      const created = await selectMovementByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (!created) throw new Error('Stock movement was not available after insertion');
      return projectMovement(created);
    });
  }

  public reverse(input: {
    organizationId: string;
    branchId: string;
    targetMovementId: string;
    reason: string;
    actorMembershipId: string;
    idempotencyKey: string;
    commandFingerprint: string;
    occurredAt: Date;
  }): Promise<StockMovementProjection> {
    return this.database.transaction(async (client) => {
      await lockCommand(client, input.organizationId, `movement:${input.idempotencyKey}`);
      const retry = await selectMovementByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (retry) {
        if (retry.command_fingerprint?.trim() !== input.commandFingerprint) {
          throw new AppError('Inventory idempotency key was used with a different command', 409);
        }
        return projectMovement(retry);
      }
      const targetResult = await client.query<{
        id: string; item_id: string; location_id: string;
        movement_type: StockMovementType; quantity_delta: string;
      }>(`
        SELECT id, item_id, location_id, movement_type, quantity_delta::text
        FROM stock_movements
        WHERE id = $1 AND organization_id = $2 AND branch_id = $3
        FOR UPDATE
      `, [input.targetMovementId, input.organizationId, input.branchId]);
      const target = targetResult.rows[0];
      if (!target) throw new AppError('Stock movement not found in the selected branch', 404);
      if (target.movement_type === 'reversal') {
        throw new AppError('A stock reversal cannot reverse another reversal', 409);
      }
      const reversed = await client.query<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM stock_movements WHERE reverses_movement_id = $1
        ) AS exists
      `, [target.id]);
      if (reversed.rows[0]?.exists) throw new AppError('Stock movement is already reversed', 409);
      const current = await ensureBalanceAndLock(client, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        itemId: target.item_id,
        locationId: target.location_id,
      });
      const inverse = target.quantity_delta.startsWith('-')
        ? target.quantity_delta.slice(1)
        : `-${target.quantity_delta}`;
      await assertNonNegativeResult(client, current, inverse);
      await client.query(`
        INSERT INTO stock_movements (
          organization_id, branch_id, item_id, location_id, movement_type,
          quantity_delta, reverses_movement_id, created_by_membership_id,
          reason, idempotency_key, command_fingerprint, occurred_at
        ) VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7, $8, $9, $10, $11)
      `, [
        input.organizationId, input.branchId, target.item_id, target.location_id,
        inverse, target.id, input.actorMembershipId, input.reason,
        input.idempotencyKey, input.commandFingerprint, input.occurredAt,
      ]);
      await client.query(`
        UPDATE stock_balances
        SET quantity = quantity + $5::numeric(18,3), updated_at = NOW()
        WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3 AND location_id = $4
      `, [input.organizationId, input.branchId, target.item_id, target.location_id, inverse]);
      const created = await selectMovementByIdempotency(client, input.organizationId, input.idempotencyKey);
      if (!created) throw new Error('Stock reversal was not available after insertion');
      return projectMovement(created);
    });
  }

  public async listMovements(input: {
    organizationId: string;
    branchId: string;
    itemId: string;
    page: number;
    limit: number;
  }): Promise<{ data: StockMovementProjection[]; total: number }> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const item = await client.query<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM inventory_items WHERE id = $1 AND organization_id = $2
        ) AS exists
      `, [input.itemId, input.organizationId]);
      if (!item.rows[0]?.exists) throw new AppError('Inventory item not found', 404);
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total
        FROM stock_movements
        WHERE organization_id = $1 AND branch_id = $2 AND item_id = $3
      `, [input.organizationId, input.branchId, input.itemId]);
      const rows = await client.query<StockMovementRow>(`
        SELECT ${movementSelect}
        FROM stock_movements m
        ${movementJoins}
        WHERE m.organization_id = $1 AND m.branch_id = $2 AND m.item_id = $3
        ORDER BY m.occurred_at DESC, m.id DESC
        LIMIT $4 OFFSET $5
      `, [
        input.organizationId, input.branchId, input.itemId,
        input.limit, (input.page - 1) * input.limit,
      ]);
      return { data: rows.rows.map(projectMovement), total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async listLowStock(input: {
    organizationId: string;
    branchId: string;
    page: number;
    limit: number;
  }): Promise<{ data: InventoryItemProjection[]; total: number }> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const where = `
        i.organization_id = $1 AND i.status = 'active'
        AND COALESCE(b.quantity, 0::numeric) <= COALESCE(b.reorder_threshold, 0::numeric)
      `;
      const count = await client.query<{ total: string }>(`
        SELECT COUNT(*)::text AS total FROM inventory_items i
        ${itemJoins} WHERE ${where}
      `, [input.organizationId, input.branchId]);
      const rows = await client.query<InventoryItemRow>(`
        SELECT ${itemSelect} FROM inventory_items i
        ${itemJoins} WHERE ${where}
        ORDER BY COALESCE(b.quantity, 0::numeric), LOWER(i.name), i.id
        LIMIT $3 OFFSET $4
      `, [input.organizationId, input.branchId, input.limit, (input.page - 1) * input.limit]);
      return { data: rows.rows.map(projectItem), total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  public async countLowStock(organizationId: string, branchId: string): Promise<number> {
    const result = await this.database.query<{ total: string }>(`
      SELECT COUNT(*)::text AS total
      FROM inventory_items i
      ${itemJoins}
      WHERE i.organization_id = $1 AND i.status = 'active'
        AND COALESCE(b.quantity, 0::numeric) <= COALESCE(b.reorder_threshold, 0::numeric)
    `, [organizationId, branchId]);
    return Number(result.rows[0]?.total ?? 0);
  }
}
