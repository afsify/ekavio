-- Explicit presentation state, never inferred from missing prices.
ALTER TABLE public_offer_pricing ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'fixed'
  CHECK (pricing_mode IN ('fixed','contact'));
ALTER TABLE public_offer_pricing DROP CONSTRAINT public_offer_pricing_published_amount;
ALTER TABLE public_offer_pricing ADD CONSTRAINT public_offer_pricing_mode_amount CHECK (
  (pricing_mode='contact' AND monthly_price_minor IS NULL AND yearly_price_minor IS NULL)
  OR (pricing_mode='fixed' AND (NOT published OR monthly_price_minor IS NOT NULL OR yearly_price_minor IS NOT NULL))
);
ALTER TABLE public_offer_pricing_events ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'fixed'
  CHECK (pricing_mode IN ('fixed','contact'));

ALTER TABLE commercial_access_requests ADD COLUMN public_reference TEXT NOT NULL
  DEFAULT ('EV-REQ-' || UPPER(REPLACE(gen_random_uuid()::text,'-','')));
ALTER TABLE commercial_access_requests ADD CONSTRAINT commercial_access_requests_public_reference
  CHECK (public_reference ~ '^EV-REQ-[A-F0-9]{32}$');
CREATE UNIQUE INDEX commercial_access_requests_reference_unique ON commercial_access_requests(public_reference);
ALTER TABLE commercial_access_requests ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'fixed'
  CHECK (pricing_mode IN ('fixed','contact'));
ALTER TABLE commercial_access_requests ALTER COLUMN subtotal_minor DROP NOT NULL;
ALTER TABLE commercial_access_requests ADD CONSTRAINT commercial_access_requests_quote_mode CHECK (
  (pricing_mode='fixed' AND subtotal_minor IS NOT NULL)
  OR (pricing_mode='contact' AND subtotal_minor IS NULL)
);
ALTER TABLE commercial_agreements ALTER COLUMN list_subtotal_minor DROP NOT NULL;
ALTER TABLE commercial_agreements ADD CONSTRAINT commercial_agreements_contact_reason CHECK (
  list_subtotal_minor IS NOT NULL OR (adjustment_reason IS NOT NULL AND LENGTH(BTRIM(adjustment_reason))>=3)
);
CREATE FUNCTION ekavio_preserve_access_request_intent() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'access request history is retained'; END IF;
  IF ROW(NEW.public_reference,NEW.business_name,NEW.business_type,NEW.contact_name,NEW.contact_phone,
    NEW.normalized_phone,NEW.email,NEW.billing_cycle,NEW.selected_plan_key,NEW.selected_add_on_keys,
    NEW.currency,NEW.subtotal_minor,NEW.pricing_snapshot,NEW.public_note,NEW.created_at,NEW.pricing_mode)
    IS DISTINCT FROM ROW(OLD.public_reference,OLD.business_name,OLD.business_type,OLD.contact_name,
    OLD.contact_phone,OLD.normalized_phone,OLD.email,OLD.billing_cycle,OLD.selected_plan_key,
    OLD.selected_add_on_keys,OLD.currency,OLD.subtotal_minor,OLD.pricing_snapshot,OLD.public_note,
    OLD.created_at,OLD.pricing_mode) THEN RAISE EXCEPTION 'access request intent is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commercial_access_requests_intent_immutable BEFORE UPDATE OR DELETE
  ON commercial_access_requests FOR EACH ROW EXECUTE FUNCTION ekavio_preserve_access_request_intent();
