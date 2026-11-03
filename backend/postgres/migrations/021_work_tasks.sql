-- Independent, optional Tasks. No plan changes, prices, subscriptions or grants.
ALTER TABLE module_definitions DROP CONSTRAINT module_definitions_key_check;
ALTER TABLE module_definitions ADD CONSTRAINT module_definitions_key_check CHECK
 (key IN ('ledger','inventory','attendance','queue','crm','purchasing','hr_plus','tasks'));
INSERT INTO module_definitions(key,display_name,description,category,commercial_type,status,version,created_at,updated_at)
 VALUES('tasks','Tasks','Branch-scoped assigned work and immutable task history.','workforce','purchasable','active',1,now(),now());
INSERT INTO add_ons(key,name,description,status,available,version,created_at,updated_at)
 VALUES('module-tasks','Tasks Module','Optional manually entitled assigned work.','active',true,1,now(),now());
INSERT INTO add_on_modules(add_on_id,module_definition_id)
 SELECT a.id,m.id FROM add_ons a CROSS JOIN module_definitions m WHERE a.key='module-tasks' AND m.key='tasks';
ALTER TABLE organization_role_permissions DROP CONSTRAINT organization_role_permissions_permission_check;
ALTER TABLE organization_role_permissions ADD CONSTRAINT organization_role_permissions_permission_check CHECK(permission IN (
 'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read',
 'customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage','fields.read','fields.manage',
 'queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage','attendance.read','attendance.manage',
 'crm.read','crm.manage','purchasing.read','purchasing.manage','hr_plus.read','hr_plus.manage','hr_plus.approve',
 'reports.read','billing.read','billing.manage','corporate.manage','tasks.read_own','tasks.manage_own','tasks.read','tasks.manage'));

CREATE TABLE work_tasks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), branch_id UUID NOT NULL,
 creator_membership_id UUID NOT NULL, assigned_membership_id UUID NOT NULL,
 created_by UUID NOT NULL REFERENCES users(id), updated_by UUID NOT NULL REFERENCES users(id), actor_membership_id UUID NOT NULL,
 title VARCHAR(200) NOT NULL CHECK(length(btrim(title))>0), description VARCHAR(5000) NOT NULL DEFAULT '',
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 due_at TIMESTAMPTZ, due_timezone TEXT,
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','completed','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
 last_action TEXT NOT NULL CHECK(last_action IN ('task.created','task.updated','task.assigned','task.started','task.reset','task.completed','task.cancelled','task.reopened')),
 last_reason VARCHAR(500),
 UNIQUE(id,organization_id,branch_id),
 FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),
 FOREIGN KEY(creator_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(assigned_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 CHECK((status='completed')=(completed_at IS NOT NULL)), CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),
 CHECK((due_at IS NULL)=(due_timezone IS NULL)),
 CHECK((last_action IN ('task.cancelled','task.reopened') AND last_reason IS NOT NULL AND length(btrim(last_reason))>0) OR
       (last_action NOT IN ('task.cancelled','task.reopened') AND last_reason IS NULL))
);
CREATE TABLE work_task_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL, organization_id UUID NOT NULL, branch_id UUID NOT NULL,
 actor_user_id UUID NOT NULL REFERENCES users(id), actor_membership_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('task.created','task.updated','task.assigned','task.started','task.reset','task.completed','task.cancelled','task.reopened')),
 resulting_version INTEGER NOT NULL CHECK(resulting_version>0), occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), reason VARCHAR(500),
 old_status TEXT, new_status TEXT NOT NULL, old_assignee UUID, new_assignee UUID NOT NULL,
 old_due_at TIMESTAMPTZ, new_due_at TIMESTAMPTZ, old_priority TEXT, new_priority TEXT NOT NULL,
 old_due_timezone TEXT, new_due_timezone TEXT, changed_fields TEXT[] NOT NULL,
 UNIQUE(task_id,resulting_version), UNIQUE(id,task_id,organization_id,branch_id,resulting_version),
 FOREIGN KEY(task_id,organization_id,branch_id) REFERENCES work_tasks(id,organization_id,branch_id),
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(old_assignee,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(new_assignee,organization_id) REFERENCES memberships(id,organization_id)
);
CREATE TABLE work_task_commands (
 organization_id UUID NOT NULL, key VARCHAR(128) NOT NULL CHECK(key ~ '^[A-Za-z0-9:_-]{1,128}$'),
 branch_id UUID NOT NULL, actor_membership_id UUID NOT NULL, task_id UUID NOT NULL,
 command TEXT NOT NULL CHECK(command IN ('create','update','status','cancel','reopen')),
 command_fingerprint CHAR(64) NOT NULL CHECK(command_fingerprint ~ '^[0-9a-f]{64}$'),
 resulting_version INTEGER NOT NULL CHECK(resulting_version>0), event_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,key), UNIQUE(task_id,resulting_version),
 FOREIGN KEY(actor_membership_id,organization_id) REFERENCES memberships(id,organization_id),
 FOREIGN KEY(task_id,organization_id,branch_id) REFERENCES work_tasks(id,organization_id,branch_id),
 FOREIGN KEY(event_id,task_id,organization_id,branch_id,resulting_version)
   REFERENCES work_task_events(id,task_id,organization_id,branch_id,resulting_version)
);

CREATE FUNCTION ekavio_work_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed BOOLEAN;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Task history is retained, not deleted' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND organization_id=NEW.organization_id AND status='active') OR
    NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id
       WHERE m.id=NEW.actor_membership_id AND m.organization_id=NEW.organization_id AND m.user_id=NEW.updated_by AND m.status='active' AND a.branch_id=NEW.branch_id)
 THEN RAISE EXCEPTION 'Task actor requires an active assigned branch' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.status<>'todo' OR NEW.last_action<>'task.created' OR NEW.creator_membership_id<>NEW.actor_membership_id OR NEW.created_by<>NEW.updated_by THEN
   RAISE EXCEPTION 'Invalid initial task identity/state' USING ERRCODE='23514';
  END IF;
  NEW.created_at:=clock_timestamp();
 ELSE
  IF (NEW.id,NEW.organization_id,NEW.branch_id,NEW.creator_membership_id,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.branch_id,OLD.creator_membership_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'Task identity is immutable and version must advance once' USING ERRCODE='23514';
  END IF;
  changed:=(NEW.title,NEW.description,NEW.priority,NEW.due_at,NEW.due_timezone,NEW.assigned_membership_id)
    IS DISTINCT FROM (OLD.title,OLD.description,OLD.priority,OLD.due_at,OLD.due_timezone,OLD.assigned_membership_id);
  IF OLD.status='cancelled' OR (OLD.status='completed' AND (NEW.last_action<>'task.reopened' OR NEW.status<>'todo' OR changed)) THEN
   RAISE EXCEPTION 'Terminal task requires an explicit permitted lifecycle action' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('todo','in_progress') THEN
   IF NEW.status=OLD.status THEN
    IF NOT changed OR NEW.last_action<>(CASE WHEN NEW.assigned_membership_id<>OLD.assigned_membership_id THEN 'task.assigned' ELSE 'task.updated' END) THEN
     RAISE EXCEPTION 'Task edit must contain real permitted changes' USING ERRCODE='23514';
    END IF;
   ELSIF changed OR NOT (
     (NEW.status='in_progress' AND OLD.status='todo' AND NEW.last_action='task.started') OR
     (NEW.status='todo' AND OLD.status='in_progress' AND NEW.last_action='task.reset') OR
     (NEW.status='completed' AND NEW.last_action='task.completed') OR
     (NEW.status='cancelled' AND NEW.last_action='task.cancelled')) THEN
    RAISE EXCEPTION 'Invalid task transition or combined status edit' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 IF NEW.due_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.due_timezone) THEN
  RAISE EXCEPTION 'Task deadline timezone must be valid' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR NEW.assigned_membership_id IS DISTINCT FROM OLD.assigned_membership_id THEN
  IF NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id
      WHERE m.id=NEW.assigned_membership_id AND m.organization_id=NEW.organization_id AND m.status='active' AND a.branch_id=NEW.branch_id) THEN
   RAISE EXCEPTION 'Task assignee must be active in the same branch' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.updated_at:=clock_timestamp();
 NEW.completed_at:=CASE WHEN NEW.status='completed' THEN NEW.updated_at ELSE NULL END;
 NEW.cancelled_at:=CASE WHEN NEW.status='cancelled' THEN NEW.updated_at ELSE NULL END;
 RETURN NEW;
END $$;
CREATE TRIGGER work_tasks_guard BEFORE INSERT OR UPDATE OR DELETE ON work_tasks FOR EACH ROW EXECUTE FUNCTION ekavio_work_task_guard();

CREATE FUNCTION ekavio_work_task_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO work_task_events(task_id,organization_id,branch_id,actor_user_id,actor_membership_id,action,resulting_version,occurred_at,reason,
  old_status,new_status,old_assignee,new_assignee,old_due_at,new_due_at,old_priority,new_priority,old_due_timezone,new_due_timezone,changed_fields)
 VALUES(NEW.id,NEW.organization_id,NEW.branch_id,NEW.updated_by,NEW.actor_membership_id,NEW.last_action,NEW.version,NEW.updated_at,NEW.last_reason,
  CASE WHEN TG_OP='UPDATE' THEN OLD.status END,NEW.status,CASE WHEN TG_OP='UPDATE' THEN OLD.assigned_membership_id END,NEW.assigned_membership_id,
  CASE WHEN TG_OP='UPDATE' THEN OLD.due_at END,NEW.due_at,CASE WHEN TG_OP='UPDATE' THEN OLD.priority END,NEW.priority,
  CASE WHEN TG_OP='UPDATE' THEN OLD.due_timezone END,NEW.due_timezone,
  ARRAY(SELECT field FROM (VALUES
   ('title',TG_OP='INSERT' OR NEW.title IS DISTINCT FROM OLD.title),('description',TG_OP='INSERT' OR NEW.description IS DISTINCT FROM OLD.description),
   ('priority',TG_OP='INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority),('due',TG_OP='INSERT' OR (NEW.due_at,NEW.due_timezone) IS DISTINCT FROM (OLD.due_at,OLD.due_timezone)),
   ('assignee',TG_OP='INSERT' OR NEW.assigned_membership_id IS DISTINCT FROM OLD.assigned_membership_id),('status',TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
  ) fields(field,changed) WHERE changed));
 RETURN NEW;
END $$;
CREATE TRIGGER work_tasks_history AFTER INSERT OR UPDATE ON work_tasks FOR EACH ROW EXECUTE FUNCTION ekavio_work_task_history();
CREATE TRIGGER work_task_events_immutable BEFORE UPDATE OR DELETE ON work_task_events FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE TRIGGER work_task_commands_immutable BEFORE UPDATE OR DELETE ON work_task_commands FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
-- A successful fact version must retain exactly one command and trigger-created
-- history result. Checked at commit so failure anywhere rolls the entire command back.
CREATE FUNCTION ekavio_work_task_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM work_task_commands c JOIN work_task_events e ON e.id=c.event_id
   WHERE c.task_id=NEW.id AND c.organization_id=NEW.organization_id AND c.branch_id=NEW.branch_id
     AND c.resulting_version=NEW.version AND e.resulting_version=NEW.version
     AND e.actor_membership_id=c.actor_membership_id AND e.actor_membership_id=NEW.actor_membership_id
     AND c.command=CASE NEW.last_action WHEN 'task.created' THEN 'create' WHEN 'task.updated' THEN 'update'
       WHEN 'task.assigned' THEN 'update' WHEN 'task.cancelled' THEN 'cancel' WHEN 'task.reopened' THEN 'reopen' ELSE 'status' END)
 THEN RAISE EXCEPTION 'Task fact, command and history must commit together' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER work_tasks_complete AFTER INSERT OR UPDATE ON work_tasks
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ekavio_work_task_complete();
CREATE INDEX work_tasks_own_due ON work_tasks(organization_id,branch_id,assigned_membership_id,status,due_at,id);
CREATE INDEX work_tasks_team_due ON work_tasks(organization_id,branch_id,status,due_at,id);
CREATE INDEX work_tasks_recent ON work_tasks(organization_id,branch_id,created_at DESC,id);
CREATE INDEX work_task_history_scope ON work_task_events(organization_id,branch_id,task_id,resulting_version);
