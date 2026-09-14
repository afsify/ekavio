CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT,
  platform_role TEXT CHECK (platform_role IN ('operator')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT users_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);
CREATE INDEX users_phone_idx ON users (phone);

CREATE TABLE parent_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  consolidated_billing BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT parent_organizations_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);
CREATE INDEX parent_organizations_owner_idx ON parent_organizations (owner_user_id);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  parent_organization_id UUID REFERENCES parent_organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  theme_mode TEXT NOT NULL CHECK (theme_mode IN ('light', 'dark')),
  theme_primary_color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT organizations_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);
CREATE INDEX organizations_parent_idx ON organizations (parent_organization_id);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT branches_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT branches_organization_code_unique UNIQUE (organization_id, code),
  CONSTRAINT branches_id_organization_unique UNIQUE (id, organization_id)
);
CREATE INDEX branches_organization_idx ON branches (organization_id);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'staff')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT memberships_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT memberships_user_organization_unique UNIQUE (user_id, organization_id),
  CONSTRAINT memberships_id_organization_unique UNIQUE (id, organization_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE INDEX memberships_organization_status_idx ON memberships (organization_id, status);

CREATE TABLE membership_branch_assignments (
  membership_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  PRIMARY KEY (membership_id, branch_id),
  FOREIGN KEY (membership_id, organization_id)
    REFERENCES memberships(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id, organization_id)
    REFERENCES branches(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX membership_branch_assignments_branch_idx
  ON membership_branch_assignments (branch_id);

CREATE TABLE module_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  key TEXT NOT NULL UNIQUE CHECK (key IN ('ledger', 'inventory', 'attendance', 'queue')),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  commercial_type TEXT NOT NULL CHECK (commercial_type IN ('core', 'purchasable')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT module_definitions_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  available BOOLEAN NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT plans_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);

CREATE TABLE plan_modules (
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_definition_id UUID NOT NULL REFERENCES module_definitions(id) ON DELETE RESTRICT,
  PRIMARY KEY (plan_id, module_definition_id)
);

CREATE TABLE plan_limits (
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  limit_key TEXT NOT NULL CHECK (
    limit_key IN ('staff', 'branches', 'storageMb', 'documents', 'automationRuns')
  ),
  value INTEGER NOT NULL CHECK (value >= 0),
  PRIMARY KEY (plan_id, limit_key)
);

CREATE TABLE add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  available BOOLEAN NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT add_ons_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  )
);

CREATE TABLE add_on_modules (
  add_on_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  module_definition_id UUID NOT NULL REFERENCES module_definitions(id) ON DELETE RESTRICT,
  PRIMARY KEY (add_on_id, module_definition_id)
);

CREATE TABLE add_on_limit_adjustments (
  add_on_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  limit_key TEXT NOT NULL CHECK (
    limit_key IN ('staff', 'branches', 'storageMb', 'documents', 'automationRuns')
  ),
  mode TEXT NOT NULL CHECK (mode IN ('add', 'override')),
  value INTEGER NOT NULL CHECK (value >= 0),
  PRIMARY KEY (add_on_id, limit_key)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'trialing', 'inactive', 'suspended', 'cancelled')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'pilot', 'import', 'support')),
  starts_at TIMESTAMPTZ NOT NULL,
  current_period_ends_at TIMESTAMPTZ,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  suspended_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT subscriptions_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT subscriptions_period_order CHECK (
    current_period_ends_at IS NULL OR current_period_ends_at >= starts_at
  )
);
CREATE INDEX subscriptions_status_idx ON subscriptions (status);

CREATE TABLE subscription_add_ons (
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  add_on_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  PRIMARY KEY (subscription_id, add_on_id),
  CONSTRAINT subscription_add_ons_period_order CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at
  )
);

CREATE TABLE entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mongo_id VARCHAR(24) UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  module_definition_id UUID NOT NULL REFERENCES module_definitions(id) ON DELETE RESTRICT,
  effect TEXT NOT NULL CHECK (effect IN ('grant', 'revoke')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'pilot', 'import', 'support')),
  reason TEXT NOT NULL CHECK (char_length(reason) <= 500),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT entitlement_overrides_legacy_mongo_id_format CHECK (
    legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[0-9a-f]{24}$'
  ),
  CONSTRAINT entitlement_overrides_organization_module_unique
    UNIQUE (organization_id, module_definition_id),
  CONSTRAINT entitlement_overrides_period_order CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from
  )
);
CREATE INDEX entitlement_overrides_organization_idx
  ON entitlement_overrides (organization_id);

-- Schema-only V2-05A foundations. No Mongo refresh-session or audit rows are copied.
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_events_organization_occurred_idx
  ON audit_events (organization_id, occurred_at DESC);
