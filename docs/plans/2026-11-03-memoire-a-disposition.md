# La mémoire à disposition : plan d'implémentation

3 novembre 2026 · Amos (avec Claude) · à relire par David · suite du [plan mémoire des sessions](2026-11-02-memoire-sessions.md), dont il reprend les règles, les contraintes, les décisions D1 à D20 et les contrats C1 à C6, amendés comme dit plus bas · s'appuie sur le [plan de la CLI sans clone](2026-11-03-cli-sans-clone.md) (#115, #120 : `leon setup`, `leon login`, le lanceur `~/.leon/bin/leon`) · le connecteur MCP distant est l'objet d'un plan à part (#121)

> **Pour les agents :** même méthode que le plan mémoire des sessions (un sous-agent neuf par tâche, tests d'abord, preuves avant de conclure, commit de ses seuls fichiers). Lire en entier l'en-tête, les « Règles », les « Contraintes globales », les « Décisions » et les « Contrats partagés » des **deux** plans, puis sa tâche. En cas de conflit, ce plan prime.

## En bref

Aujourd'hui, au démarrage d'une session, Leon colle un post-it : mes 4 dernières sessions sur ce dépôt. C'est trop peu, et presque toujours réduit à une ligne.

Ce plan change de logique :
1. **Leon range toute sa mémoire par fil de travail.** Un fil, c'est un dossier par sujet, tenu à jour par Leon : la page de connexion, le paiement. Il relie, quel que soit l'outil :
   - les sessions de code (Claude Code, Codex, Cursor, Antigravity) ;
   - les PR et les tickets ;
   - ce qui en parle dans les connecteurs : un message Slack, une réunion, une note, un mail ;
   - les décisions et leurs raisons.

   Le rangement se fait en tâche de fond : clés exactes (le graphe), proximité (le RAG), puis un appel de modèle qui écrit l'état du fil.
2. **Au démarrage, l'agent reçoit un sommaire** : la liste des fils du dépôt, la branche courante d'abord, et la consigne d'aller lire Leon avant de commencer (niveau 1).
3. **À chaque message, un rappel ciblé** : si le message touche un fil connu, une ligne le signale à l'agent (niveau 2). Leon ne cherche pas à sa place.
4. **L'agent va lire lui-même**, d'abord par une commande que tous les outils savent lancer dans leur terminal (`~/.leon/bin/leon fil …`), qui parle directement à Leon, sans connecteur. Le connecteur MCP, quand il est installé, donne les mêmes lectures.
5. **La capture devient complète** : en plus des messages et des faits, le raisonnement de l'agent et les échanges des sous-agents (lot 14).

Tout reste dans Leon (serveur, Postgres, RLS) : rien n'est écrit sur le poste, hormis les crochets, l'accord et la connexion de la CLI.

Exemple cible : Amos ouvre Cursor pour la première fois et demande « ajoute le test du mot de passe oublié sur la page de connexion ». Au premier message, Cursor reçoit le sommaire, où figure le fil « amos/login ». Le rappel lui signale que ce fil touche la demande. Cursor lance `leon fil` et y lit :
- la page a été faite lundi dans Claude Code ;
- la PR #120 est fusionnée ;
- on a choisi Better Auth, et pourquoi ;
- un essai a échoué à cause du mail de test ;
- David en a parlé sur Slack ;
- le test du mot de passe oublié restait à faire.

## Décisions d'Amos du 03/11

1. Toute la mémoire de Leon est en jeu : les sessions de tous les outils, GitHub et les connecteurs, pas un post-it (D21, D22).
2. Leon range la mémoire (graphe, RAG, un modèle) et la met à disposition ; c'est l'agent qui va chercher (D25, D27).
3. Rien n'est écrit sur le poste de l'utilisateur, hormis les crochets, l'accord et la connexion (D31).
4. L'agent lit d'abord par une commande de la CLI, qui parle directement à Leon ; le connecteur MCP est une voie en plus (D27).
5. Niveaux 1 et 2 par défaut, niveau 3 en option (D24, D26, D28).
6. La capture est maximale : le raisonnement, les échanges des sous-agents, la logique et les décisions (lot 14).
7. Ça marche pour Claude Code, Codex, Cursor et Antigravity, et un outil jamais utilisé profite de la mémoire faite avec un autre (D32).
8. Les corrections de la relecture du 03/11 sont acceptées.

## Lots, et ce qu'ils changent au plan mémoire des sessions

| Lot | Ce que ça change | Tâches | Effort |
|---|---|---|---|
| 12. Les fils et le dossier | Leon range la mémoire par fil, y relie les connecteurs et GitHub ; trois commandes de lecture (et les mêmes outils au MCP) ; le bloc de démarrage devient un sommaire des fils (niveau 1) | T39 à T47 | 8 j |
| 13. Le rappel à chaque message | une ligne de rappel quand un message touche un fil connu (niveau 2), pour Claude Code | T48 et T49 | 2 j |
| 14. La capture complète | le raisonnement de l'agent et les échanges des sous-agents remontent, et se retrouvent à la demande | T50 à T52 | 4 j |

Changements au plan mémoire des sessions (le détail est dans ses « Amendements du 03/11 ») :
- **Le lot 10 (RAG au premier prompt) est remplacé** par le lot 13 et par la lecture à la demande du lot 12. D18 n'a plus d'objet.
- **L'accord ne monte plus une échelle de versions** : chaque usage a son propre consentement (C7 révisé, ci-dessous). Le résumé du lot 6 dépend de l'usage `resume`.
- **Le lot 6 (le résumé) nourrit les fils.** Sa liste blanche garde les décisions vérifiées (D23). T24 ne met plus de texte du modèle dans le bloc de démarrage.
- **Le lot 3 (T13)** apporte l'état, la branche, les tickets fermés et l'auteur des PR, dont les lots 6 et 12 ont besoin. La section « L'équipe sur ce dépôt » (T14) se place dans le sommaire.
- **Le lot 7 (le filtre `depot`)** sert aux lectures du lot 12.
- **Les lots d'outils (4 et 5 Codex, 8 Cursor, 9 Antigravity)** posent chacun le rappel, les commandes de lecture et la capture complète de leur outil (D32), environ 1 j de plus chacun. Cursor et Antigravity reçoivent le sommaire au premier message par une requête en ligne, sans cache ni fichier sur le poste.
- **Le lot 11 (preuve et mesure)** mesure aussi les niveaux 1 et 2 (qui ouvre un fil, par quel outil) et décide du niveau 3 (D28).

**Ordre proposé (voir A8) :** 2, 3, 7, 6, 12, 13, 14, puis 4, 5, 8, 9 et 11.
- Le lot 2 ferme une fuite déjà ouverte : des PR de dépôts perso sont relevées avec l'ACL de l'organisation.
- Le lot 3 apporte ce que les lots 6 et 12 lisent des PR.
- Les lots 12 à 14 servent ensuite tout de suite dans Claude Code, déjà capté, au bout d'environ 9 jours.

Total du chantier : environ 43 jours, lot 1 compris (fait).

Si David refuse le résumé côté serveur (QD1), le lot 12 tient quand même : les fils se rangent par clés et par proximité, et leur état est la liste déterministe des sessions et des PR (D23).

## Architecture

- **Un fil est une source de Leon** (kind `leon_fil`), privée à son auteur et créée par le seul serveur. Son état est un tour `document`, réécrit et réindexé à chaque mise à jour. La recherche, `fetch` et la RLS le traitent comme le reste.
- **Le rangement tourne en tâche de fond** (pg-boss) :
  - à la fin d'une session (le champ `fin` de C2, ou 15 min sans faits nouveaux) ;
  - à l'indexation de son résumé ;
  - à l'arrivée d'une source de connecteur ou de GitHub ;
  - une fois au démarrage d'une session.
- **Le rangement procède dans l'ordre :**
  1. les clés exactes (le graphe) : branche, PR, ticket cité, URL ou branche citée ;
  2. la proximité (le RAG), bornée au projet et à 30 jours ;
  3. un appel de modèle, qui réécrit l'état du fil à partir de ce que l'accord permet.
- **Le démarrage lit ce qui est prêt**, sans modèle ni vecteur, en moins de 3 s, et met en file une mise à jour sans l'attendre.
- **Le rappel (niveau 2)** est une recherche plein texte bornée aux fils de l'auteur, sans modèle ni vecteur. Le message n'est ni stocké ni journalisé.
- **La lecture** passe d'abord par trois routes à jeton que la CLI expose en commandes (`leon dossier`, `leon fil`, `leon chercher`). Le connecteur MCP existant (`src/server/mcp/`) gagne les mêmes lectures, en deux outils et deux filtres. Son installation dans les outils et sa connexion OAuth relèvent du plan MCP distant (#121).
- **L'accord** ne monte plus une échelle de versions : chaque usage a son propre consentement (C7 révisé).

## Décisions

- **D21. Le fil.**
  - Kind `leon_fil`, ajouté à `SOURCE_KINDS` mais pas à `CAPTURE_KINDS`. Le nom évite la nature `fil` (« Thread ») des connecteurs ; sa nature est `fil_de_travail`.
  - Ni `remember` ni la route d'ingestion ne l'acceptent ; seul le serveur crée un fil. Il n'apparaît pas dans les outils du filtre `outil`.
  - Pas de migration pour le kind : le check de `sources.kind` n'existe plus depuis 0010.
  - `external_id` : `leon:fil:<project>:<clé>`. La clé est un condensé (sha256 tronqué) de la branche, ou un uuid pour un fil sans branche, si bien que la branche n'est jamais dans un identifiant qui pourrait finir dans un journal. Les journaux et les erreurs ne citent que des uuid.
  - ACL : `[owner_user_id]`. Un fil ne mélange jamais deux auteurs en v1 ; le fil d'équipe viendra après les lots 2 et 3.
  - `metadata` :
    - `project`, la même clé que les sessions ;
    - `branches`, `prs` (comme C1), `tickets` ;
    - `sessions` : ids, kind et date ;
    - `liees` : ids des sources de connecteurs et de GitHub, avec la clé qui les relie ; jamais de texte ;
    - `fichiers` : 50 au plus ;
    - `fusionne_dans`, `maj_le`.
  - Son état est un tour `document` (`leon:fil:etat`) de 2 000 caractères au plus.
  - **Suppression et fusion.** `leon_app` n'a pas de DELETE sur `sources`. Une fonction `security definer` `supprimer_fil(uuid)`, sur le modèle de `supprimer_document` (0042), avec `pg_temp` en dernier (0046), supprime un fil, bornée au kind `leon_fil`, au tenant et à l'auteur courants. Elle sert :
    - à la fusion : le fil gardé reçoit d'abord les `sessions`, `prs` et `liees` de l'autre ;
    - à la suppression du compte : les fils, dérivés et privés, sont effacés. Les sessions suivent la règle actuelle (gardées, invisibles de tous).
- **D22. Le rangement : le graphe d'abord, le RAG ensuite.**
  - **Les sessions.** Seules celles de l'auteur sont rangées : filtre explicite `owner_user_id`, kind dans `CODE_SESSION_KINDS`, jamais celle d'un collègue, même partagée avec lui.
    - Une session rejoint le fil de sa branche (hors `main` et `master`), sinon celui d'une de ses PR. Deux fils du même auteur qui partagent une PR fusionnent.
    - Une session sans clé rejoint le fil récent du projet le plus proche, si la similarité de son résumé, une fois indexé, dépasse le seuil. `shortcut:` le seuil est une valeur prudente dans le code ; le lot 11 (T38) le règle sur des cas réels.
    - Sans résumé ni vecteur, elle reste « hors fil » : elle n'ouvre pas de fil, et le sommaire l'ignore.
  - **Les connecteurs et GitHub.** Une source visible de l'auteur est reliée à un fil :
    - par clé exacte : un identifiant de ticket (`ABC-123`) lu dans la branche, le titre ou le corps d'une PR ; une PR par sa branche (à partir du lot 3) ; une URL de PR ou un nom de branche cité dans un message ;
    - sinon par proximité : même projet quand la source en a un, 30 jours au plus, au-dessus d'un seuil.
  - **Déclencheurs :** `fin` (C2), 15 min sans faits nouveaux (`startAfter`, comme T23), l'indexation d'un résumé, l'arrivée d'une source de connecteur, le démarrage d'une session.
  - Profondeur 2 au plus, pas de `WITH RECURSIVE` (D5).
- **D23. L'état d'un fil, par un modèle.**
  - **L'étape.** Une étape de modèle à part, `fil`, ajoutée au check de `appels_modele.step` par la migration du lot 6. Modèle claude-haiku-5-5, effort low. Un appel par fil touché, au plus une fois par session nouvelle.
  - **Ce qui entre dans le condensé**, relu juste avant l'appel :
    - les sessions dont l'accord porte l'usage `resume` (C7 révisé), avec leurs faits, leur résumé et l'état GitHub de leurs PR ;
    - les sources liées visibles de l'auteur.
  - **Ce qui n'y entre jamais :** les sessions sans l'usage `resume`, seulement listées ; le récit d'une session externe, seulement ses clés ; les coulisses du lot 14.
  - **Chaque élément porte sa provenance** : toi, l'agent, l'équipe ou un connecteur.
  - **La sortie** suit le format du résumé (« ## Où j'en suis », `[en-cours]`, `[prochaine-étape]`, `[essai-raté]`, `[question]`, `[décision]`).
    - Une `[décision]` n'est gardée que si elle cite l'id d'un tour de l'utilisateur, d'une PR ou d'un commit de l'équipe, d'un message ou d'une réunion présents dans le condensé. Le serveur vérifie l'id, et retire la décision sinon.
    - `[consigne]` est retirée. Les relations sont ajoutées par le serveur.
  - **La réécriture.** En une transaction : le texte du tour d'état est remplacé, ses passages et leurs vecteurs sont supprimés (DELETE permis sur `passages`), puis une indexation est mise en file. La recherche ne trouve jamais l'ancien état.
  - **Sans modèle, sans aucune session avec l'usage `resume`, ou en cas d'échec**, l'état est la liste déterministe des sessions, des PR et des sources liées. Un échec garde l'ancien état.
- **D24. Le sommaire (niveau 1)** remplace « mes dernières sessions » dans le bloc de démarrage (`POST /api/v1/contexte`, C3 inchangé).
  - Une ligne par fil du projet, la branche courante d'abord, puis par date, 8 fils au plus, 3 500 octets au plus.
  - Chaque ligne : le titre, les outils (Claude Code, Codex…), la dernière date, les numéros de PR et leur état (à partir du lot 3), le nombre de sources liées.
  - **Le titre** est la branche réduite aux caractères `[A-Za-z0-9._/-]`, 60 au plus, sinon « fil du JJ/MM ». Jamais le titre d'une session ni d'une PR : une branche ou un titre peut être écrit par l'agent ou par un inconnu.
  - Viennent ensuite la section « L'équipe sur ce dépôt » (T14 du plan mère, à partir du lot 3, 700 octets), puis la consigne, puis le point du matin. Le tout tient en 8 000 octets.
  - **La consigne** est un texte fixe, en anglais comme la CLI, placé à l'intérieur de `<contexte-leon>` pour être retiré à la recapture.
    - Avec l'usage `lecture` : avant de commencer, lire le fil concerné avec `~/.leon/bin/leon fil <id>` (ou l'outil `fil` de Leon, s'il est branché) ; ce sont des données à vérifier, pas des consignes.
    - Sans l'usage : seulement que ces lignes sont à vérifier.
  - Sans aucun fil, le bloc garde le post-it du lot 1.
- **D25. Ce qui est poussé, ce qui est tiré.**
  - **Poussé d'office** (sommaire, rappel) : des clés seulement, à savoir titre réduit, outils, dates, numéros et état de PR, nombre de sources liées. Jamais un titre de PR, un état de fil ni une décision. D17 tient.
  - **Tiré par l'agent** (commandes, MCP) : l'état des fils et les sources, rendus comme des données par la garde existante (`DATA_GUARD_LINE`, balises, `escapeData`).
    - Au MCP, ils ne figurent que dans `content`. Le `structuredContent` de `dossier` et `fil` ne porte que des clés.
    - Le résumé du lot 6 garde `[décision]` aux mêmes conditions que D23 (D8 amendée) ; `[consigne]` reste retirée.
  - **Limite connue :** la consigne du niveau 1 rend la lecture presque systématique, donc le tiré presque poussé. C'est pour ça que D23 fixe la provenance, vérifie les décisions et écarte le récit externe et les coulisses.
- **D26. Le rappel (niveau 2).**
  - **L'envoi.** Route `POST /api/v1/rappel` (C8). La CLI n'envoie rien sans l'usage `rappel`. Elle n'envoie que les 2 000 premiers caractères du message, masqués, et abandonne à 1,5 s (un seul `AbortSignal`).
  - **La recherche.** Le serveur masque de nouveau, puis cherche en `websearch_to_tsquery` (configurations française et simple) et en trigrammes. Il ne parcourt que les fils de l'auteur (`owner_user_id = ctx.userId and kind = 'leon_fil'`), jamais `searchPassages`. Il cherche dans leurs mots-clés : branches, fichiers, titres des PR et des sources liées. Ces mots servent à trouver, jamais à répondre. Moins de 300 ms visés.
  - **La réponse.** Au plus une ligne, de clés seulement (D25), balisée `<rappel-leon>…</rappel-leon>`, qui cite un ou deux fils pas encore rappelés dans la session. Sinon, un texte vide.
  - **Les fils déjà cités** sont rangés sous RLS dans une table `rappels_cites` (tenant, auteur, session, fil, date), purgée après 24 h. Le message n'y est jamais.
  - **Ni stocké ni journalisé.** Le message n'est ni stocké ni journalisé. La 400 ne recopie aucune valeur. Les compteurs ne portent ni session ni fil. Les réglages des journaux de la base (requêtes lentes) sont vérifiés.
- **D27. Les lectures : la commande d'abord, le MCP en plus.**
  - **Trois routes à jeton, en `.strict()`**, avec le même rendu et la même garde que le MCP (C11) :
    - `POST /api/v1/dossier` : les fils du projet, de la branche d'abord ;
    - `POST /api/v1/fil` : un fil, avec son état, ses sessions (50 au plus), ses PR et tickets (20 au plus) et leur état GitHub (à partir du lot 3), ses sources liées et les ids à ouvrir. La coupe est signalée ;
    - `POST /api/v1/chercher` : la recherche existante, bornée au dépôt par `depot` (lot 7), obligatoire.
  - **Les commandes de la CLI.** `leon dossier`, `leon fil <id>` et `leon chercher "<requête>"` appellent ces routes, écrivent sur la sortie standard et rien sur le disque. Elles marchent dans les quatre outils, sans connecteur.
  - **Le MCP** gagne les mêmes lectures : les outils `dossier` et `fil`, et, pour `search`, les filtres `depot` et `fil`, avec la mention du fil et des PR d'une session trouvée. `MCP_INSTRUCTIONS` est réécrite (« before starting work on a repository, call dossier, then fil »). Le branchement du connecteur dans les outils et sa connexion relèvent du plan MCP distant (#121) ; ce plan n'écrit aucun jeton.
  - **La consigne et les descriptions** ne citent que `dossier`, `fil` et la recherche bornée au dépôt, jamais une recherche dans toute la mémoire (vigilance 6).
  - **Chaque lecture d'un fil ou du dossier est notée** (`recordReads`, existant), avec la session quand elle est connue, pour la mesure du lot 11.
  - Aucune écriture de plus.
- **D28. Le niveau 3 (passage obligé) n'est pas construit ici.** Le lot 11 mesure d'abord si les niveaux 1 et 2 suffisent. S'il le faut, un lot à part le conçoit, en option éteinte par défaut, avec son propre accord.
- **D29. La capture complète.**
  - En plus des messages et des faits, la CLI envoie :
    - le raisonnement de l'agent, quand le transcript en porte le texte ;
    - pour chaque sous-agent, sa consigne et son rapport final ;
    - les appels d'outils réduits, comme les commandes de C1 : outil, cible relative au dépôt, statut. Jamais les sorties brutes.
  - Ils passent par leur propre route (`POST /api/v1/coulisses`), pas par le contrat d'ingestion (règle du plan mémoire des sessions).
  - Ils sont rangés comme tours de la session, sous son ACL, avec deux nouveaux rôles, `raisonnement` et `sous_agent` (migration du check de `turns.role`), que la recherche peut filtrer.
  - Masquage : `maskSecrets` sur le poste puis sur le serveur. Chaque bloc est coupé à 20 000 caractères, comme les messages.
  - Accord : l'usage `coulisses` (C7 révisé).
  - Les constats de la relecture du 03/11 sur ce lot et sur le niveau 3 sont repris dans l'annexe de relecture (voir « Questions ») ; ces deux parties se détaillent quand on y arrive, avec David.
- **D30. L'accord, par usage.** Les versions cumulatives liaient des permissions sans rapport : pour avoir le rappel, il aurait fallu accepter le résumé par le fournisseur du modèle. On les remplace par des usages (C7 révisé).
  - La version 2 (les gestes) reste la base, et la version 0 le retrait.
  - Chaque usage s'ajoute avec son propre texte, confirmé à part, et sa date : `lecture`, `rappel`, `resume`, `coulisses`. `--oui` et `--yes` n'ajoutent jamais un usage.
  - Le serveur vérifie l'usage à chaque emploi : `resume` pour le résumé et l'état des fils, `rappel` pour le rappel, `coulisses` pour le lot 14.
  - Un refus laisse l'accord et les réglages de l'outil inchangés.
- **D31. Rien sur le poste.** Aucune mémoire n'est écrite sur le disque de l'utilisateur : ni fichier de règles, ni Markdown, ni cache du bloc. Seuls y vivent les crochets, l'accord et la connexion de la CLI. Le plan mère est amendé en conséquence : D16, T28, T30, T33, T35 et A4.
- **D32. Les quatre outils.** Chaque lot d'outil apporte, pour son outil :
  - le sommaire. Pour Cursor et Antigravity, il arrive au premier message, par une requête en ligne, si bien qu'un outil jamais utilisé reçoit la mémoire faite ailleurs ;
  - le rappel ;
  - les commandes de lecture, citées dans la consigne ;
  - la capture complète de son format, selon son essai.

  Le rangement se déclenche aussi après 15 min sans faits nouveaux, pour les outils sans fin de session.

## Contrats partagés (en plus de C1 à C6)

**C7 révisé. L'accord local, par usage** : `~/.leon/accord.json`, en 0600.

```json
{ "outils": { "claude_code": { "version": 2, "installe_le": "…", "usages": { "lecture": "…", "rappel": "…", "resume": "…" } } } }
```

- `version` garde son sens (2 : les gestes ; 0 : retrait).
- `usages` liste ce qui a été accepté, avec la date.
- C2 (`POST /api/v1/faits`) gagne un champ facultatif `usages: string[]`, rangé dans `metadata.usages`. `accord` reste borné à 2..4.
- Un usage absent vaut refus.
- Le lot 6 lit `resume` là où il lisait la version 3.

**C8. `POST /api/v1/rappel`** : `{ projet, branche, session, message }`, `.strict()`.
- `projet` suit `ProjectSchema` ; `branche` et `session` font 200 caractères au plus ; `message`, 2 000 caractères au plus.
- Sortie : `{ texte }`, une ligne balisée ou vide.
- Sans l'usage `rappel` (lu dans la dernière metadata connue de l'utilisateur pour cet outil, ou envoyé par la CLI), le texte est vide.
- Un serveur ancien répond 404 : la CLI ne sort rien, avec le code 0.

**C9. Les lectures** (routes de C11 et outils MCP du même nom) :
- `dossier { projet, branche? }` rend 20 fils au plus : `{ id, titre, outils, derniere_date, prs, liees, etat_court }` ;
- `fil { id }` rend `{ titre, etat, sessions, prs, tickets, liees, sources }`, avec les bornes de D27 et la coupe signalée.

Le rendu passe par `src/server/mcp/tools/render.ts`, avec sa garde. Au MCP, le `structuredContent` ne porte que les clés (`id`, `titre`, dates, numéros de PR).

**C10. `POST /api/v1/coulisses`** (lot 14) : `{ kind, external_id, usages, blocs: { role: 'raisonnement' | 'sous_agent', ts, texte }[] }`, `.strict()`, 256 Kio au plus. 202, ou 404 sur un serveur ancien.

**C11. Les routes de lecture** : `POST /api/v1/dossier`, `POST /api/v1/fil` et `POST /api/v1/chercher { projet, depot, requete }`.
- Elles demandent le jeton et l'usage `lecture`, et sont en `.strict()`, 4 Kio au plus.
- Elles rendent `{ texte }` (le rendu gardé de C9).
- Un serveur ancien répond 404 : la commande le dit sur la sortie d'erreur, avec le code 0.

## Lot 12 : les fils et le dossier

### T39 · Le kind `leon_fil`, sa suppression et sa fusion

**Fichiers :**
- `src/capture/turn.ts` (`SOURCE_KINDS`), `src/lib/labels.ts`, `src/test/fixtures.ts`, `src/components/search/view-model.ts` ;
- `src/server/db/migrations/NNNN-supprimer-fil.sql` (nouveau, numéro pris sur main au moment du lot) ;
- `src/server/auth/delete-account.ts`, `src/server/db/rls-coverage.db.test.ts`.

**Fait quand :**
- `leon_fil` est un kind (D21) : hors `CAPTURE_KINDS`, refusé par `remember` et par la route d'ingestion, absent du filtre `outil`, avec la nature `fil_de_travail` ;
- la migration crée `supprimer_fil(uuid)` (D21), `security definer`, `pg_temp` en dernier, bornée au kind, au tenant et à l'auteur ;
- la suppression du compte efface les fils de la personne par cette fonction ;
- `DELETE_ALLOWED` ne change pas.

**Tests :**
- test db de la migration :
  - l'auteur supprime son fil ;
  - refus pour le fil d'un collègue ;
  - refus pour tout autre kind ;
- `delete-account.db.test.ts` : plus aucun fil après la suppression ;
- `ingest-routes.db.test.ts` et le test de `remember` : `leon_fil` refusé ;
- `rls-coverage.db.test.ts`.

### T40 · Le rangement des sessions

**Fichiers :** `src/server/sessions/threads.ts` (nouveau), `src/server/sessions/threads-queue.ts` (nouveau), `src/server/api/faits-routes.ts` (mise en file), `src/instrumentation-node.ts`.

**Fait quand :**
- à la réception de faits, une tâche pg-boss range la session selon D22, sous `withTenant` de l'auteur :
  - la clé de tâche est unique par session ;
  - avec `fin`, la tâche part tout de suite ; sans `fin`, elle part après 15 min (`startAfter`) ;
- elle crée ou met à jour le fil (`metadata`, D21), avec un filtre explicite sur l'auteur et sur `CODE_SESSION_KINDS` ;
- elle fusionne deux fils du même auteur qui partagent une PR, par `supprimer_fil` ;
- elle est idempotente ;
- le worker résout le contexte de l'auteur et sort s'il est parti ;
- les journaux ne citent que des uuid.

**Tests :** `threads.db.test.ts` (nouveau) :
- même branche, même fil ;
- même PR sur deux branches : fusion, un seul fil rendu ;
- une session de collègue partagée avec moi n'entre jamais dans mon fil ;
- envoi répété : rien en double ;
- sans `fin` : rangée après 15 min (file simulée).

### T41 · Le rattachement par proximité et la session « hors fil »

**Fichiers :** `src/server/sessions/threads.ts`, `src/server/sessions/resume-worker.ts` (lot 6 : le déclencheur après l'indexation du résumé).

**Fait quand :**
- une session sans clé est rattachée selon D22, une fois le vecteur de son résumé écrit ;
- sans résumé ni vecteur (pas de fournisseur de vecteurs, moins de 6 échanges, pas d'usage `resume`), elle reste hors fil et n'ouvre rien ;
- le seuil est une constante prudente, avec son commentaire `shortcut:`.

**Tests :** `threads.db.test.ts` (vecteurs simulés) :
- au-dessus du seuil : rattachée ;
- en dessous : hors fil, aucun fil ouvert ;
- sans fournisseur de vecteurs : aucun rattachement.

### T42 · Relier les connecteurs et GitHub

**Fichiers :** `src/server/sessions/thread-links.ts` (nouveau), `src/server/sessions/threads-queue.ts` (mise en file à l'arrivée d'une source), `src/server/connectors/sync.ts` (l'appel).

**Fait quand :**
- une source de connecteur ou de GitHub visible de l'auteur est reliée à ses fils selon D22, d'abord par clé exacte, puis par proximité bornée ;
- `metadata.liees` ne garde que des ids et la clé qui relie ;
- une source invisible du lecteur n'est jamais rendue par les lectures.

**Tests :** `thread-links.db.test.ts` (nouveau) :
- un ticket `ABC-123` cité dans le titre d'une PR relie le ticket ;
- un message Slack qui cite l'URL d'une PR rejoint son fil ;
- une réunion proche (vecteurs simulés) rejoint le fil ;
- une source d'un autre membre, invisible de l'auteur : jamais reliée ;
- aucune copie de texte dans `metadata`.

### T43 · L'état du fil

**Fichiers :** `src/server/sessions/thread-state.ts` (nouveau), `src/server/llm/llm.ts` et `src/server/llm/models.ts` (étape `fil`), la migration du lot 6 (`step` gagne `fil`).

**Fait quand :**
- l'état est écrit selon D23 : condensé borné aux sessions avec l'usage `resume` et aux sources liées, provenance, décisions vérifiées, `[consigne]` retirée, 2 000 caractères au plus ;
- la réécriture remplace le texte, supprime les passages et leurs vecteurs, puis met en file l'indexation ;
- sans modèle, sans usage `resume` ou en cas d'échec, l'état est déterministe, et un échec garde l'ancien ;
- le condensé passe par `prompt-guard`.

**Tests :**
- `thread-state.test.ts` (modèle simulé) :
  - une décision qui ne cite aucun id présent est retirée ;
  - un rapport piégé ne produit aucune décision ;
  - `[consigne]` est retirée ;
  - 2 001 caractères sont coupés ;
- `thread-state.db.test.ts` :
  - fil dont aucune session n'a l'usage `resume` : aucun appel de modèle ;
  - fil mixte : rien de la session sans usage dans le condensé ;
  - second état : l'ancien n'est plus trouvé par la recherche ;
  - modèle en échec : ancien état gardé.

### T44 · Les routes et les commandes de lecture

**Fichiers :**
- `src/capture/api-contract.ts` (C9, C11, `API_PATHS`) ;
- `src/server/sessions/thread-read.ts` (nouveau : la lecture commune), `src/server/api/read-routes.ts` (nouveau), `src/server/api/app.ts` ;
- `src/cli/read-commands.ts` (nouveau), `src/cli/leon.ts` (`dossier`, `fil`, `chercher`) ;
- `src/test/contracts/api-contract.db.test.ts` (`SERVED`).

**Fait quand :**
- les trois routes suivent C9 et C11, sous `withTenant` du porteur, avec l'usage `lecture` ;
- `chercher` exige `depot` ;
- le rendu est gardé (D25) et borné (D27), avec la coupe signalée ;
- les commandes écrivent sur la sortie standard, rien sur le disque ;
- un 404 donne un message fixe sur la sortie d'erreur et le code 0 ;
- chaque lecture est notée (`recordReads`).

**Tests :**
- `read-routes.db.test.ts` :
  - 401, 400, 413 ;
  - sans usage `lecture` : refus ;
  - le fil d'un collègue est introuvable ;
  - un titre et un état piégés restent échappés ;
  - `chercher` sans `depot` : 400 ;
- `read-commands.test.ts` : serveur ancien (404), serveur absent ;
- contrat : `api-contract.db.test.ts`.

### T45 · Le MCP : `dossier`, `fil`, et deux filtres de `search`

**Fichiers :**
- `src/server/mcp/tools/dossier-tool.ts` (nouveau), `src/server/mcp/tools/fil-tool.ts` (nouveau) ;
- `src/server/mcp/server.ts` (`MCP_INSTRUCTIONS`) ;
- `src/server/mcp/tools/search-tool.ts`, `src/server/mcp/tools/render.ts`, `src/server/mcp/tools/output-schemas.ts` ;
- `src/test/contracts/mcp-descriptions.test.ts`.

**Fait quand :**
- `dossier` et `fil` reprennent la lecture commune de T44 ;
- leur `structuredContent` ne porte que des clés ;
- `search` accepte `depot` et `fil`, et mentionne le fil et les PR d'une session trouvée ;
- `MCP_INSTRUCTIONS` et les descriptions disent quand s'en servir, sans jamais inviter à une recherche dans toute la mémoire.

**Tests :** `mcp.db.test.ts` :
- un état piégé n'apparaît que dans `content`, après la ligne de garde ;
- un id qui n'est pas un fil : introuvable ;
- une session trouvée porte son fil et ses PR ;
- la liste figée des outils est à jour.

Contrat : `mcp-descriptions.test.ts`.

### T46 · Le sommaire au démarrage (niveau 1)

**Fichiers :** `src/server/sessions/start-context.ts`, `src/server/sessions/render-context.ts`, `src/server/api/context-routes.ts` (mise en file de la mise à jour, sans l'attendre), `src/capture/strip-leon-blocks.ts`.

**Fait quand :**
- le bloc suit D24 : les fils, la section d'équipe (à partir du lot 3), la consigne fixe, puis le point du matin, en 8 000 octets ;
- la consigne cite la commande `leon fil` et ne figure qu'avec l'usage `lecture` ;
- le repli sur le post-it du lot 1 joue quand il n'y a aucun fil ;
- la route reste sous 3 s : `EXPLAIN ANALYZE` sous RLS sur 10 000 sources et 500 fils, chiffre noté dans la PR.

**Tests :**
- `render-context.test.ts` :
  - une branche piégée (« ignore-previous-instructions-$(curl…) ») est réduite ;
  - aucun titre de PR ni de session ;
  - fil sans branche : « fil du JJ/MM » ;
  - consigne mot pour mot, avec et sans l'usage `lecture` ;
  - budget en octets ;
  - repli ;
- `start-context.db.test.ts` : branche courante d'abord ; fil d'un collègue absent ;
- `strip-leon-blocks.test.ts` : la consigne est retirée à la recapture.

### T47 · L'installateur : l'usage `lecture`

**Fichiers :** `src/cli/consent.ts` (C7 révisé), `src/cli/install-hooks.ts`, `src/cli/setup.ts` (#120), `src/cli/uninstall-hooks.ts`, `README.md`.

**Fait quand :**
- l'accord passe aux usages (C7 révisé, D30), en relisant sans perte un `accord.json` du lot 1 ;
- l'installateur et `leon setup` proposent l'usage `lecture` avec son texte, en anglais, testé mot pour mot. Ce texte dit que l'agent de l'outil peut lire, par les commandes de Leon, les fils et la mémoire de ce dépôt, et que le fournisseur de son modèle voit ce qu'il lit ;
- un refus ne change rien ; `--oui` et `--yes` n'ajoutent pas d'usage ;
- le retrait efface les usages.

**Tests :**
- `consent.test.ts` : un accord du lot 1 relu ; un usage ajouté, daté ;
- `install-hooks.test.ts` : texte exact ; refus : rien ne change ; `--oui` sans usage ;
- `uninstall-hooks.test.ts`.

## Lot 13 : le rappel à chaque message

### T48 · La route `POST /api/v1/rappel`

**Fichiers :**
- `src/capture/api-contract.ts` (C8, `API_PATHS.rappel`) ;
- `src/server/sessions/reminder.ts` (nouveau), `src/server/api/reminder-routes.ts` (nouveau), `src/server/api/app.ts` ;
- `src/server/db/migrations/NNNN-rappels-cites.sql` (nouveau : la table, sa RLS, sa purge) ;
- `src/server/db/rls-coverage.db.test.ts`, `src/test/contracts/api-contract.db.test.ts`.

**Fait quand :** D26 et C8 sont respectés :
- recherche bornée aux fils de l'auteur, sans `searchPassages`, en `websearch_to_tsquery` ;
- ligne de clés balisée ;
- fils déjà cités rangés dans `rappels_cites`, purgés après 24 h ;
- sans l'usage `rappel`, un texte vide sans aucune recherche ;
- le message n'est ni stocké ni journalisé.

**Tests :** `reminder-routes.db.test.ts` :
- 401, 400 (sans recopier les valeurs), 413 ;
- sans usage : vide ;
- un message qui touche un fil : une ligne ;
- le même message deux fois dans la session : la seconde fois, vide ;
- deux sessions : le même fil cité dans chacune ;
- aucun fil touché : vide ;
- fil d'un collègue : jamais cité ;
- aucune ligne de `turns`, `passages`, `sources.metadata` ni `rappels_cites` ne contient le message ;
- la console espionnée ne l'a pas reçu.

Contrat : `api-contract.db.test.ts`.

### T49 · Le crochet de Claude Code

**Fichiers :**
- `src/cli/reminder.ts` (nouveau, `leon rappel`), `src/cli/leon.ts` ;
- `src/cli/hook-commands.ts` (`HookSubcommand`), `src/cli/hook-commands.contrat.test.ts` ;
- `src/cli/install-hooks.ts` (UserPromptSubmit, délai 5 s, posé seulement avec l'usage `rappel`), `src/cli/consent.ts` (usage `rappel`), `src/cli/uninstall-hooks.ts` ;
- `README.md`.

**Fait quand :**
- le crochet lit le message dans l'entrée du crochet ;
- sans l'usage `rappel`, il sort sans rien lire du réseau ;
- sinon il coupe le message à 2 000 caractères, le masque, l'envoie (C8) et imprime la ligne, ou rien ;
- un serveur lent, absent ou ancien donne une sortie vide en moins de 2 s, avec le code 0 ;
- les gardes de T06 (Cursor, Codex) s'appliquent ;
- l'installateur propose l'usage `rappel` avec son texte : le message part vers Leon seul, ni stocké ni journalisé. Le crochet n'est posé qu'une fois l'usage accepté, et le retrait l'enlève.

**Tests :**
- `reminder.test.ts` :
  - sans usage : aucune requête ;
  - serveur lent : vide en moins de 2 s ;
  - connexion refusée : vide ;
  - 404 : vide ;
  - `cursor_version` : garde ;
- `install-hooks.test.ts` :
  - texte exact ;
  - refus de l'usage : pas de crochet de prompt ;
  - `--oui` sans l'usage : pas de crochet ;
- `uninstall-hooks.test.ts` ;
- contrat : `hook-commands.contrat.test.ts`.

## Lot 14 : la capture complète

### T47 · L'essai : la forme du raisonnement et des sous-agents

**Fait quand :** sur une session de test créée pour l'occasion (un dépôt jetable, une tâche qui lance un sous-agent), on relève dans le transcript :
- si les blocs de raisonnement portent leur texte, selon le modèle et la version de Claude Code ;
- où vivent les échanges des sous-agents : lignes isSidechain du même fichier, ou fichiers à part ;
- la forme d'une consigne et d'un rapport de sous-agent.

Le résultat est noté dans une annexe de l'étude. Aucune vraie conversation n'est lue.

### T48 · La CLI relève les coulisses

**Fichiers :** `src/capture/session-backstage.ts` (nouveau : `extractBackstage`), ses tests et une fixture inventée, `src/cli/capture-session.ts`, `src/cli/import-claude-code.ts`, `src/cli/consent.ts` (version 5).

**Fait quand :**
- avec un accord de version 5, la CLI envoie C10 après les tours et les faits : le raisonnement, la consigne et le rapport de chaque sous-agent, masqués, 20 000 caractères par bloc, 256 Kio par envoi ;
- les blocs injectés par Leon sont retirés (`stripLeonBlocks`) ;
- sans la version 5, rien ne change.

**Tests :** `session-backstage.test.ts` (faux secret masqué, coupe, sous-agent rattaché à son appel, bloc Leon retiré) ; `capture-session.test.ts` (version 4 : rien ; version 5 : envoi).

### T49 · Le serveur range les coulisses

**Fichiers :** `src/capture/turn.ts` (`TURN_ROLES`), `src/server/db/migrations/NNNN-roles-coulisses.sql` (nouveau), `src/server/api/backstage-routes.ts` (nouveau), `src/server/api/app.ts`, `src/server/mcp/tools/search-tool.ts` (filtre `type` : raisonnement, sous-agent), `src/server/mcp/tools/render.ts`.

**Fait quand :**
- C10 est respecté ;
- les blocs deviennent des tours de la session, sous son ACL, masqués de nouveau, indexés par le pipeline existant ;
- l'envoi répété est idempotent ;
- le point du matin et le bloc de démarrage n'en reprennent rien ; ils nourrissent le résumé (lot 6) et l'état du fil (T41).

**Tests :** `backstage-routes.db.test.ts` :
- 202, 400, 401, 413 ;
- la session d'un collègue reste intacte ;
- un secret glissé est masqué en base ;
- `search` filtré par `raisonnement`.

## Points de vigilance

1. **Le coût.** Un appel de modèle par session close pour le résumé (lot 6), et un par fil touché pour son état (T41). La capture complète multiplie le volume indexé. Parades :
   - claude-haiku-5-5 en effort low ;
   - un appel par fil et par session nouvelle au plus ;
   - des compteurs par organisation dans le tableau admin ;
   - une mesure du volume par session (compteurs côté serveur) avant d'ouvrir la version 5 à d'autres qu'Amos.
2. **L'injection durable.** Parades :
   - D25 : seul le tiré porte du texte écrit par un modèle, et il est rendu comme des données ;
   - titres déterministes ;
   - `[consigne]` retirée ;
   - la mention « venu de l'extérieur ».
3. **Le périmé.** L'état d'un fil vieillit. Parades : des dates partout, l'état GitHub des PR lu à la lecture et non figé dans l'état, la mise à jour au démarrage.
4. **Le délai.** La route de contexte et celle du rappel n'appellent ni modèle ni vecteur ; le rangement est en tâche de fond.
5. **La vie privée.** Les fils restent privés à leur auteur en v1. Le message du rappel n'est ni stocké ni journalisé. Le raisonnement et les sous-agents demandent la version 5.
6. **Les conflits** avec la PR #115 et la session sur les connexions des outils : ce plan ne touche ni à la connexion ni aux jetons (D27).

## Questions

Pour Amos :
- A8. L'ordre : 7, 6, 12, 13, 14, puis 2, 3, 4, 5, 8, 9 et 11 ?
- A9. Les décisions et leurs raisons dans le résumé et l'état des fils, lisibles par l'agent à la demande, mais jamais poussées d'office (D25) ?
- A10. La capture complète : le raisonnement et les échanges des sous-agents, mais jamais les sorties brutes des outils (D29) ?
- A11. Le niveau 3 décidé après la mesure du lot 11 (D28) ?

Pour David :
- QD7. Le kind `fil` comme source (D21), plutôt qu'une table à part ?
- QD8. Le coût du lot 12 en plus du lot 6 : un appel de modèle par fil touché ?
- QD9. Les rôles de tour `raisonnement` et `sous_agent` (D29) : leur place dans le point du matin et dans la recherche par défaut ?
