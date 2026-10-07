-- Bounded organization metadata and typed entity values; no canonical backfill.
ALTER TABLE organization_role_permissions DROP CONSTRAINT organization_role_permissions_permission_check;
ALTER TABLE organization_role_permissions ADD CONSTRAINT organization_role_permissions_permission_check CHECK(permission IN (
 'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read',
 'customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage','fields.read','fields.manage',
 'queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage','attendance.read','attendance.manage',
 'reports.read','billing.read','billing.manage','corporate.manage'));
CREATE TABLE custom_field_definitions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('customer','service','appointment','inventory_item','membership')),
 key VARCHAR(64) NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,63}$'), label VARCHAR(100) NOT NULL CHECK(length(btrim(label))>0),
 help VARCHAR(500) NOT NULL DEFAULT '', field_type TEXT NOT NULL CHECK(field_type IN
 ('text','textarea','number','currency','date','datetime','email','phone','checkbox','select','multiselect','radio','url')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')), required BOOLEAN NOT NULL DEFAULT false,
 searchable BOOLEAN NOT NULL DEFAULT false, filterable BOOLEAN NOT NULL DEFAULT false, reportable BOOLEAN NOT NULL DEFAULT false,
 default_value JSONB, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,entity_type,key), UNIQUE(id,organization_id,entity_type,field_type), UNIQUE(id,organization_id)
);
CREATE TABLE custom_field_options (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), definition_id UUID NOT NULL, organization_id UUID NOT NULL,
 key VARCHAR(64) NOT NULL CHECK(key ~ '^[a-z][a-z0-9_]{0,63}$'), label VARCHAR(100) NOT NULL CHECK(length(btrim(label))>0),
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 99), status TEXT NOT NULL CHECK(status IN ('active','archived')),
 UNIQUE(definition_id,key), UNIQUE(id,definition_id,organization_id),
 FOREIGN KEY(definition_id,organization_id) REFERENCES custom_field_definitions(id,organization_id)
);
CREATE TABLE custom_field_entities (
 organization_id UUID NOT NULL, entity_type TEXT NOT NULL, entity_id UUID NOT NULL,
 customer_id UUID, service_id UUID, appointment_id UUID, inventory_item_id UUID, membership_id UUID,
 PRIMARY KEY(organization_id,entity_type,entity_id),
 CHECK(num_nonnulls(customer_id,service_id,appointment_id,inventory_item_id,membership_id)=1),
 CHECK((entity_type='customer' AND customer_id IS NOT NULL AND entity_id=customer_id) OR (entity_type='service' AND service_id IS NOT NULL AND entity_id=service_id)
 OR (entity_type='appointment' AND appointment_id IS NOT NULL AND entity_id=appointment_id) OR (entity_type='inventory_item' AND inventory_item_id IS NOT NULL AND entity_id=inventory_item_id)
 OR (entity_type='membership' AND membership_id IS NOT NULL AND entity_id=membership_id)),
 FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id),
 FOREIGN KEY(service_id,organization_id) REFERENCES services(id,organization_id),
 FOREIGN KEY(appointment_id,organization_id) REFERENCES appointments(id,organization_id),
 FOREIGN KEY(inventory_item_id,organization_id) REFERENCES inventory_items(id,organization_id),
 FOREIGN KEY(membership_id,organization_id) REFERENCES memberships(id,organization_id)
);
CREATE TABLE custom_field_values (
 organization_id UUID NOT NULL, entity_type TEXT NOT NULL, entity_id UUID NOT NULL, definition_id UUID NOT NULL,
 field_type TEXT NOT NULL, text_value TEXT, numeric_value NUMERIC(24,6), money_minor BIGINT, date_value DATE,
 timestamp_value TIMESTAMPTZ, boolean_value BOOLEAN, option_id UUID,
 PRIMARY KEY(organization_id,entity_type,entity_id,definition_id),
 UNIQUE(organization_id,entity_type,entity_id,definition_id,field_type),
 FOREIGN KEY(organization_id,entity_type,entity_id) REFERENCES custom_field_entities(organization_id,entity_type,entity_id),
 FOREIGN KEY(definition_id,organization_id,entity_type,field_type) REFERENCES custom_field_definitions(id,organization_id,entity_type,field_type),
 FOREIGN KEY(option_id,definition_id,organization_id) REFERENCES custom_field_options(id,definition_id,organization_id),
 CHECK((field_type='multiselect' AND num_nonnulls(text_value,numeric_value,money_minor,date_value,timestamp_value,boolean_value,option_id)=0)
 OR (num_nonnulls(text_value,numeric_value,money_minor,date_value,timestamp_value,boolean_value,option_id)=1 AND (
 (field_type IN ('text','email','phone','url') AND text_value IS NOT NULL AND length(text_value)<=1000)
 OR (field_type='textarea' AND text_value IS NOT NULL AND length(text_value)<=10000)
 OR (field_type='number' AND numeric_value IS NOT NULL) OR (field_type='currency' AND money_minor IS NOT NULL)
 OR (field_type='date' AND date_value IS NOT NULL) OR (field_type='datetime' AND timestamp_value IS NOT NULL)
 OR (field_type='checkbox' AND boolean_value IS NOT NULL) OR (field_type IN ('select','radio') AND option_id IS NOT NULL))))
);
CREATE TABLE custom_field_creation_requests (
 organization_id UUID NOT NULL, entity_type TEXT NOT NULL, retry_key VARCHAR(128) NOT NULL,
 entity_id UUID NOT NULL, fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(organization_id,entity_type,retry_key),
 FOREIGN KEY(organization_id,entity_type,entity_id) REFERENCES custom_field_entities(organization_id,entity_type,entity_id)
);
CREATE TABLE custom_field_selected_options (
 organization_id UUID NOT NULL, entity_type TEXT NOT NULL, entity_id UUID NOT NULL, definition_id UUID NOT NULL, option_id UUID NOT NULL,
 field_type TEXT NOT NULL DEFAULT 'multiselect' CHECK(field_type='multiselect'),
 PRIMARY KEY(organization_id,entity_type,entity_id,definition_id,option_id),
 FOREIGN KEY(organization_id,entity_type,entity_id,definition_id,field_type) REFERENCES custom_field_values(organization_id,entity_type,entity_id,definition_id,field_type) ON DELETE CASCADE,
 FOREIGN KEY(option_id,definition_id,organization_id) REFERENCES custom_field_options(id,definition_id,organization_id)
);
CREATE INDEX custom_field_values_lookup ON custom_field_values(organization_id,entity_type,definition_id,entity_id);
CREATE INDEX custom_field_values_number ON custom_field_values(organization_id,definition_id,numeric_value,entity_id) WHERE numeric_value IS NOT NULL;
CREATE INDEX custom_field_values_date ON custom_field_values(organization_id,definition_id,date_value,entity_id) WHERE date_value IS NOT NULL;
CREATE INDEX custom_field_values_option ON custom_field_values(organization_id,definition_id,option_id,entity_id) WHERE option_id IS NOT NULL;
CREATE TABLE form_layouts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('customer','service','appointment','inventory_item','membership')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE(organization_id,entity_type), UNIQUE(id,organization_id)
);
CREATE TABLE form_sections (
 id UUID PRIMARY KEY, layout_id UUID NOT NULL REFERENCES form_layouts(id), title VARCHAR(100) NOT NULL CHECK(length(btrim(title))>0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 19), UNIQUE(id,layout_id)
);
CREATE TABLE form_placements (
 layout_id UUID NOT NULL REFERENCES form_layouts(id), section_id UUID NOT NULL, key VARCHAR(64) NOT NULL,
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 99), visible BOOLEAN NOT NULL DEFAULT true,
 PRIMARY KEY(layout_id,key), FOREIGN KEY(section_id,layout_id) REFERENCES form_sections(id,layout_id)
);
CREATE TABLE field_admin_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), actor_user_id UUID NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('field.created','field.updated','field.archived','field.reactivated','field.options.updated','layout.updated','layout.reset','field.values.updated')),
 target_id UUID NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX field_admin_events_scope ON field_admin_events(organization_id,occurred_at DESC);
CREATE TRIGGER field_admin_events_append_only BEFORE UPDATE OR DELETE ON field_admin_events
 FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation();
CREATE FUNCTION ekavio_field_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.organization_id,NEW.entity_type,NEW.key,NEW.field_type) IS DISTINCT FROM (OLD.organization_id,OLD.entity_type,OLD.key,OLD.field_type)
 THEN RAISE EXCEPTION 'Field identity and type are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE ON custom_field_definitions FOR EACH ROW EXECUTE FUNCTION ekavio_field_identity_immutable();
CREATE FUNCTION ekavio_option_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.definition_id,NEW.organization_id,NEW.key) IS DISTINCT FROM (OLD.id,OLD.definition_id,OLD.organization_id,OLD.key)
 THEN RAISE EXCEPTION 'Option identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER custom_option_identity_immutable BEFORE UPDATE ON custom_field_options FOR EACH ROW EXECUTE FUNCTION ekavio_option_identity_immutable();
