# Déploiement en production

L'application tourne sur une VM Linux avec Docker Compose :

```
Internet ──443──▶ web (Caddy : HTTPS Let's Encrypt, en-têtes de sécurité, fichiers statiques)
                    └──▶ api (Node/Fastify : authentification, rôles, logique métier)
                           └──▶ db (PostgreSQL 16, rôle applicatif restreint)
```

Seuls les ports 80 et 443 sont exposés. La base et l'API ne sont joignables que sur le réseau Docker interne.

## 1. Choisir la VM

Besoins : 2 vCPU, 2 à 4 Go de RAM, 20 Go de disque. L'outil contient la liste des failles de l'organisme : hébergez-le **dans l'UE**.

| Offre | Ressources | Prix indicatif (sept. 2026) | Remarques |
|---|---|---|---|
| **Hetzner Cloud CX23** (Nuremberg, Falkenstein, Helsinki) | 2 vCPU, 4 Go, 40 Go, 20 To de trafic | ≈ 5,50 € / mois HT | Le moins cher. Facturation à l'heure, VM créées et détruites en une minute, réseau privé entre VM, pare-feu, snapshots et stockage objet. Idéal pour monter plusieurs VM |
| **OVHcloud VPS-1** (Gravelines, Strasbourg) | 4 vCore, 8 Go, 75 Go | ≈ 7,80 € / mois HT | Société française (argument de souveraineté). Facturation mensuelle, moins souple pour multiplier les VM |
| Google Cloud e2-micro gratuit (US) | 2 vCPU partagés, 1 Go | 0 € | **Déconseillé** : 1 Go est trop juste pour PostgreSQL + Node + Caddy, et l'hébergement aux États-Unis pose problème pour ce type de données |

Les prix changent souvent (hausses de 2026) : vérifiez-les avant de commander.

## 2. Préparer la VM (Debian 12 ou Ubuntu 24.04)

```bash
# Depuis votre poste : connexion par clé SSH uniquement
ssh root@IP_DE_LA_VM

adduser deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy: /home/deploy/.ssh
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

apt update && apt -y upgrade && apt -y install ufw unattended-upgrades git
ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
dpkg-reconfigure -plow unattended-upgrades

curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

> Docker publie ses ports en contournant `ufw`. Ici seuls 80 et 443 sont publiés, c'est voulu. Sur Hetzner ou OVH, activez aussi le pare-feu de l'hébergeur (22, 80, 443).

## 3. DNS

Créez un enregistrement `A` (et `AAAA` si IPv6) `conformite.votre-domaine.fr` → IP de la VM. Caddy obtient le certificat automatiquement au premier démarrage.

## 4. Installer l'application

```bash
sudo mkdir -p /opt/suivi-conformite && sudo chown deploy: /opt/suivi-conformite
git clone https://github.com/SrhGang/suivi-conformite.git /opt/suivi-conformite
cd /opt/suivi-conformite
cp .env.example .env && chmod 600 .env
# Renseignez DOMAIN, ACME_EMAIL, ORG_NAME, puis générez chaque secret :
openssl rand -base64 48   # OWNER_DB_PASSWORD
openssl rand -base64 48   # APP_DB_PASSWORD
openssl rand -base64 48   # APP_SECRET (chiffre les secrets TOTP : ne le perdez pas)
nano .env

docker compose up -d --build
docker compose ps           # api et db doivent être « healthy »
curl https://conformite.votre-domaine.fr/api/health
```

Les migrations de la base s'appliquent au démarrage de l'API.

## 5. Créer le premier compte

```bash
docker compose exec api node dist/cli.js create-user \
  --email rssi@votre-domaine.fr --name "Prénom Nom" --role responsable
```

Le mot de passe temporaire s'affiche une seule fois. À la première connexion, il faut le changer (12 caractères minimum) puis activer la double authentification (FreeOTP, Aegis, Microsoft/Google Authenticator…). Les comptes suivants se créent depuis la page **Administration › Utilisateurs**.

## 6. Sauvegardes

```bash
sudo mkdir -p /var/backups/conformite && sudo chown deploy: /var/backups/conformite
crontab -e
# 15 2 * * * cd /opt/suivi-conformite && ops/backup.sh >> /var/log/conformite-backup.log 2>&1
```

`ops/backup.sh` produit chaque nuit un dump PostgreSQL et une archive des preuves, conservés 14 jours (`RETENTION_DAYS`). **Copiez-les hors de la VM** (autre VM, Storage Box Hetzner, stockage objet) et chiffrez-les, par exemple avec `restic`. Sauvegardez aussi le fichier `.env` dans un coffre de mots de passe : sans `APP_SECRET`, les secrets TOTP ne sont plus lisibles.

Restauration :

```bash
docker compose exec -T db pg_restore -U conformite_owner -d conformite --clean --if-exists < db-AAAAMMJJ-HHMMSS.dump
docker compose exec -T api tar -C /data -xzf - < uploads-AAAAMMJJ-HHMMSS.tar.gz
```

Testez une restauration sur une VM de recette au moins une fois par trimestre.

## 7. Exploitation

| Besoin | Commande |
|---|---|
| Mettre à jour | `git pull && docker compose up -d --build` |
| Journaux | `docker compose logs -f api` |
| Vérifier l'intégrité du journal d'audit | bouton dans Administration, ou `docker compose exec api node dist/cli.js verify-history` |
| Débloquer / réinitialiser un compte | page Utilisateurs (« Réinitialiser l'accès ») |
| Charger la démo sur une VM de test | `docker compose exec api node dist/cli.js seed-demo` |

## 8. Passer à plusieurs VM

L'architecture le permet sans réécriture :

- **Recette + production** : deux VM identiques, chacune avec son `.env` et son domaine (`recette.` / `conformite.`).
- **Base séparée** : une VM PostgreSQL (ou une base managée) sur le réseau privé de l'hébergeur ; il suffit de changer `DATABASE_URL` et `DATABASE_ADMIN_URL`.
- **Plusieurs API derrière un répartiteur** : l'API est sans état (sessions en base, écritures sérialisées par un verrou PostgreSQL). Seules les preuves sont stockées sur disque local : il faudra alors les déplacer vers un stockage objet (S3 compatible) ou un volume partagé.
- **Supervision** : envoyer les journaux Docker vers votre SIEM (Wazuh, par exemple) et surveiller `/api/health`.

## Sécurité en place

- Comptes locaux, mots de passe hachés en Argon2id, verrouillage 15 min après 5 échecs, limitation à 10 requêtes/min sur l'authentification.
- Double authentification TOTP obligatoire (secret chiffré en AES-256-GCM, rejeu interdit).
- Sessions côté serveur (cookie `HttpOnly`, `Secure`, `SameSite=Strict`), expiration absolue et par inactivité, contrôle d'origine contre le CSRF.
- Droits vérifiés côté serveur pour chaque action (responsable, contributeur, lecteur).
- Journal d'audit en ajout seul (triggers + rôle SQL sans `UPDATE`/`DELETE`) chaîné par SHA-256 et vérifiable.
- HTTPS, HSTS, CSP stricte, polices hébergées localement (aucun appel à un service tiers).

Évolutions possibles : SSO (OIDC avec Entra ID, Keycloak…), stockage objet chiffré pour les preuves, antivirus sur les fichiers déposés.
