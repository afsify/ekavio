ALTER TABLE operational_runtime_authority
  DROP CONSTRAINT operational_runtime_authority_vertical_check,
  ADD CONSTRAINT operational_runtime_authority_vertical_check
    CHECK (vertical IN ('customer_service_appointment_queue', 'attendance', 'customer_dues')),
  DROP CONSTRAINT operational_runtime_authority_activated_by_check,
  ADD CONSTRAINT operational_runtime_authority_activated_by_check
    CHECK (activated_by IN ('v2-06b2-cutover', 'v2-06c-cutover', 'v2-06d-cutover'));

CREATE TABLE customer_due_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN ('charge', 'payment', 'adjustment_increase', 'adjustment_decrease', 'reversal')
  ),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  due_date DATE,
  description VARCHAR(1000),
  source_type VARCHAR(64),
  source_id VARCHAR(128),
  reverses_entry_id UUID,
  created_by_membership_id UUID,
  idempotency_key VARCHAR(128),
  command_fingerprint CHAR(64),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  legacy_source_fingerprint CHAR(64),
  CONSTRAINT customer_due_entries_id_scope_unique
    UNIQUE (id, organization_id, branch_id, customer_id, currency),
  CONSTRAINT customer_due_entries_reversal_pair CHECK (
    (entry_type = 'reversal' AND reverses_entry_id IS NOT NULL)
    OR (entry_type <> 'reversal' AND reverses_entry_id IS NULL)
  ),
  CONSTRAINT customer_due_entries_source_pair CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT customer_due_entries_reason_policy CHECK (
    entry_type NOT IN ('adjustment_increase', 'adjustment_decrease', 'reversal')
    OR (
      description IS NOT NULL
      AND description = BTRIM(description)
      AND LENGTH(description) BETWEEN 3 AND 1000
    )
  ),
  CONSTRAINT customer_due_entries_native_or_import CHECK (
    (
      legacy_mongo_id IS NULL
      AND legacy_source_fingerprint IS NULL
      AND created_by_membership_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND command_fingerprint IS NOT NULL
    )
    OR (
      legacy_mongo_id IS NOT NULL
      AND legacy_source_fingerprint IS NOT NULL
      AND created_by_membership_id IS NULL
      AND idempotency_key IS NULL
      AND command_fingerprint IS NULL
      AND source_type = 'legacy_mongo'
      AND source_id = legacy_mongo_id
      AND entry_type IN ('charge', 'payment')
      AND reverses_entry_id IS NULL
    )
  ),
  CONSTRAINT customer_due_entries_idempotency_format CHECK (
    idempotency_key IS NULL OR LENGTH(idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT customer_due_entries_command_fingerprint_format CHECK (
    command_fingerprint IS NULL OR command_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT customer_due_entries_legacy_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT customer_due_entries_legacy_fingerprint_format CHECK (
    legacy_source_fingerprint IS NULL OR legacy_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (reverses_entry_id, organization_id, branch_id, customer_id, currency)
    REFERENCES customer_due_entries(id, organization_id, branch_id, customer_id, currency)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX customer_due_entries_organization_idempotency_unique
  ON customer_due_entries (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX customer_due_entries_single_reversal_unique
  ON customer_due_entries (reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX customer_due_entries_branch_occurred_idx
  ON customer_due_entries (organization_id, branch_id, occurred_at DESC, id DESC);
CREATE INDEX customer_due_entries_customer_occurred_idx
  ON customer_due_entries (organization_id, customer_id, occurred_at DESC, id DESC);

CREATE FUNCTION ekavio_require_customer_due_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_type TEXT;
  target_amount BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM branches b
    JOIN customers c
      ON c.id = NEW.customer_id AND c.organization_id = NEW.organization_id
    WHERE b.id = NEW.branch_id
      AND b.organization_id = NEW.organization_id
      AND b.status = 'active'
      AND c.status <> 'merged'
  ) THEN
    RAISE EXCEPTION 'customer due entry requires an active branch and canonical customer in the organization';
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
    RAISE EXCEPTION 'customer due actor must be active and assigned to the originating branch';
  END IF;

  IF NEW.entry_type = 'reversal' THEN
    SELECT entry_type, amount_minor
      INTO target_type, target_amount
    FROM customer_due_entries
    WHERE id = NEW.reverses_entry_id
      AND organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND customer_id = NEW.customer_id
      AND currency = NEW.currency;
    IF target_type IS NULL THEN
      RAISE EXCEPTION 'customer due reversal target is outside the authorized scope';
    END IF;
    IF target_type = 'reversal' THEN
      RAISE EXCEPTION 'a customer due reversal cannot reverse another reversal';
    END IF;
    IF NEW.amount_minor <> target_amount THEN
      RAISE EXCEPTION 'customer due reversal must use the exact target magnitude';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_due_entries_context_guard
BEFORE INSERT ON customer_due_entries
FOR EACH ROW EXECUTE FUNCTION ekavio_require_customer_due_context();

CREATE TRIGGER customer_due_entries_append_only
BEFORE UPDATE OR DELETE ON customer_due_entries
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
