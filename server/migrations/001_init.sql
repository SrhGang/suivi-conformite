-- Schéma initial du suivi de conformité ISO 27001:2022 / NIS2-ANSSI.
--
-- Les entités métier (lacunes, remédiations, preuves) sont stockées en JSONB
-- au format exact des types TypeScript partagés (src/types.ts) : les règles
-- métier restent dans un seul code (src/store/actions.ts), exécuté côté
-- serveur dans une transaction sérialisée.

CREATE TABLE IF NOT EXISTS users (
  id                   text PRIMARY KEY,
  email                text NOT NULL,
  name                 text NOT NULL,
  initials             text NOT NULL,
  title                text NOT NULL DEFAULT '',
  role                 text NOT NULL CHECK (role IN ('responsable', 'contributeur', 'lecteur')),
  password_hash        text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  totp_secret          text,
  totp_enabled         boolean NOT NULL DEFAULT false,
  totp_last_step       bigint,
  disabled             boolean NOT NULL DEFAULT false,
  failed_attempts      integer NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_login_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Sessions côté serveur : seul le condensé SHA-256 du jeton est stocké.
CREATE TABLE IF NOT EXISTS sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stage        text NOT NULL CHECK (stage IN ('password_change', 'totp_enroll', 'totp', 'full')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Paramètres globaux : organisation, compteurs d'identifiants, jalons.
CREATE TABLE IF NOT EXISTS app_meta (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS gaps (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remediations (
  id         text PRIMARY KEY,
  gap_id     text NOT NULL REFERENCES gaps (id),
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remediations_gap_idx ON remediations (gap_id);

-- Les preuves retirées sont conservées (retrait logique) pour l'audit.
CREATE TABLE IF NOT EXISTS evidence (
  id         text PRIMARY KEY,
  gap_id     text NOT NULL REFERENCES gaps (id),
  data       jsonb NOT NULL,
  file_key   text,
  mime_type  text,
  removed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_gap_idx ON evidence (gap_id);

-- Journal d'audit : ajout seul, chaîné par SHA-256 (hash = H(prev_hash || contenu)).
CREATE TABLE IF NOT EXISTS history (
  seq       bigserial PRIMARY KEY,
  id        text NOT NULL UNIQUE,
  gap_id    text,
  date      timestamptz NOT NULL,
  user_id   text NOT NULL,
  action    text NOT NULL,
  details   text NOT NULL,
  prev_hash text NOT NULL,
  hash      text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS history_gap_idx ON history (gap_id);

CREATE OR REPLACE FUNCTION history_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est en ajout seul : % interdit', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS history_no_update ON history;
CREATE TRIGGER history_no_update BEFORE UPDATE OR DELETE ON history
  FOR EACH ROW EXECUTE FUNCTION history_is_append_only();

DROP TRIGGER IF EXISTS history_no_truncate ON history;
CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON history
  FOR EACH STATEMENT EXECUTE FUNCTION history_is_append_only();
