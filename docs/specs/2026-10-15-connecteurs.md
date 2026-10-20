# Connecteurs v1 : brancher les outils de l'équipe sur la mémoire

Spec du 15 octobre 2026. S'appuie sur l'[étude d'architecture](../etudes/architecture-2026-10/README.md) (section 7 et [annexe connecteurs](../etudes/architecture-2026-10/annexes/07-connecteurs.md)) et sur la recherche du 15/10 : cinq agents ont vérifié, sur les docs officielles, quels outils se branchent **dès maintenant**, sans revue ni place de marché chez l'éditeur. La [spec du premier jet](2026-10-13-premier-jet.md) et ses règles de code s'appliquent.

## Objet

Leon lit aujourd'hui les conversations avec les LLM. Ce jet lui fait lire aussi les outils de l'équipe : tickets, pages, réunions, notes de CRM, conversations de support. Tout entre dans le même pipeline (tri, extraction, rangement) et finit en faits datés et cités.

**C'est réussi si** Amos et David branchent GitHub, Notion, Linear et leur outil de réunion depuis l'interface, en collant une clé, et retrouvent dans Leon, dans les 15 minutes, des faits tirés de ces outils, avec leur citation et un lien vers l'original. Les autres connecteurs sont livrés, testés sur des réponses d'exemple tirées des docs officielles, et marqués « non essayé en réel » tant que personne ne les a branchés.

## Les choix de ce jet

1. **Une clé collée, pas d'OAuth.** Le client colle une clé d'API, un jeton personnel ou un jeton d'intégration interne. Ça marche pour tous les outils retenus, sans enregistrer d'appli chez l'éditeur ni avoir d'adresse publique. L'OAuth viendra pour la distribution.
2. **Relève périodique, pas de webhooks.** Leon va chercher ce qui a changé depuis la dernière fois, toutes les 15 minutes. En local, il n'y a pas d'adresse publique pour recevoir des webhooks, et la recherche a montré qu'ils sont souvent vides ou peu fiables : il aurait fallu une relève de rattrapage de toute façon.
3. **Tout remonte à l'équipe.** Une source branchée est visible de toute l'équipe : ACL `[tenantId]` pour la source et ses tours. Qui lit quoi sera décidé plus tard dans Leon (rôles, hiérarchie, chronologie), pas recopié des outils. Pour préparer ce chantier, chaque source garde son origine : connexion, outil, espace, projet ou dépôt, auteur, lien. Les règles « sensible » du pipeline restent : un fait sensible reste privé et passe par « À vérifier ». **Exception : une boîte mail personnelle** (Outlook). Son texte brut reste privé à celui qui l'a branchée, comme une conversation avec un LLM (`privateRaw` sur le connecteur, ACL `[créateur]` pour la source, ses tours et son run). Les faits qu'on en tire remontent à l'équipe selon les règles du pipeline, sauf les faits sensibles. Les événements d'agenda marqués personnels, privés ou confidentiels ne sont pas lus.
4. **Seulement les outils en ligne.** Les instances auto-hébergées (Mattermost, GitLab installé chez le client, Jira Data Center) sont exclues : il faudrait laisser Leon appeler une adresse choisie par l'utilisateur. Les adresses sont fixées par connecteur ; seul un sous-domaine (`<site>.atlassian.net`, `<domaine>.freshdesk.com`, `<sous-domaine>.zendesk.com`) est saisi, et vérifié.

## Les connecteurs

Quatre lots. Le premier pose le socle et doit marcher en vrai ; les suivants ne font qu'ajouter des connecteurs au socle.

| Lot | Connecteurs | Clé collée | Ce qu'on lit |
|---|---|---|---|
| **A. Dev** (essayé en réel) | GitHub | jeton à grain fin + liste de dépôts `propriétaire/nom` | tickets, PR, commentaires, commentaires de revue |
| | Notion | secret d'intégration interne (les pages doivent être partagées avec l'intégration) | pages (texte des blocs), commentaires |
| | Linear | clé d'API personnelle | tickets, commentaires, mises à jour de projet |
| **B. Réunions** | Granola, Fathom, Fireflies, tl;dv, Circleback, Claap, Leexi, Gong | clé d'API (Leexi et Gong : identifiant + secret) | transcription complète avec locuteurs et horodatage, titre, participants |
| **C. Projet** | Jira, Confluence | site + e-mail + jeton d'API Atlassian | tickets et commentaires ; pages et commentaires |
| | GitLab (gitlab.com), Asana, ClickUp, Trello, monday.com, Shortcut, Plane, Airtable, Sentry | jeton personnel ou d'intégration interne (Trello : clé + jeton ; Plane : clé + espace ; Airtable : jeton + bases ; Sentry : jeton + organisation) | tickets, tâches, commentaires, wikis, enregistrements, problèmes |
| **D. CRM et support** | HubSpot (appli privée), Attio, folk, Pipedrive, Close | jeton d'appli privée ou clé d'API | notes, activités, appels, mails rattachés aux fiches |
| | Intercom, Zendesk, Freshdesk, Help Scout, Front, Plain, Crisp, Missive | jeton d'accès, clé d'API, ou identifiant + secret d'appli (Help Scout) | conversations, messages, notes internes |

Pour chaque connecteur, l'implémentation relit la doc officielle et note en tête de fichier les URL lues et la date. Ce qui n'a pas pu être vérifié est écrit, pas deviné.

Exclus de ce jet, faute de pouvoir les brancher sans procédure : Slack, Google Workspace, Microsoft 365 (procédures en cours ou juridiques), Zoom, Figma, Coda, Otter, Modjo, Dropbox (revue de l'éditeur), Box (jeton de développeur d'une heure), Loom (pas d'API), Discord (conditions), Basecamp (OAuth seulement).

## Ce qu'un connecteur fournit

Un connecteur est un module sans base de données ni état : il reçoit sa configuration et un client HTTP, et rend des éléments. Le socle fait tout le reste.

```ts
type ConnectorItem = {
  externalId: string;            // stable dans l'outil : « issue:owner/repo#12 », « page:<uuid> »
  nature: 'conversation' | 'reunion' | 'page' | 'ticket' | 'fil' | 'note';
  title: string;
  url: string | null;            // lien vers l'original
  updatedAt: string;             // ISO 8601
  origin: Record<string, string>; // espace, projet, dépôt… pour la future couche de droits
  turns: ConnectorTurn[];        // dans l'ordre chronologique
};

type ConnectorTurn = {
  externalId: string;            // stable : « body », « comment:456 », « utterance:12 »
  role: 'document' | 'participant';
  author: { name: string | null; email: string | null };
  text: string;
  ts: string;                    // ISO 8601
};

type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>;            // champs saisis, secrets compris
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string }>; // « David (acme) »
  sync(config: Config, state: { cursor: string | null; since: Date }, http: ConnectorHttp):
    AsyncIterable<{ items: ConnectorItem[]; cursor: string }>;
};
```

- `sync` rend des pages dans l'ordre de modification croissant, et après chaque page un curseur qui permet de reprendre juste après. Premier passage : tout ce qui a changé depuis `since`. Un élément modifié revient en entier.
- Le corps d'une page ou d'un ticket est un tour `document` dont l'auteur est le créateur (à défaut, le dernier à l'avoir modifié). Chaque commentaire, chaque prise de parole de réunion est un tour `participant` avec son auteur.
- Le socle découpe un tour de plus de 8 000 caractères aux lignes vides ou aux titres (`body:1`, `body:2`…), et suffixe chaque identifiant de tour par une empreinte du texte (12 caractères de SHA-256). Un texte modifié crée donc un nouveau tour, un texte inchangé est ignoré, et l'envoi reste idempotent. L'ancien tour reste : c'est l'historique.
- La partie publique de chaque connecteur (nom, famille, champs du formulaire, aide « où trouver la clé », lien vers la doc, « essayé en réel » oui/non) vit dans un catalogue sans code serveur, lu par l'interface.

## Le socle

### Modèle de données (migration `0008-connecteurs.sql`)

- **`connections`** : `id`, `tenant_id`, `created_by`, `provider`, `label`, `config` (jsonb, sans secret : site, e-mail, dépôts, espace), `secret` (texte chiffré), `secret_hint` (4 derniers caractères), `status` (`active`, `paused`, `error`), `cursor`, `since`, `next_sync_at`, `sync_lock_at`, `last_sync_started_at`, `last_sync_at`, `last_error` (résumé sans contenu), `items_synced`, `acl`, `created_at`, `updated_at`. RLS comme les autres tables. Toute personne de l'équipe voit les connexions, sans le secret, et peut les gérer.
- **`sources`** : `kind` accepte les identifiants des 35 connecteurs ; nouvelle colonne `connection_id` (nulle pour les conversations, `on delete set null`). `metadata` porte `nature`, `url`, `origin`, `updated_at`.
- **`turns`** : `role` accepte aussi `document` et `participant` ; nouvelles colonnes `author_name`, `author_email` ; `capture_mode` accepte `connector`.
- **`facts.source_kind`** suit la nouvelle liste.
- La route publique `POST /api/v1/ingest` garde la liste actuelle (`claude_code`, `claude_ai`, `chatgpt`, `mcp_remember`) : un jeton d'appareil ne peut pas fabriquer une source « notion ». `SOURCE_KINDS` (tout) et `INGEST_KINDS` (capture) deviennent deux listes.

### Secrets

- Chiffrés en AES-256-GCM avec `node:crypto`, clé de 32 octets en base64 dans `LEON_CONNECTORS_KEY` (`.env.example` dit comment la générer). Format stocké `v1:<iv>:<tag>:<chiffré>`, données associées `<tenant_id>:<connection_id>` : un secret recopié sur une autre ligne ne se déchiffre pas.
- Déchiffrés seulement dans la tâche de fond et au test de la connexion. Jamais renvoyés à l'interface, jamais journalisés, jamais stockés dans pg-boss (le job ne porte que des identifiants).
- Sans `LEON_CONNECTORS_KEY`, la page Connexions l'explique et ne permet pas de brancher ; la tâche de fond ne démarre pas.

### Synchronisation

- Chaque connexion porte sa prochaine échéance (`next_sync_at`). Un tic pg-boss, chaque minute, demande à la fonction SQL `connector_syncs_due()` les connexions dues et met un job en file pour chacune. Cette fonction est la seule entorse à la RLS : elle ne rend que trois identifiants (connexion, tenant, créateur), jamais de contenu ni de secret.
- File pg-boss `connector-sync`, job `{ connectionId, tenantId, userId }` (`userId` = `created_by`). Le job se réserve la connexion (`sync_lock_at`, sous la RLS du créateur) : jamais deux synchronisations de la même connexion en même temps ; une réservation de plus de 30 minutes est réputée abandonnée.
- À la fin d'un passage, l'échéance passe à dans 15 minutes, ou à dans une minute s'il a atteint la limite de 200 éléments et qu'il en reste. Brancher une connexion, ou cliquer « Synchroniser maintenant », met l'échéance à maintenant : le tic suivant la prend.
- Chaque page rendue par le connecteur passe par l'ingestion commune, extraite de `ingestTurns` : une source par élément (créée ou mise à jour), les tours nouveaux, un `ingest_run`, le triage mis en file. Puis le curseur est enregistré. Une reprise après plantage refait au pire la dernière page, sans doublon.
- La tâche de fond démarre avec l'app, même sans `ANTHROPIC_API_KEY` : les sources entrent, leurs runs attendent le pipeline.
- `since` se choisit à la connexion : 7, 30 (défaut), 90 ou 365 jours. Il borne le coût du premier passage.

### Erreurs

- Client HTTP commun : délai de 30 s, réponse limitée à 10 Mo, redirections refusées vers un autre hôte, trois reprises sur 429, 5xx, limite de débit signalée par un 403 et erreur réseau, en respectant `Retry-After`.
- 401, ou 403 qui n'est pas une limite de débit (GitHub signale une limite dépassée par un 403 avec `x-ratelimit-remaining: 0` ou `Retry-After`, traité comme un 429) : statut `error` avec « Clé refusée par <outil> : vérifiez-la ou remplacez-la. », et plus d'échéance (plus de relance automatique jusqu'au remplacement de la clé, qui relance la connexion). Autre échec : statut `error`, échéance dans une heure. Le tic prend les connexions `active` et `error` dont l'échéance est passée ; une connexion en pause n'a pas d'échéance.
- `last_error` et les journaux contiennent l'outil, le code HTTP et un message court écrit par nous, jamais le corps de la réponse ni la clé.

## Le pipeline

- Le format envoyé aux modèles devient `<source outil="Notion" nature="page" titre="…">` puis `<tour id role auteur cote interne date>` (`cote` et `interne` seulement quand l'outil les donne), pour les conversations comme pour le reste. Les libellés de rôle : utilisateur, assistant, document, participant. La protection contre l'injection échappe aussi `</source>`.
- Les prompts de tri et d'extraction ne parlent plus seulement d'« une conversation entre un employé et un assistant » : ils décrivent chaque nature. Une réunion contient des décisions et des engagements des participants. Une page ou un ticket décrit l'état des choses à sa date. Un commentaire peut proposer, décider ou corriger.
- La règle de citation ne change pas : chaque fait cite le texte exact d'un tour, sinon il est rejeté.
- L'auteur d'un tour est donné au modèle : il sert à attribuer décisions et engagements (« David s'engage à… »).
- Le nom d'un auteur est celui qu'il s'est donné : un client peut s'appeler comme un collègue. Le côté du tour (`cote="equipe"` ou `cote="externe"`) vient donc d'un champ de l'outil, jamais du nom ni du texte (rôle du compte Zendesk, `from` de Crisp, `author` de Front et de Missive, annuaire des agents de Freshdesk, type de fil de Help Scout, type d'acteur de Plain, type d'auteur d'Intercom, `author_association` de GitHub). Un tour `externe` ne donne jamais un fait établi sur l'entreprise, ses procédures ou les engagements de l'équipe, seulement des faits sur son auteur. Une note que seule l'équipe voit est l'attribut `interne="oui"`, non une marque dans le texte (un client peut la recopier). Un fait tiré d'un tour extérieur est affiché avec « (externe) » après le nom de son auteur.

## L'interface

- Nouvelle page **Connexions** dans la barre latérale : le catalogue par famille (Dev, Réunions, Projet, CRM, Support), avec pour chacun son état (non branché, actif, en pause, en erreur).
- Un clic ouvre un panneau : les champs de l'outil, l'aide « où trouver la clé » avec le lien vers la doc officielle, le choix de `since`, et le bouton « Tester et brancher ». Le test appelle `verify` et affiche le compte trouvé (« Connecté en tant que David, espace Acme »). La connexion n'est enregistrée qu'après un test réussi.
- Branché : dernier passage, nombre d'éléments, erreur éventuelle, et les boutons « Synchroniser maintenant », « Mettre en pause », « Remplacer la clé », « Supprimer ». Supprimer efface la connexion et son secret ; les sources déjà captées restent dans la mémoire.
- La page **Sources** affiche aussi les sources des connecteurs, avec l'outil et le lien vers l'original.
- Les connecteurs jamais essayés en réel portent la mention « non essayé en réel ».

## Sécurité

- Secrets chiffrés et liés à leur ligne (ci-dessus). Les actions serveur valident tout avec zod et passent par `requireUserContext`.
- Pas d'adresse libre : hôte fixe par connecteur, sous-domaine vérifié par une expression stricte (`^[a-z0-9][a-z0-9-]{0,62}$`), HTTPS seulement.
- Le texte des outils passe par `prepareTurnText` (masquage des secrets, coupe) comme les conversations, et reste une donnée dans les prompts.
- Les sources des connecteurs n'entrent que par la tâche de fond, jamais par la route publique.
- Le texte d'un client, d'un visiteur ou d'un inconnu (support, courriels, tickets d'un dépôt public) entre dans la mémoire partagée comme celui de l'équipe : seuls le côté du tour, donné par l'outil, et les règles des prompts (ci-dessus) les distinguent. Les autres outils (CRM, réunions) ne donnent pas encore de côté.

## Tests

- Chaque connecteur : tests unitaires sur des réponses d'exemple tirées de sa doc officielle (dossier `fixtures/`), avec `fetch` simulé : correspondance vers `ConnectorItem`, pagination, curseur, `since`, erreur 401.
- Socle, sur un vrai Postgres : RLS des connexions, chiffrement aller-retour et refus d'un secret déplacé, secret jamais renvoyé par les lectures de l'interface, ingestion idempotente d'une page, curseur enregistré, statuts d'erreur, refus des types connecteur par la route publique.
- Pipeline : format `<source>` et échappement, prompts des nouvelles natures (faux LLM).
- Aucun test n'appelle un vrai service.

## Hors périmètre

OAuth et annuaires ; webhooks ; suppressions propagées depuis les outils ; pièces jointes et fichiers ; droits fins par rôle ou recopiés des outils ; instances auto-hébergées ; dédoublonnage quand deux personnes branchent le même espace (l'interface prévient si l'outil est déjà branché) ; connecteurs exclus ci-dessus.

## À vérifier en réel

- Lot A et l'outil de réunion d'Amos et David : brancher, attendre un passage, lire les faits obtenus.
- Coût du premier passage sur 30 jours (les runs restent en attente sans clé Anthropic de workspace).
- Conditions d'utilisation à faire confirmer par écrit avant tout client : Fathom et tl;dv (interdiction de stocker), ClickUp (pas d'entraînement), Front (clause ambiguë), monday.com (« usage interne »), Sentry (§2.3 b).
