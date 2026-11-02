# Mémoire des sessions : Leon écrit, l'outil suivant reçoit

2 novembre 2026 · Amos (avec Claude) · à relire par David

Annexe : [basic-memory, comment ça marche](annexes/01-basic-memory.md). Fait suite à la revue de #106, #107 et #108 (David, 01/11), et reprend les réponses d'Amos aux cinq points « à trancher » de #108.

## La question

Un développeur travaille dans Claude Code : quatre ou cinq sessions dans la journée, parfois en parallèle. Il ferme tout et ouvre Codex. Codex doit savoir ce qui a été fait dans ces sessions, ce qui reste et où en est le dépôt, sans qu'on le lui demande et sans que l'IA pense à appeler un outil. Comment Leon traite-t-il la donnée qui remonte des LLM pour y arriver ?

## La réponse courte

1. **Leon écrit, pas l'agent.** Chaque session est captée par un crochet, pas par le MCP, et Leon en écrit lui-même le résumé, à chaque fois. La note de passation écrite par l'agent (#106) devient un complément.
2. **Deux échelles.** *Moi* : le fil de mes sessions, tous outils confondus. Il reste privé, donc rien ne fuit. *L'équipe* : l'état du dépôt (branches, PR ouvertes et fusionnées, tickets), tiré de GitHub et non des sessions.
3. **Trois temps pour la donnée d'une session.** Du code d'abord : condenser, et extraire les faits (fichiers, commandes, commits, PR, tâches). Un seul appel de modèle ensuite : le résumé, fait sur le condensé, une fois, à l'ingestion. Du code encore : relier session, commit, PR et ticket, assembler, borner.
4. **Une livraison qui ne dépend pas de l'IA.** Claude Code a déjà le crochet `SessionStart`. Codex 0.159 connaît les mêmes évènements (`SessionStart`, `SessionEnd`…) et lit un `AGENTS.md` global : on y apporte le même bloc. Le MCP reste pour les questions à la demande.
5. **GitHub en tête.** La progression de la base de code fait partie du contexte : le lot 1 de #108 passe avant le reste.

## 1. Ce qu'on retient de basic-memory

L'[annexe 1](annexes/01-basic-memory.md) décrit le code. Ce qu'on en garde pour Leon :

- **Un résumé n'est pas une recherche.** La recherche, sémantique ou plein texte, trouve des passages *sur un sujet*. « Résume mes sessions » n'a pas de sujet : son vrai critère est un périmètre (cette session, cet auteur, ce dépôt, depuis hier). On le choisit par les métadonnées, puis on synthétise. Ni les vecteurs ni un graphe n'y servent.
- **Le graphe utile se construit sans IA**, avec des clés que la donnée porte déjà : branche, commit, numéro de PR, ticket fermé. C'est leur lien `[[cible]]` suivi par une requête récursive, transposé à nos sources.
- **Le format de note** `- [catégorie] texte` et `relation [[cible]]` : #106 l'a déjà repris.
- **Ce qu'on ne prend pas** : les fichiers Markdown comme source de vérité (Postgres et la RLS nous servent mieux), et l'extraction de faits par IA (retirée au deuxième jet, à raison). Sur la recherche, Leon est déjà au niveau : fusion RRF du plein texte, des titres et des vecteurs, sous RLS.

## 2. Les décisions d'Amos (02/11)

- **La note de passation seule ne suffit pas.** Elle dépend de l'agent qui l'écrit, ou du MCP qu'il pense à appeler. Il faut un mécanisme qui ne dépend que de Leon : toutes les sessions remontent, et Leon écrit le résumé de chacune.
- **A. Deux échelles.** Pour l'utilisateur, le résumé sert au passage d'un outil à l'autre (Claude Code vers Codex) et reste privé, donc sans fuite. Pour l'équipe, ce qui compte est le dépôt entier : les branches, ce qui est fait et pas fait, l'état des tâches, l'état du dépôt.
- **D. Les dépôts partagés.** L'administrateur choisit les dépôts partagés avec Leon. Un membre invité qui branche son GitHub ne partage que ces dépôts, et seulement ceux dont il est déjà membre sur GitHub. Rien d'autre : ni ses dépôts perso, ni ceux d'un client. Déduit : une organisation qui n'a encore choisi aucun dépôt ne partage rien.
- **E. Oui** : « L'équipe sur ce dépôt » arrive dès le lot 1.
- **B et C, non tranchés.** Les deux portent sur les consignes (« on ne touche plus à `src/paiement/` jusqu'à vendredi »), et la question n'était pas claire. Proposition (choix de Claude) : sortir les consignes du premier chantier, et les reprendre après le lot 1 et les résumés de session.
- **GitHub est essentiel.** Le contexte doit dire comment avance la base de code, pas seulement ce que disent les sessions.

## 3. Comment on traite la donnée d'une session

Le principe des deux jets tient : le brut se garde tel quel (`sources`, `turns`), et tout le reste en dérive et peut se refaire.

### 3.1 Tout capter, dans tous les outils (code)

- **Claude Code** : `leon installer-crochets` pose déjà les crochets `SessionStart` et `SessionEnd`.
- **Codex** : chaque session s'écrit dans `~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl` (relevé sur Codex 0.159 le 02/11). On y trouve `session_meta` (dossier, identifiant, date, version), `turn_context` (dossier, modèle), `response_item` (messages, appels d'outils et leurs sorties) et `compacted`. L'en-tête ne donne pas la branche : elle se lit depuis le dossier, comme #108 le prévoit pour Claude Code. Il faut un lecteur de ce format, à côté de celui de Claude Code, déclenché par la fin de session de Codex (voir 3.6).
- **Le rattrapage** : au démarrage de n'importe quel outil, la CLI envoie les sessions pas encore captées (un portable fermé d'un coup, un `kill -9`). Si un crochet n'a pas tourné, rien n'est perdu.
- **Le web** : les sessions claude.ai et ChatGPT passent déjà par l'extension et rejoignent le même fil.

### 3.2 Garder les gestes, pas seulement les textes (code)

Aujourd'hui, la capture ne garde que des textes (`TURN_ROLES` : `user`, `assistant`, `document`, `participant`, dans `src/capture/turn.ts`). Les commandes lancées et les fichiers écrits sont perdus : c'est pourquoi le secours de #106 relit le fichier de session sur le poste. On garde donc, par session, des faits extraits par le code, et bornés :

- **les fichiers écrits** : `Edit`, `Write`, `MultiEdit` et `NotebookEdit` dans Claude Code. Codex passe presque tout par son outil `exec` : on les lit dans les commandes. Ils vont dans `metadata.files`, le champ que le lot 1 de #108 donne aux PR, et le filtre `chemin` trouve alors aussi les sessions ;
- **les commandes lancées** et leur statut, une ligne chacune, sans la sortie ;
- **git** : la branche, les commits, `git push` et `gh pr create`, d'où le numéro de la PR ;
- **la liste de tâches de l'agent**, quand il en tient une (`TodoWrite`, ou `TaskCreate` et `TaskUpdate` selon la version de Claude Code). C'est « ce qui reste à faire », sans modèle. Aucun outil de plan n'apparaît dans les sessions Codex récentes : là, c'est le résumé qui le dira ;
- **les erreurs d'outils.**

Les secrets sont masqués avant tout le reste (`maskSecrets`, déjà utilisé par #106).

### 3.3 Résumer une fois, à l'ingestion (le seul appel de modèle)

- **L'entrée** est le condensé de #106 (`condenseSession`, dans `src/capture/handoff-transcript.ts`), pas le brut. **La sortie** est une note courte au format de #106 (`[en-cours]`, `[prochaine-étape]`, `[décision]`, `[essai-raté]`…), lue par le même analyseur.
- **Le déclenchement** passe par une file pg-boss, quand la session est close (fin de session, ou délai sans nouveau tour), au-delà d'un seuil d'échanges (6 dans #106).
- **Le modèle** est celui déjà réglé pour la réponse en tête (`claude-haiku-5-5`), appelé côté serveur : voir le point 1 de la section 5.
- **C'est un dérivé, pas un fait.** Il porte l'ACL de sa session, donc de son auteur (règle n° 1 de l'[architecture v1](../architecture-2026-10/README.md)). Il est marqué « résumé automatique », et ses lignes `[décision]` ne deviennent pas des décisions d'équipe (règle déjà posée au lot 0 de #108).
- **Une seule fois.** Ni le démarrage d'un outil ni la passation ne rappellent le modèle : ils lisent les résumés stockés.

### 3.4 Relier (code)

Les faits de 3.2 rejoignent ceux de GitHub sans modèle : session, branche, commits, PR, tickets fermés (lot 1 de #108). C'est le graphe que montrait l'étude basic-memory, construit par des clés plutôt que par une IA. Il répond aussi bien à « qu'est-ce qui est sorti de mes sessions d'hier ? » qu'à « qui a touché ce fichier ? ».

### 3.5 Assembler le contexte du démarrage (code)

Deux blocs courts, datés et sourcés (la leçon de Copilot Memory reprise par #108). Ils sont bornés en caractères, puis échappés et balisés comme données (`escapeData`, lot 0 de #108) :

- **Mes dernières sessions** (privé) : sur ce dépôt, depuis ma dernière ouverture d'un outil, tous outils confondus. Un paragraphe par session (outil, date, branche, ce qui est fait, ce qui reste), puis les tâches restantes. Des sessions en parallèle donnent plusieurs paragraphes. Aucun appel de modèle : les résumés existent déjà.
- **L'état du dépôt** (équipe, dépôts d'équipe seulement) : ce qui a été fusionné depuis 72 h, les PR ouvertes modifiées depuis 30 jours, les branches actives et les tickets fermés (section 1.5 de #108).

### 3.6 Livrer sans dépendre de l'IA

- **Claude Code** : le crochet `SessionStart`, qui sert déjà le point du matin et, dans #106, l'état de la branche.
- **Codex** : son binaire 0.159 connaît les évènements `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse` et `PostToolUse`, et ses crochets doivent être approuvés par l'utilisateur. Rien n'a encore été essayé. Deux voies, dans cet ordre :
  1. un crochet `SessionStart` qui ajoute le bloc au contexte, comme dans Claude Code (à vérifier : que Codex injecte bien sa sortie). Le même mécanisme, sur `SessionEnd`, déclenche la capture ;
  2. sinon, un bloc tenu par Leon dans `~/.codex/AGENTS.md`, le fichier d'instructions global que Codex lit à chaque ouverture, réécrit à chaque fin de session. On écrit dans la configuration de l'utilisateur, jamais dans un dépôt, avec son accord à l'installation.
- **Cursor, Copilot, JetBrains** : même logique, outil par outil, plus tard.
- **Le MCP** reste pour la suite de la conversation : « détaille la session de mardi », `search`, `passation_lire`.

## 4. Ce que ça change pour les PR de David

- **#106** : on garde l'essentiel (le format, l'analyseur, les tables, les routes, la condensation, l'injection au démarrage et son budget de 10 000 caractères). On inverse la logique : le résumé que Leon écrit pour chaque session devient le mécanisme principal. La note écrite par l'agent (`/passation`, `passation_ecrire`) reste, pour ce qu'un développeur veut dire exprès à l'équipe. Le lot 0 de #108 reste valable. Si le résumé passe côté serveur, le problème de la clé d'API héritée par `claude -p` (point 3 du lot 0) disparaît.
- **#107** : à refaire, comme #108 le prévoit déjà. Le contexte d'équipe vient de GitHub, pas des sessions brutes : les sessions restent privées par défaut, sans partage rétroactif. Partager un résumé avec l'équipe devient un geste explicite, que l'espace Développeurs peut porter.
- **#108** : le lot 1 (GitHub) passe en tête ; D et E comme en section 2 ; A redéfini en deux échelles ; le lot 2 (les consignes, B et C) après.

**Ordre proposé** (choix de Claude) : le lot 0 de #108 ; puis la capture des gestes (3.2) et le résumé à l'ingestion (3.3) ; puis le lot 1 de #108 (GitHub et les liens de 3.4) ; puis Codex (3.1 et 3.6) ; enfin les consignes.

## 5. À trancher avec David

1. **Où tourne le résumé.** *Côté serveur*, avec la clé de Leon : il marche pour un développeur sous Codex ou Cursor sans abonnement Claude, il tourne même si le portable se ferme juste après la capture, et il ne laisse aucune clé à protéger sur le poste. Leon paie un appel léger par session. *Côté poste*, avec le `claude -p` de #106 : Leon ne paie rien, mais seul Claude en profite, et le portable doit rester ouvert. Recommandation : côté serveur. Cela amende la règle « aucun modèle côté Leon » de #108, qui visait l'extraction de faits. Ce n'est pas un retour du tri par agents retiré au deuxième jet : un appel par session, sur une entrée bornée, et rien n'est trié ni rangé par l'IA.
2. **Quand une session est finie** : à la fin de session, ou après un délai sans tour (Codex, sessions web).
3. **La voie Codex** (3.6) : un essai réel des crochets de Codex 0.159.
4. **Le seuil** : en dessous de combien d'échanges on ne résume pas.
5. **Qui voit un dépôt d'équipe dans Leon** : tout membre de l'organisation, ou seulement ceux qui y ont accès sur GitHub (D règle ce qui est relevé, pas encore qui le lit).
6. **B et C**, à reformuler : ce sont les deux questions sur les consignes.
