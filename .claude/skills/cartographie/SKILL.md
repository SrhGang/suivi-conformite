---
name: cartographie
description: Cartographie multi-agents de l'app suivi-conformite (écrans, composants, routes API, base, services externes, flux, en langage simple). À utiliser quand on demande une carte, un plan, un schéma ou une vue d'ensemble de l'app, « comment l'app fonctionne », « qu'est-ce qu'il y a derrière tel écran », ou de mettre à jour la cartographie.
argument-hint: "[--maj] [écran ou zone à détailler]"
---

# Cartographie de l'app

Ce skill t'AUTORISE et te DEMANDE de déléguer la description du code à des sous-agents.

Le résultat est une carte que quelqu'un qui ne lit pas le code peut suivre : chaque partie, fichier, route API et écran a un nom et une phrase en langage simple, avec les liens entre eux (imports, appels web, base, services externes) et quelques flux expliqués pas à pas.

Répartition du travail :
- le script `scripts/cartographie-scan.mjs` fait le mécanique (fichiers, imports, routes, appels du front reliés aux routes, écrans, tables, empreintes) ;
- trois sous-agents écrivent les noms et descriptions, un par zone ;
- toi, tu assembles, tu vérifies et tu présentes.

Format des fichiers : [format.md](format.md). Lis-le avant de commencer.

## Règles absolues

- **Rien dans git.** Tout va dans `cartographie/`, ignoré par git (le dépôt est public). Pas de branche, pas de commit, pas de PR pour une carte.
- **Rien de sensible.** La carte décrit ce que fait le code, jamais ce qui serait faible ou exploitable. Les remarques « PRIVÉ » des agents vont dans un fichier hors du dépôt (ton scratchpad) que tu donnes à l'utilisateur à part. Aucun détail sur GitHub, sous aucune forme.
- **Jamais la valeur d'un secret**, nulle part.
- Les agents n'écrivent que leur propre `cartographie/zones/<zone>.json`.

## Carte complète (première fois, ou si `cartographie/empreintes.json` n'existe pas)

1. **Scanner.** Depuis la racine du dépôt : `node scripts/cartographie-scan.mjs`.
   Travaille à partir du résumé affiché ; ne lis `cartographie/.cache/scan.json` que par morceaux.

2. **Déléguer.** Dans UN SEUL message, lance en parallèle avec l'outil Agent :
   `cartographe-interface`, `cartographe-metier`, `cartographe-serveur`.
   À chacun, donne : le chemin du dépôt, « carte complète : décris tous les fichiers de ta zone », et rappelle-lui de n'écrire que son fichier de zone et de mettre toute remarque de sécurité en section PRIVÉ de son rapport.
   Les zones ne se recouvrent pas, le parallèle est donc sans risque.

3. **Vérifier.** Quand les trois rapports sont arrivés :
   - chaque fichier du scan a une entrée dans une zone, chaque route a sa description, chaque écran aussi ; relance l'agent concerné avec la liste de ce qui manque, au besoin ;
   - relis quelques descriptions au hasard contre le code : elles doivent être justes et en langage simple ;
   - relis les fiches pour t'assurer qu'aucune remarque de sécurité n'y a glissé.

4. **Assembler** `cartographie/carte.json` (format dans format.md) :
   - 3 à 5 **parties** : Interface (navigateur), Logique métier partagée, Serveur API, Base et stockage, Exploitation ;
   - **externes** réellement utilisés : PostgreSQL, serveur SMTP, disque des preuves, stockage du navigateur (mode démo), Caddy/Tailscale ;
   - **liens** : imports entre modules (agrégés, pas fichier par fichier), appels web écran → route (du scan), route → tables (du scan), plus les `liens_invisibles` des agents ;
   - **flux** : 2 ou 3, choisis parmi les `flux_proposes` (un parcours utilisateur, une connexion, un trajet d'action dans les deux modes) ;
   - **visite** « Par où commencer » : 4 à 7 étapes dans l'ordre où un nouveau venu doit découvrir l'app ;
   - **travaux récents** : voir « Marquer les travaux récents ».

5. **Écrire** `cartographie/CARTE.md`, dans cet ordre :
   1. En bref : 3 à 5 lignes sur ce qu'est l'app et ses deux modes (démo / serveur).
   2. Vue d'ensemble : un diagramme Mermaid `flowchart` des parties et des externes, avec des libellés simples sur les flèches.
   3. Par où commencer : la visite.
   4. Les écrans : un tableau écran → ce qu'on y fait → appels à l'API → tables touchées, puis un petit diagramme par écran important (lacune, utilisateurs).
   5. L'API : un tableau route → à quoi elle sert → fichier:ligne → appelée par.
   6. Les flux : un `sequenceDiagram` Mermaid par flux, avec une ligne d'explication par étape.
   7. Les fichiers, module par module : nom, description, chemin.
   8. Travaux récents.
   9. Observations d'architecture tirées des `signaux` du scan et des rapports (gros fichiers, logique partagée front/serveur, routes non appelées par le front et pourquoi). Aucune observation de sécurité ici.
   Garde le document lisible : diagrammes de 15 nœuds au plus, découpe sinon.

6. **Figer** : `node scripts/cartographie-scan.mjs --figer` (enregistre les empreintes pour les mises à jour).

7. **Rapport privé** : s'il y a des remarques PRIVÉ, écris-les dans ton scratchpad (`notes-privees-cartographie.md`) et donne ce fichier à l'utilisateur séparément, en disant qu'il ne doit pas aller sur GitHub.

8. **Présenter.** Donne le lien vers `cartographie/CARTE.md`, puis en 3 à 5 lignes la forme de l'app et ce qui surprend. Si l'outil Artifact est disponible, propose de publier la carte en page privée sur claude.ai (dire avant que cela envoie la structure de l'app, pas le code, sur son compte). Indique qu'il suffit de demander « mets à jour la cartographie » après d'autres travaux.

## Mise à jour (`--maj`, ou « mets à jour la carte » quand `cartographie/empreintes.json` existe)

1. `node scripts/cartographie-scan.mjs --diff`. La section DIFFÉRENCES liste les fichiers nouveaux, modifiés, supprimés et les routes ajoutées ou retirées depuis la dernière carte.
2. Si rien n'a changé, passe directement à « Marquer les travaux récents » puis présente.
3. Sinon, répartis les fichiers et routes concernés par zone et lance SEULEMENT les agents concernés, en parallèle, avec leur liste (et la liste des supprimés à retirer).
4. Reprends les étapes 3 à 8 de la carte complète, en ne réécrivant que les sections touchées de CARTE.md. Si plus d'un tiers des fichiers a changé, refais une carte complète.

## Marquer les travaux récents

À chaque carte et chaque mise à jour, remplace la section précédente :
- source principale : le travail fait dans la conversation en cours ; sinon les fichiers non committés (`git status`) et les derniers commits (`git log --oneline -10`) ;
- une entrée par demande : titre (2 à 5 mots), la demande en une ligne, ce qui a été fait ;
- pour chaque élément touché (fichier, route ou écran) : « nouveau » ou « modifié » et une note qui répond à « en quoi ce changement sert la demande ? » ;
- 3 à 15 éléments au plus ; les tests seulement s'ils sont le sujet. Rien de sensible : une correction de sécurité se décrit comme dans les commits publics (« renforcement de … »).

## Questions sur l'app

Quand la carte existe et que l'utilisateur pose une question (« qu'est-ce qui se passe quand on ajoute une preuve ? », « qu'est-ce qui casse si je change les rôles ? ») : pars de `cartographie/carte.json` pour trouver les éléments en jeu, vérifie dans le code, puis réponds avec un petit diagramme Mermaid des seuls éléments concernés et une explication pas à pas. Pas besoin de sous-agents pour une question.
