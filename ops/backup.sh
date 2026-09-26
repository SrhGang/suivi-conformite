#!/bin/sh
# Sauvegarde de la base PostgreSQL et des preuves déposées.
#   Usage : ops/backup.sh [répertoire]   (défaut : /var/backups/conformite)
#   Cron  : 15 2 * * * cd /opt/suivi-conformite && ops/backup.sh >> /var/log/conformite-backup.log 2>&1
# Conservation locale : RETENTION_DAYS jours (14 par défaut).
# Copiez ensuite le répertoire hors de la VM (rclone, restic, rsync vers une autre VM ou un stockage objet).
set -eu

cd "$(dirname "$0")/.."
DEST="${1:-/var/backups/conformite}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"
chmod 700 "$DEST"
umask 077

echo "[$(date -Is)] sauvegarde de la base"
docker compose exec -T db pg_dump -U conformite_owner -d conformite --format=custom > "$DEST/db-$STAMP.dump"

echo "[$(date -Is)] sauvegarde des preuves"
docker compose exec -T api tar -C /data -czf - uploads > "$DEST/uploads-$STAMP.tar.gz"

# Vérifie que l'archive de la base est lisible.
docker compose exec -T db pg_restore --list < "$DEST/db-$STAMP.dump" > /dev/null

find "$DEST" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Is)] terminé : $DEST/db-$STAMP.dump, $DEST/uploads-$STAMP.tar.gz"
