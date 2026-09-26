-- Droits du rôle applicatif « conformite_app » (créé par ops/db-init.sh).
-- L'application ne peut qu'ajouter au journal d'audit : ni UPDATE, ni DELETE,
-- ni TRUNCATE, en plus du trigger qui les interdit à tous.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conformite_app') THEN
    GRANT USAGE ON SCHEMA public TO conformite_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, app_meta, gaps, remediations, evidence TO conformite_app;
    GRANT SELECT ON schema_migrations TO conformite_app;
    GRANT SELECT, INSERT ON history TO conformite_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON history FROM conformite_app;
    GRANT USAGE, SELECT ON SEQUENCE history_seq_seq TO conformite_app;
  END IF;
END
$$;
