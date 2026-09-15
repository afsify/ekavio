ALTER TABLE auth_sessions
  ADD COLUMN session_id VARCHAR(32),
  ADD COLUMN user_agent VARCHAR(512),
  ADD COLUMN ip_address VARCHAR(128);

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_session_id_unique UNIQUE (session_id),
  ADD CONSTRAINT auth_sessions_session_id_format CHECK (
    session_id IS NULL OR session_id ~ '^[0-9a-f]{32}$'
  ),
  ADD CONSTRAINT auth_sessions_credential_hash_format CHECK (
    credential_hash ~ '^[0-9a-f]{64}$'
  );

-- V2-05A deliberately created no session rows. Keeping the transition explicit
-- makes an unexpectedly populated database fail instead of inventing session IDs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth_sessions WHERE session_id IS NULL) THEN
    RAISE EXCEPTION 'auth_sessions contains legacy rows; refresh hashes must not be migrated';
  END IF;
END
$$;

ALTER TABLE auth_sessions
  ALTER COLUMN session_id SET NOT NULL;

CREATE INDEX auth_sessions_active_user_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
