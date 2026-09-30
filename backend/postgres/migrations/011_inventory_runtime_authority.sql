ALTER TABLE operational_runtime_authority
  DROP CONSTRAINT operational_runtime_authority_vertical_check,
  ADD CONSTRAINT operational_runtime_authority_vertical_check
    CHECK (vertical IN (
      'customer_service_appointment_queue',
      'attendance',
      'customer_dues',
      'inventory'
    )),
  DROP CONSTRAINT operational_runtime_authority_activated_by_check,
  ADD CONSTRAINT operational_runtime_authority_activated_by_check
    CHECK (activated_by IN (
      'v2-06b2-cutover',
      'v2-06c-cutover',
      'v2-06d-cutover',
      'v2-06e-cutover'
    ));

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(100),
  barcode VARCHAR(100),
  unit_code VARCHAR(16) NOT NULL CHECK (
    unit_code IN ('unit', 'piece', 'pack', 'box', 'kg', 'g', 'litre', 'ml')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  price_minor BIGINT CHECK (price_minor IS NULL OR price_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  creation_idempotency_key VARCHAR(128),
  creation_command_fingerprint CHAR(64),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  legacy_source_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_items_id_organization_unique UNIQUE (id, organization_id),
  CONSTRAINT inventory_items_name_format CHECK (
    name = BTRIM(name) AND LENGTH(name) BETWEEN 1 AND 200
  ),
  CONSTRAINT inventory_items_sku_format CHECK (
    sku IS NULL OR (sku = BTRIM(sku) AND LENGTH(sku) BETWEEN 1 AND 100)
  ),
  CONSTRAINT inventory_items_barcode_format CHECK (
    barcode IS NULL OR (barcode = BTRIM(barcode) AND LENGTH(barcode) BETWEEN 1 AND 100)
  ),
  CONSTRAINT inventory_items_native_or_import CHECK (
    (
      legacy_mongo_id IS NULL
      AND legacy_source_fingerprint IS NULL
      AND creation_idempotency_key IS NOT NULL
      AND creation_command_fingerprint IS NOT NULL
    )
    OR (
      legacy_mongo_id IS NOT NULL
      AND legacy_source_fingerprint IS NOT NULL
      AND creation_idempotency_key IS NULL
      AND creation_command_fingerprint IS NULL
    )
  ),
  CONSTRAINT inventory_items_creation_idempotency_format CHECK (
    creation_idempotency_key IS NULL OR LENGTH(creation_idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT inventory_items_creation_fingerprint_format CHECK (
    creation_command_fingerprint IS NULL
    OR creation_command_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT inventory_items_legacy_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT inventory_items_legacy_fingerprint_format CHECK (
    legacy_source_fingerprint IS NULL
    OR legacy_source_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX inventory_items_organization_creation_key_unique
  ON inventory_items (organization_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX inventory_items_organization_sku_unique
  ON inventory_items (organization_id, LOWER(sku))
  WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX inventory_items_organization_barcode_unique
  ON inventory_items (organization_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX inventory_items_organization_name_idx
  ON inventory_items (organization_id, LOWER(name), id);

CREATE TABLE stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_locations_id_scope_unique
    UNIQUE (id, organization_id, branch_id),
  CONSTRAINT stock_locations_branch_code_unique UNIQUE (branch_id, code),
  CONSTRAINT stock_locations_code_format CHECK (
    code = BTRIM(code) AND LENGTH(code) BETWEEN 1 AND 64
  ),
  CONSTRAINT stock_locations_name_format CHECK (
    name = BTRIM(name) AND LENGTH(name) BETWEEN 1 AND 200
  ),
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX stock_locations_one_active_default_per_branch
  ON stock_locations (branch_id)
  WHERE is_default = TRUE AND status = 'active';
CREATE INDEX stock_locations_organization_branch_idx
  ON stock_locations (organization_id, branch_id, status);

INSERT INTO stock_locations (
  organization_id, branch_id, code, name, status, is_default, created_at, updated_at
)
SELECT organization_id, id, 'default', 'Main stock', status, TRUE, NOW(), NOW()
FROM branches;

CREATE FUNCTION ekavio_create_default_stock_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO stock_locations (
    organization_id, branch_id, code, name, status, is_default, created_at, updated_at
  ) VALUES (
    NEW.organization_id,
    NEW.id,
    'default',
    'Main stock',
    NEW.status,
    TRUE,
    NEW.created_at,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER branches_create_default_stock_location
AFTER INSERT ON branches
FOR EACH ROW EXECUTE FUNCTION ekavio_create_default_stock_location();

CREATE TABLE stock_balances (
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  item_id UUID NOT NULL,
  location_id UUID NOT NULL,
  quantity NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_threshold NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, location_id),
  CONSTRAINT stock_balances_scope_unique
    UNIQUE (item_id, location_id, organization_id, branch_id),
  FOREIGN KEY (item_id, organization_id)
    REFERENCES inventory_items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id, branch_id)
    REFERENCES stock_locations(id, organization_id, branch_id) ON DELETE RESTRICT
);

CREATE INDEX stock_balances_branch_low_stock_idx
  ON stock_balances (organization_id, branch_id, quantity, reorder_threshold);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  item_id UUID NOT NULL,
  location_id UUID NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'opening',
      'receive',
      'consume',
      'adjustment_increase',
      'adjustment_decrease',
      'reversal'
    )
  ),
  quantity_delta NUMERIC(18,3) NOT NULL CHECK (quantity_delta <> 0),
  source_type VARCHAR(64),
  source_id VARCHAR(128),
  reverses_movement_id UUID,
  created_by_membership_id UUID,
  reason VARCHAR(1000),
  idempotency_key VARCHAR(128),
  command_fingerprint CHAR(64),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_movements_id_scope_unique
    UNIQUE (id, organization_id, branch_id, item_id, location_id),
  CONSTRAINT stock_movements_sign_policy CHECK (
    (movement_type IN ('opening', 'receive', 'adjustment_increase') AND quantity_delta > 0)
    OR (movement_type IN ('consume', 'adjustment_decrease') AND quantity_delta < 0)
    OR movement_type = 'reversal'
  ),
  CONSTRAINT stock_movements_reversal_pair CHECK (
    (movement_type = 'reversal' AND reverses_movement_id IS NOT NULL)
    OR (movement_type <> 'reversal' AND reverses_movement_id IS NULL)
  ),
  CONSTRAINT stock_movements_source_pair CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT stock_movements_reason_policy CHECK (
    movement_type NOT IN ('consume', 'adjustment_increase', 'adjustment_decrease', 'reversal')
    OR (
      reason IS NOT NULL
      AND reason = BTRIM(reason)
      AND LENGTH(reason) BETWEEN 3 AND 1000
    )
  ),
  CONSTRAINT stock_movements_native_or_import CHECK (
    (
      created_by_membership_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND command_fingerprint IS NOT NULL
      AND source_type IS DISTINCT FROM 'legacy_mongo_inventory'
    )
    OR (
      created_by_membership_id IS NULL
      AND idempotency_key IS NULL
      AND command_fingerprint IS NULL
      AND source_type = 'legacy_mongo_inventory'
      AND source_id ~ '^[0-9a-f]{24}$'
      AND movement_type = 'opening'
      AND reverses_movement_id IS NULL
    )
  ),
  CONSTRAINT stock_movements_idempotency_format CHECK (
    idempotency_key IS NULL OR LENGTH(idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT stock_movements_command_fingerprint_format CHECK (
    command_fingerprint IS NULL OR command_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  FOREIGN KEY (item_id, location_id, organization_id, branch_id)
    REFERENCES stock_balances(item_id, location_id, organization_id, branch_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (
    reverses_movement_id, organization_id, branch_id, item_id, location_id
  ) REFERENCES stock_movements(id, organization_id, branch_id, item_id, location_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX stock_movements_organization_idempotency_unique
  ON stock_movements (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_single_reversal_unique
  ON stock_movements (reverses_movement_id)
  WHERE reverses_movement_id IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_legacy_opening_unique
  ON stock_movements (source_type, source_id)
  WHERE source_type = 'legacy_mongo_inventory';
CREATE INDEX stock_movements_branch_item_occurred_idx
  ON stock_movements (organization_id, branch_id, item_id, occurred_at DESC, id DESC);
CREATE INDEX stock_movements_location_occurred_idx
  ON stock_movements (location_id, occurred_at DESC, id DESC);

CREATE FUNCTION ekavio_require_stock_movement_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_status TEXT;
  location_status TEXT;
  target_type TEXT;
  target_delta NUMERIC(18,3);
BEGIN
  SELECT i.status, l.status
    INTO item_status, location_status
  FROM inventory_items i
  JOIN stock_locations l
    ON l.id = NEW.location_id
    AND l.organization_id = NEW.organization_id
    AND l.branch_id = NEW.branch_id
  WHERE i.id = NEW.item_id
    AND i.organization_id = NEW.organization_id;

  IF item_status IS NULL OR location_status IS NULL THEN
    RAISE EXCEPTION 'stock movement item and location must belong to the authorized scope';
  END IF;
  IF location_status <> 'active' THEN
    RAISE EXCEPTION 'stock movement location must be active';
  END IF;
  IF NEW.movement_type <> 'reversal' AND item_status <> 'active' THEN
    RAISE EXCEPTION 'stock movement item must be active';
  END IF;

  IF NEW.created_by_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN membership_branch_assignments a
      ON a.membership_id = m.id
      AND a.organization_id = m.organization_id
      AND a.branch_id = NEW.branch_id
    WHERE m.id = NEW.created_by_membership_id
      AND m.organization_id = NEW.organization_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'stock movement actor must be active and assigned to the stock branch';
  END IF;

  IF NEW.movement_type = 'reversal' THEN
    SELECT movement_type, quantity_delta
      INTO target_type, target_delta
    FROM stock_movements
    WHERE id = NEW.reverses_movement_id
      AND organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND item_id = NEW.item_id
      AND location_id = NEW.location_id;
    IF target_type IS NULL THEN
      RAISE EXCEPTION 'stock reversal target is outside the authorized scope';
    END IF;
    IF target_type = 'reversal' THEN
      RAISE EXCEPTION 'a stock reversal cannot reverse another reversal';
    END IF;
    IF NEW.quantity_delta <> -target_delta THEN
      RAISE EXCEPTION 'stock reversal must use the exact inverse target quantity';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_context_guard
BEFORE INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION ekavio_require_stock_movement_context();

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();

CREATE FUNCTION ekavio_prevent_inventory_unit_change_after_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unit_code <> OLD.unit_code AND EXISTS (
    SELECT 1 FROM stock_movements WHERE item_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'inventory item unit cannot change after stock movement history exists';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_unit_history_guard
BEFORE UPDATE OF unit_code ON inventory_items
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_inventory_unit_change_after_history();
