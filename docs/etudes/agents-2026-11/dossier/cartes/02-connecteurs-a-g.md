# Carte 02 : les connecteurs, de Airtable à Granola (21 sur 42)

19 novembre 2026 · lecture seule du code (branche `claude/dreamy-hamilton-zhpa1m`) · rien n'a été lancé : ni serveur, ni tests, ni migration

Périmètre : `src/server/connectors/<nom>/` pour airtable, asana, attio, basecamp, circleback, claap, clickup, close, confluence, crisp, drive, fathom, fireflies, folk, freshdesk, front, github, gitlab, gmail, gong, granola ; plus `types.ts`, `registry.ts`, `http.ts`, `sync.ts`, `pipedream.ts`, `oauth.ts` et `docs/guides/applis-oauth.md` pour le cadre. Les chemins sans préfixe sont relatifs à `src/server/connectors/`.

Comment lire : les sections 1 à 7 suivent le plan imposé et parlent du cadre commun. La section 8 donne les 21 fiches. La section 9 est le tableau récapitulatif. Les blocs de code sont recopiés du dépôt, avec chemin et ligne.

## 1. Ce que fait ce module

- Un connecteur est un module **sans base ni état**. Il reçoit une configuration, un état de relève (`cursor`, `since`) et un client HTTP. Il rend des pages d'éléments normalisés (`ConnectorItem`).
- Le socle fait tout le reste : chiffrement des secrets, réservation, renouvellement des jetons, normalisation, ingestion, indexation.
- Les 21 connecteurs lus ici sont **tous en lecture**, sauf GitHub, dont le client porte 14 écritures.
- Tout est **sondage** : un tic par minute, une relève toutes les 15 minutes au mieux. Aucun webhook.
- Trois façons de se brancher : clé collée (11 des 21 n'ont que cela), bouton OAuth natif (8 des 21), Pipedream (Gmail et Drive).
- L'écriture est demandée d'avance dans toutes les applis OAuth (décision du 23/10/2026), mais aucune fonction d'écriture n'existe hors GitHub.
- Chaque élément garde un `externalId` stable, une `url` et un `origin` (quelques champs de contexte). C'est ce qui permettra de réécrire dans l'outil. Sur 9 des 21, il manque un identifiant pour le faire (voir le tableau).
- Seuls GitHub, Gmail et Drive ont été branchés sur un vrai compte (`triedForReal: true`). Les 18 autres ne sont testés que sur des réponses d'exemple.

## 2. Types et fonctions à connaître

### 2.1 Le contrat d'un connecteur

`types.ts:100-118` :

```ts
export type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>; // tous les champs, secrets compris ; un z.object, sans .transform
  secretFields: readonly string[]; // noms des champs à chiffrer
  hosts(config: Config): string[]; // hôtes exacts autorisés, ex. ['api.github.com']
  minIntervalMs?: number; // écart minimal entre deux requêtes (Notion : 350)
  // Texte brut privé à celui qui branche, comme une conversation (boîte mail personnelle).
  // Absent : visible de l'équipe.
  privateRaw?: boolean;
  // `account` : le libellé affiché. `accountKey` : l'identifiant stable du compte (et de l'espace ou du
  // site), lu dans une réponse déjà demandée ; « Reconnecter » le compare. Absent quand l'outil n'en dit rien.
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string; accountKey?: string }>;
  sync(config: Config, state: SyncState, http: ConnectorHttp): AsyncIterable<SyncPage>;
  oauth?: OAuthSpec; // le bouton ; absent : l'outil ne se branche que par clé
  // Le bouton passe par Pipedream Connect (pipedream.ts) : `app` est le nom de l'appli chez Pipedream.
  // La configuration est alors PipedreamConfigSchema, et chaque requête passe par son proxy.
  pipedream?: { app: string };
};
export type AnyConnector = Connector<Record<string, unknown>>;
```

Le contrat n'a **que deux verbes** : `verify` et `sync`. Rien pour écrire, rien pour lire en direct. Le client de l'outil (`<outil>/client.ts`) n'est pas dans le contrat : chaque connecteur le construit lui-même, à l'intérieur de `verify` et de `sync`.

### 2.2 Ce qu'un connecteur rend

`types.ts:13-51` :

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

(Les commentaires de `ConnectorTurn` sont abrégés ici ; le texte entier est en `types.ts:17-28`.)

`side` vaut `'team'` ou `'external'` (`src/capture/turn.ts:123`). Il est lu dans un champ de l'outil, jamais déduit d'un nom. `internalNote` marque une note que le client n'a pas vue. Ces deux attributs sont la seule base, aujourd'hui, pour distinguer un contenu venu de l'extérieur.

Natures possibles (`src/capture/turn.ts:84-97`) : `conversation`, `reunion`, `page`, `ticket`, `fil`, `note`, `mail`, `fichier`, `evenement`, `commit`, `fil_de_travail`. Les 21 n'utilisent que `reunion`, `page`, `ticket`, `fil`, `note`. Gmail rend `fil`, pas `mail`.

### 2.3 Où vont les identifiants

`ingest-items.ts:36-58` : un élément devient une ligne de `sources`.

```ts
  const metadata = {
    nature: item.nature,
    url: item.url,
    origin: item.origin,
    updatedAt: item.updatedAt,
  };
  const [source] = await tx
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: connection.provider,
      externalId: item.externalId,
      ownerUserId: connection.createdBy,
      title,
      acl,
      connectionId: connection.id,
      metadata,
    })
    .onConflictDoUpdate({
      target: [sources.tenantId, sources.ownerUserId, sources.kind, sources.externalId],
```

Donc, pour retrouver l'élément dans l'outil à partir d'une source : `sources.kind` (l'outil), `sources.external_id`, `sources.metadata.url`, `sources.metadata.origin`, et `sources.connection_id` (la connexion qui l'a relevé, nul si elle a été supprimée). La source appartient au **créateur de la connexion** (`ownerUserId`).

Un tour change d'identifiant en route (`normalize.ts:328-336`) :

```ts
  const stem = head(clean(turn.externalId), ID_MAX - ID_ROOM);
  return parts.flatMap((part, index) => {
    const text = prepareTurnText(part);
    if (text === null) return [];
    const base = parts.length > 1 ? `${stem}:${index + 1}` : stem;
    const fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 12);
    return [
      {
        externalId: `${base}#${fingerprint}`,
```

En base, le tour `comment:456` s'appelle donc `comment:456#<12 hex>`, ou `comment:456:2#<12 hex>` s'il a été coupé (au-delà de `CONNECTOR_TURN_MAX = 8_000` caractères). Pour retrouver l'identifiant du commentaire chez l'éditeur, il faut retirer ce qui suit `#`, puis un éventuel `:<n>` final. Attention : GitHub et GitLab mettent déjà un `#` dans l'identifiant de l'**élément** (`issue:acme/leon#12`), pas dans celui du tour.

### 2.4 Le client HTTP commun

`http.ts:9-33` :

```ts
export type HttpRequest = {
  url: string; // https://<hôte autorisé>/… ; peut déjà porter une chaîne de requête
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  // Ajoutée à celle de url ; un tableau répète le paramètre.
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown; // envoyé en JSON
  form?: Record<string, string>; // envoyé en application/x-www-form-urlencoded ; jamais avec body
  raw?: { type: string; text: string }; // envoyé tel quel (le lot multipart de Gmail) ; seul corps
  // Ex. [400] : le corps est validé par le schéma et rendu au connecteur au lieu de lever.
  acceptStatus?: number[];
  // Une écriture qu'on ne rejoue pas : une limite de débit, un 5xx ou une réponse perdue échouent tout de suite,
  // car la requête a pu aboutir.
  once?: true;
};

export type ConnectorHttp = {
  json<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<T>;
  // Pagination par l'en-tête Link.
  page<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<{ data: T; nextUrl: string | null }>;
  // Une réponse qui n'est pas du JSON (export de Drive, lot de Gmail), avec son type et son code.
  text(request: HttpRequest): Promise<{ text: string; type: string | null; status: number }>;
  // Un fichier tel quel (PDF, Word… de Drive), pour l'extraction de documents.ts.
  bytes(request: HttpRequest): Promise<{ bytes: Uint8Array; type: string | null; status: number }>;
};
```

Constantes (`http.ts:71-75`) :

```ts
const TIMEOUT_MS = 30_000;
const BODY_MAX_BYTES = 10 * 1024 * 1024;
const RETRIES_MAX = 3;
const WAIT_MAX_MS = 60_000;
const BACKOFF_MS = 2000; // puis 4 et 8 secondes
```

Erreurs exportées (`http.ts:36-69`) : `ConnectorAuthError(providerLabel, status)` pour tout 401 ou 403 qui n'est pas une limite de débit ; `ConnectorHttpError(status, message)` pour le reste ; `ResponseTooBigError` ; `NothingToReadError`. Le fabricant (`http.ts:145-151`) :

```ts
export function createConnectorHttp(input: {
  provider: ProviderId;
  hosts: string[];
  minIntervalMs?: number;
  fetchImpl?: typeof fetch; // tests
  sleep?: (ms: number) => Promise<void>; // tests
}): ConnectorHttp {
```

Le client refuse toute adresse hors de `hosts`, tout schéma autre que `https`, tout port explicite, et ne suit aucune redirection (`redirect: 'manual'`, `http.ts:174`, `:246`).

### 2.5 Ouvrir un client hors de la relève

Trois fonctions suffisent. Elles servent déjà à GitHub en direct (`src/server/discussion/github-live.ts:19-22`) :

```ts
export async function openGithub(ctx: TenantContext, connection: MyConnection, deps: LiveDeps) {
  const config = await ensureFreshTokens(ctx, connection, githubConnector, deps);
  return liveGithub(config, connectorHttp('github', githubConnector, config, deps));
}
```

- `loadMyConnections(ctx, provider)` (`connections.ts:347-350`) rend les connexions que **l'utilisateur a branchées lui-même**, secrets déchiffrés, hors pause :

```ts
export async function loadMyConnections(
  ctx: TenantContext,
  provider: ProviderId,
): Promise<Array<Pick<LoadedConnection, 'id' | 'provider' | 'config'> & { label: string }>> {
```

- `ensureFreshTokens(ctx, connection, connector, deps)` (`oauth.ts:182-187`) renouvelle un jeton OAuth qui expire dans moins de 5 minutes et l'enregistre avant de rendre la configuration :

```ts
export async function ensureFreshTokens(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch; now?: () => Date; force?: boolean },
): Promise<Record<string, unknown>> {
```

- `connectorHttp(provider, connector, config, deps)` (`pipedream.ts:241-246`) rend le client HTTP, direct ou par le proxy de Pipedream selon `config.authMode` :

```ts
export function connectorHttp(
  provider: ProviderId,
  connector: AnyConnector,
  config: Record<string, unknown>,
  deps: { fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> } = {},
): ConnectorHttp {
```

GitHub est le seul à exporter l'étape suivante, `liveGithub(config, http)` (`github/connector.ts:89-93`). Pour les 20 autres, le schéma de configuration (`ConfigSchema`) et la fonction qui choisit le jeton (`tokenOf`, `bearerToken`, `authorizationOf`, `authHeaders`, selon l'outil) sont **privés au fichier `connector.ts`**. Il faudra les exporter, ou ajouter un `live<Outil>` par connecteur.

### 2.6 Le bouton OAuth

`types.ts:63-97`, les champs qui comptent :

```ts
export type OAuthSpec = {
  appKey: OAuthAppKey; // 'GITHUB', 'ATLASSIAN'… : les variables LEON_OAUTH_<APPLI>_*
  authorizeUrl: string; // https, hôte fixe
  tokenUrl: string; // https, hôte fixe
  scopes: string[]; // [] : aucun paramètre scope
  scopeSeparator?: ' ' | ','; // ' ' par défaut
  pkce: boolean; // S256
  clientAuth: 'body' | 'basic'; // identifiant et secret avec les autres paramètres, ou en Basic
  tokenBody?: 'form' | 'json' | 'query'; // 'form' par défaut ; 'query' : paramètres d'adresse, corps vide
  extraAuthorizeParams?: Record<string, string>;
```

Les 16 applis (`oauth-env.ts:5-22`) : `GITHUB`, `NOTION`, `LINEAR`, `GITLAB`, `ATLASSIAN`, `ASANA`, `CLICKUP`, `MONDAY`, `AIRTABLE`, `HUBSPOT`, `HELPSCOUT`, `ATTIO`, `BASECAMP`, `MIRO`, `PRODUCTBOARD`, `OUTLOOK`. Variables : `LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET`. Une paire vide désactive le bouton.

Les jetons vivent dans le bloc secret chiffré de la connexion (`oauth.ts:18`) :

```ts
export const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const;
```

La configuration d'une connexion par bouton porte donc `authMode: 'oauth'`, `accessToken`, `refreshToken`, `expiresAt`, plus les champs propres à l'outil (`cloudId` et `site` pour Atlassian, `accountId` et `accountName` pour Basecamp, `workspace` pour Asana).

### 2.7 Pipedream

`pipedream.ts:26-30` :

```ts
export const PipedreamConfigSchema = z.object({
  authMode: z.literal('pipedream'),
  externalUserId: z.string().min(1).max(100),
  accountId: z.string().regex(/^apn_[A-Za-z0-9]+$/),
});
```

Leon ne tient aucun jeton Google. `proxyFetch` (`pipedream.ts:217-237`) envoie chaque requête à `https://api.pipedream.com/v1/connect/<projet>/proxy/<adresse en base64url>`, retire l'en-tête `authorization` du connecteur et met le sien. Chaque requête coûte 1 crédit (`pipedream.ts:16`). Le mode par défaut est `development` : 10 comptes de test (`pipedream.ts:40-42`).

### 2.8 Le registre

`registry.ts:47` et `:92-94` :

```ts
export const CONNECTORS: Record<ProviderId, AnyConnector | null> = {
```

```ts
export function getConnector(id: ProviderId): AnyConnector | null {
  return CONNECTORS[id];
}
```

42 entrées, aucune nulle aujourd'hui. Ajouter un outil oblige à toucher `PROVIDER_IDS` (`src/capture/turn.ts:29`), `registry.ts`, `catalog.ts` et, pour un bouton, `oauth-env.ts`.

## 3. Comment ça s'exécute

### 3.1 La relève (le seul chemin pour 20 des 21)

Files pg-boss (`queue.ts:5`) :

```ts
export const CONNECTOR_QUEUES = { tick: 'connector-tick', sync: 'connector-sync' } as const;
```

1. `startConnectorWorker()` (`worker.ts:52-64`) déclare les deux files et programme `connector-tick` chaque minute (`boss.schedule(CONNECTOR_QUEUES.tick, '* * * * *')`).
2. Le tic appelle `enqueueDueSyncs()` (`sync.ts:259-275`). Il lit la fonction SQL `connector_syncs_due()` et envoie un job `connector-sync` par connexion due, avec `singletonKey: job.connectionId`. Le job ne porte que trois identifiants (`queue.ts:8-12`) : `connectionId`, `tenantId`, `userId`.
3. Quatre relèves tournent en parallèle (`worker.ts:29`, `localConcurrency: 4`). File en politique `short`, `expireInSeconds: 1800`, `retryLimit: 2`.
4. `runConnectorSync(job, deps)` (`sync.ts:219-253`) fait, dans l'ordre :
   - `resolveTenantContext(job.userId, job.tenantId)` : le contexte du **créateur de la connexion**. S'il a quitté l'organisation, rien ne se passe.
   - `claimConnection(ctx, id)` : réserve la ligne (une réservation de plus de 30 minutes est réputée abandonnée) et déchiffre les secrets.
   - `ensureFreshTokens` si le connecteur a un bouton.
   - `connector.configSchema.safeParse(connection.config)`.
   - `connectorHttp(...)`, puis `for await (const page of connector.sync(config, state, http))`.
   - Par page : `normalizeItem`, `ingestConnectorItems`, `removeConnectorItems` si `page.removed`, puis `saveSyncProgress` (le curseur).
   - Arrêt à `SYNC_ITEMS_MAX = 200` éléments (`sync.ts:27`).
   - `finishSync` avec l'issue.
5. Un 401 en plein passage, sur une connexion OAuth qui a un jeton de rafraîchissement, force un renouvellement et relance le passage **une fois** (`sync.ts:138-161`). Un 403 n'est jamais renouvelé.
6. Après le commit, `enqueueIndexing(ctx, runId)` met l'indexation en file (`ingest-items.ts:135`). C'est l'indexation qui appelle `signalSourceActivity(ctx, sourceId)` (`src/server/search/index-run.ts:103`), le seul « signal après indexation » existant. Il ne sert qu'au point du matin, pour les sessions de code et les éléments GitHub.

Prochain passage (`connections.ts:498-504`) :

```ts
const NEXT_SYNC = {
  soon: sql`now() + interval '1 minute'`,
  later: sql`now() + interval '15 minutes'`,
  office: OFFICE_HOURS,
  retry: sql`now() + interval '1 hour'`,
  never: NO_DATE,
};
```

`soon` quand la limite de 200 est atteinte, `later` sinon, `office` (8 h, 11 h, 14 h, 17 h, heure de Paris) pour Gmail et Drive, `retry` après une erreur, `never` après un refus d'accès.

### 3.2 Sous quels droits

- La relève lit l'outil avec **le compte de la personne qui a branché**. Elle écrit en base sous son contexte (`withTenant(ctx, …)`).
- Qui voit ce qui est relevé (`ingest-items.ts:79-80`) :

```ts
    const acl =
      chosen?.partage ?? (connection.privateRaw ? [connection.createdBy] : [ctx.tenantId]);
```

  Par défaut, toute l'organisation. Pour Gmail et Drive (`privateRaw: true`), le créateur seul. Un partage choisi (`connections.partage`) l'emporte.
- GitHub fait exception : seuls les dépôts cochés dans `depots_equipe` sont relevés, et un alignement SQL (`aligner_sources_github()`) remet les droits à la fin de chaque passage (`sync.ts:114-115`).
- En direct (`loadMyConnections`), un utilisateur n'ouvre **que ses propres connexions**. Jamais celle d'un collègue. La même règle vaudra pour une écriture : elle part du compte de celui pour qui l'agent travaille, et seulement s'il a branché l'outil lui-même.

### 3.3 Le deuxième chemin : GitHub en direct

`myGithubConnections(ctx)` → `openGithub(ctx, connection, deps)` → `{ github, repos }`. Les outils de la discussion et les 14 actions passent par là (`src/server/discussion/github-live.ts`, lu ; `github-actions.ts`, non lu). C'est le patron à copier pour toute écriture dans un autre outil.

## 4. Conventions

(à compléter)

## 5. Points d'extension pour le système d'agents

(à compléter)

## 6. Pièges et limites écrites dans le code

(à compléter)

## 7. Ce que je n'ai pas lu

(à compléter)

## 8. Fiches des 21 connecteurs

Chaque fiche a la même forme. « Manque pour écrire » dit ce qu'il faut ajouter au client. Quand le code cite lui-même le point d'API d'écriture, je le recopie. Sinon je l'écris « [hors code] » : c'est de mémoire, à vérifier dans la doc de l'éditeur avant de coder.

Dans toutes les fiches, « identifiants gardés » désigne ce qui arrive en base : `sources.external_id` (l'`externalId` de l'élément), `sources.metadata.url`, `sources.metadata.origin`, et l'`externalId` de chaque tour (suivi de `#` et d'une empreinte de 12 caractères, voir section 2).

### 8.1 Airtable

- **Fichiers** : `airtable/connector.ts` (127 lignes), `client.ts` (127), `sync.ts` (107), `map.ts` (139), `cursor.ts` (43), `oauth.ts` (57), `catalog.ts` (44), `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : deux modes dans un même schéma. Clé collée (`authMode: 'key'`, champ `token`, jeton personnel `pat…`) ou bouton OAuth natif (`authMode: 'oauth'`, `accessToken`). PKCE S256, identifiant et secret en `Authorization: Basic`. Les deux jetons partent en `Authorization: Bearer`. Jeton d'accès de 60 minutes, jeton de rafraîchissement de 60 jours à usage unique (`oauth.ts:15-18`).
- **Portées** (`airtable/oauth.ts:39-46`) :

```ts
  scopes: [
    'data.records:read',
    'schema.bases:read',
    'data.recordComments:read',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'data.records:write',
    'data.recordComments:write',
  ],
```

  Avec une clé collée, le catalogue demande seulement les trois portées de lecture (`catalog.ts:12`) : une clé collée ne peut donc pas écrire, sauf si l'utilisateur l'a créée plus large.
- **API** : `https://api.airtable.com/v0` (`client.ts:6`). Hôte autorisé : `api.airtable.com`.
- **Relevé** : toutes les tables des bases choisies (ou, par bouton sans base choisie, les 20 premières que le jeton voit, `sync.ts:11`, `:78-80`). Par table : `POST /v0/{base}/{table}/listRecords` avec `filterByFormula` sur `LAST_MODIFIED_TIME()`, `pageSize` 100, `recordMetadata: ['commentCount']` (`client.ts:93-109`). Puis `GET /v0/{base}/{table}/{enregistrement}/comments` pour les enregistrements qui ont des commentaires, 3 pages au plus, soit 300 commentaires (`client.ts:8`, `:112-123`). Le corps du tour est une ligne « Champ : valeur » par cellule (`map.ts:41-57`).
- **Non relevé** : pièces jointes, liens entre enregistrements, boutons, colonnes de date ou d'auteur (`map.ts:9-17`). Un commentaire ajouté sans modification de l'enregistrement n'est vu qu'à la modification suivante. Un champ calculé qui change ne compte pas (`connector.ts:39-40`). La date de modification réelle n'existe pas : l'élément est daté de la fin de sa fenêtre.
- **Curseur** : JSON, une marque par « base/table » (`cursor.ts:15-20`) :

```ts
const MarkSchema = z.object({
  from: z.number(),
  to: z.number().nullable(),
  after: z.string().nullable(),
});
const CursorSchema = z.record(z.string(), MarkSchema);
```

  Fenêtres de 7 jours (`WINDOW_MS`), reprise une minute avant la fin de la précédente (`OVERLAP_MS`). Pages de 20 enregistrements (`sync.ts:10`).
- **Débit** : `minIntervalMs: 220` (5 requêtes par seconde et par base, `connector.ts:106`). Airtable demande 30 s d'attente après un 429 ; le client commun attend 2, 4, 8 s (`connector.ts:41-43`).
- **Identifiants gardés** (`map.ts:130-138`) :

```ts
  return {
    externalId: `record:${baseId}/${table.id}/${record.id}`,
    nature: 'note',
    title: `${table.name} : ${name || record.id}`,
    url: `https://airtable.com/${baseId}/${table.id}/${record.id}`,
    updatedAt,
    origin: { base: baseName, table: table.name },
    turns,
  };
```

  Tours : `body` (les cellules), `comment:${comment.id}`. L'`externalId` suffit à réécrire : il porte la base, la table et l'enregistrement.
- **Client existant** (`client.ts:60-125`, `airtableClient(token: string, http: ConnectorHttp)`) : `whoami()` GET `/meta/whoami` ; `baseNames()` GET `/meta/bases` ; `tables(baseId)` GET `/meta/bases/{base}/tables` ; `records(baseId, tableId, from, to)` **POST** `/{base}/{table}/listRecords` (une lecture) ; `comments(baseId, tableId, recordId)` GET.
- **Manque pour écrire** : aucune fonction d'écriture. À ajouter : créer un enregistrement, modifier des cellules, commenter. Les droits OAuth sont déjà là. [hors code] `POST /v0/{base}/{table}`, `PATCH /v0/{base}/{table}/{id}`, `POST /v0/{base}/{table}/{id}/comments`. Le schéma des tables (`tables()`) donne déjà le nom et le type de chaque champ : utile pour valider une écriture. Jamais essayé en réel (`catalog.ts:27`, `triedForReal: false`).

### 8.2 Asana

- **Fichiers** : `asana/connector.ts` (110), `client.ts` (129), `projects.ts` (87), `map.ts` (52), `cursor.ts` (53), `oauth.ts` (59), `catalog.ts`, `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : clé collée (jeton personnel, `token`) ou bouton OAuth natif. PKCE, identifiant et secret dans le corps, formulaire. Jeton d'accès d'une heure (`oauth.ts:13`). `preFields: ['workspace']` : l'espace se choisit avant le clic, sinon le premier.
- **Portées** (`asana/oauth.ts:40-48`) :

```ts
  scopes: [
    'tasks:read',
    'projects:read',
    'stories:read',
    'users:read',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'tasks:write',
    'stories:write',
  ],
```

  Le code dit à quoi servent les droits d'écriture (`oauth.ts:19-22`) : « tasks:write (POST /tasks, PUT /tasks/{gid}) et stories:write (POST /tasks/{gid}/stories, commenter) ». Pas de `projects:write`, aucun droit `:delete`.
- **API** : `https://app.asana.com/api/1.0` (`client.ts:6`). Hôte : `app.asana.com`.
- **Relevé** : un seul espace de travail. Ses projets non archivés (`GET /projects`, `archived: false`), puis par projet `GET /tasks` avec `modified_since` et `opt_fields: 'name,notes,modified_at,created_by,permalink_url'`, puis `GET /tasks/{gid}/stories` filtré par `resource_subtype: 'comment_added'` (`client.ts:95-125`).
- **Non relevé** : sous-tâches, projets archivés, assigné, échéance, état terminé ou non, section, champs personnalisés, pièces jointes. L'auteur n'a qu'un nom, jamais d'adresse (`map.ts:12`). Une tâche sans description ni commentaire n'est pas rendue.
- **Curseur** : JSON `{ marks, current }` (`cursor.ts:10-23`). Par projet, l'instant de la tâche la plus récente vue et les `gid` vus à cet instant ; `current` porte le projet en cours et l'`offset` d'Asana. Un `offset` périmé (400) fait reprendre la première page (`client.ts:110-115`).
- **Débit** : `minIntervalMs: 400` (150 requêtes par minute, plan gratuit, `connector.ts:93`).
- **Identifiants gardés** (`map.ts:43-51`) :

```ts
  return {
    externalId: `task:${task.gid}`,
    nature: 'ticket',
    title: task.name.trim() || 'Tâche sans titre',
    url: task.permalink_url ?? null,
    updatedAt: task.modified_at,
    origin: { workspace: origin.workspace, project: origin.project },
    turns,
  };
```

  Tours : `body`, `comment:${comment.gid}`. `origin` porte des **noms** (espace, projet), pas leurs `gid`. Pour créer une tâche dans un projet, il faudra relire les projets (`projects(workspace)`) ou garder le `gid`.
- **Client existant** (`client.ts:50-127`, `asanaClient(token: string, http: ConnectorHttp)`) : `me()`, `projects(workspace)`, `tasks(project, modifiedSince, offset)`, `comments(task)`. Tout en GET.
- **Manque pour écrire** : `createTask`, `updateTask`, `addComment`. Points d'API cités par le code : `POST /tasks`, `PUT /tasks/{gid}`, `POST /tasks/{gid}/stories`. Les tests d'Asana confrontent chaque requête à un extrait de la spec officielle (`src/test/contracts/vendor-specs/asana.json`, 4 opérations GET) : une écriture ajoutée fera échouer les tests tant que son opération n'est pas ajoutée à `extract-vendor-specs.ts` (voir section 6). Jamais essayé en réel.

### 8.3 Attio

- **Fichiers** : `attio/connector.ts` (156), `client.ts` (130), `directory.ts` (81), `map.ts` (78), `cursor.ts` (36), `oauth.ts` (51), `catalog.ts`, `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : clé collée (jeton d'espace, `token`) ou bouton OAuth natif. `scopes: []` : les droits se cochent dans la console de l'appli, pas dans l'adresse (`oauth.ts:43`). `extraAuthorizeParams: { token_level: 'workspace' }` : jeton d'espace, accordé par un administrateur. Le jeton n'expire pas, pas de jeton de rafraîchissement (`oauth.ts:22-24`).
- **Portées** : dans la console (`oauth.ts:27-31`, `applis-oauth.md:155`) : `note:read-write`, `comment:read-write` (écriture demandée d'avance ; `note:read-write` permet aussi de supprimer), et en lecture `user_management:read`, `object_configuration:read`, `record_permission:read`. Noms à vérifier (`applis-oauth.md:224`).
- **API** : `https://api.attio.com/v2` (`client.ts:6`). Hôte : `api.attio.com`.
- **Relevé** : toutes les notes (`GET /v2/notes`, pages de 50 par `offset`) et tous les fils de commentaires (`GET /v2/threads`). Pour l'habillage : `GET /v2/workspace_members` (nom et adresse de l'auteur) et `GET /v2/objects/{object}/records/{id}` (nom et `web_url` de la fiche parente). Attio ne filtre pas par date : la liste entière est relue à chaque passage (`connector.ts:32-35`).
- **Non relevé** : les fiches elles-mêmes (personnes, sociétés, affaires : seuls le nom et le lien de la fiche parente sont lus), les listes, les tâches, les e-mails. Une note modifiée après sa création n'est pas relue. Au-delà de 80 commentaires par fil, le reste est ignoré.
- **Curseur** : JSON `{ notes?, threads? }`, chacun `{ at: number, seen: string[] }` (`cursor.ts:7-8`).
- **Débit** : `minIntervalMs: 120` (10 requêtes par seconde sur la liste des notes, `connector.ts:136`). La doc citée donne 25 écritures par seconde (`connector.ts:14`).
- **Identifiants gardés** (`map.ts:33-41`, `:69-77`) :

```ts
  return {
    externalId: `note:${note.id.note_id}`,
    nature: 'note',
    title: withName(note.title?.trim() || 'Note', parent),
    url: parent?.url ?? null,
    updatedAt: createdAt,
    origin: { object: note.parent_object, ...(parent?.name ? { record: parent.name } : {}) },
    turns: [{ externalId: 'body', role: 'document', author, text, ts: createdAt }],
  };
```

```ts
  return {
    externalId: `thread:${thread.id.thread_id}`,
    nature: 'fil',
    title: parent?.name ? `Fil de commentaires sur ${parent.name}` : 'Fil de commentaires',
    url: parent?.url ?? null,
    updatedAt: new Date(threadStamp(thread).at).toISOString(),
    origin: parent?.name ? { record: parent.name } : {},
    turns,
  };
```

  **Trou pour l'écriture** : `parent_record_id` n'est pas gardé. On garde le nom court de l'objet (`origin.object`, pour une note seulement), le **nom** de la fiche et son `web_url`. Pour ajouter une note à la même fiche, il faut soit ajouter `parent_record_id` à `origin`, soit le retrouver par l'API.
- **Client existant** (`client.ts:89-128`, `attioClient(token: string, http: ConnectorHttp)`) : `self()`, `probeNotes()`, `allNotes(keep)`, `allThreads(keep)`, `members()`, `record(object, recordId)`. Tout en GET.
- **Manque pour écrire** : créer une note, créer un commentaire. Le code cite les pages lues : `…/notes/create-a-note` et `…/comments/create-a-comment` (`oauth.ts:30`). [hors code] `POST /v2/notes`, `POST /v2/comments`. Modifier une fiche (étape d'une affaire, champ) demanderait un droit d'écriture sur les fiches que l'appli **ne demande pas** : le document cible « Attio en écriture » ne vaut que pour les notes et commentaires. Jamais essayé en réel.

### 8.4 Basecamp

- **Fichiers** : `basecamp/connector.ts` (136), `client.ts` (106), `map.ts` (70), `cursor.ts` (43), `oauth.ts` (74), `catalog.ts`, `connector.test.ts`, `oauth.test.ts`, `fixtures/`.
- **Authentification** : bouton OAuth natif seulement (`authMode: z.literal('oauth')`, `secretFields: []`). Launchpad de 37signals, sans PKCE, paramètres de l'échange dans l'adresse (`tokenBody: 'query'`). Jeton d'accès de 2 semaines. `toConfig` appelle `https://launchpad.37signals.com/authorization.json` et prend le premier compte `product: "bc3"` (`oauth.ts:59-73`).
- **Portées** : aucune (`scopes: []`). L'autorisation couvre tout le compte, écriture comprise (`applis-oauth.md:162`, `:167`).
- **API** : `https://3.basecampapi.com/<accountId>` (`client.ts:6`, `:56`). En-tête `user-agent` obligatoire (`client.ts:10`) :

```ts
export const USER_AGENT = 'Leon (https://github.com/DavSperling/leon)';
```

- **Relevé** : messages et documents de tous les projets actifs. `GET /projects/recordings.json` (`type` `Message` ou `Document`, `status: 'active'`, `sort: 'updated_at'`, `direction: 'desc'`), puis l'élément par `GET /messages/{id}.json` ou `/documents/{id}.json`, puis `GET /recordings/{id}/comments.json` (10 pages au plus) (`client.ts:70-102`).
- **Non relevé** : tâches (to-dos), cartes, événements, questions, fichiers, discussions de type Campfire (`connector.ts:27-28`).
- **Curseur** : JSON `{ message: Stream, document: Stream }`, `Stream = { from, top, next }` (`cursor.ts:9-10`). Lecture du plus récent au plus ancien, arrêt à la première date déjà vue. `next` est l'adresse de la page suivante (en-tête `Link`).
- **Débit** : `minIntervalMs: 250` (50 requêtes par 10 secondes, `connector.ts:124-125`).
- **Identifiants gardés** (`map.ts:61-69`) :

```ts
  return {
    externalId: `${kind}:${item.id}`,
    nature: NATURES[kind],
    title: item.title,
    url: item.app_url ?? null,
    updatedAt: item.updated_at,
    origin: { account, ...(item.bucket ? { project: item.bucket.name } : {}) },
    turns,
  };
```

  `kind` vaut `message` ou `document` ; natures `fil` et `page`. Tours : `body`, `comment:${comment.id}`. Le tour porte `side` (`external` si l'auteur est un client invité, `map.ts:19-22`). L'identifiant du projet (`bucket.id`) n'est **pas** gardé, seulement son nom. Le numéro de compte est dans la configuration (`accountId`).
- **Client existant** (`client.ts:52-104`, `basecampClient(config: { accessToken: string; accountId: string }, http: ConnectorHttp)`) : `profile()`, `list(kind, next)` (par `http.page`), `item(kind, id)`, `comments(id)`. Tout en GET.
- **Manque pour écrire** : commenter un message ou un document, créer un message, créer une tâche. [hors code] `POST /buckets/{projet}/recordings/{id}/comments.json` : la route d'écriture passe par l'identifiant du projet, que Leon ne garde pas. Il faudra l'ajouter à `ItemSchema` (`bucket.id`) et à `origin`. Jamais essayé en réel.

### 8.5 Circleback

- **Fichiers** : `circleback/connector.ts` (88), `client.ts` (82), `map.ts` (76), `catalog.ts`, `connector.test.ts`, `fixtures/`. Pas de `oauth.ts`, pas de `cursor.ts`.
- **Authentification** : clé collée seulement (`apiKey`, doit commencer par `cb_`, `connector.ts:27-32`). En-tête `authorization: Bearer`.
- **Portées** : aucune notion de portée dans le code. La clé est celle d'un utilisateur.
- **API** : `https://circleback.ai/api` (`client.ts:11-12`), sans numéro de version. Hôte : `circleback.ai`.
- **Relevé** : les réunions de l'utilisateur (`GET /meetings`, `ownership: 'Mine'`, pagination par l'en-tête `Link`), puis la transcription de chacune (`GET /meeting/{id}/transcript`). La liste entière est relue à chaque passage (pas de filtre « modifié depuis »). Le résumé de l'outil (`notes`) ne sert que s'il n'y a pas de transcription (`map.ts:47-64`).
- **Non relevé** : les réunions des collègues, les notes privées, les actions (« action items ») de Circleback, l'heure de début réelle (la date de création en tient lieu).
- **Curseur** : une date ISO nue, le `updatedAt` de la dernière réunion rendue (`connector.ts:85`). Pas de JSON.
- **Débit** : `minIntervalMs: 350` (plan gratuit, 3 requêtes par seconde, `connector.ts:67`).
- **Identifiants gardés** (`map.ts:67-75`) :

```ts
  return {
    externalId: `meeting:${meeting.id}`,
    nature: 'reunion',
    title: meeting.name?.trim() || NO_TITLE,
    url: `https://${HOST}/meetings/${encodeURIComponent(meeting.id)}`,
    updatedAt: meeting.updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
```

  Tours : `utterance:${index}` (position dans la transcription, regroupés par locuteur par `mergeSpeakerTurns`), ou `notes`. `origin.participants` est une chaîne de noms séparés par des virgules. Les adresses des invités ne sont gardées que sur les tours (auteur), quand le nom du locuteur correspond à un invité.
- **Client existant** (`client.ts`, fonctions exportées, pas d'objet client) :

```ts
export async function checkKey(http: ConnectorHttp, apiKey: string): Promise<void>
export async function* meetingPages(http: ConnectorHttp, apiKey: string): AsyncGenerator<Meeting[]>
export async function fetchTranscript(http: ConnectorHttp, apiKey: string, meetingId: string): Promise<Segment[]>
```

  Tout en GET.
- **Manque pour écrire** : rien à écrire dans Circleback pour les agents visés. Ce connecteur est une **source de déclenchement** (fin de réunion). Ce qui manque est de ce côté : pas de webhook, et la liste des invités avec adresses n'est pas gardée sur l'élément (seulement les noms). Jamais essayé en réel.

### 8.6 Claap

- **Fichiers** : `claap/connector.ts` (105), `client.ts` (101), `map.ts` (78), `cursor.ts` (39), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`apiKey`). En-tête `X-Claap-Key` (`client.ts:63`). Clé créée par un administrateur ; seule une clé « Full access » voit les enregistrements privés (`connector.ts:24-25`).
- **Portées** : aucune dans le code.
- **API** : `https://api.claap.io/v1` (`client.ts:5`). Hôte : `api.claap.io`.
- **Relevé** : les enregistrements de l'espace (`GET /v1/recordings`, `sort: 'created_asc'`, `createdAfter`, `limit` 50, curseur de l'outil), puis `GET /v1/recordings/{id}/transcript`. Nom de l'espace par `GET /v1/workspaces/mine`.
- **Non relevé** : résumé, points clés, commentaires sur l'enregistrement, enregistrements sans transcription (ils sont revus au passage suivant). Les locuteurs ne sont pas nommés (`speaker_1`), sauf s'il n'y a qu'une voix et un seul présent (`map.ts:27-32`).
- **Curseur** : JSON `{ after, seen }` (`cursor.ts:11-14`). La liste repart 6 heures avant `after` (`WINDOW_MS`) pour rattraper une transcription arrivée en retard.
- **Débit** : `minIntervalMs: 400` (3 requêtes par seconde et par route). Plafond propre : `READS_MAX = 100` transcriptions par passage, à cause du quota de 3 000 requêtes par jour pour tout l'espace (`connector.ts:46`).
- **Identifiants gardés** (`map.ts:69-77`) :

```ts
  return {
    externalId: `recording:${recording.id}`,
    nature: 'reunion',
    title: recording.title?.trim() || 'Enregistrement sans titre',
    url: recording.url ?? null,
    updatedAt: new Date(recording.createdAt).toISOString(),
    origin: names === '' ? {} : { participants: names },
    turns,
  };
```

  Tours : `utterance:${position}`.
- **Client existant** (`client.ts:55-101`) :

```ts
export async function listRecordings(http: ConnectorHttp, apiKey: string, query: { createdAfter: string; limit: number; cursor: string | undefined }): Promise<{ recordings: Recording[]; next: string | null }>
export async function fetchSegments(http: ConnectorHttp, apiKey: string, recordingId: string): Promise<Segment[] | null>
export async function fetchWorkspaceName(http: ConnectorHttp, apiKey: string): Promise<string>
```

  Tout en GET.
- **Manque pour écrire** : rien à écrire dans Claap. Source de déclenchement seulement. Le quota de 3 000 requêtes par jour interdit une lecture en direct fréquente. Jamais essayé en réel.

### 8.7 ClickUp

- **Fichiers** : `clickup/connector.ts` (166), `client.ts` (113), `map.ts` (68), `oauth.ts` (27), `catalog.ts`, `connector.test.ts`, `fixtures/`. Le curseur est dans `connector.ts`. Pas de `oauth.test.ts`.
- **Authentification** : clé collée (jeton personnel `pk_…`, envoyé **sans** « Bearer ») ou bouton OAuth natif (envoyé avec « Bearer ») (`connector.ts:66-68`). Pas de PKCE, corps JSON. Le jeton OAuth n'expire pas, pas de rafraîchissement (`oauth.ts:13-14`).
- **Portées** : aucune (`scopes: []`). L'utilisateur choisit les espaces pendant l'autorisation ; le jeton a les droits de son compte, écriture comprise (`applis-oauth.md:99`).
- **API** : `https://api.clickup.com/api/v2` (`client.ts:6`). Hôte : `api.clickup.com`.
- **Relevé** : tous les espaces de travail (`GET /v2/team`), puis toutes les tâches modifiées (`GET /v2/team/{id}/task` avec `date_updated_gt`, `include_closed: true`, `subtasks: true`, `include_markdown_description: true`, `order_by: 'created'`), puis `GET /v2/task/{id}/comment` (4 pages de 25, soit les 100 plus récents).
- **Non relevé** : réponses dans un fil de commentaires, statut, assignés, échéance, priorité, champs personnalisés, documents ClickUp, pièces jointes.
- **Curseur** : JSON par espace `{ at: number, seen: string[] }` (`connector.ts:71`).
- **Débit** : `minIntervalMs: 650` (100 requêtes par minute et par jeton, `connector.ts:146`).
- **Identifiants gardés** (`map.ts:55-67`) :

```ts
  return {
    externalId: `task:${task.id}`,
    nature: 'ticket',
    title: task.custom_id ? `${task.custom_id} ${task.name}` : task.name,
    url: task.url ?? null,
    updatedAt,
    origin: {
      workspace,
      ...(folder ? { folder } : {}),
      ...(task.list ? { list: task.list.name } : {}),
    },
    turns,
  };
```

  Tours : `body`, `comment:${comment.id}`. `origin` porte des noms (espace, dossier, liste), pas d'identifiant. L'identifiant de la liste (`list.id`) n'est pas dans `TaskSchema` : il faudra l'ajouter pour créer une tâche dans la même liste.
- **Client existant** (`client.ts:49-111`, `clickupClient(authorization: string, http: ConnectorHttp)`) : `user()`, `teams()`, `tasks(teamId, updatedAfter)`, `comments(taskId)`. Tout en GET.
- **Manque pour écrire** : créer une tâche, modifier une tâche (statut, assigné), commenter. [hors code] `POST /v2/list/{list_id}/task`, `PUT /v2/task/{id}`, `POST /v2/task/{id}/comment`. Même contrôle de spec que pour Asana (`vendor-specs/clickup.json`). Conditions d'utilisation à faire confirmer avant tout client (`applis-oauth.md:102`, et `connector.ts:21-22` sur l'entraînement de modèles). Jamais essayé en réel.

### 8.8 Close

- **Fichiers** : `close/connector.ts` (122), `client.ts` (145), `map.ts` (82), `text.ts` (88), `cursor.ts` (30), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`apiKey`). `Authorization: Basic`, la clé en nom d'utilisateur, mot de passe vide (`client.ts:86`).
- **Portées** : aucune dans le code. Une clé d'API Close a les droits de son utilisateur.
- **API** : `https://api.close.com/api/v1` (`client.ts:8`). Hôte : `api.close.com`.
- **Relevé** : toutes les activités créées depuis le curseur (`GET /activity/` avec `date_created__gte`, `_limit` 100, `_skip`, `_fields`). Types gardés : `Note`, `Call` (note, résumé, transcription, message vocal), `Email`, `SMS`, `WhatsAppMessage` (`map.ts:17-23`). Nom de la fiche par `GET /lead/{id}/?_fields=display_name`, une fois par fiche et par passage.
- **Non relevé** : les fiches (prospects, contacts, opportunités, statuts), les réunions, les tâches, les changements de statut, les brouillons et envois en échec (`NOT_SENT`, `map.ts:26`), le HTML et les pièces jointes. Une activité modifiée après sa création n'est pas relue.
- **Curseur** : JSON `{ at: number, seen: string[] }` (`cursor.ts:6`). Il avance aussi sur les activités ignorées.
- **Débit** : `minIntervalMs: 100` (`connector.ts:111`).
- **Identifiants gardés** (`map.ts:70-81`) :

```ts
  return {
    externalId: `activity:${activity.id}`,
    nature: kind.nature,
    title: name ?? DEFAULT_TITLE,
    // Close n'a pas de lien vers une activité : la fiche du prospect.
    url: activity.lead_id
      ? `https://app.close.com/lead/${encodeURIComponent(activity.lead_id)}/`
      : null,
    updatedAt: iso,
    origin: { ...(name ? { lead: name } : {}), type: kind.label },
    turns: [{ externalId: 'body', role: kind.role, author: authorOf(activity), text, ts: iso }],
  };
```

  Un seul tour par activité. Le `lead_id` n'est gardé **que dans l'URL** (`https://app.close.com/lead/<lead_id>/`). `origin.lead` est le nom affiché, `origin.type` un libellé français (`Note`, `Appel`, `E-mail`, `SMS`, `WhatsApp`). Le texte commence par une ligne qui dit le sens (« E-mail reçu », `text.ts:18-23`) : c'est du texte, pas un champ.
- **Client existant** (`client.ts:84-143`, `closeClient(apiKey: string, http: ConnectorHttp)`) : `me()`, `activitiesSince(from)`, `leadName(id)`. Tout en GET.
- **Manque pour écrire** : créer une note sur une fiche, créer une tâche, modifier une opportunité. [hors code] `POST /activity/note/`, `POST /task/`, `PUT /opportunity/{id}/`. Il faut d'abord garder `lead_id` dans `origin` (aujourd'hui à extraire de l'URL). Les opportunités ne sont pas lues du tout. Jamais essayé en réel.

### 8.9 Confluence

- **Fichiers** : `confluence/connector.ts` (121), `client.ts` (151), `changes.ts` (51), `read.ts` (45), `map.ts` (77), `storage.ts` (62), `directory.ts` (56), `ignoring.ts` (13), `catalog.ts`, `connector.test.ts`, `storage.test.ts`, `fixtures/`. Pas de `oauth.ts` propre : il réutilise `../jira/oauth.ts` et `../jira/access.ts` (lus, hors de mes 21).
- **Authentification** : clé collée (`site`, `email`, `apiToken`, en `Basic e-mail:jeton`, sur `https://<site>.atlassian.net`) ou bouton OAuth natif **partagé avec Jira** (`appKey: 'ATLASSIAN'`, une seule appli, une seule adresse de retour). Par bouton, les appels passent par `https://api.atlassian.com/ex/confluence/<cloudId>` en Bearer (`jira/access.ts:62-86`). Pas de PKCE, corps JSON, `preFields: ['site']`. Jeton de rafraîchissement tournant, expire après 90 jours sans usage (`jira/oauth.ts:15-16`).
- **Portées** (`confluence/connector.ts:78-88`) :

```ts
  oauth: atlassianOAuth([
    'read:page:confluence',
    'read:comment:confluence',
    'read:space:confluence',
    'read:user:confluence',
    'read:confluence-user',
    // Leon n'écrit pas encore : l'accès est demandé d'avance
    'write:page:confluence',
    'write:comment:confluence',
    'offline_access',
  ]),
```

  Par clé collée : le jeton d'API a tous les droits du compte. Seul le jeton **sans portées** est pris en charge (`connector.ts:50-51`).
- **API** : REST v2 (`<racine>/wiki/api/v2`) pour tout, v1 (`/wiki/rest/api/user/current`) pour le compte courant (`client.ts:5-6`, `:24`, `:103`).
- **Relevé** : toutes les pages courantes du site (`GET /pages`, `sort: '-modified-date'`, `status: 'current'`, `limit` 250), lues une à une avec leur corps (`GET /pages/{id}?body-format=storage`), les commentaires de pied de page (`GET /pages/{id}/footer-comments`) et leurs réponses sur 3 niveaux (`GET /footer-comments/{id}/children`, `read.ts:16`). Noms par `POST /users-bulk`, clés d'espace par `GET /spaces`. Le format de stockage (XHTML) est converti en texte (`storage.ts`).
- **Non relevé** (`connector.ts:44-49`) : commentaires en ligne, réponses au-delà du niveau 3, pièces jointes, images, pages archivées ou en brouillon, blogs, mentions de personnes. Un commentaire ajouté à une page inchangée n'entre qu'à la prochaine modification de la page. **Le numéro de version de la page n'est pas lu** (seulement `version.createdAt` et `authorId`).
- **Curseur** : JSON `{ at, ids }` (`changes.ts:12`). Lecture de la plus récente à la plus ancienne, arrêt au repère. Lots de 10 pages (`PAGES_PER_BATCH`).
- **Débit** : `minIntervalMs: 100` (`connector.ts:77`).
- **Identifiants gardés** (`map.ts:68-76`) :

```ts
  return {
    externalId: `page:${page.id}`,
    nature: 'page',
    title: page.title,
    url: pageUrl(site, page),
    updatedAt: page.version.createdAt,
    origin: space ? { site, space } : { site },
    turns,
  };
```

  Tours : `body`, `comment:${comment.id}`. `origin.space` est la **clé** de l'espace (ou son numéro si l'annuaire est refusé). `origin.site` est le sous-domaine.
- **Client existant** (`client.ts`, fonctions exportées qui prennent un `Api`) :

```ts
export function createApi(http: ConnectorHttp, config: AtlassianConfig): Api
export function fetchMe(api: Api)
export function listPageStubs(api: Api)
export function fetchPage(api: Api, id: string)
export function fetchComments(api: Api, pageId: string)
export function fetchReplies(api: Api, commentId: string)
export async function fetchUsers(api: Api, accountIds: string[])   // POST /users-bulk, une lecture
export async function fetchSpaces(api: Api, spaceIds: string[])
```

- **Manque pour écrire** : créer une page, modifier une page, commenter. Les droits `write:page:confluence` et `write:comment:confluence` sont demandés. [hors code] `POST /wiki/api/v2/pages`, `PUT /wiki/api/v2/pages/{id}`, `POST /wiki/api/v2/footer-comments`. Trois manques concrets : (1) modifier une page exige son numéro de version courant, que `Page` ne lit pas ; (2) il faut écrire du format de stockage, or le code ne sait que le lire (`storageToText`), pas le produire ; (3) créer une page exige le `spaceId` numérique, alors que `origin.space` garde la clé. Même contrôle de spec que pour Asana (`vendor-specs/confluence.json`, 7 opérations). Jamais essayé en réel.

### 8.10 Crisp

- **Fichiers** : `crisp/connector.ts` (112), `client.ts` (118), `map.ts` (63), `cursor.ts` (32), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement : jeton de **site** (`websiteId`, `identifier`, `key`). `authorization: Basic base64(identifier:key)` et `x-crisp-tier: website` (`client.ts:41-44`). `secretFields: ['key', 'identifier']`. Le jeton de plugin (place de marché, portées) n'est pas pris en charge.
- **Portées** : aucune dans le code. Un jeton de site couvre un seul espace, 10 000 requêtes par jour (`connector.ts:12-14`).
- **API** : `https://api.crisp.chat/v1/website/<websiteId>` (`client.ts:7`, `:39`). Hôte : `api.crisp.chat`.
- **Relevé** : les conversations modifiées, par fenêtres de 7 jours (`GET /conversations/{page}` avec `per_page` 50, `filter_date_start`, `filter_date_end`), puis tous les messages de chacune (`GET /conversation/{session}/messages`, lots remontés par `timestamp_before`). Seuls les messages `text` et `note` sont gardés.
- **Non relevé** : fichiers, sons, événements (« conversation résolue »), état de la conversation (ouverte, résolue), assignation, segments, fiche du contact au-delà du pseudo, de l'adresse et de l'objet.
- **Curseur** : JSON `{ at, seen }` (`cursor.ts:7`), relu une seconde avant (`OVERLAP_MS`).
- **Débit** : `minIntervalMs: 250`. Le code note que la réponse 420 de Crisp n'est pas reprise par le client commun (`connector.ts:41-43`).
- **Identifiants gardés** (`map.ts:53-62`) :

```ts
  return {
    externalId: `conversation:${conversation.session_id}`,
    nature: 'fil',
    title: titleOf(conversation.meta),
    // Le format du lien vers la boîte de réception n'est pas dans la doc de l'API (voir connector.ts).
    url: `https://app.crisp.chat/website/${websiteId}/inbox/${encodeURIComponent(conversation.session_id)}/`,
    updatedAt: toIso(conversation.updated_at),
    origin: { site: websiteId },
    turns,
  };
```

  Tours : `message:${fingerprint}`, avec `side` (`external` pour le visiteur, `team` pour l'opérateur) et `internalNote: true` pour une note interne (`map.ts:19-32`). Tout ce qu'il faut pour répondre est là : `websiteId` (dans `origin.site` et la configuration) et `session_id`.
- **Client existant** (`client.ts:38-116`, `crispClient(credentials: Credentials, http: ConnectorHttp)`) : `account()`, `conversations(from, until?)`, `messages(sessionId)`. Tout en GET.
- **Manque pour écrire** : envoyer un message, poser une note interne, changer l'état, assigner. [hors code] `POST /v1/website/{id}/conversation/{session}/message` (type `text` ou `note`), `PATCH …/state`, `PATCH …/routing`. Répondre à un visiteur est une **écriture vers l'extérieur** : c'est le cas que le document cible interdit sans clic. Une note interne est une écriture interne. La clé collée est un jeton de site entier : pas de distinction lecture ou écriture. Jamais essayé en réel.

### 8.11 Drive (Google Drive)

- **Fichiers** : `drive/connector.ts` (90), `client.ts` (111), `schemas.ts` (33), `catalog.ts` (23), `connector.test.ts`. Pas de `fixtures/`, pas de `oauth.ts`, pas de `map.ts`. Le curseur vient de `../outlook/cursor.ts` (`MarkSchema`, `isDone`, `advance`).
- **Authentification** : **Pipedream Connect** seulement (`pipedream: { app: 'google_drive' }`, `configSchema: PipedreamConfigSchema`, `secretFields: []`). Leon ne tient aucun jeton Google : chaque requête part au proxy de Pipedream, qui ajoute l'accès. Le client n'envoie donc **aucun en-tête d'autorisation** (`client.ts:41-46`). `privateRaw: true` : le texte est privé à celui qui branche (`connector.ts:64`).
- **Portées** : celles de l'appli Google de Pipedream, droit `drive` complet (`connector.ts:8-9`). Le catalogue le dit à l'utilisateur : « voir, modifier et supprimer vos fichiers Drive » (`catalog.ts:10`). L'écriture est donc déjà autorisée.
- **API** : `https://www.googleapis.com/drive/v3` (`client.ts:19`). Hôte : `www.googleapis.com`.
- **Relevé** : `GET /files` avec `q` (`modifiedTime >=`, `trashed = false`, types lisibles), `orderBy: 'modifiedTime'`, `pageSize` 100, `corpora: 'allDrives'`. Puis le contenu, un fichier par requête : `GET /files/{id}/export` (documents, présentations en `text/plain`, feuilles en `text/csv`, première feuille seulement) ou `GET /files/{id}?alt=media` (texte, Markdown, et PDF, Word, Excel, PowerPoint passés à `extractText` de `@/server/documents/documents`). Les types lus sont dans `READABLE` (`client.ts:26-36`).
- **Non relevé** : dossiers et arborescence (`parents` n'est pas demandé), droits de partage du fichier, commentaires, révisions, images, PDF scannés, fichiers de plus de 10 Mo, feuilles au-delà de la première.
- **Curseur** : JSON `{ mark: { at, seen } | null }` (`connector.ts:20`). Une page par fichier.
- **Débit** : pas de `minIntervalMs`. Chaque requête coûte 1 crédit Pipedream. Relève aux heures de bureau seulement : 8 h, 11 h, 14 h, 17 h, heure de Paris (`connections.ts:490-496`).
- **Identifiants gardés** (`connector.ts:38-55`) :

```ts
  return {
    externalId: `file:${file.id}`,
    nature: 'page',
    title: file.name.trim() || 'Sans titre',
    url: file.webViewLink ?? null,
    updatedAt,
    origin: {},
```

  Un seul tour `body`. `origin` est **vide** : ni dossier, ni type MIME. Le type MIME n'est pas gardé, alors qu'il décide de la façon d'écrire (un document Google ne s'écrit pas comme un fichier Word).
- **Client existant** (`client.ts:41-110`, `driveClient(http: ConnectorHttp)`) : `about()`, `files(from)`, `content(file)`. Tout en GET (`http.json` et `http.bytes`).
- **Manque pour écrire** : créer un fichier, mettre à jour un contenu, commenter. [hors code] `POST https://www.googleapis.com/upload/drive/v3/files` (même hôte), `PATCH …/files/{id}`. Écrire **dans** un document Google (remplir un questionnaire d'appel d'offres) demande l'API Docs, sur l'hôte `docs.googleapis.com` : il n'est pas dans `hosts`, et il faut vérifier que l'appli Pipedream `google_drive` porte ce droit. Chaque écriture coûte un crédit Pipedream. **Essayé en réel** (`catalog.ts:12`, `triedForReal: true`).

### 8.12 Fathom

- **Fichiers** : `fathom/connector.ts` (64), `client.ts` (48), `map.ts` (63), `cursor.ts` (50), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`apiKey`). En-tête `X-Api-Key` (`client.ts:45`).
- **Portées** : aucune dans le code. La clé ne voit que les réunions de son propriétaire ou partagées avec lui (`connector.ts:16`).
- **API** : `https://api.fathom.ai/external/v1` (`client.ts:4`). Hôte : `api.fathom.ai`.
- **Relevé** : un seul point d'API, `GET /meetings` avec `created_after`, `cursor`, `include_transcript: true`, `include_summary: true`. La transcription vient dans la liste. Sans transcription, le résumé de Fathom (`default_summary.markdown_formatted`) devient le tour document.
- **Non relevé** : les actions (« action items ») de Fathom, les réunions partagées après coup (créées avant le curseur), le lien avec un CRM. Une réunion n'est lue qu'une fois (pas de date de modification).
- **Curseur** : JSON `Walk = { after, next, max, hold }` (`cursor.ts:11-16`). `next` est le curseur de page de Fathom ; `hold` retient une réunion récente encore sans texte pendant 6 heures (`GRACE_MS`).
- **Débit** : **pas de `minIntervalMs`**. Le code compte sur la limite de 200 éléments par passage (pages de 10 réunions) pour rester sous 30 requêtes par minute (`connector.ts:14-15`).
- **Identifiants gardés** (`map.ts:54-62`) :

```ts
  return {
    externalId: `meeting:${meeting.recording_id}`,
    nature: 'reunion',
    title: meeting.title.trim() || 'Réunion sans titre',
    url: meeting.url ?? null,
    updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
```

  Tours : `utterance:${index}` (avec `matched_calendar_invitee_email` comme adresse de l'auteur quand Fathom l'a), ou `summary`.
- **Client existant** (`client.ts:39-48`) :

```ts
export function listMeetings(
  http: ConnectorHttp,
  apiKey: string,
  query: HttpRequest['query'],
): Promise<z.infer<typeof MeetingListSchema>>
```

  Un seul GET.
- **Manque pour écrire** : rien à écrire dans Fathom. Source de déclenchement. Avertissement du catalogue (`fathom/catalog.ts:17`) : « Conditions de Fathom à faire confirmer avant usage client ». Jamais essayé en réel.

### 8.13 Fireflies

- **Fichiers** : `fireflies/connector.ts` (93), `client.ts` (148), `map.ts` (96), `catalog.ts`, `connector.test.ts`, `fixtures/`. Le curseur est dans `connector.ts`.
- **Authentification** : clé collée seulement (`apiKey`). `Authorization: Bearer`.
- **Portées** : aucune dans le code.
- **API** : GraphQL, `POST https://api.fireflies.ai/graphql` (`client.ts:7`). Hôte : `api.fireflies.ai`. Fireflies peut rendre une erreur avec un code 200 : `graphql()` la convertit en `ConnectorAuthError` ou `ConnectorHttpError` (`client.ts:65-102`).
- **Relevé** : trois requêtes GraphQL, recopiées (`client.ts:10-22`) :

```ts
const USER_QUERY = 'query { user { name email } }';
const LIST_QUERY = `query Transcripts($fromDate: DateTime, $limit: Int, $skip: Int) {
  transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) { id date }
}`;
const DETAIL_QUERY = `query Transcript($id: String!) {
  transcript(id: $id) {
    title transcript_url organizer_email participants
    meeting_attendees { displayName name email }
    meeting_info { summary_status }
    summary { overview short_summary gist action_items }
    sentences { index speaker_name text start_time }
  }
}`;
```

  Les `action_items` de Fireflies sont lus, mais ne servent que **sans transcription** (dans le tour `summary`, sous « Actions à mener : », `map.ts:61-78`).
- **Non relevé** : une réunion n'est lue qu'une fois. Une réunion dont le résumé est `processing` est relue au passage suivant.
- **Curseur** : JSON `{ after, seen }` (`connector.ts:41`). La liste est relue 24 heures avant (`OVERLAP_MS`).
- **Débit** : `minIntervalMs: 1000` (sous 60 par minute ; plan gratuit 30 par minute et 500 par jour, Pro 60 et 5 000, `connector.ts:20-21`).
- **Identifiants gardés** (`map.ts:87-95`) :

```ts
  return {
    externalId: `transcript:${id}`,
    nature: 'reunion',
    title: transcript.title?.trim() || 'Réunion Fireflies',
    url: transcript.transcript_url ?? null,
    updatedAt,
    origin: participants ? { participants } : {},
    turns: spoken.length > 0 ? mergeSpeakerTurns(spoken) : summaryTurns(transcript, updatedAt),
  };
```

  Tours : `utterance:${sentence.index ?? position}` ou `summary`.
- **Client existant** (`client.ts:104-148`) :

```ts
export async function fetchAccount(http: ConnectorHttp, apiKey: string): Promise<string>
export async function listTranscripts(http: ConnectorHttp, apiKey: string, from: Date): Promise<Map<string, number>>
export async function fetchTranscript(http: ConnectorHttp, apiKey: string, id: string): Promise<Transcript | null>
```

  Toutes en **POST** (GraphQL), mais ce sont des lectures. La fonction interne `graphql<T>(http, apiKey, query, variables, data)` n'est pas exportée ; elle accepterait une mutation telle quelle.
- **Manque pour écrire** : rien à écrire pour les agents visés. Source de déclenchement. Le quota de 500 requêtes par jour du plan gratuit limite toute lecture en direct. Jamais essayé en réel.

### 8.14 folk

- **Fichiers** : `folk/connector.ts` (94), `client.ts` (82), `map.ts` (64), `cursor.ts` (29), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`apiKey`). `Authorization: Bearer` et `X-API-Version: 2025-06-09` (`client.ts:9`, `:51`).
- **Portées** : aucune dans le code.
- **API** : `https://api.folk.app/v1`, version épinglée `2025-06-09`. Hôte : `api.folk.app`.
- **Relevé** : les notes seulement (`GET /v1/notes`, `limit` 50, `createdAfter`, pagination par `pagination.nextLink`). Les notes privées (`visibility` autre que `public`) ne sont pas rendues. Une réponse à une note sort en deux tours : le parent puis la réponse.
- **Non relevé** : contacts, entreprises, affaires, groupes, interactions (bêta, `connector.ts:24-27`). Une note modifiée après sa création n'est pas relue.
- **Curseur** : JSON `{ at: number, seen: string[] }` (`cursor.ts:5`).
- **Débit** : `minIntervalMs: 120` (20 requêtes par 2 secondes, 600 par minute, `connector.ts:84`).
- **Identifiants gardés** (`map.ts:43-52`) :

```ts
  return {
    externalId: `note:${note.id}`,
    nature: 'note',
    title: entityName ? `Note sur ${entityName}` : 'Note folk',
    url: null, // folk ne donne pas de lien vers une note
    updatedAt: iso,
    origin: {
      ...(entityName ? { entity: entityName } : {}),
      ...(entityType ? { entityType } : {}),
    },
```

  Tours : `parent` (facultatif) et `body`. **`url` est toujours nul.** L'identifiant de la fiche (`entity.id`) n'est **pas lu** : `NoteSchema.entity` ne porte que `entityType` et `fullName` (`client.ts:30`). On ne peut pas, aujourd'hui, retrouver la fiche d'une note pour y écrire.
- **Client existant** (`client.ts:50-80`, `folkClient(apiKey: string, http: ConnectorHttp)`) : `me()`, `notesCreatedAfter(after)`. Tout en GET.
- **Manque pour écrire** : créer une note sur une fiche, modifier un contact. [hors code] `POST /v1/notes` avec l'identifiant de la fiche. Il faut d'abord ajouter `id` à `entity` dans `NoteSchema` et le garder dans `origin`. Jamais essayé en réel.

### 8.15 Freshdesk

- **Fichiers** : `freshdesk/connector.ts` (141), `client.ts` (112), `map.ts` (104), `cursor.ts` (36), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`domain`, `apiKey`). `Authorization: Basic base64(apiKey:X)` (`client.ts:57-59`). La clé est celle d'un agent : elle a ses droits, écriture comprise.
- **Portées** : aucune dans le code.
- **API** : `https://<domain>.freshdesk.com/api/v2` (`client.ts:55`). L'hôte dépend de la configuration : `hosts: (config) => [`${config.domain}.freshdesk.com`]`.
- **Relevé** : les tickets modifiés (`GET /tickets` avec `updated_since`, `order_by: 'updated_at'`, `order_type: 'asc'`, `include: 'requester,description'`, `per_page` 50, pagination par `Link`), les conversations de chaque ticket (`GET /tickets/{id}/conversations`), l'annuaire des agents (`GET /agents`). Les notes internes sont marquées `internalNote`. Chaque tour porte `side`.
- **Non relevé** : statut, priorité, type, agent assigné, étiquettes, champs personnalisés (`TicketSchema` ne lit que `id`, `subject`, `description`, `description_text`, `requester`, `group_id`, `company_id`, `updated_at`), tickets supprimés ou en spam, pièces jointes, noms des groupes et des entreprises, articles de la base d'aide.
- **Curseur** : JSON `{ at, seen: number[] }` (`cursor.ts:8`), relu une seconde avant.
- **Débit** : `minIntervalMs: 1000` (60 par minute au plus, sur les 100 du plan Growth pour tout le compte, `connector.ts:122`). L'API est fermée au plan gratuit (`connector.ts:51-52`).
- **Identifiants gardés** (`map.ts:91-103`) :

```ts
  return {
    externalId: `ticket:${ticket.id}`,
    nature: 'fil',
    title: ticket.subject ? `#${ticket.id} ${ticket.subject}` : `#${ticket.id}`,
    url: `https://${domain}.freshdesk.com/a/tickets/${ticket.id}`,
    updatedAt: ticket.updated_at,
    origin: {
      domain,
      ...(ticket.group_id == null ? {} : { group: String(ticket.group_id) }),
      ...(ticket.company_id == null ? {} : { company: String(ticket.company_id) }),
    },
    turns: [...body, ...replies],
  };
```

  Tours : `body` (toujours `side: 'external'`), `conversation:${row.id}`. `origin.group` et `origin.company` sont des **numéros** en texte. Tout ce qu'il faut pour répondre ou annoter est là : `domain` et le numéro du ticket.
- **Client existant** (`client.ts:54-110`, `freshdeskClient(access: FreshdeskAccess, http: ConnectorHttp)`) : `me()`, `agents()`, `tickets(from)`, `conversations(ticketId)`. Tout en GET.
- **Manque pour écrire** : répondre, poser une note interne, changer statut, priorité, groupe ou assigné. [hors code] `POST /api/v2/tickets/{id}/reply`, `POST /api/v2/tickets/{id}/notes` (`private: true`), `PUT /api/v2/tickets/{id}`. Pour l'agent « tri », il manque aussi la lecture de l'état actuel (statut, priorité, assigné) et la liste des groupes. Une réponse est une écriture vers l'extérieur ; une note privée et un changement de champ sont internes. Le budget de 100 requêtes par minute est partagé par tout le compte du client. Jamais essayé en réel.

### 8.16 Front

- **Fichiers** : `front/connector.ts` (103), `client.ts` (135), `read.ts` (63), `map.ts` (104), `cursor.ts` (37), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`token`, jeton d'API créé par un administrateur). `Authorization: Bearer`. Le jeton a une portée choisie à sa création : ressources globales, partagées ou privées, et droits Read, Write… (`connector.ts:12-13`). Écrire dépend donc de la façon dont le client a créé son jeton.
- **Portées** : aucune dans le code. Mais le catalogue fait créer un jeton **en lecture seule** (`front/catalog.ts:15`) : « choisit les ressources partagées (toutes les boîtes à lire) et la permission « Read » ». Pour écrire, chaque client devra recréer un jeton avec « Write » et le recoller.
- **API** : `https://api2.frontapp.com` (`client.ts:6`), sans numéro de version. Hôte : `api2.frontapp.com` seulement. Front rend l'adresse de la page suivante sur le sous-domaine de l'entreprise, que le client commun refuse : `onApi2()` la ramène sur `api2` (`client.ts:60-71`).
- **Relevé** : le flux des événements (`GET /events` avec `q[after]`, `q[types]`, `limit` 15, `sort_by: 'created_at'`, `sort_order: 'asc'`). Types suivis (`client.ts:11`) :

```ts
const EVENT_TYPES = ['inbound', 'outbound', 'out_reply', 'comment'];
```

  Chaque conversation touchée est relue en entier : `GET /conversations/{id}/messages` et `GET /conversations/{id}/comments`. Les commentaires d'équipe sont des notes internes (`internalNote: true`).
- **Non relevé** : la boîte (inbox), les étiquettes, l'état de la conversation (ouverte, archivée), l'assigné, les brouillons (`draft_mode`), les pièces jointes, les fusions de conversations. Les e-mails citent les messages précédents : le texte se répète.
- **Curseur** : JSON `{ at: number, seen: Array<[string, number]> }` (`cursor.ts:11-14`), relu 2 secondes avant.
- **Débit** : `minIntervalMs: 1500`, le plus lent des 21 (50 requêtes par minute au plus bas forfait, comptées par entreprise, `connector.ts:91`). C'est le seul connecteur déjà **piloté par un flux d'événements** : son `GET /events` ressemble à ce qu'un webhook donnerait.
- **Identifiants gardés** (`map.ts:95-103`) :

```ts
  return {
    externalId: `conversation:${id}`,
    nature: 'fil',
    title: subject?.trim() || 'Conversation sans objet',
    url: `${OPEN_URL}/${id}`,
    updatedAt: last.ts,
    origin: {},
    turns,
  };
```

  Tours : `message:${message.id}` et `comment:${comment.id}`, avec `side` et `internalNote`. `origin` est **vide**. `OPEN_URL` vaut `https://app.frontapp.com/open`. L'identifiant de conversation et celui de chaque message sont gardés : c'est ce qu'il faut pour répondre ou commenter.
- **Client existant** (`client.ts:73-133`, `frontClient(token: string, http: ConnectorHttp)`) : `company()`, `probe()`, `firstEvents(after)`, `nextEvents(url)`, `messages(id)`, `comments(id)`. Tout en GET.
- **Manque pour écrire** : commenter (note interne), créer un brouillon de réponse, répondre, étiqueter, assigner. [hors code] `POST /conversations/{id}/comments`, `POST /conversations/{id}/drafts`, `POST /conversations/{id}/messages`, `PATCH /conversations/{id}`. Un brouillon de réponse existe chez Front : il permet « propose » sans envoyer. Le budget de 50 requêtes par minute par entreprise est déjà consommé par la relève. Avertissement du catalogue (`front/catalog.ts:18-19`) : « Une clause des conditions de Front sur l'entraînement de modèles est ambiguë : à faire confirmer par écrit avant tout client. » Jamais essayé en réel.

### 8.17 GitHub

Le seul connecteur qui écrit déjà. Sa carte d'actions est ailleurs (`src/server/discussion/github-actions.ts`, `github-live.ts`, `src/lib/actions.ts`, non relus ici).

- **Fichiers** : `github/connector.ts` (255), `client.ts` (470), `map.ts` (151), `oauth.ts` (78), `depots-equipe.ts` (103), `catalog.ts`, `connector.test.ts`, `oauth.test.ts`, `depots-equipe.db.test.ts`, `fixtures/`.
- **Authentification** : clé collée (`token`, jeton personnel, avec `repos` obligatoires, 20 au plus) ou bouton : une **GitHub App** (pas une appli OAuth), jeton utilisateur `ghu_…`. PKCE, `scopes: []`, `extraAuthorizeParams: { prompt: 'select_account' }`. Jeton d'accès de 8 heures, jeton de rafraîchissement de 6 mois à usage unique (`oauth.ts:28-29`). `nextStep` envoie l'utilisateur sur l'écran d'installation de l'appli (`oauth.ts:65-71`), avec la variable `LEON_OAUTH_GITHUB_APP`.
- **Portées** : celles de l'appli, réglées dans sa console (`applis-oauth.md:31`) : « Contents », « Issues », « Pull requests », « Actions » et « Workflows » en lecture et écriture ; « Checks » et « Commit statuses » en lecture ; « Metadata » en lecture. L'en-tête de `oauth.ts:5-6` ne cite encore que Issues et Pull requests : le guide est plus récent (décision du 27/10/2026).
- **API** : `https://api.github.com` (`client.ts:12`). En-têtes fixes (`client.ts:169-174`) :

```ts
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Leon',
  };
```

- **Relevé** : tickets et PR des **dépôts d'équipe** seulement (table `depots_equipe`, cochés par un administrateur ; `state.depotsEquipe`, `connector.ts:196-203`). Par dépôt : `GET /repos/{repo}/issues` (`state: 'all'`, `sort: 'updated'`, `direction: 'asc'`, `since`, 50 par page), puis `GET …/issues/{n}/comments`, et pour une PR `GET …/pulls/{n}/reviews`, `GET …/pulls/{n}/comments`, `GET …/pulls/{n}`. Un 410 sur les tickets fait lire les PR seules.
- **Non relevé par la relève** : le code, les commits, les exécutions de CI, les discussions GitHub, les wikis, les étiquettes. Le code, les commits et la CI se lisent **en direct** par les outils de la discussion (fonctions du client ci-dessous).
- **Curseur** : JSON par dépôt (`connector.ts:97-100`) :

```ts
const CursorSchema = z.record(
  z.string(),
  z.object({ at: z.iso.datetime(), seen: z.array(z.number()), details: z.boolean().optional() }),
);
```

  Les dépôts jamais lus passent d'abord (`leastRecentFirst`). Chaque page porte `depotsConfirmes`.
- **Débit** : **pas de `minIntervalMs`**. Le client commun reprend sur 429 ou sur 403 avec `x-ratelimit-remaining: 0`.
- **Identifiants gardés** (`map.ts:142-150`) :

```ts
  return {
    externalId: `${issue.pull_request ? 'pr' : 'issue'}:${repo}#${issue.number}`,
    nature: 'ticket',
    title: `#${issue.number} ${issue.title}`,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    origin: { repo, ...facts(issue, pull) },
    turns: [body, ...replies].filter(isTurn),
  };
```

  Tours : `body`, `comment:${id}`, `review:${id}`, `review-comment:${id}`. `origin` porte l'état, en clés françaises (`map.ts:75-85`) :

```ts
export const GITHUB_FACT_KEYS = [
  'etat',
  'fini_le',
  'auteur',
  'cote',
  'assignes',
  'branche',
  'tete',
  'brouillon',
  'ferme',
] as const;
```

  C'est **le seul connecteur des 21 qui garde l'état d'un élément** (`etat` : `open`, `merged`, `closed:<raison>`) et ses assignés dans `origin`. C'est le modèle à suivre pour les tickets de support et les tâches.
- **Client existant** (`client.ts:167-465`, `githubClient(token: string, http: ConnectorHttp)`). Lectures : `account`, `installedRepos`, `checkRepo`, `canRead`, `issues`, `pullRequests`, `issueComments`, `reviews`, `reviewComments`, `defaultBranch`, `branchSha`, `branches`, `commits`, `commit`, `tree`, `file`, `pull`, `pullFiles`, `checkRuns`, `workflowRuns`, `openIssues`, `issue`, `run`. **Écritures**, toutes par le même fabricant (`client.ts:175-176`) :

```ts
  const write = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    ({ url: `${API}${path}`, method, headers, body, once: true }) satisfies HttpRequest;
```

  Signatures des écritures (`client.ts:430-463`) :

```ts
    deleteBranch: (repo: string, branch: string) =>
    writeFile: (repo: string, path: string, body: FileWrite) =>
    deleteFile: (repo: string, path: string, body: Required<Omit<FileWrite, 'content'>>) =>
    openPull: (repo: string, body: Record<string, string | boolean>) =>
    editPull: (repo: string, number: number, body: Record<string, string>) =>
    mergePull: (repo: string, number: number, body: { merge_method: string; sha: string }) =>
    comment: (repo: string, number: number, body: string) =>
    requestReviewers: (repo: string, number: number, reviewers: string[]) =>
    submitReview: (repo: string, number: number, body: Record<string, string>) =>
    openIssue: (repo: string, body: IssueWrite) =>
    editIssue: (repo: string, number: number, body: IssueWrite & { state?: string }) =>
    rerun: (repo: string, id: number, failedOnly: boolean) =>
    cancelRun: (repo: string, id: number) =>
```

  `createBranch(repo, branch, sha)` (`client.ts:345-354`) est aussi une écriture (POST), mais écrite **sans** `once` ni le fabricant `write`. Avec les 13 ci-dessus, cela fait les 14 actions.

```ts
type FileWrite = { message: string; branch: string; content?: string; sha?: string };
type IssueWrite = { title?: string; body?: string; labels?: string[]; assignees?: string[] };
```

  Autre export utile (`connector.ts:89-93`), l'entrée pour un appel en direct depuis une configuration enregistrée :

```ts
export const liveGithub = (config: Record<string, unknown>, http: ConnectorHttp) => {
  const parsed = ConfigSchema.parse(config);
  const github = githubClient(bearerOf(parsed), http);
  return { github, repos: () => reposToRead(github, parsed) };
};
```

- **Manque pour écrire** : rien côté client. Ce qui manque est hors de ce dossier : une exécution sans discussion ouverte, des types d'action hors `github.*`. **Essayé en réel** en lecture (`github/catalog.ts:26` : `triedForReal: true, // branché en production (relèves réussies, novembre 2026)`). D'après l'annexe 8, les essais réels des écritures restent à faire (lot 11 de la spec GitHub ; non relu ici).

### 8.18 GitLab

- **Fichiers** : `gitlab/connector.ts` (165), `client.ts` (131), `map.ts` (61), `cursor.ts` (44), `oauth.ts` (46), `catalog.ts`, `connector.test.ts`, `fixtures/`. Pas de `oauth.test.ts`.
- **Authentification** : clé collée (`token`, en-tête `PRIVATE-TOKEN`, avec `projects` obligatoires, 20 au plus) ou bouton OAuth natif (`authorization: Bearer`) (`connector.ts:82-85`). PKCE, formulaire. Jeton d'accès de 2 heures, jeton de rafraîchissement à usage unique. **gitlab.com seulement** : une instance hébergée par le client n'est pas prise en charge (`hosts: () => ['gitlab.com']`, `applis-oauth.md:61`).
- **Portées** (`gitlab/oauth.ts:34`) :

```ts
  scopes: ['api'], // Leon n'écrit pas encore : l'accès est demandé d'avance
```

  `api` couvre la lecture et l'écriture de toute l'API, registres compris, et permet de supprimer (`oauth.ts:12-17`). Par clé collée, le code cite `read_api` (`connector.ts:17`) : une clé collée en lecture seule ne pourra pas écrire.
- **API** : `https://gitlab.com/api/v4` (`client.ts:11`).
- **Relevé** : par projet (ceux de la liste, ou par bouton les 20 projets les plus actifs dont l'utilisateur est membre), deux flux (`connector.ts:93`) :

```ts
const STREAMS: Stream[] = ['issues', 'merge_requests'];
```

  `GET /projects/{chemin}/{flux}` (`scope: 'all'`, `state: 'all'`, `order_by: 'updated_at'`, `sort: 'asc'`, `updated_after`, 50 par page, `pagination: 'keyset'` pour les tickets seulement), puis `GET …/{flux}/{iid}/notes`. Les notes système sont écartées.
- **Non relevé** : l'**état** (ouvert, fermé, fusionné), les assignés, les étiquettes, les jalons, la branche d'une demande de fusion, les commentaires de revue sur le code en tant que tels, le code, les pipelines. `ListedSchema` ne lit que `iid`, `title`, `description`, `web_url`, `author`, `updated_at`, `user_notes_count` (`client.ts:20-28`). C'est très en retrait de GitHub.
- **Curseur** : JSON par `${stream}:${project}`, `{ at, seen: number[] }` (`cursor.ts:8-16`).
- **Débit** : **pas de `minIntervalMs`**.
- **Identifiants gardés** (`map.ts:52-60`) :

```ts
  return {
    externalId: `${id}:${project}${sign}${listed.iid}`,
    nature: 'ticket',
    title: `${sign}${listed.iid} ${listed.title}`,
    url: listed.web_url,
    updatedAt: listed.updated_at,
    origin: { project },
    turns: [body, ...replies].filter(isTurn),
  };
```

  Soit `issue:acme/leon#12` ou `mr:acme/leon!7`. Tours : `body`, `note:${note.id}`. Le chemin du projet et l'`iid` suffisent à réécrire. Les auteurs n'ont pas d'adresse, et les tours n'ont pas de `side`.
- **Client existant** (`client.ts:45-129`, `gitlabClient(headers: Record<string, string>, http: ConnectorHttp)`) : `account()`, `memberProjects(max)`, `checkProject(project)`, `list(project, stream, since)`, `notes(project, stream, iid)`. Tout en GET.
- **Manque pour écrire** : créer un ticket, commenter (créer une note), modifier un ticket. [hors code] `POST /projects/{chemin}/issues`, `POST /projects/{chemin}/issues/{iid}/notes`, `PUT /projects/{chemin}/issues/{iid}`. Pour l'agent « escalade », GitLab peut copier GitHub, mais il faut d'abord relever l'état. Jamais essayé en réel.

### 8.19 Gmail

- **Fichiers** : `gmail/connector.ts` (102), `client.ts` (138), `map.ts` (113), `schemas.ts` (37), `catalog.ts` (23), `connector.test.ts`. Pas de `fixtures/`, pas de `oauth.ts`, pas de `cursor.ts`.
- **Authentification** : **Pipedream Connect** seulement (`pipedream: { app: 'gmail' }`, `configSchema: PipedreamConfigSchema`, `secretFields: []`). Leon ne tient aucun jeton Google. `privateRaw: true` : la boîte est privée à celui qui la branche (`connector.ts:62`).
- **Portées** : celles de l'appli Google de Pipedream, validée pour `gmail.modify` (`connector.ts:8-9`). Le catalogue dit à l'utilisateur : « lire, écrire et envoyer vos courriers » (`catalog.ts:10`). Le code ne dit pas si l'appli Pipedream porte aussi `gmail.send` à part : à vérifier sur un compte branché (les droits accordés sont lisibles par `findAccount`, qui rend `scopes`, `pipedream.ts:162-183`).
- **API** : `https://gmail.googleapis.com` (`client.ts:15`), chemins `/gmail/v1/users/me/…` et lot `/batch/gmail/v1`.
- **Relevé** : `GET /gmail/v1/users/me/messages` avec `q` et `maxResults` 100, puis les messages par lots de 20 dans une seule requête `POST /batch/gmail/v1` (multipart, `format=full`). Filtre (`connector.ts:27`) :

```ts
const FILTER = '-in:chats -in:drafts -category:promotions -category:social';
```

  Messages reçus **et** envoyés. Les libellés `DRAFT`, `SPAM`, `TRASH`, `CHAT` sont écartés une seconde fois (`map.ts:82`).
- **Non relevé** : pièces jointes, brouillons, libellés (seul `SENT` sert, pour `side`), destinataires (`To`, `Cc` ne sont pas gardés : seul `From` est lu), en-têtes `Message-ID`, `In-Reply-To`, `References`. Un fil n'est pas relu en entier : seuls les messages de la fenêtre le composent.
- **Curseur** : JSON `{ done, window: { before, pageToken, skip } | null }` (`connector.ts:30-39`). Fenêtres bornées par `after:` et `before:` en secondes, avec une heure de marge (`OVERLAP_S`).
- **Débit** : pas de `minIntervalMs`. `BATCH_SIZE = 20` : à 50 ou 100, Gmail refuse 25 à 35 % des lectures (essai réel du 25/10, `client.ts:17-19`). Un lot vaut 1 crédit Pipedream. Relève aux heures de bureau seulement.
- **Identifiants gardés** (`map.ts:101-110`) :

```ts
    items.push({
      externalId: `thread:${threadId}`,
      nature: 'fil',
      title: titleOf(headerOf(first.message.payload, 'subject')),
      // Le fil dans le premier compte Google ouvert du navigateur.
      url: `https://mail.google.com/mail/#all/${threadId}`,
      updatedAt: last.turn.ts,
      origin: {},
      turns: entries.map((entry) => entry.turn),
    });
```

  Tours : `message:${message.id}`, avec `side: 'team'` quand le message porte le libellé `SENT`. `origin` est **vide**. Pour répondre dans le fil, on a `threadId` et l'identifiant Gmail de chaque message. Il manque l'en-tête `Message-ID` du dernier message et la liste des destinataires : il faudra relire le message en direct avant de composer la réponse.
- **Client existant** (`client.ts:61-137`, `gmailClient(http: ConnectorHttp)`) : `profile()` GET, `list(q, pageToken)` GET, `messages(ids)` **POST** `/batch/gmail/v1` (un lot de lectures). Export utile : `parseBatch(text, type)`. Aucun en-tête d'autorisation : Pipedream l'ajoute.
- **Manque pour écrire** : créer un brouillon, envoyer, poser un libellé. [hors code] `POST /gmail/v1/users/me/drafts`, `POST /gmail/v1/users/me/messages/send`, `POST /gmail/v1/users/me/messages/{id}/modify`. Le corps d'un brouillon est un message RFC 822 encodé en base64url : rien dans le code ne sait le composer (`map.ts` ne fait que décoder). Chaque écriture coûte un crédit Pipedream. L'envoi est l'écriture vers l'extérieur par excellence. **Essayé en réel** en lecture (`catalog.ts:12`).

### 8.20 Gong

- **Fichiers** : `gong/connector.ts` (98), `client.ts` (107), `map.ts` (95), `cursor.ts` (57), `catalog.ts`, `connector.test.ts`, `fixtures/`.
- **Authentification** : clé collée seulement (`baseUrlHost`, `accessKey`, `accessKeySecret`). `authorization: Basic base64(accessKey:accessKeySecret)` (`client.ts:60`). `secretFields: ['accessKeySecret', 'accessKey']`. Clé créée par un administrateur technique.
- **Portées** : le code cite celles de la clé, sans les avoir vérifiées : `api:calls:read:extensive`, `api:calls:read:transcript` (`connector.ts:44`). Lecture seule.
- **API** : `https://<baseUrlHost>.api.gong.io/v2/calls` (`client.ts:59`). L'hôte dépend de la configuration.
- **Relevé** : `POST /v2/calls/extensive` (période `fromDateTime`, `toDateTime`, avec `contentSelector` pour les participants et le résumé `brief`), puis `POST /v2/calls/transcript` par lots de 50 identifiants. Un 404 vaut « rien » (`acceptStatus: [404]`). Sans transcription, le résumé de Gong devient le tour document.
- **Non relevé** : les fiches de CRM liées à l'appel, les sujets (« trackers »), les scores, les prochaines étapes de Gong, les e-mails suivis par Gong.
- **Curseur** : JSON `Walk = { after, to, next, max }` (`cursor.ts:14-19`). Chaque parcours relit les 6 dernières heures (`LOOKBACK_MS`).
- **Débit** : `minIntervalMs: 350` (3 appels par seconde, 10 000 par jour).
- **Identifiants gardés** (`map.ts:86-94`) :

```ts
  return {
    externalId: `call:${metaData.id}`,
    nature: 'reunion',
    title: metaData.title?.trim() || 'Réunion sans titre',
    url: metaData.url ?? null,
    updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
```

  Tours : `utterance:${index}` (un par monologue, avec nom et adresse du participant quand `speakerId` est connu) ou `summary`.
- **Client existant** (`client.ts:58-106`, `gongClient(access: GongAccess, http: ConnectorHttp)`) : `listCalls(window: CallWindow)`, `transcripts(callIds)`. Toutes deux en **POST**, mais ce sont des lectures.
- **Manque pour écrire** : rien à écrire dans Gong. Source de déclenchement (fin d'appel client). Gong liste un appel quand il a fini de le traiter, pas à son heure de début : le déclencheur « fin d'appel » arrive avec un retard inconnu (`cursor.ts:22-25`). Jamais essayé en réel.

### 8.21 Granola

- **Fichiers** : `granola/connector.ts` (91), `client.ts` (128), `map.ts` (80), `catalog.ts`, `connector.test.ts`, `fixtures/`. Le curseur est dans `connector.ts`.
- **Authentification** : clé collée seulement (`apiKey`, « grn_… »). `authorization: Bearer`.
- **Portées** : aucune dans le code (l'en-tête cite « clé, portées » dans la doc lue, sans détail).
- **API** : `https://public-api.granola.ai`, chemins `/v1/notes` (`client.ts:11`, `:80`).
- **Relevé** : `GET /v1/notes` (`updated_after`, `page_size` 30, curseur de l'outil), puis `GET /v1/notes/{id}?include=transcript`. Sur un 413 (transcription trop grande) : la note sans transcription, puis `GET /v1/notes/{id}/transcript` par pages de 100. Les notes supprimées (`deleted_at`) sont écartées.
- **Non relevé** : les notes privées (`private_notes_*`), les dossiers. Une note n'existe pour l'API qu'avec résumé et transcription (`connector.ts:12`).
- **Curseur** : JSON `{ updatedAt, ids }` (`connector.ts:30`). Granola a un vrai filtre « modifié depuis ».
- **Débit** : `minIntervalMs: 200` (5 requêtes par seconde).
- **Identifiants gardés** (`map.ts:71-79`) :

```ts
  return {
    externalId: `meeting:${note.id}`,
    nature: 'reunion',
    title: note.title?.trim() || note.calendar_event?.event_title?.trim() || UNTITLED,
    url: note.web_url ?? null,
    updatedAt: note.updated_at,
    origin: participants === '' ? {} : { participants },
    turns,
  };
```

  Tours : `utterance:${index}` ou `summary`. Attention : Circleback et Granola écrivent tous deux `meeting:<id>` ; c'est sans conflit, car la clé unique d'une source porte l'outil (`sources.kind`).
- **Client existant** (`client.ts:74-128`, `granolaClient(apiKey: string, http: ConnectorHttp)`) : `hasNotes()`, `listNotes(updatedAfter)`, `readNote(id)`. Tout en GET. Le client n'exporte pas de type `GranolaClient`.
- **Manque pour écrire** : rien à écrire dans Granola. Source de déclenchement. Jamais essayé en réel.

## Tableau récapitulatif

(à compléter)
