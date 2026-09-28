ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_organization_id_id_unique
  UNIQUE (organization_id, id);

CREATE TABLE commercial_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL,
  renewal_kind TEXT NOT NULL CHECK (renewal_kind IN ('continuous', 'reactivation')),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  selected_plan_key TEXT REFERENCES plans(key) ON DELETE RESTRICT,
  selected_add_on_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  package_snapshot JSONB NOT NULL,
  list_subtotal_minor BIGINT CHECK (list_subtotal_minor >= 0),
  list_pricing_snapshot JSONB NOT NULL,
  agreed_total_minor BIGINT NOT NULL CHECK (agreed_total_minor >= 0),
  adjustment_reason VARCHAR(500),
  prior_period_starts_at TIMESTAMPTZ NOT NULL,
  prior_period_ends_at TIMESTAMPTZ NOT NULL,
  renewal_starts_at TIMESTAMPTZ NOT NULL,
  renewal_ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment', 'paid', 'applied', 'cancelled')),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  finalized_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_renewals_subscription_owner
    FOREIGN KEY (organization_id, subscription_id)
    REFERENCES subscriptions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT commercial_renewals_selection CHECK (
    selected_plan_key IS NOT NULL OR cardinality(selected_add_on_keys) > 0
  ),
  CONSTRAINT commercial_renewals_selection_limit CHECK (
    cardinality(selected_add_on_keys) <= 8
  ),
  CONSTRAINT commercial_renewals_snapshots CHECK (
    jsonb_typeof(package_snapshot) = 'object'
    AND jsonb_typeof(list_pricing_snapshot) = 'object'
  ),
  CONSTRAINT commercial_renewals_prior_period_order CHECK (
    prior_period_ends_at > prior_period_starts_at
  ),
  CONSTRAINT commercial_renewals_period_order CHECK (
    renewal_ends_at > renewal_starts_at
  ),
  CONSTRAINT commercial_renewals_continuous_boundary CHECK (
    renewal_kind <> 'continuous' OR renewal_starts_at = prior_period_ends_at
  ),
  CONSTRAINT commercial_renewals_adjustment_reason CHECK (
    (
      agreed_total_minor > 0
      AND list_subtotal_minor IS NOT NULL
      AND agreed_total_minor = list_subtotal_minor
      AND adjustment_reason IS NULL
    )
    OR (
      adjustment_reason IS NOT NULL
      AND adjustment_reason = BTRIM(adjustment_reason)
      AND adjustment_reason <> ''
    )
  ),
  CONSTRAINT commercial_renewals_terminal_metadata CHECK (
    (
      status IN ('awaiting_payment', 'paid')
      AND applied_by_user_id IS NULL AND applied_at IS NULL
      AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
    )
    OR (
      status = 'applied'
      AND applied_by_user_id IS NOT NULL AND applied_at IS NOT NULL
      AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
    )
    OR (
      status = 'cancelled'
      AND applied_by_user_id IS NULL AND applied_at IS NULL
      AND cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND cancellation_reason = BTRIM(cancellation_reason)
      AND cancellation_reason <> ''
    )
  )
);

CREATE INDEX commercial_renewals_organization_time_idx
  ON commercial_renewals (organization_id, created_at DESC);
CREATE INDEX commercial_renewals_status_period_idx
  ON commercial_renewals (status, renewal_ends_at, created_at DESC);
CREATE UNIQUE INDEX commercial_renewals_one_actionable_period
  ON commercial_renewals (subscription_id, prior_period_ends_at)
  WHERE status IN ('awaiting_payment', 'paid');

CREATE FUNCTION ekavio_protect_commercial_renewal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial renewal history is append-only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.renewal_kind IS DISTINCT FROM OLD.renewal_kind
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
    OR NEW.selected_plan_key IS DISTINCT FROM OLD.selected_plan_key
    OR NEW.selected_add_on_keys IS DISTINCT FROM OLD.selected_add_on_keys
    OR NEW.package_snapshot IS DISTINCT FROM OLD.package_snapshot
    OR NEW.list_subtotal_minor IS DISTINCT FROM OLD.list_subtotal_minor
    OR NEW.list_pricing_snapshot IS DISTINCT FROM OLD.list_pricing_snapshot
    OR NEW.agreed_total_minor IS DISTINCT FROM OLD.agreed_total_minor
    OR NEW.adjustment_reason IS DISTINCT FROM OLD.adjustment_reason
    OR NEW.prior_period_starts_at IS DISTINCT FROM OLD.prior_period_starts_at
    OR NEW.prior_period_ends_at IS DISTINCT FROM OLD.prior_period_ends_at
    OR NEW.renewal_starts_at IS DISTINCT FROM OLD.renewal_starts_at
    OR NEW.renewal_ends_at IS DISTINCT FROM OLD.renewal_ends_at
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.finalized_by_user_id IS DISTINCT FROM OLD.finalized_by_user_id
    OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'commercial renewal historical fields are immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'invalid commercial renewal transition';
  END IF;
  IF OLD.status = 'paid' AND NEW.status NOT IN ('awaiting_payment', 'applied', 'cancelled') THEN
    RAISE EXCEPTION 'invalid commercial renewal transition';
  END IF;
  IF OLD.status IN ('applied', 'cancelled') THEN
    RAISE EXCEPTION 'terminal commercial renewal cannot change';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commercial_renewals_protected
BEFORE UPDATE OR DELETE ON commercial_renewals
FOR EACH ROW EXECUTE FUNCTION ekavio_protect_commercial_renewal();

CREATE TABLE manual_renewal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES commercial_renewals(id) ON DELETE RESTRICT,
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
  CONSTRAINT manual_renewal_payments_idempotency_unique
    UNIQUE (renewal_id, idempotency_key),
  CONSTRAINT manual_renewal_payments_void_metadata CHECK (
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
CREATE INDEX manual_renewal_payments_renewal_time_idx
  ON manual_renewal_payments (renewal_id, created_at DESC);

CREATE FUNCTION ekavio_protect_manual_renewal_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'manual renewal payment history is append-only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.renewal_id IS DISTINCT FROM OLD.renewal_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.reference_text IS DISTINCT FROM OLD.reference_text
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'confirmed manual renewal payment fields are immutable';
  END IF;
  IF OLD.status <> 'confirmed' OR NEW.status <> 'void' THEN
    RAISE EXCEPTION 'manual renewal payment may only transition from confirmed to void';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_renewal_payments_protected
BEFORE UPDATE OR DELETE ON manual_renewal_payments
FOR EACH ROW EXECUTE FUNCTION ekavio_protect_manual_renewal_payment();

CREATE TABLE commercial_renewal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES commercial_renewals(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'renewal_created',
    'renewal_finalized',
    'payment_recorded',
    'payment_voided',
    'renewal_paid',
    'renewal_applied',
    'renewal_cancelled',
    'subscription_reactivated'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_renewal_events_details_object CHECK (
    jsonb_typeof(details) = 'object'
  )
);
CREATE INDEX commercial_renewal_events_renewal_time_idx
  ON commercial_renewal_events (renewal_id, occurred_at DESC);

CREATE TRIGGER commercial_renewal_events_append_only
BEFORE UPDATE OR DELETE ON commercial_renewal_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
