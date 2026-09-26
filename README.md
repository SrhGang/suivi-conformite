# Suivi de conformité ISO 27001:2022 / NIS2-ANSSI

Prototype React qui sert à recenser les mesures de cybersécurité non appliquées dans un organisme et à suivre leur correction jusqu'à la validation. Il sert aussi de document vivant : ce document est mis à jour à chaque action et peut être exporté.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires de la logique métier (Vitest)
npm run build    # build de production dans dist/
```

Pour produire la version en ligne (page unique autonome, hébergeable comme page claude.ai) :

```bash
npm run build:artifact   # → artifact/suivi-conformite.html
```

Dans cette version, la navigation se fait en mémoire (sans URL) et, les téléchargements y étant bloqués, les exports (rapport, CSV, sauvegarde JSON) s'affichent dans une fenêtre avec un bouton « Copier ».

Les données sont stockées dans le `localStorage` du navigateur. Au premier lancement, un jeu de démonstration est chargé : un organisme fictif du secteur de l'eau, entité essentielle NIS2, avec 26 lacunes, 32 remédiations et 11 preuves. Le pied de page permet d'exporter ou d'importer une sauvegarde JSON et de réinitialiser la démo.

## Pages

| Route | Page | Contenu |
|---|---|---|
| `/` | Tableau de bord | 4 KPI cliquables, score pondéré (anneau), score par thème ISO, répartition par criticité et par statut, alertes prioritaires, actions rapides, activité récente, export du rapport |
| `/lacunes` | Inventaire | Recherche plein texte, filtres (criticité, thème, statut, NIS2, en retard, archivées), tri par colonne, pagination par 20, menu Dupliquer / Archiver / Restaurer, export CSV. Les filtres sont conservés dans l'URL |
| `/lacunes/:id` | Détail | Onglets Détails / Remédiations / Preuves & validation / Historique, statut enregistré automatiquement, panneau de métadonnées, édition, duplication, archivage, revue périodique |
| `/roadmap` | Roadmap | Vue Gantt (déplacer une barre ou étirer son bord droit pour changer les dates, jalons, ligne « aujourd'hui », périodes 6/12/18 mois ou tout) et vue Kanban (glisser-déposer entre À faire, En cours, Bloqué et Validé) |
| `/referentiel` | Référentiel | Les 93 mesures de l'annexe A, l'état de chacune et la couverture des exigences NIS2 (art. 20, 21.2 a–j, 23) |

## Règles métier

- **Score global** : Σ(poids × avancement) / Σ(poids). Les poids sont Critique ×4, Haute ×3, Moyenne ×2, Basse ×1. L'avancement d'une lacune vaut 0 % si elle est non traitée, 10 à 75 % si elle est en cours (moyenne de ses remédiations), 80 % si elle est corrigée et 100 % si elle est validée. Les lacunes archivées ne comptent pas.
- **Validation** : il faut au moins une preuve et un utilisateur au rôle *responsable validant*. Le commentaire saisi à la validation fait office de signature. Une lacune validée ne peut pas perdre sa dernière preuve.
- **Revue périodique** : elle est planifiée automatiquement après la validation, tous les 3 mois pour une lacune critique, 6 mois pour une haute et 12 mois pour une moyenne ou une basse. Si la revue conclut à une non-conformité, la lacune repasse au statut *En cours*.
- **Retards** : une lacune ou une remédiation est en retard quand son échéance est dépassée alors qu'elle n'est pas validée. Les retards remontent dans les alertes du tableau de bord.
- **Pas de suppression définitive** des lacunes : elles sont archivées puis peuvent être restaurées.
- **Historique** : chaque création, modification (avec l'ancienne et la nouvelle valeur), changement de statut, remédiation, preuve, validation, archivage et revue est enregistré avec son auteur et sa date.
- **Rôles** : le sélecteur en haut à droite simule la connexion.
  - Responsable validant : tous les droits.
  - Contributeur : création et mise à jour, mais pas de validation, d'archivage ni de revue.
  - Lecteur : consultation et export uniquement.

## Structure

```
src/
  data/        référentiel ISO 27001:2022 ↔ NIS2, constantes, données de démo
  store/       logique métier pure (actions.js) + contexte React (persistance)
  utils/       calculs de conformité, dates, export (HTML, CSV, JSON)
  components/  mise en page, formulaires, preuves, composants UI
  pages/       Dashboard, GapsInventory, GapDetail, Roadmap, Referentiel
  styles/      design-system.css (v2, style Wazuh/OUI) + app.css
docs/specs/    spécifications et guide de design d'origine (v1)
docs/design-system.md   design system v2 inspiré du tableau de bord Wazuh
```

## Limites du prototype

- Il n'y a ni back-end ni authentification réelle. En production, il faudra une API, une base de données, une authentification (SSO avec MFA), le chiffrement et un contrôle d'accès côté serveur, car l'outil contient la liste des failles de l'organisme.
- Les preuves de plus de 1 Mo ne sont conservées qu'en métadonnées.
- La correspondance ISO 27001 ↔ NIS2 et les références ANSSI sont **indicatives**. Elles doivent être revues au regard du référentiel publié par l'ANSSI pour la transposition française.
- Le mode sombre n'est pas pris en charge : il est hors périmètre.
