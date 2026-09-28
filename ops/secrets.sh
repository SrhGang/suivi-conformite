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
#
#   ops/secrets.sh smtp            (ou sudo ops/secrets.sh smtp avec systemd-creds)
#       Enregistre le mot de passe du relais SMTP (clé API du fournisseur), saisi sans écho.
#       Sans relais configuré, smtp_password reste vide et les invitations ne partent pas par e-mail.
set -eu
cd "$(dirname "$0")/.."

NAMES="owner_db_password app_db_password app_secret"
STORE=/etc/credstore.encrypted

# Secrets chiffrés utilisés si SECRETS_DIR pointe vers /run/conformite.
uses_creds() { [ -f .env ] && grep -q '^SECRETS_DIR=/run/conformite' .env; }

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
    # Mot de passe SMTP : vide tant qu'aucun relais n'est configuré (ops/secrets.sh smtp).
    [ -e secrets/smtp_password ] || { : > secrets/smtp_password; echo "secrets/smtp_password créé (vide)"; }
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
    if [ -s secrets/smtp_password ] && [ ! -s "$STORE/conformite.smtp_password" ]; then
      tr -d '\n' < secrets/smtp_password | systemd-creds encrypt --name=smtp_password - "$STORE/conformite.smtp_password"
      chmod 600 "$STORE/conformite.smtp_password"
      echo "$STORE/conformite.smtp_password créé"
    fi
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

  smtp)
    printf 'Mot de passe SMTP (clé API du fournisseur) : '
    stty -echo 2> /dev/null || true
    IFS= read -r pass
    stty echo 2> /dev/null || true
    echo
    [ -n "$pass" ] || { echo "Saisie vide : rien n'a été modifié." >&2; exit 1; }
    if uses_creds; then
      [ "$(id -u)" = 0 ] || { echo "Secrets chiffrés : relancez avec sudo." >&2; exit 1; }
      printf '%s' "$pass" | systemd-creds encrypt --name=smtp_password - "$STORE/conformite.smtp_password"
      chmod 600 "$STORE/conformite.smtp_password"
      echo "$STORE/conformite.smtp_password enregistré. Redémarrez : sudo systemctl restart conformite"
    else
      umask 077
      mkdir -p secrets
      rm -f secrets/smtp_password
      printf '%s' "$pass" > secrets/smtp_password
      chmod 444 secrets/smtp_password
      echo "secrets/smtp_password enregistré. Redémarrez : docker compose up -d"
    fi
    ;;

  show)
    [ -n "${2:-}" ] || { echo "Usage : sudo ops/secrets.sh show {$(echo $NAMES smtp_password | tr ' ' '|')}" >&2; exit 1; }
    systemd-creds decrypt --name="$2" "$STORE/conformite.$2" -
    echo
    ;;

  *)
    echo "Usage : ops/secrets.sh generate | sudo ops/secrets.sh systemd-creds | ops/secrets.sh smtp | sudo ops/secrets.sh show NOM" >&2
    exit 1
    ;;
esac
