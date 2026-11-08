# Annexe 5 : l'essai réel d'Antigravity (T31)

8 novembre 2026 · David (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte du lot 9 du [plan](../../../plans/2026-11-02-memoire-sessions.md)

> Essai fait dans **l'appli Antigravity 2.0.1**, sur macOS, dans un dossier de test vide. Un crochet témoin ([`essais/antigravity-temoin.mjs`](../essais/antigravity-temoin.mjs)), ajouté sous l'entrée `leon-temoin` de `~/.gemini/config/hooks.json`, est branché sur SessionStart, PreInvocation, PostInvocation, PreToolUse, PostToolUse et Stop. Il ne note que la forme de son entrée (les clés, les types, les nombres, les booléens, les chemins et les identifiants ; d'un texte, sa seule longueur), et injecte deux mots témoins : CORMORAN-7 par `systemMessage` au SessionStart, PELICAN-3 par `ephemeralMessage` au premier PreInvocation de la conversation. Dans une conversation neuve, on a demandé au modèle quels mots témoins il connaissait, puis de lancer `ls`, puis envoyé un second message. Le rapport du témoin donne aussi la forme des quatre transcripts les plus récents, sans leur contenu. L'IDE Antigravity 2.5.5 est installé mais n'a pas servi ; `agy` n'est pas installé.

## Verdict

**La porte est franchie : Antigravity donne au modèle le texte qu'un crochet injecte, par PreInvocation, sous la forme `ephemeralMessage`.** Le modèle a cité PELICAN-3. Le lot 9 continue, avec trois corrections : l'injection passe par PreInvocation et non par SessionStart, sa forme est `ephemeralMessage`, et l'installateur ne pose plus SessionStart.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| SessionStart | **Jamais appelé**, alors que la conversation était neuve. L'appli 2.0.1 ne semble pas connaître cet évènement. Sa présence dans `hooks.json` ne gêne pas les autres crochets. |
| Les champs de PreInvocation | `conversationId`, `transcriptPath`, `workspacePaths`, `artifactDirectoryPath` (le dossier `brain/<conversation>`), `initialNumSteps`, `invocationNum`. **Pas de prompt** dans l'entrée. 4 appels, 5 ms au plus. |
| `invocationNum` | Repart à 0 à chaque message : il vaut 0 puis 1 quand le modèle enchaîne un outil et sa réponse, puis de nouveau 0 au message suivant. Il ne repère donc pas le premier appel d'une conversation : le témoin de Leon s'appuie sur `conversationId`, et il n'a injecté qu'une fois sur les 4 appels. |
| Stop et `fullyIdle` | Un Stop par message, avec `fullyIdle: true`, plus `executionNum`, `error` (vide) et `terminationReason`. 5 ms au plus. |
| La forme de C5 qui atteint le modèle | `{"injectSteps":[{"ephemeralMessage":…}]}` : **oui** (PELICAN-3 cité). `systemMessage` : **pas essayée**, puisqu'elle était portée par SessionStart. |
| Durée de vie d'une étape injectée | **Pas mesurée** : les mots témoins n'ont été demandés qu'au premier message. Le message injecté ne laisse aucune trace dans le transcript, ce qui laisse penser qu'il ne vaut que pour l'appel où il est injecté. |
| Le contexte injecté dans le transcript | Absent. PELICAN-3 n'apparaît que dans la réponse du modèle (étape `PLANNER_RESPONSE`). Rien à retirer à la recapture, `stripLeonBlocks` reste par prudence. |
| `transcript.jsonl` écrit et lisible | Oui. L'appli écrit `~/.gemini/antigravity/brain/<conversation>/.system_generated/logs/transcript.jsonl`, seul, et `transcriptPath` le désigne. L'IDE écrit sous `~/.gemini/antigravity-ide/` un `transcript.jsonl` coupé (champ `truncated_fields`) et un `transcript_full.jsonl` entier. |
| La forme des étapes | Clés : `step_index`, `source`, `type`, `status`, `created_at`, `content`, `thinking`, `tool_calls`, et `exit_code` dans l'IDE. Types vus : USER_INPUT, PLANNER_RESPONSE, CONVERSATION_HISTORY, KNOWLEDGE_ARTIFACTS, CHECKPOINT, SYSTEM_MESSAGE, GENERIC, RUN_COMMAND, VIEW_FILE, CODE_ACTION, GREP_SEARCH, LIST_DIRECTORY. Outils vus : run_command, view_file, write_to_file, replace_file_content, grep_search, list_dir, manage_task, schedule. |
| PreToolUse et PostToolUse | Jamais appelés, alors que le modèle a utilisé `list_dir`. Leon ne s'en sert pas. |
| L'approbation des crochets | Aucune demandée : l'appli a lu `~/.gemini/config/hooks.json` après une relance. Le fichier n'existait pas avant l'essai. |
| Le dossier et l'environnement du crochet | Il tourne depuis `~/.gemini/config`, **pas depuis le dossier de travail**, qui vient de `workspacePaths`. Variables propres : `ANTIGRAVITY_CONVERSATION_ID`, `AGY_BROWSER_ACTIVE_PORT_FILE`, `AGY_BROWSER_WS_URL`. |
| La durée de démarrage et le PATH du lanceur | Pas mesurés avec le lanceur de Leon : le témoin est lancé par le Node du système. Les crochets sont rapides (6 ms au plus), loin des délais (10 s et 30 s). |

## La recette ajustée

1. **Le bloc** arrive par PreInvocation (`crochet antigravity prompt`, 10 s), une fois par conversation, par le témoin de `~/.leon/temoins/antigravity/` posé sur `conversationId`, dans la forme `{"injectSteps":[{"ephemeralMessage":…}]}`. Sans bloc, `{}`.
2. **Pas de SessionStart** dans l'entrée `leon` : l'appli 2.0.1 ne l'appelle pas. Une entrée posée avant l'essai le perd à la prochaine installation.
3. **La capture** sur Stop (`crochet antigravity tour`, 30 s), quand `fullyIdle` n'est pas faux, avec `workspacePaths[0]` comme dossier de travail.
4. **La conversation** : `conversationId`, à défaut `ANTIGRAVITY_CONVERSATION_ID`.
5. **Le transcript** : `transcript_full.jsonl` d'abord, à côté de `transcriptPath`, pour l'IDE ; le code de sortie d'une commande se lit dans `exit_code` quand l'étape le porte.

## Ce qui reste à essayer

- **L'IDE 2.5.5** : SessionStart, PreToolUse et PostToolUse y tournent peut-être, et `systemMessage` avec eux.
- **`agy`**, la ligne de commande, une fois installée.
- **La durée de vie de l'`ephemeralMessage`** : au second message, le modèle cite-t-il encore les mots témoins ? Si non, le bloc ne vaut que pour le premier appel, et c'est la consigne de lecture (`leon fil`, lot 12) qui porte la suite ; ou bien il faut l'injecter au premier appel de chaque message (`invocationNum` 0), au prix de 8 000 octets à chaque message.
- **Les arguments de `manage_task`**, la liste de tâches de l'agent, pour remplir `taches` : le rapport du témoin donne désormais les noms des arguments de chaque outil, jamais leurs valeurs.

## Remise en état

`~/.gemini/config/hooks.json` n'existait pas avant l'essai : après `retirer`, il ne contenait que `{}` et a été supprimé. Rien d'autre n'a été changé dans `~/.gemini`. Le journal du témoin (`~/.leon-essai/`) et le dossier de test sont à effacer à la main.
