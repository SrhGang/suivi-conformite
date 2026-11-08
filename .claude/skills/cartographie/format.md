# Format des fichiers de la cartographie

Tout vit dans `cartographie/` à la racine du dépôt. Ce dossier est ignoré par git :
la carte décrit l'architecture d'un dépôt public, on ne la publie pas.

## Fiche de zone : `cartographie/zones/<zone>.json`

Écrite par un agent cartographe, une par zone (`interface`, `metier`, `serveur`).

```json
{
  "zone": "interface",
  "resume": "Une ou deux phrases : à quoi sert cette zone, pour quelqu'un qui ne lit pas le code.",
  "modules": [
    {
      "id": "interface/pages",
      "nom": "Les écrans",
      "resume": "Une phrase en langage simple.",
      "fichiers": ["src/pages/**"]
    }
  ],
  "fichiers": {
    "src/pages/Dashboard.tsx": {
      "nom": "Tableau de bord",
      "description": "Une phrase : ce que le fichier fait pour l'utilisateur, pas comment il est codé."
    }
  },
  "routes": {
    "POST /api/actions/:name": {
      "nom": "Enregistrer une action",
      "description": "Une phrase : ce que l'appel permet de faire et ce qu'il renvoie."
    }
  },
  "ecrans": {
    "/lacunes/:id": {
      "nom": "Fiche d'une lacune",
      "description": "Ce que l'utilisateur voit et peut faire sur cet écran."
    }
  },
  "liens_invisibles": [
    { "de": "server/src/mailer.ts", "vers": "Serveur SMTP", "nature": "Envoie les invitations par e-mail" }
  ],
  "flux_proposes": [
    { "titre": "Ajouter une preuve", "etapes": ["src/components/EvidencePanel.tsx", "POST /api/gaps/:gapId/evidence", "server/src/app.ts", "table evidence"] }
  ]
}
```

Règles :
- Les clés de `fichiers` sont les chemins exacts du scan ; celles de `routes` sont exactement `"MÉTHODE /chemin"` comme le scan les affiche ; celles d'`ecrans` sont les chemins d'écran du scan.
- `routes` : zone `serveur` uniquement. `ecrans` : zone `interface` uniquement.
- `liens_invisibles` : seulement ce que le scan ne voit pas (e-mail, disque, base, tâches planifiées, healthcheck Docker, sauvegardes, appels via variable d'environnement).
- Aucune remarque de sécurité dans ces fichiers (voir le SKILL, règle « rien de sensible »).

## Langage simple

- « Affiche la liste des lacunes avec filtres par thème et statut », pas « Composant React qui mappe gaps[] ».
- Un nom court (2 à 5 mots), une description d'une phrase. Le chemin reste affiché à côté : inutile de le répéter.
- Les termes métier du projet sont gardés tels quels : lacune, remédiation, preuve, référentiel, ISO 27001, NIS2, roadmap.
- Les tests se décrivent par ce qu'ils garantissent : « Vérifie que le score de conformité ne compte pas les mesures exclues ».

## Carte assemblée : `cartographie/carte.json`

Écrite par le Claude principal à partir du scan et des fiches de zone :

```json
{
  "genere_le": "AAAA-MM-JJ",
  "commit": "<sha court>",
  "resume": "3 à 5 lignes sur l'app.",
  "parties": [{ "id": "interface", "nom": "…", "resume": "…", "modules": ["interface/pages"] }],
  "externes": [{ "id": "postgres", "nom": "Base PostgreSQL", "resume": "…" }],
  "modules": [], "fichiers": {}, "routes": {}, "ecrans": {},
  "liens": [{ "de": "…", "vers": "…", "nature": "importe | appel web | lit/écrit | e-mail | disque" }],
  "flux": [{ "titre": "…", "etapes": [{ "ref": "…", "note": "…" }] }],
  "visite": [{ "ref": "…", "titre": "…", "note": "…" }],
  "travaux_recents": [{ "titre": "…", "demande": "…", "resume": "…", "elements": [{ "ref": "…", "changement": "nouveau | modifie", "note": "…" }] }]
}
```

## Carte lisible : `cartographie/CARTE.md`

Voir l'étape « Assembler » du SKILL. Diagrammes en Mermaid (lisibles dans VS Code, GitHub et la plupart des visionneuses Markdown).
