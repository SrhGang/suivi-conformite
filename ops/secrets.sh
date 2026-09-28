#!/bin/sh
# Création des secrets de l'application (mots de passe PostgreSQL et clé applicative).
#
#   ops/secrets.sh generate
#       Fichiers dans ./secrets (répertoire 0700). Simple, mais les secrets sont en clair sur le disque.
#
#   sudo ops/secrets.sh systemd-creds
#       Secrets chiffrés avec systemd-creds dans /etc/credstore.encrypted (clé de la machine,
#       plus le TPM2 si la VM en a un). Ils ne sont déchiffrés qu'en mémoire (/run/conformite) par
#       le service ops/systemd/conformite.service. Reprend ./secrets s'il existe, puis l'efface.
#
#   sudo ops/secrets.sh show NOM
#       Affiche un secret chiffré (à copier dans votre coffre de mots de passe).
set -eu
cd "$(dirname "$0")/.."

NAMES="owner_db_password app_db_password app_secret"
STORE=/etc/credstore.encrypted

new_secret() { openssl rand -hex 32 | tr -d '\n'; }

case "${1:-}" in
  generate)
    umask 077
    mkdir -p secrets
    chmod 700 secrets
    for n in $NAMES; do
      if [ -s "secrets/$n" ]; then echo "secrets/$n existe déjà : conservé"; continue; fi
      new_secret > "secrets/$n"
      echo "secrets/$n créé"
    done
    # Lisibles par les utilisateurs des conteneurs ; le répertoire 0700 protège l'accès sur la VM.
    chmod 444 secrets/*
    ;;

  systemd-creds)
    [ "$(id -u)" = 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
    command -v systemd-creds > /dev/null || { echo "systemd-creds introuvable (systemd ≥ 250 requis)." >&2; exit 1; }
    mkdir -p "$STORE"
    chmod 700 "$STORE"
    for n in $NAMES; do
      out="$STORE/conformite.$n"
      if [ -s "$out" ]; then echo "$out existe déjà : conservé"; continue; fi
      if [ -s "secrets/$n" ]; then
        tr -d '\n' < "secrets/$n" | systemd-creds encrypt --name="$n" - "$out"
      else
        new_secret | systemd-creds encrypt --name="$n" - "$out"
      fi
      chmod 600 "$out"
      echo "$out créé"
    done
    if [ -d secrets ]; then
      command -v shred > /dev/null && shred -u secrets/* 2> /dev/null || rm -f secrets/*
      rmdir secrets
      echo "./secrets en clair supprimé"
    fi
    # Docker lira désormais les secrets déchiffrés en mémoire par le service systemd.
    if [ -f .env ] && grep -q '^SECRETS_DIR=' .env; then
      sed -i 's#^SECRETS_DIR=.*#SECRETS_DIR=/run/conformite#' .env
    elif [ -f .env ] && grep -q '^#SECRETS_DIR=' .env; then
      sed -i 's#^\#SECRETS_DIR=.*#SECRETS_DIR=/run/conformite#' .env
    else
      echo 'SECRETS_DIR=/run/conformite' >> .env
    fi
    echo ".env : SECRETS_DIR=/run/conformite activé. Installez ensuite ops/systemd/conformite.service."
    ;;

  show)
    [ -n "${2:-}" ] || { echo "Usage : sudo ops/secrets.sh show {$(echo $NAMES | tr ' ' '|')}" >&2; exit 1; }
    systemd-creds decrypt --name="$2" "$STORE/conformite.$2" -
    echo
    ;;

  *)
    echo "Usage : ops/secrets.sh generate | sudo ops/secrets.sh systemd-creds | sudo ops/secrets.sh show NOM" >&2
    exit 1
    ;;
esac
