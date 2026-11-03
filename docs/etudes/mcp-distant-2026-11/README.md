# Le MCP distant : brancher Claude, ChatGPT et tout LLM à Leon

3 novembre 2026 · Amos (avec Claude) · tranché par Amos le 3 novembre

Plan d'implémentation : [`docs/plans/2026-11-03-mcp-distant.md`](../../plans/2026-11-03-mcp-distant.md), qui fait foi pour le détail. Point de départ : la PR #56 d'Amos (branche `amos/mcp-cli-local-rag`, ouverte le 26/10). Le plan [CLI sans clone](../../plans/2026-11-03-cli-sans-clone.md) l'a laissée ouverte pour ce chantier (QD3) : « que Claude, ChatGPT et tout autre LLM se branchent à Leon ».

## La question

Leon a déjà un serveur MCP, à `https://<leon>/api/mcp`, avec quatre outils (`search`, `fetch`, `briefing`, `remember`). Mais il ne s'ouvre qu'avec un jeton `leon_…` créé dans Réglages et collé dans un en-tête. Ça marche pour Claude Code, Cursor ou Codex, qui acceptent un en-tête. Ça ne marche ni pour claude.ai, ni pour Claude Desktop, ni pour ChatGPT : on n'y colle qu'une adresse, et ils attendent un serveur OAuth pour obtenir leur accès.

Comment un utilisateur branche-t-il n'importe quel assistant compatible MCP à Leon en collant une seule adresse, sans copier de jeton, avec les mêmes droits que dans Leon ?

## La réponse courte

1. **Leon devient son propre serveur d'autorisation OAuth**, réduit à ce que les clients MCP utilisent : le code d'autorisation avec PKCE, et le renouvellement. Des métadonnées fixes, une page « Autoriser », une route de jetons, une route d'inscription des clients. Aucune dépendance nouvelle, aucune table nouvelle.
2. **Les jetons restent ceux d'`api_tokens`**, au format `leon_`. `/api/mcp` garde son contrôle d'aujourd'hui ; un jeton d'assistant ne vaut que là. Une révocation agit à l'appel suivant. Chaque assistant branché apparaît dans Réglages, avec sa dernière utilisation.
3. **Un accès d'une heure, renouvelé**, avec un jeton de renouvellement changé à chaque usage, comme la spécification MCP le demande pour des jetons qui vivent chez Anthropic ou OpenAI.
4. **Côté utilisateur, un clic** : coller l'adresse dans son assistant, se connecter à Leon si besoin, « Autoriser ». La page dit où l'on sera renvoyé. Seules les adresses de retour que publient des clients connus (claude.ai, chatgpt.com, www.cursor.com, vscode.dev, antigravity.google), chemin compris, et l'ordinateur lui-même (`127.0.0.1`, `localhost`) sont acceptés.
5. **Les outils ne changent pas** (`search`, `fetch`, `briefing`, `remember`), et tournent sous les droits de l'utilisateur : la règle de visibilité des conversations s'applique d'elle-même.
6. **De #56, on garde l'idée et la page de consentement.** On retire Better Auth comme serveur OAuth (deux paquets, huit tables, des JWT à côté d'`api_tokens`) et `leon chat`, que les assistants branchés au MCP remplacent.
7. **La connexion de la CLI garde son propre écran**, déjà codé (lot 1 du plan CLI). Ce chantier vient après et en reprend le code signé et le retour après connexion. Le chantier CLI des crochets ne s'arrête pas.

## 1. Aujourd'hui

**Sur main.** `/api/mcp` (`src/server/api/mcp-routes.ts`) passe par `requireApiToken` : un jeton `leon_` en `Authorization: Bearer`, vérifié à chaque appel (non révoqué, adhésion en cours). Le contexte qui en sort (`TenantContext` : espace, utilisateur, principals) est le même que celui de l'interface. Réglages montre la commande de Claude Code avec un jeton à remplacer à la main. Sans jeton, la route répond 401 avec un `WWW-Authenticate: Bearer` nu : un client OAuth ne trouve rien pour démarrer.

**La PR #56** ajoute deux choses sans lien entre elles :
- un serveur OAuth 2.1 pour le MCP, par trois greffons de Better Auth (`@better-auth/mcp`, `@better-auth/cimd`, `jwt` du cœur), une page de consentement `/mcp/autorisation`, les métadonnées `/.well-known/oauth-protected-resource`, et une migration de huit tables (clés de signature, clients, ressources, jetons d'accès, jetons de renouvellement, consentements) ;
- une commande `leon chat [dossier]` : un chat au terminal qui indexe en mémoire les PDF, fichiers Office, CSV et Markdown du dossier (par `officeparser`), et envoie jusqu'à cinq extraits, après accord, à une nouvelle route `/api/cli/chat` qui fait tourner l'agent de Leon.

Elle monte `better-auth` de 1.7.7 à 1.7.13, passe `tsx` dans les dépendances de production, ajoute `bin/leon.js` et `officeparser`. Elle part de main du 26/10 : 51 commits de retard au 03/11, neuf fichiers en conflit, et son numéro de migration (0034) est déjà pris sur main (`0034-suppression-documents.sql`). La relecture automatique y a laissé trois remarques, toutes sur `leon chat`.

## 2. Ce qu'il faut

- **Une adresse à coller**, `https://<leon>/api/mcp`, la même pour tous les clients. Pas de jeton à copier, pas d'en-tête à écrire.
- **Les mêmes droits que dans Leon.** L'assistant voit ce que voit la personne qui l'a branché, pas plus. La règle des conversations IA (l'auteur, ses managers en remontant, les admins ; pas les égaux) s'applique sans code à part.
- **Chaque assistant branché visible et révocable** dans Réglages, avec sa dernière utilisation. Une révocation agit à l'appel suivant, pas à l'expiration d'un jeton.
- **Les exigences des clients visés**, telles que leur documentation les donne au 03/11 (section 6).
- **Aucune dépendance nouvelle** sans raison forte.
- **Aucun secret dans le dépôt ni dans une adresse.** Le code d'autorisation d'OAuth passe par une adresse, c'est le protocole : il ne vaut rien sans le secret PKCE que seul le client détient, il sert une fois et vit deux minutes. Les jetons, eux, ne passent que dans le corps d'une réponse HTTPS et dans l'en-tête `Authorization`.

## 3. Ce qu'on garde de #56

| Morceau | Verdict | Pourquoi |
|---|---|---|
| L'idée : un serveur OAuth devant `/api/mcp` | **gardée** | c'est le besoin |
| Le serveur OAuth par Better Auth (`@better-auth/mcp`, `@better-auth/cimd`, `jwt`, huit tables) | **retiré**, remplacé (section 4) | deux paquets et une montée de version de Better Auth ; un second modèle de jetons à côté d'`api_tokens` ; des jetons JWT, que la révocation n'arrête qu'à leur expiration si on ne relit pas la base ; des clés de signature en base |
| Les métadonnées `/.well-known/oauth-protected-resource` | **gardées**, réécrites | deux fichiers JSON fixes, sans greffon |
| La page de consentement | **gardée dans l'esprit**, réécrite | sur le modèle de `/ordinateur/autoriser` (S03 du plan CLI), textes dans `messages/*.json` |
| Le passage d'`oauth_query` par les formulaires de connexion et d'inscription | **repris en plus petit** | la page d'autorisation montre la connexion sur place, comme `/invitation/[token]`, puis revient sur elle-même : un chemin fixe, des paramètres revalidés. L'inscription n'y passe pas : qui n'a pas de compte crée d'abord son espace |
| La section « Serveur MCP distant » de Réglages | **gardée**, réécrite | une section « Assistants connectés » (M08 du plan) |
| `docs/dev/integrations.md` | **retiré** | la marche à suivre vit dans Réglages et le README |
| `leon chat`, `src/cli/local-documents.ts`, `/api/cli/chat`, `officeparser` | **retirés** | voir ci-dessous |
| `bin/leon.js`, le champ `bin` de `package.json`, `tsx` en production | **retirés** | le lanceur `~/.leon/bin/leon` du plan CLI (S08) les remplace |

**`leon chat` part.**
- **Le MCP distant le rend inutile.** Claude Desktop, Claude Code, Cursor ou Codex lisent déjà les fichiers de l'ordinateur, et, branchés à Leon, cherchent aussi dans sa mémoire. `leon chat` refait en moins bien un assistant que l'utilisateur a déjà.
- **Il pèse.** `officeparser` tire de quoi lire les PDF et faire de la reconnaissance de caractères (`tesseract.js`, que #56 empêche déjà de se construire dans `pnpm-workspace.yaml`). La CLI sans clone tient dans un fichier de 135 Ko, plafonné à 1 Mo (contraintes globales du plan CLI).
- **Il ajoute une seconde porte vers l'agent de Leon** (`/api/cli/chat`), avec son propre format d'historique et ses limites, où la relecture a déjà trouvé trois défauts.
- **Il sort du sujet de la CLI**, qui sert aux crochets des outils de code.

Amos a fermé #56 le 03/11 (B1), en renvoyant à cette étude ; sa branche reste.

## 4. Le serveur d'autorisation

Un client OAuth qui reçoit le 401 de `/api/mcp` lit les métadonnées de la ressource, puis celles du serveur d'autorisation, s'inscrit s'il le faut, ouvre la page d'autorisation dans le navigateur, reçoit un code sur son adresse de retour et l'échange contre un jeton. Il faut donc, côté Leon, deux fichiers de métadonnées, une page, une route de jetons et une façon d'inscrire les clients.

| Option | Dépendances | Base | Jetons | Révocation | Ce que ça coûte |
|---|---|---|---|---|---|
| **a. #56 telle quelle** (Better Auth : `@better-auth/mcp`, `@better-auth/cimd`, `jwt`) | deux paquets, Better Auth de 1.7.7 à 1.7.13 | huit tables, dont les clés privées de signature | JWT, à côté d'`api_tokens` : deux modèles, deux listes dans Réglages | relire la base à chaque appel, sinon à l'expiration du JWT | rebaser 51 commits, neuf conflits, renuméroter la migration ; une montée de Better Auth qui touche toute la connexion (2FA, organisations, connexion sociale en cours) ; rouvrir les routes `/api/auth/*` que la #66 de David ferme (seul le lien de réinitialisation y passe) |
| **b. Un serveur d'autorisation minimal, écrit dans Leon, sur `api_tokens`** | aucune | des colonnes sur `api_tokens`, aucune table | `leon_`, opaques, comme aujourd'hui ; `/api/mcp` ne change presque pas | immédiate : `verifyApiToken` relit déjà la ligne à chaque appel | environ 3 jours ; du code de sécurité à nous, à borner et tester |
| **c. Pas d'OAuth** : le jeton collé en en-tête (aujourd'hui) | aucune | rien | rien de neuf | immédiate | rien, mais ni claude.ai, ni Claude Desktop, ni ChatGPT |
| **d. Un fournisseur d'identité externe** (Auth0, WorkOS, Stytch…) | un SDK | les comptes en double chez lui | les siens | selon lui | un service et un compte de plus, un coût par utilisateur, une seconde source de vérité pour les comptes |

**Retenu : b** (B2 : « le meilleur, le plus propre, le plus carré »).

- **Le protocole se réduit à peu de chose.** Les clients MCP n'utilisent que le code d'autorisation avec PKCE S256 et le renouvellement. Pas de flux implicite, pas de mot de passe, pas d'OpenID Connect, pas de `client_credentials`. Ce sont des métadonnées fixes, une page, deux routes.
- **Le code signé existe déjà.** Le lot 1 de la CLI (S02, `computer-code.ts`) signe un code de deux minutes par HMAC, avec une clé dérivée de `BETTER_AUTH_SECRET`. Le code d'autorisation d'OAuth est le même objet, avec en plus l'empreinte PKCE, le client et l'adresse de retour. Rien à stocker : l'usage unique tient à une colonne unique d'`api_tokens`.
- **Les jetons restent des `leon_`.** `/api/mcp` garde `requireApiToken` ; seul son 401 change, pour indiquer où sont les métadonnées. La révocation agit à l'appel suivant, sans liste noire ni introspection.
- **Le risque**, à dire clairement : écrire soi-même la partie OAuth d'un serveur d'autorisation. On le borne : clients publics seulement, PKCE S256 obligatoire, adresses de retour comparées caractère par caractère, codes de deux minutes à usage unique, aucune adresse suivie sans vérification, une liste de tests écrite dans le plan, puis `security-review`.

`@better-auth/oauth-provider`, le greffon officiel de Better Auth pour faire de lui un serveur d'autorisation, revient à l'option a : mêmes tables, mêmes jetons à part, même montée de version.

## 5. Les jetons : un seul modèle, `api_tokens`

Aujourd'hui, `api_tokens` porte les jetons créés à la main dans Réglages ; le plan CLI y ajoute un jeton par ordinateur, reconnu au préfixe de son nom (« Ordinateur : … », un raccourci assumé de S14). Le MCP distant y ajoute un jeton par assistant branché. Trois sortes de jetons, une table :

| Sorte (`kind`) | Créé par | Expire | Renouvelé | Montré dans Réglages |
|---|---|---|---|---|
| `manuel` | Réglages › Jetons d'accès | non | non | Jetons d'accès |
| `ordinateur` | `leon login` (plan CLI) | non | non | Ordinateurs connectés |
| `assistant` | la route des jetons d'OAuth | accès : 1 h | oui, jeton de renouvellement de 90 jours, changé à chaque usage | Assistants connectés |

- **Une ligne par branchement.** Elle garde l'empreinte du jeton d'accès, celle du jeton de renouvellement, leurs dates d'expiration, le client (son nom et l'hôte de son adresse de retour) et l'identifiant du code qui l'a créée. Un renouvellement change les deux empreintes sur place : la ligne, sa date de création et sa dernière utilisation restent.
- **Pourquoi une heure pour les assistants, et rien pour la CLI.** Le jeton d'un assistant hébergé vit sur les serveurs d'Anthropic ou d'OpenAI. La spécification MCP demande des jetons d'accès courts (« SHOULD ») et, quand on renouvelle, de changer le jeton de renouvellement d'un client public à chaque usage (« MUST »). Le jeton de la CLI reste sur l'ordinateur, en 0600 ; le plan CLI a écarté le renouvellement pour ne pas le gérer dans la CLI. Retenu par Amos (B4).
- **`verifyApiToken` gagne une condition**, `expires_at` nul ou à venir. Il garde le reste : non révoqué, adhésion en cours depuis avant la création, compte non supprimé. Aucune requête de plus par appel MCP.
- **Un jeton d'assistant ne vaut que pour `/api/mcp`.** La spécification MCP demande au serveur de refuser un jeton qui n'a pas été émis pour lui (« MUST »). Un jeton gardé par OpenAI n'a pas à écrire dans `/api/v1/ingest` : `requireApiToken` refuse le `kind` `assistant` hors de `/api/mcp`. Les jetons `manuel` et `ordinateur` gardent tout ce qu'ils ont aujourd'hui, `/api/mcp` compris.
- **La colonne `kind`** remplace le préfixe de nom du plan CLI (S14) : son raccourci tombe.

Une migration ajoute à `api_tokens` : `kind`, `client_name`, `client_host`, `client_ref` (l'empreinte du client, à qui seul le renouvellement est servi), `grant_id` (unique), `expires_at`, `refresh_hash` (unique) et `refresh_expires_at`.

## 6. Les clients et la façon de se brancher

Vérifié le 03/11 dans la documentation de chaque client (sources en fin d'étude). « Inscription » dit comment le client se fait connaître du serveur d'autorisation : par l'inscription dynamique (DCR, RFC 7591) ou par un document de métadonnées hébergé chez lui (CIMD, un `client_id` qui est une adresse).

| Client | Où l'ajouter | Inscription | Adresse de retour | Sans OAuth ? |
|---|---|---|---|---|
| **Claude** : claude.ai, Claude Desktop, mobile | Personnaliser › Connecteurs › Ajouter un connecteur personnalisé (Team, Enterprise : un propriétaire de l'organisation) | CIMD si le serveur l'annonce, sinon DCR | `https://claude.ai/api/mcp/auth_callback` | en-têtes fixes en bêta pour quelques organisations, une seule valeur pour toute l'organisation : inutilisable pour Leon, dont les droits sont par personne |
| **Claude Code** | `claude mcp add --transport http leon https://<leon>/api/mcp` | CIMD ou DCR | bouclage, port variable, `localhost` et `127.0.0.1` | `--header` |
| **ChatGPT** | Plugins › Add custom MCP server | CIMD de préférence, DCR, ou client défini à l'avance | `https://chatgpt.com/connector_platform_oauth_redirect` si le serveur rend `iss`, sinon `https://chatgpt.com/connector/oauth/{callback_id}` | non |
| **Codex** | `codex mcp add leon --url https://<leon>/api/mcp`, puis `codex mcp login leon` | CIMD ou DCR | bouclage | `bearer_token_env_var` |
| **Cursor** | `mcp.json`, champ `url` | DCR | `https://www.cursor.com/agents/mcp/oauth/callback`, `http://localhost:8787/callback` | `headers` |
| **VS Code, Copilot** | `mcp.json`, `"type": "http"` | CIMD (depuis 1.106) ou DCR | `http://127.0.0.1:33418`, `https://vscode.dev/redirect` | `headers` |
| **Gemini CLI** | `gemini mcp add --transport http leon https://<leon>/api/mcp` | DCR | `http://localhost:<port>/oauth/callback` | `--header` |
| **Antigravity** | `mcp_config.json`, champ `serverUrl` | DCR | `https://antigravity.google/oauth-callback` | `headers` |
| **Mistral Le Chat** | connecteur MCP personnalisé (un admin) | DCR | non publiée | `Authorization: Bearer` |

**Ce que ces clients imposent au serveur :**
- **un vrai 401** sur `/api/mcp`, avec `WWW-Authenticate: Bearer resource_metadata="…"` : Claude ne démarre la connexion que sur un 401 ;
- **les métadonnées de la ressource** (RFC 9728) aux deux adresses, `/.well-known/oauth-protected-resource/api/mcp` puis `/.well-known/oauth-protected-resource`, avec `resource` égal, au caractère près, à l'adresse que l'utilisateur colle ;
- **les métadonnées du serveur d'autorisation** (RFC 8414) avec `code_challenge_methods_supported: ["S256"]` (sans elles, un client conforme s'arrête), et `authorization_response_iss_parameter_supported: true` avec `iss` dans chaque réponse de la page, erreurs comprises : ChatGPT en dépend pour son adresse de retour stable, et Codex refuse une réponse sans `iss` ;
- **PKCE S256 et `resource`** (RFC 8707) dans chaque demande ;
- **la route des jetons en `application/x-www-form-urlencoded`**, l'erreur `invalid_grant` pour un renouvellement refusé, et un jeton de renouvellement changé à chaque usage, rendu dans la même réponse ;
- **des réponses en moins de 10 secondes** (30 pour un renouvellement, chez Claude) ;
- **une adresse publique en IPv4** : claude.ai et ChatGPT appellent depuis leurs serveurs, jamais depuis l'ordinateur. Pour Claude, depuis `160.79.104.0/21` et `153.61.208.0/20`. `pnpm dev` ne leur est pas joignable : on essaie contre la production.

**L'inscription : DCR et CIMD** (B7, au plus propre). La spécification MCP du 2026-07-28 recommande CIMD et déprécie DCR, qu'elle garde « pour compatibilité ». Claude, ChatGPT, Codex et VS Code préfèrent CIMD ; Cursor, Gemini CLI, Antigravity et Le Chat ne savent faire que DCR. Leon accepte donc les deux :
- **CIMD** : le `client_id` est l'adresse du document du client (`https://chatgpt.com/oauth/client.json`, par exemple), que Leon va lire. D'ordinaire, il faut alors se garder des adresses qui visent le réseau interne. Ici, Leon ne lit que chez les hôtes de la liste fermée (B5), sans suivre de redirection, et chaque adresse de retour du document doit elle-même être dans la liste. Le nom du client vient alors de chez lui, pas d'une déclaration.
- **DCR** : l'inscription ne stocke rien. Le `client_id` rendu porte lui-même, signés, le nom et les adresses de retour du client. Claude, qui réinscrit un client à chaque nouvelle connexion quand il passe par DCR, ne remplit donc aucune table.

**Le protocole.** La spécification du 2026-07-28 supprime la poignée de main `initialize` et les sessions. Un serveur qui ne parle que cette version fait échouer les clients plus anciens, et Claude ne cite que les spécifications d'autorisation jusqu'au 2025-11-25. Le serveur de main sert déjà les deux époques : `createMcpHandler`, sans option, retombe sur le service sans état pour les clients de 2025. L'exemple de Better Auth (`legacy: 'reject'`) fermerait cette porte : à ne pas suivre.

**`search` et `fetch` pour ChatGPT.** Ils ne sont exigés que pour la recherche approfondie et les connaissances de l'entreprise, avec la forme que Leon suit déjà. ChatGPT veut aussi `readOnlyHint` et `destructiveHint` sur chaque outil : `readOnlyHint` est posé partout, `destructiveHint: false` sur `remember` ; il manque `destructiveHint` sur les trois outils de lecture, sans effet puisqu'ils ne changent rien (à vérifier à l'essai).

**Non vérifié** (aucune page officielle lue) : les formules de ChatGPT qui permettent d'ajouter un serveur MCP (l'aide d'OpenAI répond 403) ; l'adresse de retour de Le Chat ; si Claude parle déjà la version 2026-07-28 du protocole.

## 7. Les outils exposés, et la visibilité

**Les quatre outils d'aujourd'hui, sans changement.**

| Outil | Ce qu'il fait | Écrit ? |
|---|---|---|
| `search` | la recherche de la barre de Leon (mots et sens, filtres `outil`, `type`, `depuis`, `de`) | non |
| `fetch` | lit un passage avec ses tours voisins, ou une source entière | non |
| `briefing` | le point du matin d'un projet | non |
| `remember` | garde une note dictée par l'utilisateur | oui : une note privée, à lui |

`search` et `fetch` suivent déjà le contrat que ChatGPT impose aux outils de ce nom (`results` en `{ id, title, url }`, `fetch` par `id`), écrit dans `src/server/mcp/tools/output-schemas.ts`. Les annotations (`readOnlyHint`) sont posées : `remember` est le seul à écrire.

**Pas d'outil nouveau en v1.** Ni l'agent de Leon (le client est lui-même un agent), ni les tâches, ni les actions sur les connecteurs, ni l'administration. Un seul périmètre (`scope`) : `leon`, qui donne les quatre outils.

**La visibilité ne demande aucun code à part.** Le serveur MCP ne lit la base que par le `TenantContext` du jeton, sous la RLS (`acl && app_principals()`). Ce contexte sort de `verifyApiToken`, qui calcule les principals par `principalsFor`, comme pour une session de l'interface. Aujourd'hui, `principalsFor` rend « soi » et « l'équipe ». Le jour où la clé de hiérarchie arrive (la règle du 28/10 : l'auteur, ses managers en remontant, les admins ; pas les égaux), elle change à un seul endroit, et le MCP suit. Le plan l'attache par un test (M06) : avec un jeton obtenu par OAuth, un membre ne trouve par le MCP aucune source qu'il ne trouve pas dans l'interface. La clé de hiérarchie y ajoutera le manager, l'égal et l'admin.

**Une limite à connaître.** Ce que Leon rend arrive dans la conversation de l'assistant. L'extension de Leon capte les conversations de claude.ai et de ChatGPT : elle écarte déjà les blocs d'outil (`extension/lib/parsers/claude-ai.ts` et `chatgpt.ts`), mais garde la réponse de l'assistant, qui peut citer ce que Leon lui a rendu. Un mail lu par le MCP puis résumé par Claude devient ainsi une conversation IA, lisible des managers de son auteur. **Tranché par Amos (B6) : on capte comme aujourd'hui.** Leon est du B2B ; la boîte reliée est celle du travail. Qui relie sa boîte personnelle à Leon le fait en acceptant les autorisations, à ses risques.

## 8. L'articulation avec la CLI sans clone

Le plan CLI (lot 1, S01 à S05, codé le 03/11 sur `amos/cli-connexion-navigateur`, pas encore poussé) construit sa propre connexion par le navigateur : la CLI tire le jeton et n'en montre que l'empreinte (K3), le serveur signe un code de deux minutes (K4), la CLI l'échange en présentant le jeton (K5). C'est, sous d'autres noms, un code d'autorisation protégé par PKCE avec un retour en bouclage : exactement ce que fait OAuth pour les applications natives (RFC 8252). L'étude CLI avait écarté OAuth (son option e) pour ses trois dépendances et ses jetons qui expirent. Le serveur recommandé à la section 4 n'a ni dépendance, ni jeton qui expire pour la CLI.

| | **a. Une seule** (la CLI devient un client du serveur d'autorisation) | **b. Deux connexions** (le plan CLI tel quel, puis le MCP à côté) |
|---|---|---|
| Pages d'autorisation | une, dont le texte dépend du client | deux (`/ordinateur/autoriser`, `/oauth/autoriser`) |
| Codes signés | un | deux formats (K4 et celui d'OAuth) |
| Routes qui créent un jeton | une | deux (`POST /api/v1/ordinateurs`, `/api/oauth/jeton`) |
| Ce que voit l'utilisateur | un clic, la même page | un clic |
| Le jeton de la CLI | tiré par le serveur, rendu à la CLI dans le corps de la réponse HTTPS ; toujours sans expiration | tiré par la CLI, le serveur n'en voit que l'empreinte |
| Plan CLI | S01, S02 et S04 tombent (sauf `DELETE /api/v1/jeton`) ; S03 devient la page d'OAuth ; S05 parle OAuth (PKCE au lieu de l'empreinte) ; K3 à K5 sont remplacés | inchangé |
| Effort total (CLI lot 1 + MCP lot 1) | environ 4 jours | environ 5 jours |

**Retenu : b** (B3). Sur le papier, a coûte un jour de moins. Mais le lot 1 de la CLI était déjà codé et testé le 03/11 : le refaire sur l'écran d'OAuth coûterait plus que deux écrans sur le même modèle, et retarderait la connexion en un clic. Ce chantier part donc du lot 1 de la CLI et en reprend :
- `computer-code.ts` (S02), dont la signature devient générale (un `purpose` par usage ; la clé de la CLI ne change pas) ;
- le retour après connexion (S03) : `/connexion` reconnaît la demande, et `pathAfterSignIn` la revalide, double authentification comprise ;
- les contrats de routes et de liens que le lot 1 a ajoutés (`src/test/contracts/`).

Les deux écrans pourront se réunir plus tard ; rien ne l'impose.

**Ce qui ne bouge pas, dans les deux cas :**
- `api_tokens` porte tout ; la colonne `kind` range chaque jeton (section 5), et S14 du plan CLI ne reconnaît plus les ordinateurs au préfixe de leur nom ;
- Réglages a trois listes : Jetons d'accès (`manuel`), Ordinateurs connectés (`ordinateur`, S14), Assistants connectés (`assistant`, ce plan) ;
- `leon logout` révoque son jeton par `DELETE /api/v1/jeton` (K6) ; une nouvelle connexion du même ordinateur révoque l'ancien (E4) ;
- le lanceur, l'installation et les mises à jour (lots 2 et 3 du plan CLI) ne touchent pas au serveur d'autorisation.

## 9. L'ordre

Le lot 1 de la CLI et ce chantier touchent les mêmes fichiers : `src/server/auth/api-tokens.ts`, `src/server/api/app.ts`, `src/capture/api-contract.ts`, les pages de `src/app/(auth)/` et `messages/*.json`.

Rien ne s'arrête côté CLI (Amos, 03/11 : « il ne faut surtout pas mettre en pause le chantier CLI »).
1. **CLI, lot 1** : poussé et fusionné tel qu'il est codé. Le lot 2 de la CLI (installation, lanceur, crochets, mises à jour) avance aussi, sans attendre ce chantier.
2. **MCP, lot 1 : le serveur d'autorisation** (M01 à M07), rebasé sur le lot 1 de la CLI.
3. **Réglages** : « Ordinateurs connectés » (S14) et « Assistants connectés » (M08), l'un après l'autre, puisqu'ils touchent la même page.

Dans les deux cas, ce chantier ne touche pas aux outils MCP : il ne croise pas T25 du plan mémoire (le filtre `depot` sur `search` et `briefing`).

**Les PR à connaître.** La #119, fusionnée le 03/11, a changé la connexion (double authentification, adresse non vérifiée) que la page d'autorisation réutilise sur place : le plan part de cette version. La #66, ouverte, ferme `/api/auth/*` : ce chantier n'en dépend pas, ses routes sont à Leon (`/api/oauth/*`), avec ses propres limites.

## 10. Ce que ça coûte

Deux PR, un peu plus de 4 jours, détaillées dans le [plan](../../plans/2026-11-03-mcp-distant.md) :

| PR | Ce que ça change | Effort |
|---|---|---|
| 1. Le serveur d'autorisation | coller `https://<leon>/api/mcp` dans claude.ai, ChatGPT, Cursor… suffit ; DCR et CIMD ; essayé pour de vrai sur chaque client | 3,5 j |
| 2. Réglages | « Assistants connectés » : l'adresse, la marche à suivre par client, la liste des assistants branchés et « Révoquer » | 0,75 j |

Côté serveur : une migration (des colonnes sur `api_tokens`), des métadonnées fixes, une page, deux routes, la lecture des documents CIMD, et la signature du lot 1 de la CLI rendue générale. Aucune dépendance nouvelle : `node:crypto`, `zod`, Hono, et les aides de métadonnées du SDK MCP déjà installé (`@modelcontextprotocol/server`).

## 11. Tranché

Par Amos, le 03/11 ; il porte ce chantier seul. Pour les choix techniques (B2, B7), sa consigne : « le meilleur, le plus propre, le plus carré ».

- **B1. #56 : fermée** le 03/11, avec un renvoi vers cette étude. Sa branche reste.
- **B2. Le serveur d'autorisation est écrit dans Leon**, sur `api_tokens`, sans dépendance.
- **B3. La connexion de la CLI garde son propre écran**, déjà codé (lot 1, `amos/cli-connexion-navigateur`). Ce chantier vient après et en reprend le code signé et le retour après connexion. Le chantier CLI (crochets, installation, mises à jour) ne s'arrête pas. Seule l'idée d'un chat Leon au terminal (`leon chat`) est abandonnée.
- **B4. Une heure** pour le jeton d'un assistant, renouvelé tout seul par un jeton de 90 jours changé à chaque usage.
- **B5. La liste fermée** : les adresses de retour que publient claude.ai, chatgpt.com, www.cursor.com, vscode.dev et antigravity.google, chemin compris, plus l'ordinateur lui-même.
- **B6. On capte comme aujourd'hui.** Leon est du B2B : la boîte reliée est celle du travail, et qui relie sa boîte personnelle l'accepte.
- **B7. DCR et CIMD dès la v1**, CIMD lu seulement chez les hôtes de la liste fermée.

**Pour plus tard, hors de ce chantier :** un bloc « Brancher Claude ou ChatGPT » dans l'onboarding (une ligne à côté de « Vos outils de code », S13 du plan CLI) ; des périmètres plus fins (lecture seule) ; la révocation demandée par le client (RFC 7009).

## Sources

Pages lues le 03/11. Le détail, page par page, est dans les notes de recherche de la session (hors du dépôt).

- **Spécification MCP** : [versions](https://modelcontextprotocol.io/specification/versioning) (2026-07-28 est la version en cours), [changements du 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog), [autorisation](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [inscription des clients](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) (DCR dépréciée, CIMD recommandée), [sécurité](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations) (jetons courts : SHOULD ; rotation pour un client public : MUST ; adresses de retour comparées exactement).
- **Claude** : [ajouter un connecteur hors annuaire](https://claude.com/docs/connectors/custom/remote-mcp.md), [authentification](https://claude.com/docs/connectors/building/authentication.md) (adresse de retour, CIMD seulement avec `"none"`, 401 obligatoire, délais, rotation), [dépannage](https://claude.com/docs/connectors/building/troubleshooting.md), [adresses IP](https://platform.claude.com/docs/en/api/ip-addresses).
- **Claude Code** : [MCP](https://code.claude.com/docs/en/mcp).
- **ChatGPT** : [authentification](https://developers.openai.com/apps-sdk/build/auth) (CIMD de préférence, DCR, `iss`, adresses de retour), [se brancher à ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt.md), [serveur MCP](https://developers.openai.com/plugins/build/mcp-server.md), [MCP et `search`/`fetch`](https://developers.openai.com/api/docs/mcp).
- **Codex** : [MCP](https://developers.openai.com/codex/mcp). **Cursor** : [MCP](https://cursor.com/docs/context/mcp). **VS Code** : [configuration MCP](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [guide des extensions](https://code.visualstudio.com/api/extension-guides/ai/mcp), [1.106](https://code.visualstudio.com/updates/v1_106). **Gemini CLI** : [serveurs MCP](https://geminicli.com/docs/tools/mcp-server/). **Antigravity** : [MCP](https://antigravity.google/docs/mcp), [guide Workspace](https://developers.google.com/workspace/guides/configure-mcp-servers). **Mistral** : [connecteurs MCP](https://docs.mistral.ai/le-chat/knowledge-integrations/connectors/mcp-connectors).
- **Better Auth** : [greffon MCP](https://www.better-auth.com/docs/plugins/mcp) (`jwt()` requis, DCR coupée par défaut), [version 1.7.0](https://github.com/better-auth/better-auth/releases/tag/v1.7.0) (l'ancien greffon `mcp` sort du cœur pour `@better-auth/mcp`, bâti sur `@better-auth/oauth-provider`) ; npm au 03/11 : `@better-auth/mcp` et `@better-auth/cimd` en 1.7.15.
- **RFC** : [6749](https://www.rfc-editor.org/rfc/rfc6749) (OAuth 2.0), [7591](https://www.rfc-editor.org/rfc/rfc7591) (DCR), [7636](https://www.rfc-editor.org/rfc/rfc7636) (PKCE), [8252](https://www.rfc-editor.org/rfc/rfc8252) (applications natives, bouclage), [8414](https://www.rfc-editor.org/rfc/rfc8414) (métadonnées du serveur), [8707](https://www.rfc-editor.org/rfc/rfc8707) (`resource`), [9207](https://www.rfc-editor.org/rfc/rfc9207) (`iss`), [9728](https://www.rfc-editor.org/rfc/rfc9728) (métadonnées de la ressource).
- **Le code** : `src/server/api/mcp-routes.ts`, `src/server/api/require-api-token.ts`, `src/server/auth/api-tokens.ts`, `src/server/auth/tenant-context.ts` (`principalsFor`), `src/server/db/with-tenant.ts` (RLS), `src/server/mcp/tools/output-schemas.ts`, `extension/lib/parsers/claude-ai.ts` et `chatgpt.ts`, `node_modules/@modelcontextprotocol/server` (`createMcpHandler`, `legacy`, `oauthMetadataResponse`) ; la branche `amos/mcp-cli-local-rag` (81f37f9) ; la #66 (`src/server/api/auth-routes.ts`).
