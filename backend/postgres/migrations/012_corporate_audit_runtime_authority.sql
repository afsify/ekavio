ALTER TABLE audit_events
  ADD COLUMN legacy_mongo_id VARCHAR(24),
  ADD COLUMN ip_address VARCHAR(128),
  ADD CONSTRAINT audit_events_legacy_mongo_id_unique UNIQUE (legacy_mongo_id),
  ADD CONSTRAINT audit_events_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  ADD CONSTRAINT audit_events_action_bounded CHECK (
    length(action) BETWEEN 1 AND 120
  ) NOT VALID,
  ADD CONSTRAINT audit_events_action_allowlist CHECK (
    action IN (
      'membership.created',
      'membership.revoked',
      'corporate.parent.created',
      'corporate.child.linked',
      'commercial.subscription.updated',
      'commercial.entitlement.updated',
      'customer.created',
      'customer.updated',
      'service.created',
      'service.updated',
      'service.provider.updated',
      'appointment.created',
      'appointment.status_changed',
      'appointment.checked_in',
      'queue.token.created',
      'queue.token.status_changed',
      'customer_dues.entry_created',
      'customer_dues.entry_reversed',
      'inventory.item_created',
      'inventory.item_updated',
      'inventory.stock_changed',
      'inventory.movement_reversed'
    )
  ) NOT VALID,
  ADD CONSTRAINT audit_events_ip_address_bounded CHECK (
    ip_address IS NULL OR length(ip_address) <= 128
  ) NOT VALID;

CREATE INDEX audit_events_action_occurred_idx
  ON audit_events (action, occurred_at DESC);
CREATE INDEX audit_events_actor_occurred_idx
  ON audit_events (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE FUNCTION ekavio_audit_details_are_safe(value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL THEN TRUE
    WHEN jsonb_typeof(value) <> 'object' THEN FALSE
    WHEN octet_length(value::text) > 8192 THEN FALSE
    WHEN (SELECT COUNT(*) FROM jsonb_each(value)) > 32 THEN FALSE
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_each(value) AS entry(key, item)
      WHERE length(entry.key) > 64
        OR lower(entry.key) ~ '(password|token|authorization|cookie|secret|credential|header)'
        OR jsonb_typeof(entry.item) NOT IN ('string', 'number', 'boolean', 'null')
        OR (
          jsonb_typeof(entry.item) = 'string'
          AND length(entry.item #>> '{}') > 512
        )
    )
  END
$$;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_safe_details CHECK (
    ekavio_audit_details_are_safe(details)
  ) NOT VALID;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();

-- Unsafe legacy Mixed payloads are never copied here. This table records only
-- deterministic hashes and a bounded reason so every source row is accounted
-- for without persisting raw legacy details.
CREATE TABLE legacy_audit_migration_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref_hash CHAR(64) NOT NULL UNIQUE,
  source_fingerprint CHAR(64) NOT NULL,
  reason_code TEXT NOT NULL CHECK (
    reason_code IN (
      'invalid_legacy_identifier',
      'missing_organization_mapping',
      'missing_actor_mapping',
      'unknown_action',
      'unsafe_details',
      'invalid_ip_address',
      'invalid_timestamp',
      'duplicate_source_identifier'
    )
  ),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT legacy_audit_source_ref_hash_format CHECK (
    source_ref_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT legacy_audit_source_fingerprint_format CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX legacy_audit_dispositions_reason_idx
  ON legacy_audit_migration_dispositions (reason_code);

CREATE TRIGGER legacy_audit_dispositions_append_only
BEFORE UPDATE OR DELETE ON legacy_audit_migration_dispositions
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();

-- Rows are written only by the explicit V2-06F activation command after
-- migration, reconciliation, and preflight have all succeeded.
CREATE TABLE final_runtime_authority (
  domain TEXT PRIMARY KEY CHECK (domain IN ('corporate', 'security_audit')),
  authority TEXT NOT NULL CHECK (authority = 'postgresql'),
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by TEXT NOT NULL CHECK (activated_by = 'v2-06f-cutover')
);
