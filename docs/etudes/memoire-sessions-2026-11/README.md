# Mémoire des sessions : Leon écrit, l'outil suivant reçoit

2 novembre 2026 · Amos (avec Claude) · à relire par David

Plan d'implémentation : [`docs/plans/2026-11-02-memoire-sessions.md`](../../plans/2026-11-02-memoire-sessions.md), qui fait foi pour le détail. Annexes : [basic-memory, comment ça marche](annexes/01-basic-memory.md) ; [la recherche du 02/11](annexes/02-recherche.md) (crochets des quatre outils, terrain, projets open source) ; les essais réels de [Codex](annexes/03-essai-codex.md), de [Cursor](annexes/04-essai-cursor.md) et d'[Antigravity](annexes/05-essai-antigravity.md) ; [l'essai de Claude Code pour les coulisses](annexes/08-essai-claude-code-coulisses.md). Cette étude fait suite à la revue de #106, #107 et #108 (David, 01/11) et reprend les réponses d'Amos aux cinq points « à trancher » de #108.

## La question

Un développeur travaille dans Claude Code : quatre ou cinq sessions dans la journée, parfois en parallèle. Il ferme tout et ouvre Codex, Cursor ou Antigravity. Le nouvel outil doit savoir ce qui a été fait dans ces sessions, ce qui reste et où en est le dépôt, sans qu'on le lui demande et sans que l'IA pense à appeler un outil. Comment Leon traite-t-il la donnée qui remonte des LLM pour y arriver ?

## La réponse courte

1. **Leon écrit, pas l'agent.** Chaque session est captée par un crochet, pas par le MCP, et Leon en écrit lui-même la fiche et le résumé. La note de passation écrite par l'agent (#106) devient un complément.
2. **Deux échelles.** *Moi* : le fil de mes sessions, tous outils confondus. Il reste privé, donc rien ne fuit. *L'équipe* : l'état du dépôt (branches, PR ouvertes et fusionnées, tickets fermés), tiré de GitHub et non des sessions.
3. **Trois temps pour la donnée d'une session.** D'abord du code : extraire les gestes (fichiers, commandes, commits, PR, tâches) et écrire une fiche. Ensuite, un seul appel de modèle : le résumé, fait sur un condensé, une fois, à l'ingestion. Enfin, du code encore : relier session, commit, PR et ticket, assembler, borner.
4. **Une livraison qui ne dépend pas de l'IA.** Claude Code a déjà le crochet `SessionStart`. Codex, Cursor et Antigravity ont eux aussi des crochets de démarrage : on y apporte le même bloc. Le MCP reste pour les questions à la demande.
5. **GitHub tôt.** La progression de la base de code fait partie du contexte : les dépôts d'équipe et l'état du dépôt viennent juste après la fiche.

## 1. Ce qu'on retient de basic-memory

L'[annexe 1](annexes/01-basic-memory.md) décrit le code. Ce qu'on en garde pour Leon :

- **Un résumé n'est pas une recherche.** La recherche, sémantique ou plein texte, trouve des passages *sur un sujet*. « Résume mes sessions » n'a pas de sujet : son vrai critère est un périmètre (cette session, cet auteur, ce dépôt, depuis hier). On le choisit par les métadonnées, puis on synthétise.
- **Le graphe utile se construit sans IA**, avec des clés que la donnée porte déjà : branche, commit, numéro de PR, ticket fermé. Chez basic-memory, c'est un lien `[[cible]]` suivi en SQL. Chez nous, ce sont des jointures sur ces clés, et une profondeur de 2 suffit.
- **Le format de note** `- [catégorie] texte` et `relation [[cible]]` : #106 l'a déjà repris.
- **Ce qu'on ne prend pas** : les fichiers Markdown comme source de vérité, puisque Postgres et la RLS nous servent mieux ; et l'extraction de faits par IA, retirée au deuxième jet à raison. Sur la recherche, Leon est déjà au niveau : fusion RRF du plein texte, des titres et des vecteurs, sous RLS.

## 2. Les décisions d'Amos (02/11)

- **La note de passation seule ne suffit pas.** Elle dépend de l'agent qui l'écrit, ou du MCP qu'il pense à appeler. Il faut un mécanisme qui ne dépend que de Leon : toutes les sessions remontent, et Leon écrit la fiche et le résumé de chacune.
- **A. Deux échelles.** Pour l'utilisateur, le résumé sert au passage d'un outil à l'autre (Claude Code vers Codex) et reste privé, donc sans fuite. Pour l'équipe, ce qui compte est le dépôt entier : les branches, ce qui est fait et pas fait, l'état des tâches, l'état du dépôt.
- **D. Les dépôts partagés.** L'administrateur choisit les dépôts partagés avec Leon. Un membre invité qui branche son GitHub ne partage que ces dépôts, et seulement ceux dont il est déjà membre sur GitHub. Rien d'autre : ni ses dépôts perso, ni ceux d'un client. Déduit : une organisation qui n'a encore choisi aucun dépôt ne partage rien de nouveau.
- **E. Oui** : « L'équipe sur ce dépôt » arrive tôt, avec le lot 1 de #108, juste après la fiche (lots 2 et 3 du plan).
- **B et C, reportés.** Les deux portent sur les consignes (« on ne touche plus à `src/paiement/` jusqu'à vendredi ») : pas prioritaires, hors de ce chantier.
- **Graphe, RAG et Markdown, oui.** Ils servent à remonter l'information efficacement ; le plan dit où chacun sert.
- **GitHub est essentiel.** Le contexte doit dire comment avance la base de code, pas seulement ce que disent les sessions.
- **Les quatre outils** : Claude Code, Codex, Cursor et Antigravity.

## 3. Comment on traite la donnée d'une session

Le principe des deux jets tient : le brut se garde tel quel (`sources`, `turns`), et tout le reste en dérive et peut se refaire.

En technologies, rien de neuf : tout tient dans la stack du deuxième jet. Ni base graphe, ni base vectorielle à part, ni framework de RAG.

| Étape | Avec quoi | Dans Leon aujourd'hui |
|---|---|---|
| Déclencher la capture | les crochets de l'outil (`SessionStart`, `SessionEnd`, `Stop`), qui lancent la CLI `leon` (TypeScript) | Claude Code : oui ; les trois autres : à faire |
| Lire la session | du TypeScript qui lit le fichier JSONL de la session | Claude Code : oui (`src/capture/`) |
| Envoyer et stocker le brut | l'API Leon (Hono, route à jeton), Postgres 17 (`sources`, `turns`) sous RLS | oui |
| Extraire les gestes | du TypeScript : les appels d'outils se lisent dans le JSON, sans modèle | à faire |
| Faire tourner le travail de fond | pg-boss, la file de tâches qui vit dans Postgres | oui (indexation, point du matin) |
| Résumer | un appel à l'API Claude (SDK Anthropic, `claude-haiku-5-5`), données balisées par `prompt-guard` | la brique sert la réponse en tête ; la tâche est à faire |
| Rendre cherchable | le plein texte de Postgres (`tsvector`) et pgvector, avec un fournisseur d'embeddings appelé par `fetch` | oui |
| Relier (le graphe) | des jointures SQL sur des clés exactes, profondeur 2 | à faire |
| Lire GitHub | l'API de GitHub, par le connecteur existant | oui, à enrichir (lot 1 de #108) |
| Assembler et livrer | une lecture SQL et une mise en forme en TypeScript, que la CLI imprime au démarrage | Claude Code : oui ; les trois autres : à faire |

### 3.1 Tout capter, dans tous les outils (code)

- **Claude Code** : `leon installer-crochets` pose déjà les crochets `SessionStart` et `SessionEnd`.
- **Codex** : chaque session s'écrit dans `~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl`. Le relevé du 02/11 porte sur des sessions de Codex Desktop 0.158 ; la CLI installée est la 0.159. Le fichier contient :
  - `session_meta`, qui donne `git.branch` quand la session tourne dans un dépôt ;
  - `turn_context` ;
  - les messages et les appels d'outils ;
  - des évènements structurés pour les commandes et les fichiers modifiés.
- **Cursor** : un transcript par conversation, désigné par le crochet. Il est absent de la version locale (2.4.27), qu'il faudra mettre à jour.
- **Antigravity** : un `transcript.jsonl` par conversation, désigné par le crochet. Aucune session de la version 2.0 n'existe encore sur ce poste.
- **Le rattrapage** : au démarrage de n'importe quel outil, la CLI envoie les sessions pas encore captées (un portable fermé d'un coup, un `kill -9`), seulement pour les outils acceptés à l'installation. Si un crochet n'a pas tourné, rien n'est perdu.
- **Le web** : les sessions claude.ai et ChatGPT passent déjà par l'extension. Elles n'ont ni fiche ni résumé dans ce chantier.

### 3.2 Garder les gestes, pas seulement les textes (code)

Aujourd'hui, la capture ne garde que des textes (`TURN_ROLES` : `user`, `assistant`, `document`, `participant`, dans `src/capture/turn.ts`). Les commandes lancées et les fichiers écrits sont perdus. On garde donc, par session, des faits extraits par le code, bornés, rangés dans `sources.metadata.faits` sous l'ACL de la session :

- **les fichiers écrits** : `Edit`, `Write`, `MultiEdit` et `NotebookEdit` dans Claude Code ; dans Codex, ses évènements de fichiers modifiés ;
- **les commandes lancées**, réduites à leur exécutable, et à leur sous-commande pour git, gh, pnpm et quelques autres, avec leur statut. Jamais une option : un mot de passe passé en option ne part pas ;
- **git** : la branche, les commits, `git push` et `gh pr create`, d'où le numéro de la PR (et `pr-link`, que Claude Code écrit déjà) ;
- **la liste de tâches de l'agent**, quand il en tient une (`TodoWrite`, ou `TaskCreate` et `TaskUpdate` selon la version de Claude Code) : c'est « ce qui reste à faire », sans modèle ;
- **les erreurs d'outils**, et une marque « externe » quand la session a lu du web, du MCP, un sous-agent ou une commande réseau.

Les secrets sont masqués avant tout le reste (`maskSecrets`), sur le poste puis de nouveau à la réception.

### 3.3 Résumer une fois, à l'ingestion (le seul appel de modèle)

- **L'entrée** est un condensé fait par le serveur, à partir des tours, des gestes et de l'état des PR liées. **La sortie** est une note courte au format de #106 (`## Où j'en suis`, `[en-cours]`, `[prochaine-étape]`, `[essai-raté]`, `[question]`), lue par son analyseur.
- **Le déclenchement** passe par une file pg-boss, quand la session est close : 60 s après une fin de session, sinon après 15 min sans nouveau tour, et au-delà de 6 échanges.
- **Le modèle** est celui déjà réglé pour la réponse en tête (`claude-haiku-5-5`), appelé côté serveur (point 1 de la section 5).
- **C'est un dérivé, pas un fait.** Il porte l'ACL de sa session, donc de son auteur (règle n° 1 de l'[architecture v1](../architecture-2026-10/README.md)). Les lignes `[décision]` et `[consigne]` sont retirées, comme tout ce qui sort de la liste blanche : un résumé automatique ne décide rien.
- **Il est cherchable.** Il est stocké comme un tour de la session, indexé comme le reste : c'est le RAG sur les résumés.
- **Une seule fois.** Ni le démarrage d'un outil ni la passation ne rappellent le modèle : ils lisent les résumés stockés.
- **Avec accord.** Rien n'est résumé sans que l'utilisateur ait accepté que le fournisseur du modèle le lise.

### 3.4 Relier (code)

Les faits de 3.2 rejoignent ceux de GitHub sans modèle : session, branche, commits, PR, tickets fermés (lot 1 de #108). C'est le graphe que montrait l'étude basic-memory, construit par des clés plutôt que par une IA. Il répond aussi bien à « qu'est-ce qui est sorti de mes sessions d'hier ? » qu'à « où en est la PR de ma session ? ».

### 3.5 Assembler le contexte du démarrage (code)

Deux blocs courts, datés et sourcés (la leçon de Copilot Memory reprise par #108). Chaque champ est mis sur une ligne, échappé et balisé comme donnée. L'ensemble tient en 8 000 octets.

- **Mes dernières sessions** (privé) : les 4 dernières sur ce dépôt, sur 7 jours, tous outils confondus, la branche courante d'abord. Un paragraphe par session (outil, date, branche, PR, ce qui est fait, ce qui reste). Une session « externe » ne montre que ses clés, jamais un texte écrit par l'agent. Aucun appel de modèle : fiches et résumés existent déjà.
- **L'état du dépôt** (équipe, dépôts d'équipe seulement) : ce qui a été fusionné depuis 72 h et les tickets que cela ferme, les PR ouvertes modifiées depuis 30 jours et leurs branches. Aucun titre écrit par un tiers.

### 3.6 Livrer sans dépendre de l'IA

- **Claude Code** : le crochet `SessionStart`, qui sert déjà le point du matin.
- **Codex** : d'après la doc et le code de la 0.159, ses crochets (`~/.codex/hooks.json`) injectent la sortie de `SessionStart` dans le contexte du modèle, au premier message ; rien n'a encore été essayé.
  - Chaque crochet doit être approuvé par l'utilisateur.
  - `SessionEnd` est coupé à 3 s : la capture se détache.
  - Le repli par `~/.codex/AGENTS.md` est écarté, parce que ce fichier est global.
- **Cursor et Antigravity** : eux aussi ont des crochets qui captent et qui injectent (`~/.cursor/hooks.json`, `~/.gemini/config/hooks.json`), avec des pièges propres à chacun ([annexe 2](annexes/02-recherche.md)). Chacun commence par un essai réel.
- **Copilot et JetBrains** : plus tard.
- **Le MCP** reste pour la suite de la conversation : « détaille la session de mardi », `search`, `passation_lire`.

## 4. Ce que ça change pour les PR de David

- **#106** : son format de note et son analyseur sont repris tels quels. Le reste (tables, routes, outils MCP, état de branche) reste à #106, qui doit entrer dans main d'abord, corrigée (la « PR 0 », avec le lot 0 de #108).
  - On inverse la logique : la fiche et le résumé que Leon écrit pour chaque session deviennent le mécanisme principal.
  - La note écrite par l'agent (`/passation`, `passation_ecrire`) reste, pour ce qu'un développeur veut dire exprès à l'équipe.
  - Le résumé passe côté serveur, ce qui retire le secours `claude -p` et le problème de clé d'API qu'il pose (point 3 du lot 0).
- **#107** : à refaire, comme #108 le prévoit déjà. Le contexte d'équipe vient de GitHub, pas des sessions brutes : les sessions restent privées par défaut, sans partage rétroactif. Partager un résumé avec l'équipe deviendra un geste explicite.
- **#108** : son lot 1 (GitHub) passe juste après la fiche. D et E sont appliquées comme en section 2, et A est redéfinie en deux échelles. Le lot 2 (les consignes, B et C) vient après.

L'ordre des lots et le détail des tâches sont dans le [plan](../../plans/2026-11-02-memoire-sessions.md).

## 5. À trancher avec David

1. **Où tourne le résumé.**
   - *Côté serveur*, avec la clé de Leon : il marche pour un développeur sous Codex ou Cursor sans abonnement Claude, et il tourne même si le portable se ferme juste après la capture. Il ne laisse aucune clé à protéger sur le poste. Leon paie un appel léger par session.
   - *Côté poste*, avec le `claude -p` de #106 : Leon ne paie rien, mais seul Claude en profite, et le portable doit rester ouvert.

   Recommandation : côté serveur. Cela amende la règle « aucun modèle côté Leon » de #108, qui visait l'extraction de faits. Ce n'est pas un retour du tri par agents retiré au deuxième jet : un appel par session, sur une entrée bornée, et rien n'est trié ni rangé par l'IA.
2. **Quand une session est finie** : 60 s après une fin de session, sinon 15 min sans tour (Codex, Cursor, Antigravity).
3. **La voie de chaque outil** : un essai réel des crochets de Codex, de Cursor et d'Antigravity.
4. **Le seuil** : en dessous de combien d'échanges on ne résume pas (6 proposé).
5. **Qui lit un dépôt d'équipe dans Leon** : tous les membres, ou seulement ceux qui y ont accès sur GitHub. D règle ce qui est relevé, pas encore qui le lit.
6. **B et C** : reportés (02/11).
