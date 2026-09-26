#!/bin/sh
# Exécuté une seule fois à la création du volume PostgreSQL.
# Crée le rôle applicatif aux droits restreints (pas d'UPDATE/DELETE sur le journal d'audit).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE conformite_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO conformite_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
