# Deuxième jet : Leon façon Glean (recherche, discussion, MCP)

Spec du 19 octobre 2026. Amos (avec Claude) · à relire par David.

S'appuie sur la [description du produit](https://github.com/DavSperling/leon/pull/22) (David, PR #22), l'[étude des agents Glean](https://github.com/DavSperling/leon/pull/23) (David, PR #23), l'[étude d'architecture](../etudes/architecture-2026-10/README.md) (surtout l'[annexe stockage](../etudes/architecture-2026-10/annexes/01-stockage.md)), la [spec des connecteurs](2026-10-15-connecteurs.md) et l'[étude sur le cloud du client](https://github.com/DavSperling/leon/pull/24) (PR #24). Les règles de code de la [spec du premier jet](2026-10-13-premier-jet.md) s'appliquent toujours.

Les passages marqués **(choix de Claude)** n'ont pas été discutés avec Amos : ce sont des décisions par défaut, à contester à la relecture.

## L'intention

Leon devient la mémoire brute de l'entreprise, qu'on interroge comme Google et avec qui on discute. On arrête de trier, résumer et ranger la donnée en faits et en fiches par des agents qui arbitrent entre eux. On garde **tout en brut**, on l'**indexe**, et on offre trois portes sur la même mémoire :

1. **Une seule barre** : on tape quelques mots, Leon retrouve l'élément exact (la PR qui a changé tel code, la minute du call client, le mail, la note du CRM), avec une courte réponse de l'agent en tête, sources à l'appui.
2. **La discussion** : on pose une question, un agent lance plusieurs recherches, lit les documents trouvés, écarte ce qui ne sert pas et répond en citant ses sources, ou dit qu'il ne sait pas.
3. **Le MCP** : Claude Code, Cursor ou ChatGPT interrogent Leon. En particulier, **l'IA est à jour chaque matin** : une nouvelle session Claude Code reçoit toute seule le point sur le projet (ce qui a été fait, ce qui a bougé, ce qui reste ouvert).

Ce que les clients de Glean achètent, d'après l'étude de David, c'est « je trouve tout, tout de suite, sans voir ce que je n'ai pas le droit de voir ». Les agents sont un bonus. Ce jet construit donc la recherche d'abord.

Cas d'usage de référence (Amos, 19/10) :
- un dev cherche une modification de code (la PR, ses revues, le ticket et la discussion autour) ;
- un commercial cherche la transcription ou la note de son call avec un client ;
- n'importe qui, ou son IA, veut le contexte avant de commencer une tâche.

## C'est réussi si

- Sur l'instance en ligne, Amos et David branchent leurs vrais outils (GitHub, Notion, Linear, notre domaine Google Workspace, Microsoft 365, un outil de réunion) et, une fois la synchro passée, retrouvent par la barre : une PR à partir de quelques mots sur ce qu'elle change, le passage d'une transcription de réunion, un mail, un fichier Drive ou SharePoint. La réponse en tête cite les bonnes sources.
- Une nouvelle session Claude Code ouverte dans un dépôt reçoit, sans rien demander, le point du jour sur ce dépôt, et ce point mentionne ce que la session de la veille a fait.
- Personne ne voit dans Leon une donnée personnelle d'un autre (mail, agenda, fichier non partagé, conversation IA), ni un fichier qui n'est pas partagé à toute l'organisation.
- Sur le jeu d'essai noté (voir « Validation »), on a une première mesure chiffrée de la qualité de la recherche et des réponses, qui servira de référence pour la suite.

La clé Anthropic n'est ajoutée qu'**une fois que c'est bon** (Amos) : tout le jet se construit et se teste sans elle (modèle factice), puis on branche la clé pour l'essai réel.

## Hors périmètre

- **L'installation sur le cloud du client.** Tout est hébergé chez nous. L'étude PR #24 couvre le sujet, à discuter avec David. On respecte seulement les règles « installable » ci-dessous.
- **Les droits fins par outil** (canaux privés, partages Drive précis, dépôts restreints). Ce jet applique « public ou personnel » ; la reprise des droits d'origine vient au jet suivant, et le modèle de données est prévu pour.
- **Un éditeur ou un catalogue d'agents** à la Glean (étude #23 : à ne pas construire). Les « recettes » par équipe viendront plus tard, sous forme de prompts MCP.
- **Le gestionnaire de tâches** (PR #21) : il reste sur sa branche. Il s'alimentait par l'extraction, qui disparaît.
- **La recherche dans le code source lui-même** (fichiers d'un dépôt) : c'est le métier de Cursor ou Sourcegraph. On cherche dans l'**historique autour du code** : PR, commits, revues, tickets, discussions.
- Le mode « en direct » (interroger un outil au moment de la recherche sans rien stocker), y compris pour Slack.
- Les webhooks : la relève toutes les 15 minutes reste. La lecture d'images par reconnaissance de caractères (documents scannés).

## Ce qui ferait un échec, même si tout « marche »

- **Montrer à quelqu'un une donnée qu'il ne devait pas voir.** C'est l'échec le plus grave, avant tout bug d'affichage.
- **Une réponse sans source, ou qui invente.** Chaque affirmation de l'agent renvoie à un passage précis ; sinon il dit qu'il ne sait pas.
- **Refaire un pipeline de tri sous un autre nom** : pas de faits extraits, pas de fiches tenues à jour, pas de résumés stockés à la place du brut. Le brut est la source de vérité ; tout ce que l'agent produit est fabriqué à la demande (ou mis en cache, jamais substitué au brut).
- **Une recherche lente.** Les résultats s'affichent aussi vite qu'une recherche ordinaire ; la réponse de l'agent arrive après, sans les retarder.

## Les décisions d'Amos (19 octobre)

1. Hébergé chez nous seulement ; l'installation chez le client est une étude à part (PR #24).
2. Interface « une seule barre » : la réponse de l'agent en tête, les résultats dessous, un bouton « Continuer en discussion » (choix B de la maquette).
3. Droits « public ou personnel » (détail plus bas).
4. Nouveaux connecteurs : Slack, Google Workspace, Microsoft 365, fichiers et pièces jointes.
5. « IA à jour chaque matin » : un crochet de démarrage dans Claude Code injecte le point tout seul ; ailleurs, une commande MCP.
6. La branche part des connecteurs (PR #20, empilée) et se recale sur `main` quand David aura fusionné #18 à #20.
7. Le code du tri (pipeline d'extraction, fiches, faits, « À vérifier », « Journal ») est **supprimé**, tables comprises. L'historique Git le garde.
8. Validation : nos propres outils **et** le jeu d'essai fictif de David (#15), noté.
9. **Le fournisseur de vecteurs n'est pas choisi.** Amos veut en parler avec David. Le jet prévoit un emplacement réglable et **compare deux ou trois candidats** sur le jeu d'essai, sans en choisir aucun (voir « L'index »).
10. **Les réunions sont visibles de toute l'équipe**, quel que soit celui qui a branché l'enregistreur. Amos accepte le risque qu'un entretien individuel y figure ; les garde-fous sont décrits dans « Les droits ».
11. **L'essai réel se fait sur une instance en ligne commune**, en Europe, avec une adresse https et une invitation par lien pour ajouter David (voir « L'instance en ligne »).
12. **Comptes réels disponibles** : un domaine Google Workspace et un abonnement Microsoft 365. **Pas d'espace Slack.**
13. **Le jeu d'essai est complété** par des données d'outils fictives, et **David écrit les questions** et leurs sources attendues.
14. **Slack est repoussé** si ses conditions interdisent de stocker ses messages. Pas de mode « en direct » dans ce jet.

## Le produit

### La barre

C'est la page d'accueil de Leon, et ⌘K l'ouvre de partout (on garde `command-search.tsx` comme point d'entrée).

- **Résultats** façon moteur de recherche : pour chaque résultat, l'outil d'origine, le titre, l'extrait avec les mots surlignés, l'auteur, la date, le lien vers l'original. Un résultat désigne un **passage** d'une source (la minute 12:40 d'une réunion, un commentaire de PR), pas seulement le document entier ; plusieurs passages d'une même source se regroupent sous elle.
- **Filtres** : outil, personne, date, type (réunion, ticket, page, fil, mail, fichier, conversation IA). Les filtres s'écrivent aussi dans la barre (`de:julie`, `outil:slack`, `depuis:7j`) **(choix de Claude)**.
- **Aperçu** : cliquer un résultat montre le passage dans son contexte (les tours voisins) sans quitter la page, avec le lien vers l'original.
- **Réponse en tête** : une courte réponse de l'agent (quelques phrases) avec des renvois numérotés aux résultats. Elle arrive **après** les résultats, en flux, et ne les retarde jamais **(choix de Claude)**. Si les résultats ne suffisent pas, elle le dit en une ligne. Sans clé de modèle, l'encadré n'apparaît pas et la recherche marche quand même.
- **« Continuer en discussion »** ouvre une discussion qui part de la question et de ces résultats.
- **Classement** : pertinence (mots exacts et sens), puis récence, puis un léger bonus pour ce qui me concerne (j'en suis l'auteur, j'y suis mentionné) **(choix de Claude)**. Pas de signaux d'activité à la Glean (vues, clics) dans ce jet.

### La discussion

- Un agent avec des outils : chercher (avec filtres), lire une source ou une fenêtre de tours autour d'un passage, lister l'activité récente (par personne, outil, période). Il fait plusieurs recherches si besoin, reformule, lit, écarte ce qui ne sert pas.
- **Chaque affirmation cite son passage.** Sans preuve suffisante : « je ne sais pas », avec ce qu'il a cherché.
- Un nombre d'étapes maximal par réponse et un budget de lecture, pour tenir le coût **(choix de Claude ; valeurs au constructeur)**.
- L'historique des discussions est gardé et **privé à son auteur**. Pas de mémoire propre à l'agent en dehors de cet historique : il repart toujours de la mémoire commune.
- L'agent ne voit que ce que l'utilisateur voit : il passe par les mêmes fonctions de recherche, sous les mêmes droits en base.

### Le MCP et « l'IA à jour chaque matin »

**Outils MCP** (le serveur, le jeton et `guarded` existent déjà) :
- `search` : la recherche de la barre (passages, filtres), sans la réponse de l'agent : l'IA du client est elle-même un agent.
- `fetch` : une source, ou une fenêtre de tours autour d'un passage.
- `briefing` : le point sur un projet (voir ci-dessous).
- `remember` : garder une note que l'utilisateur dicte à son IA (on le garde, il dépose du brut).

**Le point du matin** :
- Leon capte les sessions Claude Code au fil de l'eau : un crochet de fin de session lance `pnpm leon import-claude-code` sur la session qui se termine (l'import existe déjà). Ces conversations restent **privées à leur auteur**.
- Un crochet de démarrage (`SessionStart`, déjà documenté dans le README) appelle `pnpm leon briefing`, qui transmet le dossier courant. Leon en déduit le projet : le dépôt GitHub du dossier (son `remote`), sinon le dossier lui-même **(choix de Claude)**.
- Le point dit, en quelques lignes et avec ses sources : ce que **j'ai** fait dans mes dernières sessions sur ce projet, ce qui a bougé depuis (PR fusionnées, tickets modifiés, messages qui me mentionnent, décisions dans les discussions), ce qui reste ouvert.
- Le crochet ne doit **jamais bloquer** une session (aujourd'hui : 3 secondes, sortie toujours à 0). Le point est donc **préparé à l'avance** : recalculé quand de nouvelles données arrivent sur le projet, et le crochet lit le dernier prêt **(choix de Claude)**. C'est un cache, pas une fiche : il est jeté et refait, jamais traité comme une source.
- Une commande d'installation (`pnpm leon installer-crochets`, nom au constructeur) écrit les deux crochets dans les réglages de Claude Code, après confirmation.
- Dans ChatGPT ou Cursor, qui n'ont pas ce crochet, l'utilisateur appelle l'outil `briefing`.

## Les données

### Le brut

On garde le modèle actuel : une **source** par élément (conversation IA, ticket, page, réunion, fil, mail, fichier) et ses **tours** (corps, commentaires, prises de parole, messages), dans les tables `sources` et `turns` de `0003-memoire.sql`, enrichies par les connecteurs (`0008`, `0009`). Le texte brut est déjà stocké, masqué des secrets ; on lève les coupes qui n'avaient de sens que pour l'extraction si elles empêchent de retrouver un passage (au constructeur, en gardant une limite de taille).

Les métadonnées utiles à la recherche sont gardées : auteur, côté de l'auteur, note interne, outil, origine (dépôt, espace, canal), lien, dates.

### L'index

- Chaque tour est découpé en **passages** (taille et chevauchement au constructeur), rattachés à leur tour et à leur source, avec les mêmes droits. C'est la table `source_chunks` dessinée dans l'annexe stockage.
- **Plein texte** Postgres (`french` + `simple`) et `pg_trgm` pour les titres et les fautes de frappe.
- **Vecteurs** avec pgvector et un index HNSW, **fusion des deux classements** (RRF) en SQL, toujours **après** le filtre des droits (scans itératifs de pgvector pour ne pas rendre de liste vide sous filtre).
- **Fournisseur de vecteurs : emplacement réglable, rien de choisi** (décision d'Amos). Concrètement :
  - une interface `Embedder` dans le même esprit que l'interface `Llm`, choisie par variable d'environnement ;
  - un fournisseur **factice et déterministe** pour les tests ;
  - **deux ou trois candidats réels** branchés derrière ce même réglage pour être **comparés** sur le jeu d'essai : Voyage, Mistral et un modèle libre multilingue (bge-m3) **(liste par défaut, choix de Claude)**. Le modèle libre peut tourner dans un service à part, réservé à la comparaison, pour ne pas alourdir l'image de l'application. Les clés des fournisseurs sont fournies par Amos. La comparaison donne, pour chacun, les deux notes du jeu d'essai, le coût d'indexation et la durée ; **Amos et David choisissent ensuite**, le jet ne fixe aucun défaut ;
  - tant qu'aucun fournisseur réel n'est réglé, la recherche fonctionne en **plein texte seul**, et les vecteurs s'activent dès qu'un fournisseur est branché ;
  - chaque vecteur enregistre le modèle qui l'a fabriqué ; changer de fournisseur doit se faire par un réglage et une **réindexation en tâche de fond**, sans réécrire de code ni casser la recherche pendant la réindexation. La dimension des vecteurs dépend du modèle : le schéma doit le permettre (forme exacte au constructeur).
- L'indexation est une tâche pg-boss mise en file à la fin de chaque ingestion (capture, connecteurs, `remember`), à la place de l'actuel `enqueueTriage`. On réutilise `queue.ts`, `worker.ts`, `runs.ts` et la table `ingest_runs`.

### Les droits : « public ou personnel »

Le socle reste : chaque ligne porte `tenant_id` et `acl uuid[]`, la sécurité par ligne de Postgres impose `acl && app_principals()`, et les principals d'un utilisateur sont `[son id, l'id de l'organisation]`.

La règle se fixe **par famille d'outils** :

| Famille | Exemples | Qui voit |
|---|---|---|
| Outils d'équipe | tickets et projets (GitHub, Linear, Jira, Asana…), pages (Notion, Confluence), **réunions** (Fathom, Granola, Gong…), support (Intercom, Zendesk…), CRM (HubSpot, Pipedrive…) | toute l'équipe (`acl = [organisation]`), quel que soit celui qui a branché |
| Fichiers partagés | Drive, OneDrive, SharePoint | toute l'équipe pour ce qui est **partagé à tout le domaine** ou dans un espace ouvert à toute l'organisation ; le reste est personnel |
| Personnel | mails (Gmail, Outlook), agendas, fichiers non partagés, messages privés, conversations IA, historique des discussions avec Leon | son seul propriétaire (`acl = [utilisateur]`) |

- **Les réunions sont visibles de toute l'équipe** (décision d'Amos, risque accepté). Garde-fous **(choix de Claude)** : une réunion que l'outil marque privée ou confidentielle n'est pas lue, quand l'API le dit ; les exclusions (ci-dessous) s'appliquent aussi aux réunions, par titre ou par organisateur.
- **Deux sortes de connexions** **(choix de Claude)** :
  - une **connexion d'équipe** (outils d'équipe, et pour les fichiers le seul contenu partagé à toute l'organisation), branchée par un membre ou un administrateur selon l'outil ;
  - une **connexion personnelle**, branchée par chaque membre pour lui-même (sa boîte Gmail, son Drive, son agenda, son Outlook), dont tout est privé à lui. Une même source vue par plusieurs personnes ne doit pas apparaître en double : une seule source, dont la liste d'accès réunit les personnes qui l'ont branchée **(forme exacte au constructeur)**. C'est le premier pas vers les droits par outil.
- **Exclusions** : l'administrateur peut exclure des canaux, dossiers, espaces, boîtes ou réunions d'une connexion, **avant** l'indexation et **avec effet rétroactif** (ce qui est exclu est retiré de l'index).
- **Ce qui a déjà été capté** par les connecteurs v1 est reclassé selon ce tableau par la migration du jet.

**« Moi » dans chaque outil** **(choix de Claude)** : le bonus « ce qui me concerne », le filtre par personne et « les messages qui me mentionnent » du point du matin demandent de savoir quel compte d'outil correspond à quel utilisateur de Leon. Ce jet en fait une version minimale : rapprochement par **adresse e-mail** (auteur, participant, destinataire) et par le **compte de chaque connexion personnelle**. Quand le rapprochement est inconnu, ces fonctions se taisent plutôt que de deviner.
- **Ce qui disparaît ou devient privé dans l'outil** doit sortir de Leon. Les connecteurs actuels ne propagent pas les suppressions : ce jet ajoute au moins une réconciliation périodique pour les connexions d'équipe là où l'API le permet à coût raisonnable, et liste les outils où ce n'est pas fait **(choix de Claude ; méthode au constructeur)**.
- Le modèle de données est pensé pour accueillir ensuite des **groupes** comme principals (canal, espace, liste de partage) et la correspondance des comptes des outils avec les utilisateurs de Leon par e-mail : c'est le jet « droits d'origine ».

Les tests de droits (autorisé / refusé, par table) couvrent les passages, la recherche, la réponse en tête, la discussion, le point du matin et le MCP.

## Les connecteurs

On garde les 39 connecteurs des PR #18 à #20 (socle, chiffrement, relève, OAuth). Le seul lien avec le tri, dans `src/server/connectors/ingest-items.ts`, devient la mise en file de l'indexation. On ajoute :

- **GitHub, compléments** : les commits (message, auteur, fichiers touchés) et, pour chaque PR, la liste des fichiers modifiés, pour retrouver « la PR qui a touché au jeton de rafraîchissement » **(choix de Claude)**.
- **Slack**, sous condition (voir ci-dessous) : canaux publics (connexion d'équipe) ; messages privés et canaux privés seulement en connexion personnelle, si les conditions le permettent. Nous n'avons pas d'espace Slack : s'il est livré, il l'est testé sur des réponses d'exemple et marqué « non essayé en réel ».
- **Google Workspace** : Gmail, Drive (Docs, Sheets, Slides et fichiers), Agenda, et les comptes rendus et transcriptions de Meet quand ils existent.
- **Microsoft 365** : Teams, OneDrive, SharePoint (Outlook existe déjà).
- **Fichiers et pièces jointes** : lire le texte des PDF, Word, Excel et PowerPoint, dans Drive, OneDrive, SharePoint et en pièce jointe des mails et des tickets. Limite de taille, pas de lecture d'images scannées. Les bibliothèques sous licence permissive seulement (jamais d'AGPL).

**À vérifier avant de coder chacun de ces trois éditeurs** (la spec des connecteurs les avait exclus faute de pouvoir les brancher sans procédure) :
- **Slack**, en **première tâche du plan** : ses conditions d'utilisation de l'API ont changé en 2025 (limites sévères de lecture de l'historique pour les applis distribuées hors de sa place de marché, et restrictions sur le stockage de ses données par des tiers). Le constructeur relit les conditions en vigueur et cherche une voie permise, par exemple une appli créée par le client dans son propre espace à partir d'un manifeste fourni par Leon. **Si stocker et indexer les messages n'est pas permis, Slack est repoussé au jet suivant** (décision d'Amos) : pas de mode « en direct » dans ce jet. La conclusion, avec ses sources, est écrite dans la PR.
- **Google** : les accès Gmail en lecture sont « restreints » et exigent, en production, une vérification et un audit de sécurité (CASA). Pour ce jet, on essaie sur **notre propre domaine Google Workspace** avec une appli « interne » au domaine, qui évite la vérification et l'expiration des autorisations du mode test (7 jours). Le constructeur le vérifie et l'écrit dans le guide `docs/guides/applis-oauth.md`.
- **Microsoft** : la lecture des messages Teams passe par des API protégées, parfois payantes à l'usage et soumises à demande. Le constructeur le vérifie ; si Teams n'est pas lisible simplement, on livre OneDrive et SharePoint et on documente Teams comme bloqué. L'essai réel se fait sur notre abonnement Microsoft 365.

Comme pour les connecteurs v1 : chaque connecteur note en tête de fichier les pages de doc lues et leur date, est testé sur des réponses d'exemple tirées des docs officielles, et reste marqué « non essayé en réel » tant qu'Amos ou David ne l'a pas branché.

Point de dette à régler au passage : la liste des outils est écrite à la main dans trois contraintes `CHECK` (`connections.provider`, `sources.kind`, `facts.source_kind`). Ajouter un connecteur ne doit plus demander de migration : la validation passe dans le code **(choix de Claude)**.

## Ce qu'on supprime

- Le pipeline de tri, d'extraction et de rangement : `src/server/pipeline/{triage,extraction,placement,prompts,quote,windows}` (on garde `queue.ts`, `worker.ts`, `runs.ts`).
- Les tables `facts`, `fact_candidates`, `cards`, `card_aliases`, `card_types`, `predicates`, `review_items`, par une migration qui les supprime. `read_log` reste, comme journal de ce que les IA ont lu.
- `src/server/memory/*` sauf `acl.ts` ; `search.ts` est réécrit sur les passages.
- Les pages « Fiches », « À vérifier », « Journal » et leurs composants (`card-*`, `fact-row`, `tree-view`, `review-*`), et l'outil MCP de lecture de fiche.
- Le côté « auteur » et les règles de prompt qui ne servaient qu'aux faits (on garde l'auteur et son côté comme métadonnées).
- `src/essai/` s'il est présent, le test de bout en bout du premier jet et le scénario de droits liés aux faits, **remplacés** par leurs équivalents sur la recherche.
- Le démarrage du worker conditionné à `ANTHROPIC_API_KEY` : l'indexation plein texte doit tourner sans clé.

## Ce qu'on garde

Connexion (Better Auth, organisations), sécurité par ligne et `withTenant`, pg-boss, connecteurs, capture (extension, import Claude Code, masquage des secrets), ligne de commande, serveur MCP et jetons, coque de l'interface et design actuel (explorateur de documents, Inter, accent indigo), page Connexions.

## Les règles « installable »

Pour que l'installation chez le client reste possible plus tard sans réécriture (étude PR #24) :
- tout dans Postgres : brut, plein texte, vecteurs (pgvector), file de tâches (pg-boss) ; aucun service de recherche à part (ni Elastic, ni OpenSearch, ni Pinecone) ;
- une seule image de conteneur pour l'application ;
- le fournisseur et le modèle d'IA, comme le fournisseur de vecteurs, se choisissent par réglage ;
- aucune adresse en dur : tout par variables d'environnement, documentées dans `.env.example` ;
- des journaux sans contenu de client ;
- des migrations rejouables sur une base neuve.

## Modèles d'IA et coût

- Le fournisseur reste Anthropic par défaut, derrière l'interface `Llm`. Le modèle se choisit **par étape** par variable d'environnement, dans l'esprit de la PR #16 de David : réponse en tête, discussion, point du matin **(choix de Claude)**.
- Valeurs par défaut **(choix de Claude)** : Haiku 5.5 pour la réponse en tête (appelée à chaque recherche, elle doit coûter peu et répondre vite), Sonnet 5.5 pour la discussion et le point du matin.
- Le prix visé est d'environ 25 € par utilisateur et par mois (#22). Le constructeur estime le coût d'une recherche, d'une discussion type et d'un point du matin, et le note dans la PR. Le suivi du coût de chaque appel reprendra la table `llm_usage` de la PR #13 quand elle sera fusionnée ; ce jet n'en crée pas une autre.
- Sans clé : la recherche plein texte marche, la réponse en tête et la discussion affichent qu'aucun modèle n'est branché.

## Validation

- **Tests** : unitaires et sur base réelle comme aujourd'hui, avec un modèle factice et des vecteurs factices. Les droits ont leurs tests autorisé / refusé à chaque étage (voir plus haut).
- **Jeu d'essai noté** :
  - Le corpus de départ est l'entreprise fictive de David (PR #15) : six personnages, une soixantaine de conversations IA. Il appartient à sa PR : le reprendre en accord avec lui (dépendance de la PR, ou copie des seules données).
  - Il ne contient que des conversations IA. Le jet le **complète** par des données d'outils fictives, cohérentes avec son histoire : PR et commits, tickets, transcriptions de réunion, mails, pages, au format des connecteurs, pour couvrir les trois cas d'usage de référence.
  - **David écrit** une trentaine de questions et, pour chacune, la ou les sources attendues, une fois le corpus complété, pour que le constructeur ne se note pas lui-même. Chaque question est posée **au nom d'un personnage** : les conversations IA et les mails restent privés à leur auteur, y compris dans le jeu d'essai.
  - Deux notes : la bonne source est-elle dans les 5 premiers résultats, et la réponse cite-t-elle la bonne source. On ne fixe pas de seuil : la première mesure sert de référence. Les mêmes notes servent à comparer les candidats pour les vecteurs.
- **Nos propres outils** : une fois la clé mise, Amos et David branchent leurs outils sur l'instance en ligne (GitHub, Notion, Linear, notre domaine Google Workspace, Microsoft 365, un outil de réunion) et jouent les cas d'usage de référence. Une checklist manuelle dans `docs/guides/` le décrit pas à pas.

## L'instance en ligne

Pour l'essai réel à deux (décision d'Amos) :
- une instance en Europe, avec une adresse https : l'application (une seule image), son worker pg-boss qui tourne en continu, et un Postgres géré avec `pgvector` et `pg_trgm` ;
- l'hébergeur est au constructeur, dans ces contraintes et avec les règles « installable » ; l'étude d'architecture cite Neon, Supabase et Scaleway pour Postgres. Amos crée le compte et paie ; le constructeur prépare tout le reste et documente le déploiement pas à pas dans `docs/guides/` ;
- **ajouter un membre** : l'administrateur crée un **lien d'invitation** à usage unique et à durée limitée, qu'il envoie lui-même. Leon n'envoie toujours aucun e-mail **(choix de Claude)** ;
- les applis OAuth (Google interne, Microsoft, et les autres outils) sont enregistrées avec l'adresse de cette instance ;
- les crochets Claude Code de chacun pointent vers cette instance (`LEON_URL`, `LEON_TOKEN`).

## Ce qui est laissé au constructeur

La taille et le chevauchement des passages ; la forme exacte du schéma (tables, index, dimension des vecteurs) ; la formule de fusion et les bonus de classement ; le nombre d'étapes et le budget de l'agent ; le texte des prompts ; la méthode de réconciliation des suppressions par connecteur ; les bibliothèques de lecture de fichiers (licence permissive) ; le découpage du jet en tâches et en PR ; les noms de commandes. Le constructeur suit la méthode habituelle du projet : plan relu, exécution tâche par tâche, vérifications après chaque tâche.

## Points à surveiller

- **Ordre des PR** : cette branche est empilée sur #20. Après la fusion de #18 à #20, la recaler sur `main` (voir les pièges connus des PR empilées). La prochaine migration est `0010`. La PR #13 de David porte une autre `0007` : à surveiller à la fusion.
- **Les PR de David sur le pipeline** (#13 à #17) visent l'extraction, qui disparaît. #13 (coût des appels) et #16 (modèle par étape) restent utiles. À trancher avec David.
- **Fraîcheur** : la relève reste toutes les 15 minutes. La page Connexions affiche pour chaque connexion la dernière synchro, les erreurs et ce qui n'est pas lu.
