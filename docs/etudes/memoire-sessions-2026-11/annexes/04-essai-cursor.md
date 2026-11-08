# Annexe 4 : l'essai réel de Cursor (T26)

8 novembre 2026 · David (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte du lot 8 du [plan](../../../plans/2026-11-02-memoire-sessions.md)

> Essai fait dans **l'éditeur Cursor**, sur macOS, avec le modèle grok-4.7-medium, dans un dossier de test vide. Les crochets reçoivent `cursor_version: 3.29.9`, alors que l'appli affiche 2.2.44 dans ses informations. `cursor-agent` n'est pas installé : la ligne de commande n'a pas été essayée. Un crochet témoin ([`essais/cursor-temoin.mjs`](../essais/cursor-temoin.mjs)), ajouté à `~/.cursor/hooks.json`, est branché sur sessionStart, beforeSubmitPrompt, stop et sessionEnd. Il ne note que la forme de son entrée (les clés, les types, les nombres, les booléens, les chemins et les identifiants ; d'un texte, sa seule longueur), et injecte deux mots témoins par `additional_context` : CORMORAN-7 au sessionStart, PELICAN-3 au premier beforeSubmitPrompt de la conversation, avec `continue: true`. Trois essais ont été faits : un premier, raté (voir plus bas) ; un sans délai, sur deux messages ; un avec un délai de 3 s sur chaque crochet, sur un message.

## Verdict

**La porte est franchie : Cursor donne au modèle le texte que beforeSubmitPrompt injecte par `additional_context`, et il le voit encore aux messages suivants.** Le modèle a cité PELICAN-3 au premier message, puis encore au second, alors que le mot n'avait été injecté qu'une fois. C'est la recette du lot 8 telle qu'elle est codée : le bloc au premier message, une seule fois par conversation.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| `additional_context` atteint le modèle | Oui, par beforeSubmitPrompt, avec `continue: true`. Le mot injecté reste dans la conversation : cité au second message. |
| beforeSubmitPrompt accepte `additional_context` | Oui. |
| À partir de quel délai il n'arrive plus | Il arrive encore à 3 s : **Cursor attend beforeSubmitPrompt** (chaque crochet a mis 3 009 à 3 011 ms). 1 s et 5 s pas essayés ; le délai posé par Leon est de 5 s. |
| sessionStart | Il tourne, mais son texte **n'est passé qu'avec le délai** de 3 s. Sans délai, sessionStart avait injecté CORMORAN-7 pour la bonne conversation, et le modèle ne l'a pas cité. Hypothèse : Cursor n'attend pas sessionStart, qui tourne en même temps que beforeSubmitPrompt ; avec le délai, Cursor attend beforeSubmitPrompt, et sessionStart a fini entre-temps. Non démontré (il faudrait un délai sur sessionStart seul). Il part aussi pour une conversation fantôme, sans dossier (`workspace_roots: []`), quelques secondes avant la vraie : sans doute l'onglet d'agent vide que Cursor ouvre seul. |
| sessionEnd | Jamais appelé. |
| L'entrée | Commune : `conversation_id`, `session_id` (la même valeur), `generation_id`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`, `model`, `model_id`, `model_params`. beforeSubmitPrompt : en plus `prompt`, `attachments`, `composer_mode`. stop : en plus `status` (`completed`), `loop_count`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`. |
| `transcript_path` | **Vide (`null`) dans sessionStart et beforeSubmitPrompt.** Il n'est donné qu'à stop, qui le reçoit aussi dans la variable `CURSOR_TRANSCRIPT_PATH` : `~/.cursor/projects/<slug>/agent-transcripts/<conversation>/<conversation>.jsonl`, où le slug est le dossier de travail, séparateurs en tirets, sans tiret au début. C'est le chemin que Leon déduit. |
| Le format du transcript | Des lignes `{ role, message: { content } }` (blocs `text` et `tool_use`) et `{ type: "turn_ended", status }`. Le message de la personne est dans `<user_query>`. Outils vus et noms de leurs arguments : Shell (`command`, `description`), Grep (`path`, `pattern`, `-i`, `head_limit`), Glob (`glob_pattern`, `target_directory`). |
| Le contexte injecté dans le transcript | Absent : les mots témoins n'apparaissent que dans les réponses du modèle. |
| Les crochets de Claude Code repris | **Oui** : Cursor lit `~/.claude/settings.json` et les extensions de Claude, et a lancé `leon briefing`. Il passe `cursor_version` dans l'entrée et `CURSOR_VERSION` dans l'environnement : la garde de Leon (isOtherToolHook, T06) fait taire `briefing` et `capter-session` sous Cursor, le bloc n'arrive donc pas deux fois. Il passe aussi `CLAUDE_PROJECT_DIR`. |
| Le dossier et l'environnement du crochet | Il tourne depuis `~/.cursor`, **pas depuis le dossier de travail**, qui vient de `workspace_roots`. Variables : `CURSOR_VERSION`, `CURSOR_PROJECT_DIR`, `CURSOR_WORKSPACE_LABEL`, `CURSOR_LAYOUT`, `CURSOR_USER_EMAIL`, `CURSOR_RIPGREP_PATH`, `CURSOR_TRANSCRIPT_PATH` (stop), `CLAUDE_PROJECT_DIR`. `node` est dans le PATH. |
| L'approbation et la lecture du fichier | Aucune approbation : Cursor a lu `~/.cursor/hooks.json`, `timeout` compris, sans rien demander. Le fichier n'existait pas avant l'essai. |
| Les dossiers protégés de macOS | **Le premier essai a raté** : le témoin était rangé dans `~/Downloads`, et macOS refuse à Cursor d'y lancer un script (EPERM). Les 7 appels ont planté avant de démarrer. Le lanceur `~/.leon/bin/leon` n'est pas concerné ; un clone de Leon rangé dans Documents, Bureau ou Téléchargements le serait, sous la forme clone du lanceur. |
| L'e-mail de la personne | Dans l'entrée (`user_email`) et dans `CURSOR_USER_EMAIL`. Leon ne le lit pas. |

## La recette ajustée

1. **Le bloc** arrive par beforeSubmitPrompt (`crochet cursor prompt`, 5 s), une fois par conversation (témoin posé sur `conversation_id`, à défaut `session_id`), dans la forme `{"continue":true,"additional_context":…}`. Sans bloc, `{"continue":true}`. Pas de sessionStart.
2. **La capture** sur stop (`crochet cursor tour`, 30 s), qui ne rend que `{}`. Le transcript vient de `transcript_path` ou de `CURSOR_TRANSCRIPT_PATH`, sinon du chemin déduit du dossier ; le dossier vient de `workspace_roots`.
3. **Pas de sessionEnd.**
4. **La garde des crochets de Claude Code** reste nécessaire : Cursor les lance.
5. **Le clone de Leon hors des dossiers protégés de macOS** : l'installateur prévient quand le lanceur, sous la forme clone, pointe vers Documents, Bureau ou Téléchargements.

## Ce qui reste à essayer

- **`cursor-agent`**, la ligne de commande, une fois installé.
- **L'ordre de sessionStart** : un délai sur sessionStart seul dirait s'il passe quand on l'attend. Leon n'en a pas besoin.
- **Les délais de 1 s et 5 s** sur beforeSubmitPrompt : celui de Leon répond en une requête de 3 s au plus.
- **Le reste des outils** (Write, StrReplace, ApplyPatch, TodoWrite, WebSearch, MCP) et les noms de leurs arguments, sur une session de travail plus longue : le rapport du témoin les donne.

## Remise en état

`~/.cursor/hooks.json` et sa copie `.avant-temoin` ont été supprimés, puisqu'aucun des deux n'existait avant l'essai. Rien d'autre n'a été changé dans `~/.cursor`. Restent à effacer à la main : `~/.leon-essai/`, le dossier de test, et `~/.cursor/projects/<slug du dossier de test>/`, que Cursor a créé avec les transcripts de l'essai.
