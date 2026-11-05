# La mémoire à disposition : plan d'implémentation

3 novembre 2026 · Amos (avec Claude) · à relire par David · suite du [plan mémoire des sessions](2026-11-02-memoire-sessions.md), dont il reprend les règles, les contraintes, les décisions D1 à D20 et les contrats C1 à C6, amendés comme dit plus bas · s'appuie sur le [plan de la CLI sans clone](2026-11-03-cli-sans-clone.md) (#115, questions tranchées en #120 : `leon login` en S05, le lanceur `~/.leon/bin/leon` en S08, `leon setup` en S10, codés et fusionnés depuis (#124)) · le connecteur MCP distant est l'objet d'un plan à part (#121)

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
5. **La capture devient complète** : en plus des messages et des faits, le raisonnement de l'agent, les échanges des sous-agents et les appels d'outils, réduits (lot 14).

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
5. Niveaux 1 et 2 proposés à l'installation, actifs une fois leur usage accepté ; niveau 3 en option (D24, D26, D28, D30).
6. La capture est maximale : le raisonnement, les échanges des sous-agents, la logique et les décisions (lot 14).
7. Ça marche pour Claude Code, Codex, Cursor et Antigravity, et un outil jamais utilisé profite de la mémoire faite avec un autre (D32).
8. Les corrections de la relecture du 03/11 sont acceptées.

## Décisions d'Amos du 04/11

Elles suivent le talk de Lamis (Applied AI, Anthropic, AI DevCon) sur le context engineering, la mémoire et le « rêve ». L'analyse et ce qu'on en retient sont dans la [note d'étude](../etudes/context-engineering-2026-11/README.md).

1. Lire Leon ne rend plus la session « externe », contre la recommandation de Claude. Le garde-fou reste : une `[décision]` n'entre dans l'état que si elle cite un id vérifié par le serveur, jamais une note (D36). Les autres signaux externes ne changent pas (A14, tranchée le 05/11 : voir plus bas).
2. Un rêve perso par règles, sans modèle : le lot 15, environ 5 j, après le lot 11 (D39). La version avec modèle (environ 3 j) vient si David accepte QD1. Le rêve d'équipe vient dans un lot suivant.
3. Une mémoire à jour en tout temps, et versionnée. L'état de chaque fil, chaque leçon et chaque note gardent leurs versions, avec leur provenance et leur date (D33). L'historique se lit, et une version se restaure. L'écriture se fait en compare-and-set sur le numéro de version (D34).
4. La mémoire passe avant le point du matin dans le bloc de démarrage, toujours en 8 000 octets : le sommaire des fils, puis les leçons acceptées, puis le point du matin (D37). Seul un texte relu et accepté par un humain est poussé.
5. L'agent de code écrit un brouillon privé, `leon noter`, par le même chemin que `remember` (D38). Le partage avec l'équipe passera par la passation de David (#106), après relecture (QD13).
6. Les six corrections de l'analyse du talk sont acceptées :
   - deux mises à jour du même fil en même temps : verrou, file par fil, compare-and-set (D34) ;
   - l'état d'un fil tiré d'une source devenue privée restait lisible : il ne l'est plus, et il sort de la recherche (D35) ;
   - le signal externe : le point 1 (D36) ;
   - une note `remember` est rangée en role `user` et ne dit pas son outil : elle n'est jamais preuve, et porte son outil (D36, D38) ;
   - lot 6 : `metadata.resume` s'écrit de façon atomique, et un nouveau résumé remplace les passages du précédent (T23 du plan mère) ;
   - lot 11 : mesurer aussi les tokens et la durée, avec et sans la mémoire (T38 du plan mère).
7. Ce qu'on écarte :
   - une arborescence de fichiers virtuels (`ls`, `cat`, `grep`) et le renommage de `leon fil`, `leon dossier` et `leon chercher`, qui font déjà ce travail ;
   - une mémoire écrite par l'agent et relue à chaque session sans relecture humaine : ce serait une injection durable ;
   - l'API mémoire et rêve des Managed Agents d'Anthropic : les données sortiraient de Leon.
8. L'ordre : 2 (fusionné), 3 (PR #129), 7, 6, 12, 13, 14, puis 4, 5, 8, 9, 11 et 15.

## Décisions d'Amos du 05/11

Ce sont ses réponses à A14, A15 et A16.

1. Les sous-agents. D'abord le tri : la capture distingue les vrais messages de l'utilisateur des rapports de sous-agents, qui arrivent comme des messages `user`. Un rapport n'est jamais un message de l'utilisateur, ni preuve d'une `[décision]` (T43). Ensuite, dès le lot 14, un sous-agent qui ne lit que le dépôt ne rend plus la session externe. Un sous-agent qui va sur le web ou appelle un outil réseau la rend toujours externe (D36, T63). Seules les sessions captées après le lot 14 en profitent : une session déjà marquée externe le reste.
2. Les lectures. `leon lecons`, `leon versions`, `leon noter`, et les outils MCP `lecons`, `versions` et `remember` ne rendent pas la session externe. `search` et `fetch` du MCP restent externes. L'écart entre `remember` et `leon noter` disparaît (D36).
3. La leçon sans preuve : toutes ses preuves ont plus de 90 jours. Le rêve propose de la retirer, l'humain décide. Jamais pour une leçon écrite à la main (D39).
4. Le budget des leçons au démarrage : pas de chiffre fixe. Les leçons prennent toute la place que le sommaire laisse, dans les 8 000 octets. Le point du matin ne prend que ce qui reste après elles (D37).
5. Les versions sont archivées et toujours accessibles : sur le site, par `leon versions` et par l'outil `versions`. Hors la suppression du compte (D21, A12), aucune n'est effacée. La restauration se fait sur le site seulement, par l'auteur, et crée une nouvelle version (D33, C12).
6. L'usage `noter` est à part, proposé à l'installation et déjà coché par défaut, comme les niveaux 1 et 2. L'utilisateur peut le décocher (D30). `lecture` et `rappel` le sont aussi : voir le point 9.
7. La fusion garde le fil absorbé, masqué, et ses versions restent lisibles (D21).
8. Une connexion de moins d'une heure pour accepter, écrire ou remettre une leçon, et pour remettre une version (D37, T55).

Ses réponses à A16 :

9. Les usages `lecture`, `rappel` et `noter` sont cochés par défaut. Quand un agent installe Leon pour l'utilisateur (`--yes`, le bouton « Je demande à Claude »), les cases s'affichent, cochées, sur la page « Autoriser » du navigateur, où c'est l'humain qui clique. L'agent ne coche jamais rien à sa place : `--yes` n'ajoute toujours aucun usage par lui-même. Ce sont les cases de la page qui les donnent (D30, T64).
10. Décocher `noter` bloque aussi `remember` au MCP. Le serveur garde ce choix dans un réglage du compte, que `remember` lit, et que l'installateur et la page « Autoriser » tiennent à jour. Qui n'a jamais décoché `noter` garde `remember`, même sans avoir jamais installé la CLI (claude.ai, ChatGPT) (D30, C16, T65).
11. Dans le bloc de démarrage, la place de la consigne est réservée : la consigne (lire son fil avant de commencer), l'en-tête des leçons et la ligne « N autres leçons » passent toujours. Les leçons prennent le reste, puis le point du matin (D37).
12. Une ligne de l'état qui ne s'appuie que sur des notes de l'agent est gardée, marquée « agent ». Elle n'est jamais preuve d'une `[décision]`, et reste visible de l'auteur seul, comme le fil (D23, D36).

## Lots, et ce qu'ils changent au plan mémoire des sessions

| Lot | Ce que ça change | Tâches | Effort |
|---|---|---|---|
| 12. Les fils et le dossier | Leon range la mémoire par fil, y relie les connecteurs et GitHub ; trois commandes de lecture (et les mêmes outils au MCP) ; le bloc de démarrage devient un sommaire des fils (niveau 1). Depuis le 04/11 : l'état du fil versionné et hors recherche, un verrou par fil, l'historique (`leon versions`, l'outil `versions`). Depuis le 05/11 : les usages cochés par défaut, et leurs cases sur la page « Autoriser » (T64) | T39 à T47, T53, T54 et T64 | 12 j (le 05/11 retire la restauration de T54 et ajoute la marque « injecté » à T43 : effort à confirmer ; puis 1,5 j pour T64, après A16, estimation du rédacteur, à confirmer) |
| 13. Le rappel à chaque message, les leçons et les notes | une ligne de rappel quand un message touche un fil connu (niveau 2), pour Claude Code. Depuis le 04/11 : les leçons acceptées dans le bloc, avant le point du matin, et `leon lecons` ; le brouillon privé de l'agent (`leon noter`, `remember`). Depuis le 05/11 : l'historique sur le site, « Remettre cette version » et la connexion récente (T55) ; décocher `noter` coupe aussi `remember` (T65) | T48, T49, T55 à T57 et T65 | 5,5 j (estimation du rédacteur, à confirmer : T55 et T57 sont lourdes ; le 05/11 y déplace la restauration retirée de T54, et ajoute l'historique des fils sur le site et la connexion récente ; puis 1 j pour T65, après A16) |
| 14. La capture complète | le raisonnement de l'agent et les échanges des sous-agents remontent, et se retrouvent à la demande. Depuis le 05/11 : un sous-agent qui ne lit que le dépôt ne rend plus la session externe (T63) ; après la relecture, les appels d'outils réduits remontent aussi (`appel_outil`, T52) | T50 à T52, T63 | 5 j (dont 0,5 j pour les appels d'outils, estimation du rédacteur, à confirmer) |
| 15. Le rêve perso par règles | chaque nuit, sans modèle, Leon propose des leçons et la clôture des fils dormants, avec preuves et fréquence ; l'humain accepte ou rejette sur le site ; puis la mesure refaite | T58 à T62 | 5,5 j (5 j pour le rêve, 0,5 j pour T62) |

Changements au plan mémoire des sessions (le détail est dans ses « Amendements du 03/11 ») :
- **Le lot 10 (RAG au premier prompt) est remplacé** par le lot 13 et par la lecture à la demande du lot 12. D18 n'a plus d'objet.
- **L'accord ne monte plus une échelle de versions** : chaque usage a son propre consentement (C7 révisé, ci-dessous). La structure par usage arrive avec le lot 6 (T24 amendé : lecture et écriture de C7 révisé, champ `usages` de C2 côté serveur et côté CLI), dont le résumé dépend de l'usage `resume`. T47 n'ajoute que `lecture`.
- **Le lot 6 (le résumé) nourrit les fils.** Sa liste blanche garde les décisions vérifiées (D23). T24 ne met plus de texte du modèle dans le bloc de démarrage.
- **Le lot 3 (T13)** apporte l'état, la branche, les tickets fermés et l'auteur des PR, dont les lots 6 et 12 ont besoin. T14 place la section « L'équipe sur ce dépôt » après « mes sessions » ; T46 la déplace dans le sommaire.
- **Le lot 7 (le filtre `depot`)** sert aux lectures du lot 12.
- **Les lots d'outils (4 et 5 Codex, 8 Cursor, 9 Antigravity)** posent chacun le rappel, les commandes de lecture et la capture complète de leur outil (D32), environ 1 j de plus chacun. Les tâches T15, T17, T26, T28, T29, T31, T33 et T34 sont amendées dans le plan mère. Cursor et Antigravity reçoivent le sommaire au premier message par une requête en ligne, sans cache ni fichier sur le poste.
- **Le lot 11 (preuve et mesure)** mesure aussi les niveaux 1 et 2 (qui ouvre un fil, par quel outil) et décide du niveau 3 (D28).
- **Le 04/11, le lot 6** écrit `metadata.resume` de façon atomique, et un nouveau résumé remplace les passages du précédent : 3,5 j (T23 amendé le 04/11).
- **Le 04/11, le lot 11** mesure aussi les tokens et la durée, avec et sans la mémoire : 1,5 j (T38 amendé le 04/11).
- **Le 04/11, le bloc de démarrage** met la mémoire avant le point du matin (D37, contraintes globales amendées le 04/11).
- **Le 04/11, les lots d'outils** suivent D36 : les lectures de Leon retenues par D36 ne rendent pas une session Codex, Cursor ou Antigravity externe (D17, T18, T27 et T32 amendés dans le plan mère). Leurs lecteurs relèvent aussi `outils_en_erreur` (T58).
- **Le 04/11, C1** gagne `outils_en_erreur` (T58), sous l'accord de base.
- **Le 05/11, le lot 14** gagne T63 (4,5 j). D17, C1, T18, T27 et T32 suivent D36 tranché : les lectures, et un sous-agent qui ne lit que le dépôt, pour Claude Code au lot 14 et pour les autres outils dans leur lot. Les contraintes globales suivent D37 : les leçons sans chiffre fixe.
- **Le 05/11, après A16**, le lot 12 gagne T64 (1,5 j) et le lot 13 T65 (1 j), estimations du rédacteur, à confirmer. `lecture`, `rappel` et `noter` sont cochés par défaut, dans le terminal comme sur la page « Autoriser ». Les installateurs des lots d'outils (T17, T20, T29, T34) les proposent de même. Les contraintes globales suivent D37 : la place de la consigne est réservée.
- **Le 05/11, après la relecture**, tout le niveau 1 suit l'usage `lecture` de l'outil : le sommaire, les leçons et la consigne. Sans lui, le bloc reste celui de main (lots 1 et 3), et les contraintes globales gardent leur ordre d'origine (D24, D37). Seule la phrase de `leon noter` s'y ajoute, avec l'usage `noter` (T57). Le lot 14 relève aussi les appels d'outils réduits, avec un troisième rôle, `appel_outil` (D29, C10, T52), 0,5 j de plus.

**Ordre (tranché le 04/11, voir A8) :** 2 (fusionné), 3 (PR #129), 7, 6, 12, 13, 14, puis 4, 5, 8, 9, 11 et 15.
- Le lot 2, fusionné, a fermé une fuite : des PR de dépôts perso étaient relevées avec l'ACL de l'organisation.
- Le lot 3 apporte ce que les lots 6 et 12 lisent des PR.
- Les lots 1 et 2 du plan de la CLI sans clone (S05, S08, S10) sont fusionnés (#124) : la consigne cite le lanceur, et T47 complète `leon setup`.
- Les lots 12 à 14 servent ensuite tout de suite dans Claude Code, déjà capté.
- Le lot 15 vient en dernier. Il lit des semaines de sessions de tous les outils. Le lot 11 mesure avant lui une référence sans rêve.

Total du chantier : environ 57,5 jours (amendé le 05/11, relecture), lot 1 compris (fait), la somme du tableau du plan mère. Ce sont les 42,5 jours du tableau du 03/11 (annoncés 43, un demi-jour de trop reporté depuis), plus 2,5 j au lot 12, 2,5 j au lot 13, 0,5 j au lot 6, 0,5 j au lot 11, 5,5 j pour le lot 15 (dont 0,5 j pour refaire la mesure, T62) et, le 05/11, 0,5 j au lot 14 (T63), puis, après A16, 1,5 j au lot 12 (T64) et 1 j au lot 13 (T65), puis, après la relecture, 0,5 j au lot 14 (les appels d'outils, T52), estimations du rédacteur, à confirmer. La version avec modèle du rêve (environ 3 j) viendrait en plus, si David accepte QD1.

Si David refuse le résumé côté serveur (QD1), le lot 12 tient quand même : les sessions se rangent par clés (une session sans clé reste hors fil), les sources de connecteurs par clés et par proximité, et l'état est la liste déterministe (D23). Le lot 15 tient aussi : ses règles n'appellent aucun modèle.

## Architecture

- **Un fil est une source de Leon** (kind `leon_fil`), privée à son auteur et créée par le seul serveur. Son état est la dernière version de `versions_memoire`, si le lecteur peut la lire, sinon l'état déterministe (amendé le 04/11 : D33 et D35). Ses anciennes versions sont hors de la recherche et de `fetch` ; `fetch` d'un fil rend le texte de l'outil `fil`. La RLS le traite comme le reste.
- **Le rangement tourne en tâche de fond** (pg-boss) :
  - à la fin d'une session (le champ `fin` de C2, ou 15 min sans faits nouveaux) ;
  - une fois les vecteurs de son résumé écrits ;
  - une fois une source de connecteur, de GitHub ou une note indexée ;
  - une fois au démarrage d'une session.
- **Le rangement procède dans l'ordre :**
  1. les clés exactes (le graphe) : branche, PR, ticket cité, URL ou branche citée ;
  2. la proximité (le RAG), bornée au projet et à 30 jours ;
  3. un appel de modèle, qui écrit une nouvelle version de l'état du fil en compare-and-set (D34), à partir de ce que l'accord permet, seulement quand une session avec l'usage `resume` est nouvelle depuis le dernier état.
- **Le démarrage lit ce qui est prêt**, sans modèle ni vecteur, en moins de 3 s, et met en file une mise à jour sans l'attendre.
- **Le rappel (niveau 2)** est une recherche plein texte bornée aux fils de l'auteur, sans modèle ni vecteur. Le message n'est ni stocké ni journalisé.
- **La lecture** passe d'abord par trois routes à jeton que la CLI expose en commandes (`leon dossier`, `leon fil`, `leon chercher`). Le connecteur MCP existant (`src/server/mcp/`) gagne les mêmes lectures, en deux outils et deux filtres. Son installation dans les outils et sa connexion OAuth relèvent du plan MCP distant (#121).
- **L'accord** ne monte plus une échelle de versions : chaque usage a son propre consentement (C7 révisé). Depuis le 05/11 : `lecture`, `rappel` et `noter` sont cochés par défaut. Quand un agent installe, ils se donnent sur la page « Autoriser » du navigateur (T64). Un réglage du compte garde le refus de `noter`, que `remember` lit (C16, T65).
- **Depuis le 04/11 :** les leçons, relues et acceptées par un humain, passent dans le bloc avant le point du matin (D37), avec l'usage `lecture` de l'outil (D24, D30, amendé le 05/11). L'agent écrit des notes privées par `leon noter` (D38). Chaque nuit, un rêve par règles propose des leçons et la clôture des fils dormants, que l'humain accepte ou rejette (lot 15, D39).

## Décisions

- **D21. Le fil.**
  - Kind `leon_fil`, ajouté à `SOURCE_KINDS` mais pas à `CAPTURE_KINDS`. Le nom évite la nature `fil` (« Thread ») des connecteurs ; sa nature est `fil_de_travail`, ajoutée à `ITEM_NATURES` et aux libellés.
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
    - `mots_cles` : les titres réduits des PR de l'équipe (à partir du lot 3) et des sources liées, 2 000 caractères au plus ; ils ne servent qu'à la recherche du rappel. Amendé le 04/11 par D35 : un fil se trouve par ses clés et ses `mots_cles` (sommaire, rappel, dossier). Les mots sont rangés par source (`{ id, mots }`), PR comprises, et ne comptent que si la source reste visible du lecteur au moment de la requête (jointure sur `sources`, sous RLS). Une PR rendue privée (0048) ne laisse donc plus son titre trouvable ;
    - `absorbes` : les ids des fils fusionnés dans celui-ci, que `fil` accepte encore ;
    - `etat_session` : la dernière session prise en compte par l'état ;
    - `maj_le` ;
    - depuis le 04/11 : `clos_le`, posé quand on accepte de clore le fil (D39), et `absorbe_par`, sur un fil absorbé par une fusion.
  - Son état est un tour `document` (`leon:fil:etat`) de 2 000 caractères au plus. Amendé le 04/11 par D35 : l'état est la dernière version de `versions_memoire`, sans tour ni passage.
  - **Suppression et fusion.** `leon_app` n'a pas de DELETE sur `sources`. Une fonction `security definer` `supprimer_fil(uuid)`, sur le modèle de `supprimer_document` (0042), avec `pg_temp` en dernier (0046), supprime un fil, bornée au kind `leon_fil`, au tenant et à l'auteur courants. Elle sert :
    - à la fusion : le fil gardé reçoit d'abord les `sessions`, `prs` et `liees` de l'autre, et son id dans `absorbes` ;
    - à la suppression du compte : les fils, dérivés et privés, sont effacés. Les sessions suivent la règle actuelle (gardées, invisibles de tous).
    - Amendé le 04/11 par D33, tranché le 05/11 : la fusion ne supprime plus le fil absorbé, qui emporterait ses versions. Elle le garde et le masque (`absorbe_par`). Le rangement, le sommaire, le dossier et le rappel le sautent, `fil` mène au fil gardé, et `leon versions` et le site lisent encore son historique. Il part avec le compte, par `supprimer_fil`, qui ne sert plus qu'à la suppression du compte.
- **D22. Le rangement : le graphe d'abord, le RAG ensuite.**
  - **Les sessions.** Seules celles de l'auteur sont rangées : filtre explicite `owner_user_id`, kind dans `CODE_SESSION_KINDS`, jamais celle d'un collègue, même partagée avec lui.
    - Une session rejoint le fil de sa branche (hors `main` et `master`), sinon celui d'une de ses PR. Deux fils du même auteur qui partagent une PR fusionnent.
    - Une session sans clé rejoint le fil récent du projet le plus proche, si la similarité de son résumé, une fois indexé, dépasse le seuil. `shortcut:` le seuil est une valeur prudente dans le code ; le lot 11 (T38) le règle sur des cas réels.
    - Sans résumé ni vecteur, elle reste « hors fil » : elle n'ouvre pas de fil, et le sommaire l'ignore.
  - **Les connecteurs, GitHub et le reste de la mémoire.** Une source visible de l'auteur (connecteur, GitHub, note `remember`, document, conversation claude.ai ou ChatGPT) est reliée à un fil :
    - par clé exacte : un identifiant de ticket (`ABC-123`) lu dans la branche, le titre ou le corps d'une PR ; une PR par sa branche (à partir du lot 3) ; une URL de PR ou un nom de branche cité dans un message ;
    - sinon par proximité : même projet quand la source en a un, 30 jours au plus, au-dessus d'un seuil. Les notes, documents et conversations web ne se relient que par proximité ;
    - quand une source liée ou une session disparaît, elle quitte `liees` ou `sessions`, et l'état est réécrit (D23). Amendé le 04/11 par D33 : `fil-maj` est mis en file, et une version dont une entrée a disparu n'est plus lisible.
  - **Déclencheurs :** `fin` (C2), 15 min sans faits nouveaux (`startAfter`, comme T23), la fin de l'indexation (`indexIngestRun`, `embedMissingBatch`) d'un résumé ou d'une source, `remember`, le démarrage d'une session. Un vecteur absent remet le rattachement à plus tard. Amendé le 04/11 par D38 : `leon noter` déclenche aussi le rattachement.
  - Profondeur 2 au plus, pas de `WITH RECURSIVE` (D5).
- **D23. L'état d'un fil, par un modèle.**
  - **L'étape.** Une étape de modèle à part, `fil`, ajoutée au check de `appels_modele.step` par sa propre migration (T43). Modèle claude-haiku-5-5, effort low. L'appel ne part que si une session avec l'usage `resume` est nouvelle depuis le dernier état (`etat_session`) ; une source liée de plus ne met à jour que la partie déterministe.
  - **Ce qui entre dans le condensé**, relu juste avant l'appel :
    - les sessions dont l'accord porte l'usage `resume` (C7 révisé), avec leurs faits, leur résumé et l'état GitHub de leurs PR ;
    - les sources liées visibles de l'auteur.
  - **Ce qui n'y entre jamais :** les sessions sans l'usage `resume`, seulement listées ; le récit d'une session externe, seulement ses clés ; les coulisses du lot 14. Amendé le 04/11 : D36 dit quelles lectures de Leon ne rendent plus la session externe, et, depuis le 05/11, quels sous-agents (T63).
  - **Chaque élément porte sa provenance** : toi, l'agent, l'équipe ou un connecteur.
  - **La sortie** suit le format du résumé (« ## Où j'en suis », `[en-cours]`, `[prochaine-étape]`, `[essai-raté]`, `[question]`, `[décision]`).
    - Une `[décision]` n'est gardée que si elle cite l'id d'un tour de l'utilisateur, d'une PR ou d'un commit de l'équipe, d'un message ou d'une réunion présents dans le condensé. Le serveur vérifie l'id, et retire la décision sinon. Amendé le 04/11 par D36 : le tour de l'utilisateur est un tour `user` d'une session de code de l'auteur, jamais une note `remember` ni `leon noter`, ni un tour `user` injecté.
    - `[consigne]` est retirée. Les relations sont ajoutées par le serveur.
    - Amendé le 04/11 par D36 : chaque ligne de la sortie, quelle que soit sa balise, cite au moins un id du condensé. Le serveur retire les lignes sans id valide. Il écrit lui-même la provenance de chaque ligne d'après ses ids (toi, agent, équipe, connecteur) ; celle qu'écrit le modèle est ignorée.
    - Tranché le 05/11 (A16) : une ligne qui ne s'appuie que sur des notes de l'agent est gardée, avec la provenance « agent ». Elle n'est jamais preuve d'une `[décision]` (D36). L'état reste visible de l'auteur seul, comme le fil (`acl` du fil, C12).
  - **La réécriture.** En une transaction : le texte du tour d'état est remplacé, ses passages et leurs vecteurs sont supprimés (DELETE permis sur `passages`), puis une indexation est mise en file. La recherche ne trouve jamais l'ancien état. Amendé le 04/11 par D33 à D35 : plus de tour réécrit ni de passages supprimés ; l'état s'écrit en nouvelle version, en compare-and-set, hors de la recherche.
  - **Sans modèle, sans aucune session avec l'usage `resume`, ou en cas d'échec**, l'état est la liste déterministe des sessions, des PR et des sources liées. Un échec garde l'ancien état, sauf après la disparition d'une source : l'état redevient alors déterministe. Amendé le 04/11 par D33 : quand elle change, cette liste s'écrit en version `ecrit_par = serveur`.
- **D24. Le sommaire (niveau 1)** remplace « mes dernières sessions » dans le bloc de démarrage (`POST /api/v1/contexte`, C3 inchangé).
  - Amendé le 05/11 (relecture) : seulement dans un outil qui a accepté l'usage `lecture` (D30). Tout le niveau 1 en dépend : le sommaire, les leçons (D37) et la consigne. Sans l'usage, le bloc reste celui de main, sous l'accord de base : « mes sessions » (lot 1), « L'équipe sur ce dépôt » (lot 3), puis le point du matin. Ni fils, ni leçons, ni consigne de lecture. La phrase de `leon noter` (T57) suit l'usage `noter`, pas `lecture` : elle ne montre aucune mémoire, elle ne recopie que `commande`, l'outil et la session du poste (C3). Sans `lecture` mais avec `noter`, le bloc de main garde cette seule phrase, avant le point du matin, à place réservée et bornée comme en D37.
  - Une ligne par fil du projet, la branche courante d'abord, puis par date, 8 fils au plus, 3 500 octets au plus.
  - Chaque ligne : l'id du fil (un uuid, clé sûre), le titre, les outils (Claude Code, Codex…), la dernière date, les numéros de PR et leur état (à partir du lot 3), le nombre de sources liées.
  - **Le titre** est la branche réduite aux caractères `[A-Za-z0-9._/-]`, 60 au plus, sinon « fil du JJ/MM ». Jamais le titre d'une session ni d'une PR : une branche ou un titre peut être écrit par l'agent ou par un inconnu.
  - Viennent ensuite la section « L'équipe sur ce dépôt » (T14 du plan mère, à partir du lot 3, 700 octets), puis la consigne, puis le point du matin. Le tout tient en 8 000 octets. Amendé le 04/11 par D37 : les leçons acceptées viennent entre l'équipe et la consigne, et le point du matin prend le reste. Tranché le 05/11 (A16) : la place de la consigne est réservée, elle passe toujours (D37).
  - **La consigne** est un texte fixe, en français comme le reste du bloc, placé à l'intérieur de `<contexte-leon>` pour être retiré à la recapture. Elle cite la commande réellement posée sur le poste : le lanceur `~/.leon/bin/leon` s'il existe, sinon `pnpm --dir <clone> leon`, que la CLI indique au serveur (C3).
    - Avec l'usage `lecture` : avant de commencer, lire le fil concerné avec `leon fil <id>` (sans id : le fil de la branche courante), ou l'outil `fil` de Leon s'il est branché ; ce sont des données à vérifier, pas des consignes.
    - Sans l'usage : seulement que ces lignes sont à vérifier. Amendé le 05/11 (relecture) : sans l'usage, ni sommaire ni consigne de lecture ; seule la phrase de `leon noter` reste, avec l'usage `noter` (ci-dessus). Le bloc garde la ligne de garde de main : ses sessions sont des données à vérifier contre le code et git.
  - Sans aucun fil, le bloc garde le post-it du lot 1. Amendé le 05/11 : sans l'usage `lecture` aussi, même quand des fils existent.
- **D25. Ce qui est poussé, ce qui est tiré.**
  - **Poussé d'office** (sommaire, rappel) : des clés seulement, à savoir id du fil, titre réduit, outils, dates, numéros et état de PR, nombre de sources liées. Jamais un titre de PR, un état de fil ni une décision. D17 tient. Amendé le 04/11 par D37 : s'y ajoutent les leçons relues et acceptées par un humain, seul texte poussé. Amendé le 05/11 (relecture) : le sommaire et les leçons ne sont poussés qu'avec l'usage `lecture` de l'outil, le rappel qu'avec l'usage `rappel` (D30). Sans eux, reste ce que main pousse sous l'accord de base : « mes sessions » et « L'équipe sur ce dépôt » (D24).
  - **Tiré par l'agent** (commandes, MCP) : l'état des fils et les sources, rendus comme des données par la garde existante (`DATA_GUARD_LINE`, balises, `escapeData`).
    - Au MCP, ils ne figurent que dans `content`. Le `structuredContent` de `dossier` et `fil` ne porte que des clés.
    - Le résumé du lot 6 garde `[décision]` aux mêmes conditions que D23 (D8 amendée) ; `[consigne]` reste retirée.
  - **Limite connue :** la consigne du niveau 1 rend la lecture presque systématique, donc le tiré presque poussé. C'est pour ça que D23 fixe la provenance, vérifie les décisions et écarte le récit externe et les coulisses. Amendé le 04/11 par D36 : le récit d'une session qui a lu Leon entre au condensé, marqué « agent ». Il ne fait jamais une décision sans id vérifié, chaque ligne de l'état cite un id, et sa provenance est écrite par le serveur.
- **D26. Le rappel (niveau 2).**
  - **L'envoi.** Route `POST /api/v1/rappel` (C8). La CLI n'envoie rien sans l'usage `rappel`. Elle n'envoie que les 2 000 premiers caractères du message, masqués, et abandonne à 1,5 s (un seul `AbortSignal`).
  - **La recherche.** Le serveur masque de nouveau, puis cherche en `websearch_to_tsquery` (configurations française et simple) et en trigrammes. Il ne parcourt que les fils de l'auteur et du projet (`owner_user_id = ctx.userId and kind = 'leon_fil' and metadata.project = projet`), jamais `searchPassages`. Il cherche dans leurs branches, leurs fichiers et leurs `mots_cles` (D21). Amendé le 04/11 : seuls les mots d'une source encore visible comptent (D21). Ces mots servent à trouver, jamais à répondre. Moins de 300 ms visés.
  - **La réponse.** Au plus une ligne, de clés seulement (D25, dont l'id du fil), balisée `<rappel-leon>…</rappel-leon>`, qui cite un ou deux fils pas encore rappelés dans la session. Sinon, un texte vide.
  - **Les fils déjà cités** sont rangés sous RLS dans une table `rappels_cites` (tenant, auteur, session, fil, date), purgée après 24 h par une fonction `security definer` (`pg_temp` en dernier) que lance pg-boss. Le message n'y est jamais.
  - **Ni stocké ni journalisé.** Le message n'est ni stocké ni journalisé. La 400 ne recopie aucune valeur. Les compteurs ne portent ni session ni fil. Les réglages des journaux de la base (requêtes lentes) sont vérifiés.
- **D27. Les lectures : la commande d'abord, le MCP en plus.**
  - **Trois routes à jeton, en `.strict()`**, avec le même rendu et la même garde que le MCP (C11) :
    - `POST /api/v1/dossier` : les fils du projet, de la branche d'abord ;
    - `POST /api/v1/fil` : un fil du projet demandé (un id absorbé mène au fil gardé ; sans id, le fil de la branche), avec son état, ses sessions (50 au plus), ses PR et tickets (20 au plus) et leur état GitHub (à partir du lot 3), ses sources liées et les ids à ouvrir. La coupe est signalée ;
    - `POST /api/v1/chercher` : la recherche existante, bornée au dépôt du projet par le filtre `depot` (lot 7).
  - **Les commandes de la CLI.** `leon dossier`, `leon fil <id>` et `leon chercher "<requête>"` appellent ces routes, écrivent sur la sortie standard et rien sur le disque. Elles marchent dans les quatre outils, sans connecteur.
  - **Le MCP** gagne les mêmes lectures : les outils `dossier` et `fil`, et, pour `search`, le filtre `fil` (`depot` vient de T25), avec la mention du fil et des PR d'une session trouvée. `MCP_INSTRUCTIONS` gagne une phrase, sans retirer la recherche générale qui sert claude.ai et ChatGPT : « when working on a code repository, call dossier, then fil; search with depot ». Au MCP, brancher le connecteur vaut accord pour lire, comme aujourd'hui pour `search` ; les commandes de la CLI, elles, exigent l'usage `lecture`. Tranché le 05/11 (A16) : pour écrire, `remember` lit en plus le réglage `noter` du compte (D30, C16, T65). Le branchement du connecteur dans les outils et sa connexion relèvent du plan MCP distant (#121) ; ce plan n'écrit aucun jeton.
  - **La consigne du bloc et les commandes de la CLI** ne citent que `dossier`, `fil` et la recherche bornée au dépôt, jamais une recherche dans toute la mémoire (vigilance 6).
  - **Le signal « externe »** (D17) : lire Leon par `leon fil`, `leon chercher` ou leurs outils MCP rend la session externe, puisque ces lectures rendent des sources de connecteurs ; `leon dossier` et l'outil `dossier`, qui ne rendent que des clés, non (T44). Amendé le 04/11 par D36 : `leon dossier`, `leon fil` et `leon chercher`, et les outils `dossier` et `fil` du MCP de Leon, ne rendent plus la session externe. Tranché le 05/11 (A14) : `leon lecons`, `leon versions` et `leon noter`, et les outils `lecons`, `versions` et `remember`, non plus. `search` et `fetch` de Leon au MCP la rendent toujours externe.
  - **Chaque lecture d'un fil ou du dossier est notée** par `recordReads`, avec l'outil et la session quand ils sont connus, pour la mesure du lot 11. Il faut pour cela étendre le check de `read_log.tool` et ajouter une colonne `session` (T44).
  - Aucune écriture de plus. Amendé le 04/11 par D38 : hormis `leon noter`, le brouillon privé de l'agent, sous l'usage `noter` (D30). Tranché le 05/11 : la restauration d'une version ne passe plus par le poste, seulement par le site (D33).
- **D28. Le niveau 3 (passage obligé) n'est pas construit ici.** Le lot 11 mesure d'abord si les niveaux 1 et 2 suffisent. S'il le faut, un lot à part le conçoit, en option éteinte par défaut, avec son propre accord.
- **D29. La capture complète.**
  - En plus des messages et des faits, la CLI envoie :
    - le raisonnement de l'agent, quand le transcript en porte le texte ;
    - pour chaque sous-agent, sa consigne et son rapport final ;
    - les appels d'outils réduits, comme les commandes de C1 : outil, cible relative au dépôt, statut. Jamais les sorties brutes.
      - Amendé le 05/11 (relecture) : ils ont leur rôle, `appel_outil`, à côté de `raisonnement` et `sous_agent` (C10). Chaque appel porte le nom réduit de l'outil, sa cible réduite comme `session-facts.ts` réduit déjà les commandes (`reduceCommand`, `repoRelativePath`), et son statut. Jamais sa sortie, ni ses autres arguments, ni un secret : tout passe par `maskSecrets` sur le poste, puis de nouveau sur le serveur. Ceux des sous-agents suivent la même forme, quand T50 trouve leurs échanges (T52).
      - Les lots d'outils (Codex, Cursor, Antigravity) relèvent les appels de leur outil dans la même forme, selon la forme relevée à leur essai (T15, T26, T31). Un appel de forme inconnue ne part pas : rien plutôt qu'un argument brut.
  - Ils passent par leur propre route (`POST /api/v1/coulisses`), pas par le contrat d'ingestion (règle du plan mémoire des sessions).
  - Ils sont rangés comme tours de la session, sous son ACL, avec deux nouveaux rôles, `raisonnement` et `sous_agent` (migration du check de `turns.role`), que la recherche peut filtrer. Amendé le 05/11 (relecture) : trois rôles, avec `appel_outil`, dans la même migration.
  - Masquage : `maskSecrets` sur le poste puis sur le serveur. Chaque bloc est coupé à 20 000 caractères, comme les messages.
  - Accord : l'usage `coulisses` (C7 révisé).
  - Ce lot et le niveau 3 (D28) se détaillent quand on y arrive, avec David, à partir des constats de la relecture du 03/11 (A10, A11).
- **D30. L'accord, par usage.** Les versions cumulatives liaient des permissions sans rapport : pour avoir le rappel, il aurait fallu accepter le résumé par le fournisseur du modèle. On les remplace par des usages (C7 révisé).
  - La version 2 (les gestes) reste la base, et la version 0 le retrait.
  - Chaque usage s'ajoute avec son propre texte, confirmé à part, et sa date : `lecture`, `rappel`, `resume`, `coulisses`. `--oui` et `--yes` n'ajoutent jamais un usage. Tranché le 05/11 (A16) : `lecture`, `rappel` et `noter` sont cochés par défaut, `resume` et `coulisses` non (ci-dessous).
  - Le serveur vérifie l'usage à chaque emploi : `lecture` pour les routes de lecture et la consigne, `resume` pour le résumé et l'état des fils, `rappel` pour le rappel, `coulisses` pour le lot 14. La CLI envoie ses usages (C2, C3, C8, C11). `lecture` vaut pour les commandes du poste dès qu'un outil l'a accepté ; la consigne n'apparaît que dans un outil qui l'a accepté.
    - Amendé le 05/11 (relecture) : dans le bloc de démarrage, `lecture` porte tout le niveau 1, pas seulement la consigne. Le sommaire des fils, les leçons et la consigne n'apparaissent que dans un outil qui l'a accepté, d'après les `usages` que la CLI envoie pour l'outil dont le crochet demande le bloc (C3). Sans lui, la route ne lit ni les fils ni les leçons, et rend le bloc de main (D24). La phrase de `leon noter` suit `noter`, pas `lecture` (D24). La mise à jour des fils au démarrage reste en file : elle n'envoie rien au modèle de l'outil.
  - Amendé le 04/11 par D38, tranché le 05/11 : un cinquième usage, `noter`, à part, avec son propre texte. Il est proposé à l'installation et déjà coché par défaut, comme les niveaux 1 et 2 ; l'utilisateur peut le décocher. La restauration ne passe plus par le jeton (D33) : il ne sert plus qu'à `POST /api/v1/noter` (et à `remember`, qui prend le même chemin), et à la phrase de la consigne qui cite `leon noter`. Un accord `lecture` ne permet jamais d'écrire, et son texte ne change pas. Amendé le 05/11 (relecture) : « ne change pas » vaut pour l'ajout de `noter`. Le texte de `lecture` dit déjà ce qu'il pousse au démarrage, le sommaire et les leçons (T47), et un accord `lecture` ne permet toujours jamais d'écrire. La phrase qui cite `leon noter` passe aussi sans `lecture` (D24).
    - Coché par défaut se lit ainsi, pour `lecture`, `rappel` et `noter` (tranché le 05/11, A16) :
      - dans un terminal interactif, la question est `[Y/n]` : Entrée l'accepte. Interactif veut dire `process.stdin.isTTY` ; le script d'installation lance `setup` avec `< /dev/tty`, il le reste. Une entrée fermée (Ctrl+D) n'est pas une réponse et n'accepte rien : `ask` rend alors `null` ;
      - hors terminal (`echo | leon setup`, `yes '' | leon setup`), aucune réponse lue ne donne un usage, même « y » ;
      - sur la page « Autoriser » du navigateur, que `leon login` ouvre, les cases demandées s'affichent, cochées, et c'est l'humain qui clique sur « Autoriser » (T64). C'est le chemin « Je demande à Claude » : l'agent lance `setup --yes`, et la page s'ouvre dans le navigateur de l'utilisateur ;
      - la CLI n'ajoute jamais un usage d'elle-même : sans terminal, ou avec `--oui` et `--yes`, seules les cases de la page en donnent. L'agent ne coche jamais rien à la place de l'utilisateur.
    - **Les cases de la page reviennent à la CLI** par le code signé (T64, C16).
      - `leon setup` demande les cases par un paramètre de l'adresse de la page, `usages` (K3), validé comme les trois autres et gardé à la connexion. Il n'y met que les usages cochés par défaut qui manquent et n'ont jamais été refusés, pour les outils de ce passage. Sans ce paramètre, la page ne montre aucune case : `leon login` lancé seul, et une CLI d'avant T64, n'en voient pas.
      - Chaque case montrée est cochée, sauf `noter` quand le réglage du compte est daté (ci-dessous).
      - L'action met les cases montrées (`m`) et cochées (`g`) dans la charge signée du code. Elles ne sont jamais en paramètre à part de l'adresse de retour ; dans la charge du code, qui y passe, elles sont lisibles mais non modifiables.
      - `POST /api/v1/ordinateurs` rend dans sa 201 les usages cochés (`usages`) et les refusés (`refus`). `leon login` les rend à `leon setup`, qui les passe à `installHooks` : il écrit les deux dans `accord.json`, datés, pour chaque outil du passage auquel ils manquaient. Un usage tranché sur la page, coché ou non, n'est pas redemandé dans le même passage.
      - Lancé seul, `leon login` ne demande aucune case et n'écrit rien dans `accord.json` : seul `installHooks` y écrit, comme le dit l'en-tête de `setup.ts`.
    - **Décocher `noter` bloque aussi `remember`** (tranché le 05/11, A16, T65). Au MCP, il n'y a pas d'usages du poste. Le serveur garde donc le refus dans un réglage du compte : une colonne datée de `member`, `noterRefuseLe`, nulle par défaut, comme l'interrupteur du rêve (C15, C16).
      - `remember` lit cette colonne, sur la ligne `member` du porteur du jeton (tenant et utilisateur de `ctx`), avant d'écrire. Nulle : il écrit. Datée : il refuse, sans rien écrire, et son message dit où rouvrir les notes (la section Mémoire du site).
      - La page « Autoriser » et l'installateur la tiennent à jour. La page passe par `POST /api/v1/ordinateurs`, une fois le jeton enregistré : `noter` montré et décoché la date, montré et coché la remet à nul, non montré ne la touche pas. Un échange qui échoue ne change donc rien. L'installateur ne fait que la dater, sur un « non » dans le terminal.
      - Rouvrir `remember` passe toujours par le navigateur. Le jeton d'un ordinateur est lisible de tout agent du poste : la route à jeton n'accepte qu'un refus (C16). Un « oui » à `noter` dans le terminal ne rouvre donc pas `remember` : l'installateur le dit, en une ligne fixe, et renvoie à la section Mémoire du site. Celle-ci montre le réglage et le change, sous la session du navigateur, comme l'interrupteur du rêve (choix du rédacteur : sinon un refus de `noter` ne se défait plus).
      - Qui n'a jamais installé la CLI (claude.ai, ChatGPT) n'a jamais décoché `noter` : la colonne reste nulle, et il garde `remember`. Les comptes déjà là aussi.
      - `leon noter` suit, lui, l'usage `noter` de l'outil (C14). Le texte de `noter` dit que le décocher coupe aussi `remember` dans tous les assistants branchés à cet espace : la colonne est par membre, donc par espace.
  - La structure par usage arrive avec le lot 6 (T24 amendé) ; T47 n'ajoute que `lecture`. Les commentaires de `consent.ts` et d'`api-contract.ts` suivent.
  - Un utilisateur déjà installé se voit proposer, un à un, les usages manquants et jamais refusés à la prochaine installation : plus de « nothing to do ». Avec `--yes`, quand un outil à installer a un tel usage, `leon setup` relance `leon login`, même sur un ordinateur connecté, avec ces usages dans `usages`, pour que la page montre les cases (T64, choix du rédacteur). Le jeton de l'ordinateur est alors remplacé, et l'ancien révoqué (K6).
    - Pas de relance quand la connexion vient de `--with-token`, ce que `connexion.json` note alors (`par`, choix du rédacteur) : un poste sans navigateur attendrait 5 minutes une page que personne n'ouvre. `leon setup` dit seulement, sur la sortie, de lancer `leon setup` dans un terminal pour choisir les usages.
  - Un refus laisse les réglages de l'outil inchangés. Depuis le 05/11, il s'écrit daté dans `accord.json` (`refus`, C7), qu'il vienne du terminal ou de la page : l'usage n'est plus proposé, ni dans le terminal ni sur la page. Pour revenir sur un refus : `leon retirer-crochets`, qui efface usages et refus, puis `leon setup` (choix du rédacteur). Un refus de `noter` date aussi le réglage du compte (T65).
- **D31. Aucune mémoire sur le poste.** Ni texte capté, ni bloc, ni état de fil n'est écrit sur le disque de l'utilisateur : pas de fichier de règles, de Markdown ni de cache. Restent les crochets, le lanceur, l'accord, la connexion et des marqueurs techniques (curseurs de T19, témoins de conversation de T28 et T33). Le plan mère est amendé en conséquence (D16, T28, T30, T33, T35, A4).
- **D32. Les quatre outils.** Chaque lot d'outil apporte, pour son outil :
  - le sommaire, avec l'usage `lecture` de l'outil (D24, D30, amendé le 05/11), sinon le bloc de main. Pour Cursor et Antigravity, il arrive au premier message, par une requête en ligne, en une seule sortie avec le rappel (les deux requêtes en parallèle, sous un même délai de 3 s), si bien qu'un outil jamais utilisé reçoit la mémoire faite ailleurs ;
  - le rappel ;
  - les commandes de lecture, citées dans la consigne ;
  - la capture complète de son format, selon son essai.

  Le rangement se déclenche aussi après 15 min sans faits nouveaux, pour les outils sans fin de session. Si l'essai d'un outil (T15, T26, T31) refuse l'injection au message, le lot s'arrête à son annexe et Amos décide.

Décisions du 04/11 (D33 à D39), qui amendent D21 à D27 et D30 comme dit en regard de chacune :

- **D33. Les versions et leur provenance.**
  - Trois mémoires gardent leurs versions : l'état d'un fil, une leçon (D37) et une note de l'agent (D38). Chacune s'écrit v1, v2, v3. Aucune version n'est réécrite ; le tour d'une note suit sa dernière version (D38).
  - Elles vivent dans une table à part, `versions_memoire` (C12), en ajout seul, sur le modèle de `about_suggestions` (0045). Chaque version porte :
    - son texte et son numéro `n` ;
    - ses entrées : les ids des sources qui l'ont produite (sessions, PR, messages, réunions, notes), y compris les sources lues pendant ces sessions (D35). Un tour a l'accès de sa source : les ids des tours sont gardés à part, pour la provenance seulement ;
    - qui l'a écrite (`ecrit_par`), avec l'étape et le modèle pour un modèle, l'outil et la session pour l'agent :
      - `serveur` : la liste déterministe d'un fil (ci-dessous) ;
      - `modele` : l'état d'un fil écrit par l'étape `fil` ;
      - `agent` : une note ;
      - `humain` : une action du site, sous la session du navigateur, restauration comprise ;
    - son motif (rangement, note, correction, acceptation, restauration) et sa date.
  - Tout texte écrit dans `versions_memoire` passe par `maskSecrets`, leçons comprises.
  - **L'état sans modèle.** Le serveur écrit une version `ecrit_par = serveur`, en compare-and-set, quand la liste déterministe d'un fil change (une session, une PR ou une source liée en plus ou en moins) et que sa dernière version n'est pas une version lisible du modèle. Son texte est cette liste, en clés ; ses entrées, les ids listés. L'état GitHub des PR reste lu à la lecture (vigilance 3). Un fil sans modèle (QD1 refusé) ou sans session `resume` garde ainsi son historique.
  - **La lecture.** L'agent lit la dernière, et peut demander une ancienne (`leon versions`, l'outil `versions`, C12). Tranché le 05/11 : les versions sont archivées et toujours accessibles, sous la règle ci-dessous. L'auteur les lit aussi sur le site (T55).
    - Une version n'est rendue que si le lecteur voit toutes ses sources sous RLS. C'est la règle de `readAboutSuggestion` (`src/server/briefing/about-suggestion.ts`).
    - Pour un état écrit par le modèle, d'après les résumés, les sessions parmi ses entrées doivent aussi garder l'usage `resume`. Une leçon, une note ou une liste du serveur n'a pas cette condition : son texte n'est pas tiré d'un résumé.
    - Sinon, rien de cette version, ni d'une plus ancienne à sa place : l'agent lit la dernière ou rien. Un fil rend alors son état déterministe, calculé à la lecture sur ses seules sources visibles, jusqu'à sa prochaine version (une session `resume` nouvelle, ou un changement de la liste). Une leçon ne se montre pas.
  - **Rangées à part.** Une version n'a ni tour, ni passage, ni vecteur : ni la recherche ni `fetch` ne la voient. Seule la lecture commune (`src/server/memory/versions.ts`) la lit.
  - **Restaurer** crée une nouvelle version, avec le texte et les entrées de la version choisie, si elle est encore lisible. Rien n'est effacé.
    - Tranché le 05/11 : sur le site seulement. Un bouton « Remettre cette version » dans l'historique, réservé à l'auteur, pour un fil, une leçon ou une note (T55, T57). La version écrite porte `ecrit_par = humain`. Le site exige une connexion récente (D37).
    - Ni le terminal, ni un jeton, ni le MCP ne restaurent : `leon versions --restaurer` et la route à jeton sont retirés. La restauration n'accepte qu'une session du site (C12).
    - Restaurer une note passe par `writeNote` (D38) : son tour indexé prend le texte restauré, dans la même transaction.
    - Une version restaurée garde l'origine de son texte : `restaure_de` pointe vers la version d'origine. Pour la condition `resume` de la lecture et pour l'état sans modèle, la restauration d'une version du modèle compte comme une version du modèle, quel que soit `ecrit_par`. Sinon, retirer `resume` laisserait lisible un texte tiré des résumés, et la liste du serveur écraserait l'état remis au premier changement (T53).
  - **Effacées avec le compte**, comme les fils. Une fusion ne les efface pas : le fil absorbé reste, masqué, avec ses versions (D21).
  - **Hors la suppression du compte, aucune version n'est effacée** (tranché le 05/11). Le geste « effacer » n'est pas retenu. Limite connue : un secret ou une donnée personnelle passé dans une version y reste, lisible et restaurable, masqué seulement par `maskSecrets` à l'écriture.
  - Toutes les versions sont gardées, sans limite. Le lot 11 mesure le volume ; couper demanderait une nouvelle décision d'Amos.
- **D34. La concurrence.** Deux mises à jour du même fil en même temps ne s'écrasent plus.
  - Le rangement (T40 à T42) prend `for update` sur la ligne du fil avant de relire puis réécrire son `metadata`. Une fusion prend les deux lignes dans l'ordre des ids, comme `lockSources`.
  - La mise à jour de l'état passe par une file pg-boss `fil-maj`, en politique stately, avec la clé singleton du fil (organisation et fil), pas de la session.
  - Toute écriture d'une version est un compare-and-set : on écrit v(n+1) seulement si la dernière est encore vn.
    - Une tâche lit vn avant de bâtir son condensé. Si une autre écriture est passée, elle n'écrit rien, et la tâche déjà en file refait avec des données fraîches.
    - Une route (C14) ou une action du site répond « modifiée entre-temps » (409).
  - C'est la protection du talk contre deux écritures simultanées, avec un numéro au lieu d'une empreinte.
- **D35. L'état hors de la recherche** (amende D21).
  - L'état n'est plus un tour indexé `leon:fil:etat`. C'est la dernière version du fil, si le lecteur peut la lire, sinon l'état déterministe, jamais une version plus ancienne (D33). Il est lu par `leon fil`, `leon dossier` et leurs outils MCP.
  - Un fil n'a plus de tour : `search` ne le trouve pas, et `fetch` d'un id de fil rend le texte de l'outil `fil`.
  - Un fil se trouve par ses clés et ses `mots_cles` : le sommaire, le rappel, le dossier. Seuls comptent les mots d'une source encore visible du lecteur (D21).
  - **La fuite fermée.** L'état d'un fil tiré d'une source devenue privée (0048, lot 2) restait lisible. L'état garde la liste de ses entrées, et n'est rendu que si le lecteur les voit toutes et qu'elles gardent l'usage `resume`.
    - Depuis D36, le récit d'une session qui a lu Leon entre au condensé, avec ce qu'elle a lu. Les entrées comprennent donc aussi les sources lues pendant les sessions du condensé : les `source_id` du `read_log` dont la colonne `session` (T44) est l'une de ces sessions, pour les lectures `chercher`, `fil` et `fetch`.
    - Une source lue puis rendue privée par `aligner_sources_github()` (0048) cache ainsi l'état qui la reprend.
  - Ce qu'on perd : la recherche ne trouve plus un fil par le texte de son état. Elle trouve les résumés et les sources qui le nourrissent, et T45 y mentionne le fil.
- **D36. Lire Leon ne rend plus la session externe** (amende D23 et D27). Amos l'a décidé contre la recommandation de Claude.
  - Ne marquent plus la session, selon la décision d'Amos : `leon dossier`, `leon fil`, `leon chercher`, et les outils `dossier` et `fil` du serveur MCP de Leon.
  - Tranché le 05/11 (A14) : `leon lecons`, `leon versions` et `leon noter`, et les outils `lecons`, `versions` et `remember` du serveur MCP de Leon, ne la marquent pas non plus. `leon noter` et `remember` ne rendent qu'un id et un numéro, aucun texte : l'écart entre les deux disparaît.
  - Les autres signaux ne changent pas : les autres `mcp__*` (dont `search` et `fetch` de Leon), `WebFetch`, les commandes réseau, `gh` en lecture. `Agent` et `Task` aussi, jusqu'au lot 14.
  - **Les sous-agents** (tranché le 05/11, A14).
    - D'abord le tri (T43) : la capture distingue les vrais messages de l'utilisateur des rapports de sous-agents, qui arrivent comme des messages `user`. Un rapport de sous-agent n'est jamais un message de l'utilisateur, ni preuve d'une `[décision]`.
    - Ensuite, dès le lot 14 (T63) : un sous-agent qui ne lit que le dépôt (lecture de fichiers, recherche dans le dépôt, commandes locales) ne rend plus la session externe. Un sous-agent qui va sur le web ou appelle un outil réseau la rend toujours externe. Un sous-agent dont on ne lit pas les échanges, ou qui n'a pas rendu son rapport final, aussi. Seules les sessions captées après le lot 14 en profitent.
  - Un outil de Leon se reconnaît à son nom complet exact (`mcp__<serveur>__fil`), jamais à un suffixe. Il ne compte que si la configuration de ce serveur pointe vers l'URL de Leon posée par l'installation (#121). Sinon, la session reste externe (T44).
  - **Le garde-fou reste.** Une `[décision]` n'entre dans l'état que si elle cite l'id d'un message de l'utilisateur, ou d'une PR, d'un commit, d'un message de connecteur ou d'une réunion, vérifié par le serveur.
    - Un message de l'utilisateur est un tour `user` d'une session de code de l'auteur (`CODE_SESSION_KINDS`).
    - Une note n'en est jamais un, même rangée en role `user` (`src/server/mcp/tools/remember-tool.ts:35`).
    - Un tour `user` injecté dans le transcript n'en est jamais un non plus : le rapport d'un sous-agent en tâche de fond, une notification de tâche, le message d'un autre agent, la sortie d'un crochet, le texte d'un script d'orchestration. La capture le marque, et le vérificateur l'écarte (T43).
  - Dans le condensé, les tours de l'agent restent marqués « agent », et une note « agent (note, <outil>) ». Tranché le 05/11 (A16) : une ligne de l'état qui ne s'appuie que sur des notes est gardée, marquée « agent » (D23).
  - Limite connue : un texte de tiers lu par `leon fil` ou `leon chercher` peut revenir dans le récit de l'agent, donc dans l'état suivant, y compris dans les lignes `[en-cours]`, `[prochaine-étape]`, `[question]` et `[essai-raté]`. Il y entre marqué « agent » par le serveur, et ne fait jamais une décision sans id vérifié. Une ligne qui ne cite aucun id du condensé est retirée (D23). Les sources lues comptent parmi les entrées de l'état (D35).
- **D37. Les leçons, et l'ordre du bloc** (amende D24 et D25).
  - **Une leçon** est un texte court (300 caractères), relu et accepté par un humain : écrit à la main sur le site, ou proposé par le rêve (lot 15) puis accepté.
    - Elle est privée à son auteur, avec un dépôt facultatif (table `lecons`, C13). Son texte est sa dernière version (D33).
    - Toutes les leçons sont gardées et consultables : `leon lecons`, et l'outil MCP `lecons`.
    - Écrire, corriger, retirer et restaurer se fait sur le site seulement, par la session du navigateur. Jamais par jeton ni par MCP.
    - Le texte d'une leçon passe par `maskSecrets` à l'écriture : il part ensuite vers le fournisseur de chaque outil de code.
    - Limite connue : la session du navigateur ne prouve pas un humain. Un agent qui pilote le navigateur connecté (une extension, Playwright) peut écrire ou accepter une leçon.
    - **La connexion récente** (tranché le 05/11). Pour accepter, écrire ou remettre une leçon, et pour remettre une version, le site exige une connexion de moins d'une heure. Sinon il redemande la connexion (mot de passe, ou Google, GitHub, Microsoft). Ça réduit la fenêtre sans prouver un humain : un agent qui pilote le navigateur dans l'heure qui suit une connexion passe encore (T55, T61).
      - La reconnexion se fait par mot de passe, avec la 2FA si elle est active, tant que la connexion sociale n'est pas sur main (`src/server/auth/auth.ts` n'a pas de `socialProviders`). Une fois fusionnée, Google, GitHub et Microsoft demandent une reconnexion forcée chez le fournisseur, quand il sait la forcer (`prompt=login` ou `max_age=0` d'OpenID Connect, à vérifier pour chacun). Sinon, un navigateur déjà connecté chez lui repasse en un clic, sans rien taper : c'est le cas de GitHub, limite connue (vigilance 2).
      - Retirer une leçon, rejeter une proposition, et accepter une proposition qui retire une leçon ou clôt un fil ne l'exigent pas. C'est la lecture des mots d'Amos : accepter, écrire et remettre une leçon, et remettre une version. Aucun de ces gestes n'écrit un texte poussé.
  - **Le bloc de démarrage** tient toujours en 8 000 octets, sous les plafonds de Claude Code (10 000 caractères) et de Codex (environ 10 000 octets). Dans l'ordre :
    1. le sommaire des fils (3 500 octets), avec « L'équipe sur ce dépôt » (700 octets) ;
    2. les leçons acceptées, sans chiffre fixe (tranché le 05/11) : elles prennent toute la place que le sommaire laisse dans les 8 000 octets. Celles du dépôt d'abord, puis les plus fréquentes, puis les plus récentes, coupées à la leçon entière. Quand toutes ne tiennent pas, suit « N autres leçons : <commande> lecons », avec la commande réellement posée sur le poste (C3 `commande`, comme la consigne). Tranché le 05/11 (A16) : la place de la consigne (lire son fil avant de commencer), de l'en-tête des leçons, de la ligne « N autres leçons » et de la balise fermante est réservée avant de remplir. Ils passent toujours ; les leçons prennent le reste. Leur taille est bornée : ils ne recopient du poste que `commande` (200 octets au plus, C3) et la session (200 caractères). Des leçons nombreuses ne poussent donc jamais la consigne hors du bloc, et la ligne « N autres », connue après la coupe, ne passe jamais les 8 000 octets ;
    3. la consigne ;
    4. le point du matin, qui ne prend que ce qui reste après elles. Quand les leçons sont nombreuses, il peut ne plus avoir de place : c'est voulu par Amos (QD15).
  - **Sans l'usage `lecture`** (amendé le 05/11, relecture) : cet ordre ne vaut que dans un outil qui a accepté `lecture` (D30). Les leçons poussées sont du niveau 1, comme le sommaire. Sans l'usage : ni sommaire, ni leçons, ni consigne de lecture. Le bloc reste celui de main : « mes sessions » (3 500 octets), « L'équipe sur ce dépôt » (700 octets), puis le point du matin, qui garde le reste (D24). Seule exception : avec l'usage `noter`, la phrase de `leon noter` (T57) passe avant le point du matin, à place réservée. Elle est bornée comme ci-dessus : `commande` (200 octets) et la session (200 caractères).
  - Les leçons candidates sont celles du dépôt et celles sans dépôt, non retirées, dont la dernière version est lisible ; jamais une version plus ancienne à sa place. Une leçon d'un autre dépôt n'est jamais poussée.
  - Elles sont rendues comme des données : une ligne chacune, échappée (`escapeData`), dans `<contexte-leon>`, avec « acceptée par toi le JJ/MM ».
  - **C'est l'exception à D25** : seul un texte relu et accepté par un humain entre dans ce qui est poussé. Le reste reste en clés.
  - Ni modèle ni vecteur : une lecture courte, dans les 3 s.
- **D38. `leon noter`, le brouillon de l'agent** (amende D22, D27 et D30).
  - L'agent de code écrit une note privée par `leon noter "<texte>"` (C14), sous l'usage `noter` (D30). L'outil MCP `remember` prend le même chemin, et reçoit enfin le client (`src/server/mcp/server.ts`).
  - La note reste une source `mcp_remember`, sans kind de plus, libellée « Note ». Elle est visible de son auteur seul, et marquée de l'outil et de la session (`metadata.outil`, `metadata.session`), et du projet pour `leon noter`.
    - `metadata.outil` est un kind de `CODE_SESSION_KINDS` pour `leon noter`, ou `mcp:<libellé>` pour `remember` (le libellé du client, au motif de `read_log.client`).
    - L'outil et la session sont déclarés par le client. La session n'est qu'une indication, que le rêve vérifie (D39).
  - Elle est versionnée (D33). Sa dernière version est aussi son tour indexé : la recherche la trouve, et D22 la relie à un fil par proximité, comme `remember`. Les anciennes sont hors recherche et hors `fetch`.
    - Une nouvelle version n'est acceptée que si la dernière vient du même outil (le même kind, ou le même `mcp:<libellé>`), sinon 409. Un assistant web ne réécrit donc jamais la note d'un outil de code. Après une restauration sur le site (`ecrit_par = humain`), c'est l'outil de la note (`metadata.outil`) qui compte.
    - Une restauration passe par le même chemin (`writeNote`), depuis le site seulement (D33).
    - Une note `remember` écrite avant ce lot n'a pas de version. Sa v1 est créée depuis le texte de son tour, à sa première nouvelle version ou restauration.
  - `writeNote` est le seul chemin qui crée une note : la route d'ingestion n'accepte plus le kind `mcp_remember` (T57).
  - Elle n'est jamais poussée telle quelle, et jamais preuve d'une `[décision]` (D36).
  - Le rêve la lit, et peut proposer d'en faire une leçon (lot 15).
  - Le partage avec l'équipe passe par la passation de David (#106, `origin/david/passation-equipe`), après relecture (QD13). Rien dans ce plan ne partage une note.
  - Les notes sont effacées avec le compte (proposé, A12). Aujourd'hui, une note `remember` est gardée et devient invisible.
- **D39. Le rêve perso par règles** (lot 15).
  - Chaque nuit, pour chaque utilisateur, Leon relit ses faits, ses fils, ses leçons et ses notes, sous ses droits, sans modèle. Il en tire des propositions, qu'un humain accepte ou rejette.
  - **Les règles :**
    - une même commande ou un même outil en échec dans au moins 3 sessions distinctes sur 14 jours, dans les quatre outils de code (T58) : une leçon à compléter ;
    - un fil dormant, dont toutes les PR sont fusionnées ou fermées, sans session depuis 14 jours : le clore ;
    - une leçon sans preuve récente (tranché le 05/11) : toutes ses preuves ont plus de 90 jours. Le rêve propose de la retirer, l'humain décide. Jamais pour une leçon écrite à la main. Une leçon dont une preuve a disparu ou est devenue invisible ne se montre déjà plus (D33) : la règle ne la propose pas ;
    - des notes `leon noter` proches, dans au moins 3 sessions distinctes et vérifiées : en faire une leçon. Une session ne compte que si elle existe comme session de code de la personne (le kind de `outil`, l'`external_id` de `session`, le même auteur). Une note sans session vérifiée, et toute note `remember`, ne compte pas. La proposition laisse vide le texte de la leçon : les notes sont montrées comme preuves, marquées « écrit par l'agent », et l'humain écrit la leçon.
  - **Les preuves** (10 ids de sources au plus) sont vérifiées par le serveur, visibles de la personne. **La fréquence** est calculée par le serveur : les sessions touchées sur les sessions de la période.
  - Les propositions vont dans `propositions_memoire` (C15), sur le modèle de `about_suggestions`.
  - **La décision** se prend sur une page Accepter ou Rejeter du site.
    - L'acceptation est un compare-and-set : si la cible a changé entre-temps, la proposition passe « dépassée ».
    - Aucune validation par jeton ni par MCP.
    - Une proposition rejetée n'est jamais reproposée (même règle, même clé). Une acceptée non plus ; mais la clé d'un fil dormant porte la date de sa dernière session, si bien qu'un fil clos, rouvert puis de nouveau dormant est reproposé (C15).
  - 3 propositions nouvelles par nuit au plus, 10 ouvertes au plus, pour éviter d'accepter sans lire.
  - **Clore un fil** (`metadata.clos_le`) le retire du sommaire. Il reste lisible par `leon fil`, et se rouvre à la session suivante de sa branche.
  - **L'accord (proposé) :** aucun usage de plus. Rien ne sort de Leon, ni vers un modèle ni vers un fournisseur. Un interrupteur dans la section Mémoire des réglages coupe le rêve. Il est rangé dans `member` (C15).
  - **Ensuite :** la version avec modèle (environ 3 j) si David accepte QD1 ; le rêve d'équipe dans un lot suivant, une fois la hiérarchie des managers codée et une lecture à l'échelle de l'équipe conçue.

## Contrats partagés (en plus de C1 à C6)

**C7 révisé. L'accord local, par usage** : `~/.leon/accord.json`, en 0600.

```json
{ "outils": { "claude_code": { "version": 2, "installe_le": "…", "usages": { "lecture": "…", "rappel": "…", "resume": "…" } } } }
```

- `version` garde son sens (2 : les gestes ; 0 : retrait).
- `usages` liste ce qui a été accepté, avec la date. Amendé le 04/11 : `noter` s'y ajoute (D30, tranché le 05/11). Depuis le 05/11 (A16), un usage s'y écrit aussi depuis une case cochée de la page « Autoriser » (T64).
- Depuis le 05/11 (A16), `refus` liste, de même, les usages refusés, avec la date, dans le terminal ou sur la page : ils ne sont plus proposés. `refus` n'ouvre rien : un usage absent de `usages` reste un refus. Le retrait efface `usages` et `refus`. Le nom du champ est un choix du rédacteur.
- C2 (`POST /api/v1/faits`) gagne un champ facultatif `usages: string[]` (valeurs connues seulement), rangé dans `metadata.usages`. `accord` vaut 2 ; 3 et 4, jamais émises, restent acceptées par prudence.
- C3 (`POST /api/v1/contexte`) gagne `usages` et `commande` (la forme de la commande Leon posée sur le poste). Depuis le 05/11 (A16), `commande` est bornée : 200 octets au plus, en caractères de chemin seulement (lettres, chiffres, espace, `._/~-`), sans saut de ligne ni `<` ; sinon 400. La CLI dont la commande sortirait de cette forme (un clone sous un chemin trop long ou exotique) envoie `leon` (choix du rédacteur). C'est un texte du poste recopié dans le bloc, jusqu'à trois fois : la place réservée de D37 reste ainsi bornée.
- Un usage absent vaut refus.
- Le lot 6 lit `resume` là où il lisait la version 3.

**C8. `POST /api/v1/rappel`** : `{ projet, branche, session, message, outil, usages }`, `.strict()`.
- `projet` suit `ProjectSchema` ; `branche` et `session` font 200 caractères au plus ; `message`, 2 000 caractères au plus.
- Sortie : `{ texte }`, une ligne balisée ou vide.
- Sans `rappel` dans `usages`, le texte est vide, sans aucune recherche.
- Un serveur ancien répond 404 : la CLI ne sort rien, avec le code 0.

**C9. Les lectures** (routes de C11 et outils MCP du même nom) :
- `dossier { projet, branche?, session?, outil? }` rend 20 fils au plus : `{ id, titre, outils, derniere_date, prs, liees, etat_court }`. `etat_court` est la première ligne de « Où j'en suis », 200 caractères au plus ; `liees` est le nombre de sources liées ;
- `fil { projet, id?, branche?, session?, outil? }` (sans id : le fil de la branche) rend `{ titre, etat, sessions, prs, tickets, liees }`, où `liees` liste les sources de connecteurs et de GitHub avec l'id à ouvrir, dans les bornes de D27, la coupe signalée. Un fil d'un autre projet est introuvable.

Le rendu passe par `src/server/mcp/tools/render.ts`, avec sa garde. Au MCP, le `structuredContent` ne porte que les clés (`id`, `titre`, dates, numéros de PR).

Amendé le 04/11 : `etat` et `etat_court` viennent de la dernière version, si le lecteur peut la lire, sinon de l'état déterministe (D33, D35). `fil` rend aussi son numéro, `version`.

**C10. `POST /api/v1/coulisses`** (lot 14) : `{ kind, external_id, usages, blocs: { role: 'raisonnement' | 'sous_agent', ts, texte }[] }`, `.strict()`, 256 Kio au plus. 202, ou 404 sur un serveur ancien.

Amendé le 05/11 (relecture, D29) : un bloc peut aussi être un appel d'outil réduit, `{ role: 'appel_outil', ts, outil, cible?, statut }`, en `.strict()`, distingué par `role`. Il n'a pas de `texte` : le serveur l'écrit lui-même, sur une ligne, à partir des trois champs. Les noms des champs et des statuts sont des choix du rédacteur.
- `outil` : 60 caractères au plus, dans une seule forme, que rend la réduction du nom (nouvelle, T52) et que T58 reprend pour `outils_en_erreur`. Dans l'ordre :
  - un nom qui commence par `mcp__` se teste d'abord : `mcp__<serveur>__<outil>` devient `mcp:<serveur>`, le serveur en `[A-Za-z0-9._-]`, 56 caractères au plus ; tout autre nom en `mcp__` devient `[outil]`. Le nom de l'outil MCP ne part jamais ;
  - sinon, le nom s'il a la forme d'un exécutable (`EXECUTABLE` de `session-facts.ts`) ;
  - sinon, le texte fixe `[outil]`.
- `cible`, facultative, 200 caractères au plus (`TEXTE_MAX`) :
  - pour `Bash`, la commande réduite comme dans C1 (`reduceCommand` : l'exécutable, et la sous-commande de la liste fermée), sinon `[commande]` ;
  - pour un outil de fichier (`Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`), et pour le `path` de `Glob`, `Grep` et `LS`, le chemin relatif au dépôt (`repoRelativePath`), absente s'il en sort ;
  - absente pour tout autre outil. Jamais un motif de recherche, une URL, une requête, une consigne de sous-agent (elle va dans `sous_agent`) ni un autre argument.
- `statut` : `ok`, `erreur` (le `is_error` de son `tool_result`), ou `sans_resultat` (aucun `tool_result` : appel interrompu, refusé, ou encore en cours).
- Jamais la sortie de l'appel (`tool_result`) ni son entrée brute. `cible` passe par `maskSecrets` sur le poste. Le serveur revérifie `outil` et `cible`, puis repasse `maskSecrets` et la borne. Il repasse `outil` par la même réduction, `mcp__` testé avant `EXECUTABLE` : une CLI qui ne réduit pas ne fait donc jamais passer `mcp__linear__get_issue`, rangé `mcp:linear`. Un `mcp:<serveur>` déjà réduit reste tel quel, et tout autre nom hors de la forme devient `[outil]`. Une cible `Bash` hors de la forme rendue par `reduceCommand` devient `[commande]` (`recheckCommand`). Un chemin absolu, ou qui contient `..`, est retiré : l'appel est rangé sans cible.

**C11. Les routes de lecture** : `POST /api/v1/dossier`, `POST /api/v1/fil` (les corps de C9) et `POST /api/v1/chercher { projet, requete, session?, outil? }`, le dépôt se déduisant de `projet`. Chaque corps porte aussi `usages`.
- Elles demandent le jeton et `lecture` dans les `usages` envoyés, et sont en `.strict()`, 4 Kio au plus.
- Elles rendent `{ texte }` (le rendu gardé de C9).
- Un serveur ancien répond 404 : la commande le dit sur la sortie d'erreur, avec le code 0.

Contrats du 04/11 :

**C12. Les versions** (D33, D34 ; T53, T54, T55).
- **La table `versions_memoire`** :
  - `id` ; `tenant_id` (`references organization(id) on delete cascade`) et `owner_user_id` (`references "user"(id) on delete cascade`), comme 0045 ; `acl` avec `check (acl = array[owner_user_id])` ;
  - la cible : `source_id` (un fil ou une note), ou `lecon_id` (ajouté par T55), exactement l'une des deux, en `on delete cascade` ;
  - `n`, unique par cible ; `texte`, 4 000 caractères au plus, passé par `maskSecrets` ;
  - `entrees uuid[]`, des ids de sources seulement (sessions comprises) ; `tours uuid[]`, pour la provenance, jamais lus par la règle de lecture ; `check (ecrit_par <> 'modele' or cardinality(entrees) > 0)` ;
  - `ecrit_par` (`serveur`, `modele`, `agent`, `humain`) ; `etape`, `modele`, `outil` et `session`, facultatifs ;
  - `motif` ; `restaure_de`, facultatif ; `cree_le`.
  - RLS `tenant_acl`. `grant select, insert, delete` ; la suppression ne sert qu'à `deleteAccount`, comme pour 0045. Aucune mise à jour.
- **`POST /api/v1/versions { projet, id, n?, session?, outil?, usages }`** rend `{ texte }` : sans `n`, la liste des versions lisibles (n, date, qui, motif, première ligne) ; avec `n`, le texte de cette version, si elle est lisible.
- **La restauration n'a pas de route à jeton** (tranché le 05/11) : `POST /api/v1/versions/restaurer` est retirée. Elle passe par une action serveur du site (T55), qui n'accepte qu'une session du navigateur, connectée depuis moins d'une heure (D37). Elle écrit v(depuis+1) avec le texte et les entrées de la version `n`, si la dernière est encore `depuis` et que `n` est lisible, en `ecrit_par = humain`. Sinon elle répond « modifiée entre-temps ». Une note passe par `writeNote` (D38).
- La route de lecture est en `.strict()`, 4 Kio au plus, avec le jeton et `lecture` dans les `usages`. L'id est un fil ou une note du projet, ou une leçon du projet ou sans dépôt ; tout autre id est introuvable. Un serveur ancien répond 404 : la commande le dit sur la sortie d'erreur, avec le code 0.
- L'outil MCP `versions { projet, id, n? }` fait la même lecture, bornée au projet comme `fil`. Il ne restaure jamais.

**C13. Les leçons** (D37 ; T55, T56).
- **La table `lecons`** : `id`, `tenant_id`, `owner_user_id`, `acl` avec `check (acl = array[owner_user_id])`, `projet` (facultatif, `ProjectSchema`), `origine` (`humain`, `regle`), `frequence` (les sessions touchées, 0 pour une leçon écrite à la main), `acceptee_le`, `retiree_le`. Le texte et les preuves sont ceux de sa dernière version (C12). RLS `tenant_acl`.
  - `tenant_id` et `owner_user_id` en clés étrangères `on delete cascade`, comme 0045.
  - `grant select, insert, delete` (la suppression ne sert qu'à `deleteAccount`) et `grant update (acceptee_le, retiree_le, frequence)`.
  - `read_log` gagne `lecon_id`, facultatif, et `source_id` devient facultatif, avec un check « exactement une cible » : une lecture de leçon est notée comme les autres.
- Les actions serveur du site, sous la session du navigateur, écrivent, corrigent, retirent et restaurent. Écrire, corriger et restaurer exigent une connexion de moins d'une heure (D37, tranché le 05/11). Aucune route à jeton ni aucun outil MCP n'écrit une leçon.
- **`POST /api/v1/lecons { projet, id?, session?, outil?, usages }`** rend `{ texte }` : sans id, les leçons lisibles et non retirées, du dépôt et sans dépôt, dans l'ordre de D37 ; avec id, une leçon. `.strict()`, 4 Kio au plus, avec le jeton et `lecture`. Un serveur ancien répond 404, comme C11.
- L'outil MCP `lecons { projet, id? }` fait la même lecture, bornée au projet comme `fil` : les leçons du dépôt et celles sans dépôt.

**C14. Les notes de l'agent** (D38 ; T57).
- **`POST /api/v1/noter { projet, outil, session?, texte, note?, version?, usages }`**, en `.strict()`, 16 Kio au plus, avec le jeton et `noter` (D30).
  - `texte` : 4 000 caractères au plus, masqué sur le poste puis sur le serveur (`maskSecrets`) ;
  - `outil` : un kind de `CODE_SESSION_KINDS` ; `session` : 200 caractères au plus, une indication déclarée ;
  - sans `note`, une note neuve (v1) ; avec `note` et `version`, la version suivante, en compare-and-set, seulement si la dernière vient du même outil. Quand la dernière est une restauration du site (`humain`), on compare à l'outil de la note (`metadata.outil`, D38).
- Elle rend 201 `{ id, n }`, ou 409 si la version est dépassée ou vient d'un autre outil. Un serveur ancien répond 404 : la commande le dit sur la sortie d'erreur, avec le code 0.
- `remember` gagne `note` et `version`, facultatifs, et prend le même chemin, avec `mcp:<libellé>` pour `outil` (le libellé du client, au motif de `read_log.client`). `writeNote` valide les deux formes de `outil`. `remember` ne demande pas `noter` dans un corps : au MCP, il n'y a pas d'usages du poste (D27). Tranché le 05/11 (A16) : il lit le réglage `noter` du compte, et refuse quand il est daté (C16, T65).
- La route d'ingestion (`POST /api/v1/ingest`) n'accepte plus le kind `mcp_remember`, par un enum propre à la route ; `SOURCE_KINDS` ne change pas.
- C3 gagne `outil`, pour que la consigne cite `leon noter` avec l'outil et la session déjà remplis. Amendé le 05/11 (relecture) : cette phrase suit l'usage `noter`, avec ou sans `lecture` (D24).

**C15. Les propositions du rêve** (D39 ; lot 15).
- **La table `propositions_memoire`**, sur le modèle de `about_suggestions` (0045) :
  - `id`, `tenant_id`, `user_id`, `acl` avec `check (acl = array[user_id])`, `projet` (facultatif) ;
  - `regle` (`echec_repete`, `fil_dormant`, `lecon_sans_preuve`, `notes_recurrentes`) et `cle`, une empreinte : la commande ou l'outil réduit, l'id du fil avec la date de sa dernière session, l'id de la leçon avec le numéro de sa version, ou les ids des notes ;
  - `action` (`ajouter`, `retirer`, `clore`) ; la cible, `lecon_id` ou `fil_id`, et `version_cible`, la dernière version lue à la rédaction ;
  - `texte`, 300 caractères au plus, vide pour `notes_recurrentes` ; `preuves uuid[]`, des ids de sources seulement, 10 au plus ; `tours uuid[]`, les tours cités ; `sessions_touchees`, `sessions_periode` ;
  - `cree_le`, `decision` (`acceptee`, `rejetee`, `depassee`), `decide_le`.
- Un index unique partiel sur `(tenant_id, user_id, regle, cle)`, `where decision is distinct from 'depassee'` : une proposition ouverte, acceptée ou rejetée n'est jamais reproposée ; une dépassée peut revenir. Un fil clos, rouvert puis de nouveau dormant a une autre clé, et revient.
- **L'interrupteur du rêve** : une colonne datée de `member`, comme `onboardedAt` (0043), nulle par défaut, écrite par l'action du site. `reves_a_faire()` saute ceux qui l'ont coupé.
- RLS `tenant_acl`. `grant select, insert, delete` (la suppression ne sert qu'à `deleteAccount`) et `grant update (decision, decide_le)`.
- `reves_a_faire()`, en `security definer` avec `pg_temp` en dernier, rend les couples (organisation, utilisateur) à traiter : des identifiants seulement, comme `apropos_a_proposer` (0045).
- Aucune route à jeton ni aucun outil MCP : la décision passe par les actions serveur du site. Accepter une proposition qui écrit une leçon exige la connexion récente (D37, T61).

Contrat du 05/11 :

**C16. Les usages de la page « Autoriser » et le réglage `noter` du compte** (D30 ; T64, T65).
- **Le paramètre `usages` de la page** (K3 du plan de la CLI sans clone) : facultatif, des valeurs séparées par des virgules, parmi `lecture`, `rappel` et `noter`. `parseAuthorizeParams` le valide avec les trois autres ; une valeur inconnue est écartée. `authorizeQuery` et `pathAfterSignIn` le gardent, si bien qu'il survit à la connexion. Sans lui, la page ne montre aucune case.
- **Le code signé** de la page (`signComputerCode`, K4) gagne `m` et `g`, facultatifs : les usages montrés, puis ceux cochés parmi eux, valeurs connues seulement. Un code sans eux vaut `[]`. Le code part dans l'adresse de retour (`/retour?code&etat`) : sa charge, du JSON en base64url, est lisible de qui voit l'adresse, mais non modifiable.
- **La 201 de `POST /api/v1/ordinateurs`** gagne `usages` (les valeurs de `g`) et `refus` (celles de `m` hors de `g`), deux `string[]`. `ComputerResponseSchema` les prend facultatifs : un serveur ancien ne les rend pas, et la CLI n'écrit alors ni usage ni refus. La CLI les lit comme `string[]` et ignore une valeur qu'elle ne connaît pas, sans jamais en faire une erreur : une CLI du lot 12 qui reçoit `noter` d'un serveur du lot 13 se connecte quand même.
- **La colonne `member."noterRefuseLe"`** (`timestamptz`, nulle par défaut, ajoutée par sa migration) : nulle, `remember` écrit ; datée, il refuse. Elle s'écrit :
  - par `POST /api/v1/ordinateurs`, une fois le jeton enregistré (201), sur la ligne de `claims.u` et `claims.t` : `noter` dans `g`, nulle ; dans `m` sans `g`, datée ; hors de `m`, inchangée. Un 401 ou un 409 n'y touche pas. L'action de la page ne l'écrit pas ;
  - par la route à jeton ci-dessous, pour un refus seulement ;
  - par l'action de la section Mémoire du site, sous la session du navigateur, dans les deux sens.
  La page la lit pour décocher `noter` quand elle est datée.
- **`POST /api/v1/usages { noter: false }`**, en `.strict()`, 1 Kio au plus, avec un jeton d'ordinateur ou manuel ; un jeton d'assistant reçoit le 401 commun (F9). Elle date la colonne et rend 204. `{ noter: true }` rend 400 : un refus peut venir de partout, rouvrir `remember` passe par le navigateur. Un serveur ancien répond 404 : l'installateur le dit sur la sortie d'erreur et continue. Le nom de la route est un choix du rédacteur.
- **`connexion.json`** (K2) gagne `par`, facultatif : `"jeton"` quand `leon login --with-token` l'a écrit. `leon setup` ne relance pas alors `leon login` sous `--yes` (D30). Le nom du champ est un choix du rédacteur.

## Lot 12 : les fils et le dossier

### T39 · Le kind `leon_fil`, sa suppression et sa fusion

**Fichiers :**
- `src/capture/turn.ts` (`SOURCE_KINDS`, `ITEM_NATURES`), `src/lib/labels.ts`, `src/test/fixtures.ts`, `src/components/search/view-model.ts` ;
- `src/server/search/parse-query.ts`, `src/server/search/tool-filters.ts`, `src/server/search/filters-sql.ts`, `src/test/contracts/mcp-descriptions.test.ts` (le kind hors du filtre `outil`, la nature dans `type`) ;
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
- `outil:leon_fil` refusé par les filtres ; la nature `fil_de_travail` filtrée par `type` ;
- `rls-coverage.db.test.ts`.

### T53 · Les versions de la mémoire (après T39, avant T40 ; T43 et T57 écrivent par elle)

**Fichiers :**
- `src/server/db/migrations/NNNN-versions-memoire.sql` (nouveau, numéro pris sur main au moment du lot) et son test db ;
- `src/server/db/schema/memory.ts` (la table) ;
- `src/server/memory/versions.ts` (nouveau : `writeVersion`, `readVersion`, `listVersions`, `restoreVersion`) et `src/server/memory/versions.db.test.ts` (nouveau) ;
- `src/server/auth/delete-account.ts`, `src/server/auth/delete-account.db.test.ts`, `src/server/db/rls-coverage.db.test.ts`.

**Fait quand :**
- la migration crée `versions_memoire` selon C12, avec la seule cible `source_id` (T55 ajoute `lecon_id`) ;
- `writeVersion` prend `for update` sur la ligne de la cible, et n'écrit v(n+1) que si la dernière est encore celle attendue ; sinon il rend « dépassée » (D34). Il passe `maskSecrets` sur le texte ;
- `readVersion` et `listVersions` ne rendent une version que si le lecteur voit toutes ses sources (`entrees`) sous RLS, et, pour un état écrit par le modèle, que les sessions parmi elles portent l'usage `resume` (D33). Les `tours` ne sont jamais lus par cette règle ;
- la lecture de l'état rend la dernière version si elle est lisible, sinon l'état déterministe, jamais une version plus ancienne (D33) ;
- `restoreVersion` écrit v(n+1) avec le texte et les entrées d'une version encore lisible, avec le motif restauration et `restaure_de`. Seule l'action du site l'appelle (T55, tranché le 05/11) : la version porte `ecrit_par = humain`. `restaure_de` pointe vers la version d'origine du texte (celle de la version choisie, si elle est elle-même restaurée). La restauration d'une version du modèle suit les règles d'une version du modèle : la condition `resume` à la lecture, et l'état sans modèle ne l'écrase pas (D33). Une note se restaure par `writeNote`, que T57 branche ici ;
- aucune version n'a de tour, de passage ni de vecteur ;
- des compteurs côté serveur, sans texte ni id : versions écrites, écritures dépassées, restaurations (relevés par T38) ;
- la suppression du compte efface les versions de la personne ; `supprimer_fil` les emporte par la cascade.

**Tests :**
- test db de la migration :
  - la version d'un collègue est introuvable ;
  - une ACL élargie est refusée par la base ;
  - une mise à jour est refusée ;
  - une version `ecrit_par = modele` sans entrée est refusée ;
- `versions.db.test.ts` :
  - deux écritures depuis vn : une seule v(n+1), l'autre « dépassée » ;
  - une entrée rendue privée (comme par 0048) : la version n'est pas rendue ;
  - v2 illisible et v1 lisible : la lecture de l'état rend l'état déterministe, jamais v1 ;
  - un usage `resume` retiré d'une session d'entrée : l'état du fil n'est pas rendu, une note qui cite cette session l'est encore ;
  - un faux secret écrit dans une version est masqué en base ;
  - les compteurs avancent d'une écriture, d'une dépassée et d'une restauration ;
  - restaurer v1 après v3 donne v4, et v2 et v3 restent ;
  - restaurer une version illisible : refus ;
  - restaurer une version du modèle, puis retirer `resume` d'une session d'entrée : la version restaurée n'est plus rendue ;
  - une source de plus après la restauration d'une version du modèle : aucune version `serveur` ne l'écrase ;
  - `searchPassages` et `fetchSource` ne rendent aucune version ;
- `delete-account.db.test.ts` : plus aucune version de la personne ;
- `rls-coverage.db.test.ts`.

### T40 · Le rangement des sessions

> **Amendé le 04/11 (D34) :** toute écriture du `metadata` d'un fil se fait dans une transaction, après `for update` sur sa ligne. À la création, l'insertion passe par la contrainte unique de `sources` (`on conflict do nothing`), puis prend le verrou. Une fusion prend les deux lignes dans l'ordre des ids. Elle ne supprime plus le fil absorbé : elle le marque (`absorbe_par`, D21), et le rangement le saute. Le rangement reste par session, mais n'écrit plus l'état : il met en file `fil-maj`, stately par fil (T43). Dans le « Fait quand », « par `supprimer_fil` » se lit : par `absorbe_par` ; `supprimer_fil` ne sert plus qu'à la suppression du compte (tranché le 05/11). Tests de plus :
> - deux sessions de deux outils sur la même branche, faits reçus au même moment : un seul fil, et aucune session ni source liée perdue ;
> - après une fusion, l'historique des deux fils reste lisible par `listVersions`, et une session de plus rejoint le fil gardé ;
> - une fusion ne supprime aucune ligne de `versions_memoire`.

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

> **Amendé le 04/11 (D34) :** le rattachement prend le verrou du fil, puis met en file `fil-maj`. Il n'écrit jamais l'état lui-même.

**Fichiers :** `src/server/sessions/threads.ts`, `src/server/search/index-run.ts` et `src/server/search/embed-missing.ts` (le déclencheur, une fois écrits les vecteurs d'un tour `leon:resume:*`).

**Fait quand :**
- une session sans clé est rattachée selon D22, une fois le vecteur de son résumé écrit ;
- sans résumé ni vecteur (pas de fournisseur de vecteurs, moins de 6 échanges, pas d'usage `resume`), elle reste hors fil et n'ouvre rien ;
- le seuil est une constante prudente, avec son commentaire `shortcut:`.

**Tests :** `threads.db.test.ts` (vecteurs simulés) :
- au-dessus du seuil : rattachée ;
- en dessous : hors fil, aucun fil ouvert ;
- sans fournisseur de vecteurs : aucun rattachement ;
- résumé indexé sans vecteur : rattachement remis à plus tard, puis fait par la reprise.

### T42 · Relier les connecteurs et GitHub

> **Amendé le 04/11 (D34 à D36) :** relier une source prend le verrou du fil. Une source liée devenue invisible n'a plus besoin d'être détectée : la lecture de l'état vérifie ses entrées (D35). Le dernier test devient : source retirée ou rendue privée, l'ancien état n'est rendu par aucune lecture. Une note `remember` ou `leon noter` liée entre au condensé marquée « agent (note, <outil>) ».
>
> Les mots d'une source liée sont rangés avec elle dans `mots_cles` (D21). Ils ne comptent plus dès qu'elle est invisible : le rappel et le compte des sources liées font la jointure sur `sources`, sous RLS. Dans le « Fait quand », « l'état est réécrit » se lit : `fil-maj` est mis en file, et l'ancienne version n'est plus lisible (D33). Test de plus : les mots d'une source liée sont rangés avec son id. T44 et T48 testent la PR rendue privée sur le compte des sources liées et sur le rappel.

**Fichiers :** `src/server/sessions/thread-links.ts` (nouveau), `src/server/sessions/threads-queue.ts`, `src/server/search/index-run.ts` et `src/server/search/embed-missing.ts` (le déclencheur après l'indexation d'une source), `src/server/mcp/tools/remember-tool.ts`.

**Fait quand :**
- une source de connecteur ou de GitHub visible de l'auteur est reliée à ses fils selon D22, d'abord par clé exacte, puis par proximité bornée ;
- `metadata.liees` ne garde que des ids et la clé qui relie ;
- une source invisible du lecteur n'est jamais rendue par les lectures ;
- les notes `remember`, les documents et les conversations web sont reliés par proximité seulement ;
- une source liée qui disparaît quitte `liees`, et l'état est réécrit (déterministe en cas d'échec).

**Tests :** `thread-links.db.test.ts` (nouveau) :
- un ticket `ABC-123` cité dans le titre d'une PR relie le ticket ;
- un message Slack qui cite l'URL d'une PR rejoint son fil ;
- une réunion proche (vecteurs simulés) rejoint le fil ;
- une source d'un autre membre, invisible de l'auteur : jamais reliée ;
- aucune copie de texte dans `metadata` ;
- une note `remember` proche rejoint le fil ;
- source de connecteur retirée : l'ancien état n'est plus trouvé par la recherche.

### T43 · L'état du fil

> **Amendé le 04/11 (D33 à D36) :**
> - l'état s'écrit en nouvelle version de `versions_memoire` (T53), avec ses entrées et sa provenance : `ecrit_par = modele`, l'étape `fil` et le modèle. Plus de tour `leon:fil:etat`, plus de passages supprimés, plus d'indexation ;
> - quand la liste déterministe change et que la dernière version n'est pas une version lisible du modèle, la tâche écrit une version `ecrit_par = serveur` (D33). L'état déterministe de repli se calcule à la lecture, sur les seules sources visibles ;
> - la tâche est la file `fil-maj`, stately par fil. Elle lit vn avant de bâtir le condensé, relit l'usage `resume` juste avant d'écrire, et n'écrit v(n+1) que si la dernière est encore vn. Sinon elle s'arrête, et la tâche en attente refait ;
> - une session qui a lu Leon n'est plus externe (D36) : son récit entre au condensé, les tours de l'agent marqués « agent ». Les entrées de la version comprennent les sources lues pendant les sessions du condensé (`read_log.session`, D35) ;
> - chaque ligne de la sortie cite au moins un id du condensé. Le serveur retire les autres, et écrit lui-même la provenance de chaque ligne d'après ses ids (D23 amendé) ;
> - le vérificateur des `[décision]` n'accepte comme message de l'utilisateur qu'un tour `user` d'une session de code de l'auteur, jamais une note ni un tour `user` injecté. `parseClaudeCodeSession` marque à la capture les tours injectés (rapport de sous-agent, notification de tâche, message d'un agent, sortie de crochet, texte d'orchestration), dans la forme relevée sur une session de test créée pour l'occasion, jamais sur une vraie conversation. C'est le tri tranché le 05/11 (A14, D36) : un rapport de sous-agent n'est jamais un message de l'utilisateur, ni preuve d'une `[décision]`. Il vient avant tout assouplissement du signal externe (T63) ;
> - la marque va jusqu'au serveur, où tourne le vérificateur : un champ facultatif du tour, `injecte: true`, envoyé pour un tour marqué seulement. `TurnSchema` (`src/capture/turn.ts`) est aujourd'hui en `.strict()`, avec `role: user | assistant` et aucun autre champ. Le tour est rangé avec une colonne `turns.injecte` (`boolean not null default false`). Le serveur avant la CLI, comme T58 : le schéma accepte le champ avant que la CLI ne l'envoie, sinon la route rendrait 400 et toute la capture de la session échouerait ;
> - un tour injecté entre au condensé marqué « agent », jamais « toi » : une ligne qui ne cite que lui a la provenance « agent » (D23) ;
> - tranché le 05/11 (A16) : une ligne qui ne s'appuie que sur des notes de l'agent est gardée, avec la provenance « agent ». Elle n'est jamais preuve d'une `[décision]`, et l'état reste visible de l'auteur seul, comme le fil (D23) ;
> - fichiers en plus : `src/server/memory/versions.ts` (lu), `src/capture/claude-code.ts` et son test, avec une fixture inventée ; `src/capture/turn.ts` (`TurnSchema`), `src/server/api/ingest-routes.ts`, `src/server/ingest/ingest-turns.ts`, `src/server/db/schema/memory.ts`, `src/server/db/migrations/NNNN-tours-injectes.sql` (nouveau) et son test db, `src/test/contracts/api-contract.db.test.ts` ;
> - tests de plus :
>   - deux écritures concurrentes donnent une seule v(n+1) ;
>   - si l'usage `resume` est retiré pendant l'appel, rien n'est écrit ;
>   - si une note est citée comme preuve, la décision est retirée ;
>   - dans une session qui a lu `leon fil`, les tours de l'utilisateur entrent au condensé, et ceux de l'agent sont marqués ;
>   - une ligne `[en-cours]` sans id du condensé est retirée, et une provenance écrite par le modèle est remplacée par celle du serveur ;
>   - une source lue par `leon chercher` dans une session, puis rendue privée par `aligner_sources_github()`, et l'état n'est plus rendu ;
>   - une décision qui cite le rapport d'un sous-agent, rangé en tour `user` et lu marqué par `turns.injecte`, est retirée ;
>   - une ligne `[prochaine-étape]` qui ne cite que le rapport d'un sous-agent a la provenance « agent », jamais « toi » ;
>   - une ligne `[prochaine-étape]` qui ne cite que des notes est gardée, avec la provenance « agent » ; l'état qui la porte est introuvable pour un collègue ;
>   - `claude-code.test.ts`, sur la fixture inventée : le rapport d'un sous-agent et une notification de tâche sont marqués injectés ; un vrai message de l'utilisateur ne l'est pas ;
>   - `ingest-routes.db.test.ts` : un tour envoyé avec `injecte: true` est rangé marqué, un tour sans le champ ne l'est pas ; `api-contract.db.test.ts` : le champ est au contrat ;
>   - sans modèle, une session de plus écrit une version `ecrit_par = serveur` ;
>   - les tests « second état » et « modèle en échec » se lisent avec les versions : l'état n'est jamais dans la recherche, et un échec n'écrit aucune version.

**Fichiers :** `src/server/sessions/thread-state.ts` (nouveau), `src/server/llm/llm.ts` et `src/server/llm/models.ts` (étape `fil`), `src/server/db/migrations/NNNN-etape-fil.sql` (nouveau : le check gagne `fil`) et son test db, `src/components/verre/admin/index.tsx` (libellé), `models.test.ts`, `llm-contract.test.ts` ; si le code exige une variable par étape, `src/server/env.ts` (`LEON_MODEL_FIL`), `.env.example` et `env-contract.test.ts`.

**Fait quand :**
- l'état est écrit selon D23 : condensé borné aux sessions avec l'usage `resume` et aux sources liées, provenance, décisions vérifiées, `[consigne]` retirée, 2 000 caractères au plus ;
- la réécriture remplace le texte, supprime les passages et leurs vecteurs, puis met en file l'indexation ;
- sans modèle, sans usage `resume` ou en cas d'échec, l'état est déterministe, et un échec garde l'ancien ;
- le condensé passe par `prompt-guard` ;
- l'appel ne part que pour une session `resume` nouvelle depuis le dernier état (`etat_session`).

**Tests :**
- `thread-state.test.ts` (modèle simulé) :
  - une décision qui ne cite aucun id présent est retirée ;
  - un rapport piégé ne produit aucune décision ;
  - `[consigne]` est retirée ;
  - 2 001 caractères sont coupés ;
  - un passage piégé du condensé reste une donnée (`DATA_GUARD_LINE`) ;
  - chaque élément porte sa provenance ;
  - une session externe n'apporte que ses clés ;
- `thread-state.db.test.ts` :
  - fil dont aucune session n'a l'usage `resume` : aucun appel de modèle ;
  - fil mixte : rien de la session sans usage dans le condensé ;
  - second état : l'ancien n'est plus trouvé par la recherche ;
  - modèle en échec : ancien état gardé ;
  - sans modèle réglé : état déterministe, aucun appel ;
  - dix sources liées de plus : zéro appel.

### T44 · Les routes et les commandes de lecture

> **Amendé le 04/11 (D33, D35, D36) :**
> - la lecture commune rend la dernière version de l'état, si le lecteur peut la lire, avec sa date et son numéro ; sinon l'état déterministe, jamais une version plus ancienne (D33). L'état reste déterministe jusqu'à la prochaine version : rien n'est mis en file. `etat_court` suit la même règle ;
> - le signal externe : aucune commande `leon` n'entre dans les commandes réseau, et `session-facts.ts` compte les outils `dossier`, `fil`, `lecons`, `versions` et `remember` du serveur MCP de Leon parmi les outils locaux (`lecons`, `versions` et `remember` : tranché le 05/11, A14). Le nom du serveur est celui que pose son installation (#121). Il se compare au nom complet exact (`mcp__<serveur>__fil`), jamais à un suffixe. Le serveur n'est reconnu que si sa configuration pointe vers l'URL de Leon posée par l'installation, lue par la CLI au moment des faits ; sinon, la session reste externe ;
> - le check de `read_log.tool` gagne aussi `versions` ;
> - un compteur côté serveur, sans texte ni id, des états masqués par la règle de lecture (relevé par T38) ;
> - le test de `session-facts` devient : `leon fil`, `leon chercher`, `leon dossier`, `leon lecons`, `leon versions`, `leon noter` et les outils `fil`, `dossier`, `lecons`, `versions` et `remember` de Leon ne rendent pas la session externe ; `search` ou `fetch` de Leon, un autre `mcp__*`, `Agent` (jusqu'à T63), ou un serveur du même nom déclaré par le projet vers une autre URL, si ;
> - fichiers en plus : `src/server/memory/versions.ts` (lu), `src/cli/capture-session.ts` (l'URL du serveur MCP de Leon, lue dans sa configuration) ;
> - tests de plus :
>   - une source liée rendue privée (comme par 0048), ou un usage `resume` retiré, et l'ancien texte n'est rendu par aucune lecture ;
>   - une PR liée rendue privée, et le compte des sources liées du dossier baisse ;
>   - un fil absorbé n'est pas listé par `dossier`, et `fil` de son id mène au fil gardé ;
>   - le compteur des états masqués avance d'un.

**Fichiers :**
- `src/capture/api-contract.ts` (C9, C11, `API_PATHS`) ;
- `src/server/sessions/thread-read.ts` (nouveau : la lecture commune), `src/server/api/read-routes.ts` (nouveau), `src/server/api/app.ts` ;
- `src/cli/read-commands.ts` (nouveau), `src/cli/leon.ts` (`dossier`, `fil`, `chercher`) ;
- `src/test/contracts/api-contract.db.test.ts` (`SERVED`) ;
- `src/server/db/migrations/NNNN-lectures-fil.sql` (nouveau : le check de `read_log.tool` gagne `dossier`, `fil` et `chercher` ; colonne `session`), `src/server/db/schema/memory.ts` ;
- `src/capture/session-facts.ts` et son test (le signal externe de D27).

**Fait quand :**
- les trois routes suivent C9 et C11, sous `withTenant` du porteur, avec l'usage `lecture` ;
- `chercher` se borne au dépôt du projet ; `leon fil` sans id ouvre le fil de la branche courante ; un id absorbé mène au fil gardé ;
- le signal externe suit D27 ;
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
  - un fil d'un autre projet : introuvable ;
  - une lecture `fil` laisse une ligne `read_log` avec son outil ;
- `read-commands.test.ts` : serveur ancien (404), serveur absent ;
- `session-facts.test.ts` : `leon fil` et `leon chercher` rendent la session externe, `leon dossier` non ;
- contrat : `api-contract.db.test.ts`.

### T45 · Le MCP : `dossier`, `fil`, et deux filtres de `search`

> **Amendé le 04/11 (D35) :** l'état n'étant plus indexé, `search` ne trouve aucun fil. `fetch` d'un id de fil rend le texte de l'outil `fil`, par la lecture commune (fichier en plus : `src/server/mcp/tools/fetch-tool.ts`). Test de plus : `fetch` d'un fil dont une entrée est devenue privée ne rend pas l'ancien état.

**Fichiers :**
- `src/server/mcp/tools/dossier-tool.ts` (nouveau), `src/server/mcp/tools/fil-tool.ts` (nouveau) ;
- `src/server/mcp/server.ts` (`MCP_INSTRUCTIONS`) ;
- `src/server/mcp/tools/search-tool.ts`, `src/server/mcp/tools/render.ts`, `src/server/mcp/tools/output-schemas.ts` ;
- `src/test/contracts/mcp-descriptions.test.ts` ;
- `src/server/search/types.ts`, `filters-sql.ts`, `search.ts`, `tool-filters.ts`, `search-sql.test.ts`, `search.db.test.ts` (le filtre `fil`).

**Fait quand :**
- `dossier` et `fil` reprennent la lecture commune de T44 ;
- leur `structuredContent` ne porte que des clés ;
- `search` accepte le filtre `fil` (`depot` vient de T25), et mentionne le fil et les PR d'une session trouvée ;
- `MCP_INSTRUCTIONS` gagne la phrase de D27, sans retirer la recherche générale.

**Tests :** `mcp.db.test.ts` :
- un état piégé n'apparaît que dans `content`, après la ligne de garde ;
- un id qui n'est pas un fil : introuvable ;
- une session trouvée porte son fil et ses PR ;
- la liste figée des outils est à jour ;
- filtré par un fil : ses sessions et ses sources liées visibles seulement ; fil d'un collègue : aucun résultat.

Contrat : `mcp-descriptions.test.ts`.

### T54 · L'historique : `leon versions` et l'outil `versions` (après T45)

**Fichiers :**
- `src/capture/api-contract.ts` (C12, `API_PATHS`) ;
- `src/server/api/read-routes.ts` (`POST /api/v1/versions`) ;
- `src/cli/read-commands.ts`, `src/cli/leon.ts` (`versions`) ;
- `src/server/mcp/tools/versions-tool.ts` (nouveau), `src/server/mcp/server.ts`, `src/test/contracts/mcp-descriptions.test.ts` ;
- `src/test/contracts/api-contract.db.test.ts` (`SERVED`).

**Fait quand :**
- la route suit C12, sous `withTenant` du porteur, bornée au projet, avec l'usage `lecture` ;
- `leon versions <id>` liste les versions lisibles ; `--lire <n>` en rend une ;
- rien ne restaure par le poste (tranché le 05/11) : ni option de `leon versions`, ni route à jeton. La restauration se fait sur le site seulement (T55) ;
- l'outil MCP `versions` lit, borné au projet, et ne restaure jamais ; son `structuredContent` ne porte que des clés ;
- le texte rendu passe par la garde (D25) ;
- chaque lecture est notée (`recordReads`, outil `versions`) ;
- les commandes écrivent sur la sortie standard, rien sur le disque.

**Tests :**
- `read-routes.db.test.ts` :
  - 401, 400, 413 ; sans usage `lecture` : refus ;
  - l'id d'un collègue ou d'un autre projet : introuvable ;
- `read-commands.test.ts` : serveur ancien (404), code 0 ;
- `mcp.db.test.ts` : l'outil `versions` n'offre aucune restauration ; un fil ou une note d'un autre projet est introuvable ; un texte piégé n'apparaît qu'après la ligne de garde ;
- contrats : `api-contract.db.test.ts`, `mcp-descriptions.test.ts` ; aucune route de `API_PATHS` ni aucun outil MCP ne restaure une version.

### T46 · Le sommaire au démarrage (niveau 1)

> **Amendé le 04/11 (D37) :** T56 insère les leçons entre l'équipe et la consigne, et le point du matin prend le reste. Le sommaire ne lit aucune version : il reste en clés.

> **Amendé le 05/11 (relecture, D24, D30) :** tout le niveau 1 suit l'usage `lecture` de l'outil, pas seulement la consigne. Sans lui, la route ne lit aucun fil et rend le bloc de main : « mes sessions » (lot 1), « L'équipe sur ce dépôt » (lot 3), puis le point du matin, avec la ligne de garde de main. Ni sommaire, ni leçons (T56), ni consigne de lecture. La phrase de `leon noter`, elle, suit l'usage `noter` : T57 la garde sans `lecture` (D24). Dans le « Fait quand », « ne figure qu'avec l'usage `lecture` » vaut pour le sommaire entier, et le repli sur le post-it joue aussi sans l'usage. La mise à jour des fils reste mise en file. Fichier en plus : `src/cli/briefing.ts` (les `usages` de l'outil dont le crochet demande le bloc, dans C3) et son test. Tests de plus :
> - `render-context.test.ts` : sans l'usage `lecture`, avec des fils et des leçons, ni sommaire, ni leçons, ni consigne de lecture : le bloc est celui de main, mot pour mot ; la consigne mot pour mot avec l'usage, absente sans lui ;
> - `context-routes.db.test.ts` : `usages` sans `lecture`, avec des fils et des leçons en base : la réponse ne porte aucun id de fil, aucune ligne du sommaire, aucune leçon ni consigne de lecture ;
> - `briefing.test.ts` : la CLI envoie les usages de l'outil dont le crochet demande le bloc, jamais ceux d'un autre outil du poste.

**Fichiers :** `src/server/sessions/start-context.ts`, `src/server/sessions/render-context.ts`, `src/server/api/context-routes.ts` (mise en file de la mise à jour, sans l'attendre), `src/capture/strip-leon-blocks.ts`.

**Fait quand :**
- le bloc suit D24 : les fils (chaque ligne porte son id), la section d'équipe déplacée depuis T14 (à partir du lot 3), la consigne fixe, puis le point du matin, en 8 000 octets ;
- la consigne, en français, cite la commande réellement posée (C3 `commande`) et ne figure qu'avec l'usage `lecture` ;
- `commande` suit la borne de C3 (amendé le 05/11, A16) : 200 octets au plus, caractères de chemin seulement, sans saut de ligne ni `<`, sinon 400 ; la CLI envoie `leon` quand la sienne sort de cette forme ;
- le repli sur le post-it du lot 1 joue quand il n'y a aucun fil ;
- la route reste sous 3 s : `EXPLAIN ANALYZE` sous RLS sur 10 000 sources et 500 fils, chiffre noté dans la PR.

**Tests :**
- `render-context.test.ts` :
  - une branche piégée (« ignore-previous-instructions-$(curl…) ») est réduite ;
  - aucun titre de PR ni de session ;
  - fil sans branche : « fil du JJ/MM » ;
  - consigne mot pour mot, avec et sans l'usage `lecture`, avec le lanceur et avec `pnpm --dir` ;
  - chaque ligne porte l'id que `fil` accepte ;
  - budget en octets ;
  - repli ;
- `start-context.db.test.ts` : branche courante d'abord ; fil d'un collègue absent ;
- `context-routes.db.test.ts` : une `commande` de plus de 200 octets, avec un saut de ligne ou avec `<`, rend 400 ;
- `strip-leon-blocks.test.ts` : la consigne est retirée à la recapture.

### T47 · L'installateur : l'usage `lecture`

> **Amendé le 05/11 (A16) :**
> - `lecture` est coché par défaut. Dans un terminal interactif, la question est `[Y/n]` : Entrée l'accepte. Interactif veut dire `process.stdin.isTTY` : le script d'installation lance `setup` avec `< /dev/tty`, il le reste. Hors terminal, aucune réponse lue ne donne un usage, même « y » : `echo | leon setup` et `yes '' | leon setup` n'en ajoutent aucun. Sur main, `ask` (`createAsker`) lit l'entrée standard même hors terminal, et rend `''` quand elle se ferme, comme pour Entrée : il rend désormais `null` à la fermeture, qui n'accepte rien. La réponse gardée d'`echo oui | pnpm leon <commande>` vaut toujours pour l'accord de base (version 2), jamais pour un usage ;
> - quand un agent installe (`--yes`), il se donne par sa case de la page « Autoriser » (T64). `--oui` et `--yes` n'ajoutent toujours aucun usage d'eux-mêmes (D30) ;
> - un refus s'écrit daté dans `refus` (C7) : l'usage n'est plus proposé, ni dans le terminal ni sur la page, jusqu'au retrait. Les usages proposés un à un sont donc les manquants jamais refusés ;
> - fichiers en plus : `src/cli/leon.ts` (`createAsker`), le type de `SetupDeps.ask` (`src/cli/setup.ts`) et celui de l'`ask` d'`installHooks` (`string | null`) ;
> - tests de plus : `install-hooks.test.ts` : proposé en `[Y/n]`, Entrée sur un terminal l'accepte ; fermeture (`null`) : rien n'est ajouté ; hors terminal, `''` et `'y'` n'ajoutent rien ; un refus est écrit daté et n'est plus proposé ; un usage tranché sur la page n'est pas redemandé ; `setup.test.ts` : `echo | leon setup` et `printf 'y\n' | leon setup` n'ajoutent aucun usage ; `uninstall-hooks.test.ts` : le retrait efface aussi `refus`.

> **Amendé le 05/11 (relecture, D24, D30) :** `lecture` porte aussi ce qui est poussé au démarrage. Son texte dit donc en plus qu'au démarrage, Leon place dans le contexte de l'agent le sommaire des fils de ce dépôt et les leçons que tu as acceptées, et que le fournisseur du modèle les voit. Les leçons n'arrivent qu'au lot 13 (T56) : le texte les nomme dès le lot 12, pour ne pas redemander l'accord (choix du rédacteur). Il dit toujours qu'un accord `lecture` ne permet pas d'écrire. Les tests mot pour mot suivent : `install-hooks.test.ts` ici, `en.json` et la page « Autoriser » à T64.

**Fichiers :** `src/cli/consent.ts` (C7 révisé), `src/cli/install-hooks.ts`, `src/cli/setup.ts` (S10 du plan de la CLI sans clone), `src/cli/uninstall-hooks.ts`, `README.md`.

**Fait quand :**
- l'usage `lecture` s'ajoute à la structure par usage livrée au lot 6 (T24 amendé) ;
- si les crochets sont en place et l'accord en version 2, l'installateur propose les usages manquants un à un, sans toucher à `settings.json` ;
- l'installateur et `leon setup` proposent l'usage `lecture` avec son texte, en anglais, testé mot pour mot. Ce texte dit que l'agent de l'outil peut lire, par les commandes de Leon, les fils et la mémoire de ce dépôt, et que le fournisseur de son modèle voit ce qu'il lit ;
- un refus ne change rien ; `--oui` et `--yes` n'ajoutent pas d'usage ;
- le retrait efface les usages.

**Tests :**
- `consent.test.ts` : `lecture` ajouté, daté ;
- `install-hooks.test.ts` : texte exact ; refus : rien ne change ; `--oui` sans usage ; crochets en place, accord 2, aucun usage : `lecture` proposé, plus de « nothing to do » ;
- `setup.test.ts` : `--yes` n'ajoute aucun usage ;
- `uninstall-hooks.test.ts`.

### T64 · Les usages sur la page « Autoriser » (après T47)

Tranché le 05/11 (A16, D30). Quand un agent installe Leon (`--yes`, « Je demande à Claude »), les usages cochés par défaut s'affichent, cochés, sur la page « Autoriser » du navigateur. C'est l'humain qui clique. La tâche pose le mécanisme avec la case `lecture` ; T49 ajoute `rappel`, T57 `noter`. Effort : 1,5 j (estimation du rédacteur, à confirmer).

Le chemin sur main : `leon login` (`src/cli/login.ts`) ouvre `/ordinateur/autoriser?port&etat&empreinte`. « Autoriser » signe un code (`authorizeComputerAction`, `signComputerCode`) et renvoie le navigateur vers `http://127.0.0.1:<port>/retour?code&etat`. La CLI échange le code contre l'enregistrement de son jeton (`POST /api/v1/ordinateurs`, `computer-routes.ts`), puis écrit `connexion.json`. `leon setup` lance `leon login` avant de poser les crochets (`installHooks`). Les usages suivent ce chemin (C16).

**Fichiers :**
- `src/server/auth/computer-authorize.ts` (`parseAuthorizeParams`, `authorizeQuery` et `pathAfterSignIn` gardent le paramètre `usages`, K3) et `computer-authorize.test.ts` ;
- `src/app/(auth)/ordinateur/autoriser/page.tsx` (les cases demandées, cochées, avec leur texte), `actions.ts` (les cases montrées et cochées dans le code), et leurs tests ;
- `messages/fr.json`, `messages/en.json` : `computer.authorize` (les cases et leurs textes) ; la documentation : `site.documentation.authorize` (la page et ses cases), `site.documentation.sent` (« Ce qui part », les usages et leurs textes), dont `sent.lead`, qui dit aujourd'hui qu'on accepte « en lui disant d'utiliser --yes » ; `claudeCode.instructions` et `claudeCode.withClaudeLead` (« Je demande à Claude », onboarding), qui disent que les cases sont à l'utilisateur et que l'agent ne clique pas à sa place ;
- `src/components/site/pages/documentation.tsx`, et `src/components/site/pages/documentation-markdown.ts`, qui liste en dur les clés de `sent` (`where`, `end`, `secrets`, `start`) : une clé nouvelle s'y ajoute ;
- `src/server/auth/computer-code.ts` (la charge gagne `m` et `g`) et son test ;
- `src/server/api/computer-routes.ts` (la 201 rend `usages` et `refus`) et `computer-routes.db.test.ts` ;
- `src/capture/api-contract.ts` (`ComputerResponseSchema` gagne `usages` et `refus`, facultatifs, en `string[]`) ;
- `src/cli/login.ts` (le paramètre `usages` dans l'adresse ; rend usages et refus à son appelant, valeurs connues seulement ; `--with-token` note `par`) et `login.test.ts`, `src/cli/connection.ts` (`par`, K2), `src/cli/leon.ts` ;
- `src/cli/setup.ts` (lit les outils et `accord.json` avant `leon login`, pour savoir quelles cases demander ; `SetupDeps.login` prend ces usages et rend usages et refus ; avec `--yes`, relance `leon login` quand il en manque, sauf après `--with-token`) et `setup.test.ts` ;
- `src/cli/install-hooks.ts` et `src/cli/consent.ts` (écrire les usages et les refus donnés par la page ; `[Y/n]` pour les usages cochés par défaut) ;
- `src/test/contracts/api-contract.db.test.ts`.

**Fait quand :**
- la page ne montre que les cases demandées par le paramètre `usages`, valeurs connues à ce lot, chacune cochée (`defaultChecked`), avec son texte, au-dessus d'« Autoriser ». Sans le paramètre, aucune case : `leon login` seul et une CLI d'avant T64 n'en voient pas ;
- le paramètre survit à la connexion : sans session, la page renvoie vers la connexion avec les quatre paramètres, et revient avec eux ;
- l'action revalide le paramètre et met dans la charge signée les cases montrées (`m`) et cochées (`g`), valeurs connues seulement. Jamais en paramètre à part de l'adresse de retour ; dans la charge du code, qui y passe, elles sont lisibles mais non modifiables. « Annuler » ne signe rien ;
- `POST /api/v1/ordinateurs` rend `usages` et `refus` dans sa 201 (C16) ;
- `leon setup` ne met dans le paramètre que les usages cochés par défaut qui manquent et n'ont jamais été refusés, pour les outils de ce passage. `leon login` lui rend usages et refus, qu'il passe à `installHooks`. Les deux s'écrivent dans `accord.json`, datés, pour chaque outil du passage auquel ils manquaient. Un usage tranché sur la page, coché ou non, n'est pas redemandé dans le même passage ;
- lancé seul, `leon login` ne demande aucune case et n'écrit rien dans `accord.json`. L'en-tête de `setup.ts` reste vrai : rien n'y touche hors de `installHooks`, et `rappel` ne s'écrit jamais sans que T49 pose son crochet ;
- la CLI lit `usages` et `refus` comme `string[]` et ignore une valeur qu'elle ne connaît pas, sans jamais en faire une erreur ;
- avec `--yes`, quand un outil à installer a un usage coché par défaut, manquant et jamais refusé, `leon setup` relance `leon login`, même sur un ordinateur connecté (choix du rédacteur) ; sans quoi l'ordinateur déjà connecté, cas de tous les utilisateurs actuels, n'aurait jamais les cases. Si cette relance échoue (annulée, refusée, délai passé), l'ancienne connexion reste et l'installation continue, sans usage de plus. Un refus étant gardé, le `setup --yes` suivant ne relance pas pour lui. `--yes` n'ajoute jamais un usage de lui-même (D30) ;
- une connexion faite par `--with-token` (`par` dans `connexion.json`) n'est pas relancée : `leon setup` dit seulement, sur la sortie, de lancer `leon setup` dans un terminal pour choisir les usages ;
- `--with-token` et un serveur ancien (201 sans `usages`) ne donnent ni usage ni refus : restent les questions du terminal ;
- dans un terminal interactif (`process.stdin.isTTY`), un usage coché par défaut, manquant et jamais refusé se propose en `[Y/n]` ; une entrée fermée n'accepte rien ; hors terminal, aucune réponse lue n'en donne (T47) ;
- les textes anglais des cases (`en.json`) sont ceux de l'installateur, mot pour mot.

**Tests :**
- `computer-authorize.test.ts` : `usages` validé, une valeur inconnue écartée ; `pathAfterSignIn` le garde ;
- `page.test.ts` : les cases demandées s'affichent cochées ; sans paramètre `usages`, aucune case ; sans session, la connexion garde les quatre paramètres ;
- `actions.test.ts` : une case montrée et décochée est dans `m`, pas dans `g` ; une valeur inconnue est écartée ; « Annuler » ne signe rien et ne porte aucun usage ;
- `computer-code.test.ts` : `m` et `g` sont signés ; un `g` retouché casse la signature ; un code sans eux se vérifie encore ;
- `computer-routes.db.test.ts` : la 201 rend les usages et les refus du code ;
- `login.test.ts` : usages et refus reviennent ; une 201 avec une valeur inconnue connecte quand même, et ne rend que les valeurs connues ; serveur ancien : aucun ; `--with-token` : aucun, et `par` est écrit ; seul, `leon login` n'ouvre aucune case et n'écrit rien dans `accord.json` ;
- `setup.test.ts` :
  - `--yes` sur un ordinateur non connecté : les usages cochés sur la page sont écrits, les décochés écrits en refus, aucun autre ;
  - `--yes` sur un ordinateur connecté auquel manque `lecture` : `leon login` est relancé avec `usages=lecture` ; avec tous les usages : il ne l'est pas ; une relance en échec garde la connexion, et les crochets sont posés sans usage ;
  - un refus sur la page n'entraîne pas de relance au `setup --yes` suivant ;
  - un usage décoché sur la page n'est pas redemandé dans le terminal du même passage ;
  - connexion par `--with-token` : pas de relance, une ligne sur la sortie ;
  - un faux `leon login` qui ne rend aucun usage : aucun usage ni refus n'est écrit ;
- `install-hooks.test.ts` : `[Y/n]`, Entrée sur un terminal accepte ; fermeture : rien ; hors terminal : rien ; un usage tranché par la page n'est pas redemandé ;
- contrats : les textes anglais des cases et ceux de l'installateur sont les mêmes ; la documentation Markdown porte les clés nouvelles de `sent` ; `api-contract.db.test.ts`.

## Lot 13 : le rappel à chaque message, les leçons et les notes de l'agent

Depuis le 04/11, ce lot porte aussi les leçons (T55, T56) et le brouillon de l'agent (T57). T48 ne change pas. Depuis le 05/11 (A16), T49 propose `rappel` coché par défaut, et T65 fait suivre `remember` au réglage `noter` du compte.

### T48 · La route `POST /api/v1/rappel`

> **Amendé le 04/11 (D21, D35) :** la recherche ne lit que les mots des sources encore visibles du lecteur, par une jointure sur `sources` sous RLS. Un fil absorbé (`absorbe_par`) n'est jamais cité. Tests de plus : une PR liée rendue privée (comme par 0048), et le rappel ne cite plus le fil sur ses mots ; un fil absorbé n'est jamais cité.

**Fichiers :**
- `src/capture/api-contract.ts` (C8, `API_PATHS.rappel`) ;
- `src/server/sessions/reminder.ts` (nouveau), `src/server/api/reminder-routes.ts` (nouveau), `src/server/api/app.ts` ;
- `src/server/db/migrations/NNNN-rappels-cites.sql` (nouveau : la table, sa RLS, la fonction de purge) ;
- `src/server/db/rls-coverage.db.test.ts`, `src/test/contracts/api-contract.db.test.ts`.

**Fait quand :** D26 et C8 sont respectés :
- recherche bornée aux fils de l'auteur et du projet, sans `searchPassages`, en `websearch_to_tsquery` ;
- ligne de clés balisée ;
- fils déjà cités rangés dans `rappels_cites`, purgés après 24 h par une fonction `security definer` lancée par pg-boss ;
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
- la console espionnée ne l'a pas reçu ;
- une ligne de plus de 24 h est purgée ;
- sans usage : aucune requête sur `sources` (requête espionnée) ;
- un faux fournisseur de vecteurs qui lève n'est jamais appelé.

Contrat : `api-contract.db.test.ts`.

### T49 · Le crochet de Claude Code

> **Amendé le 05/11 (A16) :** `rappel` est coché par défaut. Dans un terminal interactif (`process.stdin.isTTY`), la question est `[Y/n]` : Entrée l'accepte, une entrée fermée n'accepte rien, et hors terminal aucune réponse lue ne le donne (T47). Un refus s'écrit daté et n'est plus proposé (C7). Quand un agent installe (`--yes`), il se donne par sa case de la page « Autoriser », que T49 ajoute à T64. `--oui` et `--yes` n'ajoutent toujours aucun usage d'eux-mêmes (D30). Le crochet n'est posé qu'une fois l'usage donné, dans le terminal ou sur la page. Fichiers en plus : `src/app/(auth)/ordinateur/autoriser/page.tsx`, `messages/fr.json` et `messages/en.json` (la case `rappel` et son texte). Tests de plus : `install-hooks.test.ts` : proposé en `[Y/n]`, Entrée l'accepte ; entrée fermée : ni usage ni crochet ; `rappel` donné par la page : le crochet est posé ; `rappel` décoché sur la page : ni usage ni crochet, un refus écrit ; `page.test.ts` : la case `rappel`, cochée quand elle est demandée.

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
- le délai de bout en bout est mesuré sur 20 messages (serveur réel), médiane et pire cas notés dans la PR ; au-delà de 1 s, Amos est prévenu avant la fusion ;
- l'installateur propose l'usage `rappel` avec son texte, y compris quand les crochets sont déjà en place : le message part vers Leon seul, ni stocké ni journalisé. Le crochet n'est posé qu'une fois l'usage accepté, et le retrait l'enlève.

**Tests :**
- `reminder.test.ts` :
  - sans usage : aucune requête ;
  - serveur lent : vide en moins de 2 s ;
  - connexion refusée : vide ;
  - 404 : vide ;
  - `cursor_version` : garde ;
  - un faux secret est masqué et le message coupé à 2 000 caractères dans la requête envoyée ;
- `install-hooks.test.ts` :
  - texte exact ;
  - refus de l'usage : pas de crochet de prompt ;
  - `--oui` sans l'usage : pas de crochet ;
- `uninstall-hooks.test.ts` ;
- contrat : `hook-commands.contrat.test.ts`.

### T55 · Les leçons : la table, la section Mémoire du site, `leon lecons` et l'outil `lecons`

> **Amendé le 05/11 (A15, D33, D37) :**
> - **L'historique sur le site.** La section « Mémoire » montre aussi les fils de l'auteur, absorbés compris (D21). Pour chaque fil et chaque leçon, elle montre ses versions lisibles (n, date, qui, motif), par la lecture commune (`listVersions`, D33), et ouvre le texte d'une version lisible, sous la règle de lecture de D33. Un bouton « Remettre cette version », réservé à l'auteur, appelle `restoreVersion` : une nouvelle version, `ecrit_par = humain`, en compare-and-set. Rien n'est effacé. C'est le seul lieu de restauration (C12). T57 y ajoute les notes.
> - **La connexion récente.** Écrire ou corriger une leçon, et remettre une version, exigent une connexion de moins d'une heure (D37). Sinon l'action rend « reconnexion » sans rien écrire. Le site redemande la connexion, puis ramène à la section Mémoire. Pour l'instant par mot de passe, avec la 2FA si elle est active ; Google, GitHub et Microsoft une fois la connexion sociale fusionnée, avec la reconnexion forcée de D37, et le retour vers la section Mémoire vaut aussi pour eux. T61 reprend le même contrôle pour accepter une leçon.
>   - Better Auth (1.7.7) a déjà une notion de session fraîche : l'option `session.freshAge`, 24 h par défaut, que `src/server/auth/auth.ts` ne règle pas. Son `freshSessionMiddleware` compare l'heure à `session.createdAt`, mais seulement sur `/list-sessions` et `/unlink-account`, que Leon n'appelle pas. `/delete-user` fait son propre contrôle, et Leon ne s'en sert pas : sa suppression est dans `delete-account.ts`. Nos gestes sont des actions serveur : le contrôle lit le même champ, `session.session.createdAt` de `getSession()`. On ne baisse pas `freshAge`, qui changerait ces routes.
>   - Le rafraîchissement de la session (`updateAge`) ne touche que `expiresAt` et `updatedAt` : `createdAt` reste l'heure de la connexion.
>   - « Une session du site seulement » tient parce que `auth.ts` n'a pas le plugin `bearer` : `getSession()` ne lit que le cookie, et un jeton ne peut pas appeler une action serveur. Un test de contrat le garde.
> - **Fichiers en plus :** `src/server/auth/session.ts` (`signedInRecently`) et `src/server/auth/session.test.ts` ; `src/server/auth/computer-authorize.ts` (`pathAfterSignIn` accepte le retour vers la section Mémoire) et son test ; `src/app/(auth)/connexion/page.tsx` (qui ne bâtit `returnTo` aujourd'hui que depuis une autorisation d'ordinateur), `src/app/(auth)/actions.ts` (la redirection, lignes 108 et 135) et `src/app/(auth)/actions.test.ts` ; `src/server/auth/auth.ts`, `src/server/memory/versions.ts` et `src/server/sessions/thread-read.ts` (lus).
> - **Tests en plus :**
>   - `session.test.ts` : une session créée il y a 59 min passe ; à 61 min, refus ; une session ancienne mais rafraîchie (`updatedAt` récent) est refusée ;
>   - `actions.test.ts` : écrire, corriger une leçon ou remettre une version avec une session de plus d'une heure donne « reconnexion », et rien n'est écrit ; remettre v1 d'un fil après v3 donne v4, `ecrit_par = humain`, et v2 et v3 restent ; la version d'un collègue est introuvable ; depuis une version dépassée, « modifiée entre-temps » ; l'historique d'un fil absorbé se lit sur le site ; le texte d'une version lisible s'ouvre, celui d'une version illisible non ;
>   - `computer-authorize.test.ts` : le retour vers la section Mémoire est accepté, un retour vers un autre site est refusé ;
>   - `src/app/(auth)/actions.test.ts` : une connexion lancée depuis la section Mémoire y revient ; un `retour` inconnu mène à l'accueil ;
>   - contrat : la configuration de Better Auth n'a pas le plugin `bearer`.

**Fichiers :**
- `src/server/db/migrations/NNNN-lecons.sql` (nouveau : `lecons`, ses clés étrangères, ses droits et sa RLS ; `versions_memoire` gagne `lecon_id` et le check « une seule cible » ; le check de `read_log.tool` gagne `lecons`, et `read_log` gagne `lecon_id`, C13) et son test db ;
- `src/server/db/schema/memory.ts`, `src/server/memory/read-log.ts` (`recordReads` accepte une leçon) ;
- `src/server/memory/lessons.ts` (nouveau : écrire, corriger, retirer, lister dans l'ordre de D37) et `src/server/memory/lessons.db.test.ts` (nouveau) ;
- `src/app/(app)/reglages/actions.ts` et son test, `src/components/verre/reglages/memoire.tsx` (nouveau), `src/components/verre/reglages/settings-tabs.tsx` ;
- `src/capture/api-contract.ts` (C13), `src/server/api/read-routes.ts` (`POST /api/v1/lecons`), `src/cli/read-commands.ts`, `src/cli/leon.ts` (`lecons`) ;
- `src/server/mcp/tools/lessons-tool.ts` (nouveau), `src/server/mcp/server.ts`, `src/test/contracts/mcp-descriptions.test.ts` ;
- `src/server/auth/delete-account.ts`, `src/server/db/rls-coverage.db.test.ts`, `src/test/contracts/api-contract.db.test.ts`.

**Fait quand :**
- `lecons` suit C13 ;
- les réglages gagnent une section « Mémoire », en français : écrire une leçon (300 caractères, dépôt facultatif), la corriger (une nouvelle version), la retirer, voir ses versions, en restaurer une ;
- ces gestes passent par la session du navigateur seulement : aucune route à jeton ni aucun outil MCP n'écrit, ne corrige, ne retire ni ne restaure une leçon. Aucune route à jeton ne restaure (T54) ;
- depuis le 05/11 : écrire ou corriger une leçon, et remettre une version, exigent une connexion de moins d'une heure (`signedInRecently`) ; la section Mémoire montre les fils, absorbés compris, et leurs versions ;
- le texte d'une leçon passe par `maskSecrets` à l'écriture (D37) ;
- une correction est un compare-and-set (D34) : un second onglet resté sur une ancienne version reçoit « modifiée entre-temps » ;
- `leon lecons` liste les leçons lisibles et non retirées, du dépôt d'abord, puis les plus fréquentes, puis les plus récentes ; `leon lecons <id>` en lit une ; l'outil MCP `lecons`, borné au projet, fait de même ;
- le rendu est gardé (D25) ; chaque lecture est notée (`recordReads`, outil `lecons`, par `lecon_id`) ;
- la suppression du compte efface les leçons et leurs versions.

**Tests :**
- test db de la migration :
  - la leçon d'un collègue est introuvable ;
  - une ACL élargie est refusée ;
  - une version a exactement une cible ;
  - une ligne de `read_log` a exactement une cible ;
- `lessons.db.test.ts` :
  - l'ordre de D37 ;
  - une leçon retirée sort des listes, et ses versions restent ;
  - deux corrections depuis la même version : une seule passe ;
  - un faux secret dans une leçon est masqué en base et dans le bloc ;
  - `leon lecons` laisse une ligne de journal ;
- `actions.test.ts` : écrire, corriger, retirer, restaurer ;
- `read-routes.db.test.ts` : sans usage `lecture`, refus ; aucune écriture ni restauration possible par jeton ;
- `mcp.db.test.ts` : l'outil `lecons` ne fait que lire ; une leçon d'un autre dépôt est introuvable ; un texte piégé reste échappé ;
- `delete-account.db.test.ts` : plus aucune leçon ; `deleteOrganization` d'une organisation qui a des leçons et des versions passe, et ne laisse aucune ligne ;
- contrats : `api-contract.db.test.ts`, `mcp-descriptions.test.ts`, `rls-coverage.db.test.ts`.

### T56 · Les leçons au démarrage (après T46 et T55)

**Fichiers :** `src/server/sessions/start-context.ts`, `src/server/sessions/render-context.ts`, `src/capture/strip-leon-blocks.ts` et leurs tests.

**Fait quand :**
- le bloc suit D37 : le sommaire des fils et l'équipe, puis les leçons, puis la consigne, puis le point du matin, en 8 000 octets. Les leçons n'ont pas de chiffre fixe (tranché le 05/11) : elles prennent toute la place que le sommaire laisse. La place de la consigne, de l'en-tête des leçons, de la ligne « N autres leçons » et de la balise fermante est réservée avant de remplir (tranché le 05/11, A16) : ils passent toujours, et les leçons prennent le reste. Le point du matin ne prend que ce qui reste après elles, et peut ne plus avoir de place ;
- les leçons sont celles du dépôt et sans dépôt, non retirées, dont la dernière version est lisible (D33) ; celles du dépôt d'abord, puis les plus fréquentes, puis les plus récentes ;
- chacune tient sur une ligne, échappée, avec « acceptée par toi le JJ/MM », coupée à la leçon entière ; puis « N autres leçons : <commande> lecons » s'il en reste, avec la commande de C3 (`commande`) ;
- la ligne d'en-tête dit qu'elles ont été acceptées par toi, et qu'elles restent des données à vérifier contre le code ;
- elles figurent avec ou sans fil, y compris avec le post-it du lot 1. Amendé le 05/11 (relecture, D37) : seulement avec l'usage `lecture` de l'outil. Sans lui, la route ne lit aucune leçon, et la place réservée de D37 n'existe pas, hormis celle de la phrase de `leon noter` avec l'usage `noter` (T57) : le bloc reste celui de main (T46) ;
- ni modèle ni vecteur ; la route reste sous 3 s (la mesure de T46 refaite avec 200 leçons, chiffre noté dans la PR).

**Tests :**
- `render-context.test.ts` :
  - l'ordre ;
  - les leçons prennent la place que le sommaire laisse : un sommaire court leur en laisse plus, un sommaire plein moins ; accents comptés en octets, coupe à la leçon entière, « N autres leçons » avec le lanceur et avec `pnpm --dir` ;
  - une leçon piégée reste échappée ;
  - le point du matin prend ce qui reste après les leçons, coupé à une ligne entière ;
  - beaucoup de leçons : plus aucune ligne du point du matin, la consigne entière, l'en-tête des leçons et la ligne « N autres leçons » présents, et le bloc tient en 8 000 octets ;
  - le pire cas (amendé le 05/11, A16) : sommaire et équipe pleins (3 500 et 700 octets), `commande` à 200 octets, session à 200 caractères, avec l'usage `noter`, et beaucoup de leçons. La consigne entière, l'en-tête des leçons et la ligne « N autres leçons » sont présents, et le bloc tient en 8 000 octets ;
  - sans l'usage `lecture` (amendé le 05/11, relecture) : des fils et des leçons acceptées, et ni sommaire, ni leçons, ni en-tête des leçons, ni ligne « N autres leçons », ni consigne de lecture. Le bloc est celui de main : « mes sessions », l'équipe, le point du matin ;
- `start-context.db.test.ts` :
  - la leçon d'un collègue est absente ;
  - une leçon d'un autre dépôt est absente ;
  - une leçon dont une preuve est devenue privée est absente ;
  - une leçon retirée est absente ;
- `strip-leon-blocks.test.ts` : les leçons sont retirées à la recapture.

### T57 · `leon noter` et `remember` : le brouillon de l'agent

**Fichiers :**
- `src/server/memory/notes.ts` (nouveau : `writeNote`, le chemin commun) et `src/server/memory/notes.db.test.ts` (nouveau), `src/server/memory/versions.ts` (`restoreVersion` d'une note passe par `writeNote`) ;
- `src/server/mcp/tools/remember-tool.ts`, `src/server/mcp/server.ts` (`registerRememberTool` reçoit `client`) ;
- `src/capture/api-contract.ts` (C14, `outil` de C3), `src/server/api/notes-routes.ts` (nouveau, `POST /api/v1/noter`), `src/server/api/app.ts`, `src/server/api/context-routes.ts` (`outil` de C3) ;
- `src/capture/turn.ts` et `src/server/api/ingest-routes.ts` (la route d'ingestion refuse `mcp_remember`, C14) ;
- `src/cli/note-command.ts` (nouveau), `src/cli/leon.ts` (`noter`), `src/cli/briefing.ts` (envoie `outil` dans C3) ;
- `src/lib/labels.ts` (« Note ») ;
- `src/server/sessions/render-context.ts` (une phrase de la consigne), `src/cli/consent.ts`, `src/cli/install-hooks.ts` et `src/cli/setup.ts` (l'usage `noter` et son texte, D30) ;
- `src/app/(auth)/ordinateur/autoriser/page.tsx`, `messages/fr.json` et `messages/en.json` (la case `noter` de T64 et son texte, depuis le 05/11) ;
- `src/components/verre/reglages/memoire.tsx` et `src/app/(app)/reglages/actions.ts` (les notes, leurs versions et leur restauration sur le site) ;
- `src/server/db/migrations/NNNN-supprimer-notes.sql` (nouveau : `supprimer_notes_du_compte()`, `security definer`, `pg_temp` en dernier, bornée au kind `mcp_remember`, au tenant et à l'auteur courants), `src/server/auth/delete-account.ts` ;
- `src/test/contracts/api-contract.db.test.ts`, `src/test/contracts/mcp-descriptions.test.ts`.

**Fait quand :**
- `leon noter "<texte>"` et `remember` passent par `writeNote` : une source `mcp_remember` privée, avec `metadata.outil`, `metadata.session` quand elle est connue, et `metadata.project` pour `leon noter` ; v1 dans `versions_memoire`, `ecrit_par = agent`. `metadata.outil` est un kind de `CODE_SESSION_KINDS` (la route) ou `mcp:<libellé>` (`remember`), validé par `writeNote` ;
- `--note <id> --version <n>` (et `note`, `version` de `remember`) écrit la version suivante en compare-and-set : dans la même transaction, le tour indexé prend le nouveau texte, ses passages sont supprimés et l'indexation est mise en file. Une version dépassée, ou une dernière version écrite par un autre outil, donne 409. Après une restauration du site (`humain`), on compare à l'outil de la note (`metadata.outil`, D38) ;
- `restoreVersion` sur une note passe par `writeNote` : dans la même transaction, le tour prend le texte restauré, ses passages sont supprimés et l'indexation est mise en file ;
- une note sans version (écrite avant ce lot) reçoit sa v1, depuis le texte de son tour, à sa première nouvelle version ou restauration ;
- la section « Mémoire » du site liste les notes de l'auteur, avec leurs versions, et en remet une (« Remettre cette version », `ecrit_par = humain`), avec la connexion récente de T55. C'est le seul lieu de restauration (tranché le 05/11). Après une restauration, l'outil de la note (`metadata.outil`) écrit encore la version suivante (D38) ;
- la route d'ingestion refuse le kind `mcp_remember` : `writeNote` est le seul chemin qui crée une note ;
- la note n'entre jamais dans le bloc ni dans le rappel, et n'est jamais preuve d'une `[décision]` (D36) ;
- elle est reliée à un fil par proximité (D22, T42) ;
- avec l'usage `noter`, la consigne gagne une phrase : pour garder une note privée, la commande `leon noter`, avec l'outil et la session déjà remplis (C3 `outil`). Amendé le 05/11 (relecture, D24) : cette phrase suit `noter`, pas `lecture`. Sans `lecture`, il n'y a pas de consigne de lecture, mais la phrase reste seule dans le bloc de main, avant le point du matin, à place réservée et bornée (C3 `commande`, la session, D37) ;
- l'installateur et `leon setup` proposent l'usage `noter` (tranché le 05/11), déjà coché par défaut, comme `lecture` et `rappel` (A16) ; l'utilisateur peut le décocher. Dans un terminal interactif, Entrée l'accepte (`[Y/n]`) ; quand un agent installe, il se donne par sa case de la page « Autoriser », que T57 ajoute à T64 ; sans terminal, ou avec `--oui` et `--yes`, la CLI ne l'ajoute jamais d'elle-même (D30). Il a son propre texte (D30) : l'agent peut écrire des notes privées par Leon, et le décocher coupe aussi `remember` dans tous les assistants branchés à cet espace (T65). En anglais, testé mot pour mot. Le texte de `lecture` (T47) ne change pas. Amendé le 05/11 (relecture) : il ne change pas à l'ajout de `noter`. Il dit déjà le sommaire et les leçons poussés au démarrage (T47 amendée), et un accord `lecture` ne permet toujours jamais d'écrire. T57 ajoute `noter` aux usages connus du serveur ;
- la suppression du compte efface les notes et leurs versions (proposé, A12) ;
- `leon noter` écrit l'id et le numéro sur la sortie standard, rien sur le disque ; un 404 donne un message fixe sur la sortie d'erreur et le code 0.

**Tests :**
- `notes.db.test.ts` :
  - la note est privée à son auteur ;
  - l'outil et la session sont rangés ;
  - deux v2 depuis v1 : une seule passe ;
  - après v2, ni `searchPassages` ni `fetchSource` ne rendent v1 ;
  - après une restauration de v1 depuis v2, ni `searchPassages` ni `fetchSource` ne rendent plus v2 ;
  - une note sans version reçoit sa v1 depuis son tour ;
  - après une restauration sur le site (`ecrit_par = humain`), le même outil écrit la version suivante, et un autre outil reçoit 409 ;
- le test de `remember` : le client est rangé en `mcp:<libellé>` ; `remember` venu de claude.ai est accepté ; `remember` avec l'id d'une note `leon noter` est refusé, et la note garde sa version ; `leon_fil` reste refusé ;
- `notes-routes.db.test.ts` : 401, 400, 413 ; sans usage `noter`, refus, même avec `lecture` ; 409 ;
- `ingest-routes.db.test.ts` : `kind: mcp_remember` rend 400 ;
- `note-command.test.ts` : serveur ancien (404), code 0 ; rien sur le disque ;
- `thread-state.test.ts` : une note citée comme preuve, la décision est retirée ;
- `render-context.test.ts` : la consigne mot pour mot, avec et sans l'usage `noter` ; amendé le 05/11 (relecture) : sans `lecture`, avec `noter`, la phrase de `leon noter` seule, mot pour mot, avant le point du matin, sans sommaire, ni leçons, ni consigne de lecture ; avec `commande` à 200 octets, session à 200 caractères et un point du matin long, elle passe entière et le bloc tient en 8 000 octets ;
- `actions.test.ts` : remettre une note sur le site ; avec une session de plus d'une heure, « reconnexion » et rien d'écrit ;
- `install-hooks.test.ts` : le texte exact de `noter` ; proposé coché, Entrée l'accepte dans un terminal interactif, et un refus ne l'ajoute pas ; sans terminal, il n'est pas ajouté ; `--oui` ne l'ajoute pas ;
- `setup.test.ts` : `--yes` n'ajoute pas `noter` de lui-même ; `noter` coché sur la page est écrit ;
- `page.test.ts` : la case `noter`, cochée quand elle est demandée ;
- `delete-account.db.test.ts` : plus aucune note ni version ;
- contrats : `api-contract.db.test.ts`, `mcp-descriptions.test.ts`.

### T65 · `remember` suit le réglage `noter` du compte (après T57 et T64)

Tranché le 05/11 (A16, D30, C16). Décocher `noter` bloque aussi `remember` au MCP. Effort : 1 j (estimation du rédacteur, à confirmer).

Le chemin sur main : `/api/mcp` (`mcp-routes.ts`) passe par `apiTokenGuard({ assistant: true })`, qui accepte un jeton d'ordinateur, manuel ou d'assistant (OAuth du MCP distant, #130). Il donne `ctx` (tenant, utilisateur) et le libellé du client à `createLeonMcpServer`. Aucun usage du poste n'y arrive. Le réglage vit donc sur le compte, et `remember` le lit avec `ctx`.

**Fichiers :**
- `src/server/db/migrations/NNNN-noter-refuse.sql` (nouveau : `member` gagne `"noterRefuseLe" timestamptz`, nulle par défaut, comme `onboardedAt` en 0043) et son test db ; `src/server/db/schema/auth.ts` (`members.noterRefuseLe`) ;
- `src/server/auth/members.ts` (lire et écrire le réglage, bornés à la ligne de `ctx`, comme `onboarding.ts`) ;
- `src/server/mcp/tools/remember-tool.ts` (la lecture avant d'écrire), `src/server/mcp/mcp.db.test.ts`, `src/test/contracts/mcp-descriptions.test.ts` ;
- `src/server/api/computer-routes.ts` (la colonne écrite d'après `m` et `g`, une fois le jeton enregistré ; `POST /api/v1/usages`, à côté de `/ordinateurs` et `/jeton`, choix du rédacteur) et `computer-routes.db.test.ts` ; `src/capture/api-contract.ts` (C16, `API_PATHS.usages`) ;
- `src/app/(auth)/ordinateur/autoriser/page.tsx` (la case `noter` décochée quand la colonne est datée) et son test ;
- `src/components/verre/reglages/memoire.tsx` et `src/app/(app)/reglages/actions.ts` (le réglage montré et changé, sous la session du navigateur), `messages/fr.json` et `messages/en.json` (son texte) ;
- `src/cli/install-hooks.ts` (un « non » à `noter` dans le terminal appelle C16 ; un « oui » donne une ligne fixe) et son test ;
- `src/test/contracts/api-contract.db.test.ts` (`SERVED`).

**Fait quand :**
- `member."noterRefuseLe"` est nulle par défaut : les comptes déjà là, et tout compte qui n'a jamais installé la CLI (claude.ai, ChatGPT), gardent `remember` ;
- `remember` lit, avant d'écrire, la colonne de la ligne `member` du porteur (tenant et utilisateur de `ctx`), que le jeton soit d'un ordinateur, manuel ou d'un assistant. Nulle : il écrit par `writeNote` (T57). Datée : il rend `isError`, sans rien écrire, avec un message fixe en anglais : les notes sont coupées pour ce compte, et se rouvrent dans la section Mémoire des réglages du site. Il ne recopie pas le texte reçu ;
- l'outil `remember` reste dans la liste des outils, et `MCP_INSTRUCTIONS` ne change pas ;
- `POST /api/v1/ordinateurs`, une fois le jeton enregistré, écrit la colonne d'après la charge du code, sur la ligne de `claims.u` et `claims.t` : `noter` dans `g`, nulle ; dans `m` sans `g`, datée ; hors de `m`, inchangée. Un 401 ou un 409 n'y touche pas. L'action de la page ne l'écrit pas : un échange qui échoue (code expiré, 409, CLI fermée, délai passé) ne change rien ;
- la page « Autoriser » montre la case `noter` décochée quand la colonne est datée ;
- dans un terminal interactif, un « non » à `noter` appelle `POST /api/v1/usages { noter: false }` (C16), qui date la colonne. Un « oui » ne la rouvre pas : la route n'accepte qu'un refus. L'installateur dit alors, en une ligne fixe, que des notes coupées pour le compte se rouvrent dans la section Mémoire du site. Un serveur ancien (404) ou muet : un message fixe sur la sortie d'erreur, et l'installation continue ;
- la section Mémoire du site montre le réglage (« les assistants branchés à cet espace peuvent écrire des notes par `remember` ») et le change, sous la session du navigateur, comme l'interrupteur du rêve (choix du rédacteur) ;
- `POST /api/v1/noter` ne lit pas la colonne : `leon noter` suit l'usage `noter` de l'outil (C14) ;
- le retrait des crochets (`leon retirer-crochets`) ne touche pas la colonne (choix du rédacteur) : il retire l'accord du poste, pas celui du connecteur.

**Tests :**
- test db de la migration : la colonne est nulle pour un membre déjà là et pour un membre neuf ;
- `mcp.db.test.ts` :
  - sans réglage, `remember` écrit, avec un jeton d'assistant comme avec un jeton d'ordinateur ;
  - colonne datée : `isError`, aucune source ni version créée, le message dit où rouvrir et ne recopie pas le texte ;
  - remise à nul : il écrit de nouveau ;
  - la colonne d'un collègue, ou la sienne dans un autre espace, ne compte pas ;
- `computer-routes.db.test.ts` :
  - `noter` montré et coché : nulle ; montré et décoché : datée ; non montré : inchangée ; 409 et 401 : inchangée ;
  - `POST /api/v1/usages` : `{ noter: false }` rend 204 et date la colonne ; `{ noter: true }` rend 400 et ne la touche pas ; 401 sans jeton et avec un jeton d'assistant ; 400 hors schéma (`.strict()`) ; 413 ;
- `page.test.ts` de la page « Autoriser » : colonne datée, la case `noter` décochée ;
- `actions.test.ts` des réglages : le réglage se coupe et se rouvre sous la session du navigateur ; sans session, rien ne change ;
- `install-hooks.test.ts` : un « non » appelle C16 avec `false` ; un « oui » ne l'appelle pas et donne la ligne fixe ; un 404 n'arrête pas l'installation ;
- contrats : `api-contract.db.test.ts`, `mcp-descriptions.test.ts`.

## Lot 14 : la capture complète

### T50 · L'essai : la forme du raisonnement et des sous-agents (porte)

**Fait quand :** sur une session de test créée pour l'occasion (un dépôt jetable, une tâche qui lance un sous-agent), on relève dans le transcript :
- si les blocs de raisonnement portent leur texte, selon le modèle et la version de Claude Code ;
- où vivent les échanges des sous-agents : lignes isSidechain du même fichier, ou fichiers à part ;
- la forme d'une consigne et d'un rapport de sous-agent ;
- amendé le 05/11 (relecture) : si les appels d'outils des sous-agents ont la forme de ceux de la session (`tool_use`, `tool_result`), que `session-facts.ts` lit déjà.

Le résultat est noté dans une annexe de l'étude. Aucune vraie conversation n'est lue.

### T52 · La CLI relève les coulisses (après T51 : le serveur avant la CLI)

> **Amendé le 05/11 (relecture, D29, C10) :** `extractBackstage` relève aussi chaque appel d'outil de la session, et ceux des sous-agents dont T50 trouve les échanges, en blocs `appel_outil` (C10).
> - Il reprend deux réductions de `session-facts.ts`, exportées pour lui : `reduceCommand` et `repoRelativePath`. La réduction du nom de l'outil n'existe pas sur main : T52 l'écrit, dans la forme de C10 (`mcp__` testé avant `EXECUTABLE`), et l'exporte, comme `recheckCommand`, pour la revérification du serveur (T51) et pour T58, qui la reprend pour `outils_en_erreur`. Son nom est un choix du rédacteur (`reduceToolName`).
> - Il lit le statut dans le `tool_result` de l'appel, jamais son contenu. Les blocs `appel_outil` comptent dans les 256 Kio de l'envoi, comme les autres.
> - Pour Codex, Cursor et Antigravity, chaque lot relève les appels de son outil dans la même forme, selon la forme relevée à son essai (T15, T26, T31). Un appel de forme inconnue n'est pas envoyé (D29).
> - Effort : 0,5 j de plus pour le lot 14 (estimation du rédacteur, à confirmer).
> - Fichiers en plus : `src/capture/session-facts.ts` (`reduceCommand` et `repoRelativePath` exportées, `reduceToolName` nouvelle et exportée) et son test, et `src/capture/api-contract.ts` (C10).
> - Tests de plus, dans `session-backstage.test.ts`, sur la fixture inventée :
>   - `Bash` avec `curl -u a:X https://exemple.test` donne `curl`, et `PGPASSWORD=X psql -h base` donne `psql` ;
>   - un `Edit` hors du dépôt n'a pas de cible ; un `Grep` ne porte pas son motif ; un `WebFetch` ne porte pas son URL ;
>   - un `mcp__x__y` donne `mcp:x`, et `mcp__x` donne `[outil]` ; dans `session-facts.test.ts`, `reduceToolName` rend `mcp:linear` pour `mcp__linear__get_issue`, laisse `mcp:linear` tel quel, et rend `[outil]` pour un nom hors forme ;
>   - un appel sans `tool_result` est `sans_resultat`, un `is_error` est `erreur` ;
>   - une chaîne témoin placée dans la sortie d'un `tool_result` et dans un argument n'apparaît nulle part dans l'envoi ;
>   - un appel d'un sous-agent est relevé dans la même forme ;
> - et dans `capture-session.test.ts` : sans l'usage `coulisses`, aucun appel n'est envoyé.

**Fichiers :** `src/capture/session-backstage.ts` (nouveau : `extractBackstage`), ses tests et une fixture inventée, `src/cli/capture-session.ts`, `src/cli/import-claude-code.ts`, `src/cli/consent.ts` (usage `coulisses`).

**Fait quand :**
- avec l'usage `coulisses`, la CLI envoie C10 après les tours et les faits : le raisonnement, la consigne et le rapport de chaque sous-agent, et les appels d'outils réduits (`appel_outil`, C10, amendé le 05/11), masqués, 20 000 caractères par bloc, 256 Kio par envoi ;
- les blocs injectés par Leon sont retirés (`stripLeonBlocks`) ;
- sans l'usage `coulisses`, rien ne change.

**Tests :** `session-backstage.test.ts` (faux secret masqué, coupe, sous-agent rattaché à son appel, bloc Leon retiré) ; `capture-session.test.ts` (sans l'usage : rien ; avec : envoi).

### T51 · Le serveur range les coulisses

> **Amendé le 05/11 (relecture, D29, C10) :** `TURN_ROLES` et la migration gagnent aussi `appel_outil`.
> - Le serveur revérifie chaque appel selon C10, écrit lui-même le texte du tour sur une ligne, le masque de nouveau, puis l'indexe comme les autres blocs.
> - Comme `raisonnement` et `sous_agent` : hors du point du matin, du bloc de démarrage, du résumé et de l'état du fil (D23) ; hors de la recherche par défaut (proposé, QD9) ; trouvé par le filtre `type` (appel d'outil). L'envoi répété reste idempotent.
> - Le nom passe par `reduceToolName` de T52 (C10) : `mcp__linear__get_issue`, envoyé tel quel par une CLI qui ne réduit pas, est rangé `mcp:linear`.
> - Fichiers en plus : `src/capture/api-contract.ts` (C10) et `src/server/sessions/thread-state.test.ts`.
> - Tests de plus, dans `backstage-routes.db.test.ts` :
>   - un `appel_outil` avec un `texte`, une sortie ou un champ inconnu : 400 ;
>   - une cible `Bash` hors de la forme réduite est rangée `[commande]` ; un chemin absolu ou qui sort du dépôt est rangé sans cible ;
>   - `mcp__linear__get_issue` reçu tel quel est rangé `mcp:linear` ; un nom hors forme, `[outil]` ;
>   - un faux secret glissé dans une cible est masqué en base ;
>   - `search` filtré par `appel_outil` le trouve ; `search` sans filtre `type` ne rend aucun tour `appel_outil` (proposé, QD9) ; ni le point du matin ni le bloc de démarrage n'en reprennent rien ;
> - et dans `thread-state.test.ts` : aucun bloc `appel_outil` n'entre au condensé (D23).

**Fichiers :** `src/capture/turn.ts` (`TURN_ROLES`), `src/server/db/migrations/NNNN-roles-coulisses.sql` (nouveau), `src/server/api/backstage-routes.ts` (nouveau), `src/server/api/app.ts`, `src/server/mcp/tools/search-tool.ts` (filtre `type` : raisonnement, sous-agent, appel d'outil, amendé le 05/11), `src/server/mcp/tools/render.ts`.

**Fait quand :**
- C10 est respecté ;
- les blocs deviennent des tours de la session, sous son ACL, masqués de nouveau, indexés par le pipeline existant ;
- l'envoi répété est idempotent ;
- le point du matin et le bloc de démarrage n'en reprennent rien ; ils ne nourrissent ni le résumé ni l'état du fil (D23) et se lisent à la demande.

**Tests :** `backstage-routes.db.test.ts` :
- 202, 400, 401, 413 ;
- la session d'un collègue reste intacte ;
- un secret glissé est masqué en base ;
- `search` filtré par `raisonnement`.

### T63 · Le sous-agent qui ne lit que le dépôt (après T43 et T50)

Ajoutée le 05/11 (A14, D36). Effort : 0,5 j.

**Fichiers :** `src/capture/session-facts.ts` et son test, une fixture inventée dans la forme relevée par T50, `src/cli/import-claude-code.ts` (si T50 trouve les échanges des sous-agents dans des fichiers à part, la CLI les lit avec la session), `src/server/sessions/thread-state.test.ts`.

**Fait quand :**
- le tri de T43 est en place : un rapport de sous-agent n'est jamais un message de l'utilisateur ;
- un appel `Agent` ou `Task` ne rend plus la session externe à lui seul. Les appels de son sous-agent passent par la même règle que ceux de la session (`isExternalCall`, D36 compris) :
  - lecture de fichiers, recherche dans le dépôt, commandes locales : la session reste non externe ;
  - le web, un `mcp__*` hors D36, une commande réseau : la session est externe ;
- un sous-agent lancé par un sous-agent suit la même règle, sur ses propres échanges ;
- on échoue fermé : un appel `Agent` ou `Task` dont on ne retrouve pas les échanges, ou dont la forme est inconnue, rend la session externe, comme aujourd'hui ;
- un sous-agent sans rapport final dans ses échanges (inachevé, arrêté, ou encore en tâche de fond quand la CLI calcule les faits) rend la session externe : ses appels suivants ne seraient pas vus ;
- c'est sous l'accord de base : rien de plus n'est envoyé, seul le booléen `externe` change. Le texte des sous-agents ne part qu'avec l'usage `coulisses` (T52) ;
- dans une session restée non externe, c'est la copie du rapport captée dans le transcript principal, un tour `user` marqué injecté (T43), qui entre au condensé, marquée « agent », sous l'accord de base. Le bloc `sous_agent` de C10 n'y entre jamais (D23, T51) ;
- une session déjà marquée externe le reste : le serveur garde l'ancien OU le nouveau (T02 du plan mère, `src/server/ingest/record-facts.ts`). La règle vaut pour les sessions captées après cette tâche ;
- pour Codex, Cursor et Antigravity, la règle suit dans leur lot (T18, T27 et T32 du plan mère, amendés), après le tri de leur lecteur et si leur essai montre les échanges du sous-agent ; sinon, un sous-agent y reste externe.

**Tests :**
- `session-facts.test.ts`, sur la fixture inventée :
  - un sous-agent qui ne fait que `Read`, `Grep` et `pnpm test` : session non externe ;
  - un sous-agent qui appelle `WebFetch`, `curl` ou un `mcp__*` hors D36 : externe ;
  - un sous-agent dont les échanges manquent : externe ;
  - un sous-agent dont le fichier s'arrête avant son rapport : externe ;
  - un sous-agent lancé par un sous-agent, qui appelle `WebSearch` : externe ;
  - un sous-agent qui lance `leon fil` : non externe (D36) ;
- `thread-state.test.ts` : dans une session restée non externe, le rapport du sous-agent capté dans le transcript principal entre au condensé marqué « agent », et une décision qui le cite est retirée ; aucun bloc `sous_agent` n'y entre.

## Lot 15 : le rêve perso par règles

Chaque nuit, sans modèle, Leon relit la mémoire de chaque personne et lui propose des changements, qu'elle accepte ou rejette (D39). Environ 5 j, après le lot 11, et 0,5 j pour refaire la mesure (T62). Il dépend des lots 12 et 13 (fils, versions, leçons, notes) et du lot 3 (l'état des PR, pour clore un fil). Il ne dépend pas du lot 6.

### T58 · Les faits gagnent `outils_en_erreur`

> **Amendé le 05/11 (relecture, C10) :** le nom réduit est celui de T52 (`reduceToolName`), dans la seule forme de C10 : `mcp__` testé avant `EXECUTABLE`, `mcp:<serveur>` pour un outil MCP, sinon `[outil]`. Sur le poste comme dans `record-facts.ts`, qui la repasse. Elle remplace la forme `[A-Za-z0-9_:.-]` de 60 caractères ci-dessous. Test de plus, pour `record-facts` : `mcp__linear__get_issue` reçu tel quel est rangé `mcp:linear`.

**Fichiers :** `src/capture/session-facts.ts` et son test, `src/capture/codex.ts`, `src/capture/cursor.ts` et `src/capture/antigravity.ts` (T18, T27, T32 du plan mère) et leurs tests, `src/capture/api-contract.ts` (C1, C2), `src/server/ingest/record-facts.ts` et son test, `src/server/api/faits-routes.db.test.ts`.

**Fait quand :**
- C1 gagne `outils_en_erreur: { outil: string; nombre: number }[]`, 20 au plus : le nom réduit de chaque outil hors Bash qui a échoué (`mcp:<serveur>` pour un outil MCP), et son compte. Bash reste dans `commandes` ;
- les lecteurs de Codex, Cursor et Antigravity le relèvent aussi, dans la forme d'erreur relevée à leur essai (T15, T26, T31) ;
- jamais de message d'erreur, de sortie ni d'argument ;
- c'est sous l'accord de base (les gestes) ;
- `record-facts.ts` repasse le masque, et remplace un nom hors forme (`[A-Za-z0-9_:.-]`, 60 caractères) par `[outil]`. Amendé le 05/11 : la forme est celle de C10, par `reduceToolName` (ci-dessus) ;
- le serveur avant la CLI : le schéma de C2 accepte le champ avant que la CLI ne l'envoie.

**Tests :**
- `session-facts.test.ts` : un appel `mcp__linear__get_issue` en erreur donne `mcp:linear`, 1 ; aucun texte d'erreur relevé ; borne de 20 ;
- `codex.test.ts`, `cursor.test.ts`, `antigravity.test.ts` : un outil en erreur sur leur fixture est relevé, sans texte d'erreur ;
- le test de `record-facts` : un nom hors forme est remplacé ; un faux secret est masqué ;
- `faits-routes.db.test.ts` : le champ est accepté et rangé.

### T59 · La table `propositions_memoire`

**Fichiers :** `src/server/db/migrations/NNNN-propositions-memoire.sql` (nouveau : la table, son index unique partiel, la colonne de l'interrupteur dans `member`) et son test db, `src/server/db/schema/memory.ts` et le schéma de `member`, `src/server/auth/delete-account.ts`, `src/server/db/rls-coverage.db.test.ts`.

**Fait quand :**
- la table, sa RLS, ses droits, son index unique partiel, l'interrupteur et `reves_a_faire()` suivent C15 ;
- `reves_a_faire()` saute les comptes supprimés, les membres partis et ceux qui ont coupé le rêve, et ne rend que des identifiants ;
- la suppression du compte efface les propositions de la personne.

**Tests :**
- test db de la migration :
  - la proposition d'un collègue est introuvable ;
  - une ACL élargie est refusée ;
  - la même règle et la même clé en double sont refusées, sauf après une proposition « dépassée » ;
  - `reves_a_faire()` ne rend ni compte supprimé, ni membre parti, ni rêve coupé ;
- `delete-account.db.test.ts` ; `rls-coverage.db.test.ts`.

### T60 · La tâche de nuit et les règles

**Fichiers :** `src/server/memory/dream-rules.ts` (nouveau), `src/server/memory/dream-queue.ts` (nouveau), `src/server/memory/dream-worker.ts` (nouveau), `src/instrumentation-node.ts`, et leurs tests.

**Fait quand :**
- un tic pg-boss chaque nuit à 3 h, heure de Paris, avant le point de 6 h (`missed: 'once'`, comme le tic du point) appelle `reves_a_faire()` ;
- un job par (organisation, utilisateur), en politique stately, 2 à la fois ;
- le worker refait `resolveTenantContext`, sort si la personne est partie ou a coupé l'interrupteur, et lit sous son `withTenant`, avec le filtre `owner_user_id = ctx.userId` ;
- il applique les quatre règles de D39, sur les 14 derniers jours (90 pour les preuves des leçons) ;
- chaque proposition porte 10 preuves au plus (des ids de sources, sessions comprises ; les tours cités à part), chacune vérifiée visible de la personne, et sa fréquence, calculée par le serveur ;
- une session ne compte que si elle existe comme session de code de la personne (D39) : une `session` déclarée par une note ne suffit pas ;
- 3 propositions nouvelles par nuit au plus, 10 ouvertes au plus ; une clé déjà décidée n'est jamais reproposée (C15) ;
- le texte d'une proposition est un gabarit fixe rempli de clés (commande réduite, outil, nombres, dates), que la personne complète avant d'accepter. La règle des notes ne reprend aucun texte : le champ reste vide, et les notes sont montrées comme preuves, marquées « écrit par l'agent » ;
- le worker revérifie `accountIsGone` juste avant d'écrire une proposition, comme `proposeAbout` (`src/server/briefing/about-suggestion.ts`) ;
- aucun appel de modèle ni de vecteur : les notes proches se comparent par trigrammes (`pg_trgm`, déjà installé) ;
- les journaux ne portent que des compteurs et des uuid ; une erreur rendue à pg-boss passe par `safeErrorSummary`.

**Tests :**
- `dream-rules.db.test.ts` :
  - `pnpm test:db` en échec dans 3 sessions sur 7 : une proposition, fréquence « 3 sur 7 », 3 preuves ; dans 2 sessions : rien ;
  - un fil dont toutes les PR sont fusionnées, sans session depuis 15 jours : « clore » ; avec une session hier : rien ;
  - une leçon dont toutes les preuves ont plus de 90 jours : « retirer » ; une leçon dont la seule preuve est devenue privée : aucune proposition, elle est déjà cachée (D33) ; une leçon écrite à la main : jamais ;
  - trois notes proches dans trois sessions vérifiées : « ajouter », texte vide ; trois notes d'une même session avec trois `session` inventées : rien ;
  - une clé rejetée n'est jamais reproposée ;
  - un fil clos, rouvert, puis de nouveau dormant : de nouveau « clore » ;
  - une session d'un collègue partagée avec moi n'est jamais lue ;
  - quatre propositions possibles : trois écrites ;
- `dream-worker.db.test.ts` : membre parti ou interrupteur coupé, rien ; compte supprimé pendant la tâche, aucune proposition écrite ; un faux modèle qui lève n'est jamais appelé.

### T61 · Accepter ou rejeter

**Fichiers :** `src/server/memory/proposals.ts` (nouveau : lire, accepter, rejeter) et `src/server/memory/proposals.db.test.ts` (nouveau), `src/components/verre/reglages/memoire.tsx`, `src/app/(app)/reglages/actions.ts` et son test, `src/server/auth/session.ts` (lu : la connexion récente de T55), `src/server/sessions/threads.ts` (réouverture d'un fil clos), `src/server/sessions/start-context.ts` (un fil clos quitte le sommaire), `src/test/contracts/api-contract.db.test.ts`, `src/test/contracts/mcp-descriptions.test.ts`.

**Fait quand :**
- la section « Mémoire » des réglages montre les propositions ouvertes : le texte (modifiable avant d'accepter, 300 caractères), l'action, la fréquence (« 4 sessions sur 9 ») et les preuves (outil, date, branche, 200 caractères du tour cité ; une note y est marquée « écrit par l'agent »), lues sous la RLS de la personne ;
- une proposition dont une preuve est devenue invisible ne se montre plus (règle de `readAboutSuggestion`) ;
- **Accepter** est un compare-and-set (`where decision is null`). Sous le verrou de la cible, il écrit, si `version_cible` est encore la dernière : une leçon (v1, ou la version suivante, `ecrit_par = humain`), une leçon retirée, ou un fil clos (`metadata.clos_le`). Sinon la proposition passe « dépassée », et rien n'est écrit. Une leçon acceptée reçoit `lecons.frequence = sessions_touchees`. Un texte vide (la règle des notes) doit être écrit avant d'accepter ;
- accepter une proposition qui écrit une leçon exige la connexion récente de T55 (tranché le 05/11, D37) : sinon « reconnexion », la proposition reste ouverte, et rien n'est écrit ;
- **Rejeter** pose `decision = rejetee` : la proposition n'est jamais reproposée ;
- l'interrupteur du rêve vit dans la même section (D39), rangé dans `member` (C15) ;
- un fil clos quitte le sommaire, reste lisible par `leon fil`, et se rouvre à la session suivante de sa branche ;
- aucune route à jeton ni aucun outil MCP n'accepte ni ne rejette.

**Tests :**
- `proposals.db.test.ts` :
  - deux acceptations simultanées : une seule leçon ;
  - la cible modifiée entre-temps : « dépassée », rien d'écrit ;
  - une preuve devenue privée : la proposition n'est pas montrée ;
  - la proposition d'un collègue : introuvable ;
  - un texte modifié avant d'accepter : la leçon porte le texte modifié ;
  - deux acceptations de fréquences différentes : l'ordre de D37 suit `frequence` ;
  - une proposition des notes au texte vide : refusée tant que le texte n'est pas écrit ;
- `actions.test.ts` : accepter, rejeter, couper le rêve ; accepter une leçon avec une session de plus d'une heure : « reconnexion », la proposition reste ouverte ;
- `start-context.db.test.ts` : un fil clos est absent du sommaire, puis rouvert après une session de sa branche ;
- contrats : aucune route de `API_PATHS` ni aucun outil MCP ne décide d'une proposition.

### T62 · Refaire la mesure (après T61)

**Fichiers :** `docs/etudes/memoire-sessions-2026-11/annexes/07-mesure-ancrage.md`.

**Fait quand :** les 5 tâches gardées par T38 du plan mère sont refaites, dans les mêmes cas, le rêve en marche depuis au moins 14 jours. Les tokens, la durée et la justesse sont notés dans l'annexe 07, à côté de la référence sans rêve, avec les compteurs de T44 et T53. Effort : 0,5 j.

**Après ce lot.** La version avec modèle (environ 3 j) vient si David accepte QD1 : une étape de modèle `reve`, qui lit aussi les résumés du lot 6 et propose des leçons, toujours vérifiées et relues de la même façon. Le rêve d'équipe vient dans un lot suivant : il faut d'abord la hiérarchie des managers et une lecture à l'échelle de l'équipe.

## Points de vigilance

1. **Le coût.** Un appel de modèle par session close pour le résumé (lot 6), et un par fil touché pour son état (étape `fil`). La capture complète multiplie le volume indexé. Parades :
   - claude-haiku-5-5 en effort low ;
   - un appel par fil touché et par session nouvelle au plus ;
   - l'étape `fil` à part, pour compter son coût dans le tableau admin existant ;
   - une mesure du volume par session (compteurs côté serveur) avant d'ouvrir l'usage `coulisses` à d'autres qu'Amos.

   Depuis le 04/11 : le rêve par règles (lot 15) n'appelle aucun modèle. Les versions ajoutent une ligne par écriture (4 000 caractères au plus), toutes gardées, sans limite. Le lot 11 mesure le volume ; couper demanderait une nouvelle décision d'Amos. La version avec modèle du rêve, après QD1, aura sa propre étape, pour compter son coût à part.
2. **L'injection durable.** Parades :
   - seules des clés sont poussées d'office (D25) ;
   - titres réduits (D24) ;
   - dans l'état, la provenance, les décisions vérifiées, ni récit externe ni coulisses (D23) ;
   - des balises partout, retirées à la recapture ;
   - depuis le 04/11, les leçons sont le seul texte poussé, et toujours relues et acceptées par un humain, sur le site, jamais par jeton ni par MCP (D37) ;
   - les notes de l'agent ne sont jamais poussées, ni preuve d'une décision (D38) ;
   - une proposition du rêve ne devient une leçon que par un geste humain, avec ses preuves sous les yeux (D39) ;
   - les anciennes versions restent hors de la recherche et de `fetch` (D33).

   Limite connue : la consigne du niveau 1 rend la lecture presque systématique. Depuis le 04/11, une session qui lit Leon n'est plus externe : un texte lu par `leon fil` ou `leon chercher` peut revenir, marqué « agent », dans l'état suivant, sans jamais faire une décision sans id vérifié (D36). Il peut aussi toucher les lignes `[en-cours]`, `[prochaine-étape]`, `[question]` et `[essai-raté]` : chacune cite alors un id du condensé, et sa provenance est écrite par le serveur, pas par le modèle (D23).

   Autre limite : la session du navigateur ne prouve pas un humain. Un agent qui pilote le navigateur connecté peut écrire ou accepter une leçon (D37). Depuis le 05/11, ces gestes exigent une connexion de moins d'une heure (T55, T61) : la fenêtre se réduit, sans se fermer. Une fois la connexion sociale fusionnée, GitHub ne sait pas forcer une nouvelle saisie : un navigateur déjà connecté à GitHub obtient une session neuve en un clic, et le contrôle d'une heure ne réduit plus rien sur ce chemin (D37). Il en va de même des cases de la page « Autoriser » (T64) et du réglage `noter` de la section Mémoire (T65) : un agent qui pilote le navigateur connecté pourrait cliquer à la place de l'utilisateur. La consigne « Je demande à Claude » le lui interdit, sans l'empêcher.

   Autre limite : `noter` est coché par défaut, et `leon noter` et `remember` ne rendent plus la session externe (D36). Par défaut, un agent sous injection peut donc écrire une note. Reliée au fil par proximité (D22), elle entre au condensé marquée « agent (note, <outil>) ». Une ligne `[prochaine-étape]` peut la citer, puisqu'une ligne n'a qu'à citer un id du condensé, et revenir à chaque session par `leon fil`, que la consigne fait lire. Elle n'y fait jamais une décision (D36), et sa provenance reste « agent ». Tranché le 05/11 (A16) : une telle ligne est gardée, marquée « agent ». Elle n'est jamais preuve d'une `[décision]`, et reste visible de l'auteur seul, comme le fil (D23). Décocher `noter` coupe `leon noter` dans l'outil, et `remember` dans tous les assistants branchés à cet espace (T65).

   Autre limite : le poste n'est pas une frontière. Le jeton de l'ordinateur est dans `~/.leon/connexion.json`, et l'accord dans `~/.leon/accord.json`, lisibles et modifiables par tout agent qui tourne sous le compte de l'utilisateur. Un agent sous injection peut donc retoucher `accord.json` pour s'ajouter un usage, ou appeler les routes avec les usages qu'il veut : le serveur croit les usages que le poste envoie (D30). Depuis le 05/11, il ne peut pas rouvrir `remember` à l'échelle du compte : la route à jeton n'accepte qu'un refus, et rouvrir passe par le navigateur (C16).
3. **Le périmé.** L'état d'un fil vieillit. Parades : des dates partout, l'état GitHub des PR lu à la lecture et non figé dans l'état, la mise à jour au démarrage. Depuis le 04/11, le rêve propose de clore un fil dormant et de retirer une leçon sans preuve récente (D39).
4. **Le délai.** La route de contexte et celle du rappel n'appellent ni modèle ni vecteur. Le rappel est coupé à 1,5 s sur le poste. Le rangement est en tâche de fond.
5. **La vie privée.**
   - Les fils restent privés à leur auteur en v1.
   - Le message du rappel n'est ni stocké ni journalisé.
   - Chaque usage a son propre accord (D30). Depuis le 05/11, `lecture`, `rappel` et `noter` sont cochés par défaut. Quand un agent installe, c'est l'humain qui les donne, sur la page « Autoriser » (T64). Un refus est gardé, daté, et n'est plus proposé (C7).
   - Les fils sont effacés à la suppression du compte.
   - Depuis le 04/11, les versions, les leçons et les propositions du rêve le sont aussi, et les notes de l'agent (proposé, A12).
   - Une version n'est rendue que si le lecteur voit toutes ses entrées, sources lues pendant les sessions comprises : un état tiré d'une source devenue privée (0048) ne se lit plus (D35). Les mots d'une source devenue invisible ne servent plus au rappel (D21).
   - Un secret passé dans une version y reste : hors la suppression du compte, aucune version n'est effacée, et le geste « effacer » n'est pas retenu (tranché le 05/11, D33). Tout texte de version passe d'abord par `maskSecrets`, seul masque. Il part avec le compte.
   - Le rêve ne lit que les données de la personne, sous ses droits, et rien ne sort de Leon (D39).
6. **La portée des lectures.** Un agent de code qui lit la mémoire privée de l'utilisateur et qui a une sortie réseau réunit les conditions d'une fuite. Parades :
   - les lectures sont bornées au projet : `dossier`, `fil` et `chercher`, et depuis le 04/11 `lecons` et `versions`, en commande comme au MCP ; seules des sources de connecteurs sans projet peuvent être liées à un fil par proximité, et elles restent lues sous la RLS du lecteur ;
   - la consigne et les commandes ne proposent jamais une recherche dans toute la mémoire (le MCP la garde, pour claude.ai et ChatGPT) ;
   - une portée « code » du jeton est à étudier avec le plan MCP distant (#121).
7. **La coordination** avec le plan de la CLI sans clone (`leon setup`, la connexion, le lanceur) et #121 (le MCP distant). Ce plan n'écrit aucun jeton et ne branche aucun connecteur. Ses lots 1 et 2 sont fusionnés (#124), et son `--yes` ne doit ajouter aucun usage : à reporter dans son plan (S10). Depuis le 05/11 (A16), ses pages et commandes portent les usages : les cases de la page « Autoriser » (S03), le code signé (K4), la 201 de `POST /api/v1/ordinateurs` (K5), `leon login` (S05) et `leon setup --yes`, qui relance `leon login` quand ils manquent (S10). S'y ajoutent le paramètre `usages` de la page (K3) et le champ `par` de `connexion.json` (K2). T64 les change ; à reporter aussi dans son plan. Le MCP distant (#130) ne change que par `remember` (T65).

## Questions

Pour Amos :
- A8. L'ordre : 2, 3, 7, 6, 12, 13, 14, puis 4, 5, 8, 9 et 11 ? Avancer les lots 12 à 14 laisserait ouverte la fuite que ferme le lot 2, et priverait les fils de l'état des PR, une dizaine de jours de plus. Les lots 1 et 2 de la CLI sans clone passent avant le lot 12. Tranché le 04/11 : 2 (fusionné), 3 (PR #129), 7, 6, 12, 13, 14, puis 4, 5, 8, 9, 11 et 15.
- A9. Les décisions vérifiées : gardées dans le résumé et l'état seulement si elles renvoient à un de tes messages, à une PR, à un commit, à un message ou à une réunion (D23) ? Tranché le 04/11 : oui, et une note n'en est jamais la preuve (D36).
- A10. La capture complète (D29) : on la détaille quand on arrive au lot 14, avec David, à partir des constats de la relecture du 03/11 ?
- A11. Le niveau 3 (D28) : construit en option, une fois la mesure du lot 11 faite ?
- A12. Les fils effacés à la suppression du compte (D21), alors que les sessions sont gardées ? Depuis le 04/11 (proposé) : les notes de l'agent aussi, avec leurs versions (D38). Aujourd'hui, une note `remember` est gardée et devient invisible.
- A13. L'accord par usage (D30) : `lecture`, `rappel`, `resume`, `coulisses`, chacun accepté à part ?
- A14 (tranchées le 05/11). Les sous-agents rendent toute session externe. Toutes tes sessions récentes sont marquées externes dans le bloc, parce qu'elles lancent des sous-agents (`Agent`, `Task`). Lire Leon ne compte déjà plus (D36). Faut-il revoir ce signal, par exemple pour un sous-agent qui ne lit que le dépôt ? Avant tout assouplissement, il faut séparer les vrais messages humains : le rapport d'un sous-agent arrive dans le transcript comme un message `user`, et deviendrait sinon la preuve d'une `[décision]` (D36, T43). Tranché le 05/11 : d'abord le tri (T43), puis, dès le lot 14, un sous-agent qui ne lit que le dépôt ne rend plus la session externe, un sous-agent qui va sur le web ou le réseau si (T63). Seules les sessions captées après le lot 14 en profitent : tes sessions déjà marquées externes le restent. Deux points liés :
  - D36 propose aussi `leon lecons`, `leon versions`, leurs outils MCP et `leon noter` comme lectures qui ne marquent pas la session. D'accord ? Tranché le 05/11 : oui pour tout, `remember` compris ; `search` et `fetch` du MCP restent externes.
  - `remember` reste externe, comme les autres `mcp__*`, alors que `leon noter` ne l'est pas. Les deux ne rendent qu'un id. On les aligne, et dans quel sens ? Tranché le 05/11 : alignés, aucun des deux ne rend la session externe.
- A15 (tranchées le 05/11). Les choix du 04/11 qui ne viennent pas de toi :
  - la règle « leçon sans preuve » : on l'a lue comme une leçon dont toutes les preuves ont plus de 90 jours (D39). Une autre lecture serait une `[décision]` retirée par le vérificateur et proposée à l'humain. Laquelle ? Tranché le 05/11 : toutes ses preuves ont plus de 90 jours ; le rêve propose de la retirer, l'humain décide ; jamais pour une leçon écrite à la main.
  - où restaurer : sur le poste, par `leon versions --restaurer` (terminal interactif, usage `noter`, version marquée `agent`), et sur le site pour une leçon ou une note sans projet (D33). D'accord ? Tranché le 05/11 : sur le site seulement, « Remettre cette version », réservé à l'auteur, `ecrit_par = humain` ; ni terminal, ni jeton, ni MCP.
  - l'usage `noter`, à part de `lecture`, éteint par défaut (D30) ? Tranché le 05/11 : à part, proposé à l'installation et déjà coché, comme les niveaux 1 et 2 ; on peut le décocher.
  - la fusion de deux fils garde le fil absorbé, marqué, pour ne rien effacer de ses versions (D21) ? Tranché le 05/11 : oui, gardé et masqué, ses versions lisibles.
  - un geste « effacer » sur le site, pour retirer une version où est passé un secret (D33) ? Tu as dit que restaurer n'efface rien. Tranché le 05/11 : non, aucune version n'est effacée ; un secret passé reste, masqué par `maskSecrets` seulement.
  - une connexion récente pour écrire ou accepter une leçon, puisqu'un agent peut piloter le navigateur (D37) ? Tranché le 05/11 : oui, moins d'une heure pour accepter, écrire ou remettre une leçon, et pour remettre une version (T55, T61).
  - le budget des leçons au démarrage : 2 000 octets sur 8 000, le reste dans `leon lecons` (D37). Tu as tranché que la mémoire passe avant le point du matin, pas ce chiffre. D'accord ? Tranché le 05/11 : pas de chiffre fixe ; les leçons prennent toute la place que le sommaire laisse, le point du matin ce qui reste.
- A16 (tranchée le 05/11). Quatre suites du 05/11, relevées à la relecture :
  - `noter` coché « comme les niveaux 1 et 2 » : T47 et T49 ne cochent pas `lecture` ni `rappel`, et l'installateur demande `[y/N]`. Faut-il les cocher aussi par défaut ? Et un usage coché s'ajoute-t-il avec `--yes`, que lance « Je demande à Claude » ? Le plan garde pour l'instant la règle de D30 : non. Tranché le 05/11 : les trois sont cochés par défaut ; quand un agent installe, les cases s'affichent, cochées, sur la page « Autoriser », où l'humain clique ; `--yes` n'en ajoute aucun de lui-même (D30, T64).
  - `remember` et `noter` : au MCP, il n'y a pas d'usages du poste. Décocher `noter` n'empêche pas `remember` dans un outil de code où le connecteur Leon est branché (D30). On le laisse ainsi, ou on transmet les usages au MCP (#121) ? Tranché le 05/11 : décocher `noter` bloque aussi `remember`, par un réglage du compte que `remember` lit ; qui ne l'a jamais décoché, même sans la CLI, garde `remember` (C16, T65).
  - le bloc de démarrage : la place de la consigne, de l'en-tête des leçons et de la ligne « N autres leçons » est réservée avant les leçons (D37). C'est un ajout du rédacteur. D'accord ? Tranché le 05/11 : oui, ils passent toujours ; les leçons prennent le reste, puis le point du matin (D37, T56).
  - une ligne de l'état qui ne cite que des notes de l'agent : on la garde, marquée « agent », ou on la retire (vigilance 2) ? Tranché le 05/11 : gardée, marquée « agent », jamais preuve d'une `[décision]`, visible de l'auteur seul comme le fil (D23, T43).

Pour David :
- QD7. Le kind `leon_fil` comme source (D21), plutôt qu'une table à part ?
- QD8. Le coût de l'étape `fil` en plus du résumé : un appel par fil touché ?
- QD9. Les rôles de tour du lot 14 : exclus par défaut de la recherche et du point du matin ? Depuis le 05/11 (relecture), ils sont trois : `raisonnement`, `sous_agent` et `appel_outil` (C10).
- QD10. La table `rappels_cites` (D26), purgée après 24 h ?
- QD11. Une portée « code » du jeton pour les outils de code, avec #121 ?
- QD12. L'usage `lecture` partagé entre les outils d'un même poste (D30) ?
- QD13. `leon noter` et ta passation (#106, `origin/david/passation-equipe`) : la note de l'agent reste privée (D38), et le partage avec l'équipe passe par ta passation, après relecture. Ça te va ? Sous quelle forme : une note promue en passation, ou une passation qui cite la note ?
- QD14. Les versions dans une table à part, `versions_memoire` (D33, C12), plutôt qu'en tours de la source ? `fetch` rend tous les tours d'une source (`src/server/search/context.ts`) : une ancienne version y serait lisible. Ça touche QD7 : un fil n'a plus de tour, il reste une source pour ses clés et sa RLS.
- QD15. Le bloc de démarrage : Amos a tranché le 04/11 que la mémoire passe avant le point du matin (D37). Le 05/11, il a tranché que les leçons n'ont pas de chiffre fixe : elles prennent toute la place que le sommaire laisse, et le point du matin seulement ce qui reste après elles. Quand les leçons sont nombreuses, le point du matin peut ne plus avoir de place du tout. C'est voulu par Amos. Y vois-tu un problème pour le point du matin ?
