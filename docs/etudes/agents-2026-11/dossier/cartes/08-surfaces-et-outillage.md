# Carte 08 : surfaces et outillage

Périmètre : API Hono, serveur MCP, e-mails, écrans de l'application, extension, configuration, tests, mise en ligne.
Chemins relatifs à `/home/user/leon`. Tout vient d'une lecture réelle des fichiers (lecture seule, rien lancé). Ce qui est une déduction de ma part est marqué « Déduction ». Ce que je n'ai pas lu est en section 7.

## 1. Ce que fait ce module

- Une seule application Next 16 (`next start`, un seul processus Node) sert tout : pages, server actions, API Hono montée sous `/api`, serveur MCP sous `/api/mcp`.
- Les tâches de fond (pg-boss : indexation, point du matin, résumés, fils, connecteurs) tournent dans ce même processus. Elles sont démarrées par `src/instrumentation-node.ts`.
- L'API Hono a trois sortes de portes : jeton `Bearer` (CLI, extension, MCP), cookie de session (interface), publique (santé, Better Auth, OAuth).
- Le MCP expose huit outils, créés à chaque requête, liés au contexte du porteur du jeton. Un seul écrit : `remember`.
- Les e-mails partent par trois appels `fetch` directs vers Resend. Il n'y a ni SDK, ni gabarit commun.
- L'interface a six entrées de navigation, deux langues (`fr`, `en`), un cookie de langue, et aucun écran pour des agents.
- L'extension (WXT) capte les conversations claude.ai et chatgpt.com et les envoie à `POST /api/v1/ingest`.
- La CI lance types, lint, tests unitaires, build, puis tests en base sur Postgres 17 + pgvector.
- La mise en ligne est un seul service Railway : build, migrations en pré-déploiement, `pnpm start`.

## 2. Types et fonctions à connaître

### 2.1 API Hono : déclaration et gardes

`src/server/api/app.ts:22`
```ts
export const app = new Hono<ApiEnv>().basePath('/api');
```
`src/server/api/app.ts:25-29`
```ts
export const handleApiError: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  logError('api.unhandled', error);
  return c.json({ error: 'Internal error' }, 500);
};
```
Montage (`src/server/api/app.ts`, de `app.get('/health'…)` à `app.onError`) :
```ts
app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/v1', ingestRoutes);
app.route('/v1', briefingRoutes);
app.route('/v1', faitsRoutes);
app.route('/v1', contextRoutes);
app.route('/v1', computerRoutes);
app.route('/v1', readRoutes);
app.route('/v1', reminderRoutes);
app.route('/v1', notesRoutes);
app.route('/v1', backstageRoutes);
app.route('/v1', sessionRoutes);
app.route('/mcp', mcpRoutes);
app.route('/oauth', oauthRoutes);
app.route('/v1/connexions/oauth', createOAuthRoutes({ getConnector }));
app.notFound((c) => c.json({ error: 'Introuvable' }, 404));
app.onError(handleApiError);
```
Branchement dans Next : `src/app/api/[[...route]]/route.ts:1-7`
```ts
import { handle } from 'hono/vercel';
import { app } from '@/server/api/app';

export const runtime = 'nodejs';
export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);
```
Seuls GET, POST et DELETE sont exportés. Une route PUT ou PATCH ne serait pas servie. (Déduction : pas de `PUT`/`PATCH` exportés, donc un 405 de Next.)

Garde à jeton, `src/server/api/require-api-token.ts:6-35` :
```ts
export type ApiEnv = { Variables: { ctx: TenantContext; tokenId: string } };
export const BEARER = /^Bearer\s+(\S+)$/i;
export function unauthorized(c: Context, challenge = 'Bearer') { /* 401 { error: 'Missing or invalid token' } */ }
export function apiTokenGuard({ assistant = false }: { assistant?: boolean } = {}): MiddlewareHandler<ApiEnv> { /* … */ }
export const requireApiToken = apiTokenGuard();
```
Le garde pose `c.var.ctx` (un `TenantContext`) et `c.var.tokenId`. Un jeton de type `assistant` (OAuth) n'ouvre que la route montée avec `assistant: true` (seule `/api/mcp`) ; partout ailleurs, le même 401 qu'un jeton inconnu.

Vérification du jeton, `src/server/auth/api-tokens.ts:258` :
```ts
export async function verifyApiToken(
  token: string,
): Promise<{ tokenId: string; ctx: TenantContext; kind: ApiTokenKind } | null> {
```
`src/capture/api-contract.ts:28` : `export const API_TOKEN_PATTERN = /^leon_[A-Za-z0-9_-]{43}$/;`. Le jeton est stocké en SHA-256 (`hashApiToken`). La table `api_tokens` (`src/server/db/schema/api-tokens.ts`) a `kind` `'manuel' | 'ordinateur' | 'assistant'`, `revokedAt`, `expiresAt`, `retraits` (jsonb). Le membre est revérifié à chaque appel (jointure sur `members`).

Garde à session (UI), `src/server/api/session-routes.ts:25-57` :
```ts
export type SessionEnv = { Variables: { ctx: TenantContext } };
export const requireSession: MiddlewareHandler<SessionEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const ctx = session
    ? await resolveSessionContext(session.user.id, session.session.activeOrganizationId ?? null)
    : null;
  if (!ctx) return c.json({ error: 'Session requise' }, 401);
  c.set('ctx', ctx);
  await next();
};
const ALLOWED_FETCH_SITES = ['same-origin', 'none'];
export const requireSameOrigin: MiddlewareHandler = async (c, next) => { /* 403 { error: 'Origin not allowed' } */ };
```
Les routes de session (`/api/v1/recherche/reponse`, `/api/v1/discussions/:id/messages`) posent `requireSameOrigin, requireSession` route par route. Le commentaire du fichier interdit un `use` global, car il s'appliquerait aussi aux routes à jeton montées sous `/v1`.

Flux SSE, `src/server/api/session-routes.ts:71-76` :
```ts
const PING_MS = 15_000;
function streamEvents(
  c: Parameters<typeof streamSSE>[0],
  events: AsyncIterable<unknown>,
  route: string,
  options: { keepReading?: boolean; leaving?: AbortController } = {},
)
```
Le serveur écrit `data: <json>` par évènement et un commentaire `: ping` toutes les 15 s. Côté page : `createEventStreamReader` (`src/lib/event-stream.ts:5`). Sans modèle : `204`. Trop de réponses en cours pour la personne : `429` (3 réponses en tête, 2 discussions).

Contexte de tenant, `src/server/auth/tenant-context.ts:7-15` :
```ts
export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
  readonly equipe?: boolean;
};
```
`principals` = `[userId, tenantId, ...groupes]`. Résolveurs : `resolveTenantContext(userId, tenantId | null, { includeFormer })` (ligne 71) et `resolveSessionContext(userId, activeOrganizationId)` (ligne 91). Toute lecture ou écriture de base passe par `withTenant(ctx, fn)` (`src/server/db/with-tenant.ts:18`).

Corps de requête : chaque route à jeton applique `bodyLimit({ maxSize, onError: (c) => c.json({ error: 'Request too large' }, 413) })` après le jeton et avant la lecture. Les plafonds sont des constantes de `src/capture/api-contract.ts` : `FAITS_BODY_MAX_BYTES = 64 KiB` (l.132), `RETRAIT_BODY_MAX_BYTES = 1 KiB`, `CONTEXT_BODY_MAX_BYTES = 4 KiB`, `READ_BODY_MAX_BYTES = 4 KiB`, `RAPPEL_BODY_MAX_BYTES = 16 KiB`, `NOTER_BODY_MAX_BYTES = 16 KiB`, `USAGES_BODY_MAX_BYTES = 1 KiB`, `COULISSES_BODY_MAX_BYTES = 256 KiB`. `INGEST_BODY_MAX_BYTES = 2 MiB` est dans `src/capture/turn.ts`. Better Auth : `AUTH_BODY_MAX_BYTES = 64 * 1024` (`auth-routes.ts`).

Chemins publics de l'API, `src/capture/api-contract.ts:5-26` : `API_PATHS` (`ingest`, `me`, `briefing`, `mcp`, `faits`, `contexte`, `ordinateurs`, `jeton`, `retrait`, `dossier`, `fil`, `chercher`, `versions`, `lecons`, `rappel`, `noter`, `coulisses`, `usages`, `oauthClients`, `oauthJeton`). Ce fichier est partagé avec la CLI et l'extension.

Exemple complet d'une route à jeton qui écrit, `src/server/api/ingest-routes.ts` :
```ts
export const ingestRoutes = new Hono<ApiEnv>()
  .post('/ingest', requireApiToken,
    bodyLimit({ maxSize: INGEST_BODY_MAX_BYTES, onError: (c) => c.json({ error: 'Request too large' }, 413) }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined);
      const parsed = RoutePayloadSchema.safeParse(body);
      if (!parsed.success) { /* 400 { error: 'Invalid request', issues: [{ path, code }] } sans les valeurs */ }
      const result: IngestResult = await ingestTurns(c.var.ctx, parsed.data);
      return c.json(result, 202);
    })
  .get('/me', requireApiToken, async (c) => c.json(await getViewerProfile(c.var.ctx)));
```

Limite de débit : seule la connexion en a une, en base. `src/server/auth/rate-limit.ts:26-54` :
```ts
export const AUTH_LIMITS = {
  connexion: { email: 10, ip: 50, inconnue: 500 },
  inscription: { email: 5, ip: 10, inconnue: 100 },
  recuperation: { email: 5, ip: 10, inconnue: 100 },
  invitation: { email: 3, ip: 20, inconnue: 200 },
} as const;
export async function authAttemptAllowed(kind: AuthAttempt, email: string, headers: Headers, author?: string): Promise<boolean>
```
Fenêtre de 15 minutes. Aucune route à jeton n'a de limite de débit (je n'en ai pas vu).

### 2.2 MCP : définition d'un outil

`src/server/mcp/server.ts:16-35` :
```ts
export function createLeonMcpServer(
  ctx: TenantContext,
  client: string,
  deps: { embedder: Embedder | null },
): McpServer {
  const server = new McpServer(
    { name: 'leon', version: '0.1.0' },
    { instructions: MCP_INSTRUCTIONS },
  );
  registerSearchTool(server, ctx, client, deps);
  registerFetchTool(server, ctx, client);
  registerThreadTools(server, ctx, client);
  registerLessonsTool(server, ctx, client);
  registerBriefingTool(server, ctx, client);
  registerRememberTool(server, ctx, client);
  return server;
}
```
Outils enregistrés (noms lus dans le code) : `search`, `fetch`, `threads`, `thread`, `versions` (les trois dans `registerThreadTools`), `lessons`, `briefing`, `remember`. Fichiers : `src/server/mcp/tools/*-tool.ts` et `thread-tools.ts`.

`src/server/mcp/tools/guarded.ts:6`
```ts
export function guarded<Args>(tool: string, run: (args: Args) => Promise<CallToolResult>) {
  return async (args: Args): Promise<CallToolResult> => {
    try { return await run(args); }
    catch (error) {
      logError('mcp.tool_failed', error, { tool });
      return { isError: true, content: [{ type: 'text', text: 'Leon internal error.' }] };
    }
  };
}
```
Outil d'écriture, `src/server/mcp/tools/remember-tool.ts:47-60` :
```ts
export function registerRememberTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'remember',
    {
      title: 'Save a note',
      description: REMEMBER_DESCRIPTION,
      inputSchema: RememberInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('remember', async ({ text, about, note, version }) => { /* … */ }),
  );
}
```
`RememberInputSchema` est un `z.object` (`text`, `about?`, `note?` uuid, `version?`). Un refus est un résultat `{ isError: true, content: [{ type: 'text', text }] }` avec un message fixe qui ne recopie pas l'entrée. Un succès rend `content` + `structuredContent`.

Outil de lecture avec schéma de sortie, `src/server/mcp/tools/briefing-tool.ts:33-50` : `outputSchema: BriefingResponseSchema`, `annotations: { readOnlyHint: true, openWorldHint: false }`. Les schémas de sortie partagés sont dans `src/server/mcp/tools/output-schemas.ts` (`SearchOutputSchema`, `FetchOutputSchema`, `ThreadsOutputSchema`, `ThreadOutputSchema`, `VersionsOutputSchema`, `LessonsOutputSchema`).

Montage HTTP, `src/server/api/mcp-routes.ts:17-34` :
```ts
const mcpHandler = createMcpHandler(({ authInfo }) => {
  const { ctx, client } = McpAuthExtraSchema.parse(authInfo?.extra);
  return createLeonMcpServer(ctx, client, { embedder: getEmbedder(env) });
});

export const mcpRoutes = new Hono<ApiEnv>().all('/', apiTokenGuard({ assistant: true }), (c) =>
  mcpHandler.fetch(c.req.raw, {
    authInfo: {
      token: c.var.tokenId,
      clientId: c.var.tokenId,
      scopes: [],
      extra: { ctx: c.var.ctx, client: clientLabelFromUserAgent(c.req.header('user-agent')) },
    },
  }),
);
```
`clientLabelFromUserAgent(userAgent: string | undefined): string` (`src/server/mcp/client-label.ts`) : premier mot du User-Agent, minuscules, `[a-z0-9._-]`, 40 caractères au plus, `mcp` à défaut. Paquet : `@modelcontextprotocol/server` 2.3.1 (client de test : `@modelcontextprotocol/client`, devDependency).

### 2.3 E-mail

Trois points d'envoi, tous en `fetch` vers Resend :

`src/server/email/invitation.ts:14-25`
```ts
export const mailConfigured = () => Boolean(env.RESEND_API_KEY && env.LEON_EMAIL_FROM);

export async function sendInvitationEmail(input: {
  to: string;
  url: string;
  locale: Locale;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
}): Promise<void>
```
Corps envoyé à `https://api.resend.com/emails` : `{ from: env.LEON_EMAIL_FROM, to: [input.to], subject, html }`, `signal: AbortSignal.timeout(10_000)`, lève `Invitation email failed (<status>)` si `!response.ok`.

`src/server/email/account-deleted.ts:13-19`
```ts
export const RESEND_BATCH_MAX = 100;
export async function sendDeletionEmails(input: {
  recipients: { email: string; kind: 'account' | 'organization' }[];
  locale: Locale;
  organizationName: string;
}): Promise<void>
```
Envoi par lot vers `https://api.resend.com/emails/batch`. Sans Resend configuré : retourne sans rien faire (pas d'erreur).

`src/server/auth/auth.ts` (l.76-100) : `sendAuthEmail(email, url, locale, copy)` (non exportée) pour la réinitialisation du mot de passe et la vérification d'adresse, avec `sendAuthEmailDetached` qui lit la langue dans la requête. Sans `signal` de délai.

Gabarit : il n'y en a pas. Le HTML est une chaîne `` `<p>${t(...)}</p><p><a href="${url}">${t(...)}</a></p>…` `` écrite dans chaque fichier. Les textes viennent de `createTranslator({ locale, messages, namespace })` de `next-intl` (utilisable hors requête Next), avec `messages = (await import(`../../../messages/${locale}.json`)).default`. Espaces de noms : `auth`, `team.mail`, `deleteAccount`. `escapeHtml` est recopié dans `invitation.ts` (échappe `& < > "`) et `account-deleted.ts` (échappe `& < >` seulement).

### 2.4 Environnement et journal

`src/server/env.ts:30` `export const EnvSchema = z.object({…}).superRefine(…)` ; `src/server/env.ts:163` `export const env = parseEnv(process.env);` (validé à l'import ; `instrumentation-node.ts` l'importe au démarrage). Convention : `z.preprocess(emptyIsAbsent, z.string().min(1).optional())` (une variable vide vaut absente).

Variables obligatoires dans le schéma : `DATABASE_URL` (regex `^postgres(ql)?://`), `BETTER_AUTH_SECRET` (32 caractères au moins), `BETTER_AUTH_URL` (url). Tout le reste est facultatif. Règles croisées (`superRefine`) :
- `LEON_LLM=factice` refusé quand `NODE_ENV === 'production'`.
- `LEON_IP_HEADER` obligatoire en production (sauf `NEXT_PHASE === 'phase-production-build'`).
- un modèle `LEON_MODEL_*` d'OpenRouter exige `OPENROUTER_API_KEY`.
- `LEON_EMBEDDINGS` (hors `factice`) exige la clé de son fournisseur (`VOYAGE_API_KEY`, `MISTRAL_API_KEY`, `LEON_BGE_URL`, `OPENROUTER_API_KEY` + `LEON_EMBEDDINGS_MODEL`).
- `LEON_CONNECTORS_KEY` : 32 octets en base64.
- `LEON_ADMINS` : liste d'e-mails séparés par des virgules, transformée en tableau (`string[]`).

Autres lecteurs d'environnement hors de `env.ts` : `DATABASE_URL_ADMIN` (seulement `src/server/db/migrate-cli.ts`), `LEON_URL` et `LEON_TOKEN` (`src/cli/env.ts`), `WXT_PUBLIC_LEON_URL` (extension), `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `RAILWAY_*`, les `LEON_OAUTH_*` et `PIPEDREAM_*` (non lus en détail : voir `.env.example`).

`src/server/log.ts:37`
```ts
export function logError(event: string, error: unknown, ids: Record<string, string> = {}): void {
  console.error('[leon]', event, JSON.stringify({ ...ids, error: safeErrorSummary(error) }));
  Sentry.captureException(error, { tags: { event }, extra: ids });
}
```
Pas de logger structuré pour l'information : `console.info` / `console.warn` avec le préfixe `[leon]` (voir `src/instrumentation-node.ts`).

### 2.5 Navigation, écrans, server actions

`src/components/verre/shell/nav.ts:15-30`
```ts
export type NavItem = {
  href: string;
  label: string;
  labelKey: 'home' | 'discussions' | 'documents' | 'team' | 'connections' | 'settings';
  icon: LucideIcon;
  end?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Recherche', labelKey: 'home', icon: House, end: true },
  { href: '/discussions', label: 'Discussions', labelKey: 'discussions', icon: MessageSquare },
  { href: '/documents', label: 'Documents', labelKey: 'documents', icon: FileText },
  { href: '/team', label: 'Équipe', labelKey: 'team', icon: Users },
  { href: '/connections', label: 'Connexions', labelKey: 'connections', icon: Plug },
  { href: '/settings', label: 'Réglages', labelKey: 'settings', icon: Settings2 },
];
```
`NAV` est lu par la barre latérale, la feuille mobile et la barre de commande (`command-palette.tsx`, `NAV.map(...)` à l'ouverture). Libellé affiché : `messages/fr.json` `navigation.<labelKey>` (« / » s'y appelle Accueil). `label` est le libellé français cité par les guides (`src/test/contracts/guides-docs.test.ts`).

`src/server/shell/shell.ts:19-31` (lu à chaque rendu du layout `(app)`, dans une seule transaction `withTenant`) :
```ts
export type SidebarData = {
  image: string | null;
  recents: { id: string; title: string }[];
  reconnect: ProviderId[];
};
export async function readSidebar(ctx: TenantContext): Promise<SidebarData>
```
`src/components/verre/shell/app-shell.tsx:19` : `export type AppShellProps = Viewer & SidebarData & { children: ReactNode };`. Le layout `src/app/(app)/layout.tsx` fait : `requireUserContext()`, redirection vers `/welcome` si l'onboarding n'est pas fini, puis `Promise.all([getViewerProfile, channelHealth, readSidebar])`, et passe `stale={staleChannels(channels, new Date())}` et `admin={isAdmin(profile.email)}`.

Server action, convention (`src/app/(app)/team/actions.ts`, `src/app/(app)/settings/actions.ts`, `src/app/(app)/discussions/actions.ts`) :
```ts
'use server';
export async function setSeeAllAction(memberId: string, on: boolean): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = z.boolean().safeParse(on).success && (await setSeeAll(ctx, memberId, on));
  if (ok) revalidatePath('/team');
  return { ok };
}
```
Session et contexte : `requireUserContext()` (`src/server/auth/session.ts:65`, redirige vers `/sign-in` ou `/welcome`), `getSession` (l.26, `cache()` de React), `signedInRecently()` (connexion de moins d'une heure), `requestHeaders()`.

Exemple d'action de décision déjà existante, `src/app/(app)/discussions/actions.ts:158` :
```ts
export async function decideActionAction(
  actionId: string,
  decision: 'confirmer' | 'annuler',
): Promise<ActionView | null>
```

### 2.6 Actions proposées (existant, utile au futur « à valider »)

`src/lib/actions.ts:7-22` : `ACTION_KINDS` = 14 valeurs, toutes préfixées `github.` (`github.creer_branche`, `github.ecrire_fichier`, `github.ouvrir_pr`, `github.fusionner_pr`, `github.commenter`, …).
`src/lib/actions.ts:64` : `export const ACTION_STATUSES = ['proposee', 'en-cours', 'faite', 'echouee', 'annulee'] as const;`
`src/lib/actions.ts` : `ACTION_VALID_MS = 60 * 60 * 1000` (une proposition expire en une heure), `ACTION_RUNNING_MS = 5 * 60 * 1000`.
`src/server/db/schema/actions.ts:11-31` :
```ts
export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'set null' }),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: ACTION_KINDS }).notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ACTION_STATUSES }).notNull().default('proposee'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  acl: uuid('acl').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});
```
(La politique RLS est dans `0037-actions.sql`, que je n'ai pas lue : voir la carte 07.) `src/server/discussion/github-actions.ts:933` : `decideAction(ctx, id, decision: 'confirmer' | 'annuler', deps)` (annuler → `cancelAction`, confirmer → `claimAction` puis `executeAction` puis `finishAction`). `src/server/discussion/proposed-actions.ts` : `proposeAction`, `listDiscussionActions`, `readAction`, `cancelAction`, `claimAction`, `finishAction`. Carte d'affichage : `src/components/discussion/action-card.tsx`.

### 2.7 Internationalisation

`src/i18n/request.ts:7-12, 27`
```ts
export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'leon-locale';
export default getRequestConfig(async () => {
  const locale = localeOf((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: await loadMessages(locale) };
});
```
Le type des clés vient de `messages/fr.json` (`declare module 'next-intl' { interface AppConfig { Messages: Messages } }`). Espaces de noms de premier niveau de `fr.json` : `auth`, `navigation`, `documents`, `team`, `shell`, `preferences`, `about`, `aboutSuggestion`, `search`, `welcome`, `filters`, `common`, `discussions`, `thread`, `discussionView`, `errors`, `searchResults`, `answer`, `connections`, `settings`, `memory`, `security`, `deleteAccount`, `deleteOrganization`, `site`, `onboarding`, `computer`, `oauth`, `claudeCode`. Les plus gros : `settings` (219 clés), `connections` (125), `auth` (86), `team` (73), `memory` (59).

## 3. Comment ça s'exécute

### Une requête à jeton (CLI, extension, MCP)
1. Next reçoit `/api/...` et passe à `handle(app)` (route catch-all).
2. Le routeur Hono de la route lance `requireApiToken` : lit `Authorization: Bearer`, `verifyApiToken` (SHA-256, non révoqué, non échu, membre toujours présent), pose `ctx` et `tokenId`.
3. `bodyLimit`, puis `c.req.json().catch(() => undefined)` et `safeParse` zod `.strict()`. En cas d'échec : 400 sans recopier les valeurs reçues.
4. Les fonctions de `src/server/**` reçoivent `ctx` et ouvrent `withTenant(ctx, …)` : le contexte est posé en `set_config` local à la transaction, les politiques RLS filtrent.
5. Les erreurs non attrapées sortent par `handleApiError` : 500 `{ error: 'Internal error' }`, journalisé par `logError('api.unhandled', …)`.

Les « usages » : certains corps portent `usages: string[]` (`lecture`, `noter`, `coulisses`, `resume`). C'est l'accord que l'outil du poste a recueilli. La route refuse (403) si l'usage manque. Au MCP, brancher le connecteur vaut accord de lecture (aucun usage vérifié, d'après le commentaire de `thread-tools.ts`).

### Une requête de l'interface en flux (réponse en tête, discussion)
`requireSameOrigin` puis `requireSession` (cookie Better Auth, jamais de jeton : la contrainte est testée par `src/test/contracts/session-only.test.ts`), puis `streamSSE`. Le lecteur parti : la réponse en tête s'arrête (`AbortController`), la discussion continue de lire sans écrire pour que la réponse soit gardée.

### Une server action
Appelée depuis un composant client. `requireUserContext()` d'abord, validation zod, appel à la fonction de `src/server/**`, `revalidatePath(...)`, retour d'un objet `{ ok }` ou `{ error }`. Next limite le corps à 12 Mo (`next.config.ts` : `experimental: { serverActions: { bodySizeLimit: '12mb' } }`).

### Un e-mail
Une action ou un hook Better Auth appelle une fonction d'envoi. Elle charge `messages/<locale>.json`, construit le HTML, appelle Resend en `fetch`. Le serveur ne sait pas la langue d'une personne hors requête : la langue n'est qu'un cookie (`leon-locale`), je n'ai trouvé aucune colonne `locale` dans `src/server/db/schema/`. `sendAuthEmailDetached` retombe sur `DEFAULT_LOCALE` (`en`) hors requête.

### Démarrage du processus
`src/instrumentation.ts` : `register()` (runtime `nodejs`) importe `sentry.server.config` puis `startNodeInstrumentation()` (`src/instrumentation-node.ts:3`), qui, hors `next build` : valide l'environnement, lance dans l'ordre `startSearchWorker`, `startBriefingWorker`, `startResumeWorker`, `startThreadsWorker`, `startThreadLinksWorker`, `startFilStateWorker`, puis `startConnectorWorker` seulement si `LEON_CONNECTORS_KEY` est posée, puis `warnIncompleteOAuthPairs()`. Sans modèle, les workers qui en ont besoin démarrent et terminent leurs jobs sans rien faire.

### Mise en ligne
`railway.json` (racine) :
```json
{
  "build": { "builder": "RAILPACK", "buildCommand": "pnpm build" },
  "deploy": {
    "preDeployCommand": ["pnpm db:migrate"],
    "startCommand": "pnpm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "overlapSeconds": "0",
    "drainingSeconds": "10",
    "restartPolicyType": "ON_FAILURE"
  }
}
```
- `pnpm build` = `pnpm build:cli && next build --webpack` (`package.json`). `build:cli` compile `src/cli/leon.ts` en un fichier `public/cli/leon-<version>.mjs` + `public/cli/version.json`, servis tels quels (`vite.cli.config.ts`).
- `pnpm db:migrate` = `node --env-file-if-exists=.env.local --import tsx src/server/db/migrate-cli.ts`. Il ne lit que `DATABASE_URL_ADMIN`. `runMigrations(adminUrl, dir)` (`src/server/db/migrate.ts:15`) prend un verrou consultatif (`LOCK_KEY = 7_270_331`), crée `leon_migrations(name text primary key, applied_at timestamptz)`, applique les fichiers `NNNN-nom.sql` (motif `^\d{4}-[a-z0-9-]+\.sql$`) dans l'ordre, une transaction par fichier.
- `/api/health` ne touche pas la base : `{ ok: true }`.
- README « En ligne » : une instance, base AWS RDS (Francfort), `LEON_IP_HEADER=x-real-ip`, `NODE_ENV=production`, `BETTER_AUTH_URL`, adresses de base en `sslmode=verify-full` avec `sslrootcert=/app/certs/rds-eu-central-1-bundle.pem` (le dossier `certs/` est versionné).
- Pool : `src/server/db/client.ts:12` `new Pool({ connectionString: env.DATABASE_URL, max: 4 })`, pg-boss `max: 2` plus une connexion d'écoute : 7 connexions par instance, 14 pendant le recouvrement d'une mise en ligne.
- Docker : `docker-compose.yml` ne contient que Postgres (`pgvector/pgvector:pg17`, `127.0.0.1:54329`, `max_connections=300`). Il n'y a pas de Dockerfile (Railpack construit).

### CI
`.github/workflows/tests.yml`, sur `pull_request` et `push` sur `main` :
- Job `code` (15 min) : `pnpm install --frozen-lockfile`, `pnpm typecheck` (`tsc --noEmit && tsc --noEmit -p extension`), `pnpm lint` (`biome check .`), `pnpm test:unit`, `pnpm build` avec trois variables factices (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- Job `base` (20 min) : service `pgvector/pgvector:pg17` sur le port 54329, `psql -f docker/postgres/init.sql`, `LEON_TEST_ACCEPTE_MIGRATIONS_DESTRUCTIVES: oui`, puis `pnpm test:db`.
- Node 24, pnpm lu dans `packageManager` (`pnpm@11.0.8`), `cancel-in-progress` seulement sur les PR.
- Aucun job ne déploie : Railway déploie ce qui arrive sur `main`, d'après le commentaire du workflow (« c'est ce que Railway déploie »).

## 4. Conventions

### Langues et nommage
- Commentaires en français. Identifiants de code mélangés : anglais pour la technique (`requireApiToken`, `ingestRoutes`, `bodyLimit`), français pour le métier (`faits`, `fils`, `leçons`, `coulisses`, `rappel`, `noter`, `proposee`, `faite`, `echouee`). Les chemins d'API suivent la même règle (`/v1/ingest`, `/v1/faits`, `/v1/dossier`).
- Textes lus par des machines ou des assistants (MCP, erreurs JSON de l'API, CLI) : anglais (`'Invalid request'`, `'Request too large'`, `'Missing or invalid token'`, `'Leon internal error.'`). Exceptions : `'Introuvable'` (404 de l'app) et `'Session requise'` (401 des routes de session).
- Fichiers : `<domaine>-routes.ts` pour les routeurs Hono (`ingest-routes.ts`), `<nom>-tool.ts` pour un outil MCP, `actions.ts` pour les server actions à côté de `page.tsx`, ASCII et minuscules avec tirets.
- Migrations : `src/server/db/migrations/NNNN-nom.sql` (89 fichiers, dernier lu : `0074-points-lignes-retirees.sql`).
- Composants : `src/components/verre/<écran>/…` (design « Papier »), anciens dossiers `src/components/discussion`, `search`, `site`. Import unique depuis `@/components/verre`.
- Aliases : `@/*` → `src/*` (`tsconfig.json`). Le code partagé avec la CLI et l'extension (`src/capture/`) s'importe en relatif seulement (décision D1, d'après `extension/lib/api.ts` : `../../src/capture/api-contract`).

### Validation et erreurs
- Zod 4 partout (`zod@4.6.7`). Entrées d'API : `.strict()`, 400 sans valeurs reçues (« elles peuvent contenir des secrets »), parfois `issues: [{ path, code }]` sans valeurs.
- `.catch(() => undefined)` sur `c.req.json()` pour qu'un corps illisible donne un 400 et non un 500.
- Jamais de message d'erreur brut vers le client : `handleApiError` (HTTP), `guarded` (MCP), codes traduits dans les server actions. Un message de base de données peut citer du texte de conversation : `safeErrorSummary` n'en garde que le nom et les champs `code`, `constraint`, `table`.
- Un seul 401 par garde, sans dire pourquoi.
- Les échecs de mise en file ne font jamais perdre les données déjà écrites : `try/catch` autour de `enqueueRangement` / `enqueueResume` dans `faits-routes.ts`, `logError('faits.rangement_enqueue', …)`.

### Journalisation
`logError(event, error, ids)`, événement en `domaine.evenement` (`api.unhandled`, `mcp.tool_failed`, `faits.rangement_enqueue`, `computer.register_failed`). Les ids sont des identifiants, jamais du texte. Ni texte de note, ni jeton, ni commande n'est journalisé (commentaires de `notes-routes.ts`, `context-routes.ts`, `computer-routes.ts`).

### Tests
- Vitest 5, trois projets (`vitest.config.ts`) :
  - `unit` : `src/**/*.test.ts` et `extension/**/*.test.ts`, hors `*.db.test.ts`, groupe 0.
  - `db` : `src/**/*.db.test.ts`, `globalSetup: src/test/global-setup.ts` (migre la base de test avec `DATABASE_URL_ADMIN`), `testTimeout: 20_000`, `maxWorkers: 4`, groupe 1.
  - `db-seul` : un seul fichier, `src/server/search/worker.db.test.ts`, `maxWorkers: 1`, groupe 2 (test de débit).
  - Tous : `setupFiles: ['src/test/next-intl.ts']` (qui remplace `next-intl/server` par les messages français), `env: TEST_ENV`.
- Scripts : `pnpm test` (tout), `pnpm test:unit`, `pnpm test:db` (= `--project db --project db-seul`).
- Nommage : `x.test.ts` (sans base), `x.db.test.ts` (Postgres réel), `x.mesure.db.test.ts` (mesure de débit ou de coût, ex. `context-routes.mesure.db.test.ts`), `x.contrat.test.ts` (dans `src/cli/`, contrats de la CLI), `src/test/contracts/*.test.ts` (gardes transverses).
- Titres de tests en français (`it("n'expose pas le message d'une erreur inattendue et la journalise", …)`).
- Environnement de test `src/test/test-env.ts:44` `TEST_ENV` : `DATABASE_URL` (rôle `leon_app`, sous RLS) et `DATABASE_URL_ADMIN` (rôle `leon_owner`) vers `leon_test` (ou `LEON_TEST_DATABASE`, nom qui doit commencer par `leon_test`), clé de connecteurs fixe, toutes les clés de fournisseur vidées (pour qu'une clé du poste ne change rien), `LEON_IP_HEADER: 'x-real-ip'`.
- Appeler l'API sans serveur : `apiRequest(path, { token, method, body })` (`src/test/api-request.ts:4`) → `app.request(...)`. Le MCP se teste avec le vrai client (`StreamableHTTPClientTransport`) dont le `fetch` est `app.request` (`src/server/mcp/mcp.db.test.ts`).
- Jeu d'essai : `src/test/fixtures.ts` (`createTestTenant`, `createTestUser`, `seedSource`, `seedThread`, `seedConnection` ; préfixe `seed` = insertion par le rôle propriétaire `adminDb`, hors RLS), `src/test/seed-indexed.ts` (`newTeam(names, tenantIds)`, `seedIndexed`, `emailOf`, `dropTeams`), `src/test/seed-search.ts` (`seedRun`, `seedPassages`), `src/test/briefing-points.ts` (`seedPoint`, …), `src/test/fake-connector.ts`, `src/test/fake-oauth-connector.ts`, `src/test/fake-fetch.ts`. Faux modèle : `createFakeLlm` (`src/server/llm/fake-llm.ts`). Faux vecteurs : `createFakeEmbedder`. Chaque test crée ses propres lignes (ids aléatoires) et nettoie en fin (`afterAll(() => dropTeams(tenantIds))`). La file pg-boss se coupe par `vi.mock('@/server/pipeline/queue')` et `vi.mock('@/server/briefing/queue')`.
- Je n'ai trouvé aucun script de données de démonstration pour peupler une base de développement. Seuls existent : `LEON_LLM=factice` (faux modèle sans clé) et `pnpm leon import-claude-code --dry-run`. Je n'ai pas cherché dans `prototypes/` ni dans `docs/`.
- Contrats transverses (`src/test/contracts/`, tournent dans `unit` ou `db`). Les plus utiles à qui ajoute du code :
  - `route-guards.db.test.ts` : lit `app.routes` ; toute route non publique doit répondre 401 ou 403 sans identité. Liste publique fermée : `/api/health`, `/api/auth/`, `/api/v1/connexions/oauth/`, `/api/oauth/(clients|jeton)`. Une route de webhook publique doit être ajoutée à `PUBLIC` à la main.
  - `next-route-handlers.test.ts` : liste fermée des `route.ts` de `src/app` (API, `documentation.md`, `install`, trois `.well-known`). Un nouveau `route.ts` casse le test.
  - `env-contract.test.ts` : toute variable lue dans `src/**` ou `extension/**` (`process.env.X`, `import.meta.env.X`, clés zod des fichiers `env.ts`, `cli/env.ts`, `migrate-cli.ts`) doit figurer dans `.env.example`, et réciproquement ; chaque variable y a un commentaire (`commentBefore`).
  - `privileges.test.ts` : `set_config(` seulement dans `with-tenant.ts` et `sessions/reminder.ts` ; `adminDb` / `adminPool` seulement dans les tests ; `DATABASE_URL_ADMIN` seulement dans `migrate-cli.ts`, les tests et `.env.example`.
  - `ui-imports.test.ts` : les fichiers de `src/app` et `src/components` n'importent jamais la base (`@/server/db`, `pg`, `drizzle-orm`), et un composant client n'importe d'un module serveur que des types (ou une server action).
  - `session-only.test.ts` : pas de plugin `bearer` dans Better Auth, donc une action de site n'accepte pas un jeton.
  - `translation-keys.test.ts` + `src/i18n/messages.test.ts` : mêmes clés et mêmes paramètres ICU en `fr` et `en`, et toute clé lue par `t('…')` existe.
  - `page-links.test.ts` : les liens vers des pages et vers des ancres `/settings#…` mènent à des pages et sections qui existent.
  - `pgboss-wake.test.ts` : chaque `boss.work` passe son handler par `wakeQueueAfter`, chaque file naît par `ensureQueue`.
  - `mcp-descriptions.test.ts` : lie les descriptions et schémas des outils MCP à leurs constantes (j'ai lu seulement l'en-tête).
  - `api-contract.db.test.ts` : contrat des routes de `API_PATHS`.
  - `scripts-contract.test.ts` : les scripts de `package.json` citent des chemins qui existent.
- Lint : `biome check .` (Biome 2.5.15, indentation 2 espaces, ligne 100, guillemets simples, points-virgules, règles `recommended` + domaines `next` et `react`). Exclus : `docs/etudes`, `prototypes`, `extension/.output`, `extension/.wxt`, `.next`, `pnpm-lock.yaml`. Réglage : `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`tsconfig.json`), TypeScript 7.0.2.

### Extension
WXT 0.21.4, MV3, Chrome seulement (`incognito: 'not_allowed'`). Permissions : `storage`, `alarms`, plus `host_permissions` = `https://claude.ai/*`, `https://chatgpt.com/*` et l'origine du serveur (`hostPermissionsFor(serverUrlFromEnv(WXT_PUBLIC_LEON_URL))`, https ou http sur localhost). Chaîne de captation : script de contenu `network-capture.content.ts` (monde MAIN, `document_start`, intercepte `fetch` de complétion avec les parseurs `claude-ai.ts` et `chatgpt.ts`, `window.postMessage`) → `bridge.content.ts` (monde isolé) → `background.ts` (service worker). Le service worker met les échanges dans un tampon (`leon.outbox`, 500 éléments et 4 Mo au plus, `extension/lib/outbox.ts`) et l'envoie toutes les minutes (alarme `leon-flush`) par `postIngest(token, payload)` → `POST /api/v1/ingest` avec le jeton collé par la personne. `getMe` (`GET /api/v1/me`) vérifie le jeton. Un 400 ou 413 abandonne l'élément (`DropReason`: `full`, `refused`, `token`). Le code partagé vient de `src/capture/` (`IngestPayloadSchema`, `API_PATHS`, `ViewerProfileSchema`). Les types captés sont `claude_ai` et `chatgpt` seulement (`SITES` dans `extension/lib/exchange.ts`).

## 5. Points d'extension pour le système d'agents

Tout ce qui suit est une déduction de ma part à partir du code lu, sauf ce qui cite un fichier.

### Une route d'API (déclencheur externe, webhook, appel d'un worker)
- Nouveau fichier `src/server/api/<nom>-routes.ts` exportant un `Hono<ApiEnv>` (ou `Hono<SessionEnv>`), puis une ligne `app.route('/v1', …)` dans `app.ts`. Garde dans la route elle-même (jamais un `use` global).
- Si la route est publique (webhook signé d'un outil), il faut l'ajouter à `PUBLIC` dans `src/test/contracts/route-guards.db.test.ts` et écrire ses propres contrôles (signature, plafond de corps). Aujourd'hui aucun webhook n'existe : le README dit que la relève des connecteurs se fait « sans webhook », toutes les 15 minutes.
- Si le chemin est utilisé par la CLI ou l'extension, l'ajouter à `API_PATHS` (`src/capture/api-contract.ts`) avec son schéma et son plafond de corps.
- Seuls GET, POST, DELETE sont exportés par la route Next : ajouter `PUT`/`PATCH` à `src/app/api/[[...route]]/route.ts` si besoin.
- Pour un flux en direct (poste de contrôle), reprendre `streamEvents` de `session-routes.ts` (SSE, ping 15 s) et `createEventStreamReader`.

### Un outil MCP (agents pilotables depuis un assistant)
- Ajouter `src/server/mcp/tools/<nom>-tool.ts` avec `registerXTool(server, ctx, client)` qui appelle `server.registerTool(name, { title, description, inputSchema, outputSchema?, annotations }, guarded(name, handler))`, puis l'appeler dans `createLeonMcpServer` (`server.ts`). Descriptions en anglais. Le `ctx` est celui du porteur du jeton : tout passe par `withTenant`.
- Un outil d'écriture existe (`remember`), avec `readOnlyHint: false`. Aucun outil n'écrit dans un outil externe. Pour « lister ce qui attend » et « valider », la logique `decideAction` existe côté serveur (`github-actions.ts:933`) mais n'est branchée qu'à une server action de session. Un outil MCP de validation contournerait la règle « seul un clic de la personne dans le navigateur confirme » : choix de conception à trancher (le garde `session-only` protège aujourd'hui les actions d'un jeton).
- Mettre à jour `MCP_INSTRUCTIONS` (`server.ts`) et `src/test/contracts/mcp-descriptions.test.ts` si la description d'un outil change.

### Une tâche de fond (moteur d'agents, standard de tri)
- Le moteur actuel est pg-boss, dans le processus Next. Modèle à copier : `src/server/briefing/queue.ts` (constante `BRIEFING_QUEUES`, `ensureQueue`, `getBoss`) et `src/server/briefing/worker.ts` (`registerWorkers`, `boss.work(name, options, wakeQueueAfter(boss, name, handler))`, `startBriefingWorker` idempotent via `globalThis`). Il faut ensuite ajouter une ligne dans `startNodeInstrumentation` (`src/instrumentation-node.ts`).
- Règles imposées par test : `ensureQueue` pour créer, `wakeQueueAfter` autour de chaque handler (`pgboss-wake.test.ts`).
- Tâche planifiée : le tic de 6 h du point du matin (`BRIEFING_QUEUES.morning = 'point-matin'`) est le seul modèle de tâche à l'horloge que j'aie vu ; son mécanisme exact de planification n'est pas lu en détail (carte 05).
- Ce qui manque : un moyen de lancer un worker sans lancer Next (voir 5.6), et d'activer ou non les workers par variable d'environnement (aujourd'hui `startNodeInstrumentation` démarre tout, sans condition autre que la clé des connecteurs).

### Une action d'écriture
- Généraliser `ACTION_KINDS` / `ACTION_KEYS` (`src/lib/actions.ts`) : le type `ActionName` et `actionName(kind)` supposent le préfixe `github.` (`kind.slice('github.'.length)`), et la colonne `kind` de la table `actions` est un enum SQL ou TypeScript fermé (le type est `text('kind', { enum: ACTION_KINDS })` ; la contrainte SQL éventuelle est dans `0037-actions.sql`, non lue). `discussion_id` est déjà nullable : une action peut exister sans discussion.
- La table n'a ni colonne « agent », ni « niveau d'autonomie », ni « déclencheur », ni « source qui l'a provoquée ». Elle sert déjà de journal des écritures (commentaire de `schema/actions.ts`).
- `ACTION_VALID_MS` (1 h) est pensé pour une proposition vue en direct dans une discussion ; une boîte « à valider » qui dure plusieurs jours demande une autre durée.

### Un écran (poste de contrôle, boîte « à valider »)
- Le poste de contrôle : route `src/app/(app)/agents/page.tsx` (nom à choisir), composant `src/components/verre/agents/…` (comme `connexions/`, `equipe/`), server actions dans `src/app/(app)/agents/actions.ts`, entrée dans `NAV` (`nav.ts`) avec une `labelKey` ajoutée à l'union, et clés `navigation.<clé>` en `fr.json` et `en.json`. Insertion naturelle : après `/discussions` ou avant `/connections`. La barre de commande et la feuille mobile suivent `NAV` toute seules.
- La boîte « à valider » a deux places naturelles : (a) une section de l'Accueil (`src/app/(app)/page.tsx`, composant `Home`, qui charge déjà en parallèle des parties facultatives par `optional('accueil.xxx', …)` et rend le point du matin et le calendrier), (b) une pastille dans la barre latérale. Pour (b) il faut étendre `SidebarData` et `readSidebar` (`src/server/shell/shell.ts`, une seule transaction, déjà utilisée pour « à reconnecter ») et `AppShellProps`. Le mécanisme d'alerte « à reconnecter » (`reconnect`, `stale`) est le modèle.
- Réutiliser `ActionCard` (`src/components/discussion/action-card.tsx`) et `decideActionAction` (`src/app/(app)/discussions/actions.ts:158`), aujourd'hui limités à GitHub.
- La barre « Demander » du haut est masquée sur `/` et `/discussions*` (`AskBar` dans `app-shell.tsx`).
- Réglages du curseur d'autonomie : `/settings` a cinq onglets (`profil`, `securite`, `integrations`, `equipe`, `memoire`, `settings-tabs.tsx`) et un tableau d'ancres `SECTIONS` ; une nouvelle section ou un nouvel onglet doit y figurer (sinon `page-links.test.ts` échoue sur les liens).
- Contraintes UI testées : un composant client ne peut importer qu'un type ou une server action d'un module serveur (`ui-imports.test.ts`).

### Un e-mail avec du contenu de la mémoire (résumé, validation à distance)
- Il faut une fonction nouvelle sur le modèle de `sendInvitationEmail` (mêmes variables, même `fetch`, même `createTranslator`). Il n'existe ni gabarit partagé, ni partie texte, ni `reply-to`, ni lien de désinscription, ni pièce jointe, ni envoi à une adresse hors Leon sans que l'on passe par `members` (`sendInvitationEmailAction` vérifie le lien de l'organisation avant d'envoyer, voir `team/actions.ts`).
- Contenu de la mémoire : le lire sous les droits de la personne destinataire (`withTenant(ctx, …)` avec son `TenantContext`) ; l'échapper en HTML ; le traiter comme donnée, jamais comme instruction (c'est la règle des outils MCP, `MCP_INSTRUCTIONS`) ; ne mettre aucun lien qui exécute une écriture sans clic authentifié.
- La langue : seul le cookie la porte. Pour un envoi sans requête, il faudra la stocker (aucune colonne trouvée).
- Plafond : `RESEND_BATCH_MAX = 100` par lot. Pas de plafond quotidien (le commentaire de `rate-limit.ts` dit que ce serait « une table ou une purge à part, à faire si l'inscription s'ouvre en grand »).
- « Un message par jour avec les boutons » (`systeme-complet.md`) : des boutons dans un e-mail pointeraient vers une URL du site, qui devra passer par la session (`requireSameOrigin` + `requireSession`).

### Une extension du navigateur
Aucun point d'extension prévu pour les agents. L'extension n'a qu'un envoi (`ingest`) et un contrôle (`me`). Elle ne sait capter que `claude_ai` et `chatgpt`. Les fiches d'agent proposées « à partir de ce que chacun redemande à ChatGPT » exigeraient de lire ce qu'elle a déjà capté côté serveur, pas de changer l'extension.

### Un second service (worker Node séparé, ou Rust)
État du dépôt : un seul `package.json` (pas de workspace de paquets ; `pnpm-workspace.yaml` ne contient que `allowBuilds`), un seul `railway.json` à la racine, pas de Dockerfile. Pour un worker Node dans le même dépôt :
1. Un point d'entrée, par exemple `src/worker/main.ts`, lancé comme `pnpm db:migrate` : `node --import tsx <fichier>` (le script `leon` et `db:migrate` utilisent déjà `tsx`). Déduction : les alias `@/…` passent par `tsconfig.json` ; la CLI évite `@/` et utilise des imports relatifs, et le schéma Drizzle utilise `@/lib/actions`. Je n'ai pas vérifié que `tsx` résout `@/` dans ce dépôt : à tester.
2. Refaire démarrer les workers sans Next : extraire de `instrumentation-node.ts` la liste des `startXWorker`, et ajouter une variable (à documenter dans `.env.example`, sinon `env-contract.test.ts` échoue) qui dit quel processus lance quoi. Sans cela, deux services qui exécutent la même instrumentation démarreraient chacun tous les workers.
3. `@/server/env` impose `DATABASE_URL`, `BETTER_AUTH_SECRET` (32 caractères), `BETTER_AUTH_URL`, et en production `LEON_IP_HEADER` : un worker qui importe ce module (par `@/server/db/client`, `@/server/log`, etc.) doit recevoir ces variables, ou on découpe le schéma.
4. Le README dit : « une seule instance de Leon par base, un seul modèle de vecteurs » ; les gardes de concurrence (réponses en cours, vecteurs) vivent en mémoire du processus. pg-boss lui-même est conçu pour plusieurs lecteurs, mais je n'ai pas lu ce que le code de Leon suppose (tic des vecteurs `reindex` en file `stately`, un seul job à la fois).
5. Pool : 4 + 2 + 1 connexions par instance (`db/client.ts`) ; un second service ajoute son propre pool. RDS accepte ~200 connexions d'après le commentaire, et le recouvrement double déjà le compte.
6. Railway : le second service a besoin de sa propre configuration (commande de démarrage différente, pas de `healthcheckPath` HTTP si le worker n'écoute pas). Je n'ai pas lu la documentation de Railway : à vérifier comment un second `railway.json` ou un chemin de configuration par service se déclare dans un seul dépôt. Les migrations ne doivent se lancer qu'une fois (le service web les fait en `preDeployCommand` ; le verrou consultatif de `runMigrations` protège contre deux lancements simultanés).
7. CI : le job `code` fait `pnpm typecheck` (tsc sur `src/**` et `extension`), donc un worker sous `src/` est couvert ; sous un autre dossier il ne l'est pas (`tsconfig.json` n'inclut que `src/**`, `vitest.config.ts`, `vite.cli.config.ts`).
8. Sentry : `src/server/log.ts` importe `@sentry/nextjs`, et son initialisation est dans `src/sentry.server.config.ts` chargé par `instrumentation.ts`. Hors Next, rien ne l'initialise : les `logError` du worker iraient vers la console seulement. Non vérifié.

Pour un service Rust : rien dans le dépôt ne l'accueille. Points de contact avec ce qui existe :
- Il parle à Postgres directement (bases `leon`, rôles `leon_app` sous RLS) : il doit refaire ce que fait `withTenant` (`set_config('app.tenant'…)`, `app.user`, `app.principals`, voir `with-tenant.ts:18-31`) pour que les politiques RLS filtrent. Le contrat `privileges.test.ts` n'en sait rien : il ne scanne que `src/**` et `extension/**` en TypeScript.
- Ou bien il parle à l'API Hono avec un jeton (`leon_…`), et il reste soumis à `requireApiToken`. Aujourd'hui aucun jeton de service (non lié à une personne) n'existe : tous ont `userId` et `tenantId`.
- Il ne passerait ni par `env-contract.test.ts`, ni par `tsc`, ni par Biome (qui ignore les fichiers qu'il ne connaît pas, déduction). La CI actuelle n'a ni Rust ni `cargo` : il faudrait un job de plus dans `tests.yml`.
- Les files pg-boss sont du SQL (schéma `pgboss`, `createSchema: false`, `src/server/pipeline/queue.ts` : `new PgBoss({ connectionString, schema: 'pgboss', createSchema: false, max: 2, useListenNotify: true, flowIntervalSeconds: 300 })`). Un service Rust devrait lire cette table et respecter la même sémantique, ou on lui donne une autre file.

### Ce qu'il faudrait généraliser (liste courte)
- `ACTION_KINDS` fermé et préfixe `github.` ; `ACTION_VALID_MS` d'une heure.
- `SidebarData` / `NAV` fermés à six entrées.
- `API_PATHS` / `route-guards` : listes à tenir à la main.
- Un envoi d'e-mail non mutualisé (trois copies de `fetch` vers Resend, `escapeHtml` en double).
- La langue de la personne : cookie seulement.
- Démarrage des workers : tout ou rien dans `instrumentation-node.ts`.
- Un jeton d'API est toujours lié à un utilisateur ; aucun compte de service.

## 6. Pièges et limites écrites dans le code

- `src/proxy.ts` : `matcher: '/'`. Sans cookie de session, un GET ou HEAD sur `/` est réécrit vers `/home` (site public), avec `Cache-Control: private, no-store`. Un POST sur `/` est une server action et garde sa réponse.
- `next.config.ts` : `X-Frame-Options: DENY` et `frame-ancestors 'none'` sur toutes les pages. Une page de contrôle ne peut pas être intégrée dans un cadre.
- `next.config.ts` : `OLD_PATHS` (`src/lib/old-paths.ts`) redirige de façon permanente (308) d'anciennes adresses françaises. Un nouveau chemin ne doit pas entrer en collision avec elles.
- `LEON_ADMINS` : le commentaire de `env.ts` dit « Absent : David seul », mais le code (`adminEmails`) rend un tableau vide quand la variable est absente, et `.env.example` dit « vide : personne ». Le code fait foi : personne n'est admin par défaut. (Écart de commentaire, non corrigé.)
- `src/server/db/client.ts` : `max: 4` par processus, « 14 au plus pendant le recouvrement » ; commentaire `shortcut:` sur RDS.
- `src/server/auth/rate-limit.ts` : commentaire `shortcut:` : fenêtre unique de 15 minutes, pas de plafond quotidien d'envois.
- `src/server/admin/stats.ts` : `noteActivity` garde un `Map` en mémoire vidé à 10 000 sessions (`shortcut:`).
- `src/server/auth/api-tokens.ts` : commentaire `shortcut:` : le préfixe `Ordinateur : ` est retiré à l'affichage sans vérification.
- `src/server/api/session-routes.ts` : le garde de session n'utilise jamais `getUserContext` (qui lit `next/headers` et lève hors requête Next). Les gardes de la route Hono lisent `c.req.raw.headers`.
- `src/server/auth/auth.ts` : les routes HTTP de Better Auth pour la connexion, l'inscription, la demande de réinitialisation, le changement de mot de passe et l'envoi du lien de vérification sont fermées (`disabledPaths`) : tout passe par les server actions, sous `authAttemptAllowed`. Une action d'agent qui ouvrirait une session ne peut pas passer par `/api/auth`.
- `sendAuthEmail` (`auth.ts`) n'a pas de `signal` de délai ; les deux autres envois ont 10 secondes.
- `sendDeletionEmails` renvoie sans erreur quand Resend n'est pas configuré ; `sendInvitationEmail` lève. `mailConfigured()` n'est défini que dans `invitation.ts`.
- `README.md` : « Deux instances sur la même base (ou deux modèles actifs) ne cassent pas les droits, mais doublent des appels payants et peuvent effacer les vecteurs l'une de l'autre. »
- `README.md` : « Tant que le site tourne, personne ne branche son serveur local sur la base de production. »
- `README.md` : l'inscription est ouverte à qui a l'adresse ; chaque réponse de l'IA se paie sur la clé Anthropic. Aucun budget par société n'existe (`systeme-complet.md` le note aussi comme manque).
- Migrations en test : `MIGRATIONS_DESTRUCTIVES = ['0010-suppression-tri.sql']` dans `src/test/test-env.ts` ; sans `LEON_TEST_ACCEPTE_MIGRATIONS_DESTRUCTIVES=oui`, `global-setup.ts` refuse de migrer `leon_test` partagé. Une branche qui supprime des tables prend sa propre base `leon_test_<nom>`.
- `vitest.config.ts` : les tests de débit tournent seuls (`db-seul`) car ils dépassaient leur limite en parallèle sur la CI.
- Les routes de lecture rendent 200 avec un texte fixe pour un fil introuvable, « jamais 404, que la CLI lit comme un serveur ancien » (`read-routes.ts`).
- `/api/health` ne vérifie pas la base : un service Railway sain au sens du bilan de santé peut avoir une base injoignable.
- Le build de CI (`pnpm build`) passe avec trois variables factices : `env.ts` valide pendant `next build`, mais `NEXT_PHASE=phase-production-build` dispense de `LEON_IP_HEADER`, et `startNodeInstrumentation` retourne avant de démarrer les workers.
- `.gitignore` : `/public/cli/` n'est pas commité (construit à chaque `pnpm build`) ; `.env*` sauf `.env.example`.
- Règle du dépôt (CLAUDE.md) : noms de fichiers en ASCII ; une carte comme celle-ci va dans `docs/etudes/<étude>/…`.

## 7. Ce que je n'ai pas lu

- Le contenu SQL des migrations (`src/server/db/migrations/*.sql`) : politiques RLS de `actions`, `api_tokens`, etc. Voir la carte 07.
- `src/server/auth/auth.ts` en entier (lu : les parties e-mail et `disabledPaths`) ; `members.ts`, `organisation.ts`, `groupes.ts`, `sso.ts`, `annuaire.ts`, `onboarding.ts`, `computer-code.ts`, `computer-authorize.ts`.
- `src/server/oauth/*` et `src/server/api/oauth-routes.ts` au-delà de l'en-tête (serveur d'autorisation OAuth du MCP distant), `src/app/.well-known/**`, `src/app/install/route.ts`, `src/app/documentation.md/route.ts`.
- `src/server/api/backstage-routes.ts`, `computer-routes.ts` et `oauth-routes.ts` : lus en partie seulement. Aucun des tests `*.db.test.ts` d'API n'a été lu en détail (seulement les en-têtes de `read-routes`, `mcp`).
- Les outils MCP `search-tool.ts`, `fetch-tool.ts`, `thread-tools.ts`, `lessons-tool.ts` : lus en partie (en-têtes, schémas d'entrée) ; pas `render.ts` ni les corps des handlers.
- `src/server/shell/shell.ts` au-delà de `readSidebar` (la recherche `searchShell`), `src/components/verre/shell/*.tsx` sauf `app-shell.tsx` (début), `nav.ts`, `rail.ts`, `command-palette.tsx` (grep seulement), `sidebar.tsx`, `mobile-bar.tsx`, `workspace-menu.tsx`.
- Les pages `src/app/(app)/{connections,documents,discussions,team,settings}/page.tsx` (lu : `page.tsx` de l'Accueil, `admin/page.tsx`, `layout.tsx`, `template.tsx`, `settings/actions.ts` en partie, `discussions/actions.ts` en partie), les écrans de `(auth)`, `(onboarding)`, `(site)`.
- `src/components/verre/ui/*` (le kit), `src/lib/verre/*`, `src/components/{discussion,search,site}` sauf `action-card.tsx` (en-tête).
- `messages/fr.json` : structure des clés de premier niveau seulement, plus `navigation`. `messages/en.json` non ouvert (la parité est vérifiée par test).
- `extension/` : lu `wxt.config.ts`, `lib/api.ts`, `lib/outbox.ts` (début), `lib/permissions.ts`, `lib/exchange.ts`, `lib/site-switches.ts`, `entrypoints/background.ts`, `entrypoints/network-capture.content.ts`. Pas lu : parseurs, `intercept.ts`, `capture.ts`, `bridge`, popup et options, consentement.
- `src/cli/*` (CLI de poste) : vu en liste et `env.ts`, `vite.cli.config.ts`.
- `src/sentry.server.config.ts`, `src/sentry-scrub`, le contenu de `src/server/db/client.ts` au-delà du pool, `src/server/ingest/*`, `src/server/briefing/*` au-delà des en-têtes, le détail du tic planifié du point du matin, `src/server/connectors/worker.ts`.
- `docs/` (specs, plans, guides), `PRODUCT.md`, `prototypes/`, `certs/`, `public/`.
- Documentation de Railway et de Railpack : rien lu hors du dépôt. Toute affirmation sur la configuration d'un second service (section 5) est une déduction à vérifier.
- Je n'ai rien lancé : ni tests, ni build, ni `tsx`. La résolution de `@/…` par `tsx` hors Next, le comportement de `@sentry/nextjs` hors Next, et la sémantique de plusieurs lecteurs pg-boss sont non vérifiés.
