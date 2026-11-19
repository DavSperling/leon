# Carte 01 : le socle des connecteurs

19 novembre 2026 · lecture seule du dépôt (branche `claude/dreamy-hamilton-zhpa1m`, commit `9c40821`).

Tout ce qui est cité vient d'un fichier lu. Les numéros de ligne sont ceux de ce commit. Les blocs de code sont recopiés ; quand un commentaire est raccourci, c'est signalé par `…`. Ce qui est une proposition (section 5) est marqué « à ajouter » : rien de tel n'existe dans le code.

## 1. Ce que fait ce module

- Un connecteur est un module sans base ni état. Il sait vérifier un compte (`verify`) et rendre des pages d'éléments (`sync`).
- Le socle fait le reste : chiffrement des secrets, relève planifiée, client HTTP borné, normalisation, ingestion.
- Une connexion est une ligne de la table `connections`. Elle appartient à la personne qui l'a branchée. La relève tourne sous ses droits.
- Un tic pg-boss par minute met en file un job par connexion due. Quatre relèves tournent à la fois, 200 éléments au plus par passage.
- Un élément relevé devient une ligne `sources` et des lignes `turns`. Un job d'indexation les découpe en `passages`, puis demande les vecteurs (`passage_vectors`).
- Trois façons de s'authentifier : clé collée, bouton OAuth (16 applis, 17 connecteurs), bouton Pipedream (Gmail, Drive, Slack).
- Tout est sondage. Aucun webhook entrant. Le client HTTP sait écrire, mais seul le client GitHub s'en sert.

## 2. Types et fonctions à connaître

### 2.1 Le contrat d'un connecteur

`src/server/connectors/types.ts:13-51`

```ts
export type ConnectorTurn = {
  externalId: string; // stable, sans empreinte : « body », « comment:456 »
  role: 'document' | 'participant';
  author: { name: string | null; email: string | null };
  // … lu dans un champ de l'outil, jamais déduit d'un nom ni d'un texte
  side?: AuthorSide;
  // Une note que seule l'équipe voit (le client ne l'a pas lue). …
  internalNote?: boolean;
  text: string; // texte brut (HTML déjà passé par htmlToText)
  // ISO 8601. …
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

`src/server/connectors/types.ts:99-118`

```ts
// Syntaxe de méthode, exprès : elle rend un Connector<Config> assignable à AnyConnector.
export type Connector<Config> = {
  id: ProviderId;
  configSchema: z.ZodType<Config>; // tous les champs, secrets compris ; un z.object, sans .transform
  secretFields: readonly string[]; // noms des champs à chiffrer
  hosts(config: Config): string[]; // hôtes exacts autorisés, ex. ['api.github.com']
  minIntervalMs?: number; // écart minimal entre deux requêtes (Notion : 350)
  // Texte brut privé à celui qui branche, comme une conversation (boîte mail personnelle).
  // Absent : visible de l'équipe.
  privateRaw?: boolean;
  // `account` : le libellé affiché. `accountKey` : l'identifiant stable du compte …
  verify(config: Config, http: ConnectorHttp): Promise<{ account: string; accountKey?: string }>;
  sync(config: Config, state: SyncState, http: ConnectorHttp): AsyncIterable<SyncPage>;
  oauth?: OAuthSpec; // le bouton ; absent : l'outil ne se branche que par clé
  // Le bouton passe par Pipedream Connect (pipedream.ts) : `app` est le nom de l'appli chez Pipedream.
  // La configuration est alors PipedreamConfigSchema, et chaque requête passe par son proxy.
  pipedream?: { app: string };
};
export type AnyConnector = Connector<Record<string, unknown>>;
```

Les listes fermées viennent de `src/capture/turn.ts` :

- `PROVIDER_IDS` (`:29-72`) : les 42 identifiants. `ProviderId` en est le type.
- `ITEM_NATURES` (`:84-97`) : `'conversation' | 'reunion' | 'page' | 'ticket' | 'fil' | 'note' | 'mail' | 'fichier' | 'evenement' | 'commit' | 'fil_de_travail'`.
- `AUTHOR_SIDES` (`:123`) : `['team', 'external']`.
- `TURN_CAPTURE_MODES` (`:125`) : les tours d'un connecteur portent `'connector'`.

Le registre : `src/server/connectors/registry.ts:47` et `:92`.

```ts
export const CONNECTORS: Record<ProviderId, AnyConnector | null> = { github: githubConnector, /* … 42 entrées */ };

export function getConnector(id: ProviderId): AnyConnector | null {
  return CONNECTORS[id];
}
```

Le catalogue (partie publique, lue par l'interface) : types `CatalogField`, `CatalogEntry`, `CatalogEnglish` dans `types.ts:121-152` ; `CATALOG_ENTRIES`, `catalogItem`, `listCatalog(locale = 'en', returnTo?)` et le type `CatalogItem` dans `src/server/connectors/catalog.ts:59-178`.

Un dossier par outil : `connector.ts` (le `Connector`), `client.ts` (les requêtes), `map.ts` (réponse → `ConnectorItem`), `catalog.ts`, et selon l'outil `oauth.ts`, `schemas.ts`, `cursor.ts`, `fixtures/`.

Exemple complet lu : `src/server/connectors/linear/connector.ts:117-156` (clé ou bouton, deux flux, curseur JSON validé par zod).

### 2.2 La table `connections` et ses fonctions

Schéma Drizzle : `src/server/db/schema/connections.ts:10-37`. Migration d'origine : `src/server/db/migrations/0008-connecteurs.sql:3-32`.

```ts
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: PROVIDER_IDS }).notNull(),
  label: text('label').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  secret: text('secret').notNull(),
  secretHint: text('secret_hint').notNull(),
  status: text('status', { enum: CONNECTION_STATUSES }).notNull().default('active'), // 'active' | 'paused' | 'error'
  cursor: text('cursor'),
  since: timestamp('since', { withTimezone: true }).notNull(),
  nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
  syncLockAt: timestamp('sync_lock_at', { withTimezone: true }),
  lastSyncStartedAt: timestamp('last_sync_started_at', { withTimezone: true }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  itemsSynced: integer('items_synced').notNull().default(0),
  acl: uuid('acl').array().notNull(),
  // Qui voit ce qu'elle relève (0056) ; nul : le choix de l'outil. Ne s'écrit que par partager_connexion.
  partage: uuid('partage').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`src/server/db/migrations/0008-connecteurs.sql:26-32`

```sql
create index connections_due_idx on connections (next_sync_at) where status in ('active', 'error');

alter table connections enable row level security;
create policy tenant_acl on connections to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
grant select, insert, update, delete on connections to leon_app;
```

Contraintes SQL utiles (`0008:8-19`) : `label` de 1 à 120 caractères, `secret like 'v1:%'`, `secret_hint` ≤ 4 caractères, `last_error` ≤ 300 caractères. La contrainte sur `provider` a été retirée en 0010 : la liste se valide dans le code (`src/server/db/schema-contract.db.test.ts:66`, `:178`).

Toutes les fonctions sont dans `src/server/connectors/connections.ts`.

```ts
// :25
export type ConnectionStatus = 'active' | 'paused' | 'error';

// :49-54
export type LoadedConnection = ConnectionRef & {
  config: Record<string, unknown>;
  cursor: string | null;
  since: Date;
  lockedAt: string; // heure de la réservation, en texte : la microseconde se compare telle quelle
};

// :56-59
export type SyncOutcome =
  | { kind: 'ok'; again: 'soon' | 'later' | 'office' }
  | { kind: 'auth_error'; message: string }
  | { kind: 'error'; message: string; again?: 'office' };
```

`ConnectionView` (`:28-46`) est ce que voit l'interface : jamais le secret, seulement `secretHint`, plus `canManage`, `isCreator`, `creatorLeft`, `partage`.

Signatures (mêmes lignes) :

```ts
// :128  Pour l'interface et le retour OAuth
export async function createConnection(ctx: TenantContext, input: {
  provider: ProviderId; label: string; config: Record<string, unknown>;
  secretFields: readonly string[]; since: Date;
}): Promise<string>
// :159
export async function listConnections(ctx: TenantContext): Promise<ConnectionView[]>
// :211
export async function replaceConnectionSecret(ctx: TenantContext, id: string,
  config: Record<string, unknown>, secretFields: readonly string[]): Promise<boolean>
// :236
export async function saveOAuthTokens(ctx: TenantContext, id: string,
  config: Record<string, unknown>, secretFields: readonly string[],
  options: { reconnect: true } | { reconnect: false; renewedFrom: string }): Promise<boolean>
// :270
export async function setConnectionPaused(ctx: TenantContext, id: string, paused: boolean): Promise<boolean>
// :297
export async function requestSyncNow(ctx: TenantContext, id: string): Promise<boolean>
// :317
export async function shareConnection(ctx: TenantContext, id: string, partage: Partage): Promise<boolean>
// :333
export async function deleteConnection(ctx: TenantContext, id: string): Promise<boolean>
// :347  Lecture en direct : seulement MES connexions, secrets compris, hors pause
export async function loadMyConnections(ctx: TenantContext, provider: ProviderId):
  Promise<Array<Pick<LoadedConnection, 'id' | 'provider' | 'config'> & { label: string }>>

// Réservées à la relève
// :391
export async function claimConnection(ctx: TenantContext, id: string): Promise<LoadedConnection | null>
// :440
export async function saveSyncProgress(ctx: TenantContext, id: string, lockedAt: string,
  cursor: string, itemsAdded: number, depotsConfirmes?: string[]): Promise<boolean>
// :471
export async function saveAccountKey(ctx: TenantContext, id: string, lockedAt: string,
  accountKey: string | null): Promise<void>
// :523
export async function finishSync(ctx: TenantContext, id: string, lockedAt: string,
  outcome: SyncOutcome): Promise<void>
```

Gardes écrites dans ce fichier :

- `manageable(ctx)` (`:102-106`) : le créateur, ou un membre de rôle `owner` ou `admin`. Sert à la pause et à la suppression.
- `createdByMe(ctx)` (`:111`) : le créateur seul. Sert au remplacement de clé, à `saveOAuthTokens`, à `loadMyConnections`.
- `creatorIsMember` (`:115-117`) : la relève saute la connexion d'un créateur parti.
- `connections.acl` vaut toujours `[ctx.tenantId]` à la création (`:151`) : toute l'équipe voit la ligne.

### 2.3 Les files et la relève

`src/server/connectors/queue.ts:3-13`

```ts
// Deux files pg-boss : le tic (chaque minute) cherche les connexions dues, un job par connexion
// fait le passage. Le job ne porte que des identifiants, jamais la clé ni le moindre contenu.
export const CONNECTOR_QUEUES = { tick: 'connector-tick', sync: 'connector-sync' } as const;

// `userId` est le créateur de la connexion : la relève travaille sous ses droits.
export const ConnectorSyncJobSchema = z.object({
  connectionId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type ConnectorSyncJob = z.infer<typeof ConnectorSyncJobSchema>;
```

`src/server/connectors/worker.ts:7-10`, `:24-29`, `:52-55`

```ts
const RETRY = { retryLimit: 2 };
const SYNC_QUEUE = { ...RETRY, policy: 'short', expireInSeconds: 1800 } as const;
// …
await boss.schedule(CONNECTOR_QUEUES.tick, '* * * * *');
const options = { batchSize: 1, localConcurrency: 1, ...polling };
const syncOptions = { ...options, localConcurrency: 4 };
// …
export function startConnectorWorker(
  deps: SyncDeps = { getConnector },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void>
```

`src/server/connectors/sync.ts:27-34`, `:219`, `:259`

```ts
export const SYNC_ITEMS_MAX = 200;

export type SyncDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch; // tests
  sleep?: (ms: number) => Promise<void>; // tests
};
export type SyncResult = 'skipped' | 'ok' | 'auth_error' | 'error';

export async function runConnectorSync(job: ConnectorSyncJob, deps: SyncDeps): Promise<SyncResult>
export async function enqueueDueSyncs(): Promise<number>
```

La seule lecture hors RLS de la relève. Version en vigueur : `src/server/db/migrations/0019-corrections-audit.sql:58-68`.

```sql
create or replace function connector_syncs_due() returns table (connection_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.tenant_id, c.created_by from connections c
  where c.status in ('active', 'error') and c.next_sync_at <= now()
    and (c.sync_lock_at is null or c.sync_lock_at < now() - interval '30 minutes')
    and exists (
      select 1 from member m where m."userId" = c.created_by and m."organizationId" = c.tenant_id
    )
  order by c.next_sync_at
  limit 100
$$;
```

Le prochain passage : `src/server/connectors/connections.ts:492-504`.

```ts
const OFFICE_HOURS = sql`(select min(slot) from ( … unnest(array[8, 11, 14, 17]) as hour) as slots where slot > now())`; // heure de Paris

const NEXT_SYNC = {
  soon: sql`now() + interval '1 minute'`,
  later: sql`now() + interval '15 minutes'`,
  office: OFFICE_HOURS,
  retry: sql`now() + interval '1 hour'`,
  never: NO_DATE,
};
```

### 2.4 Le client HTTP

`src/server/connectors/http.ts:9-33`

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

`src/server/connectors/http.ts:36-69` (erreurs), `:71-75` (constantes), `:145-151` (fabrique)

```ts
export class ConnectorAuthError extends Error {      // message fixe : `${providerLabel} rejected the key`
  constructor(providerLabel: string, readonly status: number | null = null)
}
export class ConnectorHttpError extends Error {
  constructor(readonly status: number | null, message: string)
}
export class ResponseTooBigError extends ConnectorHttpError {}
export const GOOGLE_RATE_LIMIT = /ratelimitexceeded|dailylimitexceeded/i;
export class NothingToReadError extends Error {}

const TIMEOUT_MS = 30_000;
const BODY_MAX_BYTES = 10 * 1024 * 1024;
const RETRIES_MAX = 3;
const WAIT_MAX_MS = 60_000;
const BACKOFF_MS = 2000; // puis 4 et 8 secondes

export function createConnectorHttp(input: {
  provider: ProviderId;
  hosts: string[];
  minIntervalMs?: number;
  fetchImpl?: typeof fetch; // tests
  sleep?: (ms: number) => Promise<void>; // tests
}): ConnectorHttp
```

Comportement lu dans le code :

- **Hôtes** : `https` seulement, hôte dans la liste exacte, port explicite refusé, ni identifiant ni mot de passe dans l'adresse (`:165-176`). Sinon `ConnectorHttpError(null, 'Address not allowed')`.
- **Redirections** : `redirect: 'manual'` (`:246`). Un 3xx n'est pas suivi : il sort comme une erreur ordinaire.
- **Corps** : un seul parmi `body`, `form`, `raw` (`:203-205`). En-tête `accept: application/json` par défaut.
- **Débit** : `minIntervalMs` espace les requêtes d'un même client (`pace`, `:158-163`). Le compteur vit dans l'objet client : il ne vaut que pour ce passage, dans ce processus.
- **Reprises** : 429, 403 de limite (en-tête `retry-after`, `x-ratelimit-remaining: 0`, ou raison Google dans le corps), 5xx, erreur réseau, délai dépassé. Trois reprises au plus. Attente : `Retry-After`, sinon `x-ratelimit-reset`, sinon 2, 4, 8 s ; 60 s au plus (`:90-98`, `:216-227`, `:266-276`).
- **`once: true`** : aucune reprise. La première erreur « à reprendre » est levée telle quelle (`:273`).
- **401 et 403 hors limite** : `ConnectorAuthError(label, status)` tout de suite. Autre 4xx : `ConnectorHttpError(status, …)`.
- **Réponse** : JSON validé par le schéma zod passé. Illisible : `'Unreadable response'`. Hors schéma : `'Unexpected response'`. Plus de 10 Mo : `ResponseTooBigError`.
- **Jamais dans une erreur** : le corps de la réponse, l'adresse complète, un en-tête (`:5-7`).

Le client d'une connexion se construit par `connectorHttp`, pas par `createConnectorHttp` : voir 2.6.

### 2.5 Secrets, OAuth, jetons

Chiffrement : `src/server/connectors/crypto.ts:4-10`, `:21`, `:33`, `:42`.

```ts
// Format stocké : v1:<iv>:<tag>:<chiffré>, chaque partie en base64url.
// Les données associées (`<tenant_id>:<connection_id>`) lient le secret à sa ligne.
const ALGORITHM = 'aes-256-gcm';

export function connectorsKey(): Buffer | null   // env.LEON_CONNECTORS_KEY, 32 octets en base64
export function encryptSecret(plain: string, aad: string, key?: Buffer): string
export function decryptSecret(stored: string, aad: string, key?: Buffer): string  // lève Error('Secret illisible')
```

Les champs secrets d'une connexion sont chiffrés ensemble, en un seul JSON, dans `connections.secret` (`sealSecrets`, `connections.ts:71-84`). Les autres champs restent lisibles dans `connections.config` (`openConfig`, `:86-90`). `aadOf` : `` `${tenantId}:${connectionId}` `` (`:65`).

Ce que contient `config` une fois fusionné, selon le mode :

| Mode | Champs chiffrés | Champs ouverts |
|---|---|---|
| Clé (`authMode` absent ou `'key'`) | `connector.secretFields` (ex. `apiKey`) | le reste du `configSchema` |
| Bouton OAuth (`authMode: 'oauth'`) | `accessToken`, `refreshToken`, plus `connector.secretFields` | `authMode`, `expiresAt`, les champs de `toConfig`, `accountKey` |
| Pipedream (`authMode: 'pipedream'`) | `accountId` | `authMode`, `externalUserId`, `accountKey` |

Le bouton OAuth : `src/server/connectors/types.ts:53-97`.

```ts
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO 8601
  scope: string | null;
  raw: Record<string, unknown>;
};

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
  // Ajoutés à l'échange du code et au renouvellement.
  extraTokenParams?: { code?: Record<string, string>; refresh?: Record<string, string> };
  preFields: string[]; // champs non secrets demandés avant le clic : clés du configSchema
  setupHosts: string[]; // hôtes exacts que toConfig peut appeler ; [] s'il n'appelle rien
  adminConsent?: {
    isConsentError(input: { error: string; description: string | null }): boolean;
    url(clientId: string, redirectUri: string, returnTo?: OAuthReturnPath): string;
  };
  nextStep?(config: Record<string, unknown>, http: ConnectorHttp, returnTo?: OAuthReturnPath): Promise<string | null>;
  toConfig(tokens: OAuthTokens, preFields: Record<string, unknown>, http: ConnectorHttp): Promise<Record<string, unknown>>;
};
```

Les applis : `src/server/connectors/oauth-env.ts:5-23`, `:50`.

```ts
export const OAUTH_APP_KEYS = [
  'GITHUB', 'NOTION', 'LINEAR', 'GITLAB', 'ATLASSIAN', 'ASANA', 'CLICKUP', 'MONDAY',
  'AIRTABLE', 'HUBSPOT', 'HELPSCOUT', 'ATTIO', 'BASECAMP', 'MIRO', 'PRODUCTBOARD', 'OUTLOOK',
] as const;
export type OAuthAppKey = (typeof OAUTH_APP_KEYS)[number];

// Une chaîne vide vaut une variable absente ; une paire incomplète est ignorée.
export function oauthClient(appKey: OAuthAppKey): { id: string; secret: string } | null
```

Chaque paire `LEON_OAUTH_<APPLI>_ID` / `_SECRET` est lue en toutes lettres dans `PAIRS` (`:27-47`), à chaque appel. Elles ne passent pas par `EnvSchema`.

Le déroulé : `src/server/connectors/oauth.ts`.

```ts
// :18
export const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const;
// :20
const RENEW_BEFORE_MS = 5 * 60_000;
// :25
export class OAuthRefusedError extends Error { constructor(readonly adminConsent = false) }
// :33  `/api/v1/connexions/oauth/${spec.appKey.toLowerCase()}/retour`, sur env.BETTER_AUTH_URL
export function redirectUri(spec: OAuthSpec): string
// :38
export function authorizeUrl(spec: OAuthSpec, client: { id: string }, pending: OAuthPending): string
// :90
export const tokenHttp = (spec: OAuthSpec, provider: ProviderId, fetchImpl?: typeof fetch) => …
// :146
export async function exchangeCode(spec: OAuthSpec, client: Client, code: string,
  verifier: string | null, http: ConnectorHttp): Promise<OAuthTokens>
// :164
export async function refreshTokens(spec: OAuthSpec, client: Client, refreshToken: string,
  http: ConnectorHttp): Promise<OAuthTokens>
// :182
export async function ensureFreshTokens(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch; now?: () => Date; force?: boolean },
): Promise<Record<string, unknown>>
```

Le cookie de l'aller-retour : `src/server/connectors/oauth-cookie.ts:11-29`, `:48`, `:54`.

```ts
export const OAUTH_COOKIE = 'leon_oauth';
export const OAUTH_COOKIE_PATH = '/api/v1/connexions/oauth';
export const OAUTH_COOKIE_MAX_AGE = 600; // secondes

export type OAuthPending = {
  provider: ProviderId; userId: string; tenantId: string; state: string;
  verifier: string | null; since: '7' | '30' | '90' | '365';
  preFields: Record<string, unknown>; reconnectId: string | null; createdAt: number;
  pipedreamUser?: string; returnTo?: OAuthReturnPath;
};
export function sealPending(pending: OAuthPending): string            // HMAC-SHA256 avec BETTER_AUTH_SECRET, pas chiffré
export function openPending(cookie: string, now: number): OAuthPending | null
```

Les routes : `src/server/connectors/oauth-routes.ts:560-575`, montées par `src/server/api/app.ts:48`.

```ts
export function createOAuthRoutes(deps: OAuthRoutesDeps): Hono {
  // …
  routes.post('/:provider/debut', sameOrigin, smallForm, (c) => startHandler(c, deps));
  // Avant `/:app/retour`, qui la prendrait pour une appli OAuth.
  routes.get('/pipedream/retour', (c) => pipedreamReturnHandler(c, deps));
  routes.get('/:app/retour', (c) => returnHandler(c, deps));
  return routes;
}
// app.ts:48
app.route('/v1/connexions/oauth', createOAuthRoutes({ getConnector }));
```

Les droits demandés aujourd'hui, lus dans chaque `<outil>/oauth.ts` (`scopes:`) et dans `jira/connector.ts:147-152`, `confluence/connector.ts:78-88` :

| Appli | Connecteur | `scopes` envoyés dans l'adresse | PKCE | Secret |
|---|---|---|---|---|
| `GITHUB` | github | `[]` (les droits sont ceux de la GitHub App) | oui | corps |
| `NOTION` | notion | `[]` (capacités cochées dans la console) | non | Basic, JSON |
| `LINEAR` | linear | `read`, `write` (séparés par `,`) | oui | corps |
| `GITLAB` | gitlab | `api` | oui | corps |
| `ATLASSIAN` | jira | `read:jira-work`, `read:jira-user`, `write:jira-work`, `offline_access` | non | corps, JSON |
| `ATLASSIAN` | confluence | `read:page:confluence`, `read:comment:confluence`, `read:space:confluence`, `read:user:confluence`, `read:confluence-user`, `write:page:confluence`, `write:comment:confluence`, `offline_access` | non | corps, JSON |
| `ASANA` | asana | `tasks:read`, `projects:read`, `stories:read`, `users:read`, `tasks:write`, `stories:write` | oui | corps |
| `CLICKUP` | clickup | `[]` (pas de droits chez ClickUp) | non | corps, JSON |
| `MONDAY` | monday | `boards:read`, `updates:read`, `me:read`, `boards:write`, `updates:write` | oui | corps, JSON |
| `AIRTABLE` | airtable | `data.records:read`, `schema.bases:read`, `data.recordComments:read`, `data.records:write`, `data.recordComments:write` | oui | Basic |
| `HUBSPOT` | hubspot | `oauth`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.owners.read`, `sales-email-read`, `crm.objects.contacts.write`, `crm.objects.companies.write`, `crm.objects.deals.write` | non | corps |
| `HELPSCOUT` | helpscout | `[]` | non | corps |
| `ATTIO` | attio | `[]` (fixés dans la console : `note:read-write`, `comment:read-write`… d'après `docs/guides/applis-oauth.md:155`) | oui | corps |
| `BASECAMP` | basecamp | `[]` | non | corps, adresse |
| `MIRO` | miro | `[]` (déclarés dans l'appli : `boards:read`, `boards:write`, guide `:180`) | non | corps, adresse |
| `PRODUCTBOARD` | productboard | `notes:read`, `notes:write` | oui | corps, adresse |
| `OUTLOOK` | outlook | `offline_access`, `User.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite` (jamais `Mail.Send`) | oui | corps |

Gmail, Drive et Slack n'ont pas d'`OAuthSpec` : leur appli est celle de Pipedream. Les en-têtes de `gmail/connector.ts:8-9` et l'annexe 8 disent : Gmail validée pour `gmail.modify`, Drive pour le droit `drive` complet.

### 2.6 Pipedream

`src/server/connectors/pipedream.ts`

```ts
// :24
export const PIPEDREAM_SECRET_FIELDS = ['accountId'] as const;
// :26-31
export const PipedreamConfigSchema = z.object({
  authMode: z.literal('pipedream'),
  externalUserId: z.string().min(1).max(100),
  accountId: z.string().regex(/^apn_[A-Za-z0-9]+$/),
});
export type PipedreamConfig = z.infer<typeof PipedreamConfigSchema>;
// :33-38
export type PipedreamEnv = { projectId: string; clientId: string; clientSecret: string; environment: 'development' | 'production' };
// :43  PIPEDREAM_PROJECT_ID, PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, PIPEDREAM_ENVIRONMENT
export function pipedreamEnv(): PipedreamEnv | null
// :126
export async function createConnectLink(env: PipedreamEnv,
  input: { externalUserId: string; app: string; successUri: string; errorUri: string },
  fetchImpl: Fetch = fetch): Promise<string>
// :166
export async function findAccount(env: PipedreamEnv, externalUserId: string, app: string,
  fetchImpl: Fetch = fetch): Promise<PipedreamAccount | null>
// :186
export async function deleteExternalUser(env: PipedreamEnv, externalUserId: string, fetchImpl: Fetch = fetch): Promise<void>
// :201
export async function forgetPipedreamUser(externalUserId: unknown, fetchImpl: Fetch = fetch): Promise<void>
// :217
export function proxyFetch(env: PipedreamEnv, config: PipedreamConfig, baseFetch: Fetch): Fetch
// :241  LE point d'entrée pour obtenir le client HTTP d'une connexion, directe ou par proxy
export function connectorHttp(
  provider: ProviderId,
  connector: AnyConnector,
  config: Record<string, unknown>,
  deps: { fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> } = {},
): ConnectorHttp
```

Ce que le proxy change :

- La requête du connecteur garde l'adresse de l'outil. Le client HTTP la contrôle d'abord (hôtes du connecteur). Puis `proxyFetch` l'envoie à `https://api.pipedream.com/v1/connect/<projet>/proxy/<adresse en base64url>?external_user_id=…&account_id=…` (`:219-224`).
- L'en-tête `authorization` du connecteur est retiré. Pipedream met l'accès du compte (`:226-229`).
- Les jetons de l'outil ne sont jamais chez Leon. Leon garde `externalUserId` (un par connexion, `leon-<uuid>`) et `accountId` (chiffré).
- Le jeton serveur de Pipedream (`client_credentials`, 1 h) est gardé en mémoire du processus (`cachedToken`, `:71`). Sur un 401, un seul nouvel essai avec un jeton neuf (`:232-235`).
- Limites notées en tête de fichier (`:11`) : 30 s au plus par requête, en-têtes restreints.

Son coût, écrit dans le code :

- « Chaque requête au proxy coûte 1 crédit (vérifié : un lot Gmail de 100 mails = 1 crédit) » (`:16`).
- Mode développement par défaut : gratuit, 10 comptes de test. `PIPEDREAM_ENVIRONMENT=production` demande l'offre payante (`:40-42`).
- Conséquence dans la relève : une connexion Pipedream repasse à 8 h, 11 h, 14 h et 17 h (Paris), jamais la nuit, et une erreur n'est pas réessayée toutes les heures (`sync.ts:106`, `:211-212` ; `connections.ts:490-496`).
- L'étude citée (`docs/etudes/pipedream-2026-10`) n'est pas dans le dépôt : le prix du crédit n'est écrit nulle part dans ce que j'ai lu.

### 2.7 Normalisation et ingestion

`src/server/connectors/normalize.ts:11-30`, `:369`

```ts
export const CONNECTOR_TURN_MAX = 8_000;
const TURN_TEXT_CAP = 100_000;
const TITLE_MAX = 300;
const ID_MAX = 200;

export type NormalizedTurn = {
  externalId: string;
  role: 'document' | 'participant';
  authorName: string | null;
  authorEmail: string | null;
  authorSide: AuthorSide | null;
  internalNote: boolean;
  text: string;
  ts: Date;
};
export type NormalizedItem = Omit<ConnectorItem, 'turns'> & { turns: NormalizedTurn[] };

// null si l'élément est refusé (identifiant trop long, date illisible) ou si aucun tour ne reste.
export function normalizeItem(item: ConnectorItem, provider: ProviderId): NormalizedItem | null
```

Aides exportées pour les connecteurs : `splitText(text, max)` (`:54`), `htmlToText(html)` (`:214`), `mergeSpeakerTurns(turns)` (`:282`).

`src/server/connectors/ingest-items.ts:17-22`, `:67-71`, `:144-148`

```ts
export type ConnectionRef = {
  id: string;
  provider: ProviderId;
  createdBy: string;
  privateRaw?: boolean; // texte brut privé au créateur (voir Connector.privateRaw)
};

export async function ingestConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
): Promise<{ sources: number; turns: number; runs: string[] }>

export async function removeConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  externalIds: string[],
): Promise<number>
```

Partagé avec la capture : `src/server/ingest/ingest-turns.ts`.

```ts
// :49
export type TurnRow = typeof turns.$inferInsert;
// :59
export async function insertNewTurns(tx: Tx, rows: TurnRow[]): Promise<{ ids: string[]; lastTs: Date | null }>
// :107
export async function updateSource(tx: Tx, sourceId: string, title: string | undefined, lastTs: Date | null)
// :137
export async function createIngestRun(tx: Tx, ctx: TenantContext, sourceId: string,
  turnIds: string[], acl: string[]): Promise<string>
// :152
export async function enqueueIndexing(ctx: TenantContext, ingestRunId: string): Promise<void>
```

### 2.8 Indexation, passages, vecteurs

`src/server/pipeline/queue.ts:8-26`, `:39`, `:54`, `:81`, `:109`, `:118`

```ts
export const PIPELINE_QUEUES = {
  index: 'pipeline-index',
  reindex: 'pipeline-reindex',
  requeue: 'pipeline-requeue',
} as const;
export type PipelineStep = keyof typeof PIPELINE_QUEUES;

export const PipelineJobSchema = z.object({
  ingestRunId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true };

export async function ensureQueue(boss: PgBoss, name: string, options: Omit<Queue, 'name'>): Promise<void>
export function wakeQueueAfter(boss: PgBoss, name: string, handler: WorkHandler<unknown>): WorkHandler<unknown>
export const INDEX_PRIORITY = { ingestion: 10, reprise: 0 } as const;
export function getBoss(): Promise<PgBoss>
export async function enqueuePipelineStep(step: PipelineStep, job: PipelineJob,
  options: { priority?: number } = {}): Promise<void>
```

`src/server/pipeline/runs.ts:10` : `export async function failRun(ctx: TenantContext, runId: string, error: unknown): Promise<void>`.

`src/server/search/index-run.ts:130-133` et `src/server/search/worker.ts:143-146`

```ts
export async function indexIngestRun(
  job: PipelineJob,
  deps: { embedder: Embedder | null },
): Promise<'indexe' | 'absent'>

export function startSearchWorker(
  deps: { embedder: Embedder | null },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void>
```

Tables : `sources`, `turns`, `ingest_runs` (`src/server/db/schema/memory.ts:25-81`) ; `passages`, `passage_vectors` (`src/server/db/schema/search.ts:25-64`).

- `sources` : clé unique `(tenant_id, owner_user_id, kind, external_id)` (`0005-durcissement.sql:7`). Colonnes utiles : `kind`, `external_id`, `owner_user_id`, `title`, `acl`, `connection_id`, `metadata` (jsonb : `nature`, `url`, `origin`, `updatedAt`), `last_turn_at`.
- `turns` : unique `(source_id, external_id)`. Colonnes : `role`, `text`, `ts`, `capture_mode`, `author_name`, `author_email`, `author_side`, `internal_note`, `acl`.
- `ingest_runs` : `source_id`, `turn_ids uuid[]`, `status` (`queued`, `running`, `done`, `failed`), `step` (`index`, `done`), `error`, `acl`.
- `passages` : `source_id`, `turn_id`, `ord`, `text`, `char_start`, `char_end`, `ts`, `author_name`, `author_email`, `acl`, plus `tsv` générée (`0011-passages.sql:21`). Unique `(turn_id, ord)`.
- `passage_vectors` : clé `(passage_id, model)`, `embedding halfvec(1024)`, `acl`.

La même politique sur les cinq tables (`0003-memoire.sql:191-203`, `0011-passages.sql:50-57`) :

```sql
create policy tenant_acl on sources to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
```

En lecture seule s'y ajoute `equipe_lit` (managers, `0057-manager-voit-tout.sql:65-72`), actif seulement si le contexte porte `equipe: true`.

Découpe : `src/server/search/chunk.ts:11-17`, `:66`.

```ts
const PASSAGE_TARGET = 1200;
const PASSAGE_MAX = 1600;
const PASSAGE_MIN = 1000;
const PASSAGE_OVERLAP = 150;
export type Chunk = { ord: number; text: string; start: number; end: number };
export function chunkText(text: string): Chunk[]
```

Vecteurs : `src/server/embeddings/embedder.ts:7-27`, `registry.ts:11`.

```ts
export const EMBEDDING_DIMS = 1024;
export const EMBEDDER_IDS = ['factice', 'voyage', 'mistral', 'bge-m3', 'openrouter'] as const;
export type EmbedKind = 'document' | 'requete';
export interface Embedder {
  readonly model: string;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}
export class EmbedderError extends Error {}
export class EmbedderRefusal extends EmbedderError {}

export function getEmbedder(env: Env): Embedder | null   // LEON_EMBEDDINGS absent : null
```

Seuls `factice` et `openrouter` sont livrés (`registry.ts:14-22`). Les autres lèvent au démarrage.

`src/server/search/embed-missing.ts` : `EMBED_BATCH = 64` (`:25`), `REQUEUE_BATCH = 200` (`:28`), `EMBED_TIMEOUT_MS = 30_000` (`:32`), `lockSources(tx, sourceIds)` (`:96`), `embedPassages(ctx, embedder, rows)` (`:225`), `embedMissingBatch` (`:306`), `requeueStaleRuns` (`:380`).

### 2.9 Contexte et droits

`src/server/auth/tenant-context.ts:7-14`, `:71-75` et `src/server/db/with-tenant.ts:18`

```ts
export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
  readonly equipe?: boolean;
};

export async function resolveTenantContext(
  userId: string,
  tenantId: string | null,
  { includeFormer = false }: ResolveOptions = {},
): Promise<TenantContext | null>

export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T>
```

`principals` = soi, l'organisation, puis ses groupes (`principalsFor`, `tenant-context.ts:21-33`). `withTenant` ouvre une transaction et pose `app.tenant`, `app.user`, `app.principals`.

## 3. Comment ça s'exécute

### 3.1 Démarrage

`src/instrumentation-node.ts` démarre tout dans le processus de l'application, dans cet ordre : worker de la recherche (`:19-20`), point du matin, résumés, fils, liaisons, état des fils, puis la relève des connecteurs (`:46-51`). La relève ne démarre que si `LEON_CONNECTORS_KEY` existe. Rien ne démarre pendant `next build` (`:7`).

### 3.2 Brancher une connexion

Par clé (`src/app/(app)/connections/actions.ts:106-140`) :

1. `connectAction` : `requireUserContext()`, validation zod, `connectorsKey()` exigée.
2. `checkConnection` (`:65-104`) : `connector.configSchema.safeParse`, puis `connector.verify` avec un vrai client HTTP.
3. `createConnection` : secret chiffré, `nextSyncAt = now()`, `acl = [tenantId]`. Le tic suivant prend la connexion.

Par bouton OAuth (`oauth-routes.ts`) :

1. `POST /api/v1/connexions/oauth/:provider/debut` : formulaire posté depuis Leon (garde `csrf`, corps ≤ 64 Ko). Session exigée. Cookie signé `leon_oauth` (10 minutes) avec `state`, vérificateur PKCE, `since`, champs avant le clic. Redirection 303 vers l'éditeur (`startHandler`, `:176-212`).
2. `GET /api/v1/connexions/oauth/:app/retour` : cookie relu puis effacé. Même session, même `state` (temps constant). `exchangeCode`, `spec.toConfig`, `configSchema.safeParse`, `connector.verify`, puis `createConnection` ou, pour « Reconnecter », `saveOAuthTokens(…, { reconnect: true })` après contrôle du même compte (`connect`, `:361-401`).
3. Retour sur `/connections?branche=<outil>` ou `?erreur=<code>&outil=<outil>`. Les codes : `annule`, `expire`, `refuse`, `indisponible`, `champs`, `admin`, `admin_accorde`, `autre_compte`, `vide` (`:70-79`).

Par Pipedream : même début, mais `pipedreamStart` crée un utilisateur Pipedream `leon-<uuid>` et un lien Connect (`:216-274`). Retour sur `/pipedream/retour`, `findAccount`, `verify` par le proxy, connexion créée (`connectPipedream`, `:405-452`).

### 3.3 Le cycle d'une relève

1. **Tic** (`worker.ts:24`, file `connector-tick`, chaque minute) : `enqueueDueSyncs()` (`sync.ts:259-275`).
2. **Connexions dues** : `connector_syncs_due()` rend au plus 100 triplets `(connection_id, tenant_id, user_id)` : statut `active` ou `error`, `next_sync_at <= now()`, pas de réservation de moins de 30 minutes, créateur encore membre.
3. **Mise en file** : `boss.send('connector-sync', job, { singletonKey: connectionId })`. File en politique `short` : un seul job en attente par connexion.
4. **Job** (`worker.ts:37-46`, 4 à la fois) : `ConnectorSyncJobSchema.parse`, puis `runConnectorSync(job, deps)` (`sync.ts:219-253`).
5. **Droits** : `resolveTenantContext(job.userId, job.tenantId)`. Créateur parti : `'skipped'`. Toute la suite passe par `withTenant(ctx, …)`, donc sous la RLS du créateur.
6. **Réservation** : `claimConnection` pose `sync_lock_at` et `last_sync_started_at` dans le même `update` qui vérifie les conditions. Rien de dû ou déjà réservé : `null`, `'skipped'`. Puis déchiffre. Secret illisible : `UnreadableSecretError`, la connexion finit en erreur `'Unreadable key: replace it.'`.
7. **Jetons** : `withFreshTokens` → `ensureFreshTokens`. Si la connexion est OAuth et que `expiresAt` tombe dans moins de 5 minutes : `refreshTokens`, puis `saveOAuthTokens(…, { reconnect: false, renewedFrom })` **avant** de continuer. `expiresAt` nul : jamais renouvelé d'avance.
8. **Préparation** : `prepare` valide `config` par `connector.configSchema`. Échec : erreur `'Unreadable configuration: reconnect the tool'`.
9. **Lecture** (`readPages`, `sync.ts:79-117`) : `connectorHttp(…)`, état `{ cursor, since }` (plus `depotsEquipe` pour GitHub), puis pour chaque page de `connector.sync` :
   - `normalizeItem` sur chaque élément (un refusé est journalisé `connector.item_refused` et sauté) ;
   - `ingestConnectorItems` si la page a des éléments ;
   - `removeConnectorItems` si `page.removed` ;
   - `saveSyncProgress` : curseur, compteur, réservation rafraîchie. `false` : une autre relève a repris la main, on s'arrête (`'lost'`) ;
   - arrêt à 200 éléments lus (`'soon'`).
10. **401 en cours de passage** (`readWithRenewal`, `:138-161`) : si la connexion est OAuth avec un `refreshToken`, un renouvellement forcé, puis le passage repart une fois du curseur d'origine. Un 403 ne déclenche rien.
11. **Fin** : `rememberAccountKey` (une fois par connexion à bouton), puis `finishSync` qui libère la réservation et pose l'échéance.

| Issue | `status` | `next_sync_at` | `last_error` |
|---|---|---|---|
| Fini, il reste des éléments | `active` | dans 1 minute | nul |
| Fini | `active` | dans 15 minutes | nul |
| Fini, connexion Pipedream | `active` | prochain créneau 8/11/14/17 h (Paris) | nul |
| Erreur ordinaire | `error` | dans 1 heure (Pipedream : prochain créneau) | message court écrit par Leon |
| 401, 403 ou renouvellement refusé | `error` | nul : plus de relance | `Reconnect X: …` ou `X rejected the key: …` |
| En pause | reste `paused` | reste nul | (pause prioritaire, `unlessPaused`) |

« Synchroniser maintenant », une clé remplacée ou un « Reconnecter » pendant un passage posent une échéance que `finishSync` garde (`requestedDuringSync`, `connections.ts:518-520`).

Reprises pg-boss : `retryLimit: 2` sur les deux files. En pratique `runConnectorSync` attrape presque tout et écrit l'erreur dans la ligne ; seule une panne de base remonte au worker, qui relance un résumé sans texte (`rethrowSummary`, `worker.ts:14-17`).

### 3.4 D'un élément aux tables

Tout se passe sous `withTenant(ctx)` du créateur de la connexion.

1. **Normalisation** (`normalize.ts:321-393`) : caractère nul retiré, texte masqué (`maskSecrets`), coupé à 100 000 caractères, découpé en morceaux de 8 000 au plus (`stem:1`, `stem:2`…), puis `prepareTurnText`. Chaque tour reçoit l'identifiant `` `${base}#${12 premiers hexa du SHA-256 du texte}` ``. Un texte modifié donne donc un nouveau tour ; l'ancien reste.
2. **ACL** (`ingest-items.ts:74-80`) : `connections.partage` s'il est posé, sinon `[créateur]` si `privateRaw`, sinon `[tenantId]`. La ligne `connections` est lue `for share`.
3. **Source** (`upsertItemSource`, `:28-62`) : `insert … on conflict (tenant_id, owner_user_id, kind, external_id) do update`. `kind` = l'outil, `owner_user_id` = le créateur, `metadata = { nature, url, origin, updatedAt }`. Une source déjà là **garde son ACL** ; seule une source « reprise » d'une connexion supprimée prend la nouvelle.
4. **Tours** (`insertNewTurns`) : `on conflict (source_id, external_id) do nothing`. `capture_mode = 'connector'`, `acl` = celle de la source.
5. **Run** (`createIngestRun`) : une ligne `ingest_runs` par élément qui a au moins un tour nouveau, avec `turn_ids` = les seuls tours nouveaux.
6. **Après le commit** : `enqueueIndexing(ctx, runId)` → file `pipeline-index`, job `{ ingestRunId, tenantId, userId }`, priorité 10. Un échec de mise en file est journalisé ; le tic `pipeline-requeue` reprend un run resté `queued` plus de 5 minutes.
7. **Indexation** (`indexIngestRun`, 4 à la fois) : `resolveTenantContext(job.userId, job.tenantId, { includeFormer: true })`, `claimRun` (`running`), puis par tranches de 100 tours : `lockSources`, `chunkText`, `insert passages … on conflict (turn_id, ord) do nothing` avec l'ACL du tour ; puis `embedPassages` si un fournisseur est réglé (lots de 64, délai 30 s, l'ACL du vecteur est relue sur le passage). Run `done`.
8. **GitHub seulement** : à la fin de chaque relève, `select aligner_sources_github()` remet l'ACL des sources GitHub selon les dépôts d'équipe (`sync.ts:114-115`, `0048`).

La recherche plein texte marche dès que les passages sont écrits. Les vecteurs peuvent arriver plus tard (tic `pipeline-reindex`, 500 par lot, 45 s par tic).

### 3.5 Le signal émis après indexation

Il n'y a pas d'événement générique. Il y a deux appels à la fin de `indexIngestRun` : `src/server/search/index-run.ts:147-155`.

```ts
  await withTenant(ctx, (tx) =>
    tx
      .update(ingestRuns)
      .set({ status: 'done', step: 'done', error: null, updatedAt: new Date() })
      .where(eq(ingestRuns.id, job.ingestRunId)),
  );
  await signalBriefings(ctx, scope.sourceId);
  await signalLiaison(ctx, scope.sourceId);
  return 'indexe';
```

- `signalBriefings` → `signalSourceActivity(ctx, sourceId)` (`src/server/briefing/queue.ts:216-226`). Il ne fait quelque chose que pour une session de code ou une source GitHub (`projectOfSource`, `:184-213`). Pour un mail, un ticket Zendesk ou une réunion : rien.
- `signalLiaison` → `enqueueLiaison` sur la file `relier-source`, pour toute source d'outil hors session de code (`LINKED_KINDS`, `src/server/sessions/threads-queue.ts:75-77`).
- Les deux sont dans un `try/catch` : un signal raté ne fait jamais échouer l'indexation, et rien ne le reprend.
- À ce point, on connaît `ctx` (le créateur de la connexion), `scope.sourceId` et `scope.turnIds` (les tours nouveaux du run).

### 3.6 Le partage d'une connexion à un groupe

- Interface : `shareConnectionAction(id, partage)` (`actions.ts:207-211`), `partage` validé par `PartageSchema`.
- `src/lib/documents.ts:8-12` :

```ts
export const PartageSchema = z.union([z.enum(['equipe', 'moi']), z.uuid()]);
export type Partage = z.infer<typeof PartageSchema>;
export const aclOf = (ctx: { tenantId: string; userId: string }, partage: Partage): string[] =>
  partage === 'equipe' ? [ctx.tenantId] : partage === 'moi' ? [ctx.userId] : [ctx.userId, partage];
```

- `shareConnection` (`connections.ts:317-330`) appelle la fonction SQL, sauf pour GitHub (toujours `false`).
- `src/server/db/migrations/0056-partage-connexions.sql:9-39` :

```sql
create function partager_connexion(p_connexion uuid, p_acl uuid[]) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
-- … formes admises : [app_user()], [app_tenant()], ou [app_user(), groupes de l'organisation…]
-- … la connexion doit être celle de app_user() (for update)
  update sources set acl = p_acl where id = any(touchees);
  perform recopier_acl_sources(touchees);
  update connections set partage = p_acl where id = p_connexion;
  return true;
```

- Tout ce que la connexion a déjà relevé suit : `recopier_acl_sources` (`0055-groupes.sql:92-105`) recopie l'ACL sur `turns`, `ingest_runs`, `passages`, `passage_vectors`, `read_log`.
- Un groupe est une ligne `groupes` (`0055:23-33`). Son identifiant est un principal : `principalsFor` l'ajoute à ceux de ses membres. Aucune règle RLS ne change.
- Supprimer un groupe le retire de `connections.partage` et des ACL (`supprimer_groupe`, `0056:45-68`).
- `listConnections` rend `partage` sous la forme `null | 'equipe' | 'moi' | <id du groupe>` (`connections.ts:183-186`). La fonction SQL accepte plusieurs groupes ; `aclOf` n'en produit qu'un.

Attention : `partage` règle qui **lit** ce que la connexion relève. Il ne donne à personne d'autre le droit de **se servir** de la connexion (jetons). Voir 6.

### 3.7 Lire en direct aujourd'hui

Un seul exemple : `src/server/discussion/github-live.ts:14-22`.

```ts
export type LiveDeps = { fetchImpl?: typeof fetch };
export type MyConnection = Awaited<ReturnType<typeof loadMyConnections>>[number];

export const myGithubConnections = (ctx: TenantContext) => loadMyConnections(ctx, 'github');

export async function openGithub(ctx: TenantContext, connection: MyConnection, deps: LiveDeps) {
  const config = await ensureFreshTokens(ctx, connection, githubConnector, deps);
  return liveGithub(config, connectorHttp('github', githubConnector, config, deps));
}
```

Et `src/server/connectors/github/connector.ts:89-93` :

```ts
export const liveGithub = (config: Record<string, unknown>, http: ConnectorHttp) => {
  const parsed = ConfigSchema.parse(config);
  const github = githubClient(bearerOf(parsed), http);
  return { github, repos: () => reposToRead(github, parsed) };
};
```

### 3.8 Écrire aujourd'hui

Un seul exemple : `src/server/connectors/github/client.ts:175-176` et `:427-463`.

```ts
const write = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  ({ url: `${API}${path}`, method, headers, body, once: true }) satisfies HttpRequest;
// …
comment: (repo: string, number: number, body: string) =>
  http.json(write('POST', `/repos/${repo}/issues/${number}/comments`, { body }), UrlSchema),
openIssue: (repo: string, body: IssueWrite) =>
  http.json(write('POST', `/repos/${repo}/issues`, body), UrlSchema),
```

Les autres clients font des POST de lecture (GraphQL de Linear, recherche de HubSpot…), sans `once`.

## 4. Conventions

**Langue.** Commentaires en français, phrases courtes. Identifiants TypeScript en anglais (`runConnectorSync`, `claimConnection`). Exceptions voulues : les mots du métier restent en français dans le SQL (`partager_connexion`, `retirer_sources_connexion`, `depots_equipe`, `groupes`, colonne `partage`), dans quelques champs (`depotsEquipe`, `depotsConfirmes`), dans les adresses (`/api/v1/connexions/oauth/:provider/debut`, `/retour`) et dans les codes de retour (`'annule'`, `'expire'`). Les messages montrés à l'utilisateur par la relève (`last_error`) sont en anglais, « la langue de base du produit » (`actions.ts:97-100`). Les erreurs internes sont parfois en français (`'Secret illisible'`, `'source non créée'`).

**Fichiers.** Minuscules, tirets, ASCII. Un dossier par connecteur. Migrations `NNNN-sujet.sql`, avec parfois `NNNN-sujet.db.test.ts`.

**Tests.** `*.test.ts` : unitaires, `fetch` simulé (`fetchImpl`), réponses d'exemple dans `fixtures/`. `*.db.test.ts` : sur un vrai Postgres. Trois projets Vitest : `unit`, `db`, `db-seul` (`vitest.config.ts`). Aucun test n'appelle un vrai service (`docs/specs/2026-10-15-connecteurs.md:134`). Les dépendances s'injectent par un objet `deps` (`fetchImpl`, `sleep`, `now`, `getConnector`).

**En-tête de connecteur.** Chaque `connector.ts` et `oauth.ts` commence par : les pages de doc lues et la date, les écarts au plan, et un paragraphe « Non vérifié ». Ce qui n'a pas été vérifié est écrit, pas deviné.

**Validation.** Zod partout : `configSchema`, schémas de job (`ConnectorSyncJobSchema.parse`), chaque réponse HTTP (le schéma est un argument obligatoire de `http.json`), chaque curseur (un curseur illisible repart de `since`, sans erreur). Les actions serveur valident leurs entrées et passent par `requireUserContext`.

**Erreurs.** Des classes à message fixe : `ConnectorAuthError`, `ConnectorHttpError`, `OAuthRefusedError`, `NothingToReadError`, `ResponseTooBigError`, `UnreadableSecretError`, `SecretKeyMissingError`. Jamais le corps d'une réponse, une adresse complète, un en-tête ou une clé dans un message. Les fonctions d'écriture en base rendent `boolean` (« rien n'a changé ») plutôt que de lever. Une action serveur ne laisse remonter aucune exception.

**Journalisation.** `logError(event, error, ids)` (`src/server/log.ts:37`) : `console.error` plus Sentry. `ids` ne porte que des identifiants. Noms d'événements en `module.fait` : `connector.tick_failed`, `connector.job_failed`, `connector.sync_failed`, `connector.item_refused`, `connector.account_key_failed`, `connector.oauth_failed`, `connector.verify_failed`, `connector.pipedream_cleanup_failed`, `search.index_failed`, `search.signal_failed`, `ingest.enqueue`. Ce qui remonte à pg-boss est `safeErrorSummary(error)`, jamais l'erreur d'origine.

**Tâches de fond.** Un job ne porte que des identifiants. Le worker résout le contexte de la personne, puis tout passe par `withTenant`. Les workers et le client pg-boss sont des singletons sur `globalThis` (rechargement à chaud de Next). Chaque file est créée par `ensureQueue` et chaque lecteur est enveloppé par `wakeQueueAfter`.

**Raccourcis assumés.** Marqués `// shortcut:` dans le code, avec ce qu'il faudra faire et quand.

**Variables d'environnement.** `LEON_CONNECTORS_KEY`, `LEON_EMBEDDINGS`, `LEON_EMBEDDINGS_MODEL`, `OPENROUTER_API_KEY`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL` passent par `src/server/env.ts`. Les `LEON_OAUTH_*` et `PIPEDREAM_*` sont lues directement dans `process.env`, à chaque appel.

## 5. Points d'extension pour le système d'agents

Tout ce qui suit est à ajouter. Je cite l'endroit exact où brancher et ce que le code impose.

### 5.1 Un déclencheur sur élément indexé (le « standard »)

- **Où** : `src/server/search/index-run.ts:153-154`, à côté de `signalBriefings` et `signalLiaison`. Même forme : une fonction `signal…(ctx, sourceId)` dans un `try/catch` qui journalise et n'échoue jamais.
- **Ce qu'on a en main** : `ctx` (le propriétaire de la source, donc le créateur de la connexion), `scope.sourceId`, `scope.turnIds` (les tours nouveaux), `job.ingestRunId`. La nature est dans `sources.metadata.nature`, l'outil dans `sources.kind`, le côté de l'auteur dans `turns.author_side`.
- **À respecter** : mettre un job en file (identifiants seulement), ne rien calculer sur place. Le worker d'indexation tourne à 4 en parallèle et une relève peut produire 200 runs d'un coup.
- **Limites** : un signal perdu n'est pas repris. Pour un tri fiable, il faut soit une colonne d'état sur `ingest_runs` (ou une table à part) relue par un tic, soit accepter la perte. Le même élément relevé par deux connexions de deux personnes donne deux sources, donc deux signaux.
- **Élément modifié** : un texte modifié donne un nouveau tour et un nouveau run. Le déclencheur voit donc aussi les modifications, pas seulement les créations.

### 5.2 Recevoir un webhook d'un outil

Rien n'existe : ni route, ni secret de webhook, ni table. La spec l'a écarté exprès (`docs/specs/2026-10-15-connecteurs.md:14`), et le guide demande de laisser « Webhook › Active » décoché pour la GitHub App (`docs/guides/applis-oauth.md:30`).

Le chemin le plus court avec ce qui existe : **un webhook ne porte pas de contenu, il avance l'échéance**. La relève par curseur fait le reste, sans code de correspondance par événement.

1. **Route publique** dans Hono : à monter dans `src/server/api/app.ts`, comme `app.route('/oauth', oauthRoutes)` (« publique par nature, ni jeton ni session », `:46-47`). Modèle de garde : `bodyLimit` comme dans `oauth-routes.ts:566-569`. La signature se vérifie sur le corps brut, avant tout `parse`.
2. **Retrouver la connexion** : le webhook n'a pas d'utilisateur, donc pas de `TenantContext`. Il faut une fonction SQL `security definer` qui ne rend que des identifiants, sur le modèle de `connector_syncs_due()`. Elle doit rendre `(connection_id, tenant_id, user_id)` à partir d'un identifiant de webhook opaque gardé sur la connexion.
3. **Secret de signature** : par connexion, dans le bloc chiffré. `sealSecrets` chiffre n'importe quel champ nommé dans `secretFields` ; il suffit d'un champ de plus. Pour une appli OAuth à secret unique (GitHub App, Slack), c'est une variable d'environnement de plus, lue comme `oauthClient`.
4. **Réveiller la relève** : poser `next_sync_at = now()` (ce que fait `requestSyncNow`, `connections.ts:297-312`, mais sous `withTenant`), puis laisser le tic agir (une minute au pire) ou envoyer tout de suite `boss.send(CONNECTOR_QUEUES.sync, job, { singletonKey: connectionId })`. `claimConnection` refuse une connexion dont `next_sync_at` est dans le futur : l'échéance doit être posée d'abord.
5. **Contrat du connecteur** : ajouter un champ facultatif à `Connector` (`types.ts:100-117`), par exemple une fonction qui vérifie la signature et dit quelle connexion est visée. À écrire outil par outil.

Ce que le code impose ou ne couvre pas :

- La file `connector-sync` ne garde qu'un job en attente par connexion. Dix webhooks en rafale donnent un passage, pas dix : c'est le bon comportement.
- Une connexion Pipedream (Gmail, Drive, Slack) coûte un crédit par requête. La réveiller à chaque événement défait le choix des quatre créneaux.
- L'inscription du webhook chez l'outil (au branchement) et sa suppression (à `deleteConnection`) sont à écrire. `deleteConnection` ne fait aujourd'hui qu'un `delete` ; le nettoyage Pipedream est fait par l'action (`actions.ts:214-222`), pas par la fonction.
- Il faut une adresse publique (`BETTER_AUTH_URL`) : en local, pas de webhook.
- Délai réel après un webhook : relève (secondes) + indexation (file `pipeline-index`) + le déclencheur de 5.1.

### 5.3 Lire un élément en direct

Le patron existe pour GitHub (3.7). Pour un autre outil, les trois mêmes appels suffisent :

```ts
const [connection] = await loadMyConnections(ctx, provider);          // les siennes, hors pause, secrets compris
const config = await ensureFreshTokens(ctx, connection, connector, deps); // sans effet hors OAuth
const http = connectorHttp(provider, connector, config, deps);            // direct ou proxy Pipedream
```

À généraliser :

- `openGithub` est câblé sur `githubConnector`. Une fonction générique `(ctx, provider) → { connector, config, http }` manque.
- `Connector` n'a pas de méthode « lire un élément par son identifiant ». `sync` ne sait que parcourir. Il faut une méthode facultative par outil, qui rende un `ConnectorItem`. Le `externalId` des sources est déjà stable et parlant (`issue:acme/leon#12`) ; le `map.ts` de chaque outil sait déjà convertir.
- Pour remettre l'élément lu dans la mémoire : `normalizeItem` puis `ingestConnectorItems(ctx, connectionRef, [item])`. C'est idempotent (empreinte du texte). `ConnectionRef` demande `id`, `provider`, `createdBy`, `privateRaw`.
- La configuration doit repasser par `connector.configSchema` avant usage (`prepare`, `sync.ts:56-62`). `loadMyConnections` rend la configuration brute.

Limites :

- **Seulement ses propres connexions.** `loadMyConnections` filtre par `createdByMe`. Un agent d'équipe ne peut pas lire en direct avec la connexion d'un collègue, même partagée à un groupe.
- **Course au renouvellement.** La relève et un appel en direct peuvent renouveler le même jeton en même temps. Avec un jeton de rafraîchissement à usage unique, le second est refusé et la connexion demande « Reconnecter » (`github-live.ts:10-12`). `saveOAuthTokens` verrouille la ligne entre sa lecture et son écriture, mais pas pendant l'appel à l'éditeur.
- **Pas de reprise sur 401.** `readWithRenewal` n'existe que dans la relève. En direct, un 401 remonte tel quel. Pour un outil sans `expiresAt` (Notion, ClickUp…), le jeton n'est jamais renouvelé d'avance.
- **`minIntervalMs` ne protège pas entre appels.** Chaque `connectorHttp` a son propre compteur. Dix lectures en direct en parallèle, plus la relève, peuvent dépasser le débit de l'outil.
- **Pipedream** : chaque lecture en direct est un crédit.

### 5.4 Écrire dans un outil avec la connexion d'une personne

Ce qui est prêt :

- `HttpRequest.method` accepte `POST`, `PUT`, `PATCH`, `DELETE`, et `once: true` interdit toute reprise.
- Le patron `write(…)` de `github/client.ts:175-176`.
- Les droits d'écriture sont déjà demandés pour les outils à bouton (tableau 2.5).
- `loadMyConnections` garantit que l'écriture part du compte de la personne. Il marche dans une tâche de fond : il ne lui faut qu'un `TenantContext`, que `resolveTenantContext(userId, tenantId)` fournit.
- Les hôtes autorisés (`connector.hosts(config)`) sont ceux de l'API de l'outil : une écriture y passe sans changement.

Ce qui manque :

1. **Une fonction d'écriture par outil**, dans son `client.ts`, avec `once: true` et un schéma de réponse. Aucun client autre que GitHub n'en a.
2. **Un point d'entrée générique** (le même que 5.3) pour ouvrir la connexion de la personne.
3. **Un verrou de renouvellement**, avant de multiplier les appels hors relève.
4. **Le cas `once` sans réponse.** Avec `once`, une erreur réseau lève `ConnectorHttpError(null, '<Outil> is unreachable')` : l'écriture a peut-être abouti. L'appelant doit le ranger comme « incertain », pas comme un échec à rejouer.
5. **Le retour dans la mémoire.** Ce que Leon vient d'écrire n'est relu qu'au prochain passage (15 minutes, ou le prochain créneau Pipedream). Pour le voir tout de suite : `requestSyncNow`, ou la lecture en direct de 5.3 suivie d'une ingestion.
6. **Les outils à clé collée** (22 connecteurs) : l'écriture dépend des droits de la clé que le client a collée. Rien dans `connections` ne dit si une connexion peut écrire. Un champ dérivé (par exemple dans `config`, posé par `verify`) est à prévoir.
7. **Les connexions d'avant le 23/10/2026** ont été autorisées avec les anciens droits de lecture. Le jeton rend son `scope` (`OAuthTokens.scope`), mais le socle ne le garde pas : `toTokens` le lit, `oauthConfig` ne le range pas dans `config` (`oauth-routes.ts:294-300`). Pour savoir si une connexion peut écrire, il faut le garder.
8. **Envoyer un mail** : Outlook ne demande pas `Mail.Send` (`outlook/oauth.ts:45`). Un brouillon est possible avec `Mail.ReadWrite`, un envoi non. Gmail passe par Pipedream : une écriture y coûte aussi un crédit.

Garde-fou déjà en base pour les actions : la politique restrictive `own_discussion_and_connection` de la table `actions` impose une connexion branchée par l'auteur (`0037-actions.sql:31-41`). Cette table n'est pas dans mon périmètre : voir la carte des actions.

### 5.5 Une tâche de fond

Recopier `src/server/connectors/worker.ts` :

1. Noms de files dans un `queue.ts` à part, avec le schéma zod du job (identifiants seulement).
2. `ensureQueue(boss, nom, options)` pour chaque file. Politiques vues : défaut, `'short'` (un job en attente par `singletonKey`), `'stately'` (un en attente et un en cours par clé).
3. `boss.schedule(nom, cron)` pour un tic. `boss.work(nom, { batchSize: 1, localConcurrency: n }, wakeQueueAfter(boss, nom, handler))`.
4. Dans le handler : `Schema.parse(job.data)`, `resolveTenantContext`, puis `withTenant`. Erreur : `logError` puis `throw new Error(safeErrorSummary(error))`.
5. `start…Worker()` idempotent, gardé sur `globalThis`, appelé depuis `src/instrumentation-node.ts`.
6. Pour une liste « toutes organisations » (comme les connexions dues) : une fonction SQL `security definer` qui ne rend que des identifiants, puis un contexte par ligne.

### 5.6 Un écran

- Page Connexions : `src/app/(app)/connections/page.tsx`, actions serveur dans `actions.ts`, panneau d'un outil dans `src/components/verre/connexions/tool-dialog.tsx` (non lus en détail).
- Ce que l'interface sait d'un outil vient de `listCatalog()` → `CatalogItem`. Pour afficher « cet outil sait faire telle action », c'est `CatalogEntry` (`types.ts:129-143`) et le `catalog.ts` de chaque outil qu'il faut étendre, avec son jumeau anglais `en`.
- Ce que l'interface sait d'une connexion vient de `listConnections()` → `ConnectionView`. Pour afficher « cette connexion peut écrire » ou « webhook actif », c'est là.
- Les pages où un retour OAuth peut revenir sont une liste fermée : `OAUTH_RETURN_PATHS = ['/connections', '/welcome/tools']` (`src/lib/connection-form.ts:136`). Un nouvel écran qui lance un branchement doit s'y ajouter.

### 5.7 Ce qu'il faudrait généraliser

- **`Connector`** : trois capacités facultatives à côté de `verify` et `sync` : lire un élément, écrire, recevoir un webhook. Garder la « syntaxe de méthode » (`types.ts:99`), sinon `Connector<Config>` n'est plus assignable à `AnyConnector`.
- **Ouverture d'une connexion hors relève** : une seule fonction au lieu de `openGithub`.
- **Renouvellement** : un verrou par connexion partagé entre relève, lecture et écriture.
- **Signal après indexation** : un seul point d'émission, plusieurs abonnés (point du matin, liaison, standard), au lieu d'appels câblés.
- **Fraîcheur** : `NEXT_SYNC` est une table fixe (`connections.ts:498-504`). Une cadence par connexion ou par outil (boîte mail plus souvent que le wiki) demande une colonne ou un champ du connecteur.
- **Ajouter un outil** (Google Agenda, Teams…) : `PROVIDER_IDS` (`capture/turn.ts`), `CONNECTORS` (`registry.ts`), `CATALOG_ENTRIES` (`catalog.ts`), `PROVIDER_LABELS` et `PROVIDER_FAMILIES` (`src/lib/providers.ts`), et pour un bouton `OAUTH_APP_KEYS` et `PAIRS` (`oauth-env.ts`). Aucune migration : les contraintes SQL sur `provider` et `kind` ont été retirées. `Record<ProviderId, …>` fait échouer la compilation tant qu'une des tables est incomplète.

## 6. Pièges et limites écrites dans le code

**Droits**

- La RLS de `connections` laisse tout membre de l'organisation lire la ligne, colonne `secret` comprise (`acl = [tenantId]`, `grant select`). C'est le code qui réserve le secret : `listConnections` ne sélectionne pas la colonne, `loadMyConnections` filtre par `createdByMe`. Tout nouveau code qui lit `connections.secret` doit reprendre ce filtre.
- `saveOAuthTokens` et `replaceConnectionSecret` n'écrivent que pour le créateur. Un renouvellement lancé sous le contexte d'un autre membre rend `false` sans erreur, et `ensureFreshTokens` n'en regarde pas le résultat (`oauth.ts:215`) : le jeton neuf serait utilisé puis perdu.
- Une source déjà relevée garde son ACL quand la connexion la relit. Seuls `partager_connexion` et, pour GitHub, `aligner_sources_github` la changent.
- GitHub ne se partage pas : `shareConnection` rend `false` (`connections.ts:326`). Son accès suit les dépôts d'équipe.
- Deux personnes qui branchent le même espace lisent deux fois les mêmes éléments, en deux sources (`connection-form.ts:94`). Pas de dédoublonnage (spec, « hors périmètre »).
- Un créateur qui quitte l'organisation arrête sa connexion (`creatorLeft`), sans erreur.
- Supprimer une connexion laisse ses sources (`connection_id` passe à nul).

**Relève**

- 15 minutes au mieux ; Pipedream : 8 h, 11 h, 14 h, 17 h, heure de Paris. Un mail arrivé à 17 h 05 est vu le lendemain à 8 h.
- Le tic rend au plus 100 connexions dues par minute, et 4 relèves tournent à la fois dans un seul processus. Au-delà d'une centaine de connexions actives, les 15 minutes ne sont plus tenues. (Calcul de ma part, pas un chiffre du code.)
- Une réservation de plus de 30 minutes sans nouvelle page est réputée abandonnée (`claimConnection`). La file a `expireInSeconds: 1800`. Une page qui met plus de 30 minutes à ingérer perd sa réservation.
- `SYNC_ITEMS_MAX = 200` compte les éléments rendus par le connecteur, avant normalisation. Le premier passage d'un gros compte avance par tranches de 200 par minute.
- Après une erreur d'accès (401, 403, renouvellement refusé), plus aucune relance : il faut une action de la personne. Un agent qui dépend de cette connexion s'arrête sans bruit.
- Une suppression chez l'outil n'est pas propagée, sauf `SyncPage.removed` (événement d'agenda devenu privé).
- Un texte modifié crée un nouveau tour ; l'ancien reste cherchable. Un déclencheur voit donc les deux versions.
- `shortcut` : `aligner_sources_github` relit toutes les lignes GitHub de l'organisation à chaque passage (`sync.ts:110-113`), à borner au-delà de 200 000 tours.

**Jetons**

- Renouvellement non verrouillé entre relève et appels en direct (`github-live.ts:10-12`).
- L'appli retirée du serveur (variables effacées) : erreur ordinaire, réessayée chaque heure (`oauth.ts:195-201`).
- Atlassian : le jeton de rafraîchissement expire après 90 jours sans usage (guide `:79`). Outlook : le secret d'appli a une date d'expiration (guide `:206`).
- Le `scope` rendu par l'éditeur n'est pas gardé (5.4, point 7).
- « Le droit d'écriture le plus étroit permet aussi de supprimer » chez GitLab, monday.com, HubSpot, Miro, Attio (notes) et Outlook : « c'est à Leon de ne jamais s'en servir » (guide `:11`).

**Client HTTP**

- Un 403 hors limite de débit est toujours une `ConnectorAuthError`. Pour une écriture, un 403 « pas le droit sur cet objet » mettrait donc toute la connexion en erreur si l'appelant le traite comme la relève. À distinguer côté appelant.
- Sans `once`, un POST est rejoué jusqu'à trois fois sur 5xx ou erreur réseau. Toute écriture doit porter `once: true`.
- Réponse limitée à 10 Mo, délai 30 s, attente de reprise 60 s au plus.
- Les redirections ne sont pas suivies.

**Pipedream**

- 1 crédit par requête, lecture comme écriture. Mode développement : 10 comptes.
- `shortcut` : des comptes restent chez Pipedream après un retour jamais revenu ou un membre supprimé ; « un balayage périodique des utilisateurs `leon-` sans connexion, avant la production » (`pipedream.ts:198-200`).
- Le jeton serveur est en mémoire du processus : une seule instance.

**Indexation et vecteurs**

- Le pool Postgres de l'application a 4 connexions, plus 2 pour pg-boss et 1 d'écoute (`src/server/db/client.ts:9-12`). La relève (4 à la fois) et l'indexation (4 à la fois) se partagent ces 4 connexions. Toute tâche de fond de plus tire sur le même pool.
- Dimension des vecteurs fixe : 1 024. Un autre fournisseur demande une migration. `voyage`, `mistral`, `bge-m3` sont nommés mais non livrés : les régler fait échouer le démarrage (`registry.ts:21-22`).
- Sans `LEON_EMBEDDINGS`, pas de vecteurs : recherche par le texte seul.
- Les positions `char_start` / `char_end` des passages sont en unités UTF-16 : à ne lire qu'en TypeScript (`schema/search.ts:38-40`).
- `shortcut` : un signal perdu après l'écriture des vecteurs n'est pas repris (`embed-missing.ts:174-176`).

**Conditions des éditeurs** (écrites dans les specs et le code, à trancher avant un client)

- Slack : branché « à la demande de David pour l'essai » contre ses conditions (annexe 8, `slack/connector.ts:10-28`, non relu ici).
- Fathom, tl;dv, ClickUp, Front, monday.com, Sentry : à faire confirmer par écrit (`docs/specs/2026-10-15-connecteurs.md:144`).
- Basecamp : le `User-Agent` doit porter une adresse de contact (guide `:171`).

**Documents périmés à ne pas suivre**

- `docs/specs/2026-10-15-connecteurs.md` décrit encore le pipeline du premier jet (tri, extraction, faits) : il a été supprimé en 0010. Ses types `ConnectorItem` et `Connector` sont plus pauvres que ceux du code. Le code fait foi.
- `docs/specs/2026-10-15-connecteurs-oauth.md:47` dit « droits de lecture seulement » : contredit par le guide (décision du 23/10/2026) et par le code.
- La spec dit que toute l'équipe peut gérer une connexion : le code réserve la pause et la suppression au créateur et aux administrateurs, la clé au créateur seul.

## 7. Ce que je n'ai pas lu

- Les 42 connecteurs un par un. Lus en entier : `linear/` (`connector.ts`, `client.ts`, `oauth.ts`), `gmail/connector.ts`, `outlook/oauth.ts`. Lus en partie : `github/client.ts`, `github/connector.ts:1-130`, `hubspot/oauth.ts:40-79`, `jira/oauth.ts:20-80`. Pour les autres, seulement les lignes `scopes`, `minIntervalMs`, `privateRaw`, `pipedream` trouvées par recherche.
- `drive/`, `slack/`, `outlook/connector.ts` (agenda, `removed`), les `map.ts`, `schemas.ts`, `cursor.ts`, les `catalog.ts` par outil, `jira/access.ts`, `github/depots-equipe.ts`.
- Aucun fichier de test (`*.test.ts`, `*.db.test.ts`), sauf deux lignes de `schema-contract.db.test.ts`.
- `src/server/oauth/` (`authorize.ts`, `clients.ts`, `client-document.ts`, `metadata.ts`) et `src/server/api/oauth-routes.ts` : seulement leurs en-têtes. C'est le serveur d'autorisation de Leon pour les assistants (plan « MCP distant »), pas les connecteurs. Il n'intervient pas dans la relève.
- `src/server/ingest/record-facts.ts` et `record-backstage.ts` : seulement leurs en-têtes. Ils rangent les faits et les coulisses des sessions de code, hors connecteurs.
- `src/server/embeddings/fake-embedder.ts`.
- `src/capture/mask-secrets.ts` au-delà de son en-tête ; `src/lib/providers.ts` au-delà de ses exports.
- L'interface : `connections/page.tsx`, `tool-dialog.tsx`, les pages d'onboarding.
- Les migrations 0020 à 0023 en détail (file `passages_a_vectoriser`, `passages_sans_vecteur` dans sa version actuelle, `retirer_vieux_vecteurs`), 0047 (`depots_equipe`), 0057 au-delà de ses politiques.
- `docs/guides/connecteurs-verification.md`, `docs/specs/2026-10-26-github-acces-complet.md`, l'étude `docs/etudes/pipedream-2026-10` (absente du dépôt).
- Le mécanisme d'actions (`src/server/discussion/github-actions.ts`, `proposed-actions.ts`, `schema/actions.ts`) : hors de ma partie, lu seulement `0037-actions.sql:1-41`.
- Je n'ai lancé ni serveur, ni test, ni migration. Rien de ce qui précède n'a été observé en fonctionnement.
