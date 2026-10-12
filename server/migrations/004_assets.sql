-- Module cartographie : actifs de l'infrastructure (contenu JSON, comme les lacunes).
CREATE TABLE IF NOT EXISTS assets (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conformite_app') THEN
    GRANT SELECT, INSERT, UPDATE ON assets TO conformite_app;
  END IF;
END
$$;
