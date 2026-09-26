# Design system v2 — inspiré du tableau de bord Wazuh

La v2 du design system reprend les codes visuels du tableau de bord Wazuh 4.8 et suivants. Ce tableau de bord est basé sur OpenSearch Dashboards et utilise le thème clair de la bibliothèque de composants OUI (dérivée d'EUI). Les jetons sont définis dans `src/styles/design-system.css`, et les composants dans `src/styles/app.css`.

L'application reprend le style de Wazuh, mais **ni son nom ni son logo**. Elle garde sa propre identité (marque « conformité. »).

## Principes repris de Wazuh

| Élément | Wazuh / OUI | Application |
|---|---|---|
| Navigation | Menu global à gauche par catégories (depuis la 4.8), en-tête clair avec fil d'Ariane | Menu latéral ancrable : Vue d'ensemble, Conformité, Plan d'action, Rapports, Gestion des données |
| Couleur d'action | Bleu primaire OUI `#006BB8` | Boutons pleins, liens, onglets actifs, élément de menu actif |
| Statuts | `UI_COLOR_STATUS` : succès `#007871`, danger `#BD271E`, avertissement `#FEC514`, info `#6092C0`, désactivé `#646A77` | Pastilles d'état (EuiHealth) pour les statuts des lacunes et des remédiations |
| Sévérités | Critique / Haute / Moyenne / Basse, comme la détection des vulnérabilités | `--severity-critical #BD271E`, `--severity-high #E7664C`, `--severity-medium #D6BF57`, `--severity-low #6092C0` |
| Neutres | Texte `#343741`, titres `#1A1C21`, bordures `#D3DAE6`, fond `#F5F7FA` | Jetons `--text`, `--text-title`, `--border`, `--page-bg` |
| Typographie | Inter, base 14 px ; Roboto Mono pour les identifiants | Inter via Google Fonts (police système en secours), Roboto Mono pour GAP-xxx et A.x.y |
| Panneaux | EuiPanel : fond blanc, bordure 1 px, rayon 6 px, ombre très légère | `.card`, `.kpi`, `.gantt`, `.detail-head` |
| Chiffres clés | EuiStat : libellé au-dessus, grand nombre coloré | Rangée de KPI de la vue d'ensemble et de la roadmap |
| Tableaux | EuiBasicTable : en-tête blanc, texte 12 px gras, lignes séparées par un filet | Inventaire des lacunes, couverture NIS2 |
| Badges | EuiBadge : rectangle arrondi à 2 px, sans majuscules | Criticité sur fond plein de la couleur de sévérité |
| Onglets | EuiTabs : soulignement bleu de 2 px | Onglets du détail d'une lacune |
| Formulaires | Champs grisés, filet bleu en bas au focus | `.input` |

## Jetons principaux

```css
--primary-800: #006bb8;   /* action */
--primary-700: #005a9e;   /* survol */
--primary-100: #e6f1fa;   /* fond actif */
--text: #343741;  --text-title: #1a1c21;  --text-subdued: #69707d;
--border: #d3dae6;  --page-bg: #f5f7fa;  --panel-bg: #ffffff;
--success: #007871;  --error: #bd271e;  --warning: #fec514;  --info: #6092c0;
--font-family-system: 'Inter', …;  --font-size-body: 0.875rem; /* 14 px */
--radius-sm: 2px;  --radius-md: 4px;  --radius-xl: 6px;
```

Les noms de variables de la v1 (`--primary-*`, `--accent*`, `--neutral-*`, `--space-*`) sont conservés et pointent vers les nouvelles valeurs. L'accent rouge de la v1 devient le bleu d'action, parce que dans Wazuh le rouge est réservé au danger.

## Hors périmètre

Wazuh propose aussi un thème sombre. Il n'est pas repris ici, car le mode sombre est exclu du MVP.
