# Context engineering : ce que le talk de Lamis change à la mémoire de Leon

4 novembre 2026 · Amos (avec Claude) · tranché par Amos le 4 novembre · à relire par David

Plan d'implémentation : [`docs/plans/2026-11-03-memoire-a-disposition.md`](../../plans/2026-11-03-memoire-a-disposition.md) (PR #122), qui fait foi pour le détail. Les décisions de cette étude y sont portées par D33 et les suivantes, et par le lot 15. Cette étude fait suite à [la mémoire des sessions](../memoire-sessions-2026-11/README.md).

## La source

- **Le talk.** *Context engineering, memory and dreaming*, par Lamis, de l'équipe Applied AI d'Anthropic, à la conférence AI DevCon.
- **Le transcript.** Il est automatique, nettoyé puis découpé en sections. Il ne couvre que les 30 premières minutes : il s'arrête pendant les questions.
- **Il reste hors du dépôt.** C'est le texte d'un tiers. Cette note en parle dans nos mots, sans le recopier.
- **L'analyse.** Elle a été faite le 04/11 sous trois angles : les garde-fous, le rêve, la mémoire en fichiers. Elle a ensuite été jugée et vérifiée sur le code de main (4b0e681) et sur le plan #122. Elle reste elle aussi hors du dépôt.

## La question

Le talk décrit comment Anthropic conçoit la mémoire d'un agent, de la forme la plus simple à celle qu'on met en production. Le plan #122 range déjà la mémoire de Leon par fil de travail. Que confirme le talk ? Que contredit-il ? Quels défauts du plan fait-il voir ?

## La réponse courte

1. **Le plan suivait déjà le talk sur l'essentiel** : la divulgation progressive, la portabilité, un traitement de fond borné aux droits de l'auteur.
2. **Il s'en écarte exprès sur trois points.** Postgres sous RLS plutôt que des fichiers. Leon écrit la mémoire, pas l'agent. Rien n'est poussé sans relecture humaine.
3. **Le talk a fait trouver six défauts** dans le plan #122 (section 3).
4. **On ajoute trois choses** : une mémoire versionnée (v1, v2, v3), un rêve perso par règles (lot 15) et un brouillon privé de l'agent (`leon noter`).
5. **La mémoire passe avant le point du matin** au démarrage : le sommaire des fils, puis les leçons acceptées par un humain.

## 1. Les idées du talk

Le talk retrace une année de travail sur le contexte des agents. Son fil : faire d'abord la chose simple qui marche. On ajoute des garde-fous quand on passe à l'échelle.

- **Un fichier injecté au démarrage.** C'est le CLAUDE.md de Claude Code : quelques consignes en Markdown, collées au début de chaque session. Il marche très bien. L'humain comme l'agent peuvent le lire et l'écrire. Sa limite : il grossit et encombre le contexte.
- **La mémoire écrite par l'agent.** Ce sont des outils de mémoire, employés pendant la session. L'agent décide seul quand lire, écrire ou mettre à jour. Cette autonomie a bien marché.
- **La divulgation progressive.** C'est l'idée des skills. L'agent ne voit d'abord qu'un en-tête de deux phrases. Il ne charge le corps que s'il en a besoin. L'image du talk : on lit les titres d'une étagère, et on n'en sort que le livre utile.
- **La mémoire comme fichiers.** Pour le talk, c'est l'état de l'art : des fichiers Markdown dans un système de fichiers. L'agent y cherche avec ses outils habituels (bash, grep), sans outil de mémoire dédié. Trois leçons en sortent. Le Markdown convient. On laisse la mémoire grandir, pourvu qu'on cherche vite. On laisse l'agent écrire.
- **Quatre garde-fous de production.**
  - *Les versions.* On garde chaque version, et on peut revenir en arrière. On sait de quelle session vient un changement, et qui l'a fait.
  - *La concurrence.* Avant d'écrire, l'agent compare l'empreinte de la mémoire à celle qu'il avait lue. Si elle a changé, il relit et refait son changement.
  - *Les permissions.* La mémoire a des niveaux. Celle de l'organisation est en lecture seule pour l'agent. Son brouillon, il l'écrit librement.
  - *La portabilité.* Une API propre sert plusieurs produits et plusieurs systèmes.
- **La péremption et l'injection.** Une mémoire vieillit. Elle peut aussi être fausse, ou injectée par un tiers. Une erreur dans la mémoire d'organisation atteint tous les agents d'un coup.
- **Les limites de la mémoire dans la session.** L'agent partage son effort entre la tâche et la mémoire : c'est un mauvais compromis. Il ne voit que sa session. Il ne voit donc ni les erreurs qui se répètent d'une session à l'autre, ni celles des autres agents.
- **Le rêve.** C'est un traitement de fond, en lot, avec ses propres ressources. Il prend la mémoire et les transcripts d'une période, appels d'outils compris. Des sous-agents les analysent, et un orchestrateur cherche les motifs fréquents. Il propose des changements, avec des exemples et leur fréquence. Un humain accepte ou rejette. Le rêve sert aussi à retirer ce qui n'est plus vrai. L'image du talk : un directeur d'école relit toutes les copies et corrige le programme.
- **Le gain annoncé.** L'agent fait mieux la deuxième fois, avec moins de tokens, et plus vite.
- **Aux questions.** Le rêve suit les permissions : on ne lui donne que les transcripts que le lecteur de la mémoire a le droit de voir. Les garde-fous décrits sont ceux de l'API mémoire et rêve des Managed Agents d'Anthropic.

## 2. Le talk face à Leon

« Déjà » veut dire : sur main, ou dans le plan #122 avant le 04/11.

| Idée du talk | Ce que Leon avait déjà | Ce que Leon fait autrement | Ce que Leon ajoute |
|---|---|---|---|
| Fichier injecté au démarrage | Le bloc de démarrage, poussé par le crochet `SessionStart` : le sommaire des fils (D24), 8 000 octets en tout | Le serveur assemble le bloc, et rien n'est écrit sur le poste (D31). Le bloc ne pousse que des clés (D25) | Les leçons acceptées, après le sommaire et avant le point du matin, dans 2 000 octets |
| Mémoire écrite par l'agent | L'outil MCP `remember`, qui écrit une note privée | Leon capte les sessions et écrit lui-même. Seul le serveur écrit un fil | `leon noter`, un brouillon privé et versionné, jamais poussé tel quel |
| Divulgation progressive | Cinq étages : le sommaire, le rappel, `leon dossier`, `leon fil`, puis `fetch` | L'en-tête d'un fil est sa branche réduite, jamais un texte écrit par l'agent ou par un tiers | Au démarrage, une ligne renvoie aux leçons restantes (`leon lecons`) |
| Mémoire comme fichiers | La recherche hybride sous RLS. Des commandes lancées du terminal, sans connecteur | Postgres sous RLS, pas de fichiers : ni sur le poste, ni en arborescence | Rien : l'arborescence est écartée (section 4) |
| Versions | Aucune : l'état d'un fil était remplacé en place | Les anciennes versions sont rangées à part, hors recherche et hors `fetch` | v1, v2, v3 pour chaque état de fil, leçon et note, avec leur provenance. Un historique visible, et la restauration |
| Concurrence | Une file stately pour le point du matin et le résumé. Rien par fil | Un numéro de version tient lieu d'empreinte | Un verrou sur la ligne du fil, une file par fil, un compare-and-set sur le numéro de version (C-a) |
| Permissions | La RLS. Un fil privé à son auteur, écrit par le serveur seul | Aucune mémoire d'organisation n'est écrite par un agent | L'état n'est rendu que si toutes ses entrées restent visibles (C-b). Le brouillon de l'agent, visible de son auteur seul |
| Portabilité | Trois routes à jeton, en commandes et en outils MCP du même nom. Les quatre outils de code | La mémoire reste dans Leon, jamais chez un tiers | `leon lecons`, et les leçons au MCP |
| Péremption et injection | Des dates partout. L'état des PR lu à la lecture. Les décisions vérifiées par id. Les sessions externes réduites à leurs clés | Une `[décision]` doit citer une preuve que le serveur vérifie | Une note n'est jamais une preuve (C-d). Le rêve propose de clore les fils dormants |
| Limites dans la session | La capture par crochets et le rangement en tâche de fond, sans dépendre de l'agent | Le travail de mémoire se fait hors de la session, par le serveur | Rien de plus |
| Le rêve | Quatre traitements de fond : le rangement, le résumé, le point du matin, la proposition « About you ». Seule la dernière propose avant d'écrire | Par règles d'abord, sans modèle | Le lot 15 : des propositions relues par un humain. Le modèle si David accepte QD1. L'équipe plus tard |
| Gain annoncé | Le lot 11 note la justesse sur 10 tâches réelles | On mesure sur nos tâches avant d'y croire | Les tokens et la durée, avec et sans la mémoire (C-f) |

## 3. Les six défauts que le talk a fait trouver dans le plan #122

Chacun a été vérifié sur le code de main ou dans le plan. Sa correction est reportée dans le plan.

### C-a. Deux mises à jour du même fil en même temps

- **Le défaut.** La clé de tâche du rangement est unique par session, pas par fil. Deux sessions de la même branche lancent donc deux tâches sur le même fil. Le `metadata` du fil est lu puis réécrit : une écriture peut effacer l'autre. Une fusion peut aussi croiser une mise à jour.
- **La correction.** Un verrou `for update` sur la ligne du fil pendant le rangement. Une file pg-boss stately par fil : la clé singleton est celle du fil, pas celle de la session. Un compare-and-set sur le numéro de version. Une fusion prend les verrous dans l'ordre des ids.

### C-b. La fuite par l'état d'un fil

- **Le défaut.** Le lot 2 rend privées les sources hors équipe (migration 0048). Mais l'état d'un fil écrit à partir d'une telle source restait lisible. C'était un tour indexé (`leon:fil:etat`), que la recherche trouvait et que `fetch` rendait. Rien ne prévenait le fil d'un changement d'accès.
- **La correction.** L'état garde la liste de ses entrées. Il n'est rendu que si le lecteur les voit toutes, et qu'elles gardent l'usage `resume`. C'est la règle de `readAboutSuggestion` (`src/server/briefing/about-suggestion.ts`). L'état n'est plus un tour indexé, ce qui amende D21 : c'est la dernière version, lue par `leon fil` et par le dossier. Un fil se trouve par ses clés et ses `mots_cles`, dans le sommaire, le rappel et le dossier.

### C-c. Le signal externe

- **Le défaut.** La consigne du sommaire dit de lire `leon fil` avant de commencer (D24). Or lire `leon fil` rendait la session externe (D27). Et le récit d'une session externe n'entre jamais dans l'état (D23). Suivre la consigne aurait donc privé l'état de son récit.
- **La correction.** Les lectures de Leon ne marquent plus la session (décision 1, section 5).

### C-d. La note `remember`

- **Le défaut.** `remember` range sa note en role `user` (`src/server/mcp/tools/remember-tool.ts:35`). Le vérificateur des `[décision]` l'aurait prise pour un message de l'utilisateur. Une note écrite par l'agent aurait ainsi pu justifier une décision. De plus, `remember` ne reçoit pas le client (`src/server/mcp/server.ts`), alors que `search` et `fetch` le reçoivent.
- **La correction.** Une note n'est jamais « message de l'utilisateur » pour une `[décision]`. Elle porte le client.

### C-e. Les anciens résumés (lot 6 du plan mère)

- **Le défaut.** Le lot 6 écrit un résumé par session et par dernier tour, sans dire le sort des précédents. La recherche aurait trouvé les anciens, y compris un « en cours » déjà fait. Le résumé s'écrit aussi dans le `metadata` de la session, que la route des faits écrit de son côté.
- **La correction.** Une fusion atomique de `metadata.resume`, comme celle des faits. Un nouveau résumé remplace les passages du précédent. Les anciens restent des tours datés de la session, comme des versions, sans passages : hors recherche et hors `fetch`.

### C-f. La mesure (lot 11 du plan mère)

- **Le défaut.** Le lot 11 note la justesse, mais ni les tokens ni la durée. Or c'est le gain que le talk annonce.
- **La correction.** On mesure aussi les tokens et la durée, avec et sans la mémoire.

## 4. Ce qu'on retient, ce qu'on écarte

**On retient :**
- les quatre garde-fous, appliqués à l'état des fils, aux leçons et aux notes ;
- le rêve : des propositions avec leurs preuves et leur fréquence, relues par un humain, sur les seules données que l'auteur a le droit de voir ;
- un brouillon de l'agent, privé et jamais poussé tel quel ;
- un texte relu et accepté par un humain peut être poussé au démarrage. C'est le CLAUDE.md du talk, mais tenu par le serveur ;
- la mesure du gain en tokens et en durée.

**On écarte :**
- **l'arborescence de fichiers virtuels** (`ls`, `cat`, `grep`) et le renommage de `leon fil`, `leon dossier` et `leon chercher`. Ces commandes font déjà ce travail. Leurs noms ont été posés par Amos. Un résolveur de chemins serait aussi une surface d'attaque neuve ;
- **une mémoire écrite par l'agent et relue à chaque session sans relecture humaine.** Ce serait une injection durable : un texte injecté une fois serait relu par toutes les sessions suivantes ;
- **l'API mémoire et rêve des Managed Agents d'Anthropic.** Les données sortiraient de Leon.

## 5. Les décisions d'Amos du 04/11

1. **Lire Leon ne rend plus la session « externe ».** C'est contre la recommandation de Claude.
   - Les lectures de Leon ne marquent plus la session : `leon fil`, `leon dossier`, `leon chercher`, et les outils `fil` et `dossier` du MCP.
   - D36 du plan y propose aussi `leon lecons`, `leon versions`, leurs outils MCP et `leon noter`. C'est posé à Amos (A14).
   - Le garde-fou reste. Une `[décision]` n'entre dans l'état que si elle cite l'id d'un message de l'utilisateur. La `[décision]` peut aussi citer une PR, un commit, un message de connecteur ou une réunion, vérifiés par le serveur. Une note `remember` ou `leon noter` n'est jamais un message de l'utilisateur.
   - Les tours de l'agent restent marqués « agent » dans le condensé.
   - Les autres signaux externes ne changent pas : `Agent`, `Task`, les autres outils `mcp__*`, `gh` en lecture.
   - Une question est posée à Amos (A14). Toutes ses sessions récentes sont marquées externes dans le bloc, à cause des sous-agents.
2. **Le rêve perso, par règles et sans modèle.**
   - C'est un nouveau lot 15, d'environ 5 jours, placé après le lot 11.
   - La version avec modèle, d'environ 3 jours, vient si David accepte QD1.
   - Le rêve d'équipe vient dans un lot suivant. Il lui faut d'abord la hiérarchie des managers, et une lecture à l'échelle de l'équipe.
3. **Une mémoire à jour en tout temps, et versionnée : v1, v2, v3.**
   - Chaque fil (son état), chaque leçon et chaque note `leon noter` garde ses versions.
   - Chaque version porte sa date et sa provenance : les sessions, les sources et les tours qui l'ont produite, l'outil, et qui l'a écrite. Ce peut être le serveur, une étape de modèle avec son modèle, un agent avec son outil, ou un humain.
   - L'historique est visible. On peut restaurer une version : cela crée une nouvelle version, et rien n'est effacé.
   - L'agent lit la dernière version. Il peut en demander une ancienne.
   - L'écriture se fait en compare-and-set sur le numéro de version : on écrit v(n+1) seulement si la dernière est encore vn. C'est la protection du talk contre deux écritures simultanées.
   - Les anciennes versions sont rangées à part. Elles ne sont jamais dans la recherche ni dans `fetch`.
   - Une version n'est rendue que si toutes ses entrées restent visibles du lecteur. C'est la règle de `readAboutSuggestion`.
   - Les versions sont effacées avec le compte, comme les fils.
4. **La mémoire passe avant le point du matin dans le bloc de démarrage.**
   - Le bloc reste à 8 000 octets. Claude Code coupe à 10 000 caractères, et Codex vers 10 000 octets.
   - L'ordre : le sommaire des fils, avec l'équipe sur ce dépôt ; puis les leçons acceptées ; puis le point du matin, qui prend le reste.
   - Toutes les leçons sont gardées et consultables, par `leon lecons` et par le MCP.
   - Au démarrage, les leçons tiennent dans un budget de 2 000 octets (proposé, A15). Celles du dépôt passent d'abord, puis les plus fréquentes, puis les plus récentes. Une dernière ligne dit combien d'autres leçons attendent dans `leon lecons`.
   - Les leçons sont rendues comme des données, échappées et balisées. Chacune porte « acceptée par toi le JJ/MM ».
   - Seul un texte relu et accepté par un humain entre dans ce qui est poussé. C'est l'exception à D25.
5. **L'agent de code écrit un brouillon privé.**
   - C'est une commande `leon noter`. L'outil MCP `remember` prend le même chemin, et reçoit enfin le client.
   - La note n'est visible que de son auteur. Elle est marquée de l'outil et de la session, et versionnée.
   - Elle n'est jamais poussée telle quelle. Elle n'est jamais preuve d'une `[décision]`.
   - Le rêve la lit, et peut proposer d'en faire une leçon.
   - Elle est reliée à un fil par proximité, comme `remember` (D22).
   - Le partage avec l'équipe passe par la passation de David (#106, branche `origin/david/passation-equipe`), après relecture. C'est une question à David.
   - Cela amende D27, qui disait « aucune écriture de plus ».

**Les six corrections** de la section 3 sont acceptées.

**L'ordre des lots :** 2 (fusionné), 3 (PR #129), 7, 6, 12, 13, 14, puis 4, 5, 8, 9, 11 et 15.

## 6. Ce qui reste ouvert

- **A14 (Amos).** Que faire des sessions marquées externes à cause des sous-agents ?
- **QD1 (David).** Le résumé côté serveur. Il conditionne le rêve avec modèle.
- **A15 (Amos).** Les choix du plan qui ne viennent pas d'Amos : le sens de la règle « leçon sans preuve », le lieu de la restauration, l'usage `noter`, la fusion qui garde le fil absorbé, un geste « effacer », une connexion récente pour accepter une leçon, le budget des leçons au démarrage.
- **QD13 (David).** La passation : partager une note `leon noter` avec l'équipe passe-t-il par #106 ?
- **QD14 (David).** Les versions dans une table à part, `versions_memoire`, plutôt qu'en tours de la source.
- **QD15 (David).** Le bloc de démarrage : la mémoire avant le point du matin (tranché par Amos), et 2 000 octets pour les leçons (proposé, A15).

Le détail est dans le [plan](../../plans/2026-11-03-memoire-a-disposition.md) : ses décisions D33 et suivantes, et le lot 15.
