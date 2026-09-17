-- Durable safety latch for the V2-05D authority direction. The row is inserted
-- only by the explicit commercial activation command after parity preflight.
CREATE TABLE commercial_runtime_authority (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  authority TEXT NOT NULL CHECK (authority = 'postgresql'),
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by TEXT NOT NULL CHECK (activated_by = 'v2-05d-cutover')
);
