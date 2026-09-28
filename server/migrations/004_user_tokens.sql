-- Jetons d'invitation et de réinitialisation envoyés par e-mail.
-- Seul le condensé SHA-256 du jeton est stocké, comme pour les sessions.
CREATE TABLE IF NOT EXISTS user_tokens (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens (user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conformite_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_tokens TO conformite_app;
  END IF;
END
$$;
