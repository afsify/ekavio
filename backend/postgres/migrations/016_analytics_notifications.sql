-- Presentation preferences and attention messages are not business/audit authority.
CREATE TABLE dashboard_preferences (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  widget_order TEXT[] NOT NULL DEFAULT '{}',
  hidden_widgets TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id),
  FOREIGN KEY (user_id,organization_id) REFERENCES memberships(user_id,organization_id),
  CHECK (widget_order <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations']::text[]),
  CHECK (hidden_widgets <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations']::text[]),
  CHECK (cardinality(widget_order)<=20 AND cardinality(hidden_widgets)<=20)
);
CREATE TABLE notification_preferences (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_changes BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id),
  FOREIGN KEY (user_id,organization_id) REFERENCES memberships(user_id,organization_id)
);
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  branch_id UUID,
  category TEXT NOT NULL CHECK (category='organization'),
  event_key TEXT NOT NULL CHECK (event_key IN ('membership.updated','role.updated')),
  title VARCHAR(100) NOT NULL,
  message VARCHAR(500) NOT NULL,
  action_key TEXT NOT NULL CHECK (action_key='settings'),
  dedupe_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ CHECK (read_at IS NULL OR read_at>=created_at),
  FOREIGN KEY (membership_id,organization_id) REFERENCES memberships(id,organization_id),
  FOREIGN KEY (branch_id,organization_id) REFERENCES branches(id,organization_id),
  UNIQUE (organization_id,user_id,dedupe_key)
);
CREATE FUNCTION ekavio_require_notification_owner() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM memberships WHERE id=NEW.membership_id AND organization_id=NEW.organization_id AND user_id=NEW.user_id)
 THEN RAISE EXCEPTION 'Notification recipient must own membership'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_owner BEFORE INSERT OR UPDATE ON user_notifications
 FOR EACH ROW EXECUTE FUNCTION ekavio_require_notification_owner();
CREATE INDEX notifications_recipient_idx ON user_notifications(organization_id,user_id,created_at DESC,id);
CREATE INDEX notifications_unread_idx ON user_notifications(organization_id,user_id) WHERE read_at IS NULL;
CREATE TABLE report_export_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id),
 actor_user_id UUID NOT NULL REFERENCES users(id),
 action TEXT NOT NULL DEFAULT 'report.exported' CHECK (action='report.exported'),
 report_key TEXT NOT NULL CHECK (report_key IN ('customers','services','appointments','queue','attendance','dues-balances','dues-journal','inventory','stock-movements','staff')),
 row_count INTEGER NOT NULL CHECK (row_count BETWEEN 0 AND 2000),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER report_export_append_only BEFORE UPDATE OR DELETE ON report_export_events
 FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
