# Connecteurs v1, le bouton OAuth : plan d'implémentation

15 octobre 2026 · Amos (avec Claude) · à relire par David

> **Pour les agents :** même méthode que le [plan des connecteurs](2026-10-15-connecteurs.md) (lire son en-tête pour les règles d'exécution, de commit et de travail à plusieurs dans le même dossier). Ce plan s'exécute **après** lui : le socle (T01 à T08) et les connecteurs (T09 à T43) existent dans le code. **Le code fait foi** sur les noms et les signatures : si un nom de ce plan diffère du code, suivre le code et le noter dans le rapport.

**But :** ajouter le bouton « Se connecter avec… » aux 17 outils qui le permettent sans vérification de l'éditeur, dont 4 nouveaux connecteurs, en gardant la clé collée en secours.

**Spec (fait foi) :** [`docs/specs/2026-10-15-connecteurs-oauth.md`](../specs/2026-10-15-connecteurs-oauth.md), complément de [`2026-10-15-connecteurs.md`](../specs/2026-10-15-connecteurs.md).

**Architecture :** un connecteur à bouton déclare sa description OAuth (`oauth`, C2). Le socle porte deux routes Hono (`POST /debut`, `GET /retour`), un cookie signé pour l'aller-retour, l'échange du code, et le renouvellement des jetons avant chaque passage. Les jetons vivent dans le bloc secret chiffré de la connexion, comme une clé. Aucune nouvelle table : la migration `0009` n'ajoute que les quatre nouveaux outils aux listes de types.

**Stack :** inchangée, aucune nouvelle dépendance (`node:crypto` pour PKCE, `state` et signature ; `hono/cookie` et `hono/csrf`, déjà dans `hono`).

## Règles propres à ce complément

- Mêmes règles que le plan des connecteurs (pas de dépendance, un connecteur ne touche que son dossier, jamais de réseau dans les tests, textes en français).
- Une seule migration, `0009-connecteurs-oauth.sql`.
- **0009 est figée dès qu'elle est appliquée** (même règle que 0008) : T47 l'écrit en une seule écriture, relue, avant tout test db. Toute correction ensuite : arrêt et remontée à l'orchestrateur.
- **Ordre** : T47 d'abord (elle est courte, et la mise en place globale des tests db de T45 appliquerait une 0009 à moitié écrite), puis T45. T46 après T45 et T47. T48 à T61 après T45 (T60, T61a à T61c : et T47). T62 en dernier.
- Les tâches T48 à T61 ne modifient pas le socle (seule exception : T52, documentée) ; un manque se signale dans le rapport.
- La clé collée continue de marcher pour chaque outil qui l'acceptait : ses tests restent verts.

## Points de vigilance

1. **Deux onglets, deux branchements en même temps** : le second écrase le cookie du premier. Le premier retour échoue proprement (« Le lien a expiré, recommencez. ») sans rien créer. Test : T45.
2. **Un jeton de rafraîchissement à usage unique** (Atlassian : 10 min de tolérance ; Airtable ; GitLab ; Linear : 30 min de grâce ; Notion ; Miro ; Productboard : l'ancien vaut encore 60 min ; Help Scout ; Microsoft le remplace) : si le passage plante juste après le renouvellement, les nouveaux jetons doivent déjà être en base. Test : T45 (renouvellement enregistré avant l'appel au connecteur).
3. **L'utilisateur refuse chez l'éditeur** (`error=access_denied`) ou revient des heures plus tard : message simple, rien de créé. Test : T45.
4. **Atlassian avec plusieurs sites** : choisir le site saisi avant le clic s'il y en a un, sinon le premier, et le dire dans le compte affiché (« Connecté : acme.atlassian.net, 2 autres sites disponibles »). Test : T52.
5. **Outlook sans accord de l'administrateur** : Microsoft renvoie une erreur de consentement, ou affiche sa propre page « Approbation de l'administrateur requise » (AADSTS90094) sans revenir vers Leon. Message : « L'administrateur Microsoft de votre entreprise doit d'abord autoriser Leon. », avec le lien d'accord administrateur, affiché au retour **et** avant le bouton d'Outlook. Test : T60, T46.
6. **Un lien piégé** (`…/github/debut?repos=victime/prive`) : GitHub et d'autres renvoient aussitôt quand l'appli est déjà autorisée, ce qui brancherait un outil à l'insu de l'utilisateur. `/debut` n'accepte donc qu'un POST venu de Leon (origine vérifiée). Test : T45.
7. **La boîte Outlook visible de l'équipe** : par D3 (ACL d'équipe), les courriers et événements lus deviennent visibles de toute l'équipe. **Décision à confirmer par Amos et David avant T60** ; en attendant, T60 suit sa ligne (boîte de réception et éléments envoyés seulement, `warning` qui le dit).

## Contrats

### C1. Variables d'environnement

```ts
// src/server/connectors/oauth-env.ts (T45)
export const OAUTH_APP_KEYS = ['GITHUB', 'NOTION', 'LINEAR', 'GITLAB', 'ATLASSIAN', 'ASANA', 'CLICKUP', 'MONDAY', 'AIRTABLE', 'HUBSPOT', 'HELPSCOUT', 'ATTIO', 'BASECAMP', 'MIRO', 'PRODUCTBOARD', 'OUTLOOK'] as const;
export type OAuthAppKey = (typeof OAUTH_APP_KEYS)[number];
export function oauthClient(appKey: OAuthAppKey): { id: string; secret: string } | null;
export function warnIncompleteOAuthPairs(): void;
```

`LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET`, `<APPLI>` étant une clé de `OAUTH_APP_KEYS` (`ATLASSIAN` pour Jira et Confluence, l'identifiant de l'outil en majuscules pour les autres). Les deux sont facultatives ; une chaîne vide vaut une variable absente ; une paire incomplète est ignorée. `oauthClient` lit `process.env` **à chaque appel** (pour que `vi.stubEnv` simule une appli test par test), à travers une table écrite en toutes lettres (`GITHUB: () => [process.env.LEON_OAUTH_GITHUB_ID, process.env.LEON_OAUTH_GITHUB_SECRET]`, …), seule forme que reconnaît `src/test/contracts/env-contract.test.ts` ; jamais de lecture dynamique (`process.env[`…${key}…`]`), jamais par `EnvSchema` (`src/server/env.ts`, validé à l'import), jamais ailleurs. `warnIncompleteOAuthPairs` : un `console.warn` par paire incomplète, qui nomme la variable manquante sans aucune valeur ; appelée par `src/instrumentation-node.ts`, après le contrôle de `next build`.

### C2. Description OAuth d'un connecteur

```ts
// src/server/connectors/types.ts (T45) : champ facultatif de Connector
export type OAuthTokens = { accessToken: string; refreshToken: string | null; expiresAt: string | null; scope: string | null; raw: Record<string, unknown> };
export type OAuthSpec = {
  appKey: OAuthAppKey;                      // C1 : 'GITHUB', 'ATLASSIAN'…
  authorizeUrl: string;                     // https, hôte fixe
  tokenUrl: string;                         // https, hôte fixe
  scopes: string[];                         // [] : aucun paramètre scope (ClickUp, Help Scout, GitHub App)
  scopeSeparator?: ' ' | ',';               // ' ' par défaut
  pkce: boolean;                            // S256
  clientAuth: 'body' | 'basic';             // identifiant et secret avec les autres paramètres, ou en Basic
  tokenBody?: 'form' | 'json' | 'query';    // 'form' par défaut ; 'query' : tout en paramètres d'adresse, corps vide (Basecamp, Miro, Productboard)
  extraAuthorizeParams?: Record<string, string>; // audience, prompt, owner, access_type…
  extraTokenParams?: { code?: Record<string, string>; refresh?: Record<string, string> }; // ajoutés à l'échange et au renouvellement (Basecamp : { code: { type: 'web_server' }, refresh: { type: 'refresh' } })
  preFields: string[];                      // champs non secrets demandés avant le clic (ex. ['repos']) : clés du configSchema, champs non secrets du catalogue
  setupHosts: string[];                     // hôtes exacts que toConfig peut appeler (Atlassian ['api.atlassian.com'], Basecamp ['launchpad.37signals.com']) ; [] s'il n'appelle rien
  // Outlook (T60) : refus faute d'accord de l'administrateur, et lien pour le donner.
  adminConsent?: { isConsentError(input: { error: string; description: string | null }): boolean; url(clientId: string, redirectUri: string): string };
  // Champs propres à l'outil (cloudId, site, compte…), à partir des jetons et des champs saisis avant le clic.
  toConfig(tokens: OAuthTokens, preFields: Record<string, unknown>, http: ConnectorHttp): Promise<Record<string, unknown>>;
};
// Connector<Config> gagne : oauth?: OAuthSpec
// src/server/connectors/oauth.ts (T45)
export const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const;
```

**La configuration d'une connexion OAuth** porte `authMode: 'oauth'`, `accessToken`, `refreshToken`, `expiresAt` (ISO 8601 ou nul), plus ce que rend `toConfig`. Le socle la construit dans cet ordre, pour que `toConfig` ne puisse rien écraser : `{ ...await toConfig(tokens, preFields, http), authMode: 'oauth', accessToken, refreshToken, expiresAt }`, où `tokens.raw` est privé de `access_token`, `refresh_token` et `id_token`.

**Le `configSchema` d'un connecteur à bouton reste un `z.object`** (le test du catalogue lit `.shape`, R1) : `authMode: z.enum(['key', 'oauth']).default('key')` (une connexion existante, sans `authMode`, est à clé), les champs de clé, `accessToken`, `refreshToken: z.string().nullable()` et `expiresAt: z.string().nullable()`, tous en `.optional()`, plus un `.superRefine` qui exige les champs de clé si `authMode === 'key'` et `accessToken` si `'oauth'` (chemin de l'erreur : le nom du champ). Vérifié sous zod 4.6.7 : `.superRefine` garde `.shape` ; une union n'a pas de `.shape`, et `.pick()` lève sur un schéma raffiné. Un outil sans clé (`keyAccepted: false`) : `authMode: z.literal('oauth')`, `accessToken: z.string().min(1)`, sans `.superRefine`. `sync` et `verify` lisent le jeton d'accès quelle que soit la forme.

**Les secrets.** Un connecteur ne met jamais `accessToken` ni `refreshToken` dans `secretFields`, qui ne liste que les champs de clé (vide pour un outil sans clé) : le catalogue et son test restent inchangés. Le socle scelle une connexion OAuth avec `[...OAUTH_SECRET_FIELDS, ...connector.secretFields]` (`accessToken` d'abord : `secret_hint` vient du premier champ), dans `/retour` comme dans `ensureFreshTokens`.

### C3. Socle OAuth (`src/server/connectors/oauth.ts`, `oauth-cookie.ts`, `oauth-routes.ts`, T45)

```ts
export const OAUTH_COOKIE = 'leon_oauth';
export const OAUTH_COOKIE_MAX_AGE = 600;   // secondes
export type OAuthPending = { provider: ProviderId; userId: string; tenantId: string; state: string; verifier: string | null; since: '7' | '30' | '90' | '365'; preFields: Record<string, unknown>; reconnectId: string | null; createdAt: number };
export function sealPending(p: OAuthPending): string;                   // JSON en base64url + HMAC-SHA256 (BETTER_AUTH_SECRET)
export function openPending(cookie: string, now: number): OAuthPending | null; // signature fausse (timingSafeEqual) ou plus de 10 min → null
// Une seule adresse par appli : Jira et Confluence partagent `atlassian`. Construite par new URL(chemin, env.BETTER_AUTH_URL).
export function redirectUri(spec: OAuthSpec): string;                   // `${BETTER_AUTH_URL}/api/v1/connexions/oauth/${spec.appKey.toLowerCase()}/retour`
export function authorizeUrl(spec: OAuthSpec, client: { id: string }, p: OAuthPending): string; // sans paramètre scope quand scopes est vide
// http : createConnectorHttp({ provider, hosts: [new URL(spec.tokenUrl).host], fetchImpl }), construit par l'appelant.
export async function exchangeCode(spec: OAuthSpec, client: { id: string; secret: string }, code: string, verifier: string | null, http: ConnectorHttp): Promise<OAuthTokens>;
// refresh_token absent de la réponse → l'ancien est gardé (Asana) ; expires_in absent → expiresAt nul.
export async function refreshTokens(spec: OAuthSpec, client: { id: string; secret: string }, refreshToken: string, http: ConnectorHttp): Promise<OAuthTokens>;
// L'éditeur refuse le code ou le jeton de rafraîchissement (remplace OAuthRefreshRefusedError : sert aussi à l'échange).
export class OAuthRefusedError extends Error {
  constructor(readonly adminConsent = false) { super("Autorisation refusée par l'éditeur"); } // message fixe
}
// Avant chaque passage (runConnectorSync, après claim et avant prepare) : sur une connexion `authMode: 'oauth'`,
// renouvelle si expiresAt < maintenant + 5 min (ou si `force`), enregistre par saveOAuthTokens, puis renvoie la config à jour.
export async function ensureFreshTokens(ctx: TenantContext, connection: LoadedConnection, connector: AnyConnector, deps: { fetchImpl?: typeof fetch; now?: () => Date; force?: boolean }): Promise<Record<string, unknown>>;
```

**Échange et renouvellement.** Client : `createConnectorHttp({ provider, hosts: [new URL(spec.tokenUrl).host], fetchImpl })`, construit par `/retour` et par `ensureFreshTokens`. Paramètres : `grant_type=authorization_code`, `code`, `redirect_uri` (= `redirectUri(spec)`, la même qu'à l'autorisation), `code_verifier` si PKCE, puis `extraTokenParams.code` ; au renouvellement, `grant_type=refresh_token`, `refresh_token`, puis `extraTokenParams.refresh`. `client_id` et `client_secret` vont avec les paramètres (`clientAuth: 'body'`) ou en `Authorization: Basic` (`'basic'`). Envoi en POST, `Accept: application/json`, `acceptStatus: [400, 401, 403]` : `form` du client HTTP (`tokenBody: 'form'`), `body` (`'json'`) ou `query` sans corps (`'query'`). La réponse est lue par un schéma zod (`access_token`, `refresh_token`, `expires_in`, `scope`, `error`, `error_description`, tous facultatifs). `json()` ne rend pas le statut : c'est `error` qui signe le refus (RFC 6749, § 5.2). Un `error` dans la réponse, en 200 (GitHub répond ainsi) comme en 400, 401 ou 403 (Atlassian rend 403 `invalid_grant`) → `OAuthRefusedError` (avec `adminConsent` vrai si `spec.adminConsent?.isConsentError` le dit) ; pas d'`access_token` → `ConnectorHttpError(status, 'Réponse inattendue')`. Aucun message ne reprend le corps.

**`ensureFreshTokens`.** Accès qui expire (ou `force`) alors que `refreshToken` est nul ou que `oauthClient` est nul → `OAuthRefusedError`. Refus de l'éditeur → `OAuthRefusedError`. Autre erreur (réseau, 5xx) : remonte telle quelle (→ `error`, nouvel essai dans 1 h). `expiresAt` nul sans `force`, ou connexion à clé → rien, la config est rendue telle quelle. L'enregistrement : `saveOAuthTokens(ctx, id, config, [...OAUTH_SECRET_FIELDS, ...connector.secretFields], { reconnect: false })`, **avant** de rendre la config.

**Routes.**

```ts
// src/server/connectors/oauth-routes.ts (T45)
export function createOAuthRoutes(deps: { getConnector: (id: ProviderId) => AnyConnector | null; fetchImpl?: typeof fetch; now?: () => number }): Hono;
// src/server/api/app.ts : app.route('/v1/connexions/oauth', createOAuthRoutes({ getConnector })), avant app.notFound
```

Session : `const session = await auth.api.getSession({ headers: c.req.raw.headers })`, puis `resolveTenantContext(session.user.id, session.session.activeOrganizationId ?? null)` ; jamais `getUserContext` ni `requireUserContext` (`next/headers` lève hors d'une requête Next). Le jeton d'appareil ne sert pas ici. Cookies : `getCookie`, `setCookie`, `deleteCookie` de `hono/cookie` ; `leon_oauth` est `httpOnly`, `SameSite=Lax`, `Secure` si `BETTER_AUTH_URL` est en https, `path: '/api/v1/connexions/oauth'`, 600 s.

- `POST /:provider/debut` (formulaire `application/x-www-form-urlencoded` : `since`, champs avant le clic, `reconnect`), précédé de `csrf({ origin: new URL(env.BETTER_AUTH_URL).origin })` de `hono/csrf`. Outil inconnu, sans `oauth` ou sans appli configurée (`oauthClient` nul) → 404 ; session absente → 303 vers `/connexion` ; `connectorsKey()` nul → 303 vers `/connexions?erreur=indisponible&outil=<id>`. Avec `reconnect` : la connexion doit exister (lue par `listConnections`, sous `withTenant`) et avoir `provider` = l'outil de l'adresse, sinon 404 ; ses champs ouverts déjà enregistrés servent de champs avant le clic. Sinon, champs avant le clic : `fieldsFromForm` sur les champs du catalogue nommés dans `preFields`, puis `z.object(Object.fromEntries(spec.preFields.map((n) => [n, shape[n]])))`, où `shape = (configSchema as z.ZodObject).shape` (jamais `.pick`, qui lève sur un schéma raffiné) ; échec → 303 vers `/connexions?erreur=champs&outil=<id>`. Pose le cookie ; 303 vers `authorizeUrl`.
- `GET /:app/retour?code=…&state=…` (ou `error=…`, ou `admin_consent=True`), `:app` étant `appKey` en minuscules : l'outil est celui du cookie (`pending.provider`), et `getConnector(pending.provider)?.oauth?.appKey.toLowerCase()` doit valoir `app`. Ordre : `spec.adminConsent?.isConsentError(…)` avant tout autre traitement de `error` ; puis `error` ; puis cookie, session et `state` (comparé par `timingSafeEqual` après comparaison des longueurs) ; puis `exchangeCode` ; `toConfig`, avec `createConnectorHttp({ provider, hosts: spec.setupHosts, fetchImpl })` ; config validée par `configSchema` ; `verify`, avec `createConnectorHttp({ provider, hosts: connector.hosts(config), minIntervalMs, fetchImpl })` ; puis `createConnection` (`secretFields: [...OAUTH_SECRET_FIELDS, ...connector.secretFields]`, `label` = le compte rendu par `verify`, `since` du cookie) ou, avec `reconnectId`, `saveOAuthTokens(…, { reconnect: true })` sur la même connexion. Le cookie est effacé dans tous les cas. 302 vers `/connexions?branche=<outil>` ou `/connexions?erreur=<code>&outil=<outil>` (`outil` : celui du cookie, sinon celui du chemin s'il est dans `PROVIDER_IDS`, sinon omis). Aucun détail de l'éditeur dans l'adresse ; les erreurs passent par `logError`, sans corps.

| Cas | Code |
|---|---|
| `error=access_denied` | `annule` |
| cookie absent, illisible, périmé, d'un autre utilisateur, d'un autre tenant ou d'une autre appli ; `state` différent ; session absente | `expire` |
| autre `error` de l'éditeur ; échange refusé (`OAuthRefusedError`) ; `verify` qui lève `ConnectorAuthError` | `refuse` |
| réseau, 5xx, `toConfig` qui appelle un hôte hors de `setupHosts`, config refusée par `configSchema`, toute autre erreur | `indisponible` |
| `adminConsent.isConsentError` vrai, au retour ou à l'échange (`OAuthRefusedError.adminConsent`) | `admin` |
| `admin_consent=True` sans `code` (retour du lien d'accord administrateur, sans cookie) | `admin_accorde` |
| champs avant le clic invalides (`/debut`) | `champs` |

**Fonction de `connections.ts` à ajouter** : `saveOAuthTokens(ctx, id, config, secretFields, options: { reconnect: boolean }): Promise<boolean>`. Réécrit `config` (champs ouverts : `authMode`, `expiresAt`, champs de `toConfig` comme `cloudId` ou `site`), `secret` (champs de `secretFields` présents), `secret_hint` et `updated_at`. Avec `reconnect` : `status 'active'`, `last_error` nul, `next_sync_at = now()`, sauf en pause (même règle que `replaceConnectionSecret`). Sans `reconnect`, le statut, l'échéance et la réservation ne bougent pas. La reconnexion ne passe jamais par `replaceConnectionSecret`, qui ne réécrit pas les champs ouverts.

## Tâches

### T45 · Socle OAuth

- **Modèle** sonnet, effort high · **Dépend de** T47 · **Sensible** oui
- **Fichiers** — créer : `src/server/connectors/oauth-env.ts`, `oauth-env.test.ts`, `oauth-cookie.ts`, `oauth-cookie.test.ts`, `oauth.ts`, `oauth.test.ts`, `oauth-routes.ts`, `oauth-routes.db.test.ts`, `src/test/fake-oauth-connector.ts` ; modifier : `src/server/connectors/types.ts`, `src/server/connectors/http.ts` (+ `http.test.ts`), `src/test/fake-fetch.ts` (+ `fake-fetch.test.ts`), `src/server/connectors/connections.ts` (+ `connections.db.test.ts`), `src/server/connectors/sync.ts` (+ `sync.db.test.ts`), `src/server/api/app.ts`, `src/instrumentation-node.ts` (+ `instrumentation-node.test.ts`), `.env.example`.

- [ ] 1. Tests d'abord, `oauth-env.test.ts` (`vi.stubEnv`, `vi.unstubAllEnvs()` en `afterEach`) : paire complète → client ; paire incomplète → null ; chaîne vide → null ; appli sans variables → null ; `warnIncompleteOAuthPairs` : un avertissement par paire incomplète, qui ne contient aucune valeur.
- [ ] 2. Tests d'abord, `oauth-cookie.test.ts` : aller-retour ; signature modifiée → null ; 601 s plus tard → null ; contenu illisible → null ; le cookie ne contient aucun secret d'appli.
- [ ] 3. Tests d'abord, `http.test.ts` : `HttpRequest` gagne `form?: Record<string, string>`, envoyé en `new URLSearchParams(form).toString()` avec `content-type: application/x-www-form-urlencoded` ; `form` et `body` ensemble → `ConnectorHttpError(null, 'Requête invalide')`, sans appel ; mêmes règles de message (jamais une valeur). `fake-fetch.test.ts` : un corps de formulaire se lit dans `calls[].body` comme un objet (`Object.fromEntries(new URLSearchParams(…))`) ; aujourd'hui, le `JSON.parse` de `fakeFetch` lève dessus.
- [ ] 4. Tests d'abord, `oauth.test.ts` (avec `fakeFetch`, `saveOAuthTokens` simulée par `vi.mock`) : `authorizeUrl` porte `client_id`, `redirect_uri`, `response_type=code`, `state`, les droits joints par le séparateur (aucun `scope` si `scopes` est vide), `code_challenge` (S256 du vérificateur) et `code_challenge_method=S256` si `pkce`, et les paramètres en plus ; `redirectUri` d'une spec `ATLASSIAN` finit par `/oauth/atlassian/retour` ; `exchangeCode` envoie le code, `redirect_uri`, le vérificateur et `extraTokenParams.code`, le secret avec les paramètres ou en Basic selon `clientAuth`, en formulaire, en JSON ou en paramètres d'adresse sans corps selon `tokenBody`, et lit `access_token`, `refresh_token`, `expires_in` (→ `expiresAt`), `scope` ; `raw` rendu sans `access_token`, `refresh_token`, `id_token` ; réponse 200 avec `error` → `OAuthRefusedError` ; réponse sans `access_token` → erreur sans corps dans le message ; `refreshTokens` envoie `extraTokenParams.refresh`, et un 400, 401 ou 403 qui porte `error` (`invalid_grant`) → `OAuthRefusedError` ; une réponse sans `refresh_token` garde le précédent ; sans `expires_in` → `expiresAt` nul ; `ensureFreshTokens` : expire dans 2 min → renouvelle et appelle `saveOAuthTokens` **avant** de rendre la config ; expire dans 1 h → ne fait rien ; `expiresAt` nul → ne fait rien, sauf avec `force` ; `refreshToken` nul ou appli absente alors que l'accès expire → `OAuthRefusedError` ; connexion à clé → ne fait rien.
- [ ] 5. `oauth-env.ts`, `oauth-cookie.ts`, `http.ts` (`form`), `fake-fetch.ts`, `oauth.ts`. `types.ts` : `OAuthSpec`, `OAuthTokens`, `oauth?` sur `Connector`, et sur `CatalogEntry` deux champs facultatifs que les tâches T48 à T61 remplissent : `oauthHelp?: string` (ce que l'utilisateur verra chez l'éditeur) et `keyAccepted?: boolean` (faux pour un outil qui ne se branche que par bouton ; absent = vrai).
- [ ] 6. `connections.ts` : `saveOAuthTokens` (C3). `sync.ts` : `ensureFreshTokens` juste après `claim` et avant `prepare`, dans un try/catch qui passe par `recordFailure`. `OAuthRefusedError` → `auth_error` avec « Reconnectez <outil> : l'autorisation a expiré. ». Un `ConnectorAuthError` 401 pendant le passage d'une connexion OAuth qui a un `refreshToken` → un renouvellement forcé (`ensureFreshTokens(…, { force: true })`, enregistré), puis le passage est relancé **une fois** avec la config à jour (il reprend au curseur d'origine : l'ingestion ne crée aucun doublon). Un second `ConnectorAuthError`, ou un `ConnectorAuthError` sur une connexion OAuth sans `refreshToken` → `auth_error` « Reconnectez <outil> : l'autorisation a été retirée. » au lieu de « Clé refusée… ». Tests : `connections.db.test.ts` (sans `reconnect` : statut et échéance inchangés, `config.expiresAt` réécrit ; avec `reconnect` : `active`, `last_error` nul, échéance maintenant, sauf en pause ; `secret_hint` = 4 derniers caractères d'`accessToken`) ; `sync.db.test.ts` (renouvellement réussi → `config.expiresAt` nouveau en base, et un second passage ne renouvelle pas ; renouvellement refusé → `status 'error'`, échéance nulle, « a expiré » ; 401 puis renouvellement accepté → `ok` et nouveaux jetons en base ; 401 deux fois → « a été retirée »).
- [ ] 7. Tests d'abord, `oauth-routes.db.test.ts`. Le connecteur factice (`src/test/fake-oauth-connector.ts`, `fakeOAuthConnector()`) a l'identifiant `github`, `appKey: 'GITHUB'`, `preFields: ['repos']` (comme le catalogue de GitHub). Session de test comme `sessionCookie()` de `src/server/api/require-api-token.db.test.ts` (`createUserWithOrganization`, `auth.api.signInEmail({ body, returnHeaders: true })`, puis `headers.get('set-cookie')`). Le test monte `new Hono().basePath('/api').route('/v1/connexions/oauth', createOAuthRoutes({ getConnector: () => fakeOAuthConnector(), fetchImpl }))`, simule l'éditeur par `fakeFetch` et l'appli par `vi.stubEnv('LEON_OAUTH_GITHUB_ID', …)` (`vi.unstubAllEnvs()` en `afterEach`), et renvoie au `/retour` le cookie de session et `leon_oauth`. Cas : `/debut` sans session → 303 vers `/connexion` ; outil sans appli → 404 ; `Origin: https://evil.test` → 403, aucun cookie posé ; `/debut` valide → 303 vers l'éditeur et cookie posé ; champs avant le clic invalides → `erreur=champs` ; `/retour` correct → connexion créée (secret chiffré, `authMode: 'oauth'`, la colonne `config` de la ligne, lue par l'admin, ne contient ni le jeton d'accès ni le jeton de rafraîchissement, `JSON.stringify` de `listConnections` non plus), cookie effacé, 302 vers `?branche=github` ; `state` différent, cookie absent, cookie d'un autre utilisateur, cookie de plus de 10 min, cookie d'un autre outil (chemin d'une autre appli), `error=access_denied` → 302 vers `?erreur=…` (code de la table de C3), aucune connexion ; deux `/debut` successifs puis le retour du premier → `expire` ; échange refusé (400) → `refuse` ; `toConfig` qui appelle un hôte hors de `setupHosts` → `indisponible` ; `reconnect=<id>` → même id, nouveaux jetons, statut `active` ; `reconnect=<id d'une connexion d'un autre outil>` → 404, aucun cookie ; `reconnect` d'un autre tenant → 404. Connexions supprimées en `afterAll` (contraintes globales du plan des connecteurs).
- [ ] 8. `oauth-routes.ts`, montage dans `app.ts`. `instrumentation-node.ts` : `warnIncompleteOAuthPairs()`. `.env.example` : les 16 paires, vides, avec un commentaire qui renvoie au guide.
- [ ] 9. Tests (hors sandbox), `src/test/contracts/env-contract.test.ts` compris, typecheck, lint, build de vérification. Commit.

### T46 · Interface : le bouton

- **Modèle** sonnet · **Dépend de** T45, T47 (T47 modifie aussi `catalog.ts` et son test) · **Sensible** oui
- **Fichiers** — modifier : `src/server/connectors/catalog.ts`, `catalog.test.ts`, `src/lib/connection-form.ts`, `src/lib/connection-form.test.ts`, `src/components/connection-panel.tsx`, `src/components/connection-controls.tsx`, `src/app/(app)/connexions/page.tsx`.

`CatalogItem` gagne : `oauthReady: boolean` (connecteur avec `oauth` et `oauthClient(appKey)` non nul) ; `keyAccepted: boolean` (`entry.keyAccepted ?? true`) ; `oauthPreFields: string[]` (`connector.oauth.preFields`, sinon `[]`) ; `adminConsentUrl: string | null` (`spec.adminConsent?.url(client.id, redirectUri(spec))` quand l'appli est configurée : l'identifiant d'appli n'est pas un secret). `oauthHelp` vient de `CatalogEntry`.

- [ ] 1. Tests d'abord. Le projet n'a pas d'environnement DOM : on teste les fonctions pures de `connection-form.ts`, pas le rendu. `connection-form.test.ts` : `oauthStartPath(provider)` → `/api/v1/connexions/oauth/<outil>/debut` ; `panelMode(item)` → `'oauth+key' | 'oauth' | 'key' | 'none'` (`none` : outil sans clé dont l'appli n'est pas configurée) ; `oauthNotice({ branche, erreur, outil })` pour chaque code de C3 (valeur inconnue → rien) ; `canReconnect(view)` vrai si `view.config.authMode === 'oauth'`. `catalog.test.ts` : `oauthReady` (avec et sans `vi.stubEnv`), `keyAccepted`, chaque nom de `oauthPreFields` est une clé de `shape` et un champ non secret du catalogue ; `keyHelp` exigé seulement si `keyAccepted`, `oauthHelp` exigé si `connector.oauth`.
- [ ] 2. Panneau : avec `oauthReady`, « Se connecter avec <outil> » en premier, précédé des champs `oauthPreFields` et du choix de période ; « ou coller une clé » dépliant si `keyAccepted` ; sans `oauthReady`, seulement le formulaire de clé ; `none` : « L'appli <outil> n'est pas encore configurée sur ce serveur. » ; avec `adminConsentUrl` (Outlook), le lien d'accord administrateur sous le bouton, avec le message du point de vigilance 5. Le bouton est un `<form method="post" action={oauthStartPath(entry.id)}>` qui porte les champs avant le clic, la période et, pour « Reconnecter », un `reconnect` caché : c'est une navigation, pas une server action. L'adresse est rendue par `oauthStartPath` (`src/lib`), jamais écrite en littéral dans un composant (`src/test/contracts/page-links.test.ts`). `connection-controls.tsx` : une connexion OAuth (`canReconnect`) propose « Reconnecter » à la place de « Remplacer la clé », qui reste pour les connexions à clé (le guide de vérification le cite).
- [ ] 3. `page.tsx` lit `branche`, `erreur` et `outil` dans l'adresse : `branche` et `outil` validés par `z.enum(PROVIDER_IDS)`, `erreur` par `z.enum` des codes de C3 ; une valeur inconnue n'affiche rien ; sans `outil`, le nom devient « l'outil ». Messages : « Linear est branché. La première synchronisation démarre dans la minute. » ; `annule` : « Connexion à <outil> annulée. » ; `expire` : « Le lien a expiré, recommencez. » ; `refuse` : « <outil> a refusé l'autorisation. » ; `indisponible` : « <outil> ne répond pas, réessayez dans un moment. » ; `champs` : « Vérifiez les champs saisis. » ; `admin` : le message du point de vigilance 5, avec le lien `adminConsentUrl` de l'outil ; `admin_accorde` : « Accord donné : cliquez de nouveau sur Se connecter avec Outlook. ».
- [ ] 4. Tests, typecheck, lint, build. Commit.

### T47 · Quatre nouveaux outils dans les listes

- **Modèle** sonnet · **Sensible** non · passe la première (Règles)
- **Fichiers** — créer : `src/server/db/migrations/0009-connecteurs-oauth.sql`, `src/server/db/migrations/0009-connecteurs-oauth.db.test.ts`, les dossiers `basecamp/`, `miro/`, `productboard/`, `outlook/` (`connector.ts` qui exporte `null`, `catalog.ts` minimal, comme en T03) ; modifier : `src/capture/turn.ts` (`PROVIDER_IDS` + `basecamp`, `miro`, `productboard`, `outlook`), `src/capture/turn.test.ts` (39), `src/lib/providers.ts` (libellés « Basecamp », « Miro », « Productboard », « Outlook » ; familles : projet, projet, projet, et une nouvelle famille `mails` pour Outlook : `PROVIDER_FAMILIES_ORDER = ['dev', 'reunions', 'projet', 'crm', 'support', 'mails']`, `FAMILY_LABELS.mails = 'Mails et agenda'`), `src/lib/providers.test.ts`, `src/components/source-chip.tsx` (`mails: Mail` de `lucide-react`), `src/server/connectors/registry.ts`, `src/server/connectors/catalog.ts` (4 imports et 4 entrées de `ENTRIES`), `catalog.test.ts` (39, `labelsOf('projet')` et `labelsOf('mails')`), `src/test/contracts/connectors-docs.test.ts` (39), `README.md` (4 lignes au tableau de « ## Connecteurs » : libellé, famille, « non » ; « Les 39 outils branchables »).

**Avant 0009, Amos prévient David** : comme 0008, dès que 0009 est appliquée à `leon_test`, `schema-contract.db.test.ts` des autres branches échoue jusqu'à leur remise sur `main`.

- [ ] 1. Migration, écrite en une seule écriture et relue avant tout test db (0009 figée) : supprime et recrée `connections_provider_check`, `sources_kind_check`, `facts_source_kind_check` avec les listes complètes. Test db : une source `kind = 'outlook'` s'insère ; `kind = 'inconnu'` est refusé.
- [ ] 2. Le reste. `pnpm test` (hors sandbox) vert, `connectors-docs` et `schema-contract` compris ; typecheck, lint. Commit.

### T48 à T61 · Le bouton, outil par outil

Chaque tâche : **Modèle** sonnet · **Dépend de** T45 (T60, T61a à T61c : et T47). Elle ne touche que le dossier de l'outil (seule exception : T52) et suit ces étapes :

- [ ] 1. Lire la doc OAuth officielle de l'éditeur (adresses d'autorisation et de jeton, droits en lecture, PKCE, façon d'envoyer le secret, format du corps, durée des jetons, rafraîchissement, paramètres en plus, hôtes appelés par `toConfig`) ; noter les URL et la date en tête de `oauth.ts` du dossier. Si la doc contredit la ligne du tableau, la doc gagne : le noter dans le rapport.
- [ ] 2. Tests d'abord : la description `oauth` (adresses exactes, droits, PKCE, `clientAuth`, `tokenBody`, `extraTokenParams`, `preFields`, `setupHosts`) ; `toConfig` à partir d'une réponse de jeton d'exemple tirée de la doc, avec un client `createConnectorHttp({ provider, hosts: spec.setupHosts, fetchImpl: fakeFetch(routes) })` ; `configSchema` (C2) accepte la forme `oauth` et l'ancienne forme à clé (sans `authMode`), refuse une forme incomplète ; `verify` et `sync` envoient le jeton OAuth avec le bon en-tête (souvent `Bearer`, parfois autre chose : suivre la doc) ; les tests existants du connecteur restent verts.
- [ ] 3. Implémenter `oauth.ts` (la description) et l'adapter dans `connector.ts`. Mettre à jour `catalog.ts` (`keyHelp` inchangé pour la clé ; ajouter `oauthHelp` : ce que l'utilisateur verra chez l'éditeur ; `keyAccepted: false` pour un outil sans clé).
- [ ] 4. Tests, typecheck, lint. Commit « Txx · Bouton <Outil> (à vérifier) ».

Pour chaque ligne, `setupHosts` liste les hôtes lus par `toConfig` (`[]` s'il ne lit rien) et `tokenBody` vaut `'form'` sauf mention contraire.

| Tâche | Outil | Particularités à vérifier dans la doc |
|---|---|---|
| T48 | GitHub | **GitHub App** (pas d'appli OAuth : son droit `repo` donne l'écriture sur tous les dépôts privés, et la spec demande les droits les plus étroits) : permissions Issues, Pull requests et Metadata en lecture seule ; autorisation `https://github.com/login/oauth/authorize`, jeton `https://github.com/login/oauth/access_token` (`Accept: application/json` ; une erreur y répond en 200 avec `error`, voir C3) ; `scopes: []` (les permissions sont celles de l'appli) ; jeton utilisateur de 8 h, renouvelable ; l'utilisateur installe l'appli sur les dépôts voulus : `oauthHelp` le dit, avec où le faire ; `preFields: ['repos']` ; `LEON_OAUTH_GITHUB_ID` est le « Client ID » de l'appli (pas son « App ID ») |
| T49 | Notion | Intégration publique ; `owner=user` ; secret en Basic, corps JSON (`clientAuth: 'basic'`, `tokenBody: 'json'`) ; l'utilisateur choisit les pages pendant l'autorisation ; la réponse porte `refresh_token` (tournant) mais pas d'`expires_in` : `expiresAt` nul, renouvellement sur 401 (T45) ; `toConfig` garde `workspace_name` et `bot_id` |
| T50 | Linear | `actor=user` ; droits `read` (séparateur `,`) ; PKCE ; échange en formulaire ; jeton d'accès de 24 h (`expires_in` 86399) et jeton de rafraîchissement tournant ; jeton OAuth en `Authorization: Bearer <jeton>`, la clé personnelle reste sans `Bearer` |
| T51 | GitLab | gitlab.com ; droits `read_api` ; PKCE ; jeton de 2 h et rafraîchissement ; `preFields: ['projects']` |
| T52 | Jira et Confluence | `jira/oauth.ts` exporte `atlassianOAuth(scopes)` (même `appKey: 'ATLASSIAN'`, mêmes adresses, `audience=api.atlassian.com`, `prompt=consent`, pas de PKCE, échange en JSON : `tokenBody: 'json'`), que `confluence/connector.ts` importe. Jira : `read:jira-work read:jira-user offline_access`. Confluence (swagger lu le 15/10/2026, API v2 en droits fins, plus `/wiki/rest/api/user/current`) : `read:page:confluence read:comment:confluence read:space:confluence read:user:confluence read:confluence-user offline_access`. Jetons tournants. `setupHosts: ['api.atlassian.com']` : `toConfig` lit `https://api.atlassian.com/oauth/token/accessible-resources` et ne garde que les ressources dont `scopes` contient les droits du produit, sans doublon d'`id` (l'`id` n'est pas unique d'un produit à l'autre) ; il garde `cloudId` et `site`. Les appels passent par `api.atlassian.com/ex/jira/<cloudId>/…` et `…/ex/confluence/<cloudId>/…` ; le site retenu sert à l'adresse web des éléments (`https://<site>.atlassian.net/…`). `preFields: ['site']` facultatif (point de vigilance 4). **Exceptions documentées** à « un connecteur ne touche que son dossier » : `confluence/` (même tâche), et `src/test/contracts/vendor-spec.ts` avec `vendor-params.test.ts` : `callProblems` retire du chemin un préfixe `^/ex/(jira\|confluence)/[^/]+` avant de chercher l'opération (tests : `https://api.atlassian.com/ex/jira/<id>/rest/api/3/myself` passe contre l'extrait jira ; `/ex/jira/<id>/rest/api/3/inconnu` est refusé). `accessible-resources` n'est dans aucune spec produit : les tests de `toConfig` passent par `fakeFetch(routes)` sans extrait (étape 2) |
| T53 | Asana | PKCE ; échange en formulaire ; jeton d'1 h ; le renouvellement ne rend pas de nouveau `refresh_token` (T45 garde l'ancien) ; droits en lecture (`tasks:read`, `projects:read`, `users:read`… selon la page des droits) |
| T54 | ClickUp | Autorisation : `https://app.clickup.com/api?client_id&redirect_uri&state` ; jeton : `POST https://api.clickup.com/api/v2/oauth/token` avec `client_id`, `client_secret` et `code` en corps JSON (`tokenBody: 'json'`, d'après l'OpenAPI lu le 15/10/2026) ; aucun droit (`scopes: []`, l'utilisateur choisit les espaces) ; jeton sans expiration ; jeton OAuth en `Authorization: Bearer <jeton>`, la clé personnelle `pk_` reste sans `Bearer` |
| T55 | monday.com | Droits `boards:read`, `updates:read`, `me:read` ; jeton sans expiration |
| T56 | Airtable | PKCE obligatoire ; secret en Basic ; droits `data.records:read`, `schema.bases:read`, `data.recordComments:read` ; rafraîchissement ; `preFields: ['bases']` facultatif (vide = toutes les bases autorisées pendant l'autorisation) |
| T57 | HubSpot | Appli publique non listée ; droits CRM en lecture (notes, appels, réunions, e-mails, contacts, entreprises, affaires, propriétaires) ; jeton de 30 min et rafraîchissement |
| T58 | Help Scout | Flux par code d'autorisation (en plus du flux « identifiant + secret » existant) ; aucun droit (`scopes: []`) ; jeton de 2 h et rafraîchissement |
| T59 | Attio | Droits en lecture ; `warning` : « Revue d'Attio au-delà de 25 espaces » |
| T60 | Outlook (nouveau, connecteur complet selon la recette R1 du plan des connecteurs + bouton) | Microsoft Graph, locataire `organizations` ; PKCE ; droits `offline_access User.Read Mail.Read Calendars.Read` (si la doc l'exige au renouvellement, `extraTokenParams.refresh.scope`) ; `setupHosts: ['graph.microsoft.com']` si `toConfig` lit `/v1.0/me`. Nature `fil` pour les fils de courrier (`conversationId`) : messages reçus depuis `since`, lus dans `/me/mailFolders/inbox/messages` et `/me/mailFolders/sentitems/messages` avec `$filter=receivedDateTime ge <date>&$orderby=receivedDateTime asc` (même propriété dans les deux, exigence de Graph) ; Indésirables, Éléments supprimés et Brouillons ne sont pas lus ; corps en texte (en-tête `Prefer: outlook.body-content-type="text"`). Nature `reunion` pour les événements d'agenda (objet, participants, description). `warning` : « Les courriers et événements lus deviennent visibles de toute l'équipe. » (point de vigilance 7). `adminConsent` (point de vigilance 5) : `isConsentError` vrai pour `AADSTS90094`, `AADSTS90095` ou `AADSTS65001` dans `error_description`, ou `error=consent_required` ; `url` = `https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=<id>&scope=https://graph.microsoft.com/.default&redirect_uri=<redirectUri>` ; `oauthHelp` dit qu'il faut d'abord faire donner l'accord par l'administrateur. Pas de clé collée (`keyAccepted: false`) |
| T61 | Basecamp, Miro, Productboard (nouveaux, trois connecteurs complets selon R1 + bouton, une tâche par outil : T61a, T61b, T61c) | **Basecamp** : `https://launchpad.37signals.com/authorization/new` et `/authorization/token`, `tokenBody: 'query'`, `extraAuthorizeParams: { type: 'web_server' }`, `extraTokenParams: { code: { type: 'web_server' }, refresh: { type: 'refresh' } }`, pas de PKCE ; jeton de 2 semaines, la doc ne promet pas de nouveau jeton de rafraîchissement (T45 garde l'ancien) ; `setupHosts: ['launchpad.37signals.com']` : `toConfig` lit `GET https://launchpad.37signals.com/authorization.json` et garde le premier compte `product === 'bc3'` (`href` = `https://3.basecampapi.com/<id>`) ; en-tête `User-Agent: Leon (<adresse de contact>)` sur chaque appel, fixé dans le code ; messages, documents, commentaires, discussions, nature `page` ou `fil`. **Miro** : `https://miro.com/oauth/authorize`, `https://api.miro.com/v1/oauth/token` en paramètres d'adresse (`tokenBody: 'query'`) ; droit `boards:read` ; jetons qui expirent (1 h, renouvellement tournant de 60 jours), option à activer dans l'appli ; l'équipe est choisie à l'installation (`team_id` de la réponse, gardé par `toConfig`) ; tableaux, textes des éléments, commentaires si l'API les donne, nature `page`. **Productboard** : `https://app.productboard.com/oauth2/authorize` et `/oauth2/token`, `client_id` et `client_secret` en paramètres d'adresse (`tokenBody: 'query'`, à confirmer dans la doc) ; PKCE S256 ; droit `notes:read` ; jeton de 24 h, renouvellement tournant (l'ancien vaut encore 60 min) ; `warning` : « Seul un Maker administrateur peut autoriser Leon. » ; API `https://api.productboard.com/v2/notes` ; nature `note`. Aucun n'accepte de clé collée dans ce jet (`keyAccepted: false`) |

### T62 · Guide des applis et intégration

- **Modèle** sonnet · **Dépend de** toutes les tâches
- **Fichiers** — créer : `docs/guides/applis-oauth.md` ; modifier : `README.md`, `docs/guides/connecteurs-verification.md` (créé par T44).

- [ ] 1. Guide : pour chacun des 16 éditeurs, où créer l'appli (lien de la console), le nom à donner (« Leon »), l'adresse de retour exacte en local (une seule par appli : `http://localhost:3000/api/v1/connexions/oauth/<appli>/retour`, `atlassian` pour Jira et Confluence), les droits à cocher, les pages demandées (confidentialité, conditions, logo), les deux variables à remplir, et ce qu'il faut activer pour que d'autres comptes l'utilisent (partage Atlassian, appli publique HubSpot, intégration publique Notion, GitHub App publique et son installation sur les dépôts, multilocataire Microsoft avec les permissions Graph déclarées dans l'inscription, jetons qui expirent chez Miro). Repris des descriptions `oauth` du code, pas de mémoire.
- [ ] 2. README : section « Brancher par bouton ». Guide de vérification : brancher GitHub et Linear par bouton, refuser une fois chez l'éditeur, reconnecter.
- [ ] 3. `pnpm test` (hors sandbox), typecheck, lint, build. Commit.

## Couverture de la spec

| Spec | Tâches |
|---|---|
| Bouton en premier, clé en secours | T46 |
| Liste des outils à bouton, quatre nouveaux | T47 à T61 |
| Appli créée une fois par outil, variables, guide | C1, T62 |
| Déroulé, cookie, `state`, PKCE, erreurs | T45 |
| Jetons qui expirent, renouvellement, « Reconnecter » | T45, T46 |
| Sécurité | T45 (tests : origine du formulaire, `reconnect` d'un autre outil, jetons absents de `config`), T48 (droits les plus étroits), revue de sécurité |
| Tests | T45 à T61 |
