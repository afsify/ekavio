CREATE TABLE public_offer_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_type TEXT NOT NULL CHECK (offer_type IN ('plan', 'add_on')),
  plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
  add_on_id UUID REFERENCES add_ons(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  monthly_price_minor BIGINT CHECK (monthly_price_minor >= 0),
  yearly_price_minor BIGINT CHECK (yearly_price_minor >= 0),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0 AND display_order <= 10000),
  marketing_label VARCHAR(80),
  updated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_offer_pricing_target CHECK (
    (offer_type = 'plan' AND plan_id IS NOT NULL AND add_on_id IS NULL)
    OR (offer_type = 'add_on' AND add_on_id IS NOT NULL AND plan_id IS NULL)
  ),
  CONSTRAINT public_offer_pricing_published_amount CHECK (
    NOT published OR monthly_price_minor IS NOT NULL OR yearly_price_minor IS NOT NULL
  ),
  CONSTRAINT public_offer_pricing_label_trimmed CHECK (
    marketing_label IS NULL OR (marketing_label = BTRIM(marketing_label) AND marketing_label <> '')
  )
);
CREATE UNIQUE INDEX public_offer_pricing_plan_unique
  ON public_offer_pricing (plan_id) WHERE plan_id IS NOT NULL;
CREATE UNIQUE INDEX public_offer_pricing_add_on_unique
  ON public_offer_pricing (add_on_id) WHERE add_on_id IS NOT NULL;
CREATE INDEX public_offer_pricing_public_order_idx
  ON public_offer_pricing (published, display_order, created_at);

CREATE TABLE public_offer_pricing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_pricing_id UUID NOT NULL REFERENCES public_offer_pricing(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'published', 'unpublished')),
  currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
  monthly_price_minor BIGINT CHECK (monthly_price_minor >= 0),
  yearly_price_minor BIGINT CHECK (yearly_price_minor >= 0),
  published BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0 AND display_order <= 10000),
  marketing_label VARCHAR(80),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX public_offer_pricing_events_offer_time_idx
  ON public_offer_pricing_events (offer_pricing_id, occurred_at DESC);

CREATE TABLE commercial_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(160) NOT NULL,
  business_type VARCHAR(80) NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  normalized_phone VARCHAR(16) NOT NULL,
  email VARCHAR(254),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  selected_plan_key TEXT REFERENCES plans(key) ON DELETE RESTRICT,
  selected_add_on_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  currency CHAR(3) NOT NULL CHECK (currency = 'INR'),
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  pricing_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacted', 'approved', 'rejected', 'activated')),
  public_note VARCHAR(500),
  internal_note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_access_requests_business_name_trimmed CHECK (
    business_name = BTRIM(business_name) AND business_name <> ''
  ),
  CONSTRAINT commercial_access_requests_business_type_trimmed CHECK (
    business_type = BTRIM(business_type) AND business_type <> ''
  ),
  CONSTRAINT commercial_access_requests_contact_name_trimmed CHECK (
    contact_name = BTRIM(contact_name) AND contact_name <> ''
  ),
  CONSTRAINT commercial_access_requests_phone_format CHECK (
    normalized_phone ~ '^\+[1-9][0-9]{5,14}$'
  ),
  CONSTRAINT commercial_access_requests_selection CHECK (
    selected_plan_key IS NOT NULL OR cardinality(selected_add_on_keys) > 0
  ),
  CONSTRAINT commercial_access_requests_selection_limit CHECK (
    cardinality(selected_add_on_keys) <= 8
  ),
  CONSTRAINT commercial_access_requests_snapshot_object CHECK (
    jsonb_typeof(pricing_snapshot) = 'object'
  )
);
CREATE INDEX commercial_access_requests_status_time_idx
  ON commercial_access_requests (status, created_at DESC);
CREATE INDEX commercial_access_requests_phone_time_idx
  ON commercial_access_requests (normalized_phone, created_at DESC);

CREATE TABLE commercial_access_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_request_id UUID NOT NULL REFERENCES commercial_access_requests(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'status_changed', 'internal_note_updated')),
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('pending', 'contacted', 'approved', 'rejected', 'activated')
  ),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('pending', 'contacted', 'approved', 'rejected', 'activated')),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commercial_access_request_events_actor_policy CHECK (
    (action = 'submitted' AND actor_user_id IS NULL)
    OR (action <> 'submitted' AND actor_user_id IS NOT NULL)
  ),
  CONSTRAINT commercial_access_request_events_details_object CHECK (
    jsonb_typeof(details) = 'object'
  )
);
CREATE INDEX commercial_access_request_events_request_time_idx
  ON commercial_access_request_events (access_request_id, occurred_at DESC);

CREATE TRIGGER public_offer_pricing_events_append_only
BEFORE UPDATE OR DELETE ON public_offer_pricing_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();

CREATE TRIGGER commercial_access_request_events_append_only
BEFORE UPDATE OR DELETE ON commercial_access_request_events
FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
