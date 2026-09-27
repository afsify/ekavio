CREATE TABLE commercial_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_request_id UUID NOT NULL UNIQUE
    REFERENCES commercial_access_requests(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  selected_plan_key TEXT REFERENCES plans(key) ON DELETE RESTRICT,
  selected_add_on_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  list_subtotal_minor BIGINT NOT NULL CHECK (list_subtotal_minor >= 0),
  list_pricing_snapshot JSONB NOT NULL,
  agreed_total_minor BIGINT NOT NULL CHECK (agreed_total_minor >= 0),
  adjustment_reason VARCHAR(500),
  starts_at TIMESTAMPTZ NOT NULL,
  current_period_ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('awaiting_payment', 'paid', 'onboarding_pending', 'activated', 'cancelled')
  ),
  billing_legal_name VARCHAR(160) NOT NULL,
  billing_contact_name VARCHAR(120) NOT NULL,
  billing_phone VARCHAR(16) NOT NULL,
  billing_email VARCHAR(254),
  billing_address_line_1 VARCHAR(200),
  billing_address_line_2 VARCHAR(200),
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_postal_code VARCHAR(20),
  billing_gstin VARCHAR(15),
  finalized_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_agreements_selection CHECK (
    selected_plan_key IS NOT NULL OR cardinality(selected_add_on_keys) > 0
  ),
  CONSTRAINT commercial_agreements_selection_limit CHECK (
    cardinality(selected_add_on_keys) <= 8
  ),
  CONSTRAINT commercial_agreements_snapshot_object CHECK (
    jsonb_typeof(list_pricing_snapshot) = 'object'
  ),
  CONSTRAINT commercial_agreements_period_order CHECK (
    current_period_ends_at > starts_at
  ),
  CONSTRAINT commercial_agreements_adjustment_reason CHECK (
    (agreed_total_minor > 0 AND agreed_total_minor = list_subtotal_minor)
    OR (
      adjustment_reason IS NOT NULL
      AND adjustment_reason = BTRIM(adjustment_reason)
      AND adjustment_reason <> ''
    )
  ),
  CONSTRAINT commercial_agreements_billing_names CHECK (
    billing_legal_name = BTRIM(billing_legal_name) AND billing_legal_name <> ''
    AND billing_contact_name = BTRIM(billing_contact_name) AND billing_contact_name <> ''
  ),
  CONSTRAINT commercial_agreements_phone_format CHECK (
    billing_phone ~ '^\+[1-9][0-9]{5,14}$'
  ),
  CONSTRAINT commercial_agreements_gstin_format CHECK (
    billing_gstin IS NULL
    OR billing_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  ),
  CONSTRAINT commercial_agreements_activation_link CHECK (
    (status = 'activated' AND organization_id IS NOT NULL AND activated_at IS NOT NULL)
    OR (status <> 'activated' AND organization_id IS NULL AND activated_at IS NULL)
  )
);
CREATE INDEX commercial_agreements_status_time_idx
  ON commercial_agreements (status, created_at DESC);
CREATE INDEX commercial_agreements_organization_time_idx
  ON commercial_agreements (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE TABLE manual_commercial_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
  method TEXT NOT NULL CHECK (method IN ('upi', 'bank_transfer', 'cash', 'other')),
  reference_text VARCHAR(160),
  paid_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'void')),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ,
  void_reason VARCHAR(500),
  CONSTRAINT manual_commercial_payments_idempotency_unique
    UNIQUE (agreement_id, idempotency_key),
  CONSTRAINT manual_commercial_payments_void_metadata CHECK (
    (status = 'confirmed' AND voided_by_user_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (
      status = 'void'
      AND voided_by_user_id IS NOT NULL
      AND voided_at IS NOT NULL
      AND void_reason IS NOT NULL
      AND void_reason = BTRIM(void_reason)
      AND void_reason <> ''
    )
  )
);
CREATE INDEX manual_commercial_payments_agreement_time_idx
  ON manual_commercial_payments (agreement_id, created_at DESC);

CREATE FUNCTION ekavio_protect_manual_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'manual payment history is append-only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.reference_text IS DISTINCT FROM OLD.reference_text
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'confirmed manual payment fields are immutable';
  END IF;
  IF OLD.status <> 'confirmed' OR NEW.status <> 'void' THEN
    RAISE EXCEPTION 'manual payment may only transition from confirmed to void';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_commercial_payments_protected
BEFORE UPDATE OR DELETE ON manual_commercial_payments
FOR EACH ROW EXECUTE FUNCTION ekavio_protect_manual_payment();

CREATE TABLE commercial_onboarding_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE RESTRICT,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(500),
  consumed_at TIMESTAMPTZ,
  consumed_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  consumed_organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT commercial_onboarding_invitations_expiry CHECK (expires_at > created_at),
  CONSTRAINT commercial_onboarding_invitations_revocation CHECK (
    (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revoked_by_user_id IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND revocation_reason = BTRIM(revocation_reason)
      AND revocation_reason <> ''
    )
  ),
  CONSTRAINT commercial_onboarding_invitations_consumption CHECK (
    (consumed_at IS NULL AND consumed_user_id IS NULL AND consumed_organization_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_user_id IS NOT NULL AND consumed_organization_id IS NOT NULL)
  ),
  CONSTRAINT commercial_onboarding_invitations_terminal_exclusive CHECK (
    revoked_at IS NULL OR consumed_at IS NULL
  )
);
CREATE UNIQUE INDEX commercial_onboarding_invitations_one_active
  ON commercial_onboarding_invitations (agreement_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;
CREATE INDEX commercial_onboarding_invitations_agreement_time_idx
  ON commercial_onboarding_invitations (agreement_id, created_at DESC);

CREATE TABLE organization_billing_profiles (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  agreement_id UUID NOT NULL UNIQUE REFERENCES commercial_agreements(id) ON DELETE RESTRICT,
  legal_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  email VARCHAR(254),
  address_line_1 VARCHAR(200),
  address_line_2 VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  gstin VARCHAR(15),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_billing_profiles_names CHECK (
    legal_name = BTRIM(legal_name) AND legal_name <> ''
    AND contact_name = BTRIM(contact_name) AND contact_name <> ''
  ),
  CONSTRAINT organization_billing_profiles_phone_format CHECK (
    phone ~ '^\+[1-9][0-9]{5,14}$'
  ),
  CONSTRAINT organization_billing_profiles_gstin_format CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  )
);

CREATE TABLE commercial_activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'agreement_finalized',
    'payment_recorded',
    'payment_voided',
    'invitation_created',
    'invitation_revoked',
    'invitation_replaced',
    'onboarding_completed',
    'organization_provisioned',
    'subscription_activated'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_activation_events_details_object CHECK (
    jsonb_typeof(details) = 'object'
  )
);
CREATE INDEX commercial_activation_events_agreement_time_idx
  ON commercial_activation_events (agreement_id, occurred_at DESC);

CREATE TRIGGER commercial_activation_events_append_only
BEFORE UPDATE OR DELETE ON commercial_activation_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
