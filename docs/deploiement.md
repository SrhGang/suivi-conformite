# Déploiement en production

L'application tourne dans une VM Linux avec Docker Compose :

```
Utilisateur ──(Tailscale ou Internet, 443)──▶ web (Caddy : HTTPS, en-têtes de sécurité, fichiers statiques)
                                                └──▶ api (Node/Fastify : authentification, rôles, logique métier)
                                                       └──▶ db (PostgreSQL 16, rôle applicatif restreint)
```

La base et l'API ne sont joignables que sur le réseau Docker interne. Les mots de passe et la clé applicative sont des **secrets Docker** (fichiers montés dans `/run/secrets`), jamais des variables d'environnement.

Deux choix indépendants :

| | Option simple | Option recommandée |
|---|---|---|
| **Accès** | Domaine public + Let's Encrypt (ports 80/443 ouverts) | **Tailscale** : nom MagicDNS `*.ts.net`, rien d'exposé sur Internet |
| **Secrets** | Fichiers dans `./secrets` (en clair, répertoire 0700) | **systemd-creds** : chiffrés au repos, déchiffrés en mémoire au démarrage |

## 1. Où faire tourner les VM

Besoins de l'application : 2 vCPU, 2 à 4 Go de RAM, 20 Go de disque. L'outil contient la liste des failles de l'organisme, donc les données doivent rester **dans l'UE**.

| Solution | Coût (sept. 2026) | Nombre de VM | Pour qui |
|---|---|---|---|
| **Mini-PC chez vous + Proxmox** (Intel N100/N150, 16–32 Go, SSD NVMe) | 150–300 € une fois + ≈ 2 €/mois d'électricité (6–10 W) | 4 à 8 petites VM | Le moins cher dans la durée. Avec Tailscale, aucun port à ouvrir sur la box. Dépend de votre connexion et de votre courant |
| **Serveur dédié Hetzner (Server Auction) + Proxmox** | à partir de ≈ 39 €/mois, sans frais d'installation | 10 à 20 VM (souvent 64 Go de RAM) | Hébergé en datacenter (Allemagne, Finlande), fiable. Rentable dès ≈ 7 VM |
| Kimsufi (OVHcloud) + Proxmox | à partir de ≈ 10 € HT/mois | quelques VM (matériel modeste) | Français, mais peu de RAM sur l'entrée de gamme |
| VM cloud Hetzner CX23 (sans Proxmox) | ≈ 5,50 €/mois par VM | 1 VM = 1 abonnement | Le plus simple tant que vous avez moins de 5–6 VM |

**Recommandation** : pour monter plusieurs VM au moindre coût, installez Proxmox sur un mini-PC chez vous si votre connexion est stable. Sinon, prenez un serveur de la Server Auction Hetzner. Dans les deux cas, Tailscale donne l'accès sans IP publique par VM : sur un dédié, vous n'avez donc pas à louer d'IP supplémentaires, et les VM restent derrière un pont NAT.

Les prix changent souvent : vérifiez-les avant de commander.

## 2. Proxmox

1. Installez Proxmox VE sur l'hôte. Chez Hetzner, passez par l'image Debian de `installimage`, puis ajoutez le dépôt Proxmox.
2. Mettez l'interface Proxmox (port 8006) **derrière Tailscale** : installez Tailscale sur l'hôte et bloquez le port 8006 côté Internet (pare-feu Proxmox ou pare-feu Hetzner).
3. Sur un dédié, créez un pont NAT privé (`vmbr1`, par ex. 10.10.10.0/24) pour les VM.
4. Créez la VM de l'application :
   - Debian 12 ou Ubuntu 24.04, 2 vCPU, 4 Go de RAM, 30 Go de disque, type de CPU `host` ;
   - **Matériel › Ajouter › TPM State (v2.0)** : systemd-creds liera alors le chiffrement des secrets à ce TPM virtuel ;
   - activez l'agent QEMU et les sauvegardes Proxmox (`vzdump`) de la VM.

## 3. Préparer la VM

```bash
adduser deploy && usermod -aG sudo deploy
# Copiez votre clé SSH dans /home/deploy/.ssh/authorized_keys, puis :
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

apt update && apt -y upgrade && apt -y install ufw unattended-upgrades git openssl
dpkg-reconfigure -plow unattended-upgrades
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

### Tailscale (recommandé)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh            # --ssh : SSH via Tailscale, plus besoin du port 22 ouvert
tailscale ip -4               # IP 100.x.y.z de la VM
```

Dans la console d'administration Tailscale :
- activez **MagicDNS** et **HTTPS Certificates** (DNS › HTTPS Certificates) ;
- renommez la machine, par exemple `conformite`. Son nom devient `conformite.<votre-tailnet>.ts.net` ;
- restreignez l'accès dans la politique d'accès (ACL) : seuls les utilisateurs de l'outil ont accès à `tcp:443` sur cette machine.

Chaque utilisateur installe le client Tailscale sur son poste. Le plan gratuit Personal accepte 6 utilisateurs et un nombre illimité d'appareils.

> Les certificats `*.ts.net` sont publiés dans les journaux publics Certificate Transparency : le nom de la machine et celui du tailnet deviennent visibles. Choisissez des noms neutres.

Pare-feu : n'autorisez que le tailnet. Avant de l'activer, reconnectez-vous par Tailscale (`ssh deploy@conformite`) pour ne pas perdre votre session. La console Proxmox reste un accès de secours.

```bash
ufw default deny incoming
ufw allow in on tailscale0
ufw enable
```

Docker publie ses ports en contournant `ufw` : c'est `BIND_ADDRESS` (étape 4) qui garantit que l'application n'écoute que sur l'IP Tailscale.

### Sans Tailscale (domaine public)

Créez un enregistrement DNS `A`/`AAAA` vers l'IP publique, ouvrez 80 et 443 (`ufw allow 80,443/tcp`) et laissez `COMPOSE_FILE` et `BIND_ADDRESS` commentés dans `.env`.

## 4. Installer l'application

```bash
sudo mkdir -p /opt/suivi-conformite && sudo chown deploy: /opt/suivi-conformite
git clone https://github.com/SrhGang/suivi-conformite.git /opt/suivi-conformite
cd /opt/suivi-conformite
cp .env.example .env && chmod 600 .env
nano .env
```

Pour Tailscale, le fichier `.env` contient :

```
DOMAIN=conformite.<votre-tailnet>.ts.net
ORG_NAME=…
COMPOSE_FILE=docker-compose.yml:ops/compose.tailscale.yml
BIND_ADDRESS=100.x.y.z
SECRETS_DIR=/run/conformite
```

`ops/compose.tailscale.yml` donne à Caddy l'accès au socket `tailscaled`. Caddy obtient alors lui-même le certificat du nom `*.ts.net`, sans Let's Encrypt ni port ouvert.

### Secrets chiffrés avec systemd-creds (recommandé)

```bash
sudo ops/secrets.sh systemd-creds          # génère et chiffre les 3 secrets dans /etc/credstore.encrypted
docker compose build
sudo cp ops/systemd/conformite.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now conformite
systemctl status conformite
curl https://conformite.<votre-tailnet>.ts.net/api/health
```

À chaque démarrage, le service :
1. déchiffre les secrets (clé de la machine + TPM virtuel) ;
2. les copie dans `/run/conformite`, qui est en mémoire ;
3. lance la pile ;
4. efface les secrets à l'arrêt.

Ils ne sont donc jamais en clair sur le disque, ni dans `.env`, ni dans `docker inspect`. Si `systemd-creds has-tpm2` indique qu'il n'y a pas de TPM, le chiffrement repose sur la seule clé `/var/lib/systemd/credential.secret`.

**Copiez les secrets dans votre coffre de mots de passe**, avec `sudo ops/secrets.sh show app_secret` (et de même pour `owner_db_password` et `app_db_password`). Sans `app_secret`, les doubles authentifications ne sont plus lisibles. Si la VM est restaurée sans son TPM, les fichiers chiffrés sont illisibles : il faudra les recréer à partir du coffre.

### Secrets en fichiers (option simple)

```bash
ops/secrets.sh generate      # ./secrets, répertoire 0700
docker compose up -d --build
```

Les migrations de la base s'appliquent au démarrage de l'API.

## 5. Créer le premier compte

```bash
docker compose exec api node dist/cli.js create-user \
  --email rssi@votre-domaine.fr --name "Prénom Nom" --role responsable
```

Le mot de passe temporaire s'affiche une seule fois. À la première connexion, il faut le changer (12 caractères minimum) puis activer la double authentification (FreeOTP, Aegis, Microsoft ou Google Authenticator…). Les comptes suivants se créent depuis la page **Administration › Utilisateurs**.

## 6. Sauvegardes

```bash
sudo mkdir -p /var/backups/conformite && sudo chown deploy: /var/backups/conformite
crontab -e
# 15 2 * * * cd /opt/suivi-conformite && ops/backup.sh >> /var/log/conformite-backup.log 2>&1
```

`ops/backup.sh` produit chaque nuit un dump PostgreSQL et une archive des preuves, conservés 14 jours (`RETENTION_DAYS`). Les sauvegardes Proxmox de la VM viennent en complément. Pour aller plus loin, installez Proxmox Backup Server dans une VM ou sur une autre machine.

**Gardez aussi une copie hors de l'hôte Proxmox** : Storage Box Hetzner, autre site, ou disque externe. Chiffrez-la, par exemple avec `restic`. Une panne ou un vol de l'hôte ne doit pas emporter les sauvegardes.

Restauration :

```bash
docker compose exec -T db pg_restore -U conformite_owner -d conformite --clean --if-exists < db-AAAAMMJJ-HHMMSS.dump
docker compose exec -T api tar -C /data -xzf - < uploads-AAAAMMJJ-HHMMSS.tar.gz
```

Testez une restauration dans une VM de recette (clonée dans Proxmox) au moins une fois par trimestre.

## 7. Exploitation

| Besoin | Commande |
|---|---|
| Mettre à jour | `git pull && docker compose build && sudo systemctl restart conformite` (option simple : `git pull && docker compose up -d --build`) |
| Journaux | `docker compose logs -f api` · `journalctl -u conformite` |
| Vérifier l'intégrité du journal d'audit | bouton dans Administration, ou `docker compose exec api node dist/cli.js verify-history` |
| Débloquer ou réinitialiser un compte | page Utilisateurs (« Réinitialiser l'accès ») |
| Charger la démo dans une VM de test | `docker compose exec api node dist/cli.js seed-demo` |

## 8. Plusieurs VM

- **Recette et production** : clonez la VM dans Proxmox, puis donnez au clone son nom Tailscale (`conformite-recette`) et **ses propres secrets** (`sudo rm /etc/credstore.encrypted/conformite.*` puis `sudo ops/secrets.sh systemd-creds`, sur une base vide).
- **Base séparée** : une VM PostgreSQL sur le pont privé ou le tailnet ; changez `DATABASE_URL` et `DATABASE_ADMIN_URL` dans `docker-compose.yml`.
- **Plusieurs API derrière un répartiteur** : l'API est sans état (sessions en base, écritures sérialisées par un verrou PostgreSQL). Seules les preuves sont sur disque local : il faudra les déplacer vers un stockage objet compatible S3 (MinIO dans une VM, par exemple).
- **Supervision** : envoyez les journaux (`journalctl`, Docker) vers votre SIEM (un agent Wazuh dans chaque VM, par exemple) et surveillez `/api/health`.

## Sécurité en place

- Comptes locaux, mots de passe hachés en Argon2id, verrouillage de 15 min après 5 échecs, limite de 10 requêtes/min sur l'authentification.
- Double authentification TOTP obligatoire (secret chiffré en AES-256-GCM, rejeu interdit).
- Sessions côté serveur (cookie `HttpOnly`, `Secure`, `SameSite=Strict`), expiration absolue et par inactivité, contrôle d'origine contre le CSRF.
- Droits vérifiés côté serveur pour chaque action (responsable, contributeur, lecteur).
- Journal d'audit en ajout seul (triggers + rôle SQL sans `UPDATE`/`DELETE`), chaîné par SHA-256 et vérifiable.
- HTTPS, HSTS, CSP stricte, polices hébergées localement (aucun appel à un service tiers).
- Secrets en fichiers Docker, chiffrés au repos avec systemd-creds (option recommandée), accès réseau limité au tailnet.

Évolutions possibles : SSO (OIDC avec Entra ID, Keycloak…), stockage objet chiffré pour les preuves, antivirus sur les fichiers déposés.
