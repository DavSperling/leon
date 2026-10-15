# Connecteurs v1, le bouton OAuth : plan d'implémentation

15 octobre 2026 · Amos (avec Claude) · à relire par David

> **Pour les agents :** même méthode que le [plan des connecteurs](2026-10-15-connecteurs.md) (lire son en-tête pour les règles d'exécution, de commit et de travail à plusieurs dans le même dossier). Ce plan s'exécute **après** lui : le socle (T01 à T08) et les connecteurs (T09 à T43) existent dans le code. **Le code fait foi** sur les noms et les signatures : si un nom de ce plan diffère du code, suivre le code et le noter dans le rapport.

**But :** ajouter le bouton « Se connecter avec… » aux 17 outils qui le permettent sans vérification de l'éditeur, dont 4 nouveaux connecteurs, en gardant la clé collée en secours.

**Spec (fait foi) :** [`docs/specs/2026-10-15-connecteurs-oauth.md`](../specs/2026-10-15-connecteurs-oauth.md), complément de [`2026-10-15-connecteurs.md`](../specs/2026-10-15-connecteurs.md).

**Architecture :** un connecteur à bouton déclare sa description OAuth (`oauth`, C2). Le socle porte deux routes Hono (`/debut`, `/retour`), un cookie signé pour l'aller-retour, l'échange du code, et le renouvellement des jetons avant chaque passage. Les jetons vivent dans le bloc secret chiffré de la connexion, comme une clé. Aucune nouvelle table : la migration `0009` n'ajoute que les quatre nouveaux outils aux listes de types.

**Stack :** inchangée, aucune nouvelle dépendance (`node:crypto` pour PKCE, `state` et signature).

## Règles propres à ce complément

- Mêmes règles que le plan des connecteurs (pas de dépendance, un connecteur ne touche que son dossier, jamais de réseau dans les tests, textes en français).
- Une seule migration, `0009-connecteurs-oauth.sql`.
- La clé collée continue de marcher pour chaque outil qui l'acceptait : ses tests restent verts.

## Points de vigilance

1. **Deux onglets, deux branchements en même temps** : le second écrase le cookie du premier. Le premier retour échoue proprement (« Le lien a expiré, recommencez. ») sans rien créer. Test : T45.
2. **Un jeton de rafraîchissement à usage unique** (Atlassian, Basecamp) : si le passage plante juste après le renouvellement, les nouveaux jetons doivent déjà être en base. Test : T45 (renouvellement enregistré avant l'appel au connecteur).
3. **L'utilisateur refuse chez l'éditeur** (`error=access_denied`) ou revient des heures plus tard : message simple, rien de créé. Test : T45.
4. **Atlassian avec plusieurs sites** : choisir le site saisi avant le clic s'il y en a un, sinon le premier, et le dire dans le compte affiché (« Connecté : acme.atlassian.net, 2 autres sites disponibles »). Test : T52.
5. **Outlook sans accord de l'administrateur** : Microsoft renvoie une erreur de consentement. Message : « L'administrateur Microsoft de votre entreprise doit d'abord autoriser Leon. », avec le lien d'accord administrateur. Test : T60.

## Contrats

### C1. Variables d'environnement

`LEON_OAUTH_<OUTIL>_ID` et `LEON_OAUTH_<OUTIL>_SECRET` : `<OUTIL>` est l'identifiant en majuscules (`GITHUB`, `NOTION`, `LINEAR`, `GITLAB`, `ATLASSIAN` pour Jira et Confluence, `ASANA`, `CLICKUP`, `MONDAY`, `AIRTABLE`, `HUBSPOT`, `HELPSCOUT`, `ATTIO`, `BASECAMP`, `MIRO`, `PRODUCTBOARD`, `OUTLOOK`). Les deux sont facultatives. Une paire incomplète est ignorée, avec un `console.warn` au démarrage. Lecture par `oauthClient(provider): { id: string; secret: string } | null` dans `src/server/connectors/oauth-env.ts`, jamais par `process.env` ailleurs.

### C2. Description OAuth d'un connecteur

```ts
// src/server/connectors/types.ts (T45) : champ facultatif de Connector
export type OAuthTokens = { accessToken: string; refreshToken: string | null; expiresAt: string | null; scope: string | null; raw: Record<string, unknown> };
export type OAuthSpec = {
  appKey: string;                           // nom de la variable : 'GITHUB', 'ATLASSIAN'…
  authorizeUrl: string;                     // https, hôte fixe
  tokenUrl: string;                         // https, hôte fixe
  scopes: string[];
  scopeSeparator?: ' ' | ',';               // ' ' par défaut
  pkce: boolean;                            // S256
  clientAuth: 'body' | 'basic';             // façon d'envoyer l'identifiant et le secret à tokenUrl
  tokenBody?: 'form' | 'json';              // 'form' par défaut
  extraAuthorizeParams?: Record<string, string>; // audience, prompt, owner, access_type…
  preFields: string[];                      // champs non secrets demandés avant le clic (ex. ['repos'])
  // Configuration complète du connecteur, à partir des jetons et des champs saisis avant le clic.
  toConfig(tokens: OAuthTokens, preFields: Record<string, unknown>, http: ConnectorHttp): Promise<Record<string, unknown>>;
};
// Connector<Config> gagne : oauth?: OAuthSpec
```

La configuration d'une connexion OAuth porte `authMode: 'oauth'`, `accessToken`, `refreshToken`, `expiresAt` (secrets : `accessToken`, `refreshToken`), plus ce que rend `toConfig`. Le `configSchema` de chaque connecteur à bouton accepte les deux formes (union discriminée sur `authMode`, `'key'` par défaut pour les connexions existantes) ; `sync` et `verify` lisent le jeton d'accès quelle que soit la forme.

### C3. Socle OAuth (`src/server/connectors/oauth.ts`, `oauth-cookie.ts`, `oauth-routes.ts`, T45)

```ts
export const OAUTH_COOKIE = 'leon_oauth';
export const OAUTH_COOKIE_MAX_AGE = 600;   // secondes
export type OAuthPending = { provider: ProviderId; userId: string; tenantId: string; state: string; verifier: string | null; since: '7' | '30' | '90' | '365'; preFields: Record<string, unknown>; reconnectId: string | null; createdAt: number };
export function sealPending(p: OAuthPending): string;                   // JSON en base64url + HMAC-SHA256 (BETTER_AUTH_SECRET)
export function openPending(cookie: string, now: number): OAuthPending | null; // signature fausse ou plus de 10 min → null
export function redirectUri(provider: ProviderId): string;              // `${BETTER_AUTH_URL}/api/v1/connexions/oauth/${provider}/retour`
export function authorizeUrl(spec: OAuthSpec, client: { id: string }, p: OAuthPending): string;
export async function exchangeCode(spec: OAuthSpec, client: { id: string; secret: string }, code: string, verifier: string | null, http: ConnectorHttp): Promise<OAuthTokens>;
export async function refreshTokens(spec: OAuthSpec, client: { id: string; secret: string }, refreshToken: string, http: ConnectorHttp): Promise<OAuthTokens>;
export class OAuthRefreshRefusedError extends Error {}
// Avant chaque passage (appelée par runConnectorSync) : renouvelle si expiresAt < maintenant + 5 min, enregistre, renvoie la config à jour.
export async function ensureFreshTokens(ctx: TenantContext, connection: LoadedConnection, connector: AnyConnector, deps: { fetchImpl?: typeof fetch; now?: () => Date }): Promise<Record<string, unknown>>;
```

Routes, montées dans l'app Hono sous `/v1/connexions/oauth`, avec la session Better Auth (pas le jeton d'appareil) :

- `GET /:provider/debut?since=30&<champs avant le clic>&reconnect=<id>` : outil inconnu, sans `oauth` ou sans appli configurée → 404 ; session absente → redirection vers `/connexion` ; champs validés par le `configSchema` partiel du connecteur (`preFields`) ; pose le cookie ; 302 vers `authorizeUrl`.
- `GET /:provider/retour?code=…&state=…` (ou `error=…`) : vérifications de la spec ; `exchangeCode` ; `toConfig` ; `verify` ; `createConnection` (ou, avec `reconnectId`, remplacement des secrets de cette connexion, qui repasse `active` avec une échéance maintenant) ; efface le cookie ; 302 vers `/connexions?branche=<outil>` ou `/connexions?erreur=<code>`. Codes : `annule`, `expire`, `refuse`, `indisponible`, `admin` (Outlook). Aucun détail de l'éditeur dans l'adresse.

Fonction de `connections.ts` à ajouter : `saveOAuthTokens(ctx, id, config)` (rechiffre le bloc secret, met à jour `secret_hint`).

## Tâches

### T45 · Socle OAuth

- **Modèle** sonnet, effort high · **Sensible** oui
- **Fichiers** — créer : `src/server/connectors/oauth-env.ts`, `oauth-env.test.ts`, `oauth-cookie.ts`, `oauth-cookie.test.ts`, `oauth.ts`, `oauth.test.ts`, `oauth-routes.ts`, `oauth-routes.db.test.ts`, `src/test/fake-oauth-connector.ts` ; modifier : `src/server/connectors/types.ts`, `src/server/connectors/connections.ts` (+ test), `src/server/connectors/sync.ts` (+ test), `src/server/api/app.ts`, `.env.example`.

- [ ] 1. Tests d'abord, `oauth-env.test.ts` : paire complète → client ; paire incomplète → null ; outil sans variables → null.
- [ ] 2. Tests d'abord, `oauth-cookie.test.ts` : aller-retour ; signature modifiée → null ; 601 s plus tard → null ; contenu illisible → null ; le cookie ne contient aucun secret d'appli.
- [ ] 3. Tests d'abord, `oauth.test.ts` (avec `fakeFetch`) : `authorizeUrl` porte `client_id`, `redirect_uri`, `response_type=code`, `state`, les droits joints par le séparateur, `code_challenge` (S256 du vérificateur) et `code_challenge_method=S256` si `pkce`, et les paramètres en plus ; `exchangeCode` envoie le code, `redirect_uri`, le vérificateur, le secret en corps ou en Basic selon `clientAuth`, en formulaire ou en JSON selon `tokenBody`, et lit `access_token`, `refresh_token`, `expires_in` (→ `expiresAt`), `scope` ; réponse sans `access_token` → erreur sans corps dans le message ; `refreshTokens` 400 ou 401 → `OAuthRefreshRefusedError` ; `ensureFreshTokens` : expire dans 2 min → renouvelle et appelle `saveOAuthTokens` **avant** de rendre la config ; expire dans 1 h → ne fait rien ; connexion à clé → ne fait rien.
- [ ] 4. `oauth-env.ts`, `oauth-cookie.ts` (comparaison de signature par `timingSafeEqual`), `oauth.ts`. `types.ts` : `OAuthSpec`, `OAuthTokens`, `oauth?` sur `Connector`.
- [ ] 5. `connections.ts` : `saveOAuthTokens`. `sync.ts` : `ensureFreshTokens` avant `connector.sync` ; `OAuthRefreshRefusedError` → `auth_error` avec « Reconnectez <outil> : l'autorisation a expiré. ». Tests mis à jour.
- [ ] 6. Tests d'abord, `oauth-routes.db.test.ts` (connecteur factice à bouton, éditeur simulé par `fakeFetch`, session de test) : `/debut` sans session → redirection vers `/connexion` ; outil sans appli → 404 ; `/debut` valide → 302 vers l'éditeur et cookie posé ; `/retour` correct → connexion créée (secret chiffré, `authMode: 'oauth'`, `JSON.stringify` de `listConnections` sans le jeton), cookie effacé, 302 vers `?branche=` ; `state` différent, cookie absent, cookie d'un autre utilisateur, cookie de plus de 10 min, `error=access_denied` → 302 vers `?erreur=…`, aucune connexion ; deux `/debut` successifs puis le retour du premier → `expire` ; `reconnect=<id>` → mêmes id, nouveaux jetons, statut `active`.
- [ ] 7. `oauth-routes.ts`, montage dans `app.ts`. `.env.example` : les 16 paires, vides, avec un commentaire qui renvoie au guide.
- [ ] 8. Tests (hors sandbox), typecheck, lint, build de vérification. Commit.

### T46 · Interface : le bouton

- **Modèle** sonnet · **Dépend de** T45 · **Sensible** oui
- **Fichiers** — modifier : `src/server/connectors/catalog.ts` (+ test : `oauthReady: boolean` = connecteur avec `oauth` et `oauthClient` non nul ; `keyAccepted: boolean`), `src/components/connection-panel.tsx` (+ test), `src/app/(app)/connexions/page.tsx`.

- [ ] 1. Tests d'abord : avec `oauthReady`, le panneau montre « Se connecter avec <outil> » en premier, précédé des champs `preFields` et du choix de période ; « ou coller une clé » dépliant si `keyAccepted` ; sans `oauthReady`, seulement le formulaire de clé ; une connexion OAuth propose « Reconnecter » à la place de « Remplacer la clé ».
- [ ] 2. Le bouton est un lien vers `/api/v1/connexions/oauth/<outil>/debut?…` construit par `URLSearchParams` (pas de server action : c'est une navigation).
- [ ] 3. `page.tsx` lit `branche` et `erreur` dans l'adresse et affiche le message (« Linear est branché. La première synchronisation démarre dans la minute. » ; `annule` : « Connexion à <outil> annulée. » ; `expire` : « Le lien a expiré, recommencez. » ; `refuse` : « <outil> a refusé l'autorisation. » ; `indisponible` : « <outil> ne répond pas, réessayez dans un moment. » ; `admin` : le message d'Outlook avec le lien d'accord administrateur).
- [ ] 4. Tests, typecheck, lint, build. Commit.

### T47 · Quatre nouveaux outils dans les listes

- **Modèle** sonnet · **Sensible** non
- **Fichiers** — créer : `src/server/db/migrations/0009-connecteurs-oauth.sql`, les dossiers `basecamp/`, `miro/`, `productboard/`, `outlook/` (bouchons comme en T03) ; modifier : `src/capture/turn.ts` (`PROVIDER_IDS` + `basecamp`, `miro`, `productboard`, `outlook`), `src/lib/providers.ts` (libellés « Basecamp », « Miro », « Productboard », « Outlook » ; familles : projet, projet, projet, et une nouvelle famille `mails` « Mails et agenda » pour Outlook), `src/server/connectors/registry.ts`, `src/server/connectors/catalog.ts` (ordre des familles), les tests qui comptent les 35 outils.
- [ ] 1. Migration : supprime et recrée `connections_provider_check`, `sources_kind_check`, `facts_source_kind_check` avec les listes complètes. Test db : une source `kind = 'outlook'` s'insère.
- [ ] 2. Le reste, tests, typecheck, lint. Commit.

### T48 à T61 · Le bouton, outil par outil

Chaque tâche ne touche que le dossier de l'outil et suit ces étapes :

- [ ] 1. Lire la doc OAuth officielle de l'éditeur (adresses d'autorisation et de jeton, droits en lecture, PKCE, façon d'envoyer le secret, durée des jetons, rafraîchissement, paramètres en plus) ; noter les URL et la date en tête de `oauth.ts` du dossier.
- [ ] 2. Tests d'abord : la description `oauth` (adresses exactes, droits, PKCE, `clientAuth`, `preFields`) ; `toConfig` à partir d'une réponse de jeton d'exemple tirée de la doc ; `configSchema` accepte la forme `oauth` et l'ancienne forme à clé ; `verify` et `sync` envoient le jeton OAuth avec le bon en-tête (souvent `Bearer`, parfois autre chose : suivre la doc) ; les tests existants du connecteur restent verts.
- [ ] 3. Implémenter `oauth.ts` (la description) et l'adapter dans `connector.ts`. Mettre à jour `catalog.ts` (`keyHelp` inchangé pour la clé ; ajouter `oauthHelp` : ce que l'utilisateur verra chez l'éditeur).
- [ ] 4. Tests, typecheck, lint. Commit « Txx · Bouton <Outil> (à vérifier) ».

| Tâche | Outil | Particularités à vérifier dans la doc |
|---|---|---|
| T48 | GitHub | Appli OAuth (pas GitHub App) ; droits `repo` en lecture seule n'existent pas : prendre `repo` (dire dans `oauthHelp` que GitHub ne propose pas plus étroit) ou `public_repo` ; `preFields: ['repos']` ; jeton sans expiration ; `Accept: application/json` à l'échange |
| T49 | Notion | Intégration publique ; `owner=user` ; secret en Basic ; l'utilisateur choisit les pages pendant l'autorisation ; jeton sans expiration |
| T50 | Linear | `actor=user` ; droits `read` ; jeton OAuth en `Bearer` (la clé personnelle sans `Bearer`) ; rafraîchissement si la doc actuelle en donne |
| T51 | GitLab | gitlab.com ; droits `read_api` ; PKCE ; jeton de 2 h et rafraîchissement ; `preFields: ['projects']` |
| T52 | Jira et Confluence | Une seule description (`appKey: 'ATLASSIAN'`) dans `jira/oauth.ts`, que `confluence/connector.ts` importe : seule exception à « un connecteur ne touche que son dossier », documentée ; `audience=api.atlassian.com`, `prompt=consent`, `offline_access` ; jetons tournants ; `toConfig` lit `https://api.atlassian.com/oauth/token/accessible-resources` et garde `cloudId` et `site` ; les appels passent par `api.atlassian.com/ex/jira/<cloudId>/…` et `…/ex/confluence/<cloudId>/…` au lieu de `<site>.atlassian.net` ; `preFields: ['site']` facultatif (point de vigilance 4) ; droits Jira `read:jira-work read:jira-user`, Confluence ceux de la doc pour lire pages et commentaires |
| T53 | Asana | PKCE ; jeton d'1 h et rafraîchissement ; droits en lecture (`tasks:read`, `projects:read`, `stories:read`… selon la doc) |
| T54 | ClickUp | Pas de droits à choisir ; jeton sans expiration ; en-tête `Authorization` sans `Bearer` (vérifier) |
| T55 | monday.com | Droits `boards:read`, `updates:read`, `me:read` ; jeton sans expiration |
| T56 | Airtable | PKCE obligatoire ; secret en Basic ; droits `data.records:read`, `schema.bases:read`, `data.recordComments:read` ; rafraîchissement ; `preFields: ['bases']` facultatif (vide = toutes les bases autorisées pendant l'autorisation) |
| T57 | HubSpot | Appli publique non listée ; droits CRM en lecture (notes, appels, réunions, e-mails, contacts, entreprises, affaires, propriétaires) ; jeton de 30 min et rafraîchissement |
| T58 | Help Scout | Flux par code d'autorisation (en plus du flux « identifiant + secret » existant) ; jeton de 2 h et rafraîchissement |
| T59 | Attio | Droits en lecture ; `warning` : « Revue d'Attio au-delà de 25 espaces » |
| T60 | Outlook (nouveau, connecteur complet selon la recette R1 du plan des connecteurs + bouton) | Microsoft Graph, locataire `organizations` ; PKCE ; droits `offline_access User.Read Mail.Read Calendars.Read` ; nature `fil` pour les fils de courrier (`conversationId`, messages des 30 derniers jours par `receivedDateTime`, corps en texte : en-tête `Prefer: outlook.body-content-type="text"`), nature `reunion` pour les événements d'agenda (objet, participants, description) ; erreur de consentement (`AADSTS65001` ou `consent_required`) → `erreur=admin` (point de vigilance 5) ; pas de clé collée (`keyAccepted: false`) |
| T61 | Basecamp, Miro, Productboard (nouveaux, trois connecteurs complets selon R1 + bouton, une tâche par outil : T61a, T61b, T61c) | Basecamp : `launchpad.37signals.com`, `type=web_server`, compte choisi dans `authorization.json`, messages, documents, commentaires, discussions, nature `page` ou `fil` ; Miro : tableaux, textes des éléments et commentaires si l'API les donne, nature `page` ; Productboard : notes (retours clients), nature `note`. Aucun n'accepte de clé collée dans ce jet |

### T62 · Guide des applis et intégration

- **Modèle** sonnet · **Dépend de** toutes les tâches
- **Fichiers** — créer : `docs/guides/applis-oauth.md` ; modifier : `README.md`, `docs/guides/connecteurs-verification.md` (créé par T44).

- [ ] 1. Guide : pour chacun des 16 éditeurs, où créer l'appli (lien de la console), le nom à donner (« Leon »), l'adresse de retour exacte en local, les droits à cocher, les pages demandées (confidentialité, conditions, logo), les deux variables à remplir, et ce qu'il faut activer pour que d'autres comptes l'utilisent (partage Atlassian, appli publique HubSpot, intégration publique Notion, multilocataire Microsoft). Repris des descriptions `oauth` du code, pas de mémoire.
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
| Sécurité | T45 (tests), revue de sécurité |
| Tests | T45 à T61 |
