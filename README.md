# Suivi de conformité ISO 27001:2022 / NIS2-ANSSI

Application React + TypeScript qui sert à recenser les mesures de cybersécurité non appliquées dans un organisme et à suivre leur correction jusqu'à la validation. Il sert aussi de document vivant : ce document est mis à jour à chaque action et peut être exporté.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires de la logique métier (Vitest)
npm run typecheck  # vérification TypeScript (mode strict)
npm run build    # vérification TypeScript puis build de production dans dist/
```

Pour produire la version en ligne (page unique autonome, hébergeable comme page claude.ai) :

```bash
npm run build:artifact   # → artifact/suivi-conformite.html
```

Dans cette version, la navigation se fait en mémoire (sans URL) et, les téléchargements y étant bloqués, les exports (rapport, CSV, sauvegarde JSON) s'affichent dans une fenêtre avec un bouton « Copier ».

Les données sont stockées dans le `localStorage` du navigateur. Au premier lancement, un jeu de démonstration est chargé : un organisme fictif du secteur de l'eau, entité essentielle NIS2, avec 26 lacunes, 32 remédiations et 11 preuves. Le pied de page permet d'exporter ou d'importer une sauvegarde JSON et de réinitialiser la démo.

## Mode production (serveur)

L'application existe en deux modes :

- **démo** (`npm run dev`, version en ligne) : données dans le navigateur, sélecteur de rôle simulé ;
- **production** (`VITE_BACKEND=api`) : API Node/Fastify + PostgreSQL dans `server/`, comptes avec double authentification TOTP obligatoire, droits vérifiés côté serveur, preuves stockées sur disque, journal d'audit en ajout seul et chaîné (SHA-256).

La logique métier (`src/store/actions.ts`) est la même dans les deux modes : le serveur l'exécute sous un verrou PostgreSQL.

```bash
# Développement avec le serveur (PostgreSQL local requis)
cd server && npm install
DATABASE_URL=postgres://… APP_SECRET=$(openssl rand -hex 32) PUBLIC_ORIGIN=http://localhost:5173 COOKIE_SECURE=false npm run dev
npm run cli -- create-user --email moi@exemple.fr --name "Moi" --role responsable
cd .. && npm run dev:api        # le proxy Vite redirige /api vers :3000

# Tests du serveur (base de test dédiée, voir server/test/api.test.ts)
cd server && TEST_DATABASE_ADMIN_URL=… TEST_DATABASE_URL=… npm test
```

Déploiement sur une VM (Proxmox, Tailscale, secrets chiffrés avec systemd-creds, Docker Compose, sauvegardes, choix de l'hébergeur) : voir **[docs/deploiement.md](docs/deploiement.md)**. La CI GitHub Actions (`.github/workflows/ci.yml`) vérifie les types, lance les tests front et serveur (avec PostgreSQL) et construit les images Docker.

## Pages

| Route | Page | Contenu |
|---|---|---|
| `/` | Tableau de bord | 4 KPI cliquables, score pondéré (anneau), score par thème ISO, répartition par criticité et par statut, alertes prioritaires, actions rapides, activité récente, export du rapport |
| `/lacunes` | Inventaire | Recherche plein texte, filtres (criticité, thème, statut, NIS2, en retard, archivées), tri par colonne, pagination par 20, menu Dupliquer / Archiver / Restaurer, export CSV. Les filtres sont conservés dans l'URL |
| `/lacunes/:id` | Détail | Onglets Détails / Remédiations / Preuves & validation / Historique, statut enregistré automatiquement, panneau de métadonnées, édition, duplication, archivage, revue périodique |
| `/roadmap` | Roadmap | Vue Gantt (déplacer une barre ou étirer son bord droit pour changer les dates, jalons, ligne « aujourd'hui », périodes 6/12/18 mois ou tout) et vue Kanban (glisser-déposer entre À faire, En cours, Bloqué et Validé) |
| `/referentiel` | Référentiel | Les 93 mesures de l'annexe A, l'état de chacune et la couverture des exigences NIS2 (art. 20, 21.2 a–j, 23) |
| `/utilisateurs` | Utilisateurs | Production uniquement, responsable validant : création de comptes, rôles, désactivation, réinitialisation de l'accès |

## Règles métier

- **Score global** : Σ(poids × avancement) / Σ(poids). Les poids sont Critique ×4, Haute ×3, Moyenne ×2, Basse ×1. L'avancement d'une lacune vaut 0 % si elle est non traitée, 10 à 75 % si elle est en cours (moyenne de ses remédiations), 80 % si elle est corrigée et 100 % si elle est validée. Les lacunes archivées ne comptent pas.
- **Validation** : il faut au moins une preuve et un utilisateur au rôle *responsable validant*. Le commentaire saisi à la validation fait office de signature. Une lacune validée ne peut pas perdre sa dernière preuve.
- **Revue périodique** : elle est planifiée automatiquement après la validation, tous les 3 mois pour une lacune critique, 6 mois pour une haute et 12 mois pour une moyenne ou une basse. Si la revue conclut à une non-conformité, la lacune repasse au statut *En cours*.
- **Retards** : une lacune ou une remédiation est en retard quand son échéance est dépassée alors qu'elle n'est pas validée. Les retards remontent dans les alertes du tableau de bord.
- **Pas de suppression définitive** des lacunes : elles sont archivées puis peuvent être restaurées.
- **Historique** : chaque création, modification (avec l'ancienne et la nouvelle valeur), changement de statut, remédiation, preuve, validation, archivage et revue est enregistré avec son auteur et sa date.
- **Rôles** : en démo, le sélecteur en haut à droite simule la connexion ; en production, le rôle vient du compte et chaque action est contrôlée par le serveur.
  - Responsable validant : tous les droits.
  - Contributeur : création et mise à jour, mais pas de validation, d'archivage ni de revue.
  - Lecteur : consultation et export uniquement.

## Structure

```
server/        API de production (Fastify, PostgreSQL, auth TOTP, journal d'audit), migrations SQL, tests
ops/           Caddyfile, initialisation de la base, script de sauvegarde
Dockerfile, docker-compose.yml   images api et web, pile complète pour une VM
src/
  api/         client HTTP du mode production
  types.ts     modèle de données typé (Gap, Remediation, Evidence, ComplianceState…)
  data/        référentiel ISO 27001:2022 ↔ NIS2, constantes, données de démo
  store/       logique métier pure (actions.ts, résultats typés ok/erreur) + contexte React (persistance)
  utils/       calculs de conformité, dates, export (HTML, CSV, JSON)
  components/  mise en page, formulaires, preuves, composants UI
  pages/       Dashboard, GapsInventory, GapDetail, Roadmap, Referentiel
  styles/      design-system.css (v2, style Wazuh/OUI) + app.css
docs/specs/    spécifications et guide de design d'origine (v1)
docs/design-system.md   design system v2 inspiré du tableau de bord Wazuh
```

## Limites

- Authentification par comptes locaux + TOTP ; le SSO (OIDC) reste à ajouter si l'organisme en dispose.
- En démo, les preuves de plus de 1 Mo ne sont conservées qu'en métadonnées (en production, les fichiers sont stockés jusqu'à `MAX_UPLOAD_MB`).
- La correspondance ISO 27001 ↔ NIS2 et les références ANSSI sont **indicatives**. Elles doivent être revues au regard du référentiel publié par l'ANSSI pour la transposition française.
- Le thème sombre (bouton soleil/lune de l'en-tête) reprend la palette sombre de Wazuh ; le rapport exporté reste en clair.
