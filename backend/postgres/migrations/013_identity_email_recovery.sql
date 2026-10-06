-- Additive: do not reinterpret, rewrite or make legacy phone rows unique.
CREATE TABLE user_email_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  display_email VARCHAR(254) NOT NULL,
  normalized_email VARCHAR(254) NOT NULL CHECK (normalized_email = lower(btrim(display_email))),
  state TEXT NOT NULL CHECK (state IN ('pending', 'verified', 'replaced')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK ((state = 'pending' AND verified_at IS NULL) OR state = 'replaced' OR (state = 'verified' AND verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX email_usable_unique ON user_email_identities(normalized_email) WHERE state <> 'replaced';
CREATE UNIQUE INDEX email_one_verified ON user_email_identities(user_id) WHERE state = 'verified';
CREATE UNIQUE INDEX email_one_pending ON user_email_identities(user_id) WHERE state = 'pending';

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  theme_mode TEXT NOT NULL DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark', 'system')),
  accent CHAR(7) NOT NULL DEFAULT '#4F46E5' CHECK (accent IN ('#4F46E5', '#087443', '#7040BC', '#B42358')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(32) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email VARCHAR(254),
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'hr', 'staff')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CHECK (expires_at > created_at),
  CHECK (email IS NULL OR email = lower(btrim(email)))
);
CREATE UNIQUE INDEX staff_invitation_active_phone ON staff_invitations(organization_id, phone)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;
CREATE TABLE staff_invitation_branches (
  invitation_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  PRIMARY KEY (invitation_id, branch_id),
  FOREIGN KEY (invitation_id, organization_id) REFERENCES staff_invitations(id, organization_id),
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)
);
CREATE TABLE identity_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset', 'staff_invitation')),
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  email_identity_id UUID REFERENCES user_email_identities(id) ON DELETE RESTRICT,
  invitation_id UUID REFERENCES staff_invitations(id) ON DELETE RESTRICT,
  secret_hash CHAR(64) NOT NULL UNIQUE CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  FOREIGN KEY (email_identity_id, user_id) REFERENCES user_email_identities(id, user_id),
  CHECK ((purpose = 'email_verification' AND user_id IS NOT NULL AND email_identity_id IS NOT NULL AND invitation_id IS NULL)
    OR (purpose = 'password_reset' AND user_id IS NOT NULL AND email_identity_id IS NULL AND invitation_id IS NULL)
    OR (purpose = 'staff_invitation' AND user_id IS NULL AND email_identity_id IS NULL AND invitation_id IS NOT NULL))
);
CREATE INDEX identity_challenge_user_purpose ON identity_challenges(user_id, purpose, created_at DESC);
CREATE UNIQUE INDEX identity_challenge_one_live_user ON identity_challenges(user_id, purpose)
  WHERE consumed_at IS NULL AND revoked_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX identity_challenge_one_live_invitation ON identity_challenges(invitation_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL AND invitation_id IS NOT NULL;

-- Identity-level audit is independent of a selected tenant and legacy audit latches.
-- Closed columns cannot receive bodies, credentials, URLs or email/phone values.
CREATE TABLE account_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('email.proposed', 'email.verified', 'email.resent', 'recovery.requested', 'reset.completed', 'sessions.revoked', 'invitation.created', 'invitation.revoked', 'invitation.replaced', 'invitation.accepted', 'email.delivery_failed')),
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  invitation_id UUID REFERENCES staff_invitations(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL DEFAULT 'accepted' CHECK (outcome IN ('accepted', 'unavailable'))
);
CREATE TRIGGER account_security_events_append_only BEFORE UPDATE OR DELETE ON account_security_events
  FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
