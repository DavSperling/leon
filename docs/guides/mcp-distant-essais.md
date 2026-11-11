# Essais du MCP distant chez les tiers

À cocher par Amos (M07 du plan `docs/plans/2026-11-03-mcp-distant.md`), avec David pour les variables de production. Aucun test automatique n'appelle claude.ai, ChatGPT ni un client de bureau : cette liste est la seule vérification contre les vrais clients. Un écart : le noter dans la PR, avec le texte exact que le client affiche. Ne rien coller ici qui soit un secret ou une valeur de production : `<leon>` est l'adresse publique du serveur.

## Avant la mise en ligne

- [ ] **`BETTER_AUTH_URL`** (variables de production, gérées par David) est exactement l'origine publique en `https` que les gens colleront : `https://<leon>`, sans chemin ni barre finale. Le serveur le lit pour l'émetteur et pour `resource`, et Claude compare `resource` à ce que la personne a collé, au caractère près. Vérifier : `curl -s https://<leon>/.well-known/oauth-protected-resource` rend `"resource":"https://<leon>/api/mcp"`, et `curl -s https://<leon>/.well-known/oauth-authorization-server` rend `"issuer":"https://<leon>"`.
- [ ] **L'adresse est joignable en IPv4 depuis l'extérieur** (claude.ai et ChatGPT appellent depuis leurs serveurs, jamais depuis l'ordinateur de la personne) : `curl -4 -s https://<leon>/api/health`, depuis une machine hors du réseau de Leon, rend `{"ok":true}`.
- [ ] **Aucun pare-feu ne bloque les serveurs des assistants.** S'il y en a un devant Railway (WAF, Cloudflare…), il laisse passer les plages d'Anthropic (`160.79.104.0/21`, `153.61.208.0/20`) sur `/api/mcp`, `/.well-known/*`, `/oauth/autoriser` et `/api/oauth/*`, et celles d'OpenAI pour ChatGPT. `/oauth/autoriser` est ouverte par le navigateur de la personne, pas par un serveur : elle ne doit pas être limitée à des plages.
- [ ] **La 0049 n'a été appliquée qu'une fois, dans sa version finale.** Elle a été modifiée sur place avant la fusion (les colonnes `previous_refresh_hash` et `refresh_rotated_at` ont été ajoutées) et le lanceur de migrations ne regarde que le nom du fichier : une base qui en a reçu la première version ne la rejouera pas. Sur toute base autre que `leon_test_mcp` (production, bases de test partagées, base de l'essai local) : `select name from leon_migrations where name like '0049%'`. Aucune ligne : c'est bon, le déploiement l'applique (`preDeployCommand` de `railway.json`). Une ligne : `select column_name from information_schema.columns where table_name = 'api_tokens'` doit contenir `kind`, `client_name`, `client_host`, `client_ref`, `grant_id`, `expires_at`, `refresh_hash`, `refresh_expires_at`, `previous_refresh_hash` et `refresh_rotated_at` ; s'il en manque, il faut une migration suivante qui ajoute ce qui manque, jamais une nouvelle retouche de la 0049.
- [ ] **Le déploiement tient** : au démarrage, aucune erreur sur `BETTER_AUTH_URL`, et la vérification de santé de Railway passe.

## L'essai réel (M07)

Dans l'ordre. claude.ai et ChatGPT ne se vérifient que contre la production ; les clients de bureau peuvent d'abord s'essayer contre `pnpm dev` (section suivante). La façon d'ajouter chaque client est la section 6 de `docs/etudes/mcp-distant-2026-11/README.md`.

Vérifier à chaque client :
1. **L'inscription.** La page « Connect an assistant » (« Brancher un assistant » en français) s'ouvre avec le nom du client. La ligne « Name declared by the application » est là pour une inscription (DCR) et absente pour un document CIMD. Noter lequel des deux, et le comparer à la colonne « Inscription ».
2. **L'hôte.** La ligne « You will be sent to … » nomme l'hôte de la colonne « Retour », ou « an application on this computer » pour un retour en bouclage.
3. **« Authorize ».** Le client revient connecté, sans erreur. Réglages › Assistants connectés montre une ligne au nom du client.
4. **`tools/list`** rend sept outils : `search`, `fetch`, `threads`, `thread`, `versions`, `briefing`, `remember`.
5. **`search` puis `fetch`** sur une question dont Leon connaît la réponse : le client cite ses sources.
6. **Le renouvellement.** L'accès dure une heure : au-delà, le client répond encore sans redemander l'autorisation, et la ligne de Réglages passe de « never used » à « used ».
7. **La révocation.** « Revoke » dans Réglages ; l'appel suivant reçoit un 401 avec `WWW-Authenticate` et `resource_metadata`, et le client propose de se reconnecter. Noter ce qu'il affiche.

| Client | Comment l'ajouter | Inscription | Retour attendu |
|---|---|---|---|
| **claude.ai, Claude Desktop** | Personnaliser › Connecteurs › Ajouter un connecteur personnalisé, coller `https://<leon>/api/mcp` (Team, Enterprise : un propriétaire de l'organisation). Desktop reprend le connecteur du compte. | CIMD | `https://claude.ai/api/mcp/auth_callback` |
| **ChatGPT** | Plugins › Add custom MCP server. Formule non vérifiée (l'aide d'OpenAI répond 403) : corriger ce guide et `settings.clientChatgptHow` (messages en et fr) selon ce qu'on voit. | CIMD | `https://chatgpt.com/connector_platform_oauth_redirect`, ou `https://chatgpt.com/connector/oauth/<id>` (noter le format de `<id>`) |
| **Claude Code** | `claude mcp add --transport http leon https://<leon>/api/mcp`, puis `/mcp` dans Claude Code. | CIMD ou DCR | bouclage, port variable |
| **Codex** | `codex mcp add leon --url https://<leon>/api/mcp`, puis `codex mcp login leon`. | CIMD ou DCR | bouclage |
| **Cursor (bureau)** | `mcp.json`, champ `url`. | DCR | `http://localhost:8787/callback` (la web : `https://www.cursor.com/agents/mcp/oauth/callback`) |
| **VS Code** | `mcp.json`, `"type": "http"`, champ `url`. | CIMD ou DCR | `http://127.0.0.1:33418`, ou `https://vscode.dev/redirect` (`https://insiders.vscode.dev/redirect` pour Insiders) |
| **Gemini CLI** | `gemini mcp add --transport http leon https://<leon>/api/mcp`. | DCR | `http://localhost:<port>/oauth/callback` |
| **Antigravity** | `mcp_config.json`, champ `serverUrl`. | DCR | `https://antigravity.google/oauth-callback` |

Dans la PR, pour chaque client : la façon de l'ajouter, ce qu'il a inscrit (nom, adresse de retour, DCR ou CIMD), s'il a renouvelé, ce qu'il affiche à la révocation. Les adresses de retour que Leon accepte sont celles de `FIXED_REDIRECTS` dans `src/server/oauth/clients.ts`, plus `https://chatgpt.com/connector/oauth/<id>` et le bouclage (`127.0.0.1`, `localhost`, http, tout port, tout chemin). Une adresse de plus est une ligne de cette constante, et son essai.

## Les clients de bureau contre `pnpm dev`

Claude Code, Codex, Cursor, VS Code et Gemini CLI appellent depuis l'ordinateur : ils joignent `http://localhost:3000`. Avant la fusion : `docker compose up -d`, `pnpm db:migrate`, `pnpm dev` avec `BETTER_AUTH_URL=http://localhost:3000`, puis chaque commande du tableau avec `http://localhost:3000/api/mcp` à la place de `https://<leon>/api/mcp`. Les points 1 à 7 s'y jouent, le renouvellement au bout d'une heure. Un client qui refuse `http://` pour un serveur local : le noter, ce n'est pas un défaut de Leon.

## Si les documents CIMD ne se lisent pas depuis Railway

Symptôme : pour claude.ai ou ChatGPT, la page répond « Link not valid » au lieu de « Connect an assistant », et les journaux de Railway portent `oauth.client_document_refused` avec une raison (`unreachable`, `status`, `size`, `format`, `document`, `address`). Parade connue : retirer `client_id_metadata_document_supported` des métadonnées du serveur (L3, `src/server/oauth/metadata.ts`, et la même ligne de `src/server/oauth/metadata.contrat.test.ts`) et redéployer : ces clients passent alors par l'inscription (DCR). Les clients gardent les métadonnées jusqu'à une heure.

Même parade pour un client dont le document CIMD n'est pas hébergé chez un hôte de `FIXED_REDIRECTS` (claude.ai, chatgpt.com, www.cursor.com, vscode.dev, insiders.vscode.dev, antigravity.google) : Leon ne le lit jamais, et la page répond « Link not valid ».

## Les points à surveiller

- **Cursor (bureau)** : l'adresse de retour réelle. Si Cursor envoie un schéma d'application (`cursor://…`) ou une autre adresse que celles du tableau, la page répond « Link not valid » et rien n'est autorisé. Lire `redirect_uri` dans l'adresse de la page, la noter, et trancher avec Amos (une ligne de plus dans `FIXED_REDIRECTS`, ou rien).
- **CORS** : aucun en-tête CORS en v1. Un client qui tourne dans un navigateur (VS Code web, MCP Inspector) lit les métadonnées ou appelle la route des jetons depuis une page : sans `Access-Control-Allow-Origin`, le navigateur refuse. S'il échoue, il faut un en-tête dans `metadataResponse` et une réponse à `OPTIONS` sur la route des jetons et l'inscription.
- **`scope` autre que `leon`** : un client qui demande autre chose (`openid`, `offline_access`) revient chez lui avec `error=invalid_scope`, sans rien d'affiché par Leon. Noter le `scope` de l'adresse de la demande.
- **`[::1]` en bouclage** : Leon n'accepte que `127.0.0.1` et `localhost` ; un client qui écoute sur `http://[::1]:<port>/…` est refusé (« Link not valid »).
- **« Authorize » derrière Railway** : le clic ne répond pas « Invalid Server Actions request » (Next compare l'origine du formulaire à l'hôte que le proxy transmet).
- **Un compte à créer pendant l'autorisation** : « Create an account » depuis la page de connexion perd la demande (seule la connexion la garde). Relancer l'ajout dans l'assistant, rien n'est perdu.
- **401 sans `error="invalid_token"`** : le 401 de `/api/mcp` ne dit pas pourquoi (RFC 6750 le recommande pour un accès expiré). Premier suspect si un client ne se renouvelle pas après une heure.
- **ChatGPT** : son document peut déclarer `private_key_jwt`, que Leon n'annonce pas (`none` seulement, point 14 du plan) ; vérifier qu'il s'y range. Il veut aussi `destructiveHint` sur chaque outil : posé sur `remember` seulement, à vérifier à l'essai.
- **Changer `BETTER_AUTH_SECRET`** rend caducs tous les `client_id` d'inscription (DCR), signés avec lui : un client qui rouvre la page avec l'ancien reçoit « Link not valid » tant qu'il ne se réinscrit pas. À ne faire qu'en sachant que des assistants sont connectés.
- Après les essais, **révoquer** les lignes d'essai dans Réglages › Assistants connectés.
