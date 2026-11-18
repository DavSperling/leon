#!/bin/sh
# Rejoue les preuves des trois témoins sur les fixtures inventées : chaque témoin tourne (code 0), refuse un dossier
# hors garde (code 2), et la chaîne témoin, placée dans un texte, une commande, un argument, une sortie d'outil, un nom
# de clé et un nom de fichier de chaque fixture, n'apparaît nulle part dans ce qu'il sort (grep -c donne 0). Aucun chemin
# des fixtures non plus. Les cas des attaques du 12/11 vérifient en plus un motif présent et un motif absent.
#
#   sh verifier.sh                     (les témoins de ce dossier)
#   TEMOINS=avant sh verifier.sh       (d'autres témoins, par exemple les anciens, pour voir les cas échouer)
set -u
ICI=$(cd "$(dirname "$0")" && pwd -P)
S="$ICI/${TEMOINS:-.}"
F="$ICI/fixtures"
T=PISTACHE-TEMOIN-7731
ECHECS=0

node "$ICI/fabriquer-fixtures.mjs" || exit 1
# Des fichiers rendus illisibles : la conversation ancienne d'Antigravity (si le témoin l'ouvrait, il échouerait), et un
# fichier par témoin, dont l'erreur doit être comptée sans faire tomber le relevé.
VIEUX="$F/antigravity/gemini/antigravity/brain/88881111-2222-4333-8444-555566667777/.system_generated/logs/transcript_full.jsonl"
FERMES="$VIEUX
$F/codex/leon-essai-coulisses-codex-home/sessions/2026/11/13/rollout-2026-11-13T10-00-40-illisible.jsonl
$F/cursor/projects/Users-demo-leon-essai-coulisses-cursor/agent-transcripts/secret.txt
$F/cursor/projects/Users-demo-leon-essai-coulisses-cursor-pannes/agent-transcripts/aaaa1111-2222-4333-8444-555566667777/subagents/bbbb1111-2222-4333-8444-555566667777.jsonl
$F/antigravity/gemini/antigravity/brain/dfdf1111-2222-4333-8444-555566667777/.system_generated/logs/transcript_full.jsonl"
# Et deux dossiers (second tour) : agent-transcripts d'un projet Cursor, et un dossier de projet entier.
DFERMES="$F/cursor/projects/Users-demo-leon-essai-coulisses-cursor-illisible/agent-transcripts
$F/cursor/projects/Users-demo-leon-essai-coulisses-cursor-racine
$F/antigravity/gemini-tour3-brain-illisible/antigravity/brain
$F/antigravity/gemini-tour3-logs-illisibles/antigravity/brain/dbdb1111-2222-4333-8444-555566667777/.system_generated/logs"
for f in $FERMES $DFERMES; do chmod 000 "$f"; done
trap 'for f in $FERMES; do chmod 644 "$f"; done; for f in $DFERMES; do chmod 755 "$f"; done' EXIT

# nom, code attendu, motif présent, motif absent ('-' : aucun), puis la commande
essai() {
  nom=$1
  attendu=$2
  present=$3
  absent=$4
  shift 4
  sortie=$("$@" 2>&1)
  code=$?
  temoin=$(printf '%s\n' "$sortie" | grep -c "$T")
  chemins=$(printf '%s\n' "$sortie" | grep -c -e '/Users/demo' -e "$F")
  ok=1
  if [ "$code" -ne "$attendu" ] || [ "$temoin" -ne 0 ] || [ "$chemins" -ne 0 ]; then ok=0; fi
  if [ "$present" != - ] && ! printf '%s\n' "$sortie" | grep -F -- "$present" >/dev/null; then ok=0; fi
  if [ "$absent" != - ] && printf '%s\n' "$sortie" | grep -F -- "$absent" >/dev/null; then ok=0; fi
  echo "$nom : code $code (attendu $attendu), grep -c $T : $temoin, chemins : $chemins, présent [$present], absent [$absent]$([ $ok -eq 1 ] || echo ' ÉCHEC')"
  if [ $ok -eq 0 ]; then ECHECS=$((ECHECS + 1)); fi
}

CX="$S/codex-coulisses.mjs"
HOME_X="$F/codex/leon-essai-coulisses-codex-home"
ESSAI_X=/Users/demo/leon-essai-coulisses-codex
essai 'codex, CODEX_HOME de l essai' 0 '"rollouts_releves": 4' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, jeton au milieu du cwd : hors garde' 0 '"rollouts_hors_garde": 2' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, rollout en lien compté' 0 '"liens_ou_autres": 1' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, rollout illisible compté' 0 '"EACCES": 1' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, ligne trop profonde' 0 '"<trop profond>"' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, outil MCP masqué' 0 '"name": "<outil mcp de' - node "$CX" "$HOME_X" "$ESSAI_X"
essai 'codex, CODEX_HOME sans le jeton' 2 - - node "$CX" "$F/codex/autre-home" "$ESSAI_X"
essai 'codex, sessions en lien' 2 - - node "$CX" "$F/codex/leon-essai-coulisses-codex-lien-home" "$ESSAI_X"
essai 'codex, jeton dans un parent seulement' 2 - - node "$CX" "$F/codex/leon-essai-coulisses-parent/codex-home" "$ESSAI_X"
# Le second tour.
HOME_X2="$F/codex/leon-essai-coulisses-codex-tour2"
essai 'codex 2, identifiants en pseudonymes' 0 '"fil": "<id n°' - node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, deux rollouts relevés' 0 '"rollouts_releves": 2' - node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, .., second en-tête, turn_context ailleurs' 0 '"rollouts_hors_garde": 3' - node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, sans en-tête lisible' 0 '"rollouts_sans_en_tete_lisible": 3' - node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, activité de sous-agent nommée' 0 '"event_msg/item_completed/SubAgentActivity"' '<texte de 22' node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, outil natif nommé' 0 '"name": "container.exec"' - node "$CX" "$HOME_X2" "$ESSAI_X"
essai 'codex 2, forme inconnue comptée' 0 '"type <texte de 14 caractères>": 1' - node "$CX" "$HOME_X2" "$ESSAI_X"
# Le troisième tour.
HOME_X3="$F/codex/leon-essai-coulisses-codex-tour3"
# Le nombre d'appels de chaque rollout, sur une ligne.
compte_appels() { node "$CX" "$1" "$2" | node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log("appels " + r.rollouts.map((x) => x.appels.length).join(","))'; }
essai 'codex 3, UUID du nom de rollout en pseudonyme' 0 'rollout-2026-11-13T13-00-00-<id n°1, uuid>.jsonl' '019b2a10-0000-7000-8000-000000000301' node "$CX" "$HOME_X3" "$ESSAI_X"
essai 'codex 3, messages et raisonnement hors des appels' 0 'appels 1' - compte_appels "$HOME_X3" "$ESSAI_X"
essai 'codex 3, valeurs réelles de type connues' 0 '"formes_inconnues": {}' - node "$CX" "$HOME_X3" "$ESSAI_X"
essai 'codex 3, clés masquées de même longueur distinctes' 0 '"<clé de 22 caractères> n°2"' - node "$CX" "$HOME_X3" "$ESSAI_X"

CU="$S/cursor-coulisses.mjs"
P="$F/cursor/projects"
essai 'cursor, projet de l essai' 0 '"non_ouverts"' '"erreur"' node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor"
essai 'cursor, .txt jamais ouverts' 0 '".txt": 2' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor"
essai 'cursor, hors transcripts compté' 0 '"hors_transcripts"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor"
essai 'cursor, projet sans le jeton' 2 - - node "$CU" "$P/Users-demo-autre-projet"
essai 'cursor, lien qui porte le jeton' 2 - - node "$CU" "$P/lien-leon-essai-coulisses"
essai 'cursor, jeton dans un parent seulement' 2 - - node "$CU" "$F/cursor/leon-essai-coulisses-parent/Users-demo-vrai-projet"
essai 'cursor, sous-agent illisible noté' 0 '"erreur": "EACCES"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-pannes"
essai 'cursor, bloc trop profond' 0 '"<trop profond>"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-pannes"
essai 'cursor, doublon à plat gardé' 0 '"fichier": "agent-transcripts/aaaa1111-2222-4333-8444-555566667777.jsonl"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-formes"
essai 'cursor, appel d une autre forme compté' 0 '"appels_d_une_autre_forme": 1' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-formes"
essai 'cursor, contenu objet compté' 0 '"contenu_ni_chaine_ni_tableau": 1' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-formes"
essai 'cursor, conversation à plat signalée' 0 '"forme_du_fichier": "a_plat"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-formes"
# Le second tour.
P2="$P/Users-demo-leon-essai-coulisses-cursor-tour2"
essai 'cursor 2, nom de conversation masqué' 0 '"conversation": "<nom de 25 caractères>"' - node "$CU" "$P2"
essai 'cursor 2, UUID d une sortie MCP masqué' 0 '"<id n°' '3f2a9c10-7b4e-4d21-9a6c-1e2f3a4b5c6d' node "$CU" "$P2"
essai 'cursor 2, valeurs d une sortie MCP masquées' 0 - '"failed"' node "$CU" "$P2"
essai 'cursor 2, appels d autres formes comptés' 0 '"appels_d_une_autre_forme": 4' - node "$CU" "$P2"
essai 'cursor 2, balise think comptée' 0 '"balise <think>"' - node "$CU" "$P2"
# Depuis le troisième tour, la clé thinking sous une clé inconnue (metadata) est comptée sous un nom masqué.
essai 'cursor 2, raisonnement plus profond' 0 '"ligne.message.<clé de 8 caractères>.<clé de 8 caractères>"' '"ligne.message.<clé de 8 caractères>.thinking"' node "$CU" "$P2"
essai 'cursor 2, agent-transcripts illisible noté' 0 '"erreur": "EACCES"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-illisible"
essai 'cursor 2, agent-transcripts en lien noté' 0 '"chemin": "agent-transcripts"' - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-lien"
essai 'cursor 2, dossier de projet illisible refusé' 2 - - node "$CU" "$P/Users-demo-leon-essai-coulisses-cursor-racine"
# Le troisième tour.
P3="$P/Users-demo-leon-essai-coulisses-cursor-tour3"
essai 'cursor 3, raisonnement sous une clé inconnue masqué' 0 '"ligne.<clé de 11 caractères>.<clé de 8 caractères>"' '<clé de 11 caractères>.thinking' node "$CU" "$P3"
essai 'cursor 3, sortie hors tool_result masquée' 0 '"ligne.<clé de 10 caractères>.<clé de 7 caractères>[].<clé de 8 caractères>"' '[].thinking"' node "$CU" "$P3"
essai 'cursor 3, clés masquées de même longueur distinctes' 0 '"<clé de 4 caractères> n°2"' '"presente": "4/2"' node "$CU" "$P3"

AG="$S/antigravity-coulisses.mjs"
ESSAI_A="$F/antigravity/leon-essai-coulisses-antigravity"
G="$F/antigravity/gemini"
essai 'antigravity, dossier de l essai' 0 '"conversations_relevees": 5' - node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, citations sans effet' 0 '"conversations_hors_garde": 4' 'citee_par' node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, sous-agent par le lien parent' 0 '"retenue_par": "sous_agent_de_l_essai"' '"sous_agent": "inconnu"' node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, tool_calls en objet compté' 0 '"tool_calls_hors_tableau": 1' - node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, conversation illisible comptée' 0 '"EACCES": 1' - node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, .jsonl en lien ou dossier jamais ouvert' 0 '"jsonl_qui_ne_sont_pas_des_fichiers": 2' - node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, args trop profonds' 0 '"<trop profond>"' - node "$AG" "$ESSAI_A" "$G"
essai 'antigravity, dossier sans le jeton' 2 - - node "$AG" "$F/antigravity/autre-dossier" "$G"
# Le second tour.
ESSAI_A2="$F/antigravity/leon-essai-coulisses-antigravity-tour2"
G2="$F/antigravity/gemini-tour2"
essai 'antigravity 2, cinq conversations relevées' 0 '"conversations_relevees": 5' - node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, UUID sous d autres arguments masqué' 0 - 'a1c3e5f7-0b2d-4f6a-8c9e-0d1f2a3b4c5d' node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, valeurs sous une sortie MCP masquées' 0 - '"WAITING"' node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, step_index jamais affiché' 0 - '4111111111111111' node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, appels sous une autre clé comptés' 0 '"appels_sous_une_autre_cle": 2' - node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, raisonnement sous thought' 0 '"PLANNER_RESPONSE.thought"' - node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, rappel hors USER_INPUT' 0 '"sous_agent": "inconnu"' - node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, dossier inconnu compté pour le ménage' 0 '"conversations_au_dossier_inconnu": 1' - node "$AG" "$ESSAI_A2" "$G2"
essai 'antigravity 2, dossiers en lien jamais lus' 0 '"dossiers_en_lien": 2' - node "$AG" "$ESSAI_A2" "$G2"
# Le troisième tour.
ESSAI_A3="$F/antigravity/leon-essai-coulisses-antigravity-tour3"
essai 'antigravity 3, sous-agent de navigateur lié' 0 '"retenue_par": "sous_agent_de_l_essai"' '"conversations_au_dossier_inconnu": 1' node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3"
essai 'antigravity 3, variante donnée pour le ménage' 0 '"variante": "antigravity-ide"' - node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3"
essai 'antigravity 3, clés masquées de même longueur distinctes' 0 '"<clé de 22 caractères> n°2"' - node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3"
essai 'antigravity 3, brain illisible compté' 0 '"EACCES": 1' '"brains_lus": 1' node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3-brain-illisible"
essai 'antigravity 3, logs illisibles comptés' 0 '"EACCES": 1' '"conversations_non_ouvertes": 1' node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3-logs-illisibles"
essai 'antigravity 3, racine fausse' 0 '"brains_lus": 0' - node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-faute-de-frappe"
essai 'antigravity 3, racine un niveau trop bas' 0 '"brains_lus": 0' - node "$AG" "$ESSAI_A3" "$F/antigravity/gemini-tour3/antigravity-ide"
# Le quatrième tour : la reconnaissance par les messages de l'essai.
ESSAI_A4="$F/antigravity/leon-essai-coulisses-antigravity-tour4"
G4="$F/antigravity/gemini-tour4"
# Les quatre premiers caractères de chaque conversation relevée et comment elle l'a été, sur une ligne.
retenues() { node "$AG" "$1" "$2" | node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log("retenues " + r.conversations.map((x) => x.conversation.slice(0, 4) + "=" + x.retenue_par).sort().join(","))'; }
essai 'antigravity 4, (a) (b) (c) retenus, (d) (e) (f) écartés' 0 'retenues a4a4=messages_de_l_essai,b4b4=messages_de_l_essai,c4c4=sous_agent_de_l_essai,c5c5=sous_agent_de_l_essai' - retenues "$ESSAI_A4" "$G4"
essai 'antigravity 4, compteur des messages' 0 '"conversations_retenues_par_leurs_messages": 4' - node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, hors garde justes' 0 '"conversations_hors_garde": 3' - node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, dossiers inconnus justes' 0 '"conversations_au_dossier_inconnu": 3' - node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, phrase de l essai jamais affichée' 0 - 'Ne modifie aucun fichier' node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, consigne jamais affichée' 0 - 'puis réponds en une phrase' node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, adresse de l essai jamais affichée' 0 - 'example.com' node "$AG" "$ESSAI_A4" "$G4"
essai 'antigravity 4, ménage : sous-agents restés et (g), rien relevé' 0 '"conversations_relevees": 0' '"conversations_retenues_par_leurs_messages": 1' node "$AG" "$ESSAI_A4" "$F/antigravity/gemini-tour4-menage"
essai 'antigravity 4, ménage : restes comptés' 0 '"conversations_au_dossier_inconnu": 3' - node "$AG" "$ESSAI_A4" "$F/antigravity/gemini-tour4-menage"
# Le cinquième tour (attaques4) : seuls les deux essais (dont un en NFD) sont retenus ; ni le sous-agent d'une vraie
# conversation (A), ni la vraie conversation où le protocole est collé tard (B), ni le message 1 hors USER_REQUEST (C),
# ni le sous-agent de l'essai au dossier hors essai (D), qui est compté avec les deux de A.
ESSAI_A5="$F/antigravity/leon-essai-coulisses-antigravity-tour5"
G5="$F/antigravity/gemini-tour5"
essai 'antigravity 5, (A) (B) (C) (D) écartés, essai NFD retenu' 0 'retenues 5a00=messages_de_l_essai,5a01=messages_de_l_essai' - retenues "$ESSAI_A5" "$G5"
essai 'antigravity 5, compteur des messages' 0 '"conversations_retenues_par_leurs_messages": 2' - node "$AG" "$ESSAI_A5" "$G5"
essai 'antigravity 5, sous-agents à consigne non retenus comptés' 0 '"sous_agents_a_consigne_de_l_essai_non_retenus": 3' - node "$AG" "$ESSAI_A5" "$G5"
essai 'antigravity 5, aucun lien relevé' 0 '"liens": []' - node "$AG" "$ESSAI_A5" "$G5"
essai 'antigravity 5, ménage : sous-agent resté compté' 0 '"sous_agents_a_consigne_de_l_essai_non_retenus": 1' '"conversations_relevees": 1' node "$AG" "$ESSAI_A5" "$F/antigravity/gemini-tour5-menage"

if [ "$ECHECS" -eq 0 ]; then echo 'Tout est bon.'; else echo "$ECHECS essai(s) en échec."; exit 1; fi
