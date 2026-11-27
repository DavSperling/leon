#!/usr/bin/env bash
# La sonde de la porte (dossier agents, chapitre 15, sections 4 et 13). Toutes les 500 ms, deux requêtes sans secret :
#   GET /sante : 200, c'est le service Rust ; 404, c'est web (Next n'a pas de page /sante) ;
#   POST d'un abonnement inconnu : 401, la porte refuse comme prévu, quelle qu'elle soit.
# Toute autre réponse (000 : pas de réponse en 2 s) est le trou. Usage : services/porte/sonde.sh https://porte.<domaine>
# Ctrl-C pour arrêter ; le résumé compte les secondes de trou.
set -uo pipefail
adresse="${1:?adresse de la porte, sans / final}"
inconnu="/h/outlook/00000000-0000-4000-8000-000000000000"
total=0
trou=0
resume() { echo "sondes : $total, dans le trou : $trou (environ $((trou / 2)) s)"; exit 0; }
trap resume INT TERM
while true; do
  sante="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$adresse/sante" || true)"
  refus="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 -X POST -d '{}' "$adresse$inconnu" || true)"
  case "$sante" in 200) qui=rust ;; 404) qui=web ;; *) qui=aucun ;; esac
  total=$((total + 1))
  if [[ "$refus" != 401 || "$qui" == aucun ]]; then
    trou=$((trou + 1))
    etat="TROU"
  else
    etat="ok"
  fi
  printf '%s %-5s sante=%s refus=%s %s\n' "$(date -u +%H:%M:%S.%3N)" "$qui" "$sante" "$refus" "$etat"
  sleep 0.5
done
