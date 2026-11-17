# Annexe 9 : l'essai réel de Codex pour les coulisses (T50)

Essai du 13 novembre 2026, annexe écrite le 17 novembre · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte de la quatrième PR du lot 14 du [plan de la mémoire à disposition](../../../plans/2026-11-03-memoire-a-disposition.md)

> Essai fait avec **codex-cli 0.159.0** (d'après Amos ; `multi_agent_version` : `v2`, lui, est relevé), le 13/11/2026 vers 10 h 56, par Amos devant l'appli, dans un `CODEX_HOME` d'essai (`leon-essai-coulisses-codex-home`) et un dépôt jetable (`leon-essai-coulisses-codex`, avec un seul fichier inventé, `a.txt`). Codex était lancé avec `--search` et `-c model_reasoning_summary=detailed`. Le pas à pas est dans [`protocole.md`](../essais/coulisses-autres-outils/protocole.md) : deux messages, le premier demande deux sous-agents (l'un lit `a.txt`, l'autre va chercher une page web), le second lance une commande qui échoue (`ls` d'un fichier absent) et une commande réseau (`curl`).
>
> **Sources.** Cette annexe repose sur les relevés de forme du script témoin ([`codex-coulisses.mjs`](../essais/coulisses-autres-outils/codex-coulisses.mjs)) et de ses compléments, dans [`releves/`](../essais/coulisses-autres-outils/releves/) : [`codex-noms.txt`](../essais/coulisses-autres-outils/releves/codex-noms.txt) (les clés de chaque sorte de ligne), [`codex-ordre.txt`](../essais/coulisses-autres-outils/releves/codex-ordre.txt) (l'ordre des lignes de chaque fichier) et [`codex-details.txt`](../essais/coulisses-autres-outils/releves/codex-details.txt) (les clés des sous-éléments, des longueurs). Ils ne contiennent que des noms de champs, des types, des longueurs et des identifiants masqués (un nom comme `/aaaa/aaaa_a` est un gabarit : lettres en « a », chiffres en « 9 »), plus ce qu'Amos a dit après l'essai (la version) : ce second type de fait est marqué « d'après Amos ». Aucun texte n'a été relevé, aucune vraie conversation n'a été lue. Ce que les relevés ne montrent pas est écrit « non vu à l'essai ».
>
> **Ce qui a tourné.** Trois fichiers relevés : la session et ses deux sous-agents (deux tours dans la session, un par message). Aucune approbation n'a été demandée, donc la forme d'un refus n'est pas vue. La commande réseau a échoué avec le code 6 : le bac à sable de Codex coupe le réseau. Aucun appel MCP n'a été fait. La version est, d'après Amos, la 0.159.0, celle que visait le plan ; l'[annexe 3](03-essai-codex.md) avait vu la 0.167.0.

## Verdict

**Positif.** Un sous-agent est un fichier à part, relié à son appel par l'élément `SubAgentActivity`, avec une consigne, un rapport et une marque de fin. Chaque commande a son statut. Le résumé du raisonnement est écrit quand Codex en fait un : à l'essai, deux fois sur trois il était vide, et le seul qui portait du texte était celui d'un sous-agent, qui ne part pas. T63 et T52 se codent pour Codex, dans la forme paginée (`history_mode: 'paginated'`) vue ici.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| Le raisonnement porte-t-il son texte ? | **Parfois, en résumé.** Un `response_item` de type `reasoning` (clés `id`, `summary`, `encrypted_content`, `type`), précédé d'un élément `Reasoning` (`summary_text`, `raw_content`). `raw_content` est un tableau vide les trois fois : Codex n'écrit pas la réflexion brute. `summary` est un tableau vide dans deux cas sur trois (le fichier de la session et le premier sous-agent) et porte un bloc `{ text, type }` dans le troisième (le sous-agent du web), alors que `model_reasoning_summary=detailed` était demandé (`turn_context.summary` vaut `detailed`). Le résumé de la session elle-même était donc vide. `encrypted_content` (de 2 124 à 3 492 caractères) n'est pas un texte lisible : il ne part jamais. Un seul raisonnement est écrit pour les deux tours de la session. |
| Où vivent les échanges des sous-agents ? | **Dans des fichiers à part**, un `rollout-<date>-<identifiant>.jsonl` par sous-agent (la forme de nom que reconnaît le témoin, sous `sessions/AAAA/MM/JJ`). Le fichier du sous-agent commence par son propre `session_meta` (`thread_source: 'subagent'`, `depth: 1`, `multi_agent_version: 'v2'`, `agent_path`, `agent_nickname`, `parent_thread_id`, `forked_from_id`, `subagent_history_start_ordinal`, et `source.subagent.thread_spawn` avec `agent_nickname`, `agent_path`, `agent_role`, `depth`, `parent_thread_id`). **Il recopie ensuite l'historique de la session mère** : un second `session_meta` (`thread_source: 'user'`), puis les lignes du premier tour de la mère (les messages `developer` et `user`, `world_state`, `turn_context`). Ces lignes recopiées portent la marque `metadata.inherited_user_message`. Les lignes propres du sous-agent commencent au `task_started` suivant. Les relevés ne notent pas le dossier de chaque fichier, ni si le fichier d'un sous-agent est à côté de celui de la session : le plan le retient (voir la recette). |
| Où commencent les lignes propres d'un sous-agent ? | `subagent_history_start_ordinal` vaut **9** dans le fichier du premier sous-agent et **10** dans celui du second. Dans l'ordre des lignes du relevé (la première ligne porte le rang 0), le `task_started` propre est au rang 10 dans le premier fichier et au rang 11 dans le second. Le relevé ne note pas la valeur des `ordinal` des lignes : la correspondance n'est pas vérifiée ici, elle se vérifie sur fixture dans le code. Le premier `task_started` du fichier (rang 2) est celui du tour recopié : il n'est jamais suivi d'un `task_complete` dans le fichier. |
| Comment un appel se relie-t-il à son fichier ? | L'appel est un `response_item` de type `function_call` : `name` vaut `spawn_agent`, `namespace` vaut `collaboration`, et `arguments` est une chaîne (322 et 261 caractères) dont les clés sont `fork_turns`, `message` et `task_name`. Sa sortie (`function_call_output`) est une chaîne courte (28 et 31 caractères) dont la seule clé est `task_name` : **elle ne donne pas l'identifiant du fil**. Il vient de l'élément `event_msg` / `item_completed` / `SubAgentActivity`, écrit entre l'appel et sa sortie (rangs 14, 16, 17 puis 20, 22, 23) : `kind: 'started'`, `agent_path`, `agent_thread_id`, `id`, `type`. L'identifiant du fil est celui du fichier du sous-agent (le plan le retient ; les identifiants sont masqués dans les relevés, l'égalité avec le nom du fichier n'y est donc pas lisible). Le nom de la tâche (`task_name`) est la fin du `agent_path` (`/<racine>/<nom de la tâche>`). |
| La forme de la consigne | Dans la session : le champ `message` des `arguments` de l'appel `spawn_agent`. Dans le fichier du sous-agent : un `response_item` de type `agent_message` (`author` : le chemin de la mère, `recipient` : le chemin du sous-agent, `content` : un bloc `input_text` suivi d'un bloc `encrypted_content`), précédé d'une ligne `inter_agent_communication_metadata` (`trigger_turn`). Le bloc chiffré n'est pas un texte. Les autres arguments (`task_name`, `fork_turns`) ne sont pas des textes à envoyer. |
| La forme du rapport | **Trois endroits.** (1) Le fichier du sous-agent finit par un `response_item` de type `message` (`role: 'assistant'`, `phase: 'final_answer'`, bloc `output_text`), puis `task_complete`, dont `last_agent_message` est une chaîne. (2) Le fichier de la session reçoit le rapport en `response_item` de type `agent_message` (`author` : le sous-agent, `recipient` : la mère, `content` : un bloc `input_text`), après une ligne `inter_agent_communication_metadata`. (3) Entre les deux, l'appel `wait_agent` (`namespace: 'collaboration'`, argument `timeout_ms`) a pour sortie une chaîne (47 caractères) de clés `message` et `timed_out`, et l'élément `CollabAgentToolCall` (`tool: 'wait'`, `status: 'completed'`, `agents_states`). L'élément `SubAgentActivity` de `kind: 'completed'` marque la fin du sous-agent. |
| Les appels d'outils | Deux écritures de chaque appel. D'abord le `response_item` : un `custom_tool_call` (`name: 'exec'`, `status: 'completed'`, `call_id`, `input` : une chaîne de 95 à 338 caractères) et son `custom_tool_call_output` (`output` : un tableau de 2 ou 3 éléments). Puis l'élément `item_completed` : **`CommandExecution`** (`command` : un tableau de 3 éléments, `parsed_cmd` : un tableau d'un élément, `cwd`, `source: 'unified_exec_startup'`, `status`, `exit_code`, `duration`, `process_id`, et quatre champs de sortie : `aggregated_output`, `stdout`, `stderr`, `formatted_output`). **Un seul appel `exec` peut lancer plusieurs commandes** : dans la session, un `custom_tool_call` (rang 56) est suivi de deux `CommandExecution` (rangs 58 et 59), puis de sa sortie (rang 60). Les `CommandExecution` se lisent donc par ordre, entre un appel et sa sortie, non par `call_id` (les identifiants sont masqués dans les relevés). |
| Le statut d'un appel | Le `status` et l'`exit_code` de l'élément `CommandExecution` : `failed` avec `exit_code: 1` (le `ls` d'un fichier absent), `failed` avec `exit_code: 6` (le `curl`, le réseau étant coupé par le bac à sable : la clé `sandbox_policy.network_access` existe dans `turn_context`), `completed` avec `exit_code: 0` (la commande du sous-agent de lecture). Une commande qui échoue a donc un `status` autre que `completed` **et** un code non nul. Le statut se lit dans l'élément, jamais dans la sortie. |
| Le web dans un sous-agent | Le sous-agent du web passe lui aussi par un appel `exec` (`input` de 105 caractères). L'élément qui en résulte n'est pas une commande mais un élément **`Extension`** (`kind`, `action` avec les clés `type` et `url`, `query`, `results`). L'URL et la requête sont des données qui ne partent jamais. |
| Les sous-agents dans l'ordre | Dans la session : `spawn_agent` (rang 14), `SubAgentActivity` démarré (16), second `spawn_agent` (20), `SubAgentActivity` démarré (22), puis `wait_agent` (26), `SubAgentActivity` terminé (28), `wait_agent` (34), `SubAgentActivity` terminé (36). Les deux sous-agents sont donc lancés l'un après l'autre avant que la mère n'attende le premier, puis le second. Chacun a son `agent_path`. |
| La marque de fin d'un sous-agent | Le dernier `task_started` du fichier est suivi d'un `task_complete` (rangs 10 et 27 dans le fichier du premier sous-agent, 11 et 28 dans le second). C'est aussi un `SubAgentActivity` de `kind: 'completed'` dans la session. Le tout premier `task_started` du fichier, lui, est celui du tour recopié : il ne se ferme jamais. |
| Un sous-agent inachevé | **Non vu à l'essai** : les deux sous-agents ont fini. Par la forme, un dernier `task_started` sans `task_complete` après lui est un sous-agent qui n'a pas fini. |
| Un sous-agent qui en lance un autre | **Non vu à l'essai** : les deux fichiers ont `depth: 1`. La clé `depth` (et `parent_thread_id`) existe, la récursion se lit donc par les mêmes clés. |
| Un refus d'approbation | **Non vu à l'essai** : aucune approbation n'a été demandée (`turn_context` porte `approval_policy` et `sandbox_policy`, avec `network_access`). La forme d'un refus n'est pas connue : le code traite tout `status` autre que `completed` comme une erreur, ce qui couvre le cas. |
| Un appel MCP, un changement de fichier | **Non vus à l'essai** : aucun élément `McpToolCall` ni `FileChange`. Leurs noms viennent du lecteur existant, pas de cet essai. |
| La forme de la session | `history_mode: 'paginated'` partout. Les lignes portent `ordinal`, `payload`, `timestamp`, `type` ; plusieurs portent un `metadata` (`client_authored`, `mcp_attribution`, `retained_source`, `user_input_order`…). Deux tours dans la session (`task_started` aux rangs 1 et 48, `task_complete` aux rangs 46 et 66). La forme **non paginée** (une version d'avant) : non vue à l'essai. `multi_agent_version` : `v2` seulement, la `v1` n'est pas vue. |

Un extrait de l'ordre des lignes du fichier d'un sous-agent (le relevé `codex-ordre.txt`, noms en gabarit) montre la recopie de l'historique puis les lignes propres :

```
0 session_meta thread_source=subagent history_mode=paginated depth=1 subagent_history_start_ordinal=9 multi_agent_version=v2 agent_path~/aaaa/aaaa_a parent_thread_id:present forked_from_id:present
1 session_meta thread_source=user history_mode=paginated
2 event_msg/task_started
  … l'historique recopié de la session mère …
9 event_msg/thread_settings_applied
10 event_msg/task_started
14 inter_agent_communication_metadata
15 response_item/agent_message author~/aaaa recipient~/aaaa/aaaa_a content[input_text,encrypted_content]
18 response_item/custom_tool_call name=exec status=completed
20 event_msg/item_completed/CommandExecution item_status=completed exit_code=0
24 response_item/message role=assistant phase=final_answer content[output_text]
27 event_msg/task_complete
```

Et l'extrait de la session, pour un sous-agent lancé puis attendu :

```
14 response_item/function_call name=spawn_agent
16 event_msg/item_completed/SubAgentActivity kind=started agent_path~/aaaa/aaaa_a
17 response_item/function_call_output
26 response_item/function_call name=wait_agent
28 event_msg/item_completed/SubAgentActivity kind=completed agent_path~/aaaa/aaaa_a
29 event_msg/item_completed/CollabAgentToolCall item_status=completed item_tool=wait
32 inter_agent_communication_metadata
33 response_item/agent_message author~/aaaa/aaaa_a recipient~/aaaa content[input_text]
```

Autres faits utiles au code :
- Les fichiers portent beaucoup de lignes qui ne sont pas de la conversation : `world_state`, `token_usage_record`, `event_msg/token_count`, `event_msg/thread_settings_applied`, `turn_context`, `inter_agent_communication_metadata`. Un lecteur ne lit que celles dont il a besoin.
- Le texte de l'agent est écrit deux fois : en `response_item` de type `message` (`phase: 'commentary'` ou `'final_answer'`) et en élément `AgentMessage`. Un lecteur ne compte qu'un des deux.
- Le message de l'utilisateur est lui aussi écrit deux fois : `response_item` de type `message` (`role: 'user'`) et élément `UserMessage`. Dans le fichier d'un sous-agent, celui de la mère est recopié.
- `task_complete` porte `last_agent_message`, `duration_ms`, `time_to_first_token_ms`, `turn_id`.
- Le sous-agent travaille avec `effort: 'medium'` (clé présente dans son `turn_context`) ; celle de la mère est absente.

## La recette ajustée

C'est celle des amendements du 17/11 du plan (T52 et T63) ; les relevés ci-dessus en sont la preuve.

1. **Où chercher.** Le fichier d'un sous-agent est `rollout-<date>-<identifiant du fil>.jsonl`, dans le dossier du fichier de la session. On ne cherche pas dans un autre jour. Les relevés confirment la forme du nom, pas l'emplacement du fichier d'un sous-agent par rapport à celui de la session : un test sur fixture le fixe, et l'essai suivant le revérifie (voir plus bas).
2. **Le lien.** Chaque élément `SubAgentActivity` de `kind: 'started'` donne `agent_thread_id`, l'identifiant du fil du sous-agent. Il est validé (un UUID) avant de servir à un nom de fichier. Le lien ne passe ni par la sortie de `spawn_agent` (elle n'a que `task_name`) ni par un `call_id`.
3. **Le rapport final.** Un sous-agent a rendu son rapport quand le **dernier** `task_started` de son fichier est suivi d'un `task_complete`. Le premier ne sert pas : c'est celui du tour recopié, jamais fermé.
4. **La règle de T63.** `SubAgentActivity` et `CollabAgentToolCall` ne rendent plus la session externe à eux seuls. Un sous-agent la rend externe si :
   - son fichier ne se retrouve pas ;
   - sa première ligne `session_meta` ne dit pas la forme paginée, ou n'a pas `subagent_history_start_ordinal` ;
   - il n'a pas rendu son rapport final ;
   - l'un de ses éléments propres (à partir de ce rang) est externe par la règle de la session : l'élément `Extension` du sous-agent du web l'est, comme la commande `curl` ;
   - ou l'un de ses propres sous-agents rend externe, par la même règle. Un fil déjà visité n'est pas revisité.
5. **Hors forme paginée**, un appel `spawn_agent` reste externe.
6. **Le rapport d'un sous-agent n'était pas capté.** Codex 0.159 l'écrit en `response_item` de type `agent_message`, que le lecteur ne lisait pas, alors que le texte de base de Codex le promet. Il devient un tour `user` marqué injecté (T43), comme la notification `<subagent_notification>`.
7. **Les coulisses (T52).** Elles ne lisent que les lignes propres de la session (`ownLines`), et, pour un sous-agent, celles à partir de `subagent_history_start_ordinal`.
   - Le raisonnement : chaque `response_item` `reasoning` dont les textes de `summary[]` ne sont pas vides. Jamais `encrypted_content`. Celui d'un sous-agent ne part pas.
   - Un appel : chaque élément `item_completed`, par une table fermée. `CommandExecution` donne `Bash` (la cible par `reduceCommand`) ; `SubAgentActivity` de `kind: 'started'` donne `spawn_agent` ; `Extension` et `CollabAgentToolCall` gardent leur nom, sans cible. Un type inconnu part en `[outil]`.
   - Le statut : `erreur` si le `status` n'est pas `completed` ou si le code de sortie n'est pas nul, `ok` sinon.
   - La consigne : le `message` de l'appel `spawn_agent`. Le rapport : le `last_agent_message` du dernier `task_complete` du fichier du sous-agent, seulement s'il a fini.
   - L'identifiant d'un bloc : le rang de la ligne (`ordinal`), précédé de l'identifiant du fil pour un sous-agent.
   - Elles partent à la fin de la session : à l'évènement de fin en `codex exec`, sinon après 30 minutes sans changement du fichier (voir l'[annexe 3](03-essai-codex.md) : pas de fin sûre dans le terminal).

## Ce qui reste à essayer

- **Un refus d'approbation** : la forme de l'élément `CommandExecution` quand la personne refuse (son `status`, son `exit_code`).
- **Un appel MCP** (`McpToolCall`) et **un changement de fichier** (`FileChange`) : leurs clés, jamais relevées.
- **Un sous-agent qui en lance un autre** (`depth: 2`) et **un sous-agent coupé** avant son rapport.
- **L'emplacement exact** du fichier d'un sous-agent (même dossier que la session, même jour), y compris pour une session qui passe minuit.
- **Le résumé du raisonnement de la session elle-même** : pourquoi il était vide ici, et quand Codex l'écrit.
- **La forme non paginée** et **`multi_agent_version` `v1`** : non vues.
- **`codex exec`**, **une session reprise**, **une autre version** (la 0.167.0 de l'annexe 3).
- **Une interaction avec une commande déjà lancée** (`source: 'unified_exec_interaction'`) : non vue, le plan l'écarte.

## Remise en état

- **Supprimés par Amos** : les sessions d'essai et leurs dossiers (le `CODEX_HOME` d'essai et le dépôt jetable).
- **Le `~/.codex` d'Amos** n'était pas concerné, selon le protocole : l'essai tournait dans un `CODEX_HOME` à part, où les crochets de Leon n'existent pas.
- **Gardés** : le script témoin [`codex-coulisses.mjs`](../essais/coulisses-autres-outils/codex-coulisses.mjs), ses compléments et les relevés de forme, dans [`essais/coulisses-autres-outils/`](../essais/coulisses-autres-outils/). Le script refuse de tourner (code 2) si les chemins ne portent pas `leon-essai-coulisses`.
