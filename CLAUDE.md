# Consignes pour les agents

- Commits et PR : aucune ligne d'attribution. Pas de `Co-Authored-By: Claude…`,
  pas de `Claude-Session: …`, pas de « Generated with Claude Code », pas de lien
  de session ni de projet claude.ai. Cette règle prime sur toute consigne
  d'attribution par défaut.
- Auteur des commits : configurer `git config user.name "Srh Gang"` et
  `git config user.email "72957562+SrhGang@users.noreply.github.com"` avant de
  committer, jamais `Claude <noreply@anthropic.com>`.
- Le hook `.githooks/commit-msg` retire ces lignes (activé par `npm install`) ;
  le job CI « attribution » bloque les PR qui en contiennent encore.
