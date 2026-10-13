# R5 — Lecture de Leon : serveur MCP, briefing injecté, chatbot de recherche

12 octobre 2026. Complète `lecture.md` sans le recopier. [D] vérifié sur doc officielle aujourd'hui, [P] proposition. Trois changements depuis le premier rapport : la spec MCP courante est **2026-07-28** et **déprécie la DCR au profit des Client ID Metadata Documents (CIMD)** ; le SDK TypeScript est en **v2** (`@modelcontextprotocol/server`) ; ChatGPT appelle désormais ses connecteurs « **plugins** » et réserve les serveurs personnalisés aux plans **Business / Enterprise / Edu**, ce qui tranche le point ouvert.

## 1. Ce que chaque hôte permet (octobre 2026)

| Hôte | MCP distant + OAuth | Plans | Injection auto au démarrage | Où mettre « consulte Leon d'abord » |
|---|---|---|---|---|
| Claude.ai / Desktop / mobile / Cowork | Streamable HTTP, DCR **ou CIMD**, callback `https://claude.ai/api/mcp/auth_callback`, serveur public joignable depuis `160.79.104.0/21` [D] | Free (1 connecteur), Pro, Max ; Team/Enterprise : seuls les Owners ajoutent [D] | **Non** : les hooks d'un plugin sont ignorés en Chat, chargés en Cowork [D] | **Skill d'un plugin** (chargée en Chat) + server instructions ; interdit dans les descriptions d'outils [D] |
| Claude Code | Idem ; les connecteurs claude.ai se synchronisent si login claude.ai (pas avec `ANTHROPIC_API_KEY`) ; loopback `localhost:<port>/callback` [D] | Tous | **Oui** : hook `SessionStart` (startup/resume/clear/compact/fork), stdout ou `additionalContext`, **10 000 caractères**, MCP indisponible pendant le hook → REST ; `UserPromptSubmit` idem, 30 s [D] | Plugin (skill + `.mcp.json` + `hooks.json`) ou CLAUDE.md |
| ChatGPT | Outils `search`/`fetch` imposés ; CIMD recommandé, DCR en repli ; écritures confirmées à la main, deep research lecture seule [D] | **Business, Enterprise, Edu** (developer mode activé par les admins, bêta) ; Plus/Pro/Free n'ont que les plugins **publiés au Directory** [D, lu via proxy] | **Non** | Skill du plugin (Plugins SDK = skills + MCP + UI) [D] |
| Cursor | Streamable HTTP, OAuth, callbacks fixes `www.cursor.com/agents/mcp/oauth/callback` et `localhost:8787/callback` ; `.cursor/mcp.json` ; « Add to Cursor » [D] | Tous ; Team/Enterprise distribuent MCP et hooks par le dashboard [D] | **Oui** : hook `sessionStart` → `additional_context` [D] | Rule « Always Apply » (< 500 lignes) ou AGENTS.md |
| Gemini app | Serveurs MCP par URL | Comptes perso, **US, anglais, 18+** [D] | Non | Inutilisable pour une PME française |
| Gemini CLI | `httpUrl`, OAuth « dynamic discovery » ; **server instructions ajoutées au system prompt** [D] | Tous | **Oui** : hooks `SessionStart`, `BeforeAgent` [D] | GEMINI.md |
| Copilot | `.vscode/mcp.json` ; politique MCP pour Business/Enterprise [D] | Tous | Non documenté | `copilot-instructions.md` (non vérifié) |

Limites : ~150 000 caractères et 240 s par appel sur claude.ai ; 25 000 tokens dans Claude Code, extensible par `_meta["anthropic/maxResultSizeChars"]` [D]. OAuth côté Claude : PKCE S256, `401` avec `WWW-Authenticate: Bearer resource_metadata=…`, `resource` égal à l'URL exacte, **10 s** de réponse sur discovery/register/token, rotation des refresh tokens [D].

## 2. Recommandation ferme

**Stack.** Un service Node/TypeScript : **SDK MCP TypeScript v2** derrière **`mcp-handler` 2.x** de Vercel (route Next.js/Hono, Streamable HTTP sans état, `withMcpAuth` + `protectedResourceHandler` pour la RFC 9728, CIMD) [D], hébergé dans notre région UE avec le reste de Leon. Pas de Cloudflare Workers (`McpAgent` déprécié au profit de `createMcpHandler`, et stack dispersée) [D]. FastMCP 3.x (`RemoteAuthProvider`, `OAuthProxy`) est le second choix si le back est Python [D].

**Auth.** OAuth 2.1 par utilisateur ; Leon (ou l'IdP SaaS de la stack) est l'authorization server : RFC 8414, PKCE S256, `client_id_metadata_document_supported: true` **et** `none` dans `token_endpoint_auth_methods_supported`, sinon Claude retombe en DCR [D]. **CIMD d'abord, DCR gardée** : la DCR crée un client par connexion [D]. Le token porte `sub` = employé et `tenant` ; **le filtre de droits est un pré-filtre dans la requête**, jamais un post-filtre ; audience vérifiée (RFC 8707) [D]. Rate limiting par token et par tenant, 429 + `Retry-After`.

**Outils** (4, annotés `title` + `readOnlyHint`/`destructiveHint`, noms littéraux `search`/`fetch` partout pour ne pas maintenir deux profils) :

1. `search(query, type?, entity?, since?, until?, limit=8)` — readOnly. « Recherche dans la mémoire d'entreprise de l'utilisateur : clients, fournisseurs, projets, personnes, décisions, règles. Utile dès qu'une question porte sur une entité, un contrat, une décision ou un historique interne. Renvoie jusqu'à 8 fiches (id, type, titre, date de mise à jour, extrait, source principale) ; le contenu complet s'obtient avec `fetch`. Ne renvoie que ce que l'utilisateur connecté a le droit de voir. » Retour : Markdown dans `content` **et** `structuredContent` `{results:[{id,title,url}]}` (contrat ChatGPT, citation seulement si `url` non vide) [D].
2. `fetch(id, section?)` — readOnly. « Renvoie une fiche complète : résumé, faits datés avec leur source, contradictions signalées, derniers événements, fiches liées. `section` limite à `summary`, `facts`, `timeline` ou `sources`. » Retour `{id,title,text,url,metadata}` + Markdown ≤ 600 tokens.
3. `briefing()` — readOnly. « Dossiers actifs de l'utilisateur sur 7 jours et faits nouveaux le concernant, une ligne par dossier : id, titre, dernier événement, date. » ≤ 800 tokens.
4. `remember(text, about?)` — write, `destructiveHint:false`. « Dépose une note dans la file d'ingestion de Leon ; elle sera triée et fusionnée comme toute source, jamais écrite directement dans une fiche. »

**Server instructions** (≈ 100 mots ; une consigne comportementale dans une description ferait rejeter le connecteur [D]) : « Leon est la mémoire d'entreprise de l'utilisateur. Pour toute question sur un client, fournisseur, projet, collègue ou décision interne, appelle `search` puis `fetch` avant de répondre et cite l'id et la date. Appelle `briefing` au premier message. » Documenté pour Gemini CLI seulement ; doublé par la **skill** du plugin, seul chargement garanti en Chat [D].

**Briefing injecté.** 5–15 dossiers actifs, faits nouveaux depuis la dernière session, contradictions à vérifier ; ≤ 3 000 caractères (~800 tokens) [P]. À chaque `startup`, `clear`, `compact` ; pas d'injection par prompt en V1 (30 s de timeout, bruit à chaque message) [D]. L'**agent local** déjà installé pour la capture expose `leon briefing --format claude-code|cursor|gemini`, appelé par le hook, qui lit `GET /v1/briefing` sur l'API REST avec le token de poste (MCP indisponible pendant `SessionStart`) [D]. Claude.ai et ChatGPT : outil `briefing` + skill ; l'extension de capture **n'injecte pas** dans la page (fragile, contraire aux CGU) [P].

**Chatbot de recherche.** Pas d'agent : flux fixe **retrieval → réponse citée** avec le **Vercel AI SDK** (`streamText`, `useChat`, `@ai-sdk/anthropic`) [D] ; pas de Claude Agent SDK (harness Claude Code, outils inutiles ici, login claude.ai interdit) [D]. Le serveur fait la recherche hybride lui-même (même index et pré-filtre ACL que `search`) et envoie 5–8 passages en blocs **`search_result`** avec `citations.enabled` (GA, sans bêta, tous modèles actifs) : Claude cite source et titre, `cited_text` n'est pas facturé ; incompatible avec les structured outputs, donc réponse texte [D]. Bornage : system prompt « réponds uniquement à partir des résultats fournis, sinon dis "Je ne trouve pas cette information dans Leon" » ; sous un seuil de pertinence on **n'appelle pas le modèle** [P]. Modèle `claude-opus-5` (`effort: "low"`), repli mesuré `claude-sonnet-5` ; `inference_geo` à tester pour l'UE. Coût par question (≈ 5 000 tokens entrée, 300 sortie) : **≈ 0,03 $ en Opus 5, ≈ 0,013 $ en Sonnet 5**, moins avec prompt caching.

**Distribution.**
- *Claude* : **deux listings** depuis un compte Pro/Max/Team : le serveur comme **MCP connector** (scan automatique, label Community, Verified sur escalade ; annotations, test credentials d'un compte peuplé, doc publique, politique de confidentialité) et un **plugin bundle** (repo GitHub public : skill `leon` + référence au connecteur + `hooks.json`) ; un plugin installé sur claude.ai se synchronise dans Claude Code [D]. Avant listing : connecteur personnalisé par URL, ajouté par l'Owner.
- *ChatGPT* : **plugin au ChatGPT Directory** (développeur vérifié, politique de confidentialité, contact support, test credentials), seul chemin vers Plus/Pro ; Business/Enterprise ajoutent par URL [D].
- *Postes dev* : `leon setup` (binaire de l'agent local) écrit la config Claude Code (`claude mcp add --transport http leon https://mcp.leon.app/mcp --scope user` + hook, ou mieux `claude plugin marketplace add leon-app/plugins && claude plugin install leon`), Cursor (`mcp.json`, `hooks.json`), Gemini CLI, Copilot ; deeplink « Add to Cursor » [D].

## 3. Risques

1. **Fuite de droits** : `search` sans pré-filtre ou `fetch` par id deviné ; tests automatiques par utilisateur sur chaque outil, ids non séquentiels.
2. **Le LLM n'appelle pas Leon** en Chat : mesurer le taux d'appel spontané sur 50 questions, itérer sur descriptions et skill.
3. **ChatGPT Plus** dépend de l'acceptation au Directory : semaines de délai, refus possible.
4. **Exposition publique** et prompt injection via le contenu des fiches (un mail malveillant ressort dans `fetch`) : étiqueter le contenu source comme données.
5. **Dérive des specs** (DCR dépréciée, SDK v2, renommages OpenAI) : ≈ 1 jour/mois.
6. **Budget contexte** : ~2 800 tokens de définitions + 800 de briefing par session ; suivre le « Context cost » du marketplace Claude Code.

## 4. Non vérifié

- Page OpenAI du developer mode en 403, lue via proxy ; le cas **Pro** reste à confirmer dans l'app.
- Prise en compte des **server instructions** par claude.ai, Claude Code, ChatGPT, Cursor.
- `copilot-instructions.md` et distribution MCP à l'échelle d'une organisation GitHub.
- Accès à l'identité utilisateur dans un handler du SDK TS v2 et de `mcp-handler` 2.x.
- `inference_geo` pour l'UE ; tarifs exacts Opus 5 / Sonnet 5 au lancement.
- Limite de 40 outils dans Cursor : absente de la doc actuelle, probablement levée.

## Sources

- Claude, construire un serveur MCP : https://claude.com/docs/connectors/building
- Claude, authentification : https://claude.com/docs/connectors/building/authentication
- Claude, critères de revue : https://claude.com/docs/connectors/building/review-criteria
- Claude, publier au directory : https://claude.com/docs/directory/publish
- Claude, composants de plugin par surface : https://claude.com/docs/plugins/platform-support
- Claude, plans des connecteurs personnalisés : https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Claude Code, MCP : https://code.claude.com/docs/en/mcp
- Claude Code, hooks : https://code.claude.com/docs/en/hooks
- Claude Code, plugins : https://code.claude.com/docs/en/plugins
- Claude Agent SDK : https://code.claude.com/docs/en/agent-sdk/overview
- Claude API, search results et citations : https://platform.claude.com/docs/en/build-with-claude/search-results ; https://platform.claude.com/docs/en/build-with-claude/citations
- Spec MCP 2026-07-28, autorisation : https://modelcontextprotocol.io/specification/latest/basic/authorization
- SDK TypeScript MCP v2 : https://github.com/modelcontextprotocol/typescript-sdk
- Vercel mcp-handler : https://github.com/vercel/mcp-handler
- Vercel AI SDK : https://ai-sdk.dev/docs/introduction ; https://github.com/vercel/ai
- Cloudflare, serveur MCP distant : https://developers.cloudflare.com/agents/guides/remote-mcp-server/
- FastMCP, authentification : https://gofastmcp.com/servers/auth/authentication
- OpenAI, contrat MCP search/fetch : https://developers.openai.com/api/docs/mcp
- OpenAI, Plugins SDK : https://developers.openai.com/apps-sdk ; https://developers.openai.com/apps-sdk/deploy/connect-chatgpt ; https://developers.openai.com/apps-sdk/app-submission-guidelines
- OpenAI, developer mode (via proxy) : https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- Cursor, MCP / hooks / rules : https://cursor.com/docs/context/mcp ; https://cursor.com/docs/agent/hooks ; https://cursor.com/docs/context/rules
- Gemini app : https://support.google.com/gemini/answer/17209137
- Gemini CLI, MCP et hooks : https://geminicli.com/docs/tools/mcp-server/ ; https://geminicli.com/docs/hooks/
- GitHub Copilot, MCP : https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp
