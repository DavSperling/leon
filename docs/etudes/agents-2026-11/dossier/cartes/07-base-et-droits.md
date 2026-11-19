# Carte 07 : base de données et droits

Périmètre : `src/server/db/` (client, `withTenant`, migrations, schéma Drizzle), `src/server/auth/` (organisations, membres, groupes, managers, jetons), et les tests qui imposent des règles à toute nouvelle table. Chemins relatifs à `/home/user/leon`. Tout ce qui suit vient d'une lecture réelle ; ce qui n'a pas été lu est dit en section 7.

## 1. Ce que fait ce module

- Une seule base Postgres. Deux rôles : `leon_owner` (crée et possède les tables, applique les migrations) et `leon_app` (le rôle de l'application, sans `bypassrls`, sans droit de créer dans `public`).
- Les données de chaque organisation sont isolées par la sécurité par ligne (RLS) de Postgres. L'isolation ne dépend pas du code : `leon_app` ne voit une ligne que si la transaction a posé le contexte avec `withTenant`.
- Deux filtres sur la mémoire : `tenant_id = app_tenant()` (l'organisation) et `acl && app_principals()` (la liste d'accès de la ligne croise les « principals » de la personne : elle-même, son organisation, ses groupes).
- Les tables de Better Auth (`user`, `member`, `organization`, `session`...) n'ont pas de RLS. Le code les filtre à la main.
- Groupes, partage de connexion, organigramme et vue manager (`app.vus`) se construisent par-dessus la même ACL, sans changer les politiques de la mémoire.
- Les migrations sont des fichiers SQL numérotés, appliqués par un petit runner maison (pas de drizzle-kit). Le schéma Drizzle est écrit à la main et vérifié contre la base par des tests.
- Les écritures sensibles passent par des fonctions SQL `security definer` bornées (partager, supprimer, compter).
- Trois garde-fous par test : toute table à `tenant_id` a la RLS, `leon_app` ne supprime que là où c'est décidé, les clés vers le brut portent `tenant_id`.

## 2. Types et fonctions à connaître

### Connexion

`src/server/db/client.ts:12`

```ts
globalForPool.leonPool ??= new Pool({ connectionString: env.DATABASE_URL, max: 4 });
export const pool = globalForPool.leonPool;
```

`src/server/db/client.ts:15`

```ts
export const db = drizzle({ client: pool });
```

`db` est la connexion brute : pas de contexte, donc aucune ligne sous RLS. Il sert aux tables sans RLS (Better Auth, `api_tokens`, `invitation_links`) et aux appels de fonctions `security definer`. Le pool est rangé sur `globalThis.leonPool` (Next compile le module en plusieurs copies).

### `withTenant`

`src/server/db/with-tenant.ts:21`

```ts
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

`src/server/db/with-tenant.ts:24`

```ts
const TenantContextSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  principals: z.array(z.uuid()).min(1),
  equipe: z.boolean().optional(),
});
```

`src/server/db/with-tenant.ts:33`

```ts
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const valid = TenantContextSchema.parse(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant', ${valid.tenantId}, true),
                                set_config('app.user', ${valid.userId}, true),
                                set_config('app.principals', ${`{${valid.principals.join(',')}}`}, true)`);
    if (valid.equipe)
      await tx.execute(sql`select set_config('app.vus', equipe_visible()::text, true)`);
    return fn(tx);
  });
}
```

### Variables de session et fonctions SQL

| Variable | Posée par | Lue par | Définie dans |
|---|---|---|---|
| `app.tenant` | `withTenant` | `app_tenant() returns uuid` | `0001-base.sql:6` |
| `app.principals` (littéral `{uuid,uuid}`) | `withTenant` | `app_principals() returns uuid[]` (vide si absent) | `0001-base.sql:8` |
| `app.user` | `withTenant` | `app_user() returns uuid` | `0055-groupes.sql:52` |
| `app.vus` (si `ctx.equipe`) | `withTenant`, via `equipe_visible()` | `app_vus() returns uuid[]` | `0057-manager-voit-tout.sql:75` |

`src/server/db/migrations/0055-groupes.sql:57`

```sql
create function app_est_admin() returns boolean language sql stable set search_path = public, pg_temp
  as $$
    select exists (
      select 1 from member m join "user" u on u.id = m."userId"
      where m."organizationId" = app_tenant() and m."userId" = app_user() and u.deleted_at is null
        and string_to_array(m.role, ',') && array['owner', 'admin'])
  $$;
```

`src/server/db/migrations/0057-manager-voit-tout.sql:112` : `equipe_visible() returns uuid[]` rend les `userId` des gens sous la personne (récursif sur `reporting_lines`, 32 niveaux au plus), sauf comptes supprimés, sauf si `reglages_organisation.managers_voient_tout` est faux, sauf ceux pour qui `manager_follows.voit_tout` est faux.

### Contexte de la personne

`src/server/auth/tenant-context.ts:7`

```ts
export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
  readonly equipe?: boolean;
};
```

`src/server/auth/tenant-context.ts:21`

```ts
export async function principalsFor(userId: string, tenantId: string): Promise<string[]>
```

Rend `[userId, tenantId, ...idsDesGroupes]`. Les groupes sont ceux dont le `service` égale `member.department`, plus ceux de `membres_groupe`. La lecture se fait elle-même sous `withTenant`.

`src/server/auth/tenant-context.ts:71`

```ts
export async function resolveTenantContext(
  userId: string,
  tenantId: string | null,
  { includeFormer = false }: ResolveOptions = {},
): Promise<TenantContext | null>
```

Vérifie l'appartenance dans `member` (et `user.deleted_at is null`, sauf `includeFormer`). `tenantId` nul : première organisation du membre (`firstOrganizationId`, `tenant-context.ts:42`). `resolveSessionContext(userId, activeOrganizationId)` (`tenant-context.ts:91`) se rabat sur la première organisation si l'active n'est plus valide.

### Session et authentification

`src/server/auth/session.ts` : `getSession` (cache React, `:26`), `getUserContext(): Promise<TenantContext | null>` (`:60`), `requireUserContext(): Promise<TenantContext>` (`:65`, redirige vers `/sign-in`, ou vers `ONBOARDING_PATH = '/welcome'` sans organisation), `signedInRecently()` (connexion de moins d'une heure, `:36`).

`src/server/auth/api-tokens.ts:258`

```ts
export async function verifyApiToken(
  token: string,
): Promise<{ tokenId: string; ctx: TenantContext; kind: ApiTokenKind } | null>
```

Jeton hors RLS (SHA-256 stocké, `hashApiToken`), non révoqué, non échu, membre toujours présent. Rend un `ctx` construit avec `principalsFor`. `kind` : `'manuel' | 'ordinateur' | 'assistant'` (`schema/api-tokens.ts`). Autres exports : `createApiToken`, `registerApiToken`, `createGrant`, `refreshGrant`, `listApiTokens`, `revokeApiToken`, `ACCESS_TTL_MS = 60 * 60 * 1000`.

### Membres, rôles, organigramme, groupes

- `members.ts:53` `canInvite(ctx): Promise<boolean>` : propriétaire ou admin (`isAdminRole`, `members.ts:40`, lit `string_to_array(role, ',') && array['owner','admin']`). Aussi : `listMembers`, `setMemberRole`, `removeMember`, `createInvitationLink`, `findInvitation`, `joinWithInvitation`, `setMemberPlacement`, `listInvitations`, `cancelInvitation`, `renewInvitationLink`, `setInvitationManager`.
- `groupes.ts` : `listGroups(ctx)`, `saveGroup(ctx, id | null, nom)` rend `{ id } | 'nom_pris' | 'refuse'`, `deleteGroup(ctx, id)` (appelle `supprimer_groupe`), `setGroupMembers(ctx, id, memberIds)`. Type `Groupe = { id; service: string | null; nom: string | null; membres: string[] }`.
- `organisation.ts` : `listReports(ctx): Promise<Report[]>` (`:233`), `reportActivity` (`:239`, utilise `withTenant({ ...ctx, equipe: true }, ...)`), `setFollowed`, `setSeeAll`, `managersSeeAll`, `setManagersSeeAll`, `lockOrganigramme(tx, ctx)` (`:307`), `setManager(ctx, memberId, managerId)` rend `'ok' | 'refuse' | 'boucle' | 'proprietaire'` (`:315`). Constante `MAX_DEPTH = 32` (`:149`).
- `sign-up.ts` : `createOrganizationForUser`, `createUserWithOrganization`, `createUserWithInvitation`, `ORGANIZATION_LOCK_NAMESPACE = 41`.
- `onboarding.ts` : `spaceRole(role): 'owner' | 'admin' | 'member'`, `completeOwnerStep`, `completeMemberStep`.
- `delete-account.ts` : `deleteAccount(ctx, successorId, organizationToo)`, `deleteOrganization(ctx)`, `DeletionRefused`.
- `rate-limit.ts` : `AUTH_LIMITS`, `authAttemptAllowed` (compteur en base via `consommer_limites`, 0021).

### Migrations

`src/server/db/migrate.ts:50`

```ts
export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));
const LOCK_KEY = 7_270_331; // verrou consultatif : deux runners ne migrent jamais en même temps
export const MIGRATION_FILE_PATTERN = /^\d{4}-[a-z0-9-]+\.sql$/;
```

`src/server/db/migrate.ts:60`

```ts
export async function runMigrations(adminUrl: string, dir = MIGRATIONS_DIR): Promise<string[]>
```

Verrou `pg_advisory_lock(7_270_331)`, table `leon_migrations (name text primary key, applied_at timestamptz)`, fichiers triés par nom, **une transaction par fichier** (`migrate.ts:94`) : `begin`, le SQL, `insert into leon_migrations`, `commit`. Un échec fait `rollback` et lève `Migration <fichier> en échec`. Lancement : `pnpm db:migrate` (`package.json`, `migrate-cli.ts`, variable `DATABASE_URL_ADMIN`).

### Règles imposées par les tests

`src/server/db/rls-coverage.db.test.ts:9`

```ts
const RLS_EXCEPTIONS = [
  'api_tokens',
  'invitation_links',
];
```

`src/server/db/rls-coverage.db.test.ts:20` : `DELETE_ALLOWED` = `connections`, `passages`, `passage_vectors`, `connection_exclusions`, `identities`, `discussions`, `about_suggestions`, `agendas`, `depots_equipe`, `versions_memoire`, `lecons`, `membres_groupe`, `reporting_lines`.

`src/server/db/tenant-integrity.db.test.ts:183` (comparée par `toEqual`, liste exacte) :

```ts
const COMPOSITE_KEYS = [
  'ingest_runs.source_id → sources',
  'passage_vectors.passage_id → passages',
  'passages.source_id → sources',
  'passages.turn_id → turns',
  'passages_a_vectoriser.passage_id → passages',
  'rappels_cites.fil_id → sources',
  'read_log.lecon_id → lecons',
  'read_log.source_id → sources',
  'turns.source_id → sources',
  'versions_memoire.lecon_id → lecons',
  'versions_memoire.source_id → sources',
];
```

## Modèle de données (tableau)

Colonnes clés seulement. `T` = `tenant_id uuid not null references organization(id) on delete cascade`. Sources : `schema/*.ts` et migrations lues. Les tables `connection_exclusions`, `identities`, `passages_a_vectoriser`, `twoFactor` apparaissent dans des tests ou du code, je n'ai pas lu leur migration.

| Table | Colonnes clés | Relations et remarques | RLS |
|---|---|---|---|
| `user` | `id`, `name`, `email` unique, `emailVerified`, `twoFactorEnabled`, `about`, `deleted_at`, `createdAt` | Un compte supprimé garde sa ligne (`deleted_at`, e-mail `ancien-<id>@leon.invalid`) | non |
| `organization` | `id`, `name`, `slug` unique, `size`, `metadata` | L'« organisation » est le tenant | non |
| `member` | `id`, `organizationId`, `userId`, `role` (texte, rôles séparés par virgule), `department`, `job`, `seniority`, `goals`, `onboardedAt`, `rattachementManuel`, `noterRefuseLe` | cascade depuis `organization` et `user` | non |
| `session`, `account`, `verification`, `invitation`, `ssoProvider` | tables Better Auth (0002, 0053) | `session.activeOrganizationId` text | non |
| `api_tokens` | `T`, `user_id`, `token_hash` unique, `kind`, `expires_at`, `revoked_at`, `refresh_hash`, `retraits` jsonb | retrouvé par empreinte, avant de connaître le tenant | non (exception listée) |
| `invitation_links` | `T`, `created_by`, `token_hash` unique, `expires_at`, `used_at`, `department`, `job`, `manager_id` vers `member` | idem | non (exception listée) |
| `sources` | `T`, `kind`, `external_id`, `owner_user_id`, `title`, `acl uuid[]`, `connection_id`, `metadata jsonb`, `last_turn_at` | `unique (tenant_id, owner_user_id, kind, external_id)` (0005) ; `unique (tenant_id, id)` ; FK composée `(tenant_id, connection_id)` vers `connections`, `on delete set null (connection_id)` | `tenant_acl` + `equipe_lit` |
| `turns` | `T`, `source_id`, `external_id`, `role`, `text`, `ts`, `capture_mode`, `author_name`, `author_email`, `author_side`, `internal_note`, `injecte`, `acl` | FK composée vers `sources` ; `unique (source_id, external_id)` | `tenant_acl` + `equipe_lit` |
| `ingest_runs` | `T`, `source_id`, `turn_ids uuid[]`, `status` (`queued/running/done/failed`), `step` (Drizzle : `index/done`), `error`, `acl` | FK composée vers `sources` | `tenant_acl` |
| `passages` | `T`, `source_id`, `turn_id`, `ord`, `text`, `char_start`, `char_end`, `ts`, `tsv` (généré), `acl` | FK composées vers `sources` et `turns` ; `unique (tenant_id, id)` | `tenant_acl` + `equipe_lit` |
| `passage_vectors` | `passage_id`, `T`, `model`, `embedding halfvec(1024)`, `acl` | PK `(passage_id, model)` ; index `hnsw` | `tenant_acl` + `equipe_lit` |
| `read_log` | `T`, `user_id`, `client`, `tool`, `source_id` ou `lecon_id` (exactement un), `passage_id`, `acl`, `at` | ajout seul : `revoke update` (0005) | `tenant_acl` |
| `lecons` | `T`, `owner_user_id`, `projet`, `origine`, `frequence`, `acceptee_le`, `retiree_le`, `acl = [owner_user_id]` | `unique (tenant_id, id)` | `tenant_acl` |
| `versions_memoire` | `T`, `owner_user_id`, `source_id` ou `lecon_id`, `n`, `texte`, `ecrit_par` (`serveur/modele/agent/humain`), `motif`, `acl` | ajout seul, privé | `tenant_acl` (migration 0052 non lue) |
| `rappels_cites` | `T`, `owner_user_id`, `session`, `fil_id` | PK `(tenant_id, owner_user_id, session, fil_id)` | non lue |
| `discussions` | `T`, `user_id`, `title`, `acl = [user_id]`, `updated_at` | `unique (tenant_id, id)` | `tenant_acl` |
| `discussion_messages` | `T`, `discussion_id`, `role`, `content`, `citations jsonb`, `acl` | FK composée vers `discussions` | `tenant_acl` + restrictive `same_acl_as_discussion` |
| `briefings` | `T`, `user_id`, `project`, `markdown`, `source_ids`, `stale`, `dismissed text[]`, `acl = [user_id]` | `unique (tenant_id, user_id, project)` | `tenant_acl` |
| `about_suggestions`, `agendas` | caches privés par personne | PK `(tenant_id, user_id)` pour `agendas` ; `agendas.acl = [user_id]` | `tenant_acl` (`agendas`) |
| `connections` | `T`, `created_by`, `provider`, `label`, `config jsonb`, `secret` (`v1:...`), `status`, `cursor`, `next_sync_at`, `sync_lock_at`, `acl`, `partage uuid[]` | `unique (tenant_id, id)` | `tenant_acl` |
| `depots_equipe` | `T`, `project`, `acl = [tenant_id]`, `choisi_par` | `unique (tenant_id, project)` | `tenant_acl` + 3 restrictives `admin_*` |
| `actions` | `T`, `user_id`, `discussion_id`, `connection_id`, `kind`, `params jsonb`, `status`, `result jsonb`, `acl = [user_id]`, `decided_at` | FK simples + politique restrictive d'insertion | `tenant_acl` + `own_discussion_and_connection` |
| `groupes` | `T`, `service`, `nom` (l'un des deux seulement), `created_at` | `unique (tenant_id, service)`, `unique (id, tenant_id)`, index unique `(tenant_id, lower(nom))` | `tenant_only` + `admin_*` |
| `membres_groupe` | `T`, `groupe_id`, `member_id` | PK `(groupe_id, member_id)` ; FK `(groupe_id, tenant_id)` | `tenant_only` + `admin_*` |
| `reporting_lines` | `T`, `member_id` (PK), `manager_id` | `check (member_id <> manager_id)` | `tenant_only` + `admin_*` |
| `manager_follows` | `T`, `manager_id`, `member_id`, `families text[]` (nul = tout), `voit_tout` | PK `(manager_id, member_id)` | `tenant_only` + `manager_*` |
| `reglages_organisation` | `tenant_id` (PK), `managers_voient_tout` | une ligne par organisation, ou aucune | `tenant_only` + `admin_*` |
| `limites_de_debit`, `points_par_jour`, `agendas_par_jour`, `journal_connexions`, `appels_modele` | compteurs et journaux sans texte, **sans `tenant_id`** | accès par fonctions `security definer` (`consommer_limites`, `reserver_point`, `reserver_agenda`, `noter_activite`) ; `appels_modele` : `grant insert` | sans RLS |

Tables supprimées en 0010 : `review_items`, `facts`, `fact_candidates`, `card_aliases`, `cards`, `predicates`, `card_types` (`schema-contract.db.test.ts:76` vérifie qu'elles n'existent plus).

## 3. Comment ça s'exécute

### Une lecture ou une écriture ordinaire

1. La route ou la server action obtient un `TenantContext` : `requireUserContext()` (session, `session.ts:65`) ou `verifyApiToken(token).ctx` (jeton).
2. Le code appelle `withTenant(ctx, (tx) => ...)`. Une transaction s'ouvre, les variables sont posées en `SET LOCAL` (`set_config(..., true)`), le contexte disparaît au `commit`.
3. Chaque requête de `tx` est filtrée par la politique `tenant_acl` de la table : `tenant_id = app_tenant() and acl && app_principals()`. Hors de `withTenant`, `app_tenant()` est nul et aucune ligne n'est visible (`roles.db.test.ts:18`).
4. À l'écriture, le même prédicat sert de `with check` : on ne peut pas écrire une ligne dont l'ACL ne croise pas ses propres principals.

### Qui a quels principals

`principalsFor` : `[userId, tenantId, ...groupes]`. Une source privée porte `acl = [ownerUserId]`. Une source d'équipe porte `acl = [tenantId]`. Une source partagée à un groupe porte `[auteur, groupeId...]`. Les conversations captées sont écrites avec `acl: [ctx.userId]` (`ingest/ingest-turns.ts:27` et `:101`). Les éléments des connecteurs prennent `connections.partage ?? (connection.privateRaw ? [connection.createdBy] : [ctx.tenantId])` (`connectors/ingest-items.ts:79`).

Les tours, runs, passages, vecteurs et lignes du journal recopient l'ACL de leur source. Quand l'ACL d'une source change, `recopier_acl_sources(uuid[])` (`0055-groupes.sql:134`) propage vers `turns`, `ingest_runs`, `passages`, `passage_vectors`, `read_log`. L'appelant verrouille d'abord les sources (`for no key update`, dans l'ordre des `id`).

### Partage : trois fonctions, aucune politique

Toutes `security definer set search_path = public, pg_temp`, appelées sous `withTenant` (elles lisent `app_user()` et `app_tenant()`) :

- `partager_document(p_source uuid, p_acl uuid[]) returns boolean` (`0055:152`) : seul l'auteur d'un `kind = 'document'`.
- `partager_connexion(p_connexion uuid, p_acl uuid[]) returns boolean` (`0056:9`) : seul le créateur ; écrit `connections.partage` et recopie sur toutes ses sources.
- `supprimer_groupe(p_groupe uuid) returns boolean` (`0056:45`, remplace celle de 0055) : admin seulement ; retire le groupe des `partage` des connexions et des `acl` des sources, recopie, puis supprime.

Forme d'ACL acceptée : `[auteur]`, ou `[organisation]`, ou `[auteur, groupes...]` (chaque groupe doit exister dans l'organisation). Le code l'écrit avec `aclOf` (`src/lib/documents.ts:11`) :

```ts
export const aclOf = (ctx: { tenantId: string; userId: string }, partage: Partage): string[] =>
  partage === 'equipe' ? [ctx.tenantId] : partage === 'moi' ? [ctx.userId] : [ctx.userId, partage];
```

Cas GitHub : `aligner_sources_github()` (`0048`) remet l'ACL des sources GitHub d'après `depots_equipe` (dans la liste : `[tenant_id]`, sinon `[owner_user_id]`). La relève GitHub l'appelle à chaque fin. `0059` : `recopier_acl_mes_sources(uuid[])` pour un outil rebranché.

### Vue manager (`app.vus`)

1. L'écran appelle `withTenant({ ...ctx, equipe: true }, ...)` (dans `organisation.ts:246` et `api/session-routes.ts:114`, seuls usages trouvés).
2. `withTenant` exécute `set_config('app.vus', equipe_visible()::text, true)`.
3. Quatre tables ont une politique de **lecture seule** en plus : `equipe_lit` sur `sources`, `turns`, `passages`, `passage_vectors` (`0057:133-140`) : `tenant_id = app_tenant() and acl && app_vus()`. Les politiques permissives se combinent par OU : le manager lit ses lignes OU celles des gens sous lui. Pas de `with check`, donc aucune écriture n'en profite.

### Le travail de fond

Un job pg-boss porte `userId` et `tenantId`. Le worker reconstruit le contexte avec `resolveTenantContext(job.userId, job.tenantId, { includeFormer: true })` (`search/worker.ts:58`, `search/index-run.ts:134`). Pour savoir quoi faire, il lit d'abord par des fonctions `security definer` qui traversent les organisations et ne rendent que des identifiants : `connector_syncs_due()` (limite 100, verrou 30 min), `passages_sans_vecteur(p_model, p_limit)`, `runs_en_attente(p_minutes)`, `briefings_a_rafraichir(p_days)`. Il agit ensuite sous les droits du propriétaire de la ligne.

### Application des migrations

`src/test/global-setup.ts` appelle `runMigrations(TEST_ENV.DATABASE_URL_ADMIN)` avant les tests `db`, après avoir refusé les migrations « destructives » (`MIGRATIONS_DESTRUCTIVES = ['0010-suppression-tri.sql']`, `src/test/test-env.ts:11`) sur la base partagée. En local : `pnpm db:migrate`. Les rôles se créent dans `docker/postgres/init.sql`, pas dans les migrations :

```sql
create role leon_owner login password 'leon_owner';
create role leon_app login password 'leon_app' nobypassrls;
```

`pgvector` (`vector`) est créé dans `template1` par ce même script (non « trusted »).

## 4. Conventions

### Langue

- Identifiants et commentaires SQL/TS en français. Tables récentes en français sans accent : `groupes`, `membres_groupe`, `lecons`, `versions_memoire`, `agendas`, `reglages_organisation`. Tables anciennes en anglais : `sources`, `turns`, `passages`, `connections`, `actions`. Les colonnes se mélangent (`owner_user_id`, `choisi_par`, `cree_le`). Les valeurs d'énumération récentes sont en français (`proposee`, `en-cours`, `faite`, `echouee`, `annulee`). Pas de règle écrite : suivre la table voisine.
- Tables Better Auth : colonnes en camelCase entre guillemets (`m."userId"`, `m."organizationId"`). Tables maison : snake_case.

### Fichiers

- Migration : `NNNN-sujet-en-minuscules.sql`, motif imposé `^\d{4}-[a-z0-9-]+\.sql$` (`migrate.ts:52`). Le dossier a des trous (pas de 0007, 0013 à 0018, 0024 à 0029, 0032). Dernier numéro lu : `0074-points-lignes-retirees.sql`.
- Test d'une migration : `NNNN-sujet.db.test.ts` dans le même dossier. Tout `*.db.test.ts` part dans le projet vitest `db` (`vitest.config.ts`) ; les autres `*.test.ts` dans `unit` et ne touchent pas la base.
- Schéma Drizzle : un fichier par domaine dans `src/server/db/schema/` (`auth.ts`, `organisation.ts`, `groupes.ts`, `connections.ts`, `actions.ts`, `api-tokens.ts`, `invitation-links.ts`, `memory.ts`, `search.ts`). **Un module n'exporte que des tables** : `schema-contract.db.test.ts:14-24` lit `Object.values` de chaque fichier du dossier.
- En-tête d'une migration : `-- NNNN-sujet.sql : <ce que ça fait, pour qui, pourquoi>.` suivi d'un paragraphe de commentaire : qui lit, qui écrit, ce qui est interdit. Les décisions sont citées (« D14 », « C12 », « lot 2 »).

### Écrire une migration

- Les rôles ne se créent pas ici. Les droits se donnent à `leon_app`, explicitement, table par table : aucun `default privileges` dans les migrations (recherche faite, rien trouvé).
- Jamais `force row level security` (recherche faite, rien trouvé) : `leon_owner` possède les tables, `leon_app` n'est pas propriétaire et reste soumis à la RLS.
- Colonnes d'énumération : `check (col = any (array['a', 'b']))`, pas `in (...)`. Une liste d'une seule valeur garde ainsi sa forme dans le catalogue (commentaire de `0037:13`), et `schema-contract.db.test.ts:60` cherche `(col = ANY`.
- Table privée à une personne : `acl uuid[] not null check (acl = array[user_id])` (`discussions`, `actions`, `agendas`, `lecons`, `briefings`). La base impose que l'ACL est la personne, quoi qu'écrive le code.
- Mise à jour limitée : `grant update (col1, col2) on t to leon_app` (`actions`, `briefings`, `lecons`, `agendas`).
- Fonction `security definer` : `set search_path = public, pg_temp`, puis `revoke all on function f(...) from public; grant execute on function f(...) to leon_app;`. Le test `0046-pg-temp-en-dernier.db.test.ts` lit `pg_proc` et refuse toute fonction `prosecdef` dont `proconfig` n'est pas `search_path=public, pg_temp`.
- Alter lourd sur une grosse table : `set local lock_timeout = '5s';` et `not valid` (`0069`, `0005`).
- Une transaction par fichier : pas de `create index concurrently` (déduction du `begin`/`commit` de `migrate.ts:94`, non essayé).

### Erreurs

- Un refus RLS est le code Postgres `42501`. Drizzle l'emballe : lire `error.cause.code`. `groupes.ts:39` définit `pgCode` (récursif) et `isRlsRefusal`. Les tests écrivent `{ cause: { code: '42501' } }`.
- `23505` (unicité) : `saveGroup` rend `'nom_pris'`. `23503` : clé étrangère (test `tenant-integrity`).
- Pour `update` et `delete` sous une politique restrictive, Postgres ne lève pas d'erreur : il écarte les lignes (commentaires de `0047` et `0055`). Le code regarde `.returning(...)` ou le nombre de lignes.
- Les fonctions de partage rendent `false` plutôt que lever. Les fonctions d'écriture de `src/server/auth/` rendent des unions de chaînes (`'ok' | 'refuse' | 'boucle'`) ou un booléen, sauf `DeletionRefused`.

### Validation

`zod` : `z.uuid()` sur les identifiants (`IdSchema`, `MemberIdSchema`), `GroupNameSchema = z.string().trim().min(1).max(80)`. Les `check` SQL doublent la validation (longueurs, `jsonb_typeof`).

### Journalisation

`logError(event, error, ids)` de `@/server/log` (`members.ts:11`), noms d'événement en `domaine.action_echec` (`team.invitation_manager_failed`). Aucun texte capté dans une erreur renvoyée à pg-boss : `safeErrorSummary` (`search/worker.ts:40-45`). `read_log` est le journal métier des lectures (ajout seul).

### Drizzle à côté du SQL brut

- `drizzle-orm` 0.45.4 seul : pas de `drizzle-kit`, pas de migrations générées (`package.json`). Le schéma décrit la base ; la base est décrite par les `.sql`.
- Le code utilise le query builder pour les lectures et écritures simples (`tx.insert(groupes).values(...).returning(...)`) et `tx.execute(sql\`...\`)` pour : les fonctions SQL (`select partager_connexion(${id}, ${acl}::uuid[])`), le récursif (`with recursive`), `set_config`.
- Une ACL se passe à une fonction en littéral : `` `{${aclOf(ctx, partage).join(',')}}` `` puis `::uuid[]` (`connectors/connections.ts:322`).
- `schema-contract.db.test.ts` : (1) chaque colonne Drizzle existe en base ; (2) chaque colonne de la base est déclarée dans Drizzle, du même type et de la même nullité (`format_type` + `not null`), sauf `passages.tsv` (`COMPUTED_BY_POSTGRES`) ; (3) un `enum` Drizzle a les mêmes valeurs que le `check` en base, sauf `sources.kind` et `connections.provider` (`VALIDATED_IN_CODE`, validés dans le code depuis 0010). **Une colonne `not null` ajoutée en SQL sans être déclarée dans Drizzle fait échouer ce test.**
- Les tables de Better Auth sont lues par `db` direct, avec filtre explicite (`members.ts`, `tenant-context.ts`, `api-tokens.ts`).

## Gabarit de migration conforme

Table neuve liée à une organisation et à une personne, privée à la personne. Numéro : prendre le suivant après `0074`, **après** `git fetch` et `gh pr list` (une collision a déjà eu lieu : `0070-invitations-manager.sql` « s'appelait 0065 avant la fusion avec main »).

`src/server/db/migrations/0075-mon-sujet.sql`

```sql
-- 0075-mon-sujet.sql : <ce que la table garde>. <Qui la lit, qui l'écrit>. Privée à son auteur
-- (acl = [user_id], contrôlé par la base). <Ce que l'app peut modifier ou supprimer, et pourquoi.>

create table mon_sujet (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  -- Clé vers une autre table d'organisation : composée, jamais l'id seul (voir plus bas).
  connection_id uuid,
  kind text not null check (kind = any (array['premier', 'second'])),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  status text not null default 'en-attente'
    check (status = any (array['en-attente', 'faite', 'echouee'])),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  -- Privée à son auteur, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  -- clock_timestamp() à la place de now() si l'ordre de lignes écrites dans la même transaction compte.
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id)
    on delete set null (connection_id)
);
create index mon_sujet_user_idx on mon_sujet (tenant_id, user_id, created_at desc);

alter table mon_sujet enable row level security;
create policy tenant_acl on mon_sujet to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());

-- Droits explicites, au plus juste. Pas de delete sans décision (rls-coverage.db.test.ts).
grant select, insert on mon_sujet to leon_app;
grant update (status, result, decided_at) on mon_sujet to leon_app;
```

Sous-gabarits à greffer quand ils s'appliquent.

Ligne lisible de toute l'organisation, écrite par les administrateurs seulement (modèle `0054`, `0055`, `0057`) :

```sql
create policy tenant_only on ma_table to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy admin_insert on ma_table as restrictive for insert to leon_app
  with check (app_est_admin());
create policy admin_update on ma_table as restrictive for update to leon_app
  using (app_est_admin());
create policy admin_delete on ma_table as restrictive for delete to leon_app
  using (app_est_admin());
```

La clé composée du gabarit empêche de viser une autre organisation. Elle n'empêche pas de viser la ligne d'une autre personne de la même organisation (la clé se vérifie hors RLS). Comme `0012` et `0037`, ajouter alors une politique restrictive d'insertion :

```sql
create policy own_target on mon_sujet as restrictive for insert to leon_app
  with check (connection_id is null or exists (
    select 1 from connections c
    where c.id = mon_sujet.connection_id and c.tenant_id = mon_sujet.tenant_id
      and c.created_by = mon_sujet.user_id));
```

Compteur ou lecture hors RLS : une fonction bornée, jamais d'accès direct à la table.

```sql
create function ma_fonction(p_user uuid) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  select true
$$;
revoke all on function ma_fonction(uuid) from public;
grant execute on function ma_fonction(uuid) to leon_app;
```

Schéma Drizzle correspondant, `src/server/db/schema/mon-sujet.ts` (n'exporter que des tables) :

```ts
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './auth';

export const monSujet = pgTable('mon_sujet', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id'),
  kind: text('kind', { enum: MON_SUJET_KINDS }).notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status', { enum: MON_SUJET_STATUSES }).notNull().default('en-attente'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  acl: uuid('acl').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});
```

Squelette de test `0075-mon-sujet.db.test.ts` (helpers lus : `createTestTenant` dans `src/test/fixtures.ts:44`, `adminPool` dans `src/test/db.ts`, `withTenant`) : une personne écrit et relit sa ligne ; une autre personne de la même organisation ne la voit pas ; une personne d'une autre organisation non plus ; l'écriture avec `acl: [autre]` est refusée (`{ cause: { code: '42501' } }`) ; le `check (acl = array[user_id])` refuse une ACL d'équipe ; un `update` hors des colonnes accordées donne `42501`.

Ce que les tests existants exigent en plus, sinon ils échouent :

| Si la table... | Alors |
|---|---|
| a une colonne `tenant_id` | `enable row level security` et une politique, ou entrée dans `RLS_EXCEPTIONS` (à éviter) |
| reçoit `grant delete` à `leon_app` | l'ajouter à `DELETE_ALLOWED` (`rls-coverage.db.test.ts:20`) avec la raison |
| reçoit `truncate` | interdit, test sans exception |
| est déclarée dans `schema/*.ts` | colonnes, types, nullité, enums identiques à la base (`schema-contract.db.test.ts`) |
| a une clé vers `sources`, `turns`, `ingest_runs`, `passages` ou `lecons` | clé **composée** `(tenant_id, x) references t (tenant_id, id)` et ligne ajoutée à `COMPOSITE_KEYS` (`tenant-integrity.db.test.ts:183`, `toEqual` exact) |
| contient des données d'une personne (`user_id`, `owner_user_id`) | `deleteAccount` doit les supprimer (piège 7 de la section 6) |
| porte une fonction `security definer` | `set search_path = public, pg_temp` (test `0046`) |

## 5. Points d'extension pour le système d'agents

Ce qui suit est une proposition appuyée sur le code lu ; rien de cela n'existe encore.

### Fiches d'agents, exécutions, curseur d'autonomie : nouvelles tables

- **Réglage par organisation** (par exemple le curseur d'autonomie par défaut) : copier `reglages_organisation` (`0057:79`) : clé primaire `tenant_id`, `tenant_only` + `admin_insert`/`admin_update` restrictives, `grant select, insert, update`. Le code lit « sans ligne = valeur par défaut » (`managersSeeAll` rend `row?.on ?? true`).
- **Réglage par personne, écrit par celui qui le choisit** : copier `manager_follows` (`0054`, `0057:96`) : politiques restrictives `manager_insert` et `manager_update` qui comparent à `(select id from member where "userId" = app_user() and "organizationId" = app_tenant())`.
- **Fiche d'agent partagée à l'équipe, écrite par les admins** : le sous-gabarit `tenant_only` + `admin_*`, ou `depots_equipe` (`acl = array[tenant_id]` imposé).
- **Exécution d'agent privée à son déclencheur** : le gabarit principal (`acl = array[user_id]`).
- **Plafond de dépense par agent et par jour** : `points_par_jour` + `reserver_point(p_user, p_plafond)` (`0060`) est un modèle complet : table sans `tenant_id`, une seule instruction `insert ... on conflict do update ... where nombre < p_plafond`, fonction `security definer`. `agendas_par_jour` (`0072`) en est la copie.
- **Coût du modèle** : `appels_modele.step` a un `check (step in (...))`. `0072` l'a étendu par `drop constraint appels_modele_step_check, add constraint ... check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda'))`. Un nouveau type d'appel d'agent demande la même migration.

### Une action d'écriture dans un outil : `actions`

La table `actions` est déjà le journal des écritures (`0037`, `0038`). Pour ajouter un type d'action :

1. Migration qui refait `actions_kind_check` avec `any(array[...])` (modèle `0038`, `drop constraint ... add constraint`).
2. Ajouter la valeur à `ACTION_KINDS` dans `src/lib/actions.ts:7` (le contrat de schéma compare l'enum Drizzle au `check`).
3. Les statuts suivent `ACTION_STATUSES = ['proposee', 'en-cours', 'faite', 'echouee', 'annulee']` (`src/lib/actions.ts:64`). L'app ne modifie que `status`, `result`, `decided_at` (`grant update` par colonnes).

**À généraliser** : la ligne est privée à `user_id` (`check (acl = array[user_id])`), et la politique restrictive `own_discussion_and_connection` n'accepte qu'une connexion dont `c.created_by = actions.user_id`. Une action d'agent « pour toute l'entreprise » sur une connexion partagée, ou lancée par un autre déclencheur que la personne, **ne passe pas l'insertion**. Il faudra un acteur (agent) distinct de `user_id`, une règle d'ACL (équipe, manager) et une règle de connexion qui accepte une connexion partagée. Soit on relâche le `check (acl = array[user_id])`, soit on crée une table sœur.

### Une identité d'agent

Les principals sont des `uuid` validés par `z.uuid()` (`with-tenant.ts:27`). Seul `app.user` dit qui agit (`0055:50`). Deux voies, à trancher :

- L'agent agit **sous le contexte de la personne** qui l'a lancé ou de son créateur : `resolveTenantContext(userId, tenantId)` donne un `TenantContext` valide, comme le font déjà les jobs. Pas de changement de schéma. Limite : l'agent hérite de tous les droits de la personne.
- L'agent a **son propre principal** (un `uuid` d'agent mis dans `principals` et dans les ACL qu'il doit lire). Il faut alors étendre `principalsFor` (`tenant-context.ts:21`) et décider où vit sa fiche. Les politiques RLS ne changent pas (`acl && app_principals()` accepte tout `uuid`). `app_est_admin()` resterait faux pour lui.

### Déclencheur et tâche de fond

- Table « à échéance » : `next_xxx_at`, `status`, `xxx_lock_at`, index partiel `where status in (...)`, lue par une fonction `security definer` qui rend seulement `(id, tenant_id, user_id)` : `connector_syncs_due()` (`0008:55`) est le modèle. Le worker reconstruit ensuite le contexte (`resolveTenantContext(..., { includeFormer })`) et travaille sous RLS.
- Événement d'entrée : `ingest_runs` en `status = 'queued'` (index partiel `ingest_runs_queued_idx`, `0011`) ; `runs_en_attente(p_minutes)` rattrape les runs oubliés.
- Les files elles-mêmes (pg-boss, schéma `pgboss`) : `0001-base.sql:12` crée le schéma et donne `usage, create` à `leon_app`. Les noms de files et leur code ne sont pas dans cette carte.

### Un écran de poste de contrôle

Les droits d'écran se testent avec `canInvite(ctx)` (`members.ts:53`) ou `app_est_admin()` ; les managers lisent via `withTenant({ ...ctx, equipe: true })`. Un poste de contrôle « ce que font les agents de mon équipe » doit choisir : lecture sous `app.vus` (il faudrait ajouter une politique `equipe_lit` en lecture seule sur la nouvelle table, modèle `0057:133`) ou ACL d'équipe sur la table.

### À généraliser

- `equipe_lit` n'existe que sur `sources`, `turns`, `passages`, `passage_vectors`. Un journal privé lisible par le manager doit recevoir sa propre politique.
- Le partage à un groupe n'existe que pour les documents et les connexions (`partager_document`, `partager_connexion`). Partager une fiche d'agent à un groupe demande une fonction du même modèle.
- `DELETE_ALLOWED` et `COMPOSITE_KEYS` sont des listes écrites à la main : chaque nouvelle table du système d'agents peut les toucher.

## 6. Pièges et limites écrites dans le code

1. **Contexte vide hors transaction** : `app_tenant()` est nul, aucune ligne n'est visible. Ce n'est pas une erreur : une requête sur `db` ou `pool` directement rend zéro ligne sur une table à RLS (`roles.db.test.ts:18`). Toujours `withTenant`.
2. **`equipe: true` ne sert qu'à lire** (commentaire `tenant-context.ts:11`) : « seulement pour la recherche, l'aperçu et « Mon équipe », qui n'écrivent rien ». Les écritures restent sous `app.principals` (`0057:6`).
3. **Pool de 4 connexions** (`client.ts:9-12`, avec `// shortcut: RDS ... ~200 connexions directes ; relever quand le débit des tâches le demande`). Chaque `withTenant` tient une connexion pour toute sa transaction. Total prévu : 4 + 2 pg-boss + 1 écoute = 7 par instance, 14 pendant un déploiement (pooler Supabase : 15 clients par rôle).
4. **Clés étrangères hors RLS** : sans clé composée `(tenant_id, x)`, une ligne de l'organisation B peut pointer vers l'organisation A (`tenant-integrity.db.test.ts:1-2`). `actions` n'a que des clés simples et se protège par une politique restrictive d'insertion ; `discussion_messages` a une clé composée vers `discussions`, hors de la liste testée.
5. **Migrations `not valid`** (`0005`) : les clés composées de `0005` ne sont pas validées sur les lignes existantes (la base `leon_test` partagée en gardait d'anciennes). Toute nouvelle écriture est vérifiée.
6. **Une transaction par migration, verrou exclusif** : un `alter table` sur `turns` bloque les lectures jusqu'au `commit`. `0069` pose `lock_timeout = '5s'` et `not valid` pour cela.
7. **Suppression de compte** : la ligne `user` **reste** (`deleted_at`, commentaire `schema/auth.ts:14`), donc `on delete cascade` depuis `"user"` ne se déclenche pas (déduction). `deleteAccount` (`delete-account.ts:161`) supprime à la main `about_suggestions`, `agendas`, `versions_memoire`, `lecons`, les notes (`supprimer_notes_du_compte()`), les fils (`supprimer_fil`) et `connections`, révoque les `api_tokens`, expire les `invitation_links`. Dans les lignes lues, elle ne touche ni `discussions`, ni `briefings`, ni `actions` (raison non vérifiée). Une table neuve à données personnelles doit y être ajoutée ou justifiée. **Aucun test générique ne vérifie la liste**, seulement `delete-account.db.test.ts` pour les tables qu'il cite.
8. **Pas de `delete` sur `sources`** : seules des fonctions bornées en retirent (`retirer_sources_connexion` `0019`, `supprimer_document` `0034`, `supprimer_fil` `0051`, `supprimer_notes_du_compte` `0067`). Commentaire de `rls-coverage.db.test.ts:18` : « Jamais `sources` ».
9. **`read_log` en ajout seul** (`revoke update`, `0005:73`) : `recopier_acl_sources` le met à jour avec les droits du propriétaire. Un `update` direct donne `42501` (`tenant-integrity.db.test.ts:217`).
10. **`groupes` : suppression directe interdite** (`admin_delete ... using (false)`, `0055:101`) : seule `supprimer_groupe` supprime, car elle retire d'abord le groupe des ACL. Un groupe de service (`service` non nul) ne s'écrit pas à la main : le trigger `groupe_service` (`creer_groupe_service`, `0055:115`) le crée quand `member.department` change, et un service vidé garde son groupe.
11. **Rôle texte multiple** : `member.role` peut contenir plusieurs rôles séparés par des virgules (Better Auth). Toujours `string_to_array(role, ',') && array['owner','admin']`, jamais `role = 'admin'`.
12. **Organigramme** : `setManager` refuse les boucles et prend `lockOrganigramme` (`pg_advisory_xact_lock(hashtext('organigramme:<tenant>'))`). Un rattachement manuel pose `rattachementManuel = true` et l'import d'annuaire n'y touche plus (`0058`, non lu). Seul un propriétaire change qui est au-dessus d'un propriétaire.
13. **`managers_voient_tout` vaut vrai par défaut** (`reglages_organisation` sans ligne). Un manager lit le privé de tout son sous-arbre, sauf coupure par l'organisation ou par personne (`manager_follows.voit_tout`).
14. **Plafonds écrits** : `connector_syncs_due()` `limit 100` ; verrou de relève 30 min ; récursion 32 niveaux ; `agendas.rendez_vous` au plus 60 éléments ; `briefings.dismissed` au plus 20 lignes et 20 000 caractères ; `discussion_messages.content` au plus 100 000 caractères ; `setGroupMembers` au plus 500 membres ; jeton d'accès assistant : 1 h (`ACCESS_TTL_MS`).
15. **Numéros de migration** : collision déjà arrivée entre deux branches (0065 devenue 0070). Un fichier renuméroté doit tenir sur une base où l'ancien nom est déjà appliqué : `add column if not exists` (`0070`). Le runner compare par nom de fichier, pas par contenu.
16. **Migration destructive** : seule `0010-suppression-tri.sql` est dans `MIGRATIONS_DESTRUCTIVES` ; `global-setup` refuse de l'appliquer à la base partagée sans `LEON_TEST_ACCEPTE_MIGRATIONS_DESTRUCTIVES=oui`. Toute migration qui supprime des données doit s'ajouter à cette liste (`src/test/test-env.ts:11`).
17. **Extension `vector`** : le runner explique l'erreur `42501` quand une extension manque (`migrate.ts:109`). En local elle est dans `template1` (`docker/postgres/init.sql`). Ailleurs : la créer avec le compte d'administration avant la première migration.
18. **Commentaires `shortcut:`** dans les migrations : `0048` (une relève en cours écrit encore avec l'ancien accès, corrigée à l'alignement suivant ; interblocage possible entre relève et alignement), `0047` (index `sources_github_repo_idx` filtré ligne à ligne sous RLS car `lower` et `->` ne sont pas `leakproof`), `0066` (marge d'un jour pour Cursor et Antigravity).
19. **Création d'espace sérialisée** : `inOrganizationQueue` (file en mémoire, `sign-up.ts`) et `pg_advisory_lock($1, hashtext($2))` avec `ORGANIZATION_LOCK_NAMESPACE = 41`.

## 7. Ce que je n'ai pas lu

Lu en entier : `client.ts`, `with-tenant.ts`, `migrate.ts`, `migrate-cli.ts`, `schema/*.ts` (9 fichiers), `rls-coverage.db.test.ts`, `tenant-integrity.db.test.ts`, `tenant-context.ts`, `session.ts`, `viewer.ts`, `groupes.ts`, `organisation.ts`, `migrate.db.test.ts`, `src/test/migration-guard.ts`, `src/test/global-setup.ts`, les migrations `0001`, `0002`, `0003`, `0005`, `0008`, `0011`, `0012`, `0021`, `0030`, `0037`, `0038`, `0046`, `0047`, `0054` à `0057`, `0059`, `0060`, `0069` à `0074`.

Lu en partie : `members.ts` (lignes 1 à 70 et 295 à 340), `api-tokens.ts` (225 à 293), `sign-up.ts` (60 à 110), `delete-account.ts` (150 à 266), `schema-contract.db.test.ts` (1 à 150 et 270 à 340), `rls.db.test.ts` (230 à 300), `0010` (début), `0033` (début), `0039` (début), `0048` (jusqu'à la ligne 88), `0066` (jusqu'à la ligne 85), `0067` (début), `src/test/fixtures.ts` (1 à 130), `ingest-items.ts` (60 à 135), `ingest-turns.ts` (extraits), `vitest.config.ts`, `search/worker.ts` (40 à 75).

Seulement repéré par liste de fichiers, `grep` ou commentaires : les migrations `0004`, `0006`, `0009`, `0019` à `0020`, `0022`, `0023`, `0031`, `0034` à `0036`, `0040` à `0045`, `0049` à `0053`, `0058`, `0061` à `0068` (sauf extraits), tous les tests `NNNN-*.db.test.ts`, et les définitions de `retirer_sources_connexion`, `supprimer_document`, `supprimer_fil`, `statistiques_admin`, `passages_a_vectoriser` (table et déclencheurs `passages_entrent_en_file`, `passages_sortent_de_file`), `connection_exclusions`, `identities`.

Pas lu du tout : `src/server/auth/auth.ts` (configuration de Better Auth, plugins, hooks), `sso.ts`, `onboarding.ts`, `annuaire.ts`, `computer-authorize.ts`, `computer-code.ts`, `rate-limit.ts` (corps), `delete-account.ts` lignes 1 à 150 (dont `removeOrganization`), les tests de `src/server/auth/`, `src/server/env.ts`, `src/server/pipeline/queue.ts` (pg-boss), `docker-compose.yml`, `docs/plans/`, `docs/etudes/supabase-vers-rds-2026-11/`, `docs/guides/comptes.md`. Je n'ai donc pas vérifié : les noms et la charge des files pg-boss, le comportement de Better Auth à la création d'une organisation (qui crée la ligne `member`), ni la liste de ses plugins.

Rien n'a été exécuté (ni test, ni migration, ni serveur) : tout le comportement décrit vient du code et de ses commentaires. Les points marqués « déduction » ne sont pas testés.
