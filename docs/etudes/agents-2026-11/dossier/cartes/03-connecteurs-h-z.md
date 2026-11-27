# Carte 03 : les connecteurs, de Help Scout à Zendesk (21 sur 42)

19 novembre 2026 · lecture seule du code · rien n'a été lancé : ni serveur, ni tests, ni migration

Comment lire : les sections 1 à 7 suivent le plan imposé et parlent du cadre commun, vu depuis ces 21 connecteurs. La section 8 donne les 21 fiches, dans l'ordre alphabétique. Le tableau récapitulatif est à la fin. Les blocs de code sont recopiés du dépôt, avec chemin et ligne. « [hors code] » marque un point d'API d'écriture écrit de mémoire, que le dépôt ne cite pas : à vérifier dans la documentation de l'éditeur avant de coder.

Périmètre : `src/server/connectors/<nom>/` pour helpscout, hubspot, intercom, jira, leexi, linear, miro, missive, monday, notion, outlook, pipedrive, plain, plane, productboard, sentry, shortcut, slack, tldv, trello, zendesk ; plus `types.ts`, `registry.ts`, `http.ts` et `docs/guides/applis-oauth.md` pour le cadre. Les chemins sans préfixe sont relatifs à `src/server/connectors/`. Le cadre commun est décrit en détail dans la carte 02 (`02-connecteurs-a-g.md`, sections 2 et 3) ; cette carte ne le répète que pour ce qui sert ici.

## 1. Ce que fait ce module

- Un connecteur est un module **sans base ni état** : il reçoit une configuration, un état de relève (`cursor`, `since`) et un client HTTP, et il rend des pages d'éléments normalisés (`ConnectorItem`). Le socle fait le reste (chiffrement, réservation, jetons, normalisation, ingestion, indexation).
- Les 21 connecteurs de cette carte sont **tous en lecture seule**. Le contrat n'a que deux verbes, `verify` et `sync`. Aucun des 21 n'a une seule fonction qui crée, modifie ou commente dans l'outil.
- Les 21 passent par la **relève** : un tic par minute, un passage par connexion due, 200 éléments au plus par passage, un passage toutes les 15 minutes au mieux. Aucun webhook. Slack passe par Pipedream ; les 20 autres parlent directement à l'API de l'éditeur.
- Authentification : 11 clés collées seules (Intercom, Leexi, Missive, Pipedrive, Plain, Plane, Sentry, Shortcut, tl;dv, Trello, Zendesk), 6 qui offrent clé **et** bouton OAuth (Help Scout, HubSpot, Jira, Linear, monday.com, Notion), 3 bouton seul (Miro, Outlook, Productboard), 1 Pipedream (Slack).
- Les 9 applis OAuth demandent l'écriture d'avance (décision du 23/10/2026) ou, pour Help Scout, Miro et Notion, la règlent dans la console de l'éditeur. Une clé collée n'a l'écriture que si l'utilisateur l'a créée assez large : Trello, Plain, Sentry et HubSpot en clé sont présentés en lecture seule dans leur catalogue.
- Chaque élément garde un `externalId` stable, une `url` (nulle pour HubSpot, Intercom, Plain) et un `origin`. Pour la plupart, `origin` ne garde que des **noms** (tableau, projet, équipe, liste) et pas les identifiants dont l'API d'écriture a besoin (voir le tableau récapitulatif).
- Aucun des 21 n'a été branché sur un vrai compte : `triedForReal: false` partout (seuls GitHub, Gmail et Drive sont à `true`). Tout est écrit d'après la doc et testé sur des réponses d'exemple. Chaque fichier liste ce qu'il n'a pas pu vérifier.
- Trois familles de curseur existent : une marque `{ at, seen }` (la plupart), un « tour » `{ from, started, after }` (monday.com, Plain), une position opaque ou un numéro (Zendesk, Help Scout, Linear).
- Beaucoup d'API ne savent pas lire « modifié depuis, du plus ancien au plus récent » (Linear, monday.com, Notion, Plain, Sentry, Trello, Missive, Productboard, Miro, tl;dv). Ces connecteurs relisent une liste entière, ou parcourent du plus récent au plus ancien, puis trient chez nous. Voir les fiches pour le détail de chacun.

## 2. Types et fonctions à connaître

Le cadre est le même que pour la carte 02 (section 2). Ce qui suit est recopié de ce que j'ai lu pour cette carte.

### 2.1 Le contrat d'un connecteur

`types.ts:100-118` :

```ts
export type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>; // tous les champs, secrets compris ; un z.object, sans .transform
  secretFields: readonly string[]; // noms des champs à chiffrer
  hosts(config: Config): string[]; // hôtes exacts autorisés, ex. ['api.github.com']
  minIntervalMs?: number; // écart minimal entre deux requêtes (Notion : 350)
  privateRaw?: boolean;
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string; accountKey?: string }>;
  sync(config: Config, state: SyncState, http: ConnectorHttp): AsyncIterable<SyncPage>;
  oauth?: OAuthSpec; // le bouton ; absent : l'outil ne se branche que par clé
  pipedream?: { app: string };
};
```

Deux verbes : `verify` et `sync`. Pour les 21 : `hosts` est fixe (`api.linear.app`) ou dépend de la configuration (`<subdomain>.zendesk.com`, `<company>.pipedrive.com`, `<site>.atlassian.net`, `config.region` pour Intercom et Sentry). `privateRaw: true` seulement pour Outlook et Slack parmi les 21 (Gmail et Drive, de la carte 02, l'ont aussi).

### 2.2 Ce qu'un connecteur rend

`types.ts:13-52` (commentaires abrégés) :

```ts
export type ConnectorTurn = {
  externalId: string; // stable, sans empreinte : « body », « comment:456 »
  role: 'document' | 'participant';
  author: { name: string | null; email: string | null };
  side?: AuthorSide;
  internalNote?: boolean;
  text: string; // texte brut (HTML déjà passé par htmlToText)
  ts: string;
};

export type ConnectorItem = {
  externalId: string; // ≤ 200 caractères, stable : « issue:acme/leon#12 »
  nature: ItemNature;
  title: string; // ≤ 300 caractères
  url: string | null;
  updatedAt: string; // ISO 8601
  origin: Record<string, string>; // { repo: 'acme/leon' }, { workspace: 'Acme', project: 'Site' }
  turns: ConnectorTurn[]; // ordre chronologique
};

export type SyncState = { cursor: string | null; since: Date; depotsEquipe?: string[] };
export type SyncPage = {
  items: ConnectorItem[];
  cursor: string;
  removed?: string[];
  depotsConfirmes?: string[];
};
```

Natures utilisées par les 21 : `fil` (Help Scout, Intercom, Missive, Outlook courrier, Plain, Slack, Zendesk), `ticket` (Jira, Linear, monday.com, Plane, Sentry, Shortcut, Trello), `reunion` (Leexi, tl;dv, Outlook agenda), `page` (Miro, Notion), `note` (HubSpot, Pipedrive, Productboard, Linear mises à jour de projet). `ItemNature` contient aussi `conversation`, `mail`, `fichier`, `evenement`, `commit`, `fil_de_travail` (`src/capture/turn.ts:84-97`), non utilisées ici : l'agenda d'Outlook est rendu en `reunion`, pas en `evenement`, et le courrier en `fil`, pas en `mail`. `AuthorSide` vaut `'team'` ou `'external'` (`src/capture/turn.ts`).

`removed` ne sert qu'à Outlook (événement devenu privé : `event:<id>`).

### 2.3 Le client HTTP commun

`http.ts:9-33` (recopié de la carte 02, constantes recontrôlées par recherche : `http.ts:71-75`) :

```ts
export type HttpRequest = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown; // envoyé en JSON
  form?: Record<string, string>;
  raw?: { type: string; text: string };
  acceptStatus?: number[];
  // Une écriture qu'on ne rejoue pas : une limite de débit, un 5xx ou une réponse perdue échouent tout de suite,
  // car la requête a pu aboutir.
  once?: true;
};
export type ConnectorHttp = {
  json<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<T>;
  page<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<{ data: T; nextUrl: string | null }>;
  text(request: HttpRequest): Promise<{ text: string; type: string | null; status: number }>;
  bytes(request: HttpRequest): Promise<{ bytes: Uint8Array; type: string | null; status: number }>;
};
```

`http.ts:71-75` : `TIMEOUT_MS = 30_000`, `BODY_MAX_BYTES = 10 * 1024 * 1024`, `RETRIES_MAX = 3`, `WAIT_MAX_MS = 60_000`, `BACKOFF_MS = 2000` (puis 4 et 8 secondes). Erreurs exportées : `ConnectorAuthError` (401 et 403 qui ne sont pas une limite de débit), `ConnectorHttpError(status, message)`, `ResponseTooBigError`, `NothingToReadError`. Les clients GraphQL (Linear, monday.com, Plain) passent par un POST et lisent `errors` dans une réponse 200 (Linear : `acceptStatus: [400]`) ; Slack lit `ok: false` dans une réponse 200. Les trois traduisent les codes d'erreur de l'éditeur en `ConnectorAuthError` ou `ConnectorHttpError(429)`.

`HttpRequest.once` et `method: 'PUT' | 'PATCH' | 'DELETE'` existent déjà : le client commun est prêt pour des écritures. Aucun des 21 ne s'en sert.

### 2.4 Le socle appelé par la relève (signatures recontrôlées par recherche)

- `queue.ts:5` : `export const CONNECTOR_QUEUES = { tick: 'connector-tick', sync: 'connector-sync' } as const;`
- `queue.ts:8-12` : `ConnectorSyncJobSchema = z.object({ connectionId: z.uuid(), tenantId: z.uuid(), userId: z.uuid() })`.
- `sync.ts:27` : `export const SYNC_ITEMS_MAX = 200;`
- `sync.ts:219` : `export async function runConnectorSync(job: ConnectorSyncJob, deps: SyncDeps): Promise<SyncResult>`
- `sync.ts:259` : `export async function enqueueDueSyncs(): Promise<number>`
- `connections.ts:498-504` : `NEXT_SYNC` avec `soon` (1 minute), `later` (15 minutes), `office`, `retry` (1 heure), `never`. Au retour du générateur : `connector.pipedream ? 'office' : 'later'` (`sync.ts:106`). Donc Slack est relevé aux heures de bureau, les 20 autres toutes les 15 minutes.
- `connections.ts:347-350` : `loadMyConnections(ctx: TenantContext, provider: ProviderId)` : les connexions que l'utilisateur a **branchées lui-même**, secrets déchiffrés, hors pause.
- `oauth.ts:182` : `ensureFreshTokens(ctx, connection, connector, deps)`. `oauth.ts:18` : `OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken']`.
- `pipedream.ts:241` : `connectorHttp(provider, connector, config, deps = {}): ConnectorHttp`.
- `registry.ts:47` : `CONNECTORS: Record<ProviderId, AnyConnector | null>` (42 entrées). Les 21 y sont tous non nuls.
- `oauth-env.ts:5-22` : les 16 clés d'appli. Parmi les 21 : `HELPSCOUT`, `HUBSPOT`, `ATLASSIAN` (Jira), `LINEAR`, `MIRO`, `MONDAY`, `NOTION`, `OUTLOOK`, `PRODUCTBOARD`.

### 2.5 Les aides propres aux 21 (à ne pas réinventer)

- `htmlToText` (`../normalize`) : le texte HTML y passe (importé par Help Scout, HubSpot, Intercom, Miro, Missive, monday.com, Outlook, Pipedrive, Plane, Productboard). HubSpot s'en abstient pour le texte des e-mails (un `<a@b.fr>` serait pris pour une balise).
- `adfToText(value: unknown): string` (`jira/adf.ts:130`) : lecture seule de l'ADF d'Atlassian.
- `updatedSinceJql(from: Date, timeZone: string | null | undefined): string` (`jira/jql.ts:34`).
- `atlassianOAuth(scopes: string[]): OAuthSpec`, `atlassianAccess(config, product)`, `requireFields`, `oauthShape` (`jira/oauth.ts`, `jira/access.ts`) : partagés avec Confluence.
- Les générateurs de curseur `{ at, seen }` sont **copiés** dans chaque connecteur (`cursor.ts` ou dans `connector.ts`), sauf Slack qui importe celui d'Outlook (`slack/connector.ts:2`). Pas de module commun.
- Les `graphql(http, token, query, variables, schema)` de Linear, monday.com et Plain sont trois copies privées d'un même patron. Les trois sont des POST génériques qui valideraient aussi une mutation.

## 3. Comment ça s'exécute

1. `startConnectorWorker()` (`worker.ts:52`) déclare les deux files pg-boss et programme `connector-tick` chaque minute. Le tic appelle `enqueueDueSyncs()` : un job `connector-sync` par connexion due.
2. `runConnectorSync(job, deps)` : contexte du **créateur** de la connexion, réservation de la ligne, `ensureFreshTokens` si le connecteur a un bouton, `connector.configSchema.safeParse(config)`, `connectorHttp(...)`, puis `for await (const page of connector.sync(config, state, http))`. Par page : normalisation, ingestion, `removed` éventuel, enregistrement du curseur. Arrêt à 200 éléments. Un 401 sur une connexion OAuth avec jeton de rafraîchissement force un renouvellement et un seul nouvel essai.
3. Le curseur est enregistré **après chaque page rendue** : un plantage refait au pire la dernière page. Les 21 écrivent leurs pages pour que cela tienne (Miro et Notion par lots de 5 et 10, Sentry par 50, tl;dv par 20).
4. Après le commit, l'indexation est mise en file. Le seul signal « après indexation » aujourd'hui est `signalSourceActivity` (carte 02 : `src/server/search/index-run.ts:103`, non relu ici).
5. **Sous quels droits** : la relève lit l'outil avec le compte de la personne qui a branché, et écrit en base sous son contexte. Visibilité par défaut : toute l'organisation (`ingest-items.ts:80`). `privateRaw: true` (Outlook, Slack, Gmail, Drive) la réserve au créateur. Les 19 autres sont visibles de toute l'équipe : un agent y lira donc ce que le jeton voit, notes internes comprises (Intercom, Missive, Zendesk, Help Scout, Plain).
6. Une écriture n'a pas de chemin aujourd'hui. Le patron existant est GitHub : `loadMyConnections` → `ensureFreshTokens` → `connectorHttp` → `liveGithub(config, http)` (carte 02, section 2.5). Il vaut aussi pour les 21, mais il faut d'abord exporter, dans chaque `connector.ts`, le schéma de configuration et la fonction qui choisit le jeton, qui sont tous privés aujourd'hui (`ConfigSchema`, `tokenOf`, `bearer`, `authorizationOf`).

## 4. Conventions

- **Langue** : les identifiants de code sont en anglais (`syncConversations`, `toItem`, `readCursor`) ; les commentaires, les messages de test et les textes du catalogue sont en français. Les messages d'erreur qui sortent vers l'interface sont en anglais (`'Jira site not found: check the site name'`, `'Unexpected response'`).
- **Nommage** : un dossier par outil, en minuscules. Fichiers : `connector.ts` (schéma, `verify`, `sync`), `client.ts` (requêtes et schémas de réponse), `map.ts` (réponse vers `ConnectorItem`), `cursor.ts` (curseur, quand il n'est pas dans `connector.ts`), `oauth.ts` (`<outil>OAuth: OAuthSpec`), `catalog.ts` (`<outil>Catalog: CatalogEntry`), `fixtures/*.json`, `connector.test.ts`, `oauth.test.ts`. Plusieurs ajoutent `schemas.ts` (HubSpot, Missive, Outlook, Pipedrive), `queries.ts` (monday.com, Plain), `sync.ts` (Productboard), `stream.ts` (Pipedrive).
- **Identifiants d'élément** : `<genre>:<identifiant stable de l'outil>` : `issue:10001`, `conversation:123`, `thread:<id>`, `card:<id>`. Le commentaire de `Jira` et de `Linear` dit pourquoi : on garde l'identifiant qui ne change pas (pas la clé `LEON-12`, qui change avec le projet ou l'équipe). Tours : `body` (document) et `comment:<id>`, `message:<id>`, `thread:<id>`, `part:<id>`, `utterance:<n>`.
- **Validation** : chaque réponse passe par un schéma zod qui ne garde que les champs lus. Les champs douteux se déclarent `.nullish()` ou `.catch(null)` pour ne pas faire échouer la page. Le `ConfigSchema` est un `z.object` (parfois raffiné par `superRefine`, jamais `.transform`), car le catalogue lit `.shape`.
- **Erreurs** : 401 et 403 deviennent `ConnectorAuthError`. Un 403 ou 404 sur une **ressource secondaire** (commentaires, membres, tableau disparu) est attrapé et laisse l'élément sortir sans elle ; un 401 remonte toujours. Chaque connecteur recopie ce `try/catch` sous un nom différent : `tolerate` (Missive), `optional` (HubSpot, Plane), `readDetail`, `itemsOrNone`. Un curseur illisible repart de `since` : « l'ingestion est idempotente, au pire on refait du travail ».
- **Journalisation** : aucune. Pas un `console`, pas un journal dans les 21 connecteurs ni dans `http.ts`, `sync.ts`, `worker.ts` (recherche faite).
- **Dates** : chaque API a son format (secondes Unix pour Intercom et Missive, `AAAA-MM-JJ HH:MM:SS` sans fuseau en v1 de Pipedrive, microsecondes pour Plane, ISO sans millisecondes pour Help Scout, Pipedrive, Shortcut, Trello, Plain, Outlook). Chaque connecteur convertit lui-même.
- **Tests** : vitest, un `connector.test.ts` par connecteur, qui lit des réponses d'exemple dans `fixtures/` (`describe('helpscout : configuration', ...)`). Pas de test réel contre l'éditeur.

## 5. Points d'extension pour le système d'agents

- **Brancher une action d'écriture** : le contrat (`Connector<Config>`) n'a pas de verbe d'écriture et le client de l'outil n'en fait pas partie. Il y a trois façons d'avancer, de la plus petite à la plus grande :
  1. Pour chaque outil, exporter un `live<Outil>(config, http)` à côté de `sync`, sur le modèle de `liveGithub`, et l'ouvrir par `loadMyConnections` + `ensureFreshTokens` + `connectorHttp`. C'est ce que les cartes 01 et 02 donnent aussi pour GitHub.
  2. Ajouter un verbe optionnel au contrat, par exemple `write?(config, http, action)`, pour que l'écriture partage le `hosts`, le `minIntervalMs` et le schéma de configuration.
  3. Un module d'actions par outil (`<outil>/actions.ts`) qui réutilise le client de `client.ts`.
  Ne pas choisir ici : c'est une décision d'architecture. Ce que le code impose : l'écriture doit partir du compte de l'utilisateur (`loadMyConnections`), jamais de la connexion d'un collègue, et passer par `HttpRequest.once` pour ne pas rejouer une requête qui a pu aboutir.
- **Ce qu'il faut généraliser pour écrire** :
  - Les clients ont déjà un **POST de lecture** utilisable : GraphQL (`graphql()` privé dans Linear, monday.com, Plain) ; HubSpot (`post`, privé) ; Intercom `search` ; Shortcut `stories`. Exporter ces helpers évite d'en écrire un quatrième.
  - Les connecteurs qui ne gardent pas l'identifiant du conteneur (tableau, projet, équipe, liste, affaire) devront le garder dans `origin`, ou le relire par l'API : HubSpot, Linear, monday.com, Plane, Trello, Miro, Missive, Intercom, Help Scout. Changer `origin` change `sources.metadata.origin` à la prochaine relève, mais `externalId` ne bouge pas : pas de doublon.
  - Les droits : une clé collée en lecture seule (Trello `scope=read`, Plain, Sentry, HubSpot) ne peut pas écrire. Il faudra une clé ou un jeton plus large, ou le bouton OAuth, déjà conforme pour 9 outils.
  - Outlook : `Mail.Send` n'est pas demandé (voir fiche 8.11).
  - Jira : l'écriture d'un commentaire exige de l'ADF ; `adf.ts` ne sait que lire.
  - HubSpot, Pipedrive, Plane, Sentry, Zendesk : le contenu de ce qu'on relève (notes, activités) n'est pas la fiche (affaire, problème). Un agent a besoin de lire l'objet, pas seulement ses notes.
- **Brancher un déclencheur** : il n'y a ni webhook ni événement. Le seul « signal » possible est le passage de relève (toutes les 15 minutes) ou `signalSourceActivity` après l'indexation. Pour un déclencheur « un nouveau ticket est arrivé », le point le plus bas est `runConnectorSync` après `ingestConnectorItems` (carte 02, section 3.1) : il connaît les éléments nouveaux (`externalId`, `nature`, `side`, `internalNote`). Les webhooks de ces 21 outils ne sont pas lus ici.
- **Tâche de fond** : un troisième nom de file pg-boss à côté de `CONNECTOR_QUEUES` (`queue.ts:5`), enregistré dans `registerWorkers` (`worker.ts`, non lu en entier).
- **Écran** : le catalogue (`CatalogEntry`, `types.ts:121-152`) décrit les champs de connexion et sert l'interface. Pour un poste de contrôle, il manque un champ « droits d'écriture accordés » : ni `CatalogEntry` ni `OAuthSpec` ne disent aujourd'hui, de façon lisible par la machine, si l'écriture est accordée (c'est dans `scopes` pour 6 outils, dans la console pour Help Scout, Miro et Notion, et dans la clé pour les 11 autres).
- **Contenu qui entre** : le trieur d'entrée a deux attributs fiables sur chaque tour : `side` (`team` ou `external`) et `internalNote`. `side` est posé (d'après la recherche `side` dans `map.ts` et `connector.ts`) pour Help Scout, Intercom, Missive, Outlook (`'team'` seulement : envoyés et organisateur), Plain, Productboard (prises de parole d'une conversation) et Zendesk. `internalNote` l'est pour Help Scout, Intercom, Missive et Zendesk. Les 14 autres (HubSpot, Jira, Leexi, Linear, Miro, monday.com, Notion, Pipedrive, Plane, Sentry, Shortcut, Slack, tl;dv, Trello) ne posent ni l'un ni l'autre : on n'y sait pas si l'auteur est un client ou un collègue. Pour un agent qui lit du texte venu de l'extérieur, c'est la ligne de séparation : à ne pas supposer.

## 6. Pièges et limites écrites dans le code

- **Jamais vérifié en réel** : tous les 21. Chaque `connector.ts` a un bloc « Non vérifié ». Les plus lourds : Productboard (API v2 « en bêta », durée des curseurs de page), tl;dv (API `v1alpha1`, ordre de la liste, code d'une transcription absente), Linear (sens exact de `orderBy: updatedAt`), Plane (un commentaire fait-il avancer `updated_at` ?), Shortcut (idem pour les commentaires), monday.com (idem pour les mises à jour), HubSpot (portées exactes).
- **Un commentaire ajouté ne rend pas toujours l'élément « modifié »** : à craindre pour Plane, Shortcut, monday.com, Sentry (note sans nouvel événement), Trello (commentaire modifié). Un agent qui commente lui-même verrait son propre commentaire revenir tard, voire jamais avant la prochaine modification.
- **Coûts qui montent avec le volume** : chaque passage relit toute la liste filtrée pour Miro (tous les tableaux), Productboard, Sentry, tl;dv (jusqu'à 10 000 réunions), Trello (toutes les actions depuis le curseur), Slack (deux jours de marge, 1 crédit Pipedream par centaine). Zendesk, Plain, Plane, Intercom, Missive, Shortcut font une requête de détail ou de commentaires par élément.
- **Plafonds écrits** : Jira 1 000 commentaires par ticket, Zendesk 1 000, Plane 400 (les plus récents), Linear 50, Intercom 500 parties, Miro 1 000 éléments par tableau, Notion 3 niveaux de blocs, HubSpot 10 000 résultats de recherche par sorte (relancée depuis la date de la dernière fiche), Sentry 100 activités par problème, Trello 1 000 commentaires, monday.com 25 mises à jour par élément (`UPDATES_MAX = 25`, `monday/queries.ts:5`).
- **Hôtes** : un seul domaine par connexion, vérifié par `hosts(config)`. Sentry et Intercom en proposent deux et trois ; Plain est figé sur `core-api.uk.plain.com` ; Plane sur `api.plane.so` (« Plane en ligne seulement ») ; aucun ne gère un serveur hébergé par le client (Jira, Zendesk, Pipedrive prennent un sous-domaine saisi).
- **Conditions d'utilisation à faire confirmer** (écrit dans `warning`) : monday.com (API réservée à un usage interne), Sentry (§2.3 b : pas de service pour des tiers), Slack (copier pour indexer va contre les conditions, étude `docs/etudes/slack-2026-10`, verdict « non indexable »), tl;dv (interdit de copier une partie importante du contenu). ClickUp et d'autres sont dans la carte 02.
- **Clé qui n'écrit pas** : Trello (`scope=read`), Plain (« droits de lecture seulement »), Sentry (« Read »), HubSpot (cinq portées de lecture). Pour écrire, il faut redemander une clé : l'utilisateur doit la recréer.
- **Zendesk : un jeton d'administrateur** est exigé par l'export. Un agent écrivant avec ce jeton aurait les droits d'un administrateur. Jira, Pipedrive, Plane, Shortcut, Trello et Intercom donnent à la clé les droits de son propriétaire.
- **Miro** : les jetons qui expirent sont une option de l'appli, **non modifiable après création** ; sans elle, le jeton ne se renouvelle jamais.
- **monday.com** : « New OAuth Flow » à activer, droits d'écriture qui permettent aussi de supprimer, ce que le guide OAuth dit à Leon de ne jamais faire.
- **Écart connu entre commentaire et code** : `plain/connector.ts:32-33` dit que le côté (client ou équipe) n'est pas rendu ; `plain/map.ts:15-19` le rend (`side`). Le code fait foi.
- **Jira : la clé du ticket (`LEON-12`) n'est que dans l'URL**, pas dans `externalId` ni dans `origin`. Un agent qui veut écrire « sur LEON-12 » utilisera l'identifiant numérique de `externalId` (`issue:10001`), que les routes REST de Jira acceptent (à vérifier).

## 7. Ce que je n'ai pas lu

- `map.ts` des 21 connecteurs : lu en entier pour Help Scout (partiel), Jira (lignes 15-53), Slack (dans `connector.ts`) ; pour les 18 autres, **recherche ciblée** (`externalId`, `url`, `origin`, `nature`, `side`, `internalNote`) et lecture partielle de quelques fonctions. Les titres (`title`) sont donnés pour ceux que j'ai vus. La construction du texte du tour `body` (ordre des champs, libellés) n'est pas décrite.
- `schemas.ts` d'Outlook et de HubSpot (lu en partie), `queries.ts` de monday.com (lu en partie) et de Plain (lu), `blocks.ts` de Notion (constantes seulement), `jira/jql.ts` (lu en partie), `jira/adf.ts` (signature seulement), `hubspot/email.ts` (lu).
- Les tests (`connector.test.ts`, `oauth.test.ts`, `map.test.ts`, `jql.test.ts`, `adf.test.ts`) : lus seulement pour leur forme et leurs titres. Les `fixtures/` : listées, non ouvertes.
- Les textes anglais (`en`) des catalogues : non lus, sauf recoupement.
- `http.ts`, `sync.ts`, `connections.ts`, `oauth.ts`, `pipedream.ts`, `queue.ts`, `worker.ts`, `ingest-items.ts`, `normalize.ts` : **je n'ai fait que des recherches ciblées** pour recontrôler les signatures et les constantes (lignes citées). Le détail vient de la carte 02, que j'ai relue (sections 2 et 3). Je ne les ai pas lus en entier.
- `docs/guides/applis-oauth.md` : lu jusqu'à la section Attio. Les sections Miro, Outlook et Productboard du guide (après) ne sont pas lues ; ce que je dis de leurs droits vient des fichiers `oauth.ts`.
- Les points d'API d'écriture marqués « [hors code] » : écrits de mémoire, **non vérifiés**. Aucune documentation d'éditeur n'a été consultée.
- Les webhooks et les actions des 21 outils (hors ce que le code cite) : non étudiés.
- `src/server/search/index-run.ts`, `src/server/discussion/github-live.ts`, `github-actions.ts` : non lus (cités d'après la carte 02).

## 8. Fiches des 21 connecteurs

### 8.1 Help Scout

- **Fichiers** : `helpscout/connector.ts` (142 lignes), `client.ts` (143), `oauth.ts` (43), `cursor.ts` (27), `map.ts` (128), `catalog.ts` (46), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : deux modes (`authMode: 'key' | 'oauth'`, `connector.ts:70-85`). Clé collée : `appId` + `appSecret` (secret chiffré : `secretFields: ['appSecret']`), échangés à chaque passage contre un jeton `client_credentials` de 2 jours, gardé en mémoire (`client.ts:235-253`). Bouton OAuth natif : `accessToken` envoyé tel quel en `Bearer`. Pas de PKCE, `clientAuth: 'body'`, `scopes: []` (`oauth.ts:317-328`). Un 400 sur la demande de jeton devient `ConnectorAuthError`.
- **Portées** : aucune, ni en lecture ni en écriture. Le jeton suit les droits de l'utilisateur qui autorise (`oauth.ts` en-tête ; `docs/guides/applis-oauth.md`). L'écriture est donc déjà couverte, mais il faut un utilisateur actif du compte.
- **API** : `https://api.helpscout.net/v2` (`client.ts:149`). Hôte : `api.helpscout.net`. La liste v3 (23/09/2026) n'est pas utilisée : elle ne trie plus par date croissante (`connector.ts:34-36`).
- **Relevé** : `GET /conversations` avec `status=all`, `modifiedSince`, `sortField=modifiedAt`, `sortOrder=asc`, `embed=threads`, `page` (`client.ts:267-281`). 25 conversations par page. Les fils viennent avec la liste. Écartés : spam, conversations supprimées ou en brouillon, fils de type `lineitem`/état brouillon/masqué (`map.ts`, `SKIPPED_TYPES`, `SKIPPED_STATES`), conversations sans texte. `GET /users/me` pour `verify`.
- **Non relevé** : pièces jointes, changements d'état, brouillons, fils masqués, citations non retirées des mails (`connector.ts:50`).
- **Curseur** (`cursor.ts:8-11`) : JSON `{ since, page }`.

```ts
const CursorSchema = z.object({
  since: z.iso.datetime({ offset: true }),
  page: z.number().int().min(1),
});
```

  Une fois la dernière page lue, il repart de `page: 1` avec `since` reculé de 5 minutes (`OVERLAP_MS`, `connector.ts:88`). Limite écrite : si une conversation déjà lue change entre deux reprises d'un même passage, la suivante glisse d'un rang et peut être sautée (`connector.ts:50-52`).
- **Débit** : pas de `minIntervalMs`. Help Scout signale la limite par `X-RateLimit-Retry-After`, que le client commun ne lit pas : après un 429 il attend 2, 4, 8 s (`connector.ts:47-48`). Plans Standard, Plus, Pro : 200, 400, 800 appels par minute (commentaire).
- **Identifiants gardés** (`map.ts:118-127`) :

```ts
  return {
    externalId: `conversation:${conversation.id}`,
    nature: 'fil',
    title: subject || `Conversation n°${conversation.number}`,
    url: conversation._links?.web?.href ?? null,
    updatedAt,
    origin: conversation.mailboxId == null ? {} : { inbox: String(conversation.mailboxId) },
    turns: [body, ...replies],
  };
```

  Tours : `body` (document : objet, statut, client, assigné, étiquettes), `thread:${thread.id}` (participant). `side` vient du type du fil, jamais du nom ; `internalNote: thread.type === 'note'`. L'identifiant de la conversation suffit à répondre ; `mailboxId` est en `origin.inbox`. `conversation.number` n'est gardé que dans le titre de repli.
- **Client existant** (`client.ts:257`, `helpscoutClient(access: Access, http: ConnectorHttp)`) : `user()` GET `/users/me` ; `conversations(since, page)` GET `/conversations`. Aucune écriture, et le POST ne sert qu'à la demande de jeton.
- **Manque pour écrire** : tout. Répondre ou noter sur une conversation, changer le statut ou l'assigné. [hors code] `POST /v2/conversations/{id}/reply`, `POST /v2/conversations/{id}/notes`, `PUT /v2/conversations/{id}`, `POST /v2/conversations`. Il faut aussi `customerId` (non gardé : `primaryCustomer` ne garde que prénom, nom, email). Le client commun envoie du JSON, ce que la doc accepte (`connector.ts:9-15`). Jamais essayé en réel (`triedForReal: false`).

### 8.2 HubSpot

- **Fichiers** : `hubspot/connector.ts` (145 lignes), `client.ts` (127), `read.ts`, `email.ts`, `schemas.ts`, `map.ts` (132), `cursor.ts` (54), `oauth.ts` (79), `catalog.ts` (33), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : deux modes (`connector.ts:69-80`). Clé collée : `token` (jeton d'appli privée « legacy », `secretFields: ['token']`). Bouton OAuth natif : `accessToken`, jeton de 30 minutes, renouvelé par le socle. Pas de PKCE, `clientAuth: 'body'`. Les deux jetons partent en `Authorization: Bearer` (`tokenOf`, privé, `connector.ts:84`). Seul un super administrateur du compte peut installer l'appli.
- **Portées** (`oauth.ts:60-71`) :

```ts
  scopes: [
    'oauth',
    'crm.objects.contacts.read',
    'crm.objects.companies.read',
    'crm.objects.deals.read',
    'crm.objects.owners.read',
    'sales-email-read',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'crm.objects.contacts.write',
    'crm.objects.companies.write',
    'crm.objects.deals.write',
  ],
```

  Avec une clé collée, le catalogue ne demande que les cinq de lecture (`catalog.ts`, `keyHelp`). Une clé ne peut donc pas écrire, sauf si créée plus large. Ces droits d'écriture permettent aussi de supprimer (guide OAuth).
- **API** : `https://api.hubapi.com`, version datée `2026-03` (`client.ts:17-18`). Hôte : `api.hubapi.com`. Les adresses `/v3` et `/v4` sont jugées héritées.
- **Relevé** : quatre sortes d'activité, dans l'ordre de `ENGAGEMENTS` (`map.ts:31-`) : `notes`, `calls`, `meetings`, `emails`. Par sorte : `POST /crm/objects/2026-03/{sorte}/search` avec filtre `hs_lastmodifieddate GTE`, tri ASCENDING, 100 par page (`client.ts:44-65`). Puis, pour la fiche liée : `POST /crm/associations/2026-03/{sorte}/{companies|deals|contacts}/batch/read`, `POST /crm/objects/2026-03/{genre}/batch/read` pour les noms, `GET /crm/owners/2026-03` (actifs puis archivés, 20 pages au plus). `GET /account-info/2026-03/details` pour `portalId`. Propriétés de la note : `hs_note_body`, `hubspot_owner_id`, `hs_lastmodifieddate` (`map.ts:37`).
- **Non relevé** : les fiches elles-mêmes (contacts, entreprises, affaires : seuls leurs noms servent de titre), les tâches, les pièces jointes, les transcriptions d'appel (`connector.ts:63-64`). Aucun lien vers l'original.
- **Curseur** (`cursor.ts:24-30`) :

```ts
const CursorSchema = z.object({
  notes: Instant,
  calls: Instant,
  meetings: Instant,
  emails: Instant,
  done: z.number().int().nonnegative().optional(),
});
```

  Une borne en millisecondes par sorte. Elle recule de 5 minutes quand la recherche d'une sorte est finie (`OVERLAP_MS`), car l'index de HubSpot a du retard. `done` : nombre de sortes lues en entier dans le tour. La recherche s'arrête à 10 000 résultats (`SEARCH_PAGES_MAX = 100`, `client.ts:20`) : au-delà, elle repart de la date de la dernière fiche lue. Limite écrite : plus de 200 fiches sur la même milliseconde ne passeraient jamais sous le plafond (`cursor.ts:14-15`).
- **Débit** : `minIntervalMs: 250` (5 recherches par seconde et par compte, `connector.ts:126`). Un 403 sur propriétaires, liens ou noms est attrapé (`optional`, `read.ts:10`) ; un 403 sur la recherche remonte.
- **Identifiants gardés** (`map.ts:116-121`) : `externalId: `${spec.prefix}:${hit.id}`` (`note:123`, `call:`, `meeting:`, `email:`), `nature: 'note'` pour les quatre, `url: null` (« HubSpot ne documente aucun lien vers une fiche »), `origin: { type: spec.prefix, ...(linked ? { [ORIGIN_KEY[linked.kind]]: linked.name } : {}) }`. L'identifiant de la fiche liée (entreprise, affaire, contact) n'est **pas** gardé : seulement son nom. L'e-mail est attribué à l'expéditeur lu dans `hs_email_headers` (`email.ts:15`).
- **Client existant** (`client.ts:36`, `hubspotClient(token: string, http: ConnectorHttp)`) : `search(type, properties, { from, after?, limit? })` **POST** (lecture) ; `linked(type, kind, ids)` POST (lecture) ; `names(kind, ids)` POST (lecture) ; `owners()` GET ; `portalId()` GET. Un helper privé `post` existe, mais c'est une lecture.
- **Manque pour écrire** : tout. Créer une note, un appel, une réunion, un e-mail, associer à une fiche ; modifier une affaire. Il faut l'identifiant de la fiche liée (non gardé) et `hubspot_owner_id`. [hors code] `POST /crm/objects/2026-03/notes`, `PATCH /crm/objects/2026-03/deals/{id}`. D'après le commentaire d'`oauth.ts:22-25`, créer une activité exige `crm.objects.contacts.write`. Le relevé ne couvre pas les affaires : un agent de vente n'y verrait pas l'état du pipeline.
### 8.3 Intercom

- **Fichiers** : `intercom/connector.ts` (129 lignes), `client.ts` (111), `cursor.ts` (33), `map.ts` (133), `catalog.ts` (52), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement. Schéma `{ token, region }` (`connector.ts:61-64`), `secretFields: ['token']`. Le jeton d'accès de l'appli part en `Authorization: Bearer`, avec l'en-tête `Intercom-Version: 2.14` (`client.ts:65`). Pas de bouton.
- **Portées** : aucune dans le code. Le jeton « agit au nom de l'appli » et lit toutes les conversations, notes internes comprises (`catalog.ts` `warning`). Les permissions de l'appli se règlent chez Intercom : le code ne dit pas lesquelles la lecture exige (`connector.ts` « Non vérifié » : celle de `GET /me`).
- **API** : `https://${config.region}` (`client.ts:64`), version épinglée `API_VERSION = '2.14'` (`client.ts:8`). Hôtes : un seul parmi `api.intercom.io`, `api.eu.intercom.io`, `api.au.intercom.io` (`connector.ts:59`, `hosts: (config) => [config.region]`).
- **Relevé** : `POST /conversations/search` (filtre `updated_at > borne`, tri croissant, 100 par page, `starting_after`), puis un `GET /conversations/{id}` par conversation pour avoir les parties (messages et notes), au plus les 500 dernières (`client.ts:79-107`). `GET /me` pour `verify`. Un 403 ou 404 sur le détail laisse la conversation avec son premier message (`connector.ts:69-77`).
- **Non relevé** : contacts, entreprises, articles, tickets Intercom (objet distinct des conversations), pièces jointes, appels. Une conversation sans texte sort sans tour et est écartée par le socle. Le détail perd les débuts d'une conversation de plus de 500 parties.
- **Curseur** (`cursor.ts:9`) :

```ts
const MarkSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
```

  `at` : secondes de la dernière conversation rendue ; `seen` : les numéros déjà rendus à cette seconde. La recherche repart d'une seconde avant (`connector.ts:86`).
- **Débit** : pas de `minIntervalMs`, aucune logique propre. Une requête de détail par conversation multiplie les appels.
- **Identifiants gardés** (`map.ts:121-132`) : `externalId: `conversation:${conversation.id}``, `nature: 'fil'`, `url: null` (« Intercom ne donne pas de lien vers la boîte de réception »), `origin: { channel?, team? }` (canal de la source, équipe assignée si différente de `'0'`). Tours : premier message, puis `part:${part.id}`, avec `side` et `internalNote`. Le commentaire cite une URL non documentée `https://app.intercom.com/a/inbox/<app id_code>/inbox/shared/all/conversation/<numéro>` (`app.id_code` vient de `GET /me`), « à essayer en réel ». L'identifiant de conversation suffit pour répondre par l'API.
- **Client existant** (`client.ts:63`, `intercomClient(config: { token: string; region: string }, http: ConnectorHttp)`) : `me()` GET `/me` ; `search(updatedAfter, startingAfter?, perPage = 100)` **POST** `/conversations/search` (lecture) ; `conversation(id)` GET `/conversations/{id}`. Aucune écriture.
- **Manque pour écrire** : tout. Répondre, noter, assigner, fermer. [hors code] `POST /conversations/{id}/reply` (types `admin` et `note`), `POST /conversations/{id}/parts`. Il faut un identifiant d'administrateur (`admin_id`), que le client ne garde pas (`me()` ne rend que nom et espace). Le jeton collé devra avoir la permission d'écrire : rien ne la vérifie.
### 8.4 Jira

- **Fichiers** : `jira/connector.ts` (176 lignes), `client.ts` (102), `access.ts` (partagé avec Confluence), `oauth.ts` (80, `atlassianOAuth(scopes)` partagé avec Confluence), `jql.ts`, `adf.ts`, `map.ts` (53), `catalog.ts` (49), `connector.test.ts`, `adf.test.ts`, `jql.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : deux modes (`access.ts:18-25`). Clé collée : `site` (sous-domaine seul), `email`, `apiToken` (`secretFields: ['apiToken']`), envoyés en `Authorization: Basic` (`access.ts:78-85`) ; le jeton doit être un jeton d'API ordinaire (un jeton « avec portées » ne passe que par `api.atlassian.com`, `connector.ts:28`). Bouton OAuth natif Atlassian : `accessToken`, `cloudId`, `site`, appels par la passerelle `https://api.atlassian.com/ex/jira/<cloudId>` en `Bearer`. Une seule appli Atlassian pour Jira et Confluence (appKey `ATLASSIAN`). `pkce: false`, `clientAuth: 'body'`, `tokenBody: 'json'`, `extraAuthorizeParams: { audience: 'api.atlassian.com', prompt: 'consent' }`, `preFields: ['site']` (`oauth.ts:55-66`). `toConfig` appelle `https://api.atlassian.com/oauth/token/accessible-resources` et garde le site saisi, sinon le premier.
- **Portées** (`connector.ts:147-152`) :

```ts
  oauth: atlassianOAuth([
    'read:jira-work',
    'read:jira-user',
    'write:jira-work', // Leon n'écrit pas encore : l'accès est demandé d'avance
    'offline_access',
  ]),
```

  Avec une clé collée, les droits sont ceux du compte qui a créé le jeton.
- **API** : REST v3 de Jira Cloud, `${root}/rest/api/3` (`client.ts:58`). Hôtes (`access.ts:49-50`) : `api.atlassian.com` avec le bouton, `<site>.atlassian.net` avec une clé.
- **Relevé** : `GET /rest/api/3/search/jql` avec `jql`, `fields=summary,description,comment,creator,reporter,project,updated`, `maxResults=50`, `nextPageToken` (`client.ts:8-11`, `:65-79`). La JQL est `updated >= "AAAA-MM-JJ HH:mm" ORDER BY updated ASC` (`jql.ts:34-40`), la date étant dans le fuseau lu par `GET /myself` à chaque passage. Si le ticket a plus de commentaires que la recherche n'en rend (`total`), `GET /issue/{id}/comment` (100 par page, 1000 au plus, `COMMENTS_MAX`, on garde les plus anciens). Descriptions et commentaires sont de l'ADF, lus par `adfToText(value: unknown): string` (`adf.ts:130`).
- **Non relevé** : statut, priorité, type, assigné, étiquettes, sprint, champs personnalisés, pièces jointes, historique, sous-tâches, liens entre tickets (seuls `FIELDS` ci-dessus sont demandés). Le champ `created` n'est pas demandé. Les projets, tableaux et sprints ne sont pas lus.
- **Curseur** (`connector.ts:68-71`) :

```ts
const CursorSchema = z.object({
  at: z.iso.datetime(),
  seen: z.array(z.object({ id: z.string(), at: z.iso.datetime() })),
});
```

  `at` : modification du dernier ticket ; `seen` : tickets rendus dans les 2 minutes qui précèdent (`KEEP_MS`). La recherche relit depuis 1 minute avant le curseur (`RESCAN_MS`), car la date JQL est à la minute. Limites écrites : l'index est « cohérent à terme » (un ticket en retard de plus d'une minute n'est repris qu'à sa prochaine modification) ; à l'heure d'automne, une heure locale répétée peut faire manquer jusqu'à une heure de tickets (`connector.ts:44-46`).
- **Débit** : pas de `minIntervalMs`. Aucune logique propre de 429. Une page de 50 tickets avec leurs commentaires, plus une lecture de commentaires par ticket trop long.
- **Identifiants gardés** (`map.ts:45-50`) : `externalId: `issue:${issue.id}`` (l'identifiant numérique, pas la clé, car la clé change quand le ticket change de projet, `connector.ts:26-27`), `nature: 'ticket'`, `url: https://${site}.atlassian.net/browse/${encodeURIComponent(key)}`, `origin: { site, project? }` (clé du projet). Tours : `body` (description, signée du créateur ou à défaut du rapporteur), `comment:${comment.id}`. **La clé du ticket (`LEON-12`) n'est pas dans `externalId` ni dans `origin` : elle n'est que dans l'URL.** Les routes REST acceptent l'identifiant numérique, donc `externalId` suffit à écrire. Le `cloudId` n'est pas gardé sur l'élément : il est dans la configuration de la connexion.
- **Client existant** (`client.ts:56`, `jiraClient(config: AtlassianConfig, http: ConnectorHttp)`) : `myself()` GET ; `search(jql)` générateur GET ; `comments(issueId)` GET. Aucune écriture, aucun POST.
- **Manque pour écrire** : tout. Commenter, créer un ticket, changer de statut, assigner. [hors code] `POST /rest/api/3/issue/{id}/comment`, `POST /rest/api/3/issue`, `POST /rest/api/3/issue/{id}/transitions`. **Piège** : le corps d'un commentaire est de l'ADF. `adf.ts` ne sait que lire (`adfToText`) : il faut écrire un convertisseur texte vers ADF. Pour une transition, il faut d'abord lire les transitions possibles (`GET .../transitions`). Le droit `write:jira-work` est demandé ; avec une clé collée, l'écriture dépend du compte. Jamais essayé en réel.
### 8.5 Leexi

- **Fichiers** : `leexi/connector.ts` (72 lignes), `client.ts` (104), `map.ts` (138), `catalog.ts` (41), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement, deux champs (`connector.ts:33-39`) : `keyId` (sans espace ni `:`) et `keySecret`. `secretFields: ['keySecret', 'keyId']` : les deux sont chiffrés. Envoyés en `Authorization: Basic base64(keyId:keySecret)` (`client.ts:52-54`).
- **Portées** : aucune (clé d'API). Le plan « AI Meeting » est le minimum (`catalog.ts` `warning`). Le code ne dit pas si la clé peut écrire.
- **API** : `https://public-api.leexi.ai/v1/calls` (`client.ts:6-7`). Hôte : `public-api.leexi.ai`. Pas de version dans l'adresse autre que `/v1`.
- **Relevé** : `GET /v1/calls` avec `from`, `date_filter=updated_at`, `order=updated_at asc`, `items=25`, `page`, `with_simple_transcript=true` (`client.ts:81-103`). Une requête par page de 25. La transcription simple (« Nom (00:00 - 00:10) » puis le texte) devient une suite de tours `utterance:${index}` ; le résumé (`summary`) ne sert que sans transcription. `verify` : `GET /v1/calls?items=1`, qui rend le nombre d'appels visibles.
- **Non relevé** : `GET /calls/{uuid}` (transcription mot par mot), les invites hors catégorie `summary` (`prompts` : seules celles de la catégorie `summary` servent, à défaut du champ `summary`, `map.ts:89-95`), enregistrements audio ou vidéo, tâches, CRM.
- **Curseur** : une date ISO, `updated_at` du dernier appel rendu (`connector.ts:42-46`, `:65-69`). Le serveur peut rendre l'appel du curseur lui-même (`from` inclusif) : il est écarté par `Date.parse(call.updated_at) > after`. Limite écrite : un appel encore sans texte est sauté et ne revient que s'il est modifié (`connector.ts:26-27`).
- **Débit** : `minIntervalMs: 1200` (50 requêtes par minute et par clé, `connector.ts:54`). Un 402 devient `ConnectorHttpError(402, 'Leexi subscription inactive')` : le forfait est inactif, pas la clé (`client.ts:65-68`).
- **Identifiants gardés** (`map.ts:130-135`) : `externalId: `call:${call.uuid}``, `nature: 'reunion'`, `url: httpsUrl(call.leexi_url)` (le lien existe ; la doc le montre avec « ... », « à vérifier »), `origin: { participants }` ou `{}`. Tours : `summary`, `utterance:${index}`.
- **Client existant** (`client.ts:56-103`) : `getCalls` (privé), `countCalls(http, credentials)`, `callPages(http, credentials, from)`. Toutes en GET. Aucune écriture.
- **Manque pour écrire** : sans objet pour l'essentiel : une réunion enregistrée ne se réécrit pas. Le code ne cite aucun point d'écriture de l'API Leexi. Un agent ne peut que lire. Ce que l'API permet d'écrire n'a pas été vérifié.

### 8.6 Linear

- **Fichiers** : `linear/connector.ts` (156 lignes), `client.ts` (169), `oauth.ts` (28), `map.ts` (72), `catalog.ts` (31), `connector.test.ts`, `oauth.test.ts`, `fixtures/`. Pas de `cursor.ts` : le curseur est dans `connector.ts`.
- **Authentification** : deux modes (`connector.ts:46-58`). Clé personnelle : `apiKey`, envoyée **telle quelle** dans `Authorization` (« Bearer » est réservé aux jetons OAuth, `client.ts:101-106`). Bouton OAuth natif : `accessToken`, en `Bearer`. PKCE S256, `clientAuth: 'body'`, `scopeSeparator: ','`, `extraAuthorizeParams: { actor: 'user' }` (`oauth.ts:15-27`).
- **Portées** (`oauth.ts:19`) :

```ts
  scopes: ['read', 'write'], // write : Leon n'écrit pas encore, l'accès est demandé d'avance
```

- **API** : GraphQL, `https://api.linear.app/graphql` (`client.ts:8`). Hôte : `api.linear.app`. Un seul point d'entrée, POST. `acceptStatus: [400]` : limite de débit et erreurs de requête (`client.ts:121`).
- **Relevé** : deux flux (`STREAMS`, `connector.ts:104-115`). `issues(first: 50, after, filter: { updatedAt: { gt } }, orderBy: updatedAt)` avec, par ticket, `id identifier title description url updatedAt creator team project` et `comments(first: 50)` (`client.ts:22-33`). `projectUpdates(...)` : `id body url updatedAt user project` (`client.ts:35-40`). `ACCOUNT_QUERY` : `viewer { id name } organization { id name }`. Un 403 sur les mises à jour de projet est ignoré (`connector.ts:138-139`).
- **Non relevé** : statut (workflow state), priorité, assigné, étiquettes, cycle, estimation, pièces jointes, documents, initiatives, jalons, réponses aux commentaires (`children`, non lues, `connector.ts:41-42`), tickets archivés. Au-delà de 50 commentaires, le ticket sort avec ceux que l'outil rend.
- **Curseur** (`connector.ts:60-66`, `client.ts:18`) :

```ts
const stream = z.object({
  from: z.string(),
  top: z.string().nullable(),
  after: z.string().nullable(),
});
const cursorSchema = z.object({ issues: stream, updates: stream });
```

  Le tri `orderBy: updatedAt` rend les plus récents d'abord, et l'argument `sort` croissant est marqué `[INTERNAL]` : le curseur est une **position dans un parcours du plus récent au plus ancien** (`after`), avec `top` la modification la plus récente vue. À la fin du parcours, `top` devient le `from` du suivant (`connector.ts:26-30`, `:142-146`).
- **Débit** : pas de `minIntervalMs`. La limite de Linear est de complexité (10 000 points par requête) : 50 tickets x 50 commentaires font environ 6 600 points, calculés à la main (`client.ts:11-12`, « non vérifié »). Une limite atteinte se reconnaît à `extensions.code = RATELIMITED` et devient un `ConnectorHttpError(429, ...)` (`client.ts:92-94`).
- **Identifiants gardés** (`map.ts:40-47`, `:56-61`) : `externalId: `issue:${issue.id}`` (l'UUID, pas l'identifiant lisible `LEO-12`, qui change avec l'équipe), `nature: 'ticket'`, `title: `${issue.identifier} ${issue.title}``, `url: issue.url`, `origin: { team: nom, project?: nom }`. Pour les mises à jour de projet : `project-update:${update.id}`, `nature: 'note'`. Tours : `body`, `comment:${comment.id}`. Les identifiants d'équipe et de projet ne sont **pas** gardés, seulement leurs noms. Écrire un ticket demande l'identifiant d'équipe : il faut le relire par l'API.
- **Client existant** (`client.ts`, exportées) : `authorizationOf(config: Credentials): string`, `fetchAccount(http, authorization)`, `fetchIssues(http, authorization, stream)`, `fetchProjectUpdates(http, authorization, stream)`. Le privé `graphql(http, authorization, query, variables, data)` est un **POST** générique : il sert déjà aux lectures et peut servir aux mutations, car il lit `errors` et valide `data`. Seul point d'accroche d'écriture le plus proche du but dans les 21.
- **Manque pour écrire** : les mutations elles-mêmes et leurs schémas. [hors code] `commentCreate`, `issueCreate`, `issueUpdate` (GraphQL). Il manque aussi les identifiants d'équipe et d'état. Il faudra exporter `graphql`. Les droits `write` sont demandés au bouton ; une clé personnelle écrit avec les droits de son propriétaire.
### 8.7 Miro

- **Fichiers** : `miro/connector.ts` (90 lignes), `client.ts` (127), `oauth.ts` (57), `cursor.ts` (35), `map.ts` (81), `catalog.ts` (24), `connector.test.ts`, `map.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : bouton OAuth natif **seulement**, pas de clé collée (`connector.ts:37-46`) : `authMode: z.literal('oauth')`, `accessToken`, `refreshToken`, `expiresAt`, `teamId`. `secretFields: []` (le socle chiffre les jetons à part). Pas de PKCE, `clientAuth: 'body'`, `tokenBody: 'query'` (paramètres d'adresse, corps vide). `toConfig` garde `team_id` de la réponse de jeton (`oauth.ts:45-56`). Piège écrit : les jetons qui expirent sont une option de l'appli, **non modifiable après création** ; sans elle, pas de `refresh_token` et le jeton dure jusqu'à la désinstallation (`oauth.ts:29-31`). Le refus de Miro n'a pas la forme RFC 6749 (`{ status, code, message, type: 'error' }`), le socle le compte comme un refus.
- **Portées** : `scopes: []` (`oauth.ts:49`). Aucun paramètre `scope` : les droits `boards:read` et `boards:write` se règlent dans la console de l'appli (`oauth.ts:24-26`, `docs/guides/applis-oauth.md`). L'écriture est déjà accordée si la console la coche. Le droit d'écriture le plus étroit permet aussi de supprimer (guide).
- **API** : `https://api.miro.com`, routes `/v2/...` et `/v1/oauth-token` (`client.ts:6`). Hôte : `api.miro.com`.
- **Relevé** : `GET /v2/boards` (`team_id`, `sort=last_created`, `limit=50`, `offset`) : **tous** les tableaux de l'équipe, car la liste n'a pas de filtre « modifié depuis » (`client.ts:76-103`). Les tableaux modifiés après le curseur sont gardés et triés ici. Puis `GET /v2/boards/{id}/items` (50 par page, curseur Miro, `ITEM_PAGES_MAX = 20` soit 1 000 éléments au plus). Un tableau devient un seul tour `document` (notes, textes, formes, cartes, cadres, documents). `verify` : `GET /v1/oauth-token`. Un 403 ou 404 sur les éléments rend le tableau avec sa seule description.
- **Non relevé** : commentaires, images, connecteurs, tags (`connector.ts:29`). Les éléments au-delà de 1 000 par tableau.
- **Curseur** (`cursor.ts:10`) :

```ts
const CursorSchema = z.object({ at: z.iso.datetime(), ids: z.array(z.string()) });
```

  Date de dernière modification des tableaux rendus, et ceux qui l'ont à cette date. Lot de `BOARDS_PER_BATCH = 5` tableaux par page rendue (`connector.ts:49`). Non vérifié : qu'une retouche d'élément fait avancer `modifiedAt` du tableau (`connector.ts:31-33`).
- **Débit** : pas de `minIntervalMs`. À chaque passage, la liste entière des tableaux est relue : coût proportionnel au nombre de tableaux de l'équipe.
- **Identifiants gardés** (`map.ts:65-70`) : `externalId: `board:${board.id}``, `nature: 'page'`, `url: board.viewLink ?? null`, `origin: { team?, project? }` (noms). Un seul tour `body`. **L'identifiant des éléments (notes, cartes) n'est pas gardé** : le texte du tableau est fondu en un tour. Écrire sur une note précise est donc impossible sans relire le tableau.
- **Client existant** (`client.ts:60`, `miroClient(accessToken: string, http: ConnectorHttp)`) : `account()` GET ; `boards(teamId)` GET ; `items(boardId)` GET. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] créer une note adhésive ou un texte sur un tableau (`POST /v2/boards/{id}/sticky_notes`), modifier un élément. Il faut les identifiants d'élément (non gardés).

### 8.8 Missive

- **Fichiers** : `missive/connector.ts` (113 lignes), `client.ts` (154), `schemas.ts`, `cursor.ts` (35), `map.ts` (78), `catalog.ts` (30), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ token }` (`connector.ts:52`), `secretFields: ['token']`, `Authorization: Bearer`. Forfait Productive requis pour créer un jeton d'API (`catalog.ts` `warning`).
- **Portées** : aucune dans le code. Le jeton suit les droits de son créateur.
- **API** : `https://public.missiveapp.com/v1` (`client.ts:18`). Hôte : `public.missiveapp.com`.
- **Relevé** : `GET /teams` ; par équipe, `GET /conversations?team_all=<id>&limit=50&until=` (boîte « Tout » de chaque équipe, du plus récent au plus ancien jusqu'à `from`, `client.ts:75-113`) ; par conversation retenue, `GET /conversations/{id}/messages` (10 par page, `until`), `GET /messages/{ids}` (les corps, par groupes de 10) et `GET /conversations/{id}/comments`. `verify` : `GET /users`, `GET /organizations`, `GET /teams` ; **elle échoue si aucune équipe n'est visible** (« Leon reads team conversations, not personal email », `connector.ts:99-104`).
- **Non relevé** : la boîte « Tous » de l'utilisateur est **volontairement exclue** (courrier personnel que Leon rendrait visible de toute l'équipe, `client.ts:104-105`). Pièces jointes, brouillons, tâches, contacts. Le 403 ou 404 sur messages ou commentaires est toléré (`tolerate`, `client.ts:24`).
- **Curseur** (`cursor.ts:6`) :

```ts
const CursorSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
```

  `at` : `last_activity_at` en secondes de la dernière conversation rendue ; `seen` : celles déjà rendues à cette seconde. Les listes ne se lisent que du plus récent au plus ancien : `readBack` remonte avec `until` jusqu'au plancher (`client.ts:38-55`), puis le connecteur trie localement. Pages rendues de `PAGE_SIZE = 20` conversations (`connector.ts:55`), « chacune coûte au moins trois requêtes ».
- **Débit** : `minIntervalMs: 1000` (`connector.ts:93`).
- **Identifiants gardés** (`map.ts:69-75`) : `externalId: `conversation:${conversation.id}``, `nature: 'fil'`, `url: conversation.web_url ?? null`, `origin: { organization?, team?, labels? }`. Tours : `message:${message.id}` (`side: writer ? 'team' : 'external'`, `internalNote: false`) et `comment:${comment.id}` (`side: 'team'`, `internalNote: true`). Les identifiants d'équipe et d'organisation ne sont pas gardés, seulement leurs noms. L'`externalId` de conversation suffit pour répondre ou commenter.
- **Client existant** (`client.ts:58`, `missiveClient({ token }, http)`) : `users()`, `organizations()`, `teams()`, `conversations(from)`, `messages(conversationId)`, `comments(conversationId)`, tous GET ; exporte aussi `tolerate`. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] l'API publique de Missive écrit par `POST /v1/drafts` (brouillon ou envoi) et `POST /v1/posts` (message interne dans une conversation). À vérifier dans leur doc. Il faut aussi les identifiants de compte d'envoi et d'équipe, non gardés.
### 8.9 monday.com

- **Fichiers** : `monday/connector.ts` (171 lignes), `client.ts` (138), `queries.ts`, `oauth.ts` (46), `map.ts` (95), `catalog.ts` (36), `connector.test.ts`, `oauth.test.ts`, `fixtures/`. Pas de `cursor.ts` : le curseur est dans `connector.ts`.
- **Authentification** : deux modes (`connector.ts:41-53`). Jeton personnel collé : `token` (`secretFields: ['token']`). Bouton OAuth natif : `accessToken`. **Les deux partent tels quels dans `Authorization`, sans « Bearer »** (`connector.ts:55-61`, `client.ts:73-74`). Bouton : « nouveau flux » OAuth, PKCE S256, `clientAuth: 'body'`, `tokenBody: 'json'`, jetons qui expirent (renouvelés sur 401, faute d'`expires_in`). Il faut activer « New OAuth Flow » sur la version de l'appli (`oauth.ts:23-26`, guide OAuth).
- **Portées** (`oauth.ts:38`) :

```ts
  scopes: ['boards:read', 'updates:read', 'me:read', 'boards:write', 'updates:write'], // Leon n'écrit pas encore : l'accès est demandé d'av…
```

  Non vérifié : `account { name }` pourrait exiger `account:read`, `creator { name email }` `users:read`, `board { workspace }` `workspaces:read` (`oauth.ts:27-31`) ; si un branchement échoue sur un refus de droits, il faut les ajouter. Les droits d'écriture permettent aussi d'archiver et supprimer. Conditions d'utilisation : API réservée à un usage interne, à confirmer par écrit (`catalog.ts` `warning`).
- **API** : GraphQL, `https://api.monday.com/v2`, en-tête `API-Version: 2026-07` (`client.ts:16-19`). Hôte : `api.monday.com`. POST unique.
- **Relevé** : `boards(limit: 50, page, order_by: used_at) { id type }`, seuls les `type === 'board'` sont gardés (`queries.ts:9-11`, `client.ts:100-120`). Par tableau, `items_page(limit: 25, query_params: { order_by: [{ column_id: "__last_updated__", direction: desc }] })` puis `next_items_page(cursor, limit)` (`queries.ts:30-45`). Par élément : `id name url created_at updated_at creator board { name workspace { name } } group { title } column_values { type text column { title } }` et `updates(limit: UPDATES_MAX)` avec leurs `replies`. La sélection par date de modification n'accepte que des périodes, jamais un instant : on trie du plus récent au plus ancien et on **s'arrête au premier élément inchangé** (`connector.ts:20-22`, `:102-110`).
- **Non relevé** : sous-éléments, documents, tableaux à niveaux multiples (`connector.ts:27-29`), colonnes de type `name`, `last_updated`, `creation_log`, `file`, `button`, `subtasks`, `item_id` (`map.ts:12`, `SKIPPED_COLUMNS`), valeurs structurées des colonnes (seul `text` est lu). Un élément sans colonne remplie ni mise à jour n'est pas rendu.
- **Curseur** (`connector.ts:66-71`) :

```ts
const roundSchema = z.object({
  from: z.iso.datetime(),
  started: z.iso.datetime().nullable(),
  boards: z.array(z.string()).nullable(),
  after: z.string().nullable(),
});
```

  Un passage : `from` (éléments modifiés après), `started` (son début), `boards` (tableaux restants), `after` (curseur de l'outil dans le premier). En fin de passage, `from` = début du passage moins 5 minutes (`CLOCK_MARGIN_MS`). Un 410 (curseur de l'outil expiré après 60 minutes, `CursorException`, valeur vue sur un forum, pas dans la doc) repart du début du tableau (`connector.ts:127-130`). Limite écrite : publier une mise à jour ne change peut-être pas `updated_at` de l'élément ; un commentaire seul ne serait vu qu'à la prochaine modification (`connector.ts:35-36`).
- **Débit** : pas de `minIntervalMs`. Les codes de limite (complexité, quota journalier, concurrence, IP) deviennent `ConnectorHttpError(429)` (`client.ts:31-52`). 25 éléments par requête, loin du plafond de 5 000 000 de points.
- **Identifiants gardés** (`map.ts:83-92`) : `externalId: `item:${item.id}``, `nature: 'ticket'`, `title: item.name`, `url: item.url`, `origin: { workspace?, board?, group? }` (noms seulement). Tours : `body` (nom + colonnes), `update:`/`reply:` suivis de l'identifiant (`${kind}:${comment.id}`). **L'identifiant du tableau n'est pas gardé** (seulement son nom) ; monday.com demande l'identifiant du tableau pour créer un élément.
- **Client existant** (`client.ts`, exportées) : `fetchAccount(http, token)`, `fetchBoardIds(http, token)`, `fetchItems(http, token, boardId, after)`. Le privé `graphql(http, token, query, variables, data)` est un POST générique, utilisable pour des mutations.
- **Manque pour écrire** : les mutations. [hors code] `create_update(item_id, body)` pour commenter, `create_item`, `change_column_value`. Il faut exporter `graphql` et garder les identifiants de tableau et de colonne.

### 8.10 Notion

- **Fichiers** : `notion/connector.ts` (237 lignes), `client.ts` (145), `blocks.ts`, `oauth.ts` (49), `map.ts` (102), `catalog.ts` (34), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : deux modes (`connector.ts:48-62`). Clé collée : `token` (jeton d'intégration interne, `secretFields: ['token']`). Bouton OAuth natif (intégration publique) : `accessToken`, plus `workspaceName` et `botId` gardés par `toConfig`. Les deux partent en `Authorization: Bearer` avec `notion-version: 2026-03-11` (`client.ts:7`, `:77-80`). `clientAuth: 'basic'`, `tokenBody: 'json'`, pas de PKCE, `extraAuthorizeParams: { owner: 'user' }` (`oauth.ts:32-48`). La réponse de jeton n'a pas d'`expires_in` : `expiresAt` reste nul, le socle ne renouvelle qu'au premier 401 d'un passage ; le renouvellement rend un nouveau jeton d'accès et un nouveau jeton de rafraîchissement.
- **Portées** : `scopes: []` (`oauth.ts:36`). Les droits sont les **capacités cochées dans le portail Notion** (lire le contenu, lire les commentaires, lire les personnes avec e-mail ; en écriture, mettre à jour et insérer du contenu, insérer des commentaires, d'après `docs/guides/applis-oauth.md`). L'utilisateur choisit les pages à partager pendant l'autorisation. Une clé d'intégration interne n'ouvre que ce qu'on lui a partagé.
- **API** : `https://api.notion.com/v1` (`client.ts:8`). Hôte : `api.notion.com`.
- **Relevé** : `POST /v1/search` (filtre `object = page`, tri `last_edited_time` **descendant**, 100 par page, `start_cursor`) ; par page, `GET /v1/blocks/{id}/children` (récursif jusqu'à `LEVELS_MAX = 3`, `blocks.ts:6`), `GET /v1/comments?block_id=<page>` (commentaires non résolus de la page), `GET /v1/users/{id}` pour les auteurs (`client.ts:84-144`). `GET /v1/users/me` pour `verify`. Blocs écartés : `code`, `equation`, `child_page`, `child_database` (`blocks.ts:15`).
- **Non relevé** : les lignes de bases de données (leurs propriétés autres que le titre), les commentaires résolus, les commentaires d'un passage précis (sur le bloc, pas sur la page), les blocs de réunion autrement que par leurs enfants, les blocs synchronisés (`connector.ts:35-37`). Une page sans texte ni commentaire n'est pas rendue. Seules les pages partagées avec la connexion sont vues.
- **Curseur** : deux formes JSON (`connector.ts:73-82`). Repère `{ at, ids }` : date de la dernière page rendue et pages déjà rendues à cette date. **Remplissage** `{ fill: { after, upto, top } }` au premier passage : la recherche descendante, avec la position `after`, pour ne pas relire toute la recherche à chaque passage de 200 éléments ; à la fin il devient le repère de `top`. Les passages suivants lisent la recherche du plus récent jusqu'à la première page antérieure au repère, puis rendent les pages de la plus ancienne à la plus récente, par lots de `PAGES_PER_BATCH = 10`. Limites écrites : une page modifiée deux fois dans la même minute de part et d'autre de la lecture garde sa première version jusqu'à la modification suivante ; la validité d'un `start_cursor` d'une relève à l'autre n'est pas vérifiée (`connector.ts:38-43`, `:156`).
- **Débit** : `minIntervalMs: 350` (`connector.ts:203`). Aucune autre logique de 429 que celle du client commun.
- **Identifiants gardés** (`map.ts:94-99`) : `externalId: `page:${page.id}``, `nature: 'page'`, `title: titleOf(page)` (propriété de type `title`, sinon « Sans titre »), `url: page.url ?? null`, `origin: { parent }` où `parent` vaut `${parent.type}:${id}` (par exemple `database_id:...` ou `page_id:...`) ou le seul type. Tours : `body` (texte des blocs), `comment:${comment.id}`. L'`externalId` suffit pour écrire dans la page : c'est son identifiant. Les identifiants des blocs ne sont pas gardés.
- **Client existant** (`client.ts`, exportées, `Api = { http, token }`) : `fetchMe(api)`, `fetchUser(api, id)`, `searchPages(api, startCursor)` (**POST** `/search`, lecture), `fetchChildren(api, parentId)`, `fetchComments(api, pageId)`. `authed(api, request)` (privé) ajoute les en-têtes. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] ajouter des blocs (`PATCH /v1/blocks/{id}/children`), créer une page (`POST /v1/pages`), mettre à jour des propriétés (`PATCH /v1/pages/{id}`), commenter (`POST /v1/comments`). `blocks.ts` ne sait que lire le texte (`pageText`, `plainText`), pas produire des blocs. Pour les bases de données, il faudrait lire le schéma des propriétés, qui n'est pas lu aujourd'hui.
### 8.11 Outlook

- **Fichiers** : `outlook/connector.ts` (149 lignes), `client.ts` (71), `schemas.ts`, `cursor.ts` (45), `map.ts` (123), `oauth.ts` (81), `catalog.ts` (23), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : bouton OAuth natif **seulement** (`connector.ts:43-50`) : `authMode: z.literal('oauth')`, `accessToken`, `refreshToken`, `expiresAt`, `secretFields: []`. Microsoft Graph, comptes professionnels ou scolaires seulement (locataire `organizations`). PKCE S256, `clientAuth: 'body'`, `extraAuthorizeParams: { response_mode: 'query' }`, `extraTokenParams` avec `scope` à l'échange et au renouvellement. Le jeton part en `Bearer`. **`adminConsent`** : un refus faute d'accord de l'administrateur (`consent_required`, AADSTS90094, 90095, 65001) donne un lien d'accord (`oauth.ts:66-77`) ; c'est le seul des 21 à l'utiliser.
- **Portées** (`oauth.ts:44-45`) :

```ts
// Leon n'écrit pas encore : l'accès est demandé d'avance.
const SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Calendars.ReadWrite'];
```

  `Mail.ReadWrite` permet de lire, créer et modifier du courrier, et de le supprimer ; il ne permet **pas** d'envoyer : l'envoi demande `Mail.Send`, non demandé. `Calendars.ReadWrite` couvre la création d'événements. (Le fait que `Mail.Send` manque vient de la liste ci-dessus ; ce que chaque droit autorise vient de la connaissance de Graph, pas du dépôt.)
- **API** : `https://graph.microsoft.com/v1.0` (`client.ts:8`). Hôte : `graph.microsoft.com`. En-tête `Prefer: outlook.body-content-type="text"` pour avoir le texte.
- **Relevé** : trois flux dans l'ordre (`connector.ts:72-110`) : `GET /me/mailFolders/inbox/messages`, `GET /me/mailFolders/sentitems/messages` (filtre `receivedDateTime ge`, tri `asc`, `$top=25`, champs `id,conversationId,subject,receivedDateTime,from,body,webLink`), puis `GET /me/events` (filtre et tri sur `lastModifiedDateTime`, champs `id,subject,lastModifiedDateTime,start,end,location,organizer,isOrganizer,isCancelled,sensitivity,attendees,body,webLink`, séries entières, pas leurs occurrences). Pages par `@odata.nextLink`. `GET /me` pour `verify`.
- **Non relevé** : les destinataires (`to`, `cc`) des mails (seul `from` est lu), les pièces jointes, les brouillons, indésirables, éléments supprimés (dossiers non lus), les autres dossiers, les contacts, les tâches. Les événements privés, personnels ou confidentiels, ou sans participant ni description, ne sont pas rendus ; un événement devenu privé est **retiré** par `removed: event:<id>` (`connector.ts:106-107`). Un 403 sur l'agenda le laisse de côté sans arrêter le courrier (`connector.ts:143-144`).
- **Curseur** (`cursor.ts:7-12`) :

```ts
export const MarkSchema = z.object({ at: z.iso.datetime(), seen: z.array(z.string()) });
const CursorSchema = z.object({
  inbox: MarkSchema.nullable(),
  sent: MarkSchema.nullable(),
  events: MarkSchema.nullable(),
});
```

  Une position par flux : instant du dernier élément lu et identifiants déjà lus à cet instant (Graph date à la seconde, `ge` rend l'élément du curseur). Limites écrites : un fil ne revient qu'avec les messages lus pendant le passage, pas toute la conversation (`connector.ts:23-26`) ; une restauration d'un courrier supprimé change son identifiant et serait relu en doublon (`connector.ts:41`) ; les identifiants de message (environ 150 caractères) pourraient dépasser les 180 d'un tour.
- **Débit** : pas de `minIntervalMs`. Graph : 10 000 requêtes par 10 minutes et par boîte, jugé très loin (`connector.ts:38`).
- **Identifiants gardés** : `connector privateRaw: true` (`connector.ts:118`) : **seul celui qui a branché voit le texte**. Courrier (`map.ts:47-52`) : `externalId: `thread:${id}`` où `id` est le `conversationId`, `nature: 'fil'`, `url: last.message.webLink ?? null`, `origin: {}`, tours `message:${message.id}` (`side: 'team'` pour les éléments envoyés). Agenda (`map.ts:106-111`) : `externalId: `event:${event.id}``, `nature: 'reunion'`, `url: event.webLink ?? null`, `origin: { participants }`, tour `body` (`side: 'team'` si `isOrganizer`). L'identifiant d'événement et l'identifiant de message sont donc gardés (le message dans le tour, avec empreinte). Il n'y a **pas** d'élément `mail` : la nature est `fil`. Un fil des deux dossiers sort en deux éléments de même identifiant, fusionnés à l'ingestion.
- **Client existant** (`client.ts:35`, `graphClient({ accessToken }, http)`) : `me()`, `messages(folder: 'inbox' | 'sentitems', from: Date)`, `events(from: Date)`, tous GET (les deux derniers rendent un générateur de pages). Aucune écriture.
- **Manque pour écrire** : tout. [hors code] répondre à un courrier (`POST /me/messages/{id}/reply` ou `createReply` puis `send`, ce dernier exigeant `Mail.Send`), créer un brouillon (`POST /me/messages`), créer un événement (`POST /me/events`). L'envoi exige un droit non demandé aujourd'hui : il faudra **refaire autoriser** les utilisateurs, et probablement l'accord de l'administrateur, ce que la décision du 23/10/2026 voulait éviter. La seule écriture possible sans nouveau droit est le brouillon.

### 8.12 Pipedrive

- **Fichiers** : `pipedrive/connector.ts` (126 lignes), `client.ts` (76), `stream.ts`, `schemas.ts`, `map.ts` (107), `catalog.ts` (39), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ company, token }` (`connector.ts:46-54`). `company` : sous-domaine seul (`^[a-z0-9][a-z0-9-]{0,62}$`, l'adresse appelée en dépend). `token` : jeton d'API, `secretFields: ['token']`, envoyé dans l'en-tête `x-api-token` (`client.ts:20`). Pas de bouton.
- **Portées** : aucune. Le jeton d'API a les droits de l'utilisateur qui l'a généré, écriture comprise. Le code cite un « accord de développeur » (appli privée non commerciale) à vérifier (`connector.ts:44`).
- **API** : `https://<company>.pipedrive.com/api` (`client.ts:19`), **v1 pour les notes, v2 pour les activités** (`GET /v1/activities` est hors support depuis le 1er août 2026). Hôte : `<company>.pipedrive.com` (`connector.ts:108`).
- **Relevé** : `GET /v1/notes` (`updated_since`, `sort=update_time ASC,id ASC`, `limit=100`, `start` : rang), `GET /v2/activities` (`updated_since`, `sort_by=update_time`, `sort_direction=asc`, `limit=100`, `cursor` opaque), `GET /v1/users` (une fois par passage, pour les noms d'auteur des activités), `GET /v1/users/me` pour `verify` (`client.ts:22-72`). Ordre : notes, puis activités. Une note ou une activité sort en un seul tour `body`.
- **Non relevé** : les affaires, personnes et organisations elles-mêmes (donc ni étape de pipeline, ni montant, ni statut), les commentaires des notes (un appel par note, budget quotidien serré), les e-mails, les fichiers, les produits. Écartés : note supprimée (`active_flag === false`), activité supprimée, activité sans note ni description (`connector.ts:23-27`).
- **Curseur** (`stream.ts:10-11`) :

```ts
const MarkSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) });
const CursorSchema = z.object({ notes: MarkSchema.optional(), activities: MarkSchema.optional() });
```

  Un repère par liste : instant de la dernière ligne lue et lignes lues à cet instant. Après chaque page la lecture repart du repère (jamais d'un rang, qui bouge quand une note est retouchée). Le rang ou le curseur de l'outil ne sert que si une page entière est déjà lue (`stream.ts:3-8`, `:67`).
- **Débit** : pas de `minIntervalMs`. Pipedrive a un budget quotidien de « jetons » par forfait et une rafale sur 2 secondes (429). `x-ratelimit-reset` donne un temps restant, ignoré par le client commun, qui attend 2, 4, 8 s ; un budget épuisé répond 429 jusqu'à minuit (heure Pipedrive), la connexion passe en erreur pour une heure (`connector.ts:38-40`).
- **Identifiants gardés** (`map.ts:46-52`, `:94-104`) : note : `externalId: `note:${note.id}``, `nature: 'note'`, `url: pageUrl(company, { dealId, personId, orgId })`, `origin: { company, deal?, person?, organization? }` (**noms**). Activité : `externalId: `activity:${activity.id}``, `nature: 'note'`, `origin: { company, dealId?, personId?, organizationId? }` (**identifiants**). `pageUrl` rend `https://<company>.pipedrive.com/deal/<id>`, sinon `/person/<id>`, sinon `/organization/<id>` (adresses tirées d'un forum, pas de la doc, `connector.ts:36-38`). Pour une note, l'identifiant de l'affaire n'est que dans l'URL ; pour une activité, il est dans `origin`.
- **Client existant** (`client.ts:18`, `pipedriveClient(access: PipedriveAccess, http: ConnectorHttp)`) : `me()`, `users()`, `notes(updatedSince, start)`, `activities(updatedSince, cursor)`, tous GET. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] ajouter une note (`POST /v1/notes` avec `deal_id`, `person_id` ou `org_id`), créer une activité (`POST /v2/activities`), changer l'étape d'une affaire (`PATCH /v2/deals/{id}`). Pour une note, il faut extraire l'identifiant de l'affaire de l'URL ou le garder. Rien ne relit les affaires : un agent de vente ne verrait pas le pipeline.
### 8.13 Plain

- **Fichiers** : `plain/connector.ts` (78 lignes), `client.ts` (127), `queries.ts`, `cursor.ts` (34), `map.ts` (59), `catalog.ts` (29), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ apiKey }` (`connector.ts:42`), `secretFields: ['apiKey']`, `Authorization: Bearer` (`client.ts:56`). La clé est celle d'un **utilisateur machine** (Settings › Machine users). Pas de bouton.
- **Portées** : celles qu'on coche sur la clé chez Plain. Le catalogue demande la lecture seulement : `thread:read`, `timeline:read`, `customer:read` (`catalog.ts`, `keyHelp` ; « donnez-lui des droits de lecture seulement »). Le code dit que les droits exacts ne sont pas vérifiés (`connector.ts:35-37`). Une clé collée en lecture seule ne peut donc pas écrire.
- **API** : GraphQL, `https://core-api.uk.plain.com/graphql/v1` (`client.ts:19`). Hôte : `core-api.uk.plain.com` (le seul, region « uk » en dur). POST unique.
- **Relevé** : `threads(filters: { updatedAt: { after } }, sortBy: { field: CREATED_AT, direction: ASC }, first: 25, after)` avec `id ref title updatedAt { iso8601 } customer { fullName }` (`queries.ts:9-14`). Puis, par fil, `thread(threadId) { timelineEntries(filters: { entryTypes: [EMAIL, CHAT, NOTE, SLACK_MESSAGE, SLACK_REPLY, MS_TEAMS_MESSAGE, DISCORD_MESSAGE] }, first: 50, after) }` (`queries.ts:19-49`). `myWorkspace { name }` pour `verify`.
- **Non relevé** : entrées personnalisées, messages du centre d'aide, messages de fils fusionnés, événements, pièces jointes, description du fil (`connector.ts:30-33`). Pour un courriel, seul le dernier message (`textContent`), sans les réponses citées. Le statut, la priorité, l'assigné, les étiquettes du fil ne sont pas lus. Aucun tri possible par date de modification (`ThreadsSort` ne l'a pas).
- **Curseur** (`cursor.ts:5-9`) :

```ts
const RoundSchema = z.object({
  from: z.iso.datetime(),
  started: z.iso.datetime().nullable(),
  after: z.string().nullable(),
});
```

  Même mécanisme que monday.com : on parcourt la liste par ordre de création (stable), filtrée sur `updatedAt`, et le passage suivant repart du début de celui-ci moins 5 minutes (`CLOCK_MARGIN_MS`, `endRound`).
- **Débit** : `minIntervalMs: 150` (`connector.ts:51`), soit 400 requêtes par minute, sous la limite la plus basse de l'aide (450, plans Launch et Foundation). L'aide donne l'instant de reprise en ISO 8601 dans `x-ratelimit-reset`, que le client commun ne lit pas (`connector.ts:18-22`). Une requête de chronologie par fil : coût en rafale.
- **Identifiants gardés** (`map.ts:50-56`) : `externalId: `thread:${thread.id}``, `nature: 'fil'`, `title: `${thread.ref} ${thread.title}`.trim()`, `url: null` (« L'adresse d'un fil dans l'application n'est pas dans la doc de l'éditeur »), `origin: { client: thread.customer.fullName }`. Tours : `entry:${entry.id}`, avec `side` : `'team'` pour un acteur `user`, `'external'` pour un `customer`, absent pour un utilisateur machine (`map.ts:15-19`). **Écart avec le commentaire de `connector.ts:32-33`** : il dit que le côté n'est pas rendu ; le code de `map.ts` le rend. Le code fait foi. L'identifiant du client (`customer.id`) n'est pas gardé, seulement son nom. L'`id` du fil suffit pour répondre.
- **Client existant** (`client.ts`, exportées) : `fetchAccount(http, apiKey)`, `fetchThreads(http, apiKey, from, after)`, `fetchTimeline(http, apiKey, threadId)`. Le privé `graphql(http, apiKey, query, variables, data)` est un POST générique, réutilisable pour des mutations.
- **Manque pour écrire** : les mutations. [hors code] `createNote` et `replyToThread` ou `sendNewEmail` (GraphQL de Plain), `changeThreadStatus`. Il faut un identifiant de client (non gardé) pour certaines. Il faut exporter `graphql` et élargir les droits de la clé (la clé collée est en lecture seule d'après le catalogue).

### 8.14 Plane

- **Fichiers** : `plane/connector.ts` (122 lignes), `client.ts` (139), `pages.ts`, `cursor.ts` (44), `map.ts` (87), `catalog.ts` (45), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ apiKey, workspace }` (`connector.ts:42-48`). `workspace` : identifiant de l'espace (lettres, chiffres, `_`, `-`, 100 au plus). `secretFields: ['apiKey']`, envoyée dans l'en-tête `X-Api-Key` (`client.ts:46`). Plane en ligne seulement (`app.plane.so`), pas d'installation hébergée (`catalog.ts` `warning`).
- **Portées** : aucune. La clé a les droits de son propriétaire.
- **API** : v2, `https://api.plane.so/api/v2` (`client.ts:7`). Hôte : `api.plane.so`. La v1 n'a aucun filtre « modifié depuis » (`connector.ts:20-21`).
- **Relevé** : `GET /workspaces/{ws}/projects/` (200 par page) ; `GET /workspaces/{ws}/members/?expand=member` (5 pages au plus, 1 000 membres) ; par projet `GET /workspaces/{ws}/projects/{id}/work-items/` avec `paginate=cursor`, `order_by=updated_at`, `updated_at__gte`, `per_page=50`, `fields=id,name,sequence_id,description_html,created_by_id,updated_by_id,updated_at` ; par élément nouveau `GET .../work-items/{id}/comments/` (`order_by=-created_at`, 200 par page, `COMMENT_PAGES_MAX = 2` soit 400 commentaires les plus récents, `expand=actor`). `GET /users/me/` et `GET .../projects/?per_page=1` pour `verify`.
- **Non relevé** : les éléments archivés, brouillons et en triage (exclusions par défaut de Plane), les commentaires masqués par la modération, états, priorités, étiquettes, modules, cycles, assignés, pièces jointes, liens. Les pages (documents) de Plane ne sont pas lues : `pages.ts` ne contient que la **pagination** de l'API (`pages`, `all`).
- **Curseur** (`cursor.ts:7-10`) :

```ts
const CursorSchema = z.record(
  z.string(),
  z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) }),
);
```

  Une marque par projet (clé : identifiant du projet) : instant du dernier élément lu et identifiants déjà lus à cet instant. Plane écrit des microsecondes, le code compte en millisecondes. Limites écrites (non vérifié) : un commentaire ajouté ne fait peut-être pas avancer `updated_at` de l'élément, donc il ne serait lu qu'à la prochaine modification (`connector.ts:31-32`) ; un 403 sur la liste des éléments d'un projet que la clé n'a pas rejoint remonte comme « Plane rejected the key » pour toute la connexion (`connector.ts:35-36`).
- **Débit** : `minIntervalMs: 1000` (60 requêtes par minute, celles de la v1 ; le débit de la v2 n'est pas chiffré, `connector.ts:23-24`). Une requête de commentaires par élément nouveau.
- **Identifiants gardés** (`map.ts:78-84`) : `externalId: `work-item:${row.id}`` (l'UUID, « le numéro change si on le déplace »), `nature: 'ticket'`, `title: `${key} ${row.name}`` où `key` est `PROJET-numéro`, `url: https://app.plane.so/${workspace}/browse/${key}` (adresse tirée d'une demande de fusion du dépôt de Plane, pas de la doc), `origin: { workspace, project: project.name }`. Tours : `body`, `comment:${comment.id}`. **L'identifiant du projet n'est pas gardé** (seulement son nom) ; or toutes les routes de Plane sont `/projects/{project_id}/work-items/{id}/`. Il faudrait garder `project.id` dans `origin`, ou le relire par `projects()`.
- **Client existant** (`client.ts:45`, `planeClient(apiKey: string, workspace: string, http: ConnectorHttp)`) : `account()`, `checkWorkspace()`, `projects()`, `members()`, `workItems(projectId, from)`, `comments(projectId, itemId)`, tous GET. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] `POST .../work-items/{id}/comments/`, `POST .../work-items/`, `PATCH .../work-items/{id}/` (v2). Le préfixe de l'URL est déjà dans `itemsUrl(projectId)` (privé).

### 8.15 Productboard

- **Fichiers** : `productboard/connector.ts` (65 lignes), `client.ts` (88), `sync.ts`, `cursor.ts` (34), `map.ts` (134), `oauth.ts` (65), `catalog.ts` (21), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : bouton OAuth natif **seulement**, pas de clé collée (`connector.ts:39-47`) : `authMode: z.literal('oauth')`, `accessToken`, `refreshToken`, `expiresAt`, `workspace` (nom de l'espace, lu par `toConfig` via `GET https://app.productboard.com/oauth2/token/info`). `secretFields: []`. PKCE S256, `clientAuth: 'body'`, `tokenBody: 'query'`, `setupHosts: ['app.productboard.com']` (`oauth.ts:36-64`). `Authorization: Bearer`. Plan Pro ou supérieur ; seul un Maker administrateur peut autoriser (`catalog.ts` `warning`).
- **Portées** (`oauth.ts:40`) :

```ts
  scopes: ['notes:read', 'notes:write'], // Leon n'écrit pas encore : l'accès est demandé d'avance
```

  Le nom de l'auteur d'une note simple n'est pas rendu sans `members:pii:read`, que Leon ne demande pas (`connector.ts:26-28`).
- **API** : v2 (« en bêta »), `https://api.productboard.com/v2` (`client.ts:8`). Hôte : `api.productboard.com`.
- **Relevé** : `GET /v2/notes` avec `archived=false`, `updatedFrom`, `pageCursor` (`client.ts:56-84`). La liste est rendue de la plus récemment créée à la plus ancienne, sans tri par modification : **chaque passage relit toutes les notes modifiées depuis le curseur** (garde-fou `PAGES_MAX = 1000` pages) et les trie ici (`sync.ts:8-11`). Une note a trois formes de contenu : texte simple, conversation (prises de parole), opportunité (champs). `verify` : `probe` d'une heure avec `fields[]=name`.
- **Non relevé** : les entités de produit (fonctionnalités, initiatives, objectifs, releases), les notes archivées, les pièces jointes, les liens note-fonctionnalité. Une note sans date lisible est écartée. Seul Productboard « notes » est couvert.
- **Curseur** (`cursor.ts:7`) :

```ts
const MarkSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
```

  Instant (millisecondes) de la dernière note rendue et identifiants déjà rendus à cet instant. Pages rendues de `PAGE_ITEMS = 100` (`sync.ts:6`). Limite écrite : le socle s'arrête à 200 éléments par passage et reprend une minute plus tard, un gros retard se relit donc plusieurs fois, **en relisant à chaque fois toute la liste filtrée** (`sync.ts:10-11`). La durée de vie d'un curseur de page (1 minute en v1) n'est pas vérifiée.
- **Débit** : `minIntervalMs: 250` (4 requêtes par seconde ; aucune limite documentée, `connector.ts:19-21`, `:54`).
- **Identifiants gardés** (`map.ts:123-132`) : `externalId: `note:${note.id}``, `nature: 'note'`, `title: note.fields?.name?.trim() || 'Note sans titre'`, `url: html?.startsWith('https://') ? html : null` (`links.html` de la note), `origin: { workspace?, tags? }`. Tours : `body` (daté de la dernière modification), `part:${part.externalId}` pour les prises de parole d'une conversation (avec `side` selon `authorType`). L'identifiant de la note suffit pour la relire ou lui ajouter du contenu.
- **Client existant** (`client.ts:56`, `productboardClient(token: string, http: ConnectorHttp)`) : `probe(since: Date)`, `notesUpdatedFrom(from: Date)`, tous GET. Aucune écriture.
- **Manque pour écrire** : tout. Le droit `notes:write` est demandé. [hors code] créer une note (`POST /v2/notes`), la modifier (`PATCH /v2/notes/{id}`). L'API v2 est en bêta : sa stabilité est à confirmer. Les entités de produit ne sont pas lues du tout.

### 8.16 Sentry

- **Fichiers** : `sentry/connector.ts` (139 lignes), `client.ts` (103), `cursor.ts` (35), `map.ts` (71), `catalog.ts` (62), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ token, organization, region }` (`connector.ts:57-68`). `token` : jeton d'une intégration interne Sentry (`secretFields: ['token']`), `Authorization: Bearer`. `organization` : identifiant (slug, `^[a-z0-9_-]{1,100}$`). `region` : `sentry.io` ou `de.sentry.io` (`REGIONS`, `connector.ts:57`). Pas de bouton.
- **Portées** : lecture seule (« Read ») sur les problèmes (Issue & Event), portée `event:read` (`catalog.ts` `keyHelp`, `client.ts:51`). Le jeton n'expire pas. Condition d'utilisation à faire lire : le §2.3 b de Sentry interdit d'utiliser le service pour le compte de tiers (`catalog.ts` `warning`).
- **API** : `https://${region}/api/0/organizations/${organization}` (`client.ts:48`). Hôte : `sentry.io` ou `de.sentry.io` (`hosts: (config) => [config.region]`). Le plan nommait `us.sentry.io`, la doc aussi ; `sentry.io` reste proposé (`connector.ts:32-33`).
- **Relevé** : `GET {base}/issues/` avec `query=lastSeen:-<N>m`, `sort=date`, `limit=100`, `collapse=stats` et `cursor` (`client.ts:62-79`), via `http.page` (en-tête `Link`). Tous les statuts (une requête non vide écarte le filtre « non résolus »). Par problème avec `numComments > 0`, `GET {base}/issues/{id}/` pour lire `activity` et en tirer les notes de type `note` (les 100 dernières activités ; Sentry ne publie pas de liste de commentaires). `checkIssues` : `lastSeen:-1m`, `limit 1`.
- **Non relevé** : les événements, traces de pile, balises, versions, releases, projets, alertes. Le problème est rendu avec `shortId`, titre, `culprit`, niveau, statut, assigné (`documentText`), pas ses occurrences. Aucune lecture de l'organisation (`GET /organizations/{org}/` n'est pas appelé : la doc se contredit sur le type de jeton exigé, `connector.ts:35-40`).
- **Curseur** (`cursor.ts:7`) :

```ts
const CursorSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) });
```

  `at` : `lastSeen` du dernier problème rendu ; `seen` : identifiants rendus à cet instant. La liste ne se trie que du plus récent au plus ancien : un passage **lit toutes les pages de sa fenêtre**, trie localement, puis rend par pages de `PAGE_SIZE = 50`. La fenêtre part du curseur avec 2 minutes de marge (`WINDOW_MARGIN_MINUTES`). Limites écrites : un changement de statut, d'assignation ou une note sans nouvel événement ne change pas `lastSeen` et n'est relu qu'à l'événement suivant (`connector.ts:43-45`).
- **Débit** : pas de `minIntervalMs` ; la doc ne donne aucune limite chiffrée ni de code 429 (`connector.ts` « Non vérifié »). Une requête de détail par problème commenté.
- **Identifiants gardés** (`map.ts:63-68`) : `externalId: `issue:${issue.id}``, `nature: 'ticket'`, `title: `${issue.shortId} ${issue.title}``, `url: issue.permalink ?? null`, `origin: { organization, project: issue.project.slug }`. Tours : `body`, `note:${note.id}`. L'identifiant numérique de l'organisation n'est pas utilisé : le slug suffit aux routes.
- **Client existant** (`client.ts:46`, `sentryClient({ token, organization, region }: Access, http)`) : `checkIssues()`, `issues(minutes)` (générateur, GET paginé), `notes(issueId)` (GET). Aucune écriture.
- **Manque pour écrire** : tout. [hors code] changer le statut ou l'assigné (`PUT .../issues/{id}/` avec `status`, `assignedTo`), ajouter une note (la doc dit que le point d'accès des commentaires est « privé », `connector.ts:25-26`). Le jeton de l'intégration interne doit avoir la portée d'écriture sur les problèmes (le catalogue ne demande que la lecture). La nature `ticket` est ici un problème d'erreur : un agent qui « résout » un problème agirait sur la production.

### 8.17 Shortcut

- **Fichiers** : `shortcut/connector.ts` (127 lignes), `client.ts` (101), `cursor.ts` (36), `map.ts` (73), `catalog.ts` (28), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement : `{ token }` (`connector.ts:52`), `secretFields: ['token']`, envoyée dans l'en-tête `Shortcut-Token` (`client.ts:53`). Pas de bouton.
- **Portées** : aucune. Un jeton d'API a les droits de son propriétaire. Non vérifié : si un jeton en lecture seule est accepté par la recherche, qui est une requête POST (`connector.ts:34-35`).
- **API** : REST v3, `https://api.app.shortcut.com/api/v3` (`client.ts:7`). Hôte : `api.app.shortcut.com` (`connector.ts:114`).
- **Relevé** : `POST /api/v3/stories/search` (« Query Stories ») avec `updated_at_start`, `updated_at_end` (option), `includes_description: true` : liste entière, **sans pagination ni tri** (`client.ts:81-94`). Le connecteur lit des fenêtres de 7 jours (`WINDOW_MS`, pour ne pas dépasser 10 Mo d'une réponse sur un premier passage de 365 jours), trie lui-même et rend 50 histoires par page. `GET /stories/{id}/comments` par histoire qui en a (`comment_ids` non vide). `GET /members` (noms d'auteur), `GET /member` pour `verify`. « Search Stories » (`GET /search/stories`) n'est pas utilisé : il classe par pertinence, filtre à la journée et plafonne à 1 000 résultats (`connector.ts:18-20`).
- **Non relevé** : épics, itérations, objectifs, étiquettes, états du flux, estimations, propriétaires, tâches de l'histoire, pièces jointes, documents. Les épics et les projets ne sont connus que par leur numéro (leurs noms coûteraient deux requêtes de plus à chaque passage, `map.ts:28-30`). Non vérifié : si la recherche rend les histoires archivées, et si elle plafonne le nombre de résultats.
- **Curseur** (`cursor.ts:8`) :

```ts
const MarkSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.number()) });
```

  `at` : `updated_at` (à défaut `created_at`, `stampOf`) de la dernière histoire lue, `seen` : numéros lus à cet instant. Fenêtre après fenêtre ; relit une seconde avant le curseur (`OVERLAP_MS = 1000`). Limite écrite (à essayer en premier en réel) : ajouter un commentaire ne change peut-être pas `updated_at` de l'histoire (`connector.ts:42-44`).
- **Débit** : `minIntervalMs: 300` (200 requêtes par minute, `connector.ts:115`). La doc ne donne pas d'en-tête `Retry-After` ; le délai après 429 n'est pas vérifié.
- **Identifiants gardés** (`map.ts:65-71`) : `externalId: `story:${story.id}`` (numérique), `nature: 'ticket'`, `title: `#${story.id} ${story.name}``, `url: story.app_url`, `origin: { project?: numéro, epic?: numéro }` (**numéros**, pas des noms). Tours : `body` (auteur : `requested_by_id`, « Shortcut ne donne pas d'autre créateur »), `comment:`+numéro.
- **Client existant** (`client.ts:52`, `shortcutClient(token: string, http: ConnectorHttp)`) : `account()` GET `/member`, `people()` GET `/members`, `stories(from: Date, until?: Date)` **POST** `/stories/search` (lecture), `comments(storyId: number)` GET. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] `POST /stories/{id}/comments`, `POST /stories`, `PUT /stories/{id}`. Pour créer une histoire, il faut `project_id` ou `workflow_state_id` : le premier est gardé dans `origin.project`, le second pas.

### 8.18 Slack

- **Fichiers** : `slack/connector.ts` (125 lignes), `client.ts` (100), `catalog.ts` (23), `connector.test.ts`. Ni `map.ts`, ni `cursor.ts`, ni `oauth.ts` : la conversion est dans `connector.ts` et le curseur est emprunté à Outlook (`import { advance, isDone, type Mark, MarkSchema } from '../outlook/cursor'`, `connector.ts:2`).
- **Authentification** : **Pipedream Connect** seulement (`connector.ts:98-104`). `configSchema: PipedreamConfigSchema` (`{ authMode: 'pipedream', externalUserId, accountId }`), `secretFields: []`, `pipedream: { app: 'slack_v2' }`. Leon ne tient aucun jeton Slack : Pipedream ajoute le **jeton utilisateur** du compte (`oauth_access_token`) et chaque requête passe par son proxy, à 1 crédit (`client.ts` en-tête, `pipedream.ts`). `keyAccepted: false`, `keyHelp: ''` : pas de clé collée (`catalog.ts:7-8`).
- **Portées** : celles de l'appli Slack **de Pipedream**, que le code ne liste pas. Il dit seulement qu'il faut `search:read` (jeton utilisateur) et ne vérifie pas que Pipedream l'accorde (`connector.ts:26`). Pas de portée d'écriture dans le code.
- **API** : `https://slack.com/api` (`client.ts:138`). Hôte : `slack.com`. Réponses 200 avec `ok: false` : `Envelope` lit `error` ; les codes `invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive`, `no_permission`, `missing_scope`, `not_allowed_token_type` deviennent `ConnectorAuthError(..., 403)`, `ratelimited` devient 429 (`client.ts:143-152`, `:192-197`).
- **Relevé** : `auth.test` pour `verify` (compte : `user (team)`, `accountKey: team_id:user_id`). `search.messages` avec `query=after:<jour>`, `sort=timestamp`, `sort_dir=asc`, `count=100`, `page` (100 pages au plus, `SEARCH_PAGES_MAX`) : une requête rend jusqu'à 100 messages de tous les canaux (`client.ts:210-223`). Seuls les canaux (publics ou privés) dont l'utilisateur est membre ; les messages directs et de groupe sont écartés (`isChannel`, `connector.ts:50-51` : exige `is_im === false` et `is_mpim === false` et un identifiant ne commençant pas par `D`). `privateRaw: true` (`connector.ts:104`) : seul l'utilisateur qui a branché voit le texte.
- **Non relevé** : l'historique des canaux (`conversations.history`), les fils de discussion complets (`conversations.replies`), les fichiers, les réactions, les messages directs, les utilisateurs (l'auteur est `username` ou l'identifiant `user`, jamais résolu en nom ni e-mail : `email: null`), les canaux auxquels l'utilisateur n'appartient pas.
- **Curseur** (`connector.ts:30`) :

```ts
const CursorSchema = z.object({ mark: MarkSchema.nullable() });
```

  `mark` : instant du dernier message lu et identifiants `canal:ts` déjà lus. La recherche n'a que le **jour** pour borne, avec 2 jours de marge (`MARGIN_MS`, fuseau de l'utilisateur) : **chaque passage relit les messages des deux derniers jours**, 1 crédit Pipedream par centaine. Le commentaire propose de passer au tri décroissant si le volume le justifie (`connector.ts:21-23`).
- **Débit** : pas de `minIntervalMs`. `search.messages` est de palier 2 (environ vingt requêtes par minute, non vérifié, `connector.ts:28`).
- **Identifiants gardés** (`connector.ts:85-93`) : un élément = les messages d'un canal sur une journée UTC : `externalId: `channel:${canal}:${AAAA-MM-JJ}``, `nature: 'fil'`, `title: `#${name}, JJ/MM/AAAA``, `url: last.match.permalink ?? null` (le lien du **dernier** message), `origin: { channel: name }`. Tours : `message:${ts}` avec `author: { name: username || user, email: null }`, sans `side`. **L'identifiant du canal est dans `externalId`, `ts` du message dans l'identifiant du tour** : c'est de quoi répondre dans un fil (`chat.postMessage` avec `channel` et `thread_ts`). Mais `thread_ts` n'est pas lu : un message de fil et un message de canal ne se distinguent pas.
- **Client existant** (`client.ts:185`, `slackClient(http: ConnectorHttp)`) : `me()` (`auth.test`) et `search(after: string)`. Le privé `call(method, query, schema)` fait des GET (pas de `method` ni de corps dans la requête) : il ne sait pas poster.
- **Manque pour écrire** : tout. [hors code] `chat.postMessage` (POST, droit `chat:write`), `reactions.add`. Le jeton utilisateur de Pipedream n'a pas forcément cette portée ; avec Pipedream, une écriture passe aussi par le proxy et coûte 1 crédit. **Obstacle juridique écrit** : copier et indexer les messages va contre les conditions de Slack (étude `docs/etudes/slack-2026-10`, verdict « non indexable ») ; branché à la demande de David pour l'essai, « à trancher avant un client » (`connector.ts:10-12`, `catalog.ts` `warning`).
### 8.19 tl;dv

- **Fichiers** : `tldv/connector.ts` (111 lignes), `client.ts` (104), `map.ts` (74), `catalog.ts` (19), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`, pas de `cursor.ts` (le curseur est dans `connector.ts`).
- **Authentification** : clé collée seulement : `{ apiKey }` (`connector.ts:32`), `secretFields: ['apiKey']`, envoyée dans l'en-tête `x-api-key` (`client.ts:64`). Pas de bouton.
- **Portées** : aucune. API réservée aux offres Pro, Business et Entreprise, selon l'offre de l'organisateur de la réunion (`catalog.ts` `warning`).
- **API** : `https://pasta.tldv.io/v1alpha1` (`client.ts:6`), version **alpha**. Hôte : `pasta.tldv.io` (pas `doc.tldv.io`, qui est le site de la doc, `connector.ts:16`).
- **Relevé** : `GET /v1alpha1/meetings` avec `page`, `limit=100`, `onlyParticipated=true` (seules les réunions où la personne de la clé était présente), `from` (jour AAAA-MM-JJ, un jour de marge). Liste lue **en entier** depuis ce jour (100 pages au plus, soit 10 000 réunions, `LIST_PAGES_MAX`), puis triée ici. Par réunion : `GET /meetings/{id}/transcript` puis, à défaut de transcription, `GET /meetings/{id}/notes` (`markdownContent`) (`client.ts:81-100`). `verify` : `GET /meetings?page=1&limit=1`, rend le total.
- **Non relevé** : enregistrements vidéo, points forts, clips, réunions où la personne n'était pas présente. Une réunion sans transcription depuis moins de 6 heures est **attendue** : le passage s'arrête à elle (`TRANSCRIPT_WAIT_MS`, `connector.ts:37`, `:76`, `:99`). Un 403 sur la transcription ou le résumé (offre de l'organisateur) donne une réunion sans ces textes.
- **Curseur** (`connector.ts:40-41`) :

```ts
type Cursor = { at: number; id: string }; // début et identifiant de la dernière réunion rendue
const CursorSchema = z.object({ at: z.number(), id: z.string() });
```

  Début (`happenedAt`) et identifiant de la dernière réunion rendue, ordre total `(at, id)`. Une page est rendue toutes les `MEETINGS_PER_PAGE = 20` réunions. Non vérifié : l'ordre de la liste, le format et le fuseau de `from`, l'unité de `startTime` (supposée en secondes), le code rendu quand la transcription n'est pas prête (400 ou 404 supposés, traités comme « pas prête », `client.ts:52`).
- **Débit** : pas de `minIntervalMs` ; limites non documentées (`connector.ts:29-30`). Une à deux requêtes par réunion, et **toute la liste est relue à chaque passage**.
- **Identifiants gardés** (`map.ts:66-71`) : `externalId: `meeting:${meeting.id}``, `nature: 'reunion'`, `url: meeting.url?.trim() || null`, `origin: { participants }` (noms, séparés par des virgules). Tours : `speech:${index}` (un par locuteur, daté de `startMs` plus le décalage) et `notes`.
- **Client existant** (`client.ts:59`, `createTldvClient(apiKey: string, http: ConnectorHttp)`) : `countMeetings()`, `listMeetings(from: string)`, `transcript(id)`, `notes(id)`, tous GET. Aucune écriture.
- **Manque pour écrire** : sans objet pour l'essentiel (une réunion enregistrée ne se réécrit pas). Aucun point d'écriture n'est cité dans le code. Conditions d'usage : elles interdisent de copier ou de stocker une partie importante du contenu (`catalog.ts` `warning`).

### 8.20 Trello

- **Fichiers** : `trello/connector.ts` (126 lignes), `client.ts` (106), `cursor.ts` (43), `map.ts` (62), `catalog.ts` (40), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`.
- **Authentification** : clé collée seulement, **deux champs** : `{ apiKey, token }` (`connector.ts:47-52`, chacun `^[A-Za-z0-9_-]{1,200}$`). `apiKey` : clé d'un Power-Up (non secrète, visible en clair) ; `token` : jeton (`secretFields: ['token']`). Ils partent dans l'en-tête `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"` et **jamais dans l'adresse** (`client.ts:47-50`). Pas de bouton OAuth.
- **Portées** : le jeton demandé est en **lecture seule, sans expiration** : adresse `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=<clé>` (`catalog.ts`, champ `token`). Il ouvre tous les tableaux ouverts de la personne. Un jeton `scope=read` ne peut pas écrire : il faudrait `scope=read,write`.
- **API** : REST, `https://api.trello.com/1` (`client.ts:6`). Hôte : `api.trello.com`.
- **Relevé** : `GET /members/me/boards` (`filter=open`) ; par tableau, `GET /boards/{id}/actions` (`filter=commentCard,createCard,updateCard`, `since`, `limit=500`, `before`, `memberCreator=false`) pour savoir quelles cartes ont été touchées ; `GET /boards/{id}/lists` (`filter=all`) pour les noms de liste ; puis par carte `GET /cards/{id}` (`fields=name,desc,url,shortUrl,idList`, `actions=commentCard,createCard`, `actions_limit=1000`) (`client.ts:54-102`). `GET /members/me` pour `verify`.
- **Non relevé** : listes de contrôle, étiquettes, membres assignés, dates d'échéance, pièces jointes, pense-bêtes (power-ups), tableaux fermés, cartes archivées non touchées, les actions de déplacement entre listes (`updateCard` ne sert qu'à repérer la carte touchée). La liste d'une carte est dans `origin.list`, pas dans le texte du tour (`connector.ts:42-43`). Un commentaire modifié n'est pas repéré avant la prochaine action de la carte (`updateComment` n'est pas listable). Au-delà de 1 000 commentaires, seuls les plus récents.
- **Curseur** (`cursor.ts:7`) :

```ts
const CursorSchema = z.record(z.string(), z.object({ at: z.iso.datetime(), id: z.string() }));
```

  Par tableau : dernière carte rendue et date de sa dernière action. Trello rend les actions de la plus récente à la plus ancienne : le connecteur lit **toutes** les actions depuis le curseur (pages `before`), les regroupe par carte (`touchedCards`), puis rend les cartes de la moins à la plus récemment modifiée, par pages de `CARDS_PER_PAGE = 50`. Les tableaux disparus sont retirés du curseur (`connector.ts:84-85`).
- **Débit** : `minIntervalMs: 150` (`connector.ts:113`) : Trello limite à 100 requêtes par 10 secondes et par jeton, et 100 par 15 minutes pour `/members` (`connector.ts:26-27`). Une carte supprimée (404) ou refusée (401, 403) est ignorée (`readCard`, `connector.ts:73-74`), mais un 401 ou 403 sur la liste des tableaux ou leurs actions remonte.
- **Identifiants gardés** (`map.ts:54-59`) : `externalId: `card:${card.id}``, `nature: 'ticket'`, `title: card.name`, `url: card.url ?? card.shortUrl ?? null`, `origin: { board, list? }` (**noms**). Tours : `body` (description), `comment:${action.id}`. **Les identifiants du tableau et de la liste ne sont pas gardés** (seulement leurs noms) ; l'identifiant de la carte suffit pour commenter, mais pas pour la déplacer dans une autre liste par nom.
- **Client existant** (`client.ts:46`, `trelloClient(credentials: { apiKey: string; token: string }, http: ConnectorHttp)`) : `account()`, `boards()`, `lists(boardId)`, `actions(boardId, since)`, `card(cardId)`, tous GET via un helper `get` privé. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] `POST /1/cards/{id}/actions/comments` (commenter), `POST /1/cards` (créer, avec `idList`), `PUT /1/cards/{id}` (`idList` pour déplacer). Il faut un jeton `write` (re-saisie par l'utilisateur) et garder l'identifiant de liste.

### 8.21 Zendesk

- **Fichiers** : `zendesk/connector.ts` (122 lignes), `client.ts` (103), `map.ts` (90), `catalog.ts` (54), `connector.test.ts`, `fixtures/`. Pas d'`oauth.ts`, pas de `cursor.ts` (le curseur est celui de Zendesk).
- **Authentification** : clé collée seulement : `{ subdomain, email, apiToken }` (`connector.ts:46-55`), `secretFields: ['apiToken']`. Envoyés en `Authorization: Basic base64("<email>/token:<apiToken>")` (`client.ts:62-63`). Il faut le jeton d'un **administrateur** : Zendesk réserve l'export des tickets aux administrateurs (`catalog.ts` `warning`).
- **Portées** : aucune. Un jeton d'API a les droits de son propriétaire (administrateur donc : droits très larges, écriture comprise).
- **API** : `https://<subdomain>.zendesk.com/api/v2` (`client.ts:61`). Hôte : `<subdomain>.zendesk.com`.
- **Relevé** : `GET /api/v2/incremental/tickets/cursor` avec `start_time` (première fois) ou `cursor`, `per_page=100` (`client.ts:69-77`), puis `GET /api/v2/tickets/{id}/comments` par ticket (`include=users`, `page[size]=100`, `sort=created_at`, 1 000 commentaires au plus, `links.next` suivi tel quel, `client.ts:81-99`). `GET /users/me` pour `verify`. Un ticket de statut `deleted` est écarté, mais le curseur avance.
- **Non relevé** : les demandeurs et organisations comme objets, champs personnalisés, satisfaction, pièces jointes, tickets d'autres canaux que ce que l'export rend par défaut (`support_type_scope` non envoyé, défaut « agent »), Guide (centre d'aide), Talk. Seuls `subject`, `status`, `priority`, `type`, `tags`, `submitter_id`, `updated_at` sont lus sur le ticket (`client.ts:18-27`). L'assigné, le demandeur et le groupe ne sont pas lus.
- **Curseur** : le `after_cursor` de Zendesk, **tel quel** (`connector.ts:32-33`, `:88`). Une page de l'export donne une page du socle, même vide. Les tickets modifiés par le seul système (déclencheurs) reviennent : leurs tours sont inchangés, le socle les ignore. Non vérifié : la durée de validité d'un curseur d'export.
- **Débit** : **pas de `minIntervalMs`** (il espacerait aussi les commentaires, un appel par ticket) ; le client commun attend `Retry-After` sur 429. Un passage n'appelle l'export que deux ou trois fois. Risque noté : un appel de commentaires par ticket sur un passage de 200 tickets, soit 10 par minute sur l'ancien plan Essential (`connector.ts:42-44`).
- **Identifiants gardés** (`map.ts:82-88`) : `externalId: `ticket:${ticket.id}``, `nature: 'fil'`, `title: `#${ticket.id} ${subject}``, `url: https://${subdomain}.zendesk.com/agent/tickets/${ticket.id}` (non vérifié : que le lien ouvre le ticket), `origin: { subdomain }`. Tours : `body` (état : objet, statut, priorité, type, étiquettes, signé de `submitter_id`), `comment:${comment.id}` avec `internalNote: comment.public === false` et `side` selon le rôle du compte (`end-user` : `'external'` ; `agent`, `admin` : `'team'`, `map.ts:40-50`). L'identifiant du ticket suffit à répondre.
- **Client existant** (`client.ts:60`, `zendeskClient(access: ZendeskAccess, http: ConnectorHttp)`) : `me()`, `exportPage(cursor: string | null, since: Date)`, `comments(ticketId: number)`, tous GET. Aucune écriture.
- **Manque pour écrire** : tout. [hors code] `PUT /api/v2/tickets/{id}` avec un objet `ticket.comment` (`public: true` ou `false` : réponse ou note interne) et `status`. Un seul point d'API pour commenter et changer l'état. Le jeton collé étant celui d'un administrateur, les droits sont là ; le risque est l'inverse : un agent aurait des droits d'administrateur.

## Tableau récapitulatif

Lecture : « Clé » = clé collée ; « Bouton » = OAuth natif ; « PD » = Pipedream. « Écriture d'avance » = le droit d'écriture est déjà demandé au bouton (liste `scopes` dans `oauth.ts`) ; « console » = il se règle chez l'éditeur, le code ne le dit pas ; « non » = rien dans le code. Aucun des 21 n'a été branché en réel (`triedForReal: false`). Aucun n'a de fonction d'écriture.

### Branchement, droits, API

| Outil | Accès | Écriture d'avance | API (base, version) | Hôte autorisé | Débit ménagé |
|---|---|---|---|---|---|
| Help Scout | Clé (`appId`, `appSecret`) + Bouton | console (le jeton suit l'utilisateur) | REST v2, `api.helpscout.net/v2` | `api.helpscout.net` | aucun (429 : 2, 4, 8 s) |
| HubSpot | Clé (`token`) + Bouton | oui : `crm.objects.{contacts,companies,deals}.write` | REST datée `2026-03`, `api.hubapi.com` | `api.hubapi.com` | `minIntervalMs: 250` |
| Intercom | Clé (`token`, `region`) | non | REST, en-tête `Intercom-Version: 2.14` | `api.intercom.io`, `api.eu.intercom.io` ou `api.au.intercom.io` | aucun |
| Jira | Clé (`site`, `email`, `apiToken`) + Bouton Atlassian | oui : `write:jira-work` | REST v3, `rest/api/3` | `<site>.atlassian.net` ou `api.atlassian.com` | aucun |
| Leexi | Clé (`keyId`, `keySecret`) | non | REST `v1`, `public-api.leexi.ai` | `public-api.leexi.ai` | `minIntervalMs: 1200` |
| Linear | Clé (`apiKey`) + Bouton | oui : `write` | GraphQL, `api.linear.app/graphql` | `api.linear.app` | aucun (complexité) |
| Miro | Bouton seul | console (`boards:write`) | REST v2 (+ `/v1/oauth-token`) | `api.miro.com` | aucun |
| Missive | Clé (`token`) | non | REST v1, `public.missiveapp.com/v1` | `public.missiveapp.com` | `minIntervalMs: 1000` |
| monday.com | Clé (`token`) + Bouton | oui : `boards:write`, `updates:write` | GraphQL, `API-Version: 2026-07` | `api.monday.com` | aucun (codes de limite en 429) |
| Notion | Clé (`token`) + Bouton | console (capacités) | REST v1, `Notion-Version: 2026-03-11` | `api.notion.com` | `minIntervalMs: 350` |
| Outlook | Bouton seul | oui : `Mail.ReadWrite`, `Calendars.ReadWrite` (pas `Mail.Send`) | Graph v1.0 | `graph.microsoft.com` | aucun |
| Pipedrive | Clé (`company`, `token`) | non | REST v1 (notes) et v2 (activités) | `<company>.pipedrive.com` | aucun |
| Plain | Clé (`apiKey`) | non (clé en lecture seule) | GraphQL, `core-api.uk.plain.com/graphql/v1` | `core-api.uk.plain.com` | `minIntervalMs: 150` |
| Plane | Clé (`apiKey`, `workspace`) | non | REST v2, `api.plane.so/api/v2` | `api.plane.so` | `minIntervalMs: 1000` |
| Productboard | Bouton seul | oui : `notes:write` | REST v2 (bêta), `api.productboard.com/v2` | `api.productboard.com` | `minIntervalMs: 250` |
| Sentry | Clé (`token`, `organization`, `region`) | non (lecture) | REST, `/api/0/organizations/<org>` | `sentry.io` ou `de.sentry.io` | aucun |
| Shortcut | Clé (`token`) | non | REST v3, `api.app.shortcut.com/api/v3` | `api.app.shortcut.com` | `minIntervalMs: 300` |
| Slack | PD (`app: 'slack_v2'`) | non | Web API, `slack.com/api` | `slack.com` | aucun (1 crédit PD par requête) |
| tl;dv | Clé (`apiKey`) | non | REST `v1alpha1`, `pasta.tldv.io` | `pasta.tldv.io` | aucun |
| Trello | Clé (`apiKey`, `token`) | non (`scope=read`) | REST, `api.trello.com/1` | `api.trello.com` | `minIntervalMs: 150` |
| Zendesk | Clé (`subdomain`, `email`, `apiToken`) | non (jeton d'administrateur) | REST v2, `<sub>.zendesk.com/api/v2` | `<sub>.zendesk.com` | aucun (`Retry-After` du client commun) |

### Relevé, curseur, identifiants, écriture

| Outil | Ce qui est relevé | Curseur | `externalId` d'élément (nature) | URL | Client : POST existants | Identifiant manquant pour écrire |
|---|---|---|---|---|---|---|
| Help Scout | conversations et fils | `{ since, page }` | `conversation:<id>` (fil) | `_links.web.href` | seulement la demande de jeton | `customerId` ; numéro de conversation hors `externalId` |
| HubSpot | notes, appels, réunions, e-mails (pas les fiches) | une borne en ms par sorte + `done` | `note:`, `call:`, `meeting:`, `email:` + id (note) | nulle | `search`, `linked`, `names` (lectures) | id de la fiche liée (seul le nom est gardé) ; `hubspot_owner_id` |
| Intercom | conversations, messages, notes | `{ at, seen }` (secondes) | `conversation:<id>` (fil) | nulle | `search` (lecture) | `admin_id` |
| Jira | tickets, descriptions ADF, commentaires | `{ at, seen: [{ id, at }] }` | `issue:<id numérique>` (ticket) | `…/browse/<clé>` | aucun | clé du ticket (seulement dans l'URL) ; `cloudId` en configuration |
| Leexi | appels et réunions, transcription | date ISO du dernier appel | `call:<uuid>` (reunion) | `leexi_url` | aucun | sans objet |
| Linear | tickets, commentaires (50), mises à jour de projet | `{ issues, updates }` : `{ from, top, after }` | `issue:<uuid>`, `project-update:<id>` (ticket, note) | `issue.url` | `graphql()` privé | id d'équipe, id d'état (noms seulement) |
| Miro | texte des tableaux | `{ at, ids }` | `board:<id>` (page) | `viewLink` | aucun | id des éléments (un seul tour par tableau) |
| Missive | conversations, messages, commentaires (boîte « Tout » des équipes) | `{ at, seen }` (secondes) | `conversation:<id>` (fil) | `web_url` | aucun | id d'équipe et de compte d'envoi |
| monday.com | éléments, colonnes, mises à jour et réponses | `{ from, started, boards, after }` | `item:<id>` (ticket) | `item.url` | `graphql()` privé | id du tableau, id des colonnes |
| Notion | pages (blocs, 3 niveaux), commentaires non résolus | `{ at, ids }` ou `{ fill: {…} }` | `page:<id>` (page) | `page.url` | `searchPages` (lecture) | id des blocs ; schéma des bases |
| Outlook | courrier (reçus, envoyés), agenda | `{ inbox, sent, events }` : `{ at, seen }` | `thread:<conversationId>` (fil), `event:<id>` (reunion) | `webLink` | aucun | id de message (dans le tour, avec empreinte) |
| Pipedrive | notes, activités (pas les affaires) | `{ notes, activities }` : `{ at, seen }` | `note:<id>`, `activity:<id>` (note) | `…/deal/<id>` etc. (déduite) | aucun | id de l'affaire pour une note (dans l'URL) |
| Plain | fils et leur chronologie | `{ from, started, after }` | `thread:<id>` (fil) | nulle | `graphql()` privé | id du client |
| Plane | éléments de travail, commentaires (400) | par projet : `{ at, seen }` | `work-item:<uuid>` (ticket) | `app.plane.so/<ws>/browse/<clé>` (déduite) | aucun | **id du projet** (seul le nom est gardé) |
| Productboard | notes (texte, conversation, opportunité) | `{ at, seen }` (ms) | `note:<id>` (note) | `links.html` | aucun | non : id de la note suffit ; entités de produit non lues |
| Sentry | problèmes, notes (100 activités) | `{ at, seen }` | `issue:<id>` (ticket) | `permalink` | aucun | non : id du problème + slug d'organisation |
| Shortcut | histoires, commentaires | `{ at, seen: [numéros] }` | `story:<id>` (ticket) | `app_url` | `stories()` (recherche, lecture) | id d'état du flux (le projet est dans `origin`) |
| Slack | messages des canaux (par jour et canal) | `{ mark: { at, seen } }` | `channel:<canal>:<AAAA-MM-JJ>` (fil) | permalien du dernier message | aucun (GET) | `thread_ts` (non lu) ; `ts` dans l'id du tour |
| tl;dv | réunions, transcription, résumé | `{ at, id }` | `meeting:<id>` (reunion) | `meeting.url` | aucun | sans objet |
| Trello | cartes touchées, commentaires | par tableau : `{ at, id }` | `card:<id>` (ticket) | `card.url` | aucun | id de la liste, id du tableau |
| Zendesk | tickets (export incrémental), commentaires | `after_cursor` de Zendesk | `ticket:<id>` (fil) | `…/agent/tickets/<id>` | aucun | non : id du ticket suffit |

Ce que la lecture donne de plus utile pour un agent :

- **Prêts à écrire sans rien ajouter à l'élément** : Jira, Zendesk, Sentry, Productboard, Notion, Intercom (sauf `admin_id`), Help Scout (sauf pour créer), Missive (sauf pour créer). L'`externalId` porte l'identifiant que la route d'écriture attend.
- **Il faut garder un identifiant de plus** : Plane (projet), Trello (liste), Linear (équipe), monday.com (tableau), HubSpot (fiche liée), Pipedrive (affaire d'une note), Plain (client).
- **Aucun point d'écriture n'est cité dans le code des 21**. Les points d'API marqués [hors code] dans les fiches viennent de la mémoire de l'auteur de la carte.
