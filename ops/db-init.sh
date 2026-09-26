#!/bin/sh
# Exécuté une seule fois à la création du volume PostgreSQL.
# Crée le rôle applicatif aux droits restreints (pas d'UPDATE/DELETE sur le journal d'audit).
set -eu
APP_DB_PASSWORD="${APP_DB_PASSWORD:-$(cat /run/secrets/app_db_password)}"
psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE conformite_app LOGIN PASSWORD :'app_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO conformite_app', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
