-- Échecs de code TOTP comptés à part des échecs de mot de passe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_failed_attempts integer NOT NULL DEFAULT 0;
