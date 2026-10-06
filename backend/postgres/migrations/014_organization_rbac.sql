-- Additive tenant administration. No identity or commercial backfill.
CREATE TABLE organization_profiles (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  business_category VARCHAR(100), description VARCHAR(1000), contact_email VARCHAR(254),
  contact_phone VARCHAR(32), address VARCHAR(500), website VARCHAR(254),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL CHECK (name=btrim(name) AND name<>''),
  description VARCHAR(500) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX organization_role_name ON organization_roles(organization_id,lower(name));
CREATE TABLE organization_role_permissions (
  role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE RESTRICT,
  permission TEXT NOT NULL CHECK(permission IN (
    'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read',
    'customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage',
    'queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage',
    'attendance.read','attendance.manage','reports.read','billing.read','billing.manage','corporate.manage')),
  PRIMARY KEY(role_id,permission)
);
ALTER TABLE memberships ADD COLUMN custom_role_id UUID,
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  ADD CONSTRAINT memberships_custom_role_tenant FOREIGN KEY(custom_role_id,organization_id)
    REFERENCES organization_roles(id,organization_id) ON DELETE RESTRICT,
  ADD CONSTRAINT memberships_owner_builtin CHECK(role<>'owner' OR custom_role_id IS NULL);
ALTER TABLE branches ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE staff_invitations ADD COLUMN target_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN custom_role_id UUID,
  ADD CONSTRAINT invitation_custom_role_tenant FOREIGN KEY(custom_role_id,organization_id)
    REFERENCES organization_roles(id,organization_id) ON DELETE RESTRICT;
-- Separate closed, append-only administration history; no free-form details/PII.
CREATE TABLE organization_admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('organization.updated','branch.created','branch.updated','role.created','role.updated','role.archived','membership.updated','invitation.created','invitation.revoked','invitation.accepted')),
  target_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organization_admin_events_scope ON organization_admin_events(organization_id,occurred_at DESC);
CREATE TRIGGER organization_admin_events_append_only BEFORE UPDATE OR DELETE ON organization_admin_events
  FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
