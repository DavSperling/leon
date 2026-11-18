# Annexe 10 : l'essai réel de Cursor pour les coulisses (T50)

Essai du 13 novembre 2026, annexe écrite le 17 novembre · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte de la quatrième PR du lot 14 du [plan de la mémoire à disposition](../../../plans/2026-11-03-memoire-a-disposition.md)

> Essai fait dans la **nouvelle fenêtre « Agents » de Cursor**, avec le modèle **Grok 4.7**, sur un **compte gratuit** (d'après Amos), le 13/11/2026 vers 11 h 30, par Amos devant l'appli, dans un dépôt jetable (`leon-essai-coulisses-cursor`, avec un seul fichier inventé, `a.txt`). La version de l'appli n'est pas notée dans les relevés. Le pas à pas est dans [`protocole.md`](../essais/coulisses-autres-outils/protocole.md) : deux messages, le premier demande deux sous-agents (l'un lit `a.txt`, l'autre va chercher une page web), le second lance une commande qui échoue (`ls` d'un fichier absent) et une commande réseau (`curl`).
>
> **Sources.** Cette annexe repose sur le relevé de forme du script témoin ([`cursor-coulisses.mjs`](../essais/coulisses-autres-outils/cursor-coulisses.mjs)) et de son complément, dans [`releves/`](../essais/coulisses-autres-outils/releves/) : [`cursor-noms.txt`](../essais/coulisses-autres-outils/releves/cursor-noms.txt) (les clés de chaque ligne et de chaque bloc, des longueurs de chaînes), plus ce qu'Amos a dit après l'essai (le modèle, le compte, les messages vus à l'écran) : ce second type de fait est marqué « d'après Amos ». Aucun texte n'a été relevé, aucune vraie conversation n'a été lue. Ce que le relevé ne montre pas est écrit « non vu à l'essai ».
>
> **Ce qui a tourné.** Cinq fichiers relevés : la conversation (5 498 octets) et quatre fichiers de sous-agents (180 octets chacun). **Sur ce compte, tout sous-agent échoue** : son fichier ne porte qu'une ligne `turn_ended` en erreur (130 caractères) ; d'après Amos, devant l'appli, le message était « Model unavailable on Free ». Une première discussion, ouverte hors du dossier d'essai (d'après Amos, la fenêtre l'appelle « No Repo »), est rangée ailleurs que sous le dossier du projet : le relevé ne la voit pas, et il a fallu refaire l'essai dans le dossier. Une commande refusée (d'après Amos, par « Skip ») ne laisse pas de résultat.

## Verdict

**Négatif**, pour les coulisses comme pour la règle du sous-agent. Le transcript n'écrit ni raisonnement, ni résultat d'appel, ni identifiant d'appel, ni date. Les fichiers de sous-agents existent, mais ils sont vides de conversation, et rien ne les relie à l'appel qui les a lancés. Cursor n'a donc pas de coulisses à relever, et la règle « un sous-agent qui ne lit que le dépôt ne rend plus la session externe » ne s'y applique pas : un sous-agent y reste externe. Cursor s'arrête à cette annexe (décision 2 du 12/11) ; le seul code qu'elle appelle est de garde.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| Le raisonnement porte-t-il son texte ? | **Aucun raisonnement n'est écrit.** Les blocs des cinq fichiers sont de deux sortes seulement : `text` (clés `type`, `text`) et `tool_use`. Pas de bloc de réflexion, pour ce modèle. D'autres modèles : non vu à l'essai. |
| La forme d'une ligne | `{ role, message }` pour une conversation : `role` vaut `user` ou `assistant`, et `message.content` est un tableau de blocs. **Aucune autre clé** : ni `timestamp`, ni `id`, ni `uuid`. Un message et un appel n'ont donc pas de date. Une autre sorte de ligne marque la fin d'un tour : `{ type: 'turn_ended', status, error? }`. |
| Où vivent les échanges des sous-agents ? | Dans des fichiers à part, sous un dossier `subagents/` de `agent-transcripts/` (le script les distingue à ce nom de dossier). Mais **le fichier d'un sous-agent ne porte qu'une ligne**, `{ type: 'turn_ended', status: 'error', error: <chaîne de 130 caractères> }` : d'après Amos, l'appli affichait « Model unavailable on Free ». La cause « compte gratuit » n'est pas établie par le relevé. Il n'y a ni consigne ni rapport ni appel d'outil dans ces fichiers. Avec un compte payant, ces fichiers pourraient être plus riches : non vu à l'essai. |
| Comment un appel se relie-t-il à son fichier ? | **Il ne se relie pas.** Un bloc d'appel n'a que `type`, `name` et `input` : pas d'identifiant. Un fichier de sous-agent n'a rien d'autre que sa ligne d'erreur : ni identifiant, ni parent. Le relevé compte quatre appels `CallDynamicTool` (lignes 3 à 6 de la conversation, après un `GetDynamicTools` ligne 2) et quatre fichiers de sous-agents. Ils se répondent par le nombre, rien ne le prouve. |
| La forme de la consigne | Côté appel : `CallDynamicTool` a pour entrée `namespace` (une chaîne de 6 caractères), `toolName` (une chaîne de 4 caractères) et `arguments` (un objet, dont le relevé ne note pas les clés). Où est la consigne d'un sous-agent : **non vu à l'essai**. Elle n'est pas dans le fichier du sous-agent. |
| La forme du rapport | **Non écrite** : le fichier du sous-agent n'a pas de message d'assistant, et la conversation n'a pas de résultat d'appel. Rien ne marque un texte comme le rapport d'un sous-agent : les blocs `text` de l'assistant qui suivent les appels (par exemple la ligne 7, de 387 caractères) peuvent le résumer, sans lien avec un appel. Non vu à l'essai. |
| Les appels d'outils | Un bloc `tool_use` dans une ligne `assistant` : `name`, `input`. Noms vus : **`Shell`** (entrée `command`, `description`, et `required_permissions` sur un appel : un tableau d'un élément), **`GetDynamicTools`** (`namespace`, `toolName`) et **`CallDynamicTool`** (`namespace`, `toolName`, `arguments`). Aucun appel `Task`. Un appel peut partager sa ligne avec un bloc `text`. Dans la conversation du relevé, trois appels `Shell` se suivent (lignes 10 à 12), dont le seul qui porte `required_permissions` est le troisième. |
| Le résultat et le statut d'un appel | **Aucun résultat n'est écrit.** Aucune ligne du relevé n'est un résultat d'appel : pas de bloc `tool_result`, pas de `is_error`, pour aucun appel, ni la commande qui échoue, ni la commande réseau, ni celle qui a été refusée (d'après Amos, par « Skip »). Le statut d'un appel n'est donc pas lisible : tous seraient `sans_resultat`. |
| La marque de fin | Une ligne `turn_ended` par tour : `status: 'success'` aux lignes 8 et 14 de la conversation. Une ligne `turn_ended` en erreur (une chaîne de 20 caractères) suit à la ligne 15, puis un nouveau message de l'utilisateur de 624 caractères à la ligne 16 : le relevé ne dit pas ce qui les a causés. |
| Un refus | **La forme d'un refus n'existe pas** : la commande refusée ne laisse ni résultat ni marque. Seul `required_permissions` sur l'appel dit qu'une permission était demandée. |
| Une discussion hors dossier (« No Repo », d'après Amos) | Rangée ailleurs que sous `~/.cursor/projects/<dossier>/`. Le relevé, qui lit le dossier du projet, ne la voit pas. |

Un extrait du relevé `cursor-noms.txt` (formes seulement) donne l'allure d'un tour avec des appels, sans identifiant ni résultat :

```
ligne 10 : {"role":"assistant"}
   bloc {"type":"text","text":"chaine(66)"}
   appel Shell {"type":"tool_use"} entrée {"command":"chaine(40)","description":"chaine(36)"}
ligne 11 : {"role":"assistant"}
   appel Shell {"type":"tool_use"} entrée {"command":"chaine(49)","description":"chaine(34)"}
ligne 12 : {"role":"assistant"}
   bloc {"type":"text","text":"chaine(114)"}
   appel Shell {"type":"tool_use"} entrée {"command":"chaine(49)","description":"chaine(41)","required_permissions":"tableau[1]"}
ligne 13 : {"role":"assistant"}
   bloc {"type":"text","text":"chaine(245)"}
ligne 14 : {"type":"turn_ended","status":"success"}
```

et le fichier d'un sous-agent, tout entier :

```
ligne 1 : {"type":"turn_ended","status":"error","error":"chaine(130)"}
```

## La recette ajustée

Il n'y a rien à relever : `coulisses` n'est ni proposé ni écrit pour Cursor, et rien n'en part (amendement du 17/11 de T52). La règle de T63 ne change pas pour Cursor :

1. **Un sous-agent reste externe.** `Task`, `GetDynamicTools` et `CallDynamicTool` rendent la session externe. Un test les nomme ; `GetDynamicTools` et `CallDynamicTool` sont les noms vus à cet essai.
2. **Un appel sans champ `input` compte.** Les appels du relevé ont tous une entrée, mais un appel sans `input` échappait au tri, donc à l'échec fermé : il rend la session externe.
3. **Un fichier sous `subagents/` n'est jamais capté comme une session**, au crochet comme au rattrapage. C'est un fichier de sous-agent : il n'a ni message ni appel, et le capter ferait partir une session vide.

## Ce qui reste à essayer

- **Un compte payant** : un sous-agent qui réussit. Son fichier porterait-il sa consigne, ses appels, son rapport ? Et le lien avec l'appel, par quelle clé ?
- **D'autres modèles**, dont un qui affiche son raisonnement : le transcript en écrirait-il le texte ?
- **Le résultat d'un appel** : où est écrit le résultat d'une commande dans le transcript, ou s'il n'est écrit nulle part ailleurs que dans l'appli.
- **Un refus** et **un appel MCP** : leurs formes, jamais relevées.
- **La version de l'appli** : non notée à cet essai.
- **Une discussion « No Repo »** : où elle est rangée, et si Leon peut la retrouver.
- **La ligne de commande** (`cursor-agent`) et l'éditeur classique : l'[annexe 4](04-essai-cursor.md) a vu l'éditeur, pas cette fenêtre.

## Remise en état

- **Supprimés par Amos** : les sessions d'essai de Cursor et leurs dossiers (le dossier du projet sous `~/.cursor/projects/` et le dépôt jetable).
- **Les crochets de Cursor** (`~/.cursor/hooks.json`) : fait contrôlé le 17/11, par le nom des fichiers seulement (rien n'a été lu) : ni `~/.cursor/hooks.json` ni `~/.cursor/hooks.json.pause-essai` n'existent. Rien n'est donc à remettre. Ce contrôle ne dit pas s'il y avait des crochets au moment de l'essai.
- **Gardés** : le script témoin [`cursor-coulisses.mjs`](../essais/coulisses-autres-outils/cursor-coulisses.mjs), son complément et le relevé de forme, dans [`essais/coulisses-autres-outils/`](../essais/coulisses-autres-outils/). Le script refuse de tourner (code 2) si les chemins ne portent pas `leon-essai-coulisses`.
