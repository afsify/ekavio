-- Optional CRM. No subscription/plan grants, prices, historical leads or stages.
ALTER TABLE module_definitions DROP CONSTRAINT module_definitions_key_check;
ALTER TABLE module_definitions ADD CONSTRAINT module_definitions_key_check CHECK(key IN ('ledger','inventory','attendance','queue','crm'));
INSERT INTO module_definitions(key,display_name,description,category,commercial_type,status,version,created_at,updated_at)
 VALUES('crm','CRM & Follow-ups','Leads, pipeline, assignments, manual follow-ups, Customer conversion and CRM reports.','customer-experience','purchasable','active',1,now(),now());
INSERT INTO add_ons(key,name,description,status,available,version,created_at,updated_at)
 VALUES('module-crm','CRM & Follow-ups Module','Optional manually activated CRM access.','active',true,1,now(),now());
INSERT INTO add_on_modules(add_on_id,module_definition_id)
 SELECT a.id,m.id FROM add_ons a CROSS JOIN module_definitions m WHERE a.key='module-crm' AND m.key='crm';
-- Absence of public pricing is unpublished, never a fabricated zero price.
ALTER TABLE organization_role_permissions DROP CONSTRAINT organization_role_permissions_permission_check;
ALTER TABLE organization_role_permissions ADD CONSTRAINT organization_role_permissions_permission_check CHECK(permission IN (
 'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read',
 'customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage','fields.read','fields.manage',
 'queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage','attendance.read','attendance.manage',
 'crm.read','crm.manage','reports.read','billing.read','billing.manage','corporate.manage'));
CREATE TABLE crm_pipeline_stages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),
 name VARCHAR(100) NOT NULL CHECK(length(btrim(name))>0),description VARCHAR(500) NOT NULL DEFAULT '',
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 49),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id));
CREATE UNIQUE INDEX crm_stage_name ON crm_pipeline_stages(organization_id,lower(name));
CREATE TABLE crm_leads (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),branch_id UUID NOT NULL,
 name VARCHAR(200) NOT NULL CHECK(length(btrim(name))>0),company VARCHAR(200),phone VARCHAR(30),email VARCHAR(254),source VARCHAR(100),
 pipeline_stage_id UUID NOT NULL,assigned_membership_id UUID,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','lost','archived')),
 notes VARCHAR(2000),lost_reason VARCHAR(1000),converted_customer_id UUID,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id,branch_id),UNIQUE(id,organization_id),
 FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),
 FOREIGN KEY(pipeline_stage_id,organization_id) REFERENCES crm_pipeline_stages(id,organization_id),
 FOREIGN KEY(assigned_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(converted_customer_id,organization_id) REFERENCES customers(id,organization_id),
 CHECK((status='converted')=(converted_customer_id IS NOT NULL)),
 CHECK(status<>'lost' OR (lost_reason IS NOT NULL AND length(btrim(lost_reason))>0)));
CREATE TABLE crm_follow_ups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,lead_id UUID NOT NULL,
 assigned_membership_id UUID,type TEXT NOT NULL CHECK(type IN ('call','meeting','task','note','other')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 subject VARCHAR(200) NOT NULL CHECK(length(btrim(subject))>0),note VARCHAR(2000),due_at TIMESTAMPTZ NOT NULL,completed_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id,branch_id),
 FOREIGN KEY(lead_id,organization_id,branch_id) REFERENCES crm_leads(id,organization_id,branch_id),
 FOREIGN KEY(assigned_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 CHECK((status='completed')=(completed_at IS NOT NULL)));
CREATE TABLE crm_activity_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,lead_id UUID NOT NULL,
 actor_user_id UUID NOT NULL REFERENCES users(id),follow_up_id UUID,
 action TEXT NOT NULL CHECK(action IN ('lead.created','lead.updated','lead.stage_changed','lead.assigned','lead.unassigned','lead.note_added','lead.converted','lead.marked_lost','lead.archived','lead.reactivated','followup.created','followup.updated','followup.completed','followup.cancelled')),
 note VARCHAR(2000),stage_id UUID,assigned_membership_id UUID,customer_id UUID,occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(lead_id,organization_id,branch_id) REFERENCES crm_leads(id,organization_id,branch_id),
 FOREIGN KEY(follow_up_id,organization_id,branch_id) REFERENCES crm_follow_ups(id,organization_id,branch_id),
 FOREIGN KEY(stage_id,organization_id) REFERENCES crm_pipeline_stages(id,organization_id),
 FOREIGN KEY(assigned_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id));
CREATE TRIGGER crm_activity_append_only BEFORE UPDATE OR DELETE ON crm_activity_events FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE FUNCTION ekavio_crm_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CRM history must be archived, not deleted'; END IF;
 IF (NEW.id,NEW.organization_id) IS DISTINCT FROM (OLD.id,OLD.organization_id) THEN RAISE EXCEPTION 'CRM identity is immutable'; END IF;
 IF TG_TABLE_NAME='crm_leads' THEN
  IF NEW.branch_id<>OLD.branch_id OR (OLD.converted_customer_id IS NOT NULL AND (NEW.converted_customer_id,NEW.status) IS DISTINCT FROM (OLD.converted_customer_id,OLD.status)) THEN RAISE EXCEPTION 'Converted lead link and branch are immutable'; END IF;
 ELSIF TG_TABLE_NAME='crm_follow_ups' THEN
  IF (NEW.branch_id,NEW.lead_id) IS DISTINCT FROM (OLD.branch_id,OLD.lead_id) OR (OLD.status<>'pending' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Terminal follow-up is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_leads_preserve BEFORE UPDATE OR DELETE ON crm_leads FOR EACH ROW EXECUTE FUNCTION ekavio_crm_preserve_history();
CREATE TRIGGER crm_followups_preserve BEFORE UPDATE OR DELETE ON crm_follow_ups FOR EACH ROW EXECUTE FUNCTION ekavio_crm_preserve_history();
CREATE TRIGGER crm_stages_preserve BEFORE UPDATE OR DELETE ON crm_pipeline_stages FOR EACH ROW EXECUTE FUNCTION ekavio_crm_preserve_history();
CREATE INDEX crm_leads_scope ON crm_leads(organization_id,branch_id,status,created_at DESC,id);
CREATE INDEX crm_leads_stage ON crm_leads(organization_id,branch_id,pipeline_stage_id,status);
CREATE INDEX crm_leads_assignee ON crm_leads(organization_id,branch_id,assigned_membership_id,status);
CREATE INDEX crm_followups_due ON crm_follow_ups(organization_id,branch_id,status,due_at,id);
CREATE INDEX crm_followups_lead ON crm_follow_ups(organization_id,branch_id,lead_id,created_at DESC,id);
CREATE INDEX crm_activity_lead ON crm_activity_events(organization_id,branch_id,lead_id,occurred_at DESC,id);
ALTER TABLE custom_field_definitions DROP CONSTRAINT custom_field_definitions_entity_type_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_entity_type_check CHECK(entity_type IN ('customer','service','appointment','inventory_item','membership','lead'));
ALTER TABLE form_layouts DROP CONSTRAINT form_layouts_entity_type_check;
ALTER TABLE form_layouts ADD CONSTRAINT form_layouts_entity_type_check CHECK(entity_type IN ('customer','service','appointment','inventory_item','membership','lead'));
ALTER TABLE custom_field_entities ADD COLUMN lead_id UUID;
ALTER TABLE custom_field_entities DROP CONSTRAINT custom_field_entities_check;
ALTER TABLE custom_field_entities DROP CONSTRAINT custom_field_entities_check1;
ALTER TABLE custom_field_entities ADD CONSTRAINT custom_field_entities_check CHECK(num_nonnulls(customer_id,service_id,appointment_id,inventory_item_id,membership_id,lead_id)=1);
ALTER TABLE custom_field_entities ADD CONSTRAINT custom_field_entities_check1 CHECK(
 (entity_type='customer' AND customer_id IS NOT NULL AND entity_id=customer_id) OR (entity_type='service' AND service_id IS NOT NULL AND entity_id=service_id) OR
 (entity_type='appointment' AND appointment_id IS NOT NULL AND entity_id=appointment_id) OR (entity_type='inventory_item' AND inventory_item_id IS NOT NULL AND entity_id=inventory_item_id) OR
 (entity_type='membership' AND membership_id IS NOT NULL AND entity_id=membership_id) OR (entity_type='lead' AND lead_id IS NOT NULL AND entity_id=lead_id));
ALTER TABLE custom_field_entities ADD FOREIGN KEY(lead_id,organization_id) REFERENCES crm_leads(id,organization_id);
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_widget_order_check;
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_hidden_widgets_check;
ALTER TABLE dashboard_preferences ADD CHECK(widget_order <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned']::text[]);
ALTER TABLE dashboard_preferences ADD CHECK(hidden_widgets <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned']::text[]);
ALTER TABLE report_export_events DROP CONSTRAINT report_export_events_report_key_check;
ALTER TABLE report_export_events ADD CHECK(report_key IN ('customers','services','appointments','queue','attendance','dues-balances','dues-journal','inventory','stock-movements','staff','crm-leads','crm-followups'));
ALTER TABLE notification_preferences ADD COLUMN crm_assignments BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_category_check;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_event_key_check;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_action_key_check;
ALTER TABLE user_notifications ADD CHECK(category IN ('organization','crm'));
ALTER TABLE user_notifications ADD CHECK(event_key IN ('membership.updated','role.updated','lead.assigned','followup.assigned'));
ALTER TABLE user_notifications ADD CHECK(action_key IN ('settings','crm'));
CREATE TABLE crm_admin_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),
 actor_user_id UUID NOT NULL REFERENCES users(id),action TEXT NOT NULL CHECK(action IN ('crm.stage.created','crm.stage.updated')),
 target_id UUID NOT NULL,occurred_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TRIGGER crm_admin_append_only BEFORE UPDATE OR DELETE ON crm_admin_events FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE INDEX crm_admin_scope ON crm_admin_events(organization_id,occurred_at DESC);
CREATE FUNCTION ekavio_crm_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.assigned_membership_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assigned_membership_id IS DISTINCT FROM OLD.assigned_membership_id) THEN
  IF NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id
   WHERE m.id=NEW.assigned_membership_id AND m.organization_id=NEW.organization_id AND a.branch_id=NEW.branch_id AND m.status='active')
  THEN RAISE EXCEPTION 'CRM assignment requires active same-branch membership' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_assignment BEFORE INSERT OR UPDATE ON crm_leads FOR EACH ROW EXECUTE FUNCTION ekavio_crm_assignment_guard();
CREATE TRIGGER crm_followup_assignment BEFORE INSERT OR UPDATE ON crm_follow_ups FOR EACH ROW EXECUTE FUNCTION ekavio_crm_assignment_guard();
