-- Native optional purchasing; never grants a plan/subscription or creates stock.
ALTER TABLE module_definitions DROP CONSTRAINT module_definitions_key_check;
ALTER TABLE module_definitions ADD CONSTRAINT module_definitions_key_check CHECK(key IN ('ledger','inventory','attendance','queue','crm','purchasing'));
INSERT INTO module_definitions(key,display_name,description,category,commercial_type,status,version,created_at,updated_at)
 VALUES('purchasing','Suppliers & Purchasing','Supplier directory and purchase documents. Inventory access is independently required for item orders and receiving.','operations','purchasable','active',1,now(),now());
INSERT INTO add_ons(key,name,description,status,available,version,created_at,updated_at)
 VALUES('module-purchasing','Suppliers & Purchasing Module','Optional purchasing; receiving additionally requires Inventory access.','active',true,1,now(),now());
INSERT INTO add_on_modules(add_on_id,module_definition_id)
 SELECT a.id,m.id FROM add_ons a CROSS JOIN module_definitions m WHERE a.key='module-purchasing' AND m.key='purchasing';
ALTER TABLE organization_role_permissions DROP CONSTRAINT organization_role_permissions_permission_check;
ALTER TABLE organization_role_permissions ADD CONSTRAINT organization_role_permissions_permission_check CHECK(permission IN (
 'organization.read','organization.manage','branches.read','branches.manage','roles.read','roles.manage','audit.read',
 'customers.read','customers.manage','services.read','services.manage','staff.read','staff.manage','fields.read','fields.manage',
 'queue.read','queue.manage','inventory.read','inventory.manage','ledger.read','ledger.manage','attendance.read','attendance.manage',
 'crm.read','crm.manage','purchasing.read','purchasing.manage','reports.read','billing.read','billing.manage','corporate.manage'));

CREATE TABLE suppliers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),
 name VARCHAR(200) NOT NULL CHECK(name=btrim(name) AND length(name)>0),contact_name VARCHAR(200),phone VARCHAR(30),email VARCHAR(254),
 gstin VARCHAR(15) CHECK(gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
 address_line_1 VARCHAR(300),address_line_2 VARCHAR(300),city VARCHAR(100),state VARCHAR(100),country VARCHAR(100),postal_code VARCHAR(20),notes VARCHAR(2000),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id));
CREATE INDEX suppliers_directory ON suppliers(organization_id,status,lower(name),id);
CREATE TABLE purchase_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL,branch_id UUID NOT NULL,supplier_id UUID NOT NULL,
 human_reference VARCHAR(40) NOT NULL UNIQUE CHECK(human_reference ~ '^EV-PO-[A-F0-9]{32}$'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','partially_received','received','cancelled')),
 order_date DATE NOT NULL,expected_delivery_date DATE,notes VARCHAR(2000),currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),ordered_at TIMESTAMPTZ,cancelled_at TIMESTAMPTZ,
 UNIQUE(id,organization_id,branch_id),UNIQUE(id,organization_id),
 FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),
 FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id),
 CHECK((status IN ('ordered','partially_received','received') AND ordered_at IS NOT NULL) OR status IN ('draft','cancelled')),
 CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),CHECK(expected_delivery_date IS NULL OR expected_delivery_date>=order_date));
CREATE INDEX purchase_orders_branch_date ON purchase_orders(organization_id,branch_id,order_date DESC,id);
CREATE INDEX purchase_orders_supplier ON purchase_orders(organization_id,supplier_id,branch_id,status);
CREATE TABLE purchase_order_lines (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),purchase_order_id UUID NOT NULL,organization_id UUID NOT NULL,branch_id UUID NOT NULL,inventory_item_id UUID NOT NULL,
 item_name_snapshot VARCHAR(200) NOT NULL,sku_snapshot VARCHAR(100),unit_code_snapshot VARCHAR(16) NOT NULL,
 ordered_quantity NUMERIC(18,3) NOT NULL CHECK(ordered_quantity>0),unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor>=0),
 line_amount_minor BIGINT NOT NULL CHECK(line_amount_minor>=0 AND line_amount_minor=round(ordered_quantity*unit_price_minor)),
 display_order INTEGER NOT NULL CHECK(display_order BETWEEN 0 AND 49),
 UNIQUE(purchase_order_id,inventory_item_id),UNIQUE(purchase_order_id,display_order),
 UNIQUE(id,purchase_order_id,organization_id,branch_id,inventory_item_id),
 FOREIGN KEY(purchase_order_id,organization_id,branch_id) REFERENCES purchase_orders(id,organization_id,branch_id),
 FOREIGN KEY(inventory_item_id,organization_id) REFERENCES inventory_items(id,organization_id));
CREATE TABLE purchase_receipts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),purchase_order_id UUID NOT NULL,organization_id UUID NOT NULL,branch_id UUID NOT NULL,
 human_reference VARCHAR(40) NOT NULL UNIQUE CHECK(human_reference ~ '^EV-GR-[A-F0-9]{32}$'),
 idempotency_key VARCHAR(128) NOT NULL CHECK(length(idempotency_key)>0),command_fingerprint CHAR(64) NOT NULL CHECK(command_fingerprint ~ '^[0-9a-f]{64}$'),
 notes VARCHAR(2000),created_by UUID NOT NULL REFERENCES users(id),received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,idempotency_key),UNIQUE(id,purchase_order_id,organization_id,branch_id),
 FOREIGN KEY(purchase_order_id,organization_id,branch_id) REFERENCES purchase_orders(id,organization_id,branch_id));
CREATE INDEX purchase_receipts_branch_date ON purchase_receipts(organization_id,branch_id,received_at DESC,id);
CREATE TABLE purchase_receipt_lines (
 id UUID PRIMARY KEY,purchase_receipt_id UUID NOT NULL,purchase_order_id UUID NOT NULL,purchase_order_line_id UUID NOT NULL,
 organization_id UUID NOT NULL,branch_id UUID NOT NULL,inventory_item_id UUID NOT NULL,location_id UUID NOT NULL,
 quantity NUMERIC(18,3) NOT NULL CHECK(quantity>0),movement_id UUID NOT NULL UNIQUE,
 UNIQUE(purchase_receipt_id,purchase_order_line_id),UNIQUE(id,organization_id,branch_id,inventory_item_id,location_id),
 FOREIGN KEY(purchase_receipt_id,purchase_order_id,organization_id,branch_id) REFERENCES purchase_receipts(id,purchase_order_id,organization_id,branch_id),
 FOREIGN KEY(purchase_order_line_id,purchase_order_id,organization_id,branch_id,inventory_item_id) REFERENCES purchase_order_lines(id,purchase_order_id,organization_id,branch_id,inventory_item_id),
 FOREIGN KEY(movement_id,organization_id,branch_id,inventory_item_id,location_id) REFERENCES stock_movements(id,organization_id,branch_id,item_id,location_id));
ALTER TABLE stock_movements ADD COLUMN purchase_receipt_line_id UUID UNIQUE;
CREATE INDEX purchase_receipt_lines_order_line ON purchase_receipt_lines(purchase_order_line_id);
CREATE INDEX purchase_receipts_order_history ON purchase_receipts(purchase_order_id,received_at DESC,id);
ALTER TABLE stock_movements ADD FOREIGN KEY(purchase_receipt_line_id,organization_id,branch_id,item_id,location_id)
 REFERENCES purchase_receipt_lines(id,organization_id,branch_id,inventory_item_id,location_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE stock_movements ADD CHECK(purchase_receipt_line_id IS NULL OR movement_type='receive');
CREATE TABLE purchasing_activity_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES organizations(id),branch_id UUID,
 supplier_id UUID NOT NULL,purchase_order_id UUID,purchase_receipt_id UUID,actor_user_id UUID NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('supplier.created','supplier.updated','supplier.archived','supplier.reactivated','purchase.created','purchase.updated','purchase.ordered','purchase.cancelled','receipt.created','purchase.partially_received','purchase.received')),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(supplier_id,organization_id) REFERENCES suppliers(id,organization_id),
 FOREIGN KEY(branch_id,organization_id) REFERENCES branches(id,organization_id),
 FOREIGN KEY(purchase_order_id,organization_id,branch_id) REFERENCES purchase_orders(id,organization_id,branch_id),
 FOREIGN KEY(purchase_receipt_id,purchase_order_id,organization_id,branch_id) REFERENCES purchase_receipts(id,purchase_order_id,organization_id,branch_id),
 CHECK((purchase_order_id IS NULL AND purchase_receipt_id IS NULL AND branch_id IS NULL) OR (purchase_order_id IS NOT NULL AND branch_id IS NOT NULL)));
CREATE INDEX purchasing_activity_scope ON purchasing_activity_events(organization_id,supplier_id,branch_id,occurred_at DESC,id);
CREATE INDEX purchasing_activity_order ON purchasing_activity_events(purchase_order_id,occurred_at DESC,id);

CREATE FUNCTION ekavio_purchasing_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Purchasing history is append-only'; END; $$;
CREATE TRIGGER purchase_receipts_immutable BEFORE UPDATE OR DELETE ON purchase_receipts FOR EACH ROW EXECUTE FUNCTION ekavio_purchasing_immutable();
CREATE TRIGGER purchase_receipt_lines_immutable BEFORE UPDATE OR DELETE ON purchase_receipt_lines FOR EACH ROW EXECUTE FUNCTION ekavio_purchasing_immutable();
CREATE TRIGGER purchasing_activity_immutable BEFORE UPDATE OR DELETE ON purchasing_activity_events FOR EACH ROW EXECUTE FUNCTION ekavio_purchasing_immutable();
CREATE FUNCTION ekavio_supplier_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplier history cannot be deleted'; END IF;
 IF (NEW.id,NEW.organization_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Supplier identity or version is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER suppliers_guard BEFORE UPDATE OR DELETE ON suppliers FOR EACH ROW EXECUTE FUNCTION ekavio_supplier_guard();
CREATE FUNCTION ekavio_purchase_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Purchase history cannot be deleted'; END IF;
 IF (NEW.id,NEW.organization_id,NEW.branch_id,NEW.human_reference,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.branch_id,OLD.human_reference,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Purchase identity or version is immutable'; END IF;
 IF OLD.status<>'draft' AND (NEW.supplier_id,NEW.order_date,NEW.expected_delivery_date,NEW.notes,NEW.currency,NEW.ordered_at) IS DISTINCT FROM (OLD.supplier_id,OLD.order_date,OLD.expected_delivery_date,OLD.notes,OLD.currency,OLD.ordered_at) THEN RAISE EXCEPTION 'Ordered purchase snapshot is immutable'; END IF;
 IF NOT ((OLD.status='draft' AND NEW.status IN ('draft','ordered','cancelled')) OR (OLD.status='ordered' AND NEW.status IN ('partially_received','received','cancelled')) OR (OLD.status='partially_received' AND NEW.status IN ('partially_received','received'))) THEN RAISE EXCEPTION 'Invalid purchase lifecycle transition'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER purchase_orders_guard BEFORE UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_guard();
CREATE FUNCTION ekavio_purchase_line_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE po purchase_orders; item inventory_items;
BEGIN
 SELECT * INTO po FROM purchase_orders WHERE id=COALESCE(NEW.purchase_order_id,OLD.purchase_order_id) FOR UPDATE;
 IF po.status<>'draft' THEN RAISE EXCEPTION 'Only draft lines can change'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.purchase_order_id,NEW.organization_id,NEW.branch_id) IS DISTINCT FROM (OLD.id,OLD.purchase_order_id,OLD.organization_id,OLD.branch_id) THEN RAISE EXCEPTION 'Order line identity is immutable'; END IF;
 SELECT * INTO item FROM inventory_items WHERE id=NEW.inventory_item_id AND organization_id=NEW.organization_id FOR SHARE;
 IF item.id IS NULL OR item.status<>'active' OR item.unit_code<>NEW.unit_code_snapshot OR item.name<>NEW.item_name_snapshot OR item.sku IS DISTINCT FROM NEW.sku_snapshot THEN RAISE EXCEPTION 'Order item snapshot must match an active canonical item'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER purchase_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_line_guard();
CREATE FUNCTION ekavio_purchase_consistency() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE poid UUID; po purchase_orders; n BIGINT; total NUMERIC; received NUMERIC; complete BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='purchase_orders' THEN poid:=NEW.id; ELSIF TG_OP='DELETE' THEN poid:=OLD.purchase_order_id; ELSE poid:=NEW.purchase_order_id; END IF;
 SELECT * INTO po FROM purchase_orders WHERE id=poid FOR UPDATE;
 SELECT count(*),sum(line_amount_minor) INTO n,total FROM purchase_order_lines WHERE purchase_order_id=poid;
 IF n<1 OR n>50 OR total>9223372036854775807 THEN RAISE EXCEPTION 'Purchase line count or total is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id=poid AND l.ordered_quantity < (SELECT COALESCE(sum(r.quantity),0) FROM purchase_receipt_lines r WHERE r.purchase_order_line_id=l.id)) THEN RAISE EXCEPTION 'Receipt exceeds remaining ordered quantity'; END IF;
 SELECT COALESCE(sum(quantity),0) INTO received FROM purchase_receipt_lines WHERE purchase_order_id=poid;
 SELECT bool_and(l.ordered_quantity=(SELECT COALESCE(sum(r.quantity),0) FROM purchase_receipt_lines r WHERE r.purchase_order_line_id=l.id)) INTO complete FROM purchase_order_lines l WHERE l.purchase_order_id=poid;
 IF (received=0 AND po.status NOT IN ('draft','ordered','cancelled')) OR (received>0 AND NOT complete AND po.status<>'partially_received') OR (complete AND po.status<>'received') THEN RAISE EXCEPTION 'Purchase progress and receipts are inconsistent'; END IF;
 IF EXISTS(SELECT 1 FROM purchase_receipts r WHERE r.purchase_order_id=poid AND NOT EXISTS(SELECT 1 FROM purchase_receipt_lines l WHERE l.purchase_receipt_id=r.id)) THEN RAISE EXCEPTION 'Receipt must contain goods'; END IF;
 IF EXISTS(SELECT 1 FROM purchase_receipt_lines r JOIN stock_movements m ON m.id=r.movement_id WHERE r.purchase_order_id=poid AND (m.purchase_receipt_line_id IS DISTINCT FROM r.id OR m.quantity_delta<>r.quantity OR m.movement_type<>'receive')) THEN RAISE EXCEPTION 'Receipt must match its canonical stock movement'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER purchase_progress AFTER INSERT OR UPDATE ON purchase_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_consistency();
CREATE CONSTRAINT TRIGGER purchase_line_progress AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_consistency();
CREATE CONSTRAINT TRIGGER receipt_progress AFTER INSERT ON purchase_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_consistency();
CREATE CONSTRAINT TRIGGER receipt_line_progress AFTER INSERT ON purchase_receipt_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ekavio_purchase_consistency();
CREATE FUNCTION ekavio_purchasing_reversal_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.reverses_movement_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.reverses_movement_id AND purchase_receipt_line_id IS NOT NULL) THEN RAISE EXCEPTION 'Purchasing receipt cannot be independently reversed; explicit purchasing returns are deferred'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER stock_purchasing_reversal_guard BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION ekavio_purchasing_reversal_guard();
ALTER TABLE report_export_events DROP CONSTRAINT report_export_events_report_key_check;
ALTER TABLE report_export_events ADD CONSTRAINT report_export_events_report_key_check CHECK(report_key IN ('customers','services','appointments','queue','attendance','dues-balances','dues-journal','inventory','stock-movements','staff','crm-leads','crm-followups','purchase-orders','goods-received','supplier-purchases'));
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_widget_order_check;
ALTER TABLE dashboard_preferences ADD CONSTRAINT dashboard_preferences_widget_order_check CHECK(widget_order <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned','purchasing-open','purchasing-partial','purchasing-awaiting','purchasing-recent']::text[]);
ALTER TABLE dashboard_preferences DROP CONSTRAINT dashboard_preferences_hidden_widgets_check;
ALTER TABLE dashboard_preferences ADD CONSTRAINT dashboard_preferences_hidden_widgets_check CHECK(hidden_widgets <@ ARRAY['customers','services','queue','appointments','attendance','dues','inventory','staff','branches','roles','invitations','crm-active','crm-today','crm-overdue','crm-unassigned','purchasing-open','purchasing-partial','purchasing-awaiting','purchasing-recent']::text[]);
