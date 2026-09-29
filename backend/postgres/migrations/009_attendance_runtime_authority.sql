ALTER TABLE operational_runtime_authority
  DROP CONSTRAINT operational_runtime_authority_vertical_check,
  ADD CONSTRAINT operational_runtime_authority_vertical_check
    CHECK (vertical IN ('customer_service_appointment_queue', 'attendance')),
  DROP CONSTRAINT operational_runtime_authority_activated_by_check,
  ADD CONSTRAINT operational_runtime_authority_activated_by_check
    CHECK (activated_by IN ('v2-06b2-cutover', 'v2-06c-cutover'));

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half_day')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'kiosk', 'import')),
  created_by_membership_id UUID,
  manual_override_by_membership_id UUID,
  manual_override_reason VARCHAR(500),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  idempotency_key VARCHAR(128),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  legacy_source_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_records_id_scope_unique
    UNIQUE (id, organization_id, branch_id),
  CONSTRAINT attendance_records_subject_day_unique
    UNIQUE (organization_id, membership_id, attendance_date),
  CONSTRAINT attendance_records_legacy_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT attendance_records_legacy_fingerprint_format CHECK (
    legacy_source_fingerprint IS NULL OR legacy_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT attendance_records_import_provenance CHECK (
    (
      source = 'import'
      AND legacy_mongo_id IS NOT NULL
      AND legacy_source_fingerprint IS NOT NULL
      AND created_by_membership_id IS NULL
      AND idempotency_key IS NULL
    )
    OR (
      source IN ('manual', 'kiosk')
      AND legacy_mongo_id IS NULL
      AND legacy_source_fingerprint IS NULL
      AND created_by_membership_id IS NOT NULL
    )
  ),
  CONSTRAINT attendance_records_absent_has_no_times CHECK (
    status <> 'absent' OR (check_in_at IS NULL AND check_out_at IS NULL)
  ),
  CONSTRAINT attendance_records_time_order CHECK (
    check_in_at IS NULL OR check_out_at IS NULL OR check_out_at > check_in_at
  ),
  CONSTRAINT attendance_records_manual_override_pair CHECK (
    (
      manual_override_by_membership_id IS NULL
      AND manual_override_reason IS NULL
    )
    OR (
      manual_override_by_membership_id IS NOT NULL
      AND manual_override_reason IS NOT NULL
      AND manual_override_reason = BTRIM(manual_override_reason)
      AND LENGTH(manual_override_reason) BETWEEN 3 AND 500
    )
  ),
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (manual_override_by_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX attendance_records_organization_idempotency_unique
  ON attendance_records (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX attendance_records_branch_date_idx
  ON attendance_records (organization_id, branch_id, attendance_date, membership_id);
CREATE INDEX attendance_records_membership_date_idx
  ON attendance_records (membership_id, attendance_date DESC);

CREATE TABLE attendance_record_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  resulting_version INTEGER NOT NULL CHECK (resulting_version > 1),
  prior_status TEXT NOT NULL CHECK (prior_status IN ('present', 'absent', 'half_day')),
  new_status TEXT NOT NULL CHECK (new_status IN ('present', 'absent', 'half_day')),
  prior_check_in_at TIMESTAMPTZ,
  new_check_in_at TIMESTAMPTZ,
  prior_check_out_at TIMESTAMPTZ,
  new_check_out_at TIMESTAMPTZ,
  actor_membership_id UUID NOT NULL,
  reason VARCHAR(500) NOT NULL CHECK (
    reason = BTRIM(reason) AND LENGTH(reason) BETWEEN 3 AND 500
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_record_changes_version_unique
    UNIQUE (attendance_record_id, resulting_version),
  FOREIGN KEY (attendance_record_id, organization_id, branch_id)
    REFERENCES attendance_records(id, organization_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_membership_id, branch_id, organization_id)
    REFERENCES membership_branch_assignments(membership_id, branch_id, organization_id)
    ON DELETE RESTRICT
);
CREATE INDEX attendance_record_changes_record_time_idx
  ON attendance_record_changes (attendance_record_id, occurred_at, resulting_version);

CREATE FUNCTION ekavio_require_attendance_insert_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  branch_timezone TEXT;
BEGIN
  SELECT timezone INTO branch_timezone
  FROM branches
  WHERE id = NEW.branch_id
    AND organization_id = NEW.organization_id
    AND status = 'active'
    AND timezone IS NOT NULL
    AND ekavio_is_valid_iana_timezone(timezone);

  IF branch_timezone IS NULL THEN
    RAISE EXCEPTION 'attendance requires an active branch with a reviewed IANA timezone';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN membership_branch_assignments a
      ON a.membership_id = m.id
      AND a.organization_id = m.organization_id
      AND a.branch_id = NEW.branch_id
    WHERE m.id = NEW.membership_id
      AND m.organization_id = NEW.organization_id
      AND (NEW.source = 'import' OR m.status = 'active')
  ) THEN
    RAISE EXCEPTION 'attendance subject must belong to and be assigned to the selected branch';
  END IF;

  IF NEW.source IN ('manual', 'kiosk') AND NOT EXISTS (
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
    RAISE EXCEPTION 'attendance actor must be active and assigned to the selected branch';
  END IF;

  IF NEW.check_in_at IS NOT NULL
    AND (NEW.check_in_at AT TIME ZONE branch_timezone)::DATE <> NEW.attendance_date THEN
    RAISE EXCEPTION 'attendance check-in must belong to the branch business date';
  END IF;
  IF NEW.check_out_at IS NOT NULL
    AND (NEW.check_out_at AT TIME ZONE branch_timezone)::DATE <> NEW.attendance_date THEN
    RAISE EXCEPTION 'attendance check-out must belong to the branch business date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_records_insert_context_guard
BEFORE INSERT ON attendance_records
FOR EACH ROW EXECUTE FUNCTION ekavio_require_attendance_insert_context();

CREATE FUNCTION ekavio_protect_attendance_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  branch_timezone TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'attendance records cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
    OR NEW.attendance_date IS DISTINCT FROM OLD.attendance_date
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.legacy_mongo_id IS DISTINCT FROM OLD.legacy_mongo_id
    OR NEW.legacy_source_fingerprint IS DISTINCT FROM OLD.legacy_source_fingerprint
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'attendance identity and provenance are immutable';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.check_in_at IS NOT DISTINCT FROM OLD.check_in_at
    AND NEW.check_out_at IS NOT DISTINCT FROM OLD.check_out_at THEN
    RAISE EXCEPTION 'attendance correction must change a factual field';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'attendance version must increment exactly once';
  END IF;
  IF NEW.manual_override_by_membership_id IS NULL OR NEW.manual_override_reason IS NULL THEN
    RAISE EXCEPTION 'attendance correction requires actor and reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN membership_branch_assignments a
      ON a.membership_id = m.id
      AND a.organization_id = m.organization_id
      AND a.branch_id = NEW.branch_id
    WHERE m.id = NEW.manual_override_by_membership_id
      AND m.organization_id = NEW.organization_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'attendance correction actor must be active and assigned to the selected branch';
  END IF;

  SELECT timezone INTO branch_timezone
  FROM branches
  WHERE id = NEW.branch_id AND organization_id = NEW.organization_id;
  IF branch_timezone IS NULL OR NOT ekavio_is_valid_iana_timezone(branch_timezone) THEN
    RAISE EXCEPTION 'attendance branch timezone is invalid';
  END IF;
  IF NEW.check_in_at IS NOT NULL
    AND (NEW.check_in_at AT TIME ZONE branch_timezone)::DATE <> NEW.attendance_date THEN
    RAISE EXCEPTION 'attendance check-in must belong to the branch business date';
  END IF;
  IF NEW.check_out_at IS NOT NULL
    AND (NEW.check_out_at AT TIME ZONE branch_timezone)::DATE <> NEW.attendance_date THEN
    RAISE EXCEPTION 'attendance check-out must belong to the branch business date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_records_projection_guard
BEFORE UPDATE OR DELETE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION ekavio_protect_attendance_record();

CREATE FUNCTION ekavio_append_attendance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO attendance_record_changes (
    attendance_record_id, organization_id, branch_id, resulting_version,
    prior_status, new_status, prior_check_in_at, new_check_in_at,
    prior_check_out_at, new_check_out_at, actor_membership_id, reason, occurred_at
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.branch_id, NEW.version,
    OLD.status, NEW.status, OLD.check_in_at, NEW.check_in_at,
    OLD.check_out_at, NEW.check_out_at,
    NEW.manual_override_by_membership_id, NEW.manual_override_reason, NEW.updated_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_records_append_change
AFTER UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION ekavio_append_attendance_change();

CREATE TRIGGER attendance_record_changes_append_only
BEFORE UPDATE OR DELETE ON attendance_record_changes
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
