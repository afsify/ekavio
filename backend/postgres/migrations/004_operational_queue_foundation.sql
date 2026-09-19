CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION ekavio_is_valid_iana_timezone(value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT value IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = value)
$$;

ALTER TABLE branches
  ADD COLUMN timezone TEXT,
  ADD CONSTRAINT branches_timezone_valid CHECK (
    timezone IS NULL OR ekavio_is_valid_iana_timezone(timezone)
  );

ALTER TABLE membership_branch_assignments
  ADD CONSTRAINT membership_branch_assignments_identity_unique
  UNIQUE (membership_id, branch_id, organization_id);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = BTRIM(name) AND name <> ''),
  normalized_phone TEXT,
  display_phone TEXT,
  home_branch_id UUID,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged')),
  merged_into_customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_phone_format CHECK (
    normalized_phone IS NULL OR normalized_phone ~ '^\+[1-9][0-9]{5,14}$'
  ),
  CONSTRAINT customers_display_phone_pair CHECK (
    normalized_phone IS NOT NULL OR display_phone IS NULL
  ),
  CONSTRAINT customers_merge_state CHECK (
    (status = 'merged' AND merged_into_customer_id IS NOT NULL)
    OR (status <> 'merged' AND merged_into_customer_id IS NULL)
  ),
  CONSTRAINT customers_not_self_merged CHECK (merged_into_customer_id IS DISTINCT FROM id),
  CONSTRAINT customers_id_organization_unique UNIQUE (id, organization_id),
  FOREIGN KEY (home_branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (merged_into_customer_id, organization_id)
    REFERENCES customers(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX customers_organization_phone_idx
  ON customers (organization_id, normalized_phone);
CREATE INDEX customers_home_branch_idx ON customers (home_branch_id);

CREATE TABLE customer_source_links (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('queue', 'ledger')),
  legacy_document_id VARCHAR(24) NOT NULL,
  organization_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_kind, legacy_document_id),
  CONSTRAINT customer_source_links_legacy_id_format CHECK (
    legacy_document_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT customer_source_links_fingerprint_format CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX customer_source_links_customer_idx ON customer_source_links (customer_id);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = BTRIM(name) AND name <> ''),
  normalized_name TEXT NOT NULL CHECK (normalized_name = BTRIM(normalized_name) AND normalized_name <> ''),
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  price_minor BIGINT CHECK (price_minor >= 0),
  currency CHAR(3) CHECK (currency ~ '^[A-Z]{3}$'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT services_price_currency_pair CHECK (
    (price_minor IS NULL AND currency IS NULL)
    OR (price_minor IS NOT NULL AND currency IS NOT NULL)
  ),
  CONSTRAINT services_organization_name_unique UNIQUE (organization_id, normalized_name),
  CONSTRAINT services_id_organization_unique UNIQUE (id, organization_id)
);

CREATE TABLE service_source_links (
  legacy_queue_document_id VARCHAR(24) PRIMARY KEY,
  organization_id UUID NOT NULL,
  service_id UUID NOT NULL,
  source_label TEXT NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_source_links_legacy_id_format CHECK (
    legacy_queue_document_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT service_source_links_fingerprint_format CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  FOREIGN KEY (service_id, organization_id)
    REFERENCES services(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX service_source_links_service_idx ON service_source_links (service_id);

CREATE TABLE service_branch_availability (
  service_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, branch_id),
  CONSTRAINT service_branch_availability_identity_unique
    UNIQUE (service_id, branch_id, organization_id),
  FOREIGN KEY (service_id, organization_id)
    REFERENCES services(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX service_branch_availability_branch_idx
  ON service_branch_availability (branch_id, active);

CREATE TABLE provider_service_assignments (
  membership_id UUID NOT NULL,
  service_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (membership_id, service_id, branch_id),
  CONSTRAINT provider_service_assignments_identity_unique
    UNIQUE (membership_id, service_id, branch_id, organization_id),
  FOREIGN KEY (membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (service_id, branch_id, organization_id)
    REFERENCES service_branch_availability(service_id, branch_id, organization_id)
    ON DELETE RESTRICT
);
CREATE INDEX provider_service_assignments_service_branch_idx
  ON provider_service_assignments (service_id, branch_id, active);

CREATE FUNCTION ekavio_require_active_provider_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active AND NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN branches b ON b.id = NEW.branch_id AND b.organization_id = NEW.organization_id
    JOIN services s ON s.id = NEW.service_id AND s.organization_id = NEW.organization_id
    JOIN service_branch_availability a
      ON a.service_id = NEW.service_id
      AND a.branch_id = NEW.branch_id
      AND a.organization_id = NEW.organization_id
    WHERE m.id = NEW.membership_id
      AND m.organization_id = NEW.organization_id
      AND m.status = 'active'
      AND b.status = 'active'
      AND s.active
      AND a.active
  ) THEN
    RAISE EXCEPTION 'active provider assignment requires active membership, branch, service, and availability';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_service_assignments_active_guard
BEFORE INSERT OR UPDATE OF active, membership_id, service_id, branch_id, organization_id
ON provider_service_assignments
FOR EACH ROW EXECUTE FUNCTION ekavio_require_active_provider_assignment();

CREATE FUNCTION ekavio_deactivate_revoked_provider_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE provider_service_assignments
    SET active = FALSE, updated_at = NOW()
    WHERE membership_id = NEW.id AND organization_id = NEW.organization_id AND active;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_provider_assignment_deactivation
AFTER UPDATE OF status ON memberships
FOR EACH ROW EXECUTE FUNCTION ekavio_deactivate_revoked_provider_assignments();

CREATE FUNCTION ekavio_require_operational_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM branches b
    JOIN customers c
      ON c.id = NEW.customer_id AND c.organization_id = NEW.organization_id
    JOIN services s
      ON s.id = NEW.service_id AND s.organization_id = NEW.organization_id
    JOIN service_branch_availability a
      ON a.service_id = NEW.service_id
      AND a.branch_id = NEW.branch_id
      AND a.organization_id = NEW.organization_id
    WHERE b.id = NEW.branch_id
      AND b.organization_id = NEW.organization_id
      AND b.status = 'active'
      AND b.timezone IS NOT NULL
      AND ekavio_is_valid_iana_timezone(b.timezone)
      AND c.status = 'active'
      AND s.active
      AND a.active
  ) THEN
    RAISE EXCEPTION 'operational write requires an active branch/timezone, customer, service, and availability';
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
    RAISE EXCEPTION 'operational write actor must be active and assigned to the branch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION ekavio_require_operational_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = NEW.branch_id
      AND b.organization_id = NEW.organization_id
      AND b.status = 'active'
      AND b.timezone IS NOT NULL
      AND ekavio_is_valid_iana_timezone(b.timezone)
  ) THEN
    RAISE EXCEPTION 'queue session requires an active branch with a reviewed IANA timezone';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  service_id UUID NOT NULL,
  provider_membership_id UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key TEXT,
  created_by_membership_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at),
  CONSTRAINT appointments_idempotency_key_format CHECK (
    idempotency_key IS NULL OR LENGTH(idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT appointments_id_organization_unique UNIQUE (id, organization_id),
  CONSTRAINT appointments_identity_unique
    UNIQUE (id, organization_id, branch_id, customer_id, service_id),
  FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, branch_id, organization_id)
    REFERENCES service_branch_availability(service_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (provider_membership_id, service_id, branch_id, organization_id)
    REFERENCES provider_service_assignments(membership_id, service_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT appointments_provider_overlap_exclude
    EXCLUDE USING gist (
      provider_membership_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (
      provider_membership_id IS NOT NULL
      AND status IN ('scheduled', 'confirmed', 'checked_in')
    )
);
CREATE UNIQUE INDEX appointments_organization_idempotency_unique
  ON appointments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX appointments_branch_start_idx ON appointments (branch_id, starts_at);
CREATE INDEX appointments_customer_start_idx ON appointments (customer_id, starts_at);

CREATE FUNCTION ekavio_require_current_operational_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM provider_service_assignments p
    JOIN memberships m
      ON m.id = p.membership_id AND m.organization_id = p.organization_id
    WHERE p.membership_id = NEW.provider_membership_id
      AND p.service_id = NEW.service_id
      AND p.branch_id = NEW.branch_id
      AND p.organization_id = NEW.organization_id
      AND p.active
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'assigned provider must have a current active membership and service assignment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_current_provider_guard
BEFORE INSERT OR UPDATE OF provider_membership_id, service_id, branch_id, organization_id
ON appointments
FOR EACH ROW EXECUTE FUNCTION ekavio_require_current_operational_provider();

CREATE TRIGGER appointments_operational_context_guard
BEFORE INSERT OR UPDATE OF customer_id, service_id, branch_id, organization_id, created_by_membership_id
ON appointments
FOR EACH ROW EXECUTE FUNCTION ekavio_require_operational_context();

CREATE TABLE appointment_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  appointment_version INTEGER NOT NULL CHECK (appointment_version > 0),
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')
  ),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
  actor_membership_id UUID NOT NULL,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id, appointment_version),
  FOREIGN KEY (appointment_id, organization_id)
    REFERENCES appointments(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES memberships(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX appointment_status_events_appointment_time_idx
  ON appointment_status_events (appointment_id, occurred_at);

CREATE FUNCTION ekavio_require_appointment_event_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM appointments a
    JOIN memberships m
      ON m.id = NEW.actor_membership_id AND m.organization_id = NEW.organization_id
    JOIN membership_branch_assignments b
      ON b.membership_id = m.id
      AND b.organization_id = m.organization_id
      AND b.branch_id = a.branch_id
    WHERE a.id = NEW.appointment_id
      AND a.organization_id = NEW.organization_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'appointment event actor must be active and assigned to the appointment branch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_status_events_actor_guard
BEFORE INSERT ON appointment_status_events
FOR EACH ROW EXECUTE FUNCTION ekavio_require_appointment_event_actor();

CREATE TABLE queue_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  local_business_date DATE NOT NULL,
  lane_key TEXT NOT NULL DEFAULT 'default'
    CHECK (lane_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  next_token_number BIGINT NOT NULL DEFAULT 1 CHECK (next_token_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT queue_sessions_close_state CHECK (
    (status = 'open' AND closed_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL)
  ),
  CONSTRAINT queue_sessions_scope_unique
    UNIQUE (organization_id, branch_id, local_business_date, lane_key),
  CONSTRAINT queue_sessions_identity_unique UNIQUE (id, organization_id, branch_id),
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX queue_sessions_branch_date_idx
  ON queue_sessions (branch_id, local_business_date DESC);

CREATE TRIGGER queue_sessions_operational_branch_guard
BEFORE INSERT OR UPDATE OF branch_id, organization_id
ON queue_sessions
FOR EACH ROW EXECUTE FUNCTION ekavio_require_operational_branch();

CREATE TABLE queue_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  queue_session_id UUID NOT NULL,
  token_number BIGINT NOT NULL CHECK (token_number > 0),
  customer_id UUID NOT NULL,
  service_id UUID NOT NULL,
  appointment_id UUID,
  provider_membership_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'serving', 'completed', 'cancelled')),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  idempotency_key TEXT,
  created_by_membership_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_tokens_legacy_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT queue_tokens_creator_required CHECK (
    legacy_mongo_id IS NOT NULL OR created_by_membership_id IS NOT NULL
  ),
  CONSTRAINT queue_tokens_idempotency_key_format CHECK (
    idempotency_key IS NULL OR LENGTH(idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT queue_tokens_session_number_unique UNIQUE (queue_session_id, token_number),
  CONSTRAINT queue_tokens_id_organization_unique UNIQUE (id, organization_id),
  FOREIGN KEY (queue_session_id, organization_id, branch_id)
    REFERENCES queue_sessions(id, organization_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, branch_id, organization_id)
    REFERENCES service_branch_availability(service_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id, organization_id, branch_id, customer_id, service_id)
    REFERENCES appointments(id, organization_id, branch_id, customer_id, service_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (provider_membership_id, service_id, branch_id, organization_id)
    REFERENCES provider_service_assignments(membership_id, service_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT
);
CREATE UNIQUE INDEX queue_tokens_organization_idempotency_unique
  ON queue_tokens (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX queue_tokens_appointment_unique
  ON queue_tokens (appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX queue_tokens_branch_status_idx ON queue_tokens (branch_id, status, created_at);

CREATE TRIGGER queue_tokens_current_provider_guard
BEFORE INSERT OR UPDATE OF provider_membership_id, service_id, branch_id, organization_id
ON queue_tokens
FOR EACH ROW EXECUTE FUNCTION ekavio_require_current_operational_provider();

CREATE TRIGGER queue_tokens_operational_context_guard
BEFORE INSERT OR UPDATE OF customer_id, service_id, branch_id, organization_id, created_by_membership_id
ON queue_tokens
FOR EACH ROW EXECUTE FUNCTION ekavio_require_operational_context();

CREATE TABLE queue_token_source_links (
  legacy_queue_document_id VARCHAR(24) PRIMARY KEY,
  queue_token_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_token_source_links_legacy_id_format CHECK (
    legacy_queue_document_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT queue_token_source_links_fingerprint_format CHECK (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  FOREIGN KEY (queue_token_id, organization_id)
    REFERENCES queue_tokens(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE queue_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_token_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  queue_token_version INTEGER NOT NULL CHECK (queue_token_version > 0),
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('waiting', 'serving', 'completed', 'cancelled')
  ),
  to_status TEXT NOT NULL CHECK (to_status IN ('waiting', 'serving', 'completed', 'cancelled')),
  actor_membership_id UUID,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'migration', 'system')),
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_status_events_actor_policy CHECK (
    source <> 'user' OR actor_membership_id IS NOT NULL
  ),
  UNIQUE (queue_token_id, queue_token_version),
  FOREIGN KEY (queue_token_id, organization_id)
    REFERENCES queue_tokens(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, organization_id)
    REFERENCES memberships(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX queue_status_events_token_time_idx
  ON queue_status_events (queue_token_id, occurred_at);

CREATE FUNCTION ekavio_require_queue_event_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source = 'user' AND NOT EXISTS (
    SELECT 1
    FROM queue_tokens t
    JOIN memberships m
      ON m.id = NEW.actor_membership_id AND m.organization_id = NEW.organization_id
    JOIN membership_branch_assignments b
      ON b.membership_id = m.id
      AND b.organization_id = m.organization_id
      AND b.branch_id = t.branch_id
    WHERE t.id = NEW.queue_token_id
      AND t.organization_id = NEW.organization_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'queue event actor must be active and assigned to the token branch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_status_events_actor_guard
BEFORE INSERT ON queue_status_events
FOR EACH ROW EXECUTE FUNCTION ekavio_require_queue_event_actor();

CREATE FUNCTION ekavio_prevent_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER appointment_status_events_append_only
BEFORE UPDATE OR DELETE ON appointment_status_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();

CREATE TRIGGER queue_status_events_append_only
BEFORE UPDATE OR DELETE ON queue_status_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
