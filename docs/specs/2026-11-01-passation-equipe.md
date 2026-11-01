# Passation entre agents : le contexte partagé d'une équipe de développeurs

01/11/2026. Décisions de David par questionnaire, sur la base de l'[étude graphe](../etudes/graphe-2026-11/README.md). Ce qui est marqué « (choix de Claude) » est à relire par Amos.

## Pourquoi

Plusieurs développeurs d'une même équipe travaillent en même temps ou l'un après l'autre sur les mêmes dépôts, chacun avec son compte Claude, et passent parfois d'un outil à l'autre (Claude Code, Codex, Cursor, ChatGPT). Aujourd'hui, l'agent qui reprend ne sait ni ce qui a été décidé, ni ce qui a échoué, ni la prochaine étape :

- les sessions Claude Code captées sont privées à leur auteur (`src/server/ingest/ingest-turns.ts:26`) ;
- le point du matin ne lit que les sessions de l'utilisateur (`src/server/briefing/gather.ts:181-182`) et arrive 30 minutes après ;
- `remember` écrit une note privée, sans dépôt ni branche (`src/server/mcp/tools/remember-tool.ts`) ;
- `search` n'a pas de filtre par dépôt.

L'étude graphe a conclu que le blocage vient du partage et de ce qui est capté, pas de la structure. Le relais entre coéquipiers et le passage d'un outil à l'autre sont le même problème : une note de passation rangée par dépôt et par branche, lisible par n'importe quel membre et n'importe quel outil.

## Décisions de David

1. **Un seul mécanisme** pour le relais entre coéquipiers et le changement d'outil.
2. **Deux chemins d'écriture** : l'agent écrit la note pendant la session ; sinon, un résumé de secours est fait en fin de session **sur la machine du développeur, avec son propre abonnement Claude** (`claude -p`). Leon n'appelle aucun modèle.
3. **Partage direct à l'organisation**, retrait possible. Pas de brouillon à valider.
4. **Lecture injectée au démarrage** des sessions Claude Code, et par un outil MCP partout ailleurs.
5. **Option B de l'étude** : la note brute plus deux petites tables structurées (éléments et liens), remplies sans IA.

## Le format d'une note

Du Markdown, le même quel que soit l'outil qui écrit :

```
## Où j'en suis
Refonte de l'auth : Better Auth branché, reste la page de connexion.

- [décision] On passe à Better Auth, NextAuth abandonné #auth
- [essai-raté] Pools 10+5 → EMAXCONNSESSION sur Supabase
- [prochaine-étape] Brancher la page /connexion sur le nouveau client
- [en-cours] Migration 0043 écrite, pas encore lancée
- concerne [[PR #91]]
- remplace [[D12]]
```

- Le paragraphe sous `## Où j'en suis` est libre : c'est le résumé de la note.
- Une ligne d'élément commence par `- [type] `. Cinq types : `décision`, `essai-raté`, `prochaine-étape`, `en-cours`, `question`. Les `#mots` sont gardés dans le texte, sans traitement (choix de Claude).
- Une ligne de lien s'écrit `- <relation> [[cible]]`. La relation est un mot libre (`concerne`, `dépend-de`…), sauf `remplace`, qui a un sens (voir plus bas). Elle se rattache au dernier élément qui la précède ; avant tout élément, elle se rattache à la note (choix de Claude).
- Le dépôt, la branche, l'auteur, l'outil et la date sont posés par Leon, pas par l'agent.
- Une ligne hors format n'est pas rejetée : elle reste dans le texte brut et n'entre pas dans les tables.
- Taille maximale d'une note : 8 000 caractères (choix de Claude).

## Données

Migration `0043-passations.sql`, sous sécurité par ligne comme le reste (`tenant_id = app_tenant() and acl && app_principals()`).

- **La note** est une `source` de type `passation` (ajouté à `SOURCE_KINDS`, `src/capture/turn.ts`), avec `acl = [organisation]` comme les connecteurs partagés (`src/server/connectors/ingest-items.ts:68`). `metadata` porte `project` (clé `github.com/<propriétaire>/<dépôt>`, `src/cli/project-key.ts`), `branch` (absent = tout le dépôt) et `tool` (`claude_code`, `codex`, `cursor`, `chatgpt`, `claude_ai`, `autre`). Son texte est un tour, découpé et vectorisé par l'indexation existante : `search` et `fetch` la trouvent sans changement.
- **`passation_items`** : `id`, `tenant_id`, `acl`, `source_id` (la note, suppression en cascade), `numero` (court et lisible, unique par organisation : `D12` décision, `E7` essai raté, `P3` prochaine étape, `C4` en cours, `Q2` question), `type`, `texte`, `project`, `branch`, `author_user_id`, `created_at`, `remplacee_par` (élément, nullable).
- **`passation_liens`** : `id`, `tenant_id`, `acl`, `source_id`, `item_id` (nullable : lien de la note), `relation`, `cible` (texte tel qu'écrit, sans résolution).

**Remplacement** : `- remplace [[D12]]` marque D12 comme remplacé par l'élément qui précède la ligne, si D12 existe, appartient à la même organisation et au même dépôt. Sinon la ligne est ignorée (gardée dans les liens comme un lien ordinaire). Aucune comparaison de texte, aucun modèle.

## L'état de la branche

Ce que reçoit l'agent qui reprend, pour un dépôt et, si donnée, une branche :

1. le paragraphe « Où j'en suis » de la dernière note sur la branche (sur le dépôt si pas de branche) ;
2. les décisions non remplacées du dépôt, toutes branches confondues ;
3. les essais ratés des 30 derniers jours sur le dépôt ;
4. les prochaines étapes, travaux en cours et questions de la dernière note de chaque auteur sur la branche ;
5. pour chaque élément : son numéro, son auteur, son outil et sa date.

Au plus 4 000 caractères : on retire d'abord les éléments les plus anciens. Chaque élément porte son numéro pour qu'un agent puisse écrire `remplace [[D12]]`. Le texte est présenté comme une donnée captée, jamais comme une instruction, comme le reste de Leon.

## Écriture

- **Outil MCP `passation_ecrire(texte, depot, branche?, outil?)`** dans `src/server/mcp/tools/`, sur le modèle de `remember-tool.ts`. Il masque les secrets (`src/capture/mask-secrets.ts`), enregistre la note, lit ses lignes, remplit les tables dans la même transaction et renvoie les numéros créés et les remplacements faits. Sa description contient le format complet, pour que chaque fournisseur le reçoive.
- **Route `POST /api/passation`** avec le jeton Leon (comme `ingest-routes.ts`), même traitement, pour le secours de fin de session.
- La lecture des lignes est une fonction pure, sans base, testée seule.

## Lecture

- **Outil MCP `passation_lire(depot, branche?)`** : renvoie l'état de la branche.
- **Route `GET /api/passation?project=&branch=`** : la même chose, pour le crochet de démarrage.
- **Instructions du serveur MCP** (`MCP_INSTRUCTIONS`, `src/server/mcp/server.ts:10`) : au début d'un travail sur un dépôt, appeler `passation_lire` ; avant de s'arrêter ou quand l'utilisateur le demande, appeler `passation_ecrire` dans le format.

## Crochets Claude Code

Installés par `leon installer-crochets` (`src/cli/install-hooks.ts`).

- **Démarrage** (`src/cli/briefing.ts`) : ajoute l'état de la branche à ce qui est collé, en lisant le dépôt (`project-key.ts`) et la branche (`git branch --show-current`, borné dans le temps comme les autres appels git). Pour toutes les valeurs de `source`, y compris `compact` et `resume`. Le total reste sous les 10 000 caractères que Claude Code accepte.
- **Fin de session, le secours** (`src/cli/capture-session.ts`, après la capture habituelle) :
  - ne fait rien si `LEON_PASSATION=1` (évite que le `claude -p` lancé ci-dessous ne relance le secours) ;
  - ne fait rien si la session compte moins de 6 échanges ;
  - demande à Leon (`GET /api/passation/derniere?project=&branch=`) la date de la dernière note de ce développeur sur cette branche ; ne fait rien si elle est postérieure au début de la session ;
  - sinon lance **en arrière-plan détaché** `LEON_PASSATION=1 claude -p --model haiku` avec la consigne du format et la session condensée (textes des échanges, plus une ligne par commande lancée et fichier écrit, lues dans le JSONL de la session), puis envoie le résultat à `POST /api/passation` avec `outil = claude_code`. Le crochet lui-même rend la main tout de suite.
  - Le coût est imputé sur l'abonnement du développeur ; Leon ne paie rien.
- **Commande `/passation`** : l'installateur écrit une commande Claude Code qui demande à l'agent d'appeler `passation_ecrire` maintenant.
- **Bloc `AGENTS.md`** (option de l'installateur) : pour Codex, Cursor et Copilot, « au démarrage, appelle `passation_lire` de Leon ; en fin de tâche, appelle `passation_ecrire` ».

Rien ne bloque une session : serveur injoignable, `claude` absent, sortie vide ou hors format → un message sur la sortie d'erreur, code de sortie 0. Une sortie de `claude -p` sans aucune ligne au format n'est pas envoyée (choix de Claude).

## Droits

- Notes, éléments et liens : toute l'organisation, jamais au-delà. Les sessions brutes restent privées à leur auteur.
- Un membre retiré ne voit plus rien ; ses notes restent à l'équipe, comme ses autres contributions (spec du 28/10).
- Retirer une note : son auteur ; un propriétaire ou un administrateur seulement si l'auteur a supprimé son compte, comme pour les documents (`0042-documents-anciens-membres.sql`). La note, ses éléments et ses liens partent ensemble ; un élément qu'elle remplaçait redevient valable.

## Tests

- **Lecture du format** (unitaire) : les cinq types, les liens rattachés au bon élément, les lignes hors format gardées dans le texte et absentes des tables, `remplace` sur un numéro valable, inconnu, d'une autre organisation, d'un autre dépôt.
- **Droits** (`*.db.test.ts`, vraie base) : un collègue voit la note et ses éléments ; une autre organisation non ; un membre retiré non ; un collègue ne peut pas retirer la note d'un autre ; le retrait rend valable l'élément remplacé.
- **État de la branche** : décisions non remplacées seulement, essais ratés de moins de 30 jours, dernière note par auteur, limite de 4 000 caractères.
- **Crochets** : le démarrage colle l'état aussi après `compact` ; le secours ne part pas avec `LEON_PASSATION=1`, sous 6 échanges, ni si une note existe déjà ; il part détaché.
- **Bout en bout** : David et Amos, chacun son compte Claude, se passent une vraie branche pendant une semaine. Mesure : part des sessions qui laissent une note, reprises sans question, erreurs dans les notes (test E2 de l'étude).

## Hors périmètre

- Le secours de fin de session pour Codex ou Cursor (`codex exec`), plus tard.
- Un affichage des passations dans l'interface web (lisibles par `search` et `fetch`).
- Une visibilité limitée à ceux qui ont accès au dépôt GitHub.
- La capture des commandes et des diffs dans la session brute.
- Toute résolution des cibles de liens (`[[Amos]]` reste un texte).
- Un appel de modèle côté Leon.

## Effort

7 à 9 jours-personne (estimation de l'étude). Coût d'exploitation pour Leon : l'indexation de notes courtes, négligeable.
