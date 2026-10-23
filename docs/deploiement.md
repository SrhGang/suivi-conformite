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

## 1. Choisir la VM

Besoins de l'application : 2 vCPU, 2 à 4 Go de RAM, 20 Go de disque. L'outil contient la liste des failles de l'organisme, donc les données doivent rester **dans l'UE**.

| Offre | Ressources | Prix indicatif (sept. 2026) | Remarques |
|---|---|---|---|
| **Hetzner Cloud CX23** (recommandé) | 2 vCPU, 4 Go, 40 Go, 20 To de trafic | ≈ 5,50 € / mois HT | Le moins cher. Facturation à l'heure, VM créée ou détruite en une minute, réseau privé entre VM, pare-feu, snapshots |
| OVHcloud VPS-1 | 4 vCore, 8 Go, 75 Go | ≈ 7,80 € / mois HT | Société française. Facturation mensuelle, moins souple pour multiplier les VM |

Chaque VM supplémentaire (recette, base séparée, supervision…) coûte le prix d'une CX23. À la création, choisissez Debian 12 ou Ubuntu 24.04, un datacenter européen (Nuremberg, Falkenstein, Helsinki) et votre clé SSH. Attachez un **pare-feu Hetzner** : TCP 22 le temps de l'installation, puis uniquement UDP 41641 (connexions directes Tailscale) une fois l'étape « Fermer le pare-feu » terminée. Sans Tailscale, gardez 22, 80 et 443. L'option de sauvegarde Hetzner (+20 % du prix de la VM) fait une image quotidienne de la VM.

Les prix changent souvent : vérifiez-les avant de commander.

## 2. Préparer la VM

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

Déconnectez-vous puis reconnectez-vous avec `deploy` : l'appartenance au groupe `docker` n'est prise en compte qu'à la connexion suivante (sinon : `permission denied ... docker.sock`). Vérifiez aussitôt les droits de `deploy`, tant que la session root (ou la console de l'hébergeur) est encore disponible pour corriger :

```bash
groups      # doit contenir sudo et docker
sudo -v     # doit demander le mot de passe puis rendre la main sans erreur
```

### Tailscale (recommandé)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh            # --ssh : SSH via Tailscale, plus besoin du port 22 ouvert
tailscale ip -4               # IP 100.x.y.z de la VM
```

Sans navigateur sur la VM (installation scriptée, ou plusieurs VM), utilisez une clé d'authentification créée dans la console Tailscale (Settings › Keys › Generate auth key, à usage unique de préférence) et nommez la machine directement :

```bash
sudo tailscale up --ssh --auth-key=<VOTRE_CLE_AUTH> --hostname="conformite"
```

La clé donne accès au tailnet : ne la laissez ni dans un script versionné ni dans l'historique du shell (préfixez la commande d'une espace, ou utilisez `--auth-key=file:/chemin/vers/cle`), et révoquez-la après usage si elle est réutilisable.

Dans la console d'administration Tailscale :
- activez **MagicDNS** et **HTTPS Certificates** (DNS › HTTPS Certificates) ;
- renommez la machine, par exemple `conformite` (inutile si `--hostname` a été passé). Son nom devient `conformite.<votre-tailnet>.ts.net` ;
- restreignez l'accès dans la politique d'accès (ACL) : seuls les utilisateurs de l'outil ont accès à `tcp:443` sur cette machine.

Chaque utilisateur installe le client Tailscale sur son poste. Le plan gratuit Personal accepte 6 utilisateurs et un nombre illimité d'appareils.

> Les certificats `*.ts.net` sont publiés dans les journaux publics Certificate Transparency : le nom de la machine et celui du tailnet deviennent visibles. Choisissez des noms neutres.

Le pare-feu ne se ferme qu'à la fin de l'étape 3, une fois l'application en service.

### Sans Tailscale (domaine public)

Créez un enregistrement DNS `A`/`AAAA` vers l'IP publique et laissez `COMPOSE_FILE` et `BIND_ADDRESS` commentés dans `.env`.

## 3. Installer l'application

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
sudo ops/secrets.sh systemd-creds          # génère et chiffre les 3 secrets, active SECRETS_DIR dans .env
docker compose build
sudo cp ops/systemd/conformite.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now conformite
systemctl status conformite
curl https://conformite.<votre-tailnet>.ts.net/api/health
```

À chaque démarrage, le service :
1. déchiffre les secrets avec la clé de la machine ;
2. les copie dans `/run/conformite`, qui est en mémoire ;
3. lance la pile ;
4. efface les secrets à l'arrêt.

Ils ne sont donc jamais en clair sur le disque, ni dans `.env`, ni dans `docker inspect`. Les VM cloud n'ont pas de TPM : le chiffrement repose sur la clé `/var/lib/systemd/credential.secret`, lisible par root seulement. Il protège les secrets d'une fuite du dépôt, d'un `.env` copié par erreur ou d'une sauvegarde exposée sans cette clé, mais pas d'un attaquant déjà root sur la VM.

**Copiez les secrets dans votre coffre de mots de passe**, avec `sudo ops/secrets.sh show app_secret` (et de même pour `owner_db_password` et `app_db_password`). Sans `app_secret`, les doubles authentifications ne sont plus lisibles. Si la VM est reconstruite, les fichiers chiffrés sont illisibles sans l'ancienne clé : il faudra les recréer à partir du coffre.

### Secrets en fichiers (option simple)

```bash
ops/secrets.sh generate      # ./secrets, répertoire 0700
docker compose up -d --build
```

Les migrations de la base s'appliquent au démarrage de l'API.

### Fermer le pare-feu

À faire en dernier, connecté en `deploy` avec un `sudo` qui fonctionne (et par Tailscale avec l'option recommandée). Gardez une seconde session ouverte pendant l'opération : une erreur ici coupe l'accès à la VM.

```bash
# Tailscale : n'autoriser que le tailnet
sudo ufw allow in on tailscale0
# Domaine public : SSH et web
# sudo ufw allow 22/tcp && sudo ufw allow 80,443/tcp
sudo ufw default deny incoming
sudo ufw enable
```

Ouvrez une **nouvelle** session `ssh deploy@conformite` et lancez `sudo -v`. Si tout répond, fermez l'ancienne session. Avec Tailscale, retirez seulement alors la règle TCP 22 du pare-feu de l'hébergeur et gardez UDP 41641. La console web de l'hébergeur reste un accès de secours.

Docker publie ses ports en contournant `ufw` : c'est `BIND_ADDRESS` qui garantit que l'application n'écoute que sur l'IP Tailscale.

## 4. Créer le premier administrateur

```bash
docker compose exec api node dist/cli.js init --email admin@votre-domaine.fr --name "Prénom Nom"
```

La commande crée le compte **Administrateur** et refuse de s'exécuter si un administrateur existe déjà. Le mot de passe temporaire s'affiche une seule fois. À la première connexion, il faut le changer (12 caractères minimum) puis activer la double authentification (FreeOTP, Aegis, Microsoft ou Google Authenticator…).

L'administrateur gère les comptes et les rôles. Par défaut, il n'a que la consultation côté métier (rôle lecteur) : c'est la séparation des tâches, celui qui gère les accès ne valide pas les corrections. Dans une petite équipe où la même personne fait les deux, ajoutez `--role responsable`.

Ensuite, un assistant s'ouvre à la première connexion :
1. nom et secteur de l'organisme ;
2. données de départ : partir de zéro, ou d'une liste de lacunes courantes pour une entité NIS2, marquées « à confirmer » ;
3. création des comptes de l'équipe dans **Administration › Utilisateurs**, avec leur rôle : responsable validant, contributeur ou lecteur, et éventuellement administrateur.

Les **domaines e-mail de l'organisme** (préremplis avec celui du premier administrateur, modifiables dans la carte Organisme) servent à repérer les comptes externes : une adresse d'un autre domaine (consultant, auditeur, prestataire) reste autorisée, mais un avertissement s'affiche à la création et le compte porte le badge « Externe », utile pour la revue des droits d'accès.

En cas de perte d'accès de tous les administrateurs : `docker compose exec api node dist/cli.js grant-admin --email E`.

### Invitations par e-mail (recommandé)

Sans configuration, la création d'un compte affiche un mot de passe temporaire que l'administrateur transmet lui-même. Avec un relais SMTP, l'utilisateur reçoit à la place un **lien à usage unique, valable 24 h**, pour choisir son mot de passe puis configurer la double authentification. L'administrateur ne voit jamais le mot de passe. « Réinitialiser l'accès » envoie de même un lien par e-mail.

1. Chez un fournisseur d'envoi (Resend, Brevo, Scaleway TEM, Microsoft 365…), déclarez le domaine expéditeur et ajoutez les enregistrements DNS qu'il indique (SPF, DKIM, et DMARC `v=DMARC1; p=none;` pour commencer). Créez une clé limitée à l'envoi.
2. Dans `.env` :
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_FROM=Conformité <no-reply@votre-domaine.fr>
   INVITE_ACCESS_NOTE=Installez Tailscale et acceptez l'invitation au réseau avant d'ouvrir le lien.
   ```
   Le port 587 impose STARTTLS et le port 465 le TLS direct : rien ne part en clair. `INVITE_ACCESS_NOTE` explique à l'invité comment joindre l'application (Tailscale, OpenVPN, réseau interne…), puisque le lien n'est accessible que depuis ce réseau.
3. Enregistrez la clé : `ops/secrets.sh smtp` (ou `sudo ops/secrets.sh smtp` avec systemd-creds), puis redémarrez.
4. Dans **Administration › Utilisateurs**, cliquez sur **Tester l'envoi d'e-mail**.

En ligne de commande, `init` et `create-user` acceptent `--invite` : le lien est envoyé par e-mail au lieu d'afficher un mot de passe temporaire (si l'envoi échoue, le compte n'est pas créé et la commande peut être relancée).

Mise à jour d'une installation existante : relancez une fois `ops/secrets.sh generate` (ou copiez à nouveau `ops/systemd/conformite.service` si vous utilisez systemd-creds) pour créer le secret `smtp_password`, même vide.

## 5. Sauvegardes

```bash
sudo mkdir -p /var/backups/conformite && sudo chown deploy: /var/backups/conformite
crontab -e
# 15 2 * * * cd /opt/suivi-conformite && ops/backup.sh >> /var/log/conformite-backup.log 2>&1
```

`ops/backup.sh` produit chaque nuit un dump PostgreSQL et une archive des preuves, conservés 14 jours (`RETENTION_DAYS`). Les sauvegardes Hetzner de la VM viennent en complément.

**Copiez-les hors de la VM** (Storage Box Hetzner, stockage objet, autre VM) et chiffrez-les, par exemple avec `restic`. La perte de la VM ne doit pas emporter les sauvegardes.

Restauration :

```bash
docker compose exec -T db pg_restore -U conformite_owner -d conformite --clean --if-exists < db-AAAAMMJJ-HHMMSS.dump
docker compose exec -T api tar -C /data -xzf - < uploads-AAAAMMJJ-HHMMSS.tar.gz
```

Testez une restauration dans une VM de recette au moins une fois par trimestre.

## 6. Exploitation

| Besoin | Commande |
|---|---|
| Mettre à jour | `git pull && docker compose build && sudo systemctl restart conformite` (option simple : `git pull && docker compose up -d --build`) |
| Journaux | `docker compose logs -f api` · `journalctl -u conformite` |
| Vérifier l'intégrité du journal d'audit | bouton dans Administration, ou `docker compose exec api node dist/cli.js verify-history` |
| Débloquer ou réinitialiser un compte | page Utilisateurs (« Réinitialiser l'accès ») |
| Charger la démo dans une VM de test | `docker compose exec api node dist/cli.js seed-demo` |

## 7. Plusieurs VM

- **Recette et production** : créez une seconde VM (ou une VM à partir d'un snapshot), puis donnez-lui son nom Tailscale (`conformite-recette`) et **ses propres secrets** (`sudo rm /etc/credstore.encrypted/conformite.*` puis `sudo ops/secrets.sh systemd-creds`, sur une base vide).
- **Base séparée** : une VM PostgreSQL sur le réseau privé Hetzner ou le tailnet ; changez `DATABASE_URL` et `DATABASE_ADMIN_URL` dans `docker-compose.yml`.
- **Plusieurs API derrière un répartiteur** : l'API est sans état (sessions en base, écritures sérialisées par un verrou PostgreSQL). Seules les preuves sont sur disque local : il faudra les déplacer vers un stockage objet compatible S3 (Hetzner Object Storage, par exemple).
- **Supervision** : envoyez les journaux (`journalctl`, Docker) vers votre SIEM (un agent Wazuh dans chaque VM, par exemple) et surveillez `/api/health`.

## Sécurité en place

- Comptes locaux, mots de passe hachés en Argon2id, verrouillage de 15 min après 5 échecs, limite de 10 requêtes/min sur l'authentification.
- Double authentification TOTP obligatoire (secret chiffré en AES-256-GCM, rejeu interdit).
- Invitations par e-mail : lien à usage unique valable 24 h, jeton stocké haché, transmis dans le fragment de l'URL (absent des journaux), mot de passe connu du seul utilisateur.
- Sessions côté serveur (cookie `HttpOnly`, `Secure`, `SameSite=Strict`), expiration absolue et par inactivité, contrôle d'origine contre le CSRF.
- Droits vérifiés côté serveur pour chaque action (responsable, contributeur, lecteur).
- Journal d'audit en ajout seul (triggers + rôle SQL sans `UPDATE`/`DELETE`), chaîné par SHA-256 et vérifiable.
- HTTPS, HSTS, CSP stricte, polices hébergées localement (aucun appel à un service tiers).
- Secrets en fichiers Docker, chiffrés au repos avec systemd-creds (option recommandée), accès réseau limité au tailnet.

Évolutions possibles : SSO (OIDC avec Entra ID, Keycloak…), stockage objet chiffré pour les preuves, antivirus sur les fichiers déposés.
