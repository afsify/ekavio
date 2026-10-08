-- Native membership HR; no employee mirror, attendance write, public price or grant.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE module_definitions DROP CONSTRAINT module_definitions_key_check;
ALTER TABLE module_definitions ADD CONSTRAINT module_definitions_key_check CHECK(key IN ('ledger','inventory','attendance','queue','crm','purchasing','hr_plus'));
INSERT INTO module_definitions(key,display_name,description,category,commercial_type,status,version,created_at,updated_at)
 VALUES('hr_plus','HR Plus','Leave, work calendars and published shifts. Attendance is separately entitled and records distinct actual facts.','workforce','purchasable','active',1,now(),now());
INSERT INTO add_ons(key,name,description,status,available,version,created_at,updated_at)
 VALUES('module-hr-plus','HR Plus Module','Optional leave and scheduling; does not include Attendance.','active',true,1,now(),now());
INSERT INTO add_on_modules(add_on_id,module_definition_id) SELECT a.id,m.id FROM add_ons a CROSS JOIN module_definitions m WHERE a.key='module-hr-plus' AND m.key='hr_plus';
ALTER TABLE organization_role_permissions DROP CONSTRAINT organization_role_permissions_permission_check;
ALTER TABLE organization_role_permissions ADD CONSTRAINT organization_role_permissions_permission_check CHECK(permission IN (
 'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read','customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage','queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage','attendance.read','attendance.manage','reports.read','billing.read','billing.manage','corporate.manage','fields.read','fields.manage','crm.read','crm.manage','purchasing.read','purchasing.manage','hr_plus.read','hr_plus.manage','hr_plus.approve'));
CREATE TABLE hr_leave_types (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id),
 name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),description VARCHAR(500),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 requires_reason BOOLEAN NOT NULL DEFAULT false,allow_past BOOLEAN NOT NULL DEFAULT false,minimum_notice_days INTEGER NOT NULL DEFAULT 0 CHECK(minimum_notice_days BETWEEN 0 AND 365),count_non_working BOOLEAN NOT NULL DEFAULT false,
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 100),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,organization_id));
CREATE TABLE hr_work_calendars (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),
 working_days SMALLINT[] NOT NULL CHECK(cardinality(working_days) BETWEEN 1 AND 7 AND working_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,branch_id),UNIQUE(id,organization_id,branch_id),FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id));
CREATE TABLE hr_calendar_days (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,calendar_id UUID NOT NULL,
 day DATE NOT NULL,name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),non_working BOOLEAN NOT NULL DEFAULT true,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,branch_id,day),FOREIGN KEY(calendar_id,organization_id,branch_id) REFERENCES hr_work_calendars(id,organization_id,branch_id));
CREATE TABLE hr_shift_templates (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),
 start_time TIME NOT NULL,end_time TIME NOT NULL,overnight BOOLEAN NOT NULL DEFAULT false,break_minutes INTEGER NOT NULL DEFAULT 0 CHECK(break_minutes BETWEEN 0 AND 720),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,organization_id),
 CHECK((overnight AND end_time<start_time) OR (NOT overnight AND end_time>start_time)));
CREATE TABLE hr_leave_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,membership_id UUID NOT NULL,branch_id UUID NOT NULL,leave_type_id UUID NOT NULL,
 type_name_snapshot VARCHAR(100) NOT NULL,policy_snapshot JSONB NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),start_date DATE NOT NULL,end_date DATE NOT NULL,
 counted_days INTEGER NOT NULL CHECK(counted_days BETWEEN 1 AND 90),reason VARCHAR(2000),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),reviewed_by UUID REFERENCES users(id),reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,organization_id),
 FOREIGN KEY(membership_id,organization_id) REFERENCES memberships(id,organization_id),FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),FOREIGN KEY(leave_type_id,organization_id) REFERENCES hr_leave_types(id,organization_id),
 CHECK(end_date>=start_date AND end_date-start_date<90),
 EXCLUDE USING gist(organization_id WITH =,membership_id WITH =,daterange(start_date,end_date,'[]') WITH &&) WHERE(status IN ('pending','approved')));
CREATE TABLE hr_shift_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,membership_id UUID NOT NULL,template_id UUID NOT NULL,
 template_name_snapshot VARCHAR(100) NOT NULL,business_date DATE NOT NULL,timezone_snapshot TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,break_minutes INTEGER NOT NULL CHECK(break_minutes BETWEEN 0 AND 720),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','cancelled')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by UUID NOT NULL REFERENCES users(id),updated_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,organization_id),
 FOREIGN KEY(membership_id,organization_id) REFERENCES memberships(id,organization_id),FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),FOREIGN KEY(template_id,organization_id) REFERENCES hr_shift_templates(id,organization_id),
 CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '25 hours' AND break_minutes*interval '1 minute'<ends_at-starts_at),
 CHECK((starts_at AT TIME ZONE timezone_snapshot)::date=business_date),
 EXCLUDE USING gist(organization_id WITH =,membership_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status IN ('draft','published')));
-- Metadata-only history. Private reasons/comments stay out of generic events.
CREATE TABLE hr_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),branch_id UUID,membership_id UUID,
 target_id UUID NOT NULL,actor_user_id UUID NOT NULL REFERENCES users(id),action TEXT NOT NULL CHECK(action IN ('type.created','type.updated','calendar.created','calendar.updated','holiday.created','holiday.updated','template.created','template.updated','leave.submitted','leave.approved','leave.rejected','leave.cancelled','shift.created','shift.updated','shift.published','shift.cancelled')),
 resulting_version INTEGER NOT NULL CHECK(resulting_version>0),occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),FOREIGN KEY(membership_id,organization_id) REFERENCES memberships(id,organization_id));
CREATE TABLE hr_leave_decisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,request_id UUID NOT NULL,actor_user_id UUID NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('approved','rejected','cancelled')),note VARCHAR(500),resulting_version INTEGER NOT NULL CHECK(resulting_version>1),occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(request_id,organization_id) REFERENCES hr_leave_requests(id,organization_id),UNIQUE(request_id,resulting_version));
CREATE TABLE hr_commands (
 organization_id UUID NOT NULL REFERENCES organizations(id),key VARCHAR(128) NOT NULL,actor_membership_id UUID NOT NULL,command_fingerprint CHAR(64) NOT NULL,
 result JSONB NOT NULL CHECK(jsonb_typeof(result) IN ('object','array')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,key),FOREIGN KEY(actor_membership_id,organization_id) REFERENCES memberships(id,organization_id));
CREATE TRIGGER hr_events_immutable BEFORE UPDATE OR DELETE ON hr_events FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE TRIGGER hr_decisions_immutable BEFORE UPDATE OR DELETE ON hr_leave_decisions FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE TRIGGER hr_commands_immutable BEFORE UPDATE OR DELETE ON hr_commands FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
-- Every HR write serializes on the same organization row as RBAC/admin writes.
-- Exclusions protect overlaps independently; the lock also makes cross-table
-- leave approval versus publication checks safe for direct concurrent SQL.
CREATE FUNCTION ekavio_hr_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE actor UUID; subject UUID; event TEXT; zone TEXT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HR history cannot be deleted' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
 actor:=NEW.updated_by;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'HR identity/version is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('hr_work_calendars','hr_calendar_days') THEN
   IF NEW.branch_id<>OLD.branch_id THEN RAISE EXCEPTION 'Calendar branch is immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF NEW.version<>1 THEN RAISE EXCEPTION 'HR creation version must be one' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=actor AND organization_id=NEW.organization_id AND status='active') THEN RAISE EXCEPTION 'HR actor must be an active membership' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='hr_leave_requests' THEN
  subject:=NEW.membership_id;
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'pending' OR NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id WHERE m.id=subject AND m.organization_id=NEW.organization_id AND m.user_id=NEW.created_by AND m.status='active' AND a.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Leave requires its own active membership' USING ERRCODE='23514'; END IF;
   event:='leave.submitted';
  ELSE
   IF (to_jsonb(NEW)-ARRAY['status','version','updated_by','updated_at','reviewed_by','reviewed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_by','updated_at','reviewed_by','reviewed_at']) OR NOT ((OLD.status='pending' AND NEW.status IN ('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status='cancelled')) THEN RAISE EXCEPTION 'Leave facts/lifecycle are immutable' USING ERRCODE='23514'; END IF;
   IF (NEW.status IN ('approved','rejected') OR OLD.status='approved') AND EXISTS(SELECT 1 FROM memberships WHERE id=subject AND user_id=actor) THEN RAISE EXCEPTION 'Self review is prohibited' USING ERRCODE='23514'; END IF;
   event:='leave.'||NEW.status;
  END IF;
  IF NEW.status='approved' AND EXISTS(SELECT 1 FROM hr_shift_assignments s WHERE s.organization_id=NEW.organization_id AND s.membership_id=subject AND s.status='published' AND daterange((s.starts_at AT TIME ZONE s.timezone_snapshot)::date,((s.ends_at-interval '1 microsecond') AT TIME ZONE s.timezone_snapshot)::date,'[]') && daterange(NEW.start_date,NEW.end_date,'[]')) THEN RAISE EXCEPTION 'Cancel conflicting published shifts before approval' USING ERRCODE='23P01'; END IF;
 ELSIF TG_TABLE_NAME='hr_shift_assignments' THEN
  subject:=NEW.membership_id;
  IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'New shift must be a draft' USING ERRCODE='23514'; END IF;
  SELECT timezone INTO zone FROM branches WHERE id=NEW.branch_id AND organization_id=NEW.organization_id AND status='active';
  IF TG_OP='UPDATE' THEN
   IF NEW.membership_id<>OLD.membership_id OR NEW.branch_id<>OLD.branch_id OR OLD.status='cancelled' OR (OLD.status='published' AND (NEW.status<>'cancelled' OR (to_jsonb(NEW)-ARRAY['status','version','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_by','updated_at']))) THEN RAISE EXCEPTION 'Published shifts require explicit cancellation/replacement' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status<>'cancelled' THEN
   IF zone IS NULL OR zone<>NEW.timezone_snapshot OR NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id WHERE m.id=subject AND m.organization_id=NEW.organization_id AND m.status='active' AND a.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Shift requires active assigned membership and branch timezone' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM hr_leave_requests l WHERE l.organization_id=NEW.organization_id AND l.membership_id=subject AND l.status='approved' AND daterange(l.start_date,l.end_date,'[]') && daterange((NEW.starts_at AT TIME ZONE zone)::date,((NEW.ends_at-interval '1 microsecond') AT TIME ZONE zone)::date,'[]')) THEN RAISE EXCEPTION 'Shift conflicts with approved leave' USING ERRCODE='23P01'; END IF;
  END IF;
  event:=CASE WHEN TG_OP='INSERT' THEN 'shift.created' WHEN NEW.status='published' THEN 'shift.published' WHEN NEW.status='cancelled' THEN 'shift.cancelled' ELSE 'shift.updated' END;
 ELSE
  event:=CASE TG_TABLE_NAME WHEN 'hr_leave_types' THEN 'type' WHEN 'hr_work_calendars' THEN 'calendar' WHEN 'hr_calendar_days' THEN 'holiday' ELSE 'template' END||CASE WHEN TG_OP='INSERT' THEN '.created' ELSE '.updated' END;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
CREATE FUNCTION ekavio_hr_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE kind TEXT; branch UUID; subject UUID;
BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'hr_leave_types' THEN 'type' WHEN 'hr_work_calendars' THEN 'calendar' WHEN 'hr_calendar_days' THEN 'holiday' WHEN 'hr_shift_templates' THEN 'template' WHEN 'hr_leave_requests' THEN 'leave' ELSE 'shift' END;
 IF kind IN ('calendar','holiday','leave','shift') THEN branch:=NEW.branch_id; END IF;
 IF kind IN ('leave','shift') THEN subject:=NEW.membership_id; END IF;
 INSERT INTO hr_events(organization_id,branch_id,membership_id,target_id,actor_user_id,action,resulting_version)
 VALUES(NEW.organization_id,branch,subject,NEW.id,NEW.updated_by,kind||CASE WHEN TG_OP='INSERT' THEN CASE WHEN kind='leave' THEN '.submitted' ELSE '.created' END WHEN kind='leave' THEN '.'||(to_jsonb(NEW)->>'status') WHEN kind='shift' AND (to_jsonb(NEW)->>'status') IN ('published','cancelled') THEN '.'||(to_jsonb(NEW)->>'status') ELSE '.updated' END,NEW.version);
 RETURN NULL;
END $$;
DO $$ DECLARE table_name TEXT; BEGIN FOREACH table_name IN ARRAY ARRAY['hr_leave_types','hr_work_calendars','hr_calendar_days','hr_shift_templates','hr_leave_requests','hr_shift_assignments'] LOOP
 EXECUTE format('CREATE TRIGGER hr_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ekavio_hr_guard()',table_name);
 EXECUTE format('CREATE TRIGGER hr_history AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ekavio_hr_history()',table_name);
END LOOP; END $$;
CREATE INDEX hr_leave_scope ON hr_leave_requests(organization_id,membership_id,start_date,end_date);
CREATE INDEX hr_pending ON hr_leave_requests(organization_id,created_at DESC) WHERE status='pending';
CREATE INDEX hr_shift_scope ON hr_shift_assignments(organization_id,branch_id,business_date,status);
CREATE INDEX hr_history_scope ON hr_events(organization_id,target_id,occurred_at DESC);
ALTER TABLE notification_preferences ADD COLUMN hr_updates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_category_check;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_event_key_check;
ALTER TABLE user_notifications DROP CONSTRAINT user_notifications_action_key_check;
ALTER TABLE user_notifications ADD CHECK(category IN ('organization','crm','hr'));
ALTER TABLE user_notifications ADD CHECK(event_key IN ('membership.updated','role.updated','lead.assigned','followup.assigned','leave.submitted','leave.approved','leave.rejected','shift.published','shift.cancelled'));
ALTER TABLE user_notifications ADD CHECK(action_key IN ('settings','crm','hr'));
ALTER TABLE report_export_events DROP CONSTRAINT report_export_events_report_key_check;
ALTER TABLE report_export_events ADD CHECK(report_key IN ('customers','services','appointments','queue','attendance','dues-balances','dues-journal','inventory','stock-movements','staff','crm-leads','crm-followups','purchase-orders','goods-received','supplier-purchases','hr-leave','hr-approved','hr-shifts','hr-coverage'));
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_widget_order_check;
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_hidden_widgets_check;
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_check;
ALTER TABLE dashboard_preferences ADD CHECK(widget_order <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned','purchasing-open','purchasing-partial','purchasing-awaiting','purchasing-recent','hr-pending','hr-leave','hr-shifts','hr-unscheduled']::text[]);
ALTER TABLE dashboard_preferences ADD CHECK(hidden_widgets <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned','purchasing-open','purchasing-partial','purchasing-awaiting','purchasing-recent','hr-pending','hr-leave','hr-shifts','hr-unscheduled']::text[]);
ALTER TABLE dashboard_preferences ADD CONSTRAINT hr_dashboard_layout_bound CHECK(cardinality(widget_order)<=24 AND cardinality(hidden_widgets)<=24);
