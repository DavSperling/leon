# Annexe 11 : l'essai réel d'Antigravity pour les coulisses (T50)

Essai du 13 novembre 2026, annexe écrite le 17 novembre · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte de la quatrième PR du lot 14 du [plan de la mémoire à disposition](../../../plans/2026-11-03-memoire-a-disposition.md)

> Essai fait dans l'**appli Antigravity 2.31.0** (la variante `antigravity` du dossier `~/.gemini`), avec le modèle **Claude Opus 4.6 (Thinking)**, le 13/11/2026 vers 11 h 45, par Amos devant l'appli, dans un dépôt jetable (`leon-essai-coulisses-antigravity`, avec un seul fichier inventé, `a.txt`). Le pas à pas est dans [`protocole.md`](../essais/coulisses-autres-outils/protocole.md) : deux messages, le premier demande deux sous-agents (l'un lit `a.txt`, l'autre va chercher une page web), le second lance une commande qui échoue (`ls` d'un fichier absent) et une commande réseau (`curl`). Ni l'IDE ni `agy` (la ligne de commande) ne sont essayés.
>
> **Sources.** Cette annexe ne repose que sur le relevé de forme du script témoin ([`antigravity-coulisses.mjs`](../essais/coulisses-autres-outils/antigravity-coulisses.mjs)) et de son complément, dans [`releves/`](../essais/coulisses-autres-outils/releves/) : [`antigravity-noms.txt`](../essais/coulisses-autres-outils/releves/antigravity-noms.txt) (pour chaque conversation : les fichiers et leurs tailles, les clés des fiches, les clés de chaque étape, des longueurs de chaînes). Il ne contient que des noms de champs, des types et des longueurs ; les identifiants sont masqués. Aucun texte n'a été relevé, aucune vraie conversation n'a été lue. Ce que le relevé ne montre pas est écrit « non vu à l'essai ».
>
> **Ce qui a tourné.** Trois conversations relevées : la session et ses deux sous-agents (un sous-agent de recherche qui lit un fichier, un sous-agent de navigateur). **Cette version n'écrit plus le dossier de travail dans le transcript** : aucun appel n'a de `Cwd`, et l'entrée de l'utilisateur n'a pas de bloc `<user_information>`. Le témoin a donc reconnu la discussion d'essai à ses messages exacts (le relevé la nomme `messages_de_l_essai`), puis ses deux sous-agents au lien qui les nomme. Une commande qui échoue reste en `DONE` ; une commande refusée est en `ERROR`. Aucun outil d'écriture et aucun appel MCP n'ont été essayés.

## Verdict

**Positif.** Le raisonnement est écrit dans le transcript, chaque appel d'outil est suivi de son résultat (l'étape qui le suit), et chaque sous-agent est nommé par sa conversation, avec une consigne, un rapport et une fin lisibles. T63 et T52 se codent pour Antigravity. Deux limites à connaître : l'appli n'écrit plus le code de sortie d'une commande (une commande qui échoue reste `DONE`), et le dossier de travail ne se lit plus dans le transcript.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| Le raisonnement porte-t-il son texte ? | **Oui.** Une étape `PLANNER_RESPONSE` (`source: 'MODEL'`) porte un champ `thinking`, une chaîne de 101 à 567 caractères dans la session et dans les sous-agents. Une étape qui ne fait qu'appeler des outils en porte aussi un. Certaines étapes n'en ont pas (la dernière réponse, un appel sans réflexion). Que ce soit la réflexion entière ou un résumé ne se lit pas dans une forme : le texte d'accord du plan dit « en entier ». |
| La forme d'une étape | Une étape par ligne du transcript : `step_index`, `source`, `type`, `status`, `created_at`, et selon l'étape `content`, `thinking`, `input_tokens`, `cache_read_tokens`, `output_tokens`, `error`, `media`, plus les appels d'outils `{ name, args }`. Sources : `USER_EXPLICIT`, `MODEL`, `SYSTEM`. Types : `USER_INPUT`, `PLANNER_RESPONSE`, `GENERIC`, `SYSTEM_MESSAGE`, `ERROR_MESSAGE`. Statuts : `DONE`, `ERROR`. **Aucune étape `RUN_COMMAND`** (l'annexe 5 en voyait en 2.0.1) **et aucun `exit_code`**. |
| Où vivent les échanges des sous-agents ? | **Dans des conversations à part**, chacune dans son dossier `brain/<identifiant>/`, avec la même structure que la session : `.system_generated/logs/transcript.jsonl` et `transcript_full.jsonl`, un dossier `messages/` avec ses fiches, un dossier `steps/`. La session les nomme dans `.system_generated/subagents/<identifiant>.json` (deux fiches ici). Une fiche a pour clés `conversationId`, `subagentDescriptor` (`typeName`, `role`), `state`, `spawnStepIndex` et `workspaceUris` (un tableau d'un élément). |
| Comment un appel se relie-t-il à son sous-agent ? | **Pas d'un lien sûr.** L'appel est un élément de `tool_calls` de la forme `{ name: 'invoke_subagent', args }`, avec `Prompt`, `Role`, `TypeName` et, sur l'un des deux seulement, `Model`. Les deux appels sont dans la **même étape** (l'étape 1) : `spawnStepIndex` ne les sépare pas. Le résultat des deux appels est dans les étapes 2 et 3. Dans l'essai, `typeName` et `role` d'une fiche ont la longueur de `TypeName` et de `Role` de l'un des appels (`research` : 8 caractères, `browser` : 7), mais deux appels peuvent porter les mêmes valeurs : la recette ne s'en sert pas. Ce qui compte, c'est le nombre : deux appels, deux fiches. |
| La forme de la consigne | L'argument `Prompt` de l'appel `invoke_subagent` (115 et 113 caractères dans `transcript_full.jsonl`). Dans la conversation du sous-agent, **la première étape est un `SYSTEM_MESSAGE`** (415 et 417 caractères, balises `SYSTEM_MESSAGE`), pas un `USER_INPUT` : c'est ce qui distingue sa conversation d'une session. Chaque sous-agent a aussi, dans son dossier `messages/`, une fiche dont le `content` a la longueur du `Prompt` de l'appel (115 et 113). |
| La forme du rapport | Un appel **`send_message`** du sous-agent vers la session (`args` : `Message`, `Recipient`). Le `Recipient` est l'identifiant de la conversation mère (36 caractères). Le sous-agent du navigateur en fait deux (étapes 3 et 9), le sous-agent de recherche un (étape 3) : le rapport est le `Message` du dernier. Le résultat de chaque `send_message` est une étape `GENERIC` de 133 caractères, la même longueur partout. Chaque envoi laisse aussi une fiche dans `messages/` (`id`, `recipient`, `sender`, `priority`, `timestamp`, `content`, `sourceMetadata.tool`, `renderDetails.messageTitle`), dont le `content` a la longueur du `Message` (151, 115 et 69 caractères pour les trois envois des sous-agents) : la recette ne lit pas ces fiches. La session envoie elle aussi un `send_message` à un sous-agent (étape 14, `Message` de 85 caractères) : c'est un appel comme un autre, pas un rapport. |
| Les appels d'outils | Éléments `{ name, args }` de `tool_calls` d'une étape `PLANNER_RESPONSE`. Noms vus : **`invoke_subagent`**, **`send_message`**, **`run_command`** (`args` : `CommandLine`, `WaitMsBeforeAsync`, `toolSummary`, et `BypassSandbox` sur l'appel refusé), **`webview_browser`** (`intention`, `observation`, `script`) et **`read_file`** (`Path`). **Aucun `Cwd`.** Une étape peut porter plusieurs appels (deux dans les étapes 1 et 21 de la session). Dans `transcript_full.jsonl`, les valeurs de `args` ont leur type (`WaitMsBeforeAsync` est un nombre, `BypassSandbox` un booléen) ; dans `transcript.jsonl`, **chaque valeur est une chaîne** (un nombre y est une chaîne, `true` aussi, et chaque chaîne y est plus longue de 2 caractères, comme si elle était écrite entre guillemets). Le fichier complet se lit d'abord. |
| Le résultat d'un appel | **C'est l'étape qui suit**, pas une étape `RUN_COMMAND`. Après une étape à k appels, les k étapes suivantes de source `MODEL` qui ne sont pas des `PLANNER_RESPONSE` sont leurs résultats, dans l'ordre : étapes 2 et 3 après l'étape 1, étape 15 après l'étape 14, étapes 22 et 23 après l'étape 21, étape 25 après l'étape 24. Une étape de source `SYSTEM` entre deux (l'étape 4, l'étape 6) n'en est pas un. Le texte du résultat est dans `content` (jusqu'à 2 043 caractères, avec les balises `untrusted_page_content` et un champ `media` pour la page web du navigateur) ; la sortie de certains appels (`invoke_subagent`, `run_command`, `send_message`) est aussi dans `steps/<n>/output.txt` (de 55 à 471 octets), pas celle de la commande refusée, ni celles de `read_file` et de `webview_browser`. Ni l'un ni l'autre ne part. |
| Le statut d'un appel | Le `status` de l'étape de résultat. `DONE` pour la commande qui échoue et pour la commande réseau (étapes 22 et 23) : **l'appli n'écrit plus de code de sortie, une commande en échec reste `DONE`**. `ERROR` pour la commande refusée par Amos (étape 25 : un champ `error` de 343 caractères, et la commande avait `BypassSandbox`). Une étape de résultat `ERROR` n'est pas toujours un refus : la première tentative du sous-agent du navigateur (`webview_browser`) est en `ERROR` aussi (`error` de 481 caractères), pour une cause que le relevé ne dit pas. Pas d'étape de résultat : l'appel est sans résultat. |
| La marque de fin d'un sous-agent | **La dernière étape de sa conversation est une `PLANNER_RESPONSE` sans appel d'outil** (étape 11 du navigateur, étape 7 de la recherche). Le `state` des fiches n'aide pas : il est resté `SUBAGENT_STATE_ALIVE` pour les deux sous-agents, qui avaient fini. |
| Un sous-agent inachevé | **Non vu à l'essai.** Par la forme, une dernière étape qui est un appel d'outil (ou sans résultat) n'est pas une fin. |
| Un sous-agent qui en lance un autre | **Non vu à l'essai.** |
| Les étapes `ERROR_MESSAGE` | Deux étapes de source `SYSTEM`, de type `ERROR_MESSAGE`, de statut `DONE`, avec un champ `error` (115 caractères dans la session, étape 4 ; 124 dans le sous-agent de recherche, étape 6). Ce ne sont pas des résultats d'appel. Leur cause : non relevée. |
| Le dossier de travail | **Absent du transcript.** Pas de `Cwd` dans les appels, pas de bloc `<user_information>` dans l'entrée (les balises de la première entrée sont `USER_REQUEST`, `ADDITIONAL_METADATA` et `USER_SETTINGS_CHANGE`). La fiche de chaque sous-agent a `workspaceUris` : sa valeur n'est pas relevée. |
| Les doublons de fichiers | Le dossier `logs/` de chaque conversation a `transcript.jsonl`, `transcript_full.jsonl` et un dossier `chunks/` avec une copie de chacun (même taille : 16 452 et 16 384 octets pour la session, 9 233 et 9 183 pour le sous-agent du navigateur, 2 870 et 2 858 pour celui de la recherche). Le dossier du navigateur écrit aussi des captures (`.png`) et des sorties (`browser_sandbox/`, `browser_evidence/`) : jamais lus. |
| Ce que le relevé ne couvre pas | Aucun outil d'écriture (`write_to_file`, `replace_file_content`), de recherche (`grep_search`), de liste (`list_dir`), ni appel MCP : **non vus à l'essai**. Leurs noms viennent de l'[annexe 5](05-essai-antigravity.md) et du lecteur existant. |

Un extrait du relevé `antigravity-noms.txt` (formes seulement) montre un tour où la session lance deux sous-agents, puis le résultat des deux appels :

```
étape 1 : {"step_index":"number","source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE",…,"content":"chaine(43)","thinking":"chaine(474)"}
   appel invoke_subagent args {"Prompt":"chaine(115)","Role":"chaine(11)","TypeName":"research"}
   appel invoke_subagent args {"Model":"chaine(5)","Prompt":"chaine(113)","Role":"chaine(22)","TypeName":"browser"}
étape 2 : {"step_index":"number","source":"MODEL","type":"GENERIC","status":"DONE","created_at":"chaine(20)","content":"chaine(549)"}
étape 3 : {"step_index":"number","source":"MODEL","type":"GENERIC","status":"DONE","created_at":"chaine(20)","content":"chaine(549)"}
étape 4 : {"step_index":"number","source":"SYSTEM","type":"ERROR_MESSAGE","status":"DONE","error":"chaine(115)","created_at":"chaine(20)"}
```

et une commande qui échoue, puis une commande refusée :

```
étape 21 : … PLANNER_RESPONSE … "thinking":"chaine(389)"
   appel run_command args {"CommandLine":"chaine(21)","WaitMsBeforeAsync":"number","toolSummary":"chaine(17)"}
   appel run_command args {"CommandLine":"chaine(28)","WaitMsBeforeAsync":"number","toolSummary":"chaine(18)"}
étape 22 : {…"source":"MODEL","type":"GENERIC","status":"DONE",…,"content":"chaine(411)"}
étape 23 : {…"source":"MODEL","type":"GENERIC","status":"DONE",…,"content":"chaine(371)"}
étape 24 : … PLANNER_RESPONSE … "content":"chaine(97)"
   appel run_command args {"BypassSandbox":"boolean","CommandLine":"chaine(28)","WaitMsBeforeAsync":"number","toolSummary":"chaine(18)"}
étape 25 : {…"source":"MODEL","type":"GENERIC","status":"ERROR","error":"chaine(343)",…,"content":"chaine(458)"}
```

## La recette ajustée

C'est celle des amendements du 17/11 du plan (T52 et T63) ; le relevé ci-dessus en est la preuve.

1. **Où chercher.** La session nomme ses sous-agents dans `.system_generated/subagents/<identifiant>.json`, à côté de son dossier `logs/`. Chacun est une conversation à part, `brain/<identifiant>/`, lue comme une session (`transcript_full.jsonl`, sinon `transcript.jsonl`), dans la même variante. L'identifiant est validé (un UUID) avant de servir à un chemin.
2. **Le rapport final.** Un sous-agent a rendu la main quand la dernière étape de sa conversation est un `PLANNER_RESPONSE` sans appel d'outil. Le `state` de la fiche n'est pas lu.
3. **La règle de T63.** `invoke_subagent` et `send_message` ne rendent plus la session externe à eux seuls. La session est externe :
   - s'il y a moins de sous-agents nommés que d'appels `invoke_subagent` ;
   - si la conversation d'un sous-agent ne se retrouve pas, ou porte une ligne illisible ;
   - s'il n'a pas rendu la main ;
   - si l'un de ses appels est externe par la règle de la session (le navigateur, le web, une commande réseau, un outil inconnu) : le sous-agent du navigateur de l'essai l'est ;
   - ou si l'un de ses propres sous-agents rend externe.
4. **La conversation d'un sous-agent n'est pas une session.** Sa première étape est un `SYSTEM_MESSAGE`, pas un `USER_INPUT` : le lecteur la reconnaît à cela, en plus de l'ancienne forme (`<subagent_reminder>`), et ne la capte plus. Elle partait jusqu'ici comme une session sans message.
5. **Les faits de la 2.31.0.** Le résultat d'un appel est l'étape qui le suit : les faits y lisent l'erreur d'une commande (`ERROR`, ou un code de sortie cité dans le texte) et sa sortie (les commits, la PR créée). `read_file` rejoint les outils locaux de lecture : c'est le nom de `view_file` dans cette version.
6. **Le rapport d'un sous-agent ne devient pas un tour** sous l'accord de base : le texte de base d'Antigravity ne le nomme pas. Il ne part qu'avec `coulisses`. À faire trancher par Amos (comme sa décision 7 pour Claude Code).
7. **Les coulisses (T52).**
   - Le raisonnement : le champ `thinking` de chaque étape `PLANNER_RESPONSE`, s'il n'est pas vide après préparation. Celui d'un sous-agent ne part pas.
   - Un appel : chaque élément de `tool_calls` d'une étape `PLANNER_RESPONSE`, par une table fermée. `run_command` donne `Bash` (la cible par `reduceCommand` sur `CommandLine`) ; `read_file` et `view_file` donnent `Read`, `write_to_file` donne `Write`, `replace_file_content` donne `Edit`, avec le chemin pour cible ; `grep_search` et `list_dir` gardent leur nom commun (`Grep`, `LS`), sans cible ; les autres outils connus gardent leur nom, sans cible ; un nom inconnu part en `[outil]`.
   - Le résultat d'un appel est l'étape qui le suit (ligne « Le résultat d'un appel » plus haut). Il ne sert qu'au statut : `erreur` si l'étape est en `ERROR`, `ok` si elle est en `DONE`, `sans_resultat` s'il n'y en a pas.
   - La consigne : le `Prompt` de l'appel `invoke_subagent` (jamais `Role`, `TypeName` ni `Model`). Le rapport : le `Message` du dernier `send_message` du sous-agent dont le `Recipient` contient l'identifiant de la conversation qui l'a lancé, seulement s'il a fini. Le `Message` d'un `send_message` de la session vers un sous-agent ne part pas comme un rapport.
   - L'identifiant d'un bloc : le rang de l'étape (`step_index`), puis le rang de l'appel dans l'étape ; pour un sous-agent, l'identifiant de sa conversation vient devant.
   - Elles partent après 30 minutes sans changement de la conversation (pas de fin de session sûre).

## Ce qui reste à essayer

- **Le dossier de travail d'une session de la 2.31.0** : où le lire maintenant (le `workspaceUris` des fiches de sous-agents, le contenu de `ADDITIONAL_METADATA` ou de `USER_SETTINGS_CHANGE` : leurs valeurs ne sont pas relevées).
- **Le code de sortie d'une commande** : l'appli ne l'écrit plus, ou l'écrit ailleurs (`steps/<n>/output.txt`, le texte du résultat) : non vu.
- **Un outil d'écriture** (`write_to_file`, `replace_file_content`) et **un appel MCP** : leurs formes, jamais relevées à cet essai.
- **Un refus d'un outil autre que `run_command`**, et la cause de l'étape `ERROR` du navigateur.
- **Un sous-agent qui en lance un autre**, et **un sous-agent coupé** avant sa fin.
- **L'IDE** (variante `antigravity-ide`, dont l'annexe 5 a vu un transcript coupé) et **`agy`** (variante `antigravity-cli`) : non essayés.
- **Les autres versions** de l'appli : la forme vient de la 2.31.0 seulement (l'annexe 5 avait la 2.0.1).

## Remise en état

- **Supprimés par Amos** : les sessions d'essai d'Antigravity et leurs dossiers (la discussion d'essai, ses sous-agents et le dépôt jetable). **La suppression a été contrôlée par le témoin le 17/11** : plus aucune conversation de l'essai.
- **Les crochets d'Antigravity** (`~/.gemini/config/hooks.json`) étaient mis de côté le temps de l'essai, et à remettre en place en dernier, selon le protocole : leur remise en place n'est pas rapportée par le relevé, à confirmer par Amos.
- **Gardés** : le script témoin [`antigravity-coulisses.mjs`](../essais/coulisses-autres-outils/antigravity-coulisses.mjs), son complément et le relevé de forme, dans [`essais/coulisses-autres-outils/`](../essais/coulisses-autres-outils/). Le script refuse de tourner (code 2) si le dossier d'essai ne porte pas `leon-essai-coulisses`.
