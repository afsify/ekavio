-- Durable safety latch for the V2-06B2 operational authority direction. The
-- row is inserted only by the explicit activation command after migration
-- reconciliation and cutover preflight succeed.
CREATE TABLE operational_runtime_authority (
  vertical TEXT PRIMARY KEY
    CHECK (vertical = 'customer_service_appointment_queue'),
  authority TEXT NOT NULL CHECK (authority = 'postgresql'),
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by TEXT NOT NULL CHECK (activated_by = 'v2-06b2-cutover')
);
