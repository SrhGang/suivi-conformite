-- Rôle Administrateur distinct des rôles métier (séparation des tâches) et
-- suivi de l'assistant de première installation.
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Installations existantes : les responsables validants gardent la gestion des comptes.
UPDATE users SET is_admin = true WHERE role = 'responsable';

-- Une base déjà utilisée n'a pas besoin de l'assistant d'installation.
INSERT INTO app_meta (key, value)
SELECT 'setup', jsonb_build_object('completed', true, 'migrated', true)
WHERE EXISTS (SELECT 1 FROM gaps)
ON CONFLICT (key) DO NOTHING;
