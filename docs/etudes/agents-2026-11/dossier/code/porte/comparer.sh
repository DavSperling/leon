#!/usr/bin/env bash
# Compare deux mises en œuvre de la porte sur des requêtes qui ne demandent aucun secret (dossier agents,
# chapitre 15, section 13). Usage : services/porte/comparer.sh https://porte.<domaine> https://<service porte>.up.railway.app
# Chaque ligne : la requête, puis le statut et le corps de chaque côté. Toute différence est signalée.
set -euo pipefail
a="${1:?adresse de la porte en service}"
b="${2:?adresse de la porte à essayer}"
inconnu="00000000-0000-4000-8000-000000000000"
gros="$(mktemp)"
trap 'rm -f "$gros"' EXIT
head -c 262145 /dev/zero | tr '\0' 'a' > "$gros"

essai() {
  local nom="$1"; shift
  local ra rb
  ra="$(curl -sS -o - -w ' %{http_code}' "$@" "$a$CHEMIN" || true)"
  rb="$(curl -sS -o - -w ' %{http_code}' "$@" "$b$CHEMIN" || true)"
  if [[ "$ra" == "$rb" ]]; then echo "pareil      $nom : $ra"; else echo "DIFFÉRENT   $nom : [$ra] contre [$rb]"; fi
}

CHEMIN="/h/outlook/$inconnu"            essai "abonnement inconnu" -X POST -H 'content-type: application/json' -d '{"value":[]}'
CHEMIN="/h/inconnu/$inconnu"            essai "outil inconnu" -X POST -d '{}'
CHEMIN="/h/outlook/ABC"                 essai "abonnement mal formé" -X POST -d '{}'
CHEMIN="/h/hubspot/$inconnu"            essai "outil d'application sur une adresse d'abonnement" -X POST -d '[]'
CHEMIN="/h/outlook/$inconnu?validationToken=essai%20de%20comparaison" essai "écho de validation" -X POST
CHEMIN="/h/outlook/$inconnu?validationToken=%01" essai "écho avec un caractère de contrôle" -X POST
CHEMIN="/h/outlook/$inconnu"            essai "corps trop gros" -X POST --data-binary "@$gros"
CHEMIN="/h/outlook/$inconnu"            essai "corps qui n'est pas de l'UTF-8" -X POST --data-binary $'\xff\xfe'
CHEMIN="/h/hubspot"                     essai "hubspot, signature fausse" -X POST \
  -H "x-hubspot-request-timestamp: $(($(date +%s) * 1000))" -H 'x-hubspot-signature-v3: AAAA' -d '[{"portalId":1}]'
