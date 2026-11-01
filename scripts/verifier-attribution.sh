#!/bin/sh
# Échoue si un commit de la plage (ou la description de PR) contient une
# ligne d'attribution d'agent, ou si un commit a pour auteur Claude.
# Usage : scripts/verifier-attribution.sh <base>..<head> [fichier-description-pr]
set -eu
range="$1"
pr_body="${2:-}"
patterns="$(dirname "$0")/../.githooks/attribution-patterns"
status=0

for sha in $(git rev-list --no-merges "$range"); do
  if git log -1 --format=%B "$sha" | grep -qiE -f "$patterns"; then
    echo "::error::Commit $sha : ligne d'attribution Claude dans le message"
    status=1
  fi
  if git log -1 --format='%an <%ae>%n%cn <%ce>' "$sha" | grep -qiE 'noreply@anthropic\.com|^claude <'; then
    echo "::error::Commit $sha : auteur ou committer « Claude »"
    status=1
  fi
done

if [ -n "$pr_body" ] && grep -qiE -f "$patterns" "$pr_body"; then
  echo "::error::Description de la PR : ligne d'attribution Claude"
  status=1
fi

[ "$status" -eq 0 ] && echo "Aucune attribution Claude trouvée."
exit "$status"
