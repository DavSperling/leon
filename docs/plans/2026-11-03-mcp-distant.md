# Le MCP distant : plan d'implémentation

3 novembre 2026 · Amos (avec Claude) · tranché par Amos le 3 novembre

> **Pour les agents :** SOUS-SKILL REQUISE : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Chaque tâche est exécutée par un sous-agent neuf qui reçoit ce plan et son identifiant de tâche, rien d'autre. Lire en entier l'en-tête, les « Règles », les « Contraintes globales », les « Décisions » et les « Contrats partagés », puis **sa** tâche. Tests d'abord (`superpowers:test-driven-development`), preuves avant de conclure (`superpowers:verification-before-completion`). Commiter **seulement ses fichiers**, ajoutés un par un (`git add <fichier>`, jamais `-A` ni `.`), en un commit « Mxx · titre ». Une erreur de type ou de lint dans un fichier qui n'est pas à soi se signale, elle ne se corrige pas.

**But :** un utilisateur branche claude.ai, Claude Desktop, ChatGPT, Claude Code, Cursor, Codex ou tout client MCP compatible OAuth à Leon en collant une seule adresse, `https://<leon>/api/mcp`. Le client ouvre Leon dans le navigateur, l'utilisateur clique « Autoriser », et le client reçoit un accès aux quatre outils de Leon, sous les droits de cet utilisateur. Chaque assistant branché apparaît dans Réglages, révocable.

**Pourquoi :** l'[étude](../etudes/mcp-distant-2026-11/README.md). Aujourd'hui `/api/mcp` ne s'ouvre qu'avec un jeton `leon_` collé dans un en-tête, ce que claude.ai, Claude Desktop et ChatGPT ne permettent pas.

**Architecture :**
- Leon devient son propre serveur d'autorisation OAuth 2.1, réduit au code d'autorisation avec PKCE S256 et au renouvellement : les métadonnées de la ressource (RFC 9728) et du serveur (RFC 8414), une page « Autoriser », une route de jetons, une route d'inscription des clients (RFC 7591).
- Les jetons sont des lignes d'`api_tokens`, au format `leon_`, rangées par une colonne `kind`. `/api/mcp` garde `requireApiToken` ; son 401 indique où sont les métadonnées. Un jeton `assistant` ne vaut que pour `/api/mcp`.
- Le code d'autorisation est signé (HMAC, clé dérivée de `BETTER_AUTH_SECRET`), pas stocké ; son usage unique tient à l'unicité de `api_tokens.grant_id`.
- Un client se fait connaître de deux façons : par l'adresse de son document (CIMD), que Leon ne lit que chez les hôtes de L11 ; ou par une inscription (DCR) qui ne stocke rien, le `client_id` rendu portant, signés, son nom et ses adresses de retour. Dans les deux cas, les adresses de retour sont limitées à celles que publient les clients de L11, et au bouclage.
- Les outils MCP ne changent pas.
- Ce plan part du lot 1 de la CLI (B3), fusionné avant lui : il en reprend `computer-code.ts` (le code signé, rendu général) et le retour après connexion (`pathAfterSignIn`).

**Stack :** celle du deuxième jet, plus le lot 1 de la CLI. Aucune dépendance nouvelle. Une migration (des colonnes sur `api_tokens`).

## Lots, PR et ordre

| Lot | Ce que ça change | Tâches | PR | Effort |
|---|---|---|---|---|
| 1. Le serveur d'autorisation | coller `https://<leon>/api/mcp` dans claude.ai, ChatGPT, Cursor, Codex… suffit | M01 à M07 | suivante | 3,5 j |
| 2. Réglages | « Assistants connectés » : l'adresse, la marche à suivre par client, les assistants branchés | M08 | suivante | 0,75 j |

Total : un peu plus de 4 jours.

**Ordre :** rien ne s'arrête côté CLI (Amos, 03/11).
1. Le lot 1 de la CLI (S01 à S05, codé sur `amos/cli-connexion-navigateur`) est poussé et fusionné tel quel. Ses lots 2 et 3 avancent sans attendre ce plan.
2. Le lot 1 de ce plan part de main après cette fusion. Il touche les mêmes fichiers (`api-tokens.ts`, `app.ts`, `api-contract.ts`, `computer-code.ts`, `connexion/page.tsx`, `actions.ts`) : on ne le commence pas avant.
3. Le lot 2 de ce plan et le lot 3 de la CLI touchent tous deux `src/app/(app)/reglages/page.tsx` et `tokens.tsx` : l'un après l'autre, le second se rebase.

**Une PR par lot**, conformément au CLAUDE.md. L'étude et ce plan sont partis dans leur propre PR, sans code (#121) ; Amos a tranché B1 à B7 le 03/11.

## Règles propres à ce chantier

- **Un seul modèle de jetons**, `api_tokens`, au format `leon_` d'aujourd'hui (`API_TOKEN_PATTERN`). Pas de JWT, pas de clé de signature en base, pas de table de jetons à part.
- **Aucune dépendance nouvelle.** `node:crypto` (HMAC, HKDF, SHA-256, `timingSafeEqual`), `zod`, Hono, les pages Next.js. Ni `@better-auth/mcp`, ni `@better-auth/cimd`, ni `@better-auth/oauth-provider`, ni montée de version de Better Auth.
- **Le moins d'OAuth possible.** Le code d'autorisation avec PKCE S256 et le renouvellement, rien d'autre : ni flux implicite, ni mot de passe, ni `client_credentials`, ni OpenID Connect, ni flux d'appareil.
- **Le serveur ne suit jamais une adresse qu'il n'a pas vérifiée.** Une adresse de retour est comparée caractère par caractère à celles de l'inscription du client (sauf le port d'une adresse de bouclage, RFC 8252). Un `client_id` ou une adresse de retour invalide affiche une erreur, sans jamais rediriger.
- **Les droits sont ceux de l'interface.** Un outil MCP ne lit la base que par le `TenantContext` que rend `verifyApiToken`, sous la RLS. Aucun outil ne construit son propre contexte.
- **Les secrets ne se montrent jamais.** Jeton d'accès, jeton de renouvellement et `code_verifier` n'apparaissent que dans le corps des requêtes et réponses HTTPS et dans l'en-tête `Authorization`. Jamais dans une adresse, un journal ni un message d'erreur. Seules leurs empreintes SHA-256 sont en base.
- **Langue :** les métadonnées, les erreurs OAuth et les réponses du MCP sont en anglais (le protocole, et la langue de base). Les pages ont leurs textes dans `messages/en.json` et `messages/fr.json`. Les routes suivent l'usage de main (`/oauth/autoriser`, `/api/oauth/jeton`).
- **Journaux :** `logError` et des compteurs seulement. Jamais un jeton, une empreinte, un code, un `state`, un `code_verifier`, ni le nom d'un client.
- **Vérifications** (méthode d'Amos) :
  - après chaque tâche, un validateur ;
  - avant chaque PR, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` et `pnpm test:db` (hors sandbox), puis l'audit `auditing-runtime-contracts` et la revue `security-review` ;
  - il n'y a pas de CI.
- **Raccourcis :** tout raccourci connu porte un commentaire `shortcut: <la limite>, <quand passer à mieux>`.

## Contraintes globales

- **Jetons des assistants :** accès 1 h ; renouvellement 90 jours, reportés à chaque usage, et changé à chaque usage (B4).
- **Code d'autorisation :** 2 minutes, usage unique.
- **Documents CIMD :** lus en HTTPS chez les hôtes de L11 seulement, sans suivre de redirection, 5 s et 16 Ko au plus ; gardés en mémoire selon leur `Cache-Control`, une heure au plus, une minute sans en-tête.
- **`code_verifier` :** 43 à 128 caractères `[A-Za-z0-9._~-]` (RFC 7636) ; `code_challenge` : 43 caractères base64url.
- **Inscription d'un client :** 4 Ko d'entrée au plus ; 1 à 5 adresses de retour de 512 caractères au plus ; nom de 1 à 80 caractères après retrait des caractères de contrôle, sinon « MCP client ».
- **Route des jetons :** 8 Ko d'entrée au plus (un `client_id` signé au maximum légal fait environ 3,7 Ko à lui seul).
- **Pas de limite par adresse IP** sur l'inscription ni sur la route des jetons : claude.ai et ChatGPT appellent depuis les adresses d'Anthropic et d'OpenAI, partagées par tous leurs utilisateurs. Les deux routes ne stockent rien et leurs secrets ne se devinent pas ; les plafonds de taille restent.
- **Un appel MCP** ne fait pas plus de requêtes qu'aujourd'hui : `verifyApiToken` lit déjà la ligne du jeton.
- **Adresses :** l'émetteur est `BETTER_AUTH_URL` sans barre finale ; la ressource est `<BETTER_AUTH_URL>/api/mcp`, exactement.

## Décisions prises pour ce plan

Amos a tranché B1 à B7 le 03/11 (voir « Questions tranchées »).

- **F1. Leon est son propre serveur d'autorisation (B2).** Pas Better Auth (`@better-auth/mcp`, `@better-auth/oauth-provider`), pas de fournisseur externe.
- **F2. Les jetons sont des lignes d'`api_tokens`**, au format `leon_`, de `kind` `manuel`, `ordinateur` ou `assistant` (L9). Le lot 1 de la CLI crée les `ordinateur` (`registerApiToken`) ; ce plan crée les `assistant`.
- **F3. Accès d'une heure, renouvellement de 90 jours changé à chaque usage (B4)**, pour les `assistant` seulement.
- **F4. Clients publics seulement.** `token_endpoint_auth_methods_supported: ["none"]`, PKCE S256 obligatoire. Une inscription qui demande un secret reçoit `none` (RFC 7591 §3.2.1 permet au serveur de remplacer une valeur) ; un document CIMD qui en demande un est lu comme public.
- **F5. DCR et CIMD (B7).** CIMD : `client_id_metadata_document_supported: true`, documents lus chez les hôtes de L11 seulement (L10). DCR : sans rien stocker (L5).
- **F6. Une liste fermée d'adresses de retour (B5)** : celles que les clients de L11 publient, chemin compris, plus le bouclage. Toute autre adresse est refusée, à l'inscription comme dans un document CIMD, même sur un hôte connu.
- **F7. Un seul périmètre, `leon`**, qui donne les quatre outils. Pas d'`offline_access` (la spécification demande de ne pas l'annoncer ; le renouvellement est donné sans lui).
- **F8. Les outils ne changent pas**, ni leur contexte : `verifyApiToken` reste la seule source du `TenantContext` d'un appel MCP.
- **F9. Audience :** un jeton `assistant` n'ouvre que `/api/mcp` ; `requireApiToken` le refuse partout ailleurs (401).
- **F10. Deux pages d'autorisation sur le même modèle (B3).** `/ordinateur/autoriser` (lot 1 de la CLI) ne change pas ; `/oauth/autoriser` en reprend la forme et le retour après connexion, et montre toujours l'hôte de retour.
- **F11. Le serveur MCP garde les deux époques du protocole** : `createMcpHandler` sans option `legacy` (son défaut, `'stateless'`), jamais `legacy: 'reject'`.
- **F12. L'extension ne change pas (B6).** Elle capte les conversations de claude.ai et de ChatGPT comme aujourd'hui, même quand l'assistant a lu Leon : Leon est du B2B, la boîte reliée est celle du travail.
- **F13. Pas d'en-têtes CORS en v1** : les clients de L11 appellent depuis leurs serveurs ou une application de bureau. À revoir si un client de navigateur (VS Code web) échoue à M07.
- **F14. Hors de ce chantier :** la révocation demandée par le client (RFC 7009) ; OpenID Connect et `/.well-known/openid-configuration` ; les jetons liés (DPoP) ; des périmètres plus fins ; un outil nouveau ; l'onboarding ; le choix de l'espace sur la page (c'est l'espace actif de la session).

## Contrats partagés

Dans les exemples, `https://leon.example` est `BETTER_AUTH_URL`.

**L1. Les métadonnées de la ressource** (RFC 9728) : `GET /.well-known/oauth-protected-resource/api/mcp` et `GET /.well-known/oauth-protected-resource`, même contenu :

```json
{ "resource": "https://leon.example/api/mcp", "authorization_servers": ["https://leon.example"],
  "scopes_supported": ["leon"], "bearer_methods_supported": ["header"], "resource_name": "Leon" }
```

**L2. Le 401 de `/api/mcp`** :

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://leon.example/.well-known/oauth-protected-resource/api/mcp", scope="leon"
```

Les autres routes à jeton gardent `WWW-Authenticate: Bearer`. Un jeton `assistant` présenté ailleurs que sur `/api/mcp` reçoit le même 401 qu'un jeton inconnu (F9).

**L3. Les métadonnées du serveur d'autorisation** (RFC 8414) : `GET /.well-known/oauth-authorization-server` :

```json
{ "issuer": "https://leon.example",
  "authorization_endpoint": "https://leon.example/oauth/autoriser",
  "token_endpoint": "https://leon.example/api/oauth/jeton",
  "registration_endpoint": "https://leon.example/api/oauth/clients",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["leon"],
  "authorization_response_iss_parameter_supported": true,
  "client_id_metadata_document_supported": true }
```

Claude ne passe par CIMD que si le document annonce à la fois `client_id_metadata_document_supported: true` et `"none"` dans `token_endpoint_auth_methods_supported` : les deux y sont.

`issuer` est exactement l'origine qui sert ce document (la spécification du 2026-07-28 fait refuser un document dont l'`issuer` diffère). Les aides du SDK MCP déjà installé (`oauthMetadataResponse`, `buildOAuthProtectedResourceMetadata`, `bearerAuthChallengeResponse`) servent L1 à L3 si leur sortie est exactement celle-ci ; sinon, trois objets écrits à la main.

**L4. L'inscription** : `POST /api/oauth/clients` (`application/json`, 4 Ko au plus, sans session ni jeton).
- entrée : `redirect_uris` (1 à 5, chacune de 512 caractères au plus, et permise par L11), `client_name` (facultatif), `token_endpoint_auth_method`, `grant_types`, `response_types`, `application_type` et les autres champs de RFC 7591 acceptés et ignorés ;
- `grant_types` qui ne contient pas `authorization_code`, ou `response_types` autre que `code` : `400 { "error": "invalid_client_metadata" }` ; une adresse de retour refusée : `400 { "error": "invalid_redirect_uri" }` ;
- réponse `201` :

```json
{ "client_id": "<L5>", "client_id_issued_at": 1793700000, "client_name": "Claude",
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
  "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
  "token_endpoint_auth_method": "none" }
```

**L5. Le `client_id` d'une inscription (DCR)** : `signPayload('oauth-client', { "v": 1, "n": <nom nettoyé>, "r": [<adresses de retour>], "i": <secondes epoch> })` (M02), sans expiration. Le lire, c'est le vérifier : un `client_id` dont la signature ne passe pas est inconnu. Rien n'est stocké ; `client_host` (L9) est l'hôte de la première adresse de retour, ou `127.0.0.1` pour le bouclage.

`shortcut: un client_id ne se révoque pas (rien n'est stocké) ; les jetons, si. Une table oauth_clients le jour où il faudra bannir un client.`

**L6. La page d'autorisation** : `GET /oauth/autoriser?response_type=code&client_id=…&redirect_uri=…&state=…&code_challenge=…&code_challenge_method=S256&scope=leon&resource=…`.

Dans cet ordre :
1. `client_id` (L5 ou L10) et `redirect_uri` sont vérifiés d'abord. `redirect_uri` doit être l'une des adresses de l'inscription ou du document, caractère par caractère ; pour une adresse de bouclage (`http://127.0.0.1[:<port>]/…` ou `http://localhost[:<port>]/…`), seul le port peut différer, y compris absent d'un côté (RFC 8252 §7.3). Si `redirect_uri` manque et que l'inscription n'en a qu'une, c'est elle. Un échec ici affiche une erreur, **sans rediriger** (RFC 6749 §4.1.2.1).
2. Ensuite, toute erreur renvoie vers `redirect_uri` avec `error`, `state` et `iss` : `unsupported_response_type` (autre que `code`), `invalid_request` (`code_challenge` absent ou mal formé, méthode autre que `S256`, `state` de plus de 512 caractères), `invalid_scope` (autre chose que `leon`, ou vide, qui vaut `leon`), `invalid_target` (un `resource` autre que la ressource de L1).
3. Sans session : `/connexion`, puis retour sur la même page, comme `/ordinateur/autoriser` (lot 1 de la CLI) ; sans espace, `/bienvenue`.
4. La page dit : « Autoriser <nom du client> à lire votre mémoire Leon dans l'espace <espace> ? », puis, en évidence, « Vous serez renvoyé vers <hôte de retour> », la liste de ce que l'assistant pourra faire (chercher, lire, le point du matin, garder une note), et l'avertissement « Si vous n'êtes pas en train de brancher un assistant vous-même, refusez. » Le nom vient du document CIMD, ou de l'inscription (alors « nom déclaré »).
5. « Autoriser » renvoie vers `redirect_uri?code=<L7>&state=<state>&iss=<émetteur>` ; « Refuser » vers `redirect_uri?error=access_denied&state=<state>&iss=<émetteur>`. Les paramètres sont ajoutés à ceux que `redirect_uri` porte déjà, par `URL` et `searchParams`, jamais par concaténation.

La page n'est jamais affichée dans un cadre (`frame-ancestors 'none'`, déjà dans `next.config.ts`).

**L7. Le code d'autorisation** : `signPayload('oauth-code', charge)` (M02), avec la charge `{ "v": 1, "j": <16 octets aléatoires, base64url>, "c": <SHA-256 du client_id, hex>, "r": <redirect_uri exacte>, "p": <code_challenge>, "u": <userId>, "t": <tenantId>, "x": <expiration, secondes epoch> }`, expiration à 2 minutes. `j` devient `grant_id` : l'usage unique tient à son unicité en base.

**L8. `POST /api/oauth/jeton`** (`application/x-www-form-urlencoded`, 8 Ko au plus ; pas d'en-tête `Authorization` attendu : clients publics).

- `grant_type=authorization_code` avec `code`, `redirect_uri`, `client_id`, `code_verifier` :
  - vérifie L7, puis SHA-256(`client_id`) = `c`, `redirect_uri` = `r`, base64url(SHA-256(`code_verifier`)) = `p` en temps constant, puis l'adhésion en cours de `u` à `t` (`resolveTenantContext`) ;
  - crée la ligne par `createGrant` (M01) : `kind` `assistant`, `grant_id` = `j`, `client_ref` = `c`, `client_name` et `client_host` tirés de L5 ou L10, `name` = le nom du client ;
  - rend `200 { "access_token": "leon_…", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "leon_…", "scope": "leon" }`.
- `grant_type=refresh_token` avec `refresh_token`, `client_id` : `refreshGrant` (M01), avec SHA-256(`client_id`) ; même réponse (RFC 6749 §6 : un jeton de renouvellement est lié à son client).
- Erreurs (400, JSON `{ "error": … }`) : `invalid_request`, `invalid_client` (`client_id` illisible), `invalid_grant` (tout le reste, sans dire quoi), `unsupported_grant_type`. Toutes les réponses portent `Cache-Control: no-store`.

**L9. `api_tokens`** (la migration de M01) :

```sql
alter table api_tokens
  add column kind text not null default 'manuel'
    check (kind in ('manuel', 'ordinateur', 'assistant')),
  add column client_name text,          -- le nom déclaré à l'inscription (assistant)
  add column client_host text,          -- l'hôte de l'adresse de retour (assistant), seul élément vérifié
  add column client_ref text,           -- SHA-256 du client_id : un renouvellement n'est servi qu'à ce client
  add column grant_id text unique,      -- j de L7 : un code ne sert qu'une fois
  add column expires_at timestamptz,    -- null : n'expire pas
  add column refresh_hash text unique,  -- SHA-256 du jeton de renouvellement
  add column refresh_expires_at timestamptz;
```

Pas de RLS, comme aujourd'hui : toujours filtrée par `user_id` et `tenant_id`, ou par une empreinte.

**L10. Le `client_id` d'un document (CIMD)** : une adresse `https://<hôte>/<chemin>` dont l'hôte est l'un de ceux de L11 (`https://chatgpt.com/oauth/client.json`, `https://claude.ai/oauth/claude-code-client-metadata`…).
- Leon la lit par `fetch`, avec `redirect: 'error'`, 5 s et 16 Ko au plus (contraintes globales), sans en-tête ni cookie ;
- le document doit être du JSON, avec `client_id` égal à l'adresse caractère par caractère, `client_name` et `redirect_uris` ; chaque adresse de retour doit être permise par L11, sinon le client est refusé en entier ;
- un `token_endpoint_auth_method` autre que `none` est ignoré (F4) ;
- tout échec (réseau, taille, format, hôte hors de L11) vaut « client inconnu » (L6 point 1), avec un compteur, jamais l'adresse dans un journal ;
- `client_host` est l'hôte de la première adresse de retour ; `client_ref` (L7, L9) est SHA-256 de l'adresse.

**L11. Les clients et leurs adresses de retour** (B5) : `src/server/oauth/clients.ts`, une constante. Ce sont les adresses que chaque client publie dans sa documentation, pas ses hôtes : un autre chemin du même hôte (une redirection ouverte, l'adresse de retour d'un autre service) ne doit jamais recevoir un code.

| Client | Adresse de retour permise à l'inscription |
|---|---|
| Claude (claude.ai, Desktop, mobile) | `https://claude.ai/api/mcp/auth_callback`, exactement |
| ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect`, exactement ; ou `https://chatgpt.com/connector/oauth/<id>`, où `<id>` est un seul segment `[A-Za-z0-9_-]{1,128}` |
| Cursor (web) | `https://www.cursor.com/agents/mcp/oauth/callback`, exactement |
| VS Code | `https://vscode.dev/redirect` et `https://insiders.vscode.dev/redirect`, exactement |
| Antigravity | `https://antigravity.google/oauth-callback`, exactement |
| Claude Code, Codex, Cursor, VS Code, Gemini CLI (bureau) | `http://127.0.0.1[:<port>]/<chemin>`, `http://localhost[:<port>]/<chemin>` (le document CIMD de Claude Code annonce `http://localhost/callback`, sans port) |

- « exactement » : schéma, hôte, port (443), chemin, sans requête ni fragment, comparés caractère par caractère ;
- le bouclage : `http` seulement, port facultatif et quelconque, chemin quelconque (le code n'y arrive que sur l'ordinateur de la victime), ni identifiant ni mot de passe dans l'adresse, pas de fragment ; une adresse s'écrit sous sa forme canonique (`new URL(v).href === v`) ;
- aucun autre schéma (`javascript:`, `data:`, schémas d'application) ;
- un document CIMD (L10) n'est lu que chez les hôtes de cette table ;
- une adresse de plus, c'est une ligne de cette constante, recopiée de la documentation du client, et son essai réel (M07). Le format de `<id>` chez ChatGPT se vérifie à M07.

## Points de vigilance

1. **Avec DCR, un nom de client est déclaré, pas vérifié** (avec CIMD, il vient du document du client). N'importe qui peut s'inscrire sous le nom « Claude ». Parade : la page montre l'hôte de retour, et les adresses de retour sont limitées à celles que publient les clients de L11 (B5) : un faux « Claude » ne peut renvoyer que vers le vrai.
2. **Le consentement par hameçonnage.** Un attaquant lance lui-même un parcours, garde le `code_verifier`, et envoie le lien d'autorisation à sa victime : si elle clique « Autoriser », le code part vers l'adresse de retour inscrite. Parade : seules les adresses de retour publiées de L11, chemin compris, et le bouclage. Un autre chemin d'un hôte connu (une redirection ouverte, l'adresse de retour d'un autre service) est refusé à l'inscription. Avec un retour en bouclage, le code arrive sur l'ordinateur de la victime, où rien de l'attaquant n'attend. Avec un client connu (claude.ai, chatgpt.com…), il arrive dans le navigateur de la victime, chez un client qui lie `state` à la session qui a commencé le parcours : l'attaquant ne le reçoit pas. Plus l'avertissement de la page. Sans la liste fermée, l'attaquant inscrirait sa propre adresse et recevrait le code.
3. **Le bouclage** : n'importe quel programme de l'ordinateur peut écouter un port et se faire passer pour un client (la spécification le rappelle). Parade : pour un retour en bouclage, la page dit « Vous serez renvoyé vers une application de cet ordinateur » et répète l'avertissement.
4. **Deux renouvellements en même temps** pour un même branchement : le second échoue (`invalid_grant`) et l'assistant redemande l'autorisation. Better Auth tolère un renouvellement rejoué pendant 30 s pour cette raison. `shortcut: pas de tolérance en v1 ; garder l'ancienne empreinte de renouvellement 30 s si M07 ou l'usage montre des reconnexions.`
5. **claude.ai et ChatGPT appellent depuis leurs serveurs.** `pnpm dev` ne leur est pas joignable ; Claude exige une adresse publique en IPv4. Parade : M07 contre la production, après déploiement ; Claude Code et Codex se vérifient d'abord en local (retour en bouclage).
6. **L'adresse à coller** doit être exactement `<BETTER_AUTH_URL>/api/mcp` : Claude compare `resource` à ce que l'utilisateur a tapé. Parade : le bouton Copier de Réglages (M08).
7. **Le protocole du 2026-07-28** fait échouer les clients plus anciens face à un serveur qui ne parle que lui. Parade : F11, et `mcp.db.test.ts` garde un appel `initialize` de l'époque 2025.
8. **Un membre retiré ou un compte supprimé** : `verifyApiToken` et `refreshGrant` revérifient l'adhésion à chaque appel ; ses assistants s'arrêtent à l'appel suivant.
9. **Plusieurs espaces** : le jeton suit l'espace actif au moment de « Autoriser », que la page nomme. Pour changer d'espace, on change d'espace dans Leon puis on rebranche l'assistant.
10. **La connexion sociale** (Google, Microsoft, GitHub, sur la branche `claude/fast-auth-providers-82f1ca`) : quand elle arrivera, son retour devra revenir sur `/oauth/autoriser` et `/ordinateur/autoriser` avec la demande, comme la connexion par mot de passe (M05).
11. **Conflits** : ce plan part de main après la fusion du lot 1 de la CLI, qui touche `api-tokens.ts`, `app.ts`, `api-contract.ts`, `computer-code.ts`, `connexion/page.tsx`, `actions.ts` et `auth-form.tsx`. La #119 (fusionnée le 03/11) a changé `signInAction` (double authentification, adresse non vérifiée) : le lot 1 de la CLI en est parti. Ce plan ne touche aucun outil MCP : pas de conflit avec T25 du plan mémoire.
12. **Les journaux** : le `client_id` (L5) contient le nom déclaré et les adresses de retour ; l'adresse d'un document (L10) aussi peut être longue. Ni l'un ni l'autre n'est journalisé, comme les jetons.
13. **Un document CIMD qui change** : Leon le relit à l'expiration de son cache (une heure au plus). Une adresse de retour retirée du document cesse de valoir dès la relecture ; les jetons déjà donnés restent, révocables dans Réglages.
14. **ChatGPT peut déclarer `private_key_jwt`** dans son document CIMD. Leon ne propose que `none` (L3) ; la documentation d'OpenAI donne `none` comme possible. À vérifier à M07 que ChatGPT s'y range.

## Lot 1 : le serveur d'autorisation

### M01 · Les sortes de jetons

**Fichiers :** `src/server/db/migrations/0047-jetons-assistants.sql` (nouveau ; le prochain numéro libre le jour de la tâche) et son test `.db.test.ts`, `src/server/db/schema/api-tokens.ts`, `src/server/auth/api-tokens.ts` (`verifyApiToken`, `listApiTokens`, `registerApiToken`, `createGrant`, `refreshGrant`), `src/server/api/require-api-token.ts` (F9), `src/server/auth/api-tokens.db.test.ts`, `src/server/api/require-api-token.db.test.ts`.

**Fait quand :**
- la migration applique L9 ; les lignes existantes valent `manuel`, sauf celles du lot 1 de la CLI (nom en « Ordinateur : … »), qui passent à `ordinateur` ;
- `registerApiToken` (S01 de la CLI) écrit `kind = 'ordinateur'` ;
- `verifyApiToken` refuse un jeton dont `expires_at` est passé, garde toutes ses autres conditions, et rend aussi le `kind` ;
- `requireApiToken` refuse un jeton `assistant` (401, même réponse qu'un jeton inconnu), sauf monté avec l'option qui l'accepte, que seul `/api/mcp` passe (F9) ;
- `listApiTokens` rend aussi `kind`, `clientName` et `clientHost` ;
- `createGrant(ctx, { grantId, clientRef, clientName, clientHost, name })` insère la ligne d'un assistant branché (L8, `kind = 'assistant'`) et rend son jeton d'accès et son jeton de renouvellement en clair, une seule fois. Si `grant_id` existe déjà (code servi deux fois), il révoque la ligne existante et rend `null`, sans lever ;
- `refreshGrant(refreshToken, clientRef)` change les deux empreintes et les deux expirations en une seule requête (`update … where refresh_hash = … returning`), à condition que la ligne ne soit pas révoquée, que le renouvellement n'ait pas expiré, que `client_ref` soit le même et que l'adhésion soit en cours (`currentMembership`). Sinon `null`.

**Tests :** un jeton `assistant` est refusé par `/api/v1/me`, `/api/v1/ingest` et `/api/v1/briefing`, et accepté par `/api/mcp` ; un accès expiré est refusé par `verifyApiToken` ; après un renouvellement, l'ancien accès et l'ancien renouvellement sont refusés, les nouveaux passent ; une ligne révoquée ne se renouvelle plus ; un membre retiré ne se renouvelle plus ; un renouvellement présenté avec un autre `client_id`, même du même hôte, rend `null` ; un `grant_id` servi deux fois révoque la ligne et rend `null` ; `createApiToken` donne toujours un `manuel` et `registerApiToken` un `ordinateur`, sans expiration, qui ouvrent `/api/v1/*` comme avant ; aucun jeton en clair en base.

### M02 · Les signatures

**Fichiers :** `src/server/auth/computer-code.ts` (lot 1 de la CLI : `signPayload`, `verifyPayload` en plus), `src/server/auth/computer-code.test.ts`.

**Fait quand :** la signature de `computer-code.ts` devient générale. `signPayload(purpose, payload)` rend `<charge>.<signature>` en base64url, avec la clé HKDF-SHA256(`BETTER_AUTH_SECRET`, sel vide, info `leon:<purpose>:v1`, 32 octets) ; `verifyPayload(purpose, value, now)` vérifie en temps constant, puis l'expiration (`x`) si la charge en a une, et rend la charge ou `null`. `signComputerCode` et `verifyComputerCode` deviennent leurs cas `purpose = 'ordinateur'` : la clé `leon:ordinateur:v1` ne change pas, ni leur contrat (K4 du plan CLI). L5 (`oauth-client`) et L7 (`oauth-code`) passent par ces deux fonctions.

**Tests :** ceux de la CLI restent verts sans changement ; aller-retour ; un octet changé : `null` ; expiré d'une seconde : `null` ; un `client_id` présenté comme code, ou un code d'ordinateur présenté comme code OAuth (autre `purpose`) : `null` ; une clé dérivée d'un autre secret : `null`.

### M03 · Les métadonnées, et le 401 du MCP

**Fichiers :** `src/server/oauth/metadata.ts` (nouveau), `src/app/.well-known/oauth-protected-resource/route.ts`, `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts`, `src/app/.well-known/oauth-authorization-server/route.ts` (nouveaux), `src/server/api/require-api-token.ts` (le défi du 401 en option), `src/server/api/mcp-routes.ts`, `src/server/oauth/metadata.contrat.test.ts` (nouveau), `src/server/api/api-contract.db.test.ts`.

**Fait quand :** L1, L2 et L3. Les trois routes rendent `application/json` avec `Cache-Control: public, max-age=3600`, sans session. `requireApiToken` garde son défi nu pour les autres routes.

**Tests :** les adresses des métadonnées sont toutes absolues et sous `BETTER_AUTH_URL` ; chaque adresse annoncée répond (contrat : la page, la route des jetons, l'inscription) ; `/api/mcp` sans jeton répond 401 avec le `resource_metadata` exact ; avec un jeton valide, rien ne change (`mcp.db.test.ts` reste vert).

### M04 · L'inscription des clients

**Fichiers :** `src/server/oauth/clients.ts` (nouveau : L11, `registerClient`, `readClientId`, `redirectAllowed`), `src/server/oauth/client-document.ts` (nouveau : la lecture de L10 et son cache), `src/server/api/oauth-routes.ts` (nouveau : la route `/oauth/clients`), `src/server/api/app.ts` (monter `oauthRoutes` sous `/oauth`), `src/server/auth/rate-limit.ts` (deux entrées dans `AUTH_LIMITS`), `src/capture/api-contract.ts` (`API_PATHS.oauthClients`), `src/test/contracts/route-guards.db.test.ts` (lot 1 de la CLI : les routes OAuth y entrent), `src/server/oauth/clients.test.ts`, `src/server/oauth/client-document.test.ts`, `src/server/api/oauth-routes.db.test.ts` (nouveaux).

**Fait quand :** L4, L5, L10 et L11. `readClientId(value)` rend `{ name, redirectUris, host, ref }` pour un `client_id` signé (L5) ou pour l'adresse d'un document (L10), sinon `null`. `redirectAllowed(clientUris, uri)` applique L6 (exact, ou bouclage au port près). Les routes OAuth ne sont pas montées derrière `requireApiToken` ni derrière la session.

**Tests :**
- inscription de Claude (`https://claude.ai/api/mcp/auth_callback`), de ChatGPT (`https://chatgpt.com/connector/oauth/abc123`), de Claude Code (`http://localhost:3118/callback`), de Cursor (ses deux adresses) : 201, et `readClientId` relit ce qui a été inscrit ;
- `https://evil.example/cb`, `https://claude.ai.evil.example/api/mcp/auth_callback`, `https://claude.ai:8443/api/mcp/auth_callback`, `http://claude.ai/api/mcp/auth_callback`, un autre chemin d'un hôte connu (`https://claude.ai/autre`, `https://chatgpt.com/connector/oauth/a/b`, `https://chatgpt.com/connector_platform_oauth_redirect?x=1`), `http://user:pw@127.0.0.1:9/cb`, `javascript:alert(1)`, une adresse avec `#` : `invalid_redirect_uri` ;
- 6 adresses, une adresse de 513 caractères, plus de 4 Ko d'entrée : 400 ;
- `token_endpoint_auth_method: "client_secret_basic"` demandé : 201 avec `none` ;
- un `client_id` dont un caractère a changé : `null` ;
- le nom nettoyé : caractères de contrôle retirés, coupé à 80, vide devient « MCP client » ;
- la limite par adresse IP répond 429 au-delà de son plafond ;
- CIMD, avec un faux `fetch` : le document de ChatGPT (`https://chatgpt.com/oauth/client.json`) est lu et relu depuis le cache sans nouvel appel ; un `client_id` sur un hôte hors de L11 (`https://evil.example/client.json`, `https://127.0.0.1/c.json`) n'est jamais lu ; une redirection, un document de plus de 16 Ko, une réponse au-delà de 5 s, un JSON invalide, un `client_id` différent de l'adresse, une adresse de retour hors de L11 dans le document : `null`.

### M05 · La page d'autorisation

**Fichiers :** `src/server/oauth/authorize.ts` (nouveau : `parseAuthorizeRequest`, `oauthAuthorizePath`), `src/app/(auth)/oauth/autoriser/page.tsx`, `src/app/(auth)/oauth/autoriser/actions.ts` (nouveaux), `src/server/auth/computer-authorize.ts` (lot 1 de la CLI : `pathAfterSignIn` reconnaît aussi la demande OAuth), `src/app/(auth)/connexion/page.tsx` (le `returnTo` d'une demande OAuth), `messages/en.json`, `messages/fr.json`, `src/test/contracts/page-links.test.ts`, leurs tests.

**Fait quand :** L6. En particulier :
- `parseAuthorizeRequest(params)` rend `{ erreur: 'client' | 'retour' }` (page d'erreur, aucune redirection), `{ erreur: <code OAuth>, retour }` (redirection avec `error` et `state`), ou la demande validée ;
- sans session, la page renvoie vers `/connexion` avec la demande, comme `/ordinateur/autoriser`. `/connexion` reconnaît une demande OAuth valide et la passe à `AuthForm` en `returnTo` ; `pathAfterSignIn` la revalide entièrement, à l'aller comme au retour, double authentification comprise (`verifyTwoFactorAction`). Le chemin rendu est rebâti à partir de la demande validée, jamais copié. Une adresse non vérifiée affiche le message de la #119 (`verifyFirst`), sans rien autoriser ;
- « Autoriser » et « Refuser » sont des actions serveur (POST, même origine) qui revalident tout, relisent la session et l'espace (`getUserContext`), puis signent L7 ou rendent `access_denied` ;
- la page dit le nom du client **et** l'hôte de retour.

**Tests :** sans session, connexion avec et sans double authentification : retour sur la même demande ; un `retour` trafiqué (autre chemin, `client_id` changé) mène à l'accueil ; `client_id` inconnu ou mal signé : page d'erreur, aucune redirection ; adresse de retour absente de l'inscription : page d'erreur ; `response_type` autre que `code`, `code_challenge_method` autre que `S256`, `code_challenge` absent, `resource` étranger, `scope` inconnu : redirection avec l'erreur et le `state` ; le code produit se vérifie (M02) et porte l'empreinte PKCE reçue ; un `redirect_uri` de bouclage avec un autre port est accepté, un autre hôte non ; les textes en anglais et en français.

### M06 · La route des jetons

**Fichiers :** `src/server/api/oauth-routes.ts` (la route `/oauth/jeton` ; M04 a créé le fichier), `src/capture/api-contract.ts` (`API_PATHS.oauthJeton`), `src/server/api/oauth-routes.db.test.ts`.

**Fait quand :** L8, pour `authorization_code` et `refresh_token`. Les erreurs suivent RFC 6749 §5.2, avec `Cache-Control: no-store` sur toutes les réponses.

**Tests :**
- parcours complet : inscription, page, code, jeton ; le jeton ouvre `/api/mcp` (`tools/list` rend les quatre outils) ;
- `code_verifier` faux, `redirect_uri` différent, `client_id` différent, code expiré : `invalid_grant`, aucune ligne ;
- le même code deux fois : la seconde fois `invalid_grant`, et le jeton de la première ne marche plus ;
- membre retiré entre la page et l'échange : `invalid_grant` ;
- renouvellement : nouveaux jetons, l'ancien renouvellement refusé ensuite ;
- `grant_type=password` ou `client_credentials` : `unsupported_grant_type` ;
- une entrée de plus de 4 Ko : 400 ; JSON au lieu du formulaire : 400 ;
- les droits : avec un jeton obtenu par ce parcours, un membre ne trouve par `search` et `fetch` aucune source privée d'un autre membre, exactement comme `searchPassages` avec son contexte de session. Quand la clé de hiérarchie arrivera, ce test gagnera le manager, l'égal et l'admin ;
- aucun jeton, code ni `code_verifier` dans les journaux (on capture `logError`).

### M07 · Brancher chaque client, en vrai

**Fichiers :** aucun, sauf correction ; les notes vont dans la PR du lot 1.

**Fait quand :** après déploiement en production (claude.ai et ChatGPT appellent depuis leurs serveurs, `pnpm dev` ne leur est pas joignable), chacun des clients de L11 se branche avec la seule adresse `/api/mcp`, liste les quatre outils, fait un `search` puis un `fetch`, et se renouvelle au bout d'une heure sans redemander l'autorisation. Pour chacun, la PR note : la façon de l'ajouter, ce qu'il a inscrit (nom, adresse de retour), s'il a renouvelé, ce qu'il affiche en cas de révocation. Claude Code se vérifie d'abord contre `pnpm dev` (son retour est en bouclage).

## Lot 2 : Réglages

### M08 · « Assistants connectés »

**Fichiers :** `src/components/verre/reglages/assistants.tsx` (nouveau), `src/app/(app)/reglages/page.tsx`, `src/components/verre/reglages/tokens.tsx`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- une section « Assistants connectés » (ancre `#assistants`) remplace « Brancher Claude Code » : l'adresse `/api/mcp` avec son bouton Copier, puis une ligne par client de L11 (« claude.ai et Claude Desktop : Réglages › Connecteurs › Ajouter un connecteur personnalisé, collez l'adresse », etc.) ;
- dessous, la liste des jetons `assistant` non révoqués : nom du client, hôte de retour, création, dernière utilisation, « Révoquer » (l'action existante) ;
- la liste des jetons d'accès ne montre plus que les `manuel` ; avec le plan CLI, « Ordinateurs connectés » (S14) lit `kind = 'ordinateur'` au lieu du préfixe du nom ;
- aucune requête nouvelle : la page filtre ce que `listApiTokens` rend déjà.

**Tests :** un jeton `assistant` est dans la section, ni dans les jetons d'accès ni dans les ordinateurs ; révoqué, il disparaît et `/api/mcp` le refuse ; la commande à jeton de remplacement n'apparaît plus ; les textes en anglais et en français.

## Bout en bout (avant la PR du lot 2)

1. Dans claude.ai, ajouter un connecteur personnalisé avec `https://<leon>/api/mcp`. Leon s'ouvre, on se connecte, on clique « Autoriser ». Demander à Claude « Qu'est-ce qui s'est dit sur <un client> cette semaine ? » : il appelle `search` puis `fetch`, et cite ses sources.
2. Même chose dans ChatGPT (Plugins › Add custom MCP server), puis dans Claude Desktop (le même connecteur, venu du compte) et dans Cursor.
3. Réglages › Assistants connectés montre les trois branchements, avec leur dernière utilisation.
4. Le lendemain (accès expiré depuis longtemps), Claude répond toujours sans redemander l'autorisation : il s'est renouvelé.
5. Révoquer ChatGPT dans Réglages : son appel suivant reçoit 401, et ChatGPT propose de se reconnecter. Claude n'est pas touché.
6. Un égal d'Amos branche son propre Claude : il ne trouve aucune des conversations IA d'Amos ; un admin les trouve (avec la clé de hiérarchie, quand elle sera là).
7. Le jeton de Claude, présenté à `/api/v1/ingest`, reçoit 401.

## Questions tranchées

Par Amos, le 03/11 ; il porte ce chantier seul. Pour les choix techniques, sa consigne : « le meilleur, le plus propre, le plus carré ».

- B1. #56 fermée, avec un renvoi vers l'étude ; sa branche reste.
- B2. Le serveur d'autorisation est écrit dans Leon, sur `api_tokens` (F1).
- B3. La connexion de la CLI garde son écran, déjà codé (lot 1 de la CLI) ; ce plan part de lui (F10). Le chantier CLI (crochets, installation, mises à jour) ne s'arrête pas ; seul un chat Leon au terminal est abandonné.
- B4. Une heure pour le jeton d'un assistant, renouvelé (F3).
- B5. La liste fermée d'adresses de retour de L11 (F6).
- B6. L'extension capte comme aujourd'hui (F12).
- B7. DCR et CIMD (F5, L10).
