# Sessions de code partagées et espace Développeurs : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** partager à l'organisation les sessions Claude Code liées à un dépôt GitHub (passées et nouvelles), permettre à leur auteur de les rendre privées (une session ou tout un dépôt) depuis l'agent et depuis un nouvel espace « Développeurs » de l'application.

**Architecture :** le partage est une ACL : `[organisation]` au lieu de `[auteur]`, sur les cinq tables qui la portent (`sources`, `turns`, `ingest_runs`, `passages`, `passage_vectors`). Deux fonctions `security definer` (0044) changent cette ACL pour l'auteur seul ; la capture (`ingest-turns.ts`) décide du partage d'une session qui reçoit sa première clé GitHub ; la migration partage les sessions passées. La sécurité par ligne existante fait le reste : `search`, `fetch` et la discussion voient les sessions partagées sans changement. Deux outils MCP et une page `/developpeurs` appellent les mêmes fonctions serveur.

**Pile :** TypeScript, Next.js (actions serveur), Drizzle + SQL brut, Postgres (sécurité par ligne), `@modelcontextprotocol/server`, next-intl, Vitest (`pnpm test:unit`, projet `db`), Biome.

**Spec :** [docs/specs/2026-11-01-sessions-partagees.md](../specs/2026-11-01-sessions-partagees.md).

**Règles du dépôt à respecter** (voir `CLAUDE.md`) : commits petits, fichiers ajoutés un par un (jamais `git add -A`), commentaires en français au même ton que le code voisin, aucune donnée réelle dans les tests. Avant chaque commit : `pnpm lint` et `pnpm typecheck`.

**Base de test :** tous les tests en base se lancent avec `LEON_TEST_DATABASE=leon_test_passation` (la base de la branche de passation, dont celle-ci part). Le `global-setup` des tests applique lui-même les migrations en attente, dont 0044. **Ne jamais lancer `pnpm db:migrate`** : il viserait la base partagée de développement.

**Ce qui a été vérifié dans le code avant d'écrire ce plan :**
- `passage_vectors` porte bien `acl` (0011), sans `source_id` : sa clé est `(passage_id, model)`. On la met à jour par une jointure sur `passages.source_id`.
- `read_log` porte aussi une `acl`, mais c'est l'accès du lecteur à son propre journal : on n'y touche pas.
- L'indexation recopie l'accès du tour sur le passage (`index-run.ts`, `acl: turn.acl`), puis celui du passage sur le vecteur (`embed-missing.ts`), sous un verrou partagé sur la source (`lockSources`). En mettant la source à jour **d'abord** (`select … for update`), le changement de partage attend la fin d'une indexation en cours, ou l'indexation lit l'accès déjà corrigé. Les nouveaux tours d'une session partagée reçoivent l'ACL de la source : passages et vecteurs suivent sans autre changement.
- `principalsFor(userId, tenantId)` vaut `[userId, tenantId]` : l'organisation est le principal `tenantId`.
- **La CLI envoie aussi des clés `dossier:<16 hex>`** (`src/cli/project-key.ts:97`) pour un dossier sans remote GitHub, y compris un dépôt git hébergé ailleurs. La règle « une clé de projet » de la spec devient donc « une clé `github.com/…` » : une session `dossier:` reste privée (la spec parle de clés `github.com/<propriétaire>/<dépôt>`).
- Il n'existe dans l'application aucune page qui affiche une source seule : le « lien vers la session » de la spec n'a pas de cible (voir les écarts en fin de plan).

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/server/db/migrations/0044-sessions-partagees.sql` (créé) | Table `depots_prives`, `regler_partage_session`, `regler_partage_depot`, partage des sessions passées |
| `src/server/db/migrations/0044-sessions-partagees.db.test.ts` (créé) | Partage des sessions passées, sécurité par ligne de `depots_prives` |
| `src/server/db/schema/memory.ts` (modifié) | Table Drizzle `depotsPrives` (couverte d'office par `schema-contract`) |
| `src/server/developpeurs/partage.ts` (créé) | `setSessionSharing`, `setRepoSharing`, `lastSession`, `GITHUB_PROJECT` |
| `src/server/developpeurs/partage.db.test.ts` (créé) | Retrait, droits, nouveau partage, réglage par dépôt (sessions passées) |
| `src/server/ingest/ingest-turns.ts` (modifié) | Le partage décidé à la capture |
| `src/server/ingest/ingest-turns.db.test.ts` (modifié) | Tests de la capture |
| `src/server/developpeurs/space.ts` (créé) | `isDeveloper`, `developerSpace` (les données de la page) |
| `src/server/developpeurs/space.db.test.ts` (créé) | Tests en base de l'espace |
| `src/server/mcp/tools/session-tools.ts` (créé) | Outils `session_rendre_privee`, `session_partager` |
| `src/server/mcp/server.ts` (modifié) | Enregistrement + `MCP_INSTRUCTIONS` |
| `src/server/mcp/mcp.db.test.ts` (modifié) | Liste des outils, trois jeux d'arguments par outil |
| `src/app/(app)/developpeurs/page.tsx` (créé) | La page, 404 pour un non-développeur |
| `src/app/(app)/developpeurs/actions.ts` (créé) | Actions serveur des boutons et de l'interrupteur |
| `src/app/(app)/developpeurs/actions.test.ts` (créé) | Les boutons appellent les bonnes fonctions |
| `src/components/verre/developpeurs/index.tsx` (créé) | L'écran, en composants de la maison |
| `messages/fr.json`, `messages/en.json` (modifiés) | Textes de l'écran (tâche 7) et de la navigation (tâche 8) |
| `src/components/verre/shell/nav.ts` (modifié) | Entrée « Développeurs », `navFor` |
| `src/components/verre/shell/nav.test.ts` (créé) | L'entrée n'apparaît que pour un développeur |
| `src/components/verre/shell/workspace-menu.tsx`, `sidebar.tsx`, `mobile-bar.tsx`, `command-palette.tsx`, `app-shell.tsx` (modifiés) | Le drapeau `developer` jusqu'aux trois listes de sections |
| `src/app/(app)/layout.tsx` (modifié) | Calcule `developer` |
| `src/cli/install-hooks.ts`, `src/cli/install-hooks.test.ts` (modifiés) | Texte de consentement |

---

## Ordre et parallélisme

| Lot | Tâches | Pourquoi ensemble |
|---|---|---|
| A | 1, 2 | 1 = la base (tout en dépend) ; 2 = la CLI, fichiers disjoints, sans dépendance |
| B | 3, 4, 5 | Dépendent de 1 seulement ; fichiers disjoints (`partage.*`, `ingest-turns.*`, `space.*`) |
| C | 6, 7 | 6 dépend de 3 ; 7 dépend de 3 et 5. Fichiers disjoints (MCP contre app/composants/messages) |
| D | 8, puis 9 | 8 touche `messages/*.json` comme 7 et ajoute un lien vers `/developpeurs` (le contrat `page-links` exige que la page existe) : après 7. 9 vérifie tout |

Les tests en base d'un même lot tournent sur la même base `leon_test_passation` : chaque test crée ses équipes (`newTeam`), rien ne se croise. Une seule exception, la tâche 1 rejoue le partage des sessions passées : elle le fait dans une transaction annulée (voir son test).

---

### Tâche 1 : la migration 0044 et la table Drizzle

**Fichiers :**
- Créer : `src/server/db/migrations/0044-sessions-partagees.sql`
- Modifier : `src/server/db/schema/memory.ts` (imports ligne 1, table ajoutée en fin de fichier)
- Test : `src/server/db/migrations/0044-sessions-partagees.db.test.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { depotsPrives } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';

// Migration 0044 : les sessions Claude Code liées à GitHub sont partagées à l'organisation ; depots_prives.

// L'indexation signale les projets au point du matin : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const MIGRATION = readFileSync(new URL('./0044-sessions-partagees.sql', import.meta.url), 'utf8');
const BACKFILL = MIGRATION.split('-- début : partage des sessions passées')[1]?.split(
  '-- fin : partage des sessions passées',
)[0];

describe('0044 : partage des sessions passées', () => {
  it('partage les sessions claude_code liées à GitHub sur les cinq tables, et elles seules', async () => {
    expect(BACKFILL).toBeTruthy();
    const { tenantId, members } = await newTeam(['Paul'], tenantIds);
    const [paul] = members as [TenantContext];
    const github = await seedIndexed(paul, {
      kind: 'claude_code',
      metadata: { project: 'github.com/acme/app' },
    });
    const dossier = await seedRun(paul, {
      kind: 'claude_code',
      metadata: { project: 'dossier:0123456789abcdef' },
    });
    const sansCle = await seedRun(paul, { kind: 'claude_code' });
    const chat = await seedRun(paul, {
      kind: 'chatgpt',
      metadata: { project: 'github.com/acme/app' },
    });

    // Rejoué dans une transaction annulée : les sessions des autres fichiers de test ne bougent pas.
    const client = await adminPool.connect();
    try {
      await client.query('begin');
      await client.query(BACKFILL as string);
      const acls = async (query: string, sourceId: string) =>
        (await client.query<{ acl: string[] }>(query, [sourceId])).rows.map((row) => row.acl);

      for (const query of [
        'select distinct acl::text[] as acl from sources where id = $1',
        'select distinct acl::text[] as acl from turns where source_id = $1',
        'select distinct acl::text[] as acl from ingest_runs where source_id = $1',
        'select distinct acl::text[] as acl from passages where source_id = $1',
        `select distinct v.acl::text[] as acl from passage_vectors v
           join passages p on p.id = v.passage_id where p.source_id = $1`,
      ]) {
        expect(await acls(query, github.sourceId), query).toEqual([[tenantId]]);
      }
      for (const other of [dossier, sansCle, chat]) {
        expect(
          await acls('select distinct acl::text[] as acl from sources where id = $1', other.sourceId),
        ).toEqual([[paul.userId]]);
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

describe('0044 : depots_prives', () => {
  it('chacun ne voit que ses propres lignes, et ne les écrit que par regler_partage_depot', async () => {
    const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
    const [paul, marie] = members as [TenantContext, TenantContext];

    await withTenant(paul, (tx) =>
      tx.execute(sql`select regler_partage_depot('github.com/acme/app', false)`),
    );

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ project: depotsPrives.project }).from(depotsPrives));
    expect(await read(paul)).toEqual([{ project: 'github.com/acme/app' }]);
    expect(await read(marie)).toEqual([]);
    await expect(
      withTenant(marie, (tx) =>
        tx.insert(depotsPrives).values({
          tenantId: marie.tenantId,
          userId: marie.userId,
          project: 'github.com/acme/app',
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('refuse une clé qui n’est pas un dépôt GitHub', async () => {
    const { members } = await newTeam(['Paul'], tenantIds);
    const [paul] = members as [TenantContext];

    const { rows } = await withTenant(paul, (tx) =>
      tx.execute<{ n: number }>(
        sql`select regler_partage_depot('dossier:0123456789abcdef', false) as n`,
      ),
    );

    expect(rows[0]?.n).toBe(0);
    expect(
      await withTenant(paul, (tx) => tx.select().from(depotsPrives)),
    ).toEqual([]);
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/db/migrations/0044-sessions-partagees.db.test.ts`
Attendu : ÉCHEC, `ENOENT` sur `0044-sessions-partagees.sql` et `depotsPrives` non exporté.

- [ ] **Étape 3 : écrire la migration**

```sql
-- 0044-sessions-partagees.sql : les sessions Claude Code liées à un dépôt GitHub sont partagées à l'organisation
-- (spec du 01/11/2026). Le partage d'une session est son ACL, sur les cinq tables qui la portent : sources, turns,
-- ingest_runs, passages, passage_vectors (read_log porte l'accès du lecteur à son journal : on n'y touche pas).
-- L'auteur, et lui seul, rend privée une session ou toutes ses sessions d'un dépôt (depots_prives).

-- Les dépôts dont un membre garde ses sessions privées, passées et futures. Écrits seulement par
-- regler_partage_depot ; lus par la capture et l'espace Développeurs.
create table depots_prives (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  project text not null check (project ~ '^github\.com/[a-z0-9._-]+/[a-z0-9._-]+$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, project)
);

alter table depots_prives enable row level security;
-- Un user_id n'est jamais l'identifiant d'une organisation : `any(app_principals())` ne laisse voir que ses lignes.
create policy propres_lignes on depots_prives to leon_app
  using (tenant_id = app_tenant() and user_id = any(app_principals()));
grant select on depots_prives to leon_app;

-- Régler le partage d'une session : son auteur seul, une session claude_code liée à un dépôt GitHub. Un
-- administrateur ne le peut pas à sa place (la session est la sienne). La source est verrouillée et mise à jour la
-- première : une indexation en cours (lockSources, verrou partagé) finit avant, ou lit l'accès déjà corrigé.
create function regler_partage_session(p_source uuid, p_partage boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_acl uuid[];
begin
  select case when p_partage then array[s.tenant_id] else array[s.owner_user_id] end
    into v_acl
    from sources s
   where s.id = p_source and s.tenant_id = app_tenant()
     and s.owner_user_id = any(app_principals())
     and s.kind = 'claude_code'
     and s.metadata ->> 'project' like 'github.com/%'
     for update;
  if v_acl is null then
    return false;
  end if;
  update sources set acl = v_acl where id = p_source;
  update turns set acl = v_acl where source_id = p_source;
  update ingest_runs set acl = v_acl where source_id = p_source;
  update passages set acl = v_acl where source_id = p_source;
  update passage_vectors v set acl = v_acl
    from passages p
   where p.source_id = p_source and v.passage_id = p.id;
  return true;
end
$$;
revoke all on function regler_partage_session(uuid, boolean) from public;
grant execute on function regler_partage_session(uuid, boolean) to leon_app;

-- Rendre privé (ou partager de nouveau) tout un dépôt pour l'appelant : la ligne de depots_prives, puis chacune de
-- ses sessions claude_code sur ce dépôt. Rend le nombre de sessions réglées. L'appelant est le membre actif de
-- l'organisation parmi ses principaux.
create function regler_partage_depot(p_project text, p_partage boolean)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
  v_source uuid;
  v_count integer := 0;
begin
  select m."userId" into v_user
    from member m join "user" u on u.id = m."userId"
   where m."organizationId" = app_tenant() and m."userId" = any(app_principals())
     and u.deleted_at is null;
  if v_user is null or p_project !~ '^github\.com/[a-z0-9._-]+/[a-z0-9._-]+$' then
    return 0;
  end if;
  if p_partage then
    delete from depots_prives
     where tenant_id = app_tenant() and user_id = v_user and project = p_project;
  else
    insert into depots_prives (tenant_id, user_id, project)
    values (app_tenant(), v_user, p_project)
    on conflict do nothing;
  end if;
  -- Dans l'ordre des identifiants : deux réglages concurrents ne s'attendent jamais l'un l'autre.
  for v_source in
    select s.id from sources s
     where s.tenant_id = app_tenant() and s.owner_user_id = v_user and s.kind = 'claude_code'
       and s.metadata ->> 'project' = p_project
     order by s.id
  loop
    if regler_partage_session(v_source, p_partage) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;
revoke all on function regler_partage_depot(text, boolean) from public;
grant execute on function regler_partage_depot(text, boolean) to leon_app;

-- Les sessions déjà captées sont partagées dès le déploiement (choix de Claude dans la spec : l'équipe a la matière
-- tout de suite). Seules celles encore privées à leur auteur changent ; rejouable sans effet. Le test de la migration
-- rejoue ce bloc entre les deux marqueurs.
-- début : partage des sessions passées
update sources set acl = array[tenant_id]
 where kind = 'claude_code' and metadata ->> 'project' like 'github.com/%'
   and acl = array[owner_user_id];
update turns t set acl = array[s.tenant_id]
  from sources s
 where t.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update ingest_runs r set acl = array[s.tenant_id]
  from sources s
 where r.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update passages p set acl = array[s.tenant_id]
  from sources s
 where p.source_id = s.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
update passage_vectors v set acl = array[s.tenant_id]
  from passages p join sources s on s.id = p.source_id
 where v.passage_id = p.id and s.kind = 'claude_code'
   and s.metadata ->> 'project' like 'github.com/%' and s.acl = array[s.tenant_id];
-- fin : partage des sessions passées
```

- [ ] **Étape 4 : ajouter la table Drizzle**

Dans `src/server/db/schema/memory.ts`, ligne 1 :

```ts
import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
```

En fin de fichier :

```ts
// Les dépôts dont un membre garde ses sessions Claude Code privées (0044). Écrits par regler_partage_depot seule.
export const depotsPrives = pgTable(
  'depots_prives',
  {
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    project: text('project').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId, table.project] })],
);
```

- [ ] **Étape 5 : lancer les tests, ils passent, et les contrats de la base**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/db/`
Attendu : tout réussit, dont les 3 tests de 0044, `rls-coverage` (`depots_prives` a la sécurité par ligne, et aucun droit `delete`) et `schema-contract` (les colonnes de `depotsPrives` existent).

- [ ] **Étape 6 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/server/db/migrations/0044-sessions-partagees.sql src/server/db/migrations/0044-sessions-partagees.db.test.ts src/server/db/schema/memory.ts
git commit -m "Sessions partagées : migration 0044 et depots_prives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 2 : le texte de consentement de `leon installer-crochets`

**Fichiers :**
- Modifier : `src/cli/install-hooks.ts:95` (le `role` du crochet `SessionEnd`)
- Test : `src/cli/install-hooks.test.ts` (nouveau `describe` en fin de fichier)

Le texte de la CLI est en anglais d'un bout à l'autre ; la phrase de la spec y est traduite.

- [ ] **Étape 1 : écrire le test qui échoue**

En fin de `src/cli/install-hooks.test.ts` :

```ts
describe('installHooks : ce que voit l’équipe', () => {
  it('dit que les sessions dans un dépôt GitHub sont visibles par l’équipe, et où les rendre privées', async () => {
    const { output } = await install({ assumeYes: true });

    expect(output).toContain('visible to your team on Leon');
    expect(output).toContain('Developers space');
    expect(output).not.toContain('stays private to its author');
  });
});
```

- [ ] **Étape 2 : lancer le test, il échoue**

Lancer : `pnpm vitest run src/cli/install-hooks.test.ts`
Attendu : ÉCHEC sur `visible to your team on Leon`.

- [ ] **Étape 3 : changer le texte**

Dans `src/cli/install-hooks.ts`, le `role` du crochet `SessionEnd` :

```ts
    role: 'at the end of every session, sends the text of the exchanges to Leon (secrets masked). Your Claude Code sessions in a GitHub repository are visible to your team on Leon; you can make one private, or a whole repository, in the Developers space. Other sessions stay private.',
```

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `pnpm vitest run src/cli/install-hooks.test.ts src/cli/install-hooks.contrat.test.ts`
Attendu : tout réussit.

- [ ] **Étape 5 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/cli/install-hooks.ts src/cli/install-hooks.test.ts
git commit -m "Sessions partagées : le consentement des crochets le dit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 3 : régler le partage côté serveur

**Fichiers :**
- Créer : `src/server/developpeurs/partage.ts`
- Test : `src/server/developpeurs/partage.db.test.ts`

Dépend de la tâche 1. Les sessions « suivantes » d'un dépôt rendu privé sont testées par la tâche 4 (capture) et la tâche 6 (MCP).

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { searchPassages } from '@/server/search/search';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { lastSession, setRepoSharing, setSessionSharing } from './partage';

// L'indexation signale les projets au point du matin : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const embedder = createFakeEmbedder();
const APP = 'github.com/acme/app';
const DAY = 86_400_000;

// Un mot que seule cette session contient (lettres seulement, pour le plein texte).
const word = () => `cache${randomUUID().replace(/[^a-f]/g, '')}`;

async function team() {
  const { tenantId, members } = await newTeam(['Paul', 'Marie'], tenantIds);
  const other = await newTeam(['Zoé'], tenantIds);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { tenantId, paul, marie, zoe: other.members[0] as TenantContext };
}

// Une session Claude Code partagée et indexée (passages et vecteurs), dont le texte porte `token`.
const sharedSession = (
  owner: TenantContext,
  token: string,
  input: { project?: string; kind?: 'claude_code' | 'claude_ai'; lastTurnAt?: Date } = {},
) =>
  seedIndexed(
    owner,
    {
      kind: input.kind ?? 'claude_code',
      acl: [owner.tenantId],
      title: `Session ${token}`,
      metadata: { project: input.project ?? APP },
      lastTurnAt: input.lastTurnAt ?? new Date(),
      turns: [{ text: `Réglage du cache ${token}` }],
    },
    embedder,
  );

const hits = async (ctx: TenantContext, token: string) =>
  (await searchPassages(ctx, { query: token, embedder })).hits.map((hit) => hit.sourceId);

// L'accès de la source sur chacune des cinq tables.
async function aclOf(sourceId: string): Promise<Record<string, string[]>> {
  const { rows } = await adminPool.query<{ t: string; acl: string[] }>(
    `select 'sources' as t, acl::text[] as acl from sources where id = $1
     union all select distinct 'turns', acl::text[] from turns where source_id = $1
     union all select distinct 'ingest_runs', acl::text[] from ingest_runs where source_id = $1
     union all select distinct 'passages', acl::text[] from passages where source_id = $1
     union all select distinct 'passage_vectors', v.acl::text[]
       from passage_vectors v join passages p on p.id = v.passage_id where p.source_id = $1`,
    [sourceId],
  );
  return Object.fromEntries(rows.map((row) => [row.t, row.acl]));
}

const everywhere = (acl: string[]) => ({
  sources: acl,
  turns: acl,
  ingest_runs: acl,
  passages: acl,
  passage_vectors: acl,
});

describe('setSessionSharing', () => {
  it('rendre une session privée la retire de la recherche d’un collègue, passages et vecteurs compris', async () => {
    const { tenantId, paul, marie, zoe } = await team();
    const token = word();
    const { sourceId } = await sharedSession(paul, token);
    expect(await hits(marie, token)).toContain(sourceId);
    expect(await hits(zoe, token)).not.toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));

    const changed = await setSessionSharing(paul, sourceId, false);

    expect(changed).toMatchObject({ id: sourceId, title: `Session ${token}` });
    expect(await hits(marie, token)).not.toContain(sourceId);
    expect(await hits(paul, token)).toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([paul.userId]));
  });

  it('seul l’auteur règle le partage de sa session', async () => {
    const { tenantId, paul, marie, zoe } = await team();
    const { sourceId } = await sharedSession(paul, word());

    expect(await setSessionSharing(marie, sourceId, false)).toBeNull();
    expect(await setSessionSharing(zoe, sourceId, false)).toBeNull();
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));
  });

  it('partager de nouveau une session la rend visible', async () => {
    const { tenantId, paul, marie } = await team();
    const token = word();
    const { sourceId } = await sharedSession(paul, token);
    await setSessionSharing(paul, sourceId, false);

    expect(await setSessionSharing(paul, sourceId, true)).not.toBeNull();
    expect(await hits(marie, token)).toContain(sourceId);
    expect(await aclOf(sourceId)).toEqual(everywhere([tenantId]));
  });

  it('ne touche ni une session sans clé GitHub ni une session claude_ai', async () => {
    const { paul } = await team();
    const dossier = await sharedSession(paul, word(), { project: 'dossier:0123456789abcdef' });
    const chat = await sharedSession(paul, word(), { kind: 'claude_ai' });

    expect(await setSessionSharing(paul, dossier.sourceId, false)).toBeNull();
    expect(await setSessionSharing(paul, chat.sourceId, false)).toBeNull();
  });
});

describe('setRepoSharing', () => {
  it('rend privées toutes les sessions passées du dépôt, et elles seules ; le partage les rend', async () => {
    const { paul, marie } = await team();
    const [a, b, c] = [word(), word(), word()];
    const first = await sharedSession(paul, a);
    const second = await sharedSession(paul, b);
    const elsewhere = await sharedSession(paul, c, { project: 'github.com/acme/autre' });

    expect(await setRepoSharing(paul, APP, false)).toBe(2);
    expect(await hits(marie, a)).not.toContain(first.sourceId);
    expect(await hits(marie, b)).not.toContain(second.sourceId);
    expect(await hits(marie, c)).toContain(elsewhere.sourceId);
    const { rows } = await adminPool.query(
      'select project from depots_prives where user_id = $1',
      [paul.userId],
    );
    expect(rows).toEqual([{ project: APP }]);

    expect(await setRepoSharing(paul, APP, true)).toBe(2);
    expect(await hits(marie, a)).toContain(first.sourceId);
    expect(
      (await adminPool.query('select 1 from depots_prives where user_id = $1', [paul.userId]))
        .rowCount,
    ).toBe(0);
  });

  it('ne touche pas aux sessions des autres sur ce dépôt', async () => {
    const { paul, marie } = await team();
    const token = word();
    const hers = await sharedSession(marie, token);

    expect(await setRepoSharing(paul, APP, false)).toBe(0);
    expect(await hits(paul, token)).toContain(hers.sourceId);
  });
});

describe('lastSession', () => {
  it('rend la dernière session partagée, ou la dernière privée, de l’auteur', async () => {
    const { paul } = await team();
    const older = await sharedSession(paul, word(), { lastTurnAt: new Date(Date.now() - DAY) });
    const newer = await sharedSession(paul, word());

    expect(await lastSession(paul, true)).toBe(newer.sourceId);
    await setSessionSharing(paul, newer.sourceId, false);
    expect(await lastSession(paul, true)).toBe(older.sourceId);
    expect(await lastSession(paul, false)).toBe(newer.sourceId);
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/developpeurs/partage.db.test.ts`
Attendu : ÉCHEC, module `./partage` introuvable.

- [ ] **Étape 3 : écrire le module**

```ts
import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';

// Le partage d'une session Claude Code (spec du 01/11/2026) : la règle (l'auteur seul, une session claude_code liée
// à un dépôt GitHub) et l'écriture sur les cinq tables sont dans regler_partage_session et regler_partage_depot
// (0044). Ce module ne fait que les appeler et relire ce qui a changé.

// La clé d'un dépôt GitHub, telle que la CLI l'envoie (src/cli/project-key.ts) et que depots_prives l'accepte.
export const GITHUB_PROJECT = /^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/;

export type SessionRef = { id: string; title: string | null; at: string };

// Rend la session réglée (titre, date de son dernier échange), ou null si l'appelant n'a pas le droit.
export async function setSessionSharing(
  ctx: TenantContext,
  sourceId: string,
  share: boolean,
): Promise<SessionRef | null> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(
      sql`select regler_partage_session(${sourceId}::uuid, ${share}) as ok`,
    );
    if (rows[0]?.ok !== true) return null;
    const session = await tx.execute<SessionRef>(sql`
      select id, title, coalesce(last_turn_at, created_at)::text as at
      from sources where id = ${sourceId}::uuid`);
    return session.rows[0] ?? null;
  });
}

// Rend le nombre de sessions de l'appelant réglées sur ce dépôt ; ses sessions futures suivent depots_prives.
export async function setRepoSharing(
  ctx: TenantContext,
  project: string,
  share: boolean,
): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`select regler_partage_depot(${project}, ${share}) as n`,
    );
    return rows[0]?.n ?? 0;
  });
}

// La dernière session Claude Code de l'appelant liée à un dépôt GitHub, partagée (`shared`) ou privée.
export async function lastSession(ctx: TenantContext, shared: boolean): Promise<string | null> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from sources
      where owner_user_id = ${ctx.userId} and kind = 'claude_code'
        and metadata ->> 'project' like 'github.com/%'
        and (acl @> array[tenant_id]) = ${shared}
      order by coalesce(last_turn_at, created_at) desc
      limit 1`);
    return rows[0]?.id ?? null;
  });
}
```

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/developpeurs/partage.db.test.ts`
Attendu : 7 tests réussis.

- [ ] **Étape 5 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/server/developpeurs/partage.ts src/server/developpeurs/partage.db.test.ts
git commit -m "Sessions partagées : rendre privée ou partager une session, un dépôt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 4 : le partage décidé à la capture

**Fichiers :**
- Modifier : `src/server/ingest/ingest-turns.ts` (imports, `captureRows`, `recordProject`, `ingestTurns`)
- Test : `src/server/ingest/ingest-turns.db.test.ts` (nouveau `describe` en fin de fichier)

Dépend de la tâche 1 seulement : le test règle un dépôt privé par `regler_partage_depot` directement, pour ne pas attendre la tâche 3.

- [ ] **Étape 1 : écrire les tests qui échouent**

En tête du fichier de test, ajouter `sql` à l'import de `drizzle-orm` :

```ts
import { eq, sql } from 'drizzle-orm';
```

En fin de fichier :

```ts
describe('ingestTurns : partage des sessions Claude Code', () => {
  const APP = 'github.com/acme/app';
  const code = (n: number) => newTurn(n, { capture_mode: 'file' });

  it('partage à l’organisation une session liée à un dépôt GitHub, tours et run compris', async () => {
    const { tenantId, paul, marie, externalId } = await setup();

    const { sourceId } = await ingestTurns(
      paul,
      payload(externalId, [code(1)], { kind: 'claude_code', project: APP }),
    );

    expect(await readSource(marie, sourceId)).toHaveLength(1);
    expect(await readTurns(marie, sourceId)).toHaveLength(1);
    expect((await readRuns(paul, sourceId))[0]?.acl).toEqual([tenantId]);
  });

  it('garde privées une session sans clé GitHub et une session claude_ai', async () => {
    const { paul, marie } = await setup();
    const id = () => `conv-${crypto.randomUUID()}`;

    const dossier = await ingestTurns(
      paul,
      payload(id(), [code(1)], { kind: 'claude_code', project: 'dossier:0123456789abcdef' }),
    );
    const sansCle = await ingestTurns(paul, payload(id(), [code(1)], { kind: 'claude_code' }));
    const chat = await ingestTurns(
      paul,
      payload(id(), [newTurn(1)], { kind: 'claude_ai', project: APP }),
    );

    for (const { sourceId } of [dossier, sansCle, chat]) {
      expect(await readSource(marie, sourceId)).toHaveLength(0);
    }
  });

  it('partage une session déjà captée quand elle reçoit sa clé GitHub, anciens tours compris', async () => {
    const { paul, marie, externalId } = await setup();
    const { sourceId } = await ingestTurns(
      paul,
      payload(externalId, [code(1)], { kind: 'claude_code' }),
    );
    expect(await readTurns(marie, sourceId)).toHaveLength(0);

    await ingestTurns(paul, payload(externalId, [code(2)], { kind: 'claude_code', project: APP }));

    expect(await readTurns(marie, sourceId)).toHaveLength(2);
  });

  it('garde privée une session rendue privée qui reçoit de nouveaux tours', async () => {
    const { paul, marie, externalId } = await setup();
    const body = (n: number) => payload(externalId, [code(n)], { kind: 'claude_code', project: APP });
    const { sourceId } = await ingestTurns(paul, body(1));
    await withTenant(paul, (tx) =>
      tx.execute(sql`select regler_partage_session(${sourceId}::uuid, false)`),
    );

    await ingestTurns(paul, body(2));

    expect(await readTurns(marie, sourceId)).toHaveLength(0);
    expect(await readTurns(paul, sourceId)).toHaveLength(2);
  });

  it('garde privées les nouvelles sessions d’un dépôt que l’auteur a rendu privé', async () => {
    const { paul, marie, externalId } = await setup();
    await withTenant(paul, (tx) => tx.execute(sql`select regler_partage_depot(${APP}, false)`));

    const { sourceId } = await ingestTurns(
      paul,
      payload(externalId, [code(1)], { kind: 'claude_code', project: APP }),
    );

    expect(await readSource(marie, sourceId)).toHaveLength(0);
  });

  it('une autre organisation ne voit rien', async () => {
    const { paul, externalId } = await setup();
    const other = await createTestTenant(['Zoé']);
    const zoe = other.members[0] as TenantContext;

    const { sourceId } = await ingestTurns(
      paul,
      payload(externalId, [code(1)], { kind: 'claude_code', project: APP }),
    );

    expect(await readSource(zoe, sourceId)).toHaveLength(0);
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/ingest/ingest-turns.db.test.ts`
Attendu : ÉCHEC des tests « partage à l'organisation… » et « partage une session déjà captée… » (Marie ne voit rien) ; les autres passent déjà.

- [ ] **Étape 3 : décider du partage à la capture**

Dans `src/server/ingest/ingest-turns.ts`, l'import du schéma (ligne 6) :

```ts
import { depotsPrives, ingestRuns, sources, turns } from '@/server/db/schema/memory';
```

`captureRows` reçoit l'accès de la source (remplace la fonction, lignes 77-99) :

```ts
// Les tours vides après nettoyage sont ignorés. Un tour a l'accès de sa source.
function captureRows(
  ctx: TenantContext,
  sourceId: string,
  payloadTurns: IngestPayload['turns'],
  acl: string[],
): TurnRow[] {
  return payloadTurns.flatMap((turn) => {
    const text = prepareTurnText(turn.text);
    if (text === null) return [];
    return [
      {
        tenantId: ctx.tenantId,
        sourceId,
        externalId: turn.external_id,
        role: turn.role,
        text,
        ts: new Date(turn.ts),
        captureMode: turn.capture_mode,
        acl,
      },
    ];
  });
}
```

`recordProject` décide du partage et rend l'accès de la source (remplace la fonction, lignes 117-125) :

```ts
const isGithubProject = (project: string | null | undefined) =>
  project?.startsWith('github.com/') === true;

// La clé de projet d'une session captée (C8) va dans `sources.metadata.project`, à côté des autres clés
// (nature…) : le dernier projet reçu l'emporte, un envoi sans projet ne touche à rien. Une session Claude Code qui
// reçoit sa première clé GitHub est partagée à l'organisation, toutes ses lignes comprises (spec du 01/11/2026),
// sauf si l'auteur a rendu ce dépôt privé. Une session déjà liée à GitHub garde son accès : un retrait tient.
// Rend l'accès de la source, que ses nouveaux tours et son run recopient.
async function recordProject(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
  source: IngestPayload['source'],
): Promise<string[]> {
  const [before] = await tx
    .select({ acl: sources.acl, project: sql<string | null>`${sources.metadata} ->> 'project'` })
    .from(sources)
    .where(eq(sources.id, sourceId));
  if (!before) throw new Error('source introuvable');
  if (source.project === undefined) return before.acl;
  await tx
    .update(sources)
    .set({ metadata: sql`${sources.metadata} || ${JSON.stringify({ project: source.project })}::jsonb` })
    .where(eq(sources.id, sourceId));
  if (
    source.kind !== 'claude_code' ||
    isGithubProject(before.project) ||
    !isGithubProject(source.project)
  ) {
    return before.acl;
  }
  const [hidden] = await tx
    .select({ project: depotsPrives.project })
    .from(depotsPrives)
    .where(and(eq(depotsPrives.userId, ctx.userId), eq(depotsPrives.project, source.project)));
  if (hidden) return before.acl;
  await tx.execute(sql`select regler_partage_session(${sourceId}::uuid, true)`);
  return [ctx.tenantId];
}
```

Dans `ingestTurns`, le projet est rangé avant les tours, qui prennent l'accès rendu (remplace le corps de la transaction, lignes 164-172) :

```ts
  const { sourceId, newTurnIds, ingestRunId } = await withTenant(ctx, async (tx) => {
    const sourceId = await upsertSource(tx, ctx, payload.source, title);
    const acl = await recordProject(tx, ctx, sourceId, payload.source);
    const { ids, lastTs } = await insertNewTurns(
      tx,
      captureRows(ctx, sourceId, payload.turns, acl),
    );
    await updateSource(tx, sourceId, title, lastTs);
    if (ids.length === 0) return { sourceId, newTurnIds: ids, ingestRunId: null };
    const ingestRunId = await createIngestRun(tx, ctx, sourceId, ids, acl);
    return { sourceId, newTurnIds: ids, ingestRunId };
  });
```

`upsertSource` ne change pas : une source neuve naît privée (`acl: [ctx.userId]`), puis `recordProject` la partage avant qu'elle ait un tour.

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/ingest/ src/server/api/ingest-routes.db.test.ts`
Attendu : tout réussit, dont les 6 nouveaux tests et les anciens tests de `metadata.project` (ils utilisent `chatgpt`).

- [ ] **Étape 5 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/server/ingest/ingest-turns.ts src/server/ingest/ingest-turns.db.test.ts
git commit -m "Sessions partagées : le partage décidé à la capture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 5 : les données de l'espace Développeurs

**Fichiers :**
- Créer : `src/server/developpeurs/space.ts`
- Test : `src/server/developpeurs/space.db.test.ts`

Dépend de la tâche 1 seulement (le test règle un dépôt privé par la fonction en base).

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import { developerSpace, isDeveloper } from './space';

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const codeSession = (
  owner: TenantContext,
  title: string,
  input: { project: string; shared: boolean; lastTurnAt?: Date },
) =>
  seedRun(owner, {
    kind: 'claude_code',
    title,
    acl: input.shared ? [owner.tenantId] : [owner.userId],
    metadata: { project: input.project },
    lastTurnAt: input.lastTurnAt ?? new Date(),
  });

describe('isDeveloper', () => {
  it('vaut vrai pour un membre qui a une session Claude Code ou une note de passation, faux sinon', async () => {
    const { tenantId, members } = await newTeam(['Paul', 'Marie', 'Julie'], tenantIds);
    const [paul, marie, julie] = members as [TenantContext, TenantContext, TenantContext];
    await codeSession(paul, 'Cache', { project: 'github.com/acme/app', shared: false });
    await seedRun(marie, {
      kind: 'passation',
      acl: [tenantId],
      metadata: { project: 'github.com/acme/app' },
    });
    await seedRun(julie, { kind: 'chatgpt' });

    expect(await isDeveloper(paul)).toBe(true);
    expect(await isDeveloper(marie)).toBe(true);
    expect(await isDeveloper(julie)).toBe(false);
  });
});

describe('developerSpace', () => {
  it('range par dépôt les sessions partagées, les notes, et à part les sessions privées du lecteur', async () => {
    const { tenantId, members } = await newTeam(['Paul', 'Marie', 'Julie'], tenantIds);
    const [paul, marie, julie] = members as [TenantContext, TenantContext, TenantContext];
    const other = await newTeam(['Zoé'], tenantIds);
    const zoe = other.members[0] as TenantContext;

    const old = await codeSession(paul, 'Ancienne', {
      project: 'github.com/acme/app',
      shared: true,
      lastTurnAt: daysAgo(2),
    });
    const hers = await codeSession(marie, 'De Marie', {
      project: 'github.com/acme/app',
      shared: true,
    });
    const secret = await codeSession(paul, 'Privée', {
      project: 'github.com/acme/app',
      shared: false,
    });
    await codeSession(marie, 'Privée de Marie', { project: 'github.com/acme/app', shared: false });
    await codeSession(zoe, 'Ailleurs', { project: 'github.com/acme/app', shared: true });
    await seedRun(marie, {
      kind: 'passation',
      acl: [tenantId],
      metadata: { project: 'github.com/acme/notes' },
      turns: [{ text: "## Où j'en suis\nCache à revoir." }],
    });
    await withTenant(paul, (tx) =>
      tx.execute(sql`select regler_partage_depot('github.com/acme/cache', false)`),
    );

    const space = await developerSpace(paul);

    expect(space?.repos.map((repo) => repo.project)).toEqual([
      'github.com/acme/app',
      'github.com/acme/cache',
      'github.com/acme/notes',
    ]);
    const [app, cache, notes] = space?.repos ?? [];
    expect(app?.sessions.map((session) => session.id)).toEqual([hers.sourceId, old.sourceId]);
    expect(app?.mineShared).toBe(true);
    expect(cache?.mineShared).toBe(false);
    expect(notes?.notes).toContain('Cache à revoir.');
    expect(space?.privateSessions.map((session) => session.id)).toEqual([secret.sourceId]);
    expect(await developerSpace(julie)).toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/developpeurs/space.db.test.ts`
Attendu : ÉCHEC, module `./space` introuvable.

- [ ] **Étape 3 : écrire le module**

```ts
import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { readBranchState } from '@/server/passation/state';

// L'espace Développeurs (spec du 01/11/2026) : les dépôts de l'équipe, leurs sessions Claude Code partagées et leurs
// dernières notes de passation, et à part les sessions privées du lecteur. Tout se lit sous ses droits : la sécurité
// par ligne ne lui montre que les sessions partagées et les siennes.

// shortcut: les 500 sessions les plus récentes seulement ; paginer quand une équipe en aura plus.
const SESSIONS_MAX = 500;

export type DevSession = {
  id: string;
  title: string | null;
  at: string;
  ownerUserId: string;
  ownerName: string | null;
  project: string;
  shared: boolean;
};
export type DevRepo = {
  project: string;
  sessions: DevSession[];
  notes: string | null;
  // Les sessions du lecteur sur ce dépôt sont partagées (le dépôt n'est pas dans ses depots_prives).
  mineShared: boolean;
};
export type DeveloperSpace = { repos: DevRepo[]; privateSessions: DevSession[] };

// Un membre qui code : il a au moins une session Claude Code ou une note de passation.
export async function isDeveloper(ctx: TenantContext): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from sources
        where owner_user_id = ${ctx.userId} and kind in ('claude_code', 'passation')
      ) as ok`);
    return rows[0]?.ok === true;
  });
}

// null pour un membre qui ne code pas : la page lui répond 404.
export async function developerSpace(ctx: TenantContext): Promise<DeveloperSpace | null> {
  if (!(await isDeveloper(ctx))) return null;
  const { sessions, noted, hidden } = await withTenant(ctx, async (tx) => {
    const sessions = await tx.execute<DevSession>(sql`
      select s.id, s.title, coalesce(s.last_turn_at, s.created_at)::text as at,
             s.owner_user_id as "ownerUserId", u.name as "ownerName",
             s.metadata ->> 'project' as project, s.acl @> array[s.tenant_id] as shared
      from sources s
      left join "user" u on u.id = s.owner_user_id
      where s.kind = 'claude_code' and s.metadata ->> 'project' like 'github.com/%'
      order by coalesce(s.last_turn_at, s.created_at) desc
      limit ${SESSIONS_MAX}`);
    const noted = await tx.execute<{ project: string }>(sql`
      select distinct metadata ->> 'project' as project from sources where kind = 'passation'`);
    const hidden = await tx.execute<{ project: string }>(sql`
      select project from depots_prives where user_id = ${ctx.userId}`);
    return { sessions: sessions.rows, noted: noted.rows, hidden: hidden.rows };
  });
  const hiddenProjects = new Set(hidden.map((row) => row.project));
  const shared = sessions.filter((session) => session.shared);
  const projects = [
    ...new Set([
      ...shared.map((session) => session.project),
      ...noted.map((row) => row.project),
      ...hiddenProjects,
    ]),
  ].sort();
  // Un dépôt après l'autre : une transaction chacun, jamais toutes les connexions du pool à la fois.
  const repos: DevRepo[] = [];
  for (const project of projects) {
    repos.push({
      project,
      sessions: shared.filter((session) => session.project === project),
      notes: await readBranchState(ctx, project, null),
      mineShared: !hiddenProjects.has(project),
    });
  }
  // La sécurité par ligne ne montre au lecteur que ses propres sessions privées.
  return { repos, privateSessions: sessions.filter((session) => !session.shared) };
}
```

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/developpeurs/space.db.test.ts`
Attendu : 2 tests réussis.

- [ ] **Étape 5 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/server/developpeurs/space.ts src/server/developpeurs/space.db.test.ts
git commit -m "Sessions partagées : les données de l'espace Développeurs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 6 : les outils MCP `session_rendre_privee` et `session_partager`

**Fichiers :**
- Créer : `src/server/mcp/tools/session-tools.ts`
- Modifier : `src/server/mcp/server.ts` (import, `MCP_INSTRUCTIONS`, enregistrement)
- Test : `src/server/mcp/mcp.db.test.ts` (liste des outils lignes 117-160, nouveau `describe`)

Dépend des tâches 3 et 4 (le test de dépôt capte une nouvelle session).

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `src/server/mcp/mcp.db.test.ts`, ajouter l'import :

```ts
import { withTenant } from '@/server/db/with-tenant';
```

Dans le test « annonce exactement… », la liste attendue devient :

```ts
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'briefing',
      'fetch',
      'passation_ecrire',
      'passation_lire',
      'passation_retirer',
      'remember',
      'search',
      'session_partager',
      'session_rendre_privee',
    ]);
```

et la liste des mots des instructions gagne `'session_rendre_privee'` et `'session_partager'`.

En fin de fichier :

```ts
describe('sessions partagées', () => {
  const APP = 'github.com/acme/app';
  const codeSession = (owner: TenantContext, title: string, lastTurnAt: Date, project = APP) =>
    seedRun(owner, {
      kind: 'claude_code',
      title,
      acl: [owner.tenantId],
      metadata: { project },
      lastTurnAt,
    });
  const visible = async (ctx: TenantContext, sourceId: string) =>
    (
      await withTenant(ctx, (tx) =>
        tx.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)),
      )
    ).length === 1;

  it('sans argument : rend privée la dernière session partagée, session_partager la rend', async () => {
    const { paul, marie } = await setupTeam();
    const old = await codeSession(paul, 'Ancienne', daysAgo(2));
    const last = await codeSession(paul, 'Dernière', daysAgo(0));
    const client = await connect(paul);

    const hidden = await call(client, 'session_rendre_privee');
    expect(hidden.isError).toBeFalsy();
    expect(hidden.text).toContain('Dernière');
    expect(await visible(marie, last.sourceId)).toBe(false);
    expect(await visible(marie, old.sourceId)).toBe(true);

    const shared = await call(client, 'session_partager');
    expect(shared.text).toContain('Dernière');
    expect(await visible(marie, last.sourceId)).toBe(true);
  });

  it('avec session : l’auteur seul', async () => {
    const { paul, marie } = await setupTeam();
    const { sourceId } = await codeSession(paul, 'Cache', daysAgo(1));

    const refused = await call(await connect(marie), 'session_rendre_privee', {
      session: sourceId,
    });
    expect(refused.isError).toBe(true);
    expect(await visible(marie, sourceId)).toBe(true);

    const client = await connect(paul);
    expect((await call(client, 'session_rendre_privee', { session: sourceId })).text).toContain(
      'Cache',
    );
    expect(await visible(marie, sourceId)).toBe(false);
    await call(client, 'session_partager', { session: sourceId });
    expect(await visible(marie, sourceId)).toBe(true);
  });

  it('avec depot : tout le dépôt, sessions passées et suivantes', async () => {
    const { paul, marie } = await setupTeam();
    const first = await codeSession(paul, 'Un', daysAgo(2));
    const second = await codeSession(paul, 'Deux', daysAgo(1));
    const elsewhere = await codeSession(paul, 'Ailleurs', daysAgo(1), 'github.com/acme/autre');
    const client = await connect(paul);

    const hidden = await call(client, 'session_rendre_privee', { depot: 'acme/app' });
    expect(hidden.isError).toBeFalsy();
    expect(hidden.text).toContain(APP);
    expect(await visible(marie, first.sourceId)).toBe(false);
    expect(await visible(marie, second.sourceId)).toBe(false);
    expect(await visible(marie, elsewhere.sourceId)).toBe(true);
    const next = await ingestModule.ingestTurns(paul, {
      source: { kind: 'claude_code', external_id: `session-${crypto.randomUUID()}`, project: APP },
      turns: [
        {
          external_id: 'm1',
          role: 'user',
          text: 'Suite du cache',
          ts: new Date().toISOString(),
          capture_mode: 'file',
        },
      ],
    });
    expect(await visible(marie, next.sourceId)).toBe(false);

    await call(client, 'session_partager', { depot: 'github.com/acme/app' });
    for (const id of [first.sourceId, second.sourceId, next.sourceId]) {
      expect(await visible(marie, id)).toBe(true);
    }
  });

  it('refuse un dépôt qui n’est pas sur GitHub', async () => {
    const result = await call(await connect(await setupPaul()), 'session_rendre_privee', {
      depot: 'dossier:0123456789abcdef',
    });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/mcp/mcp.db.test.ts`
Attendu : ÉCHEC de la liste des outils et des 4 nouveaux tests (outil inconnu).

- [ ] **Étape 3 : écrire les outils**

`src/server/mcp/tools/session-tools.ts` :

```ts
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  GITHUB_PROJECT,
  lastSession,
  setRepoSharing,
  setSessionSharing,
} from '@/server/developpeurs/partage';
import { projectKeyFromInput } from './briefing-tool';
import { guarded } from './guarded';

// Rendre privée ou partager de nouveau une session Claude Code (spec du 01/11/2026). Les sessions dans un dépôt
// GitHub sont partagées à l'équipe par défaut ; seul leur auteur change cela.

const SharingSchema = z.object({
  session: z
    .uuid()
    .nullish()
    .describe('Id of one of your Claude Code sessions (a source id from search or fetch).'),
  depot: z
    .string()
    .min(1)
    .max(300)
    .nullish()
    .describe(
      'GitHub repository (github.com/owner/repo or owner/repo): applies to all your sessions there, past and future.',
    ),
});

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });
const invalid = (value: string): CallToolResult => ({ ...text(value), isError: true });

async function changeSharing(
  ctx: TenantContext,
  share: boolean,
  { session, depot }: z.infer<typeof SharingSchema>,
): Promise<CallToolResult> {
  const state = share ? 'shared with your team' : 'private';
  if (!session && depot) {
    const project = projectKeyFromInput(depot);
    if (project === null || !GITHUB_PROJECT.test(project)) {
      return invalid('Invalid repository: give a GitHub repository (github.com/owner/repo or owner/repo).');
    }
    const count = await setRepoSharing(ctx, project, share);
    return text(`${project}: your sessions there are now ${state}, past ones (${count}) and future ones.`);
  }
  const id = session ?? (await lastSession(ctx, !share));
  if (!id) return invalid(`No session to make ${state}.`);
  const changed = await setSessionSharing(ctx, id, share);
  if (!changed) {
    return invalid(
      'Not changed: this session does not exist, is not yours, or is not linked to a GitHub repository.',
    );
  }
  return text(`Session now ${state}: "${changed.title ?? 'untitled'}" (${changed.at.slice(0, 10)}).`);
}

export function registerSessionTools(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'session_rendre_privee',
    {
      title: 'Make a session private',
      description:
        'Your Claude Code sessions in a GitHub repository are visible to your team. This makes one private: the given session, or all your sessions in the given repository (past and future), or, with no argument, your latest shared session. Returns what was made private.',
      inputSchema: SharingSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('session_rendre_privee', (args) => changeSharing(ctx, false, args)),
  );

  server.registerTool(
    'session_partager',
    {
      title: 'Share a session again',
      description:
        'Shares again with your team a Claude Code session you made private: the given session, or all your sessions in the given repository (past and future), or, with no argument, your latest private session.',
      inputSchema: SharingSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('session_partager', (args) => changeSharing(ctx, true, args)),
  );
}
```

Dans `src/server/mcp/server.ts`, l'import :

```ts
import { registerSessionTools } from './tools/session-tools';
```

`MCP_INSTRUCTIONS` gagne une phrase en fin de chaîne (après « …in its format. ») :

```ts
 The user's Claude Code sessions in a GitHub repository are shared with their team; when the user asks, make one private (or a whole repository) with session_rendre_privee, and share it again with session_partager.
```

et, dans `createLeonMcpServer`, après `registerPassationTools(server, ctx, client);` :

```ts
  registerSessionTools(server, ctx);
```

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db src/server/mcp/mcp.db.test.ts && pnpm vitest run src/test/contracts/mcp-descriptions.test.ts`
Attendu : tout réussit.

- [ ] **Étape 5 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/server/mcp/tools/session-tools.ts src/server/mcp/server.ts src/server/mcp/mcp.db.test.ts
git commit -m "Sessions partagées : outils MCP session_rendre_privee et session_partager

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 7 : la page Développeurs

**Fichiers :**
- Créer : `src/app/(app)/developpeurs/actions.ts`
- Créer : `src/app/(app)/developpeurs/actions.test.ts`
- Créer : `src/app/(app)/developpeurs/page.tsx`
- Créer : `src/components/verre/developpeurs/index.tsx`
- Modifier : `messages/fr.json`, `messages/en.json` (bloc `developers`, après le bloc `documents`)

Dépend des tâches 3 et 5. Composants de la maison seulement (`PageHeader`, `Section`, `GlassCard`, `EmptyState`, `Button`, `Switch`), sur le modèle de `src/components/verre/documents/index.tsx`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/app/(app)/developpeurs/actions.test.ts` :

```ts
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { setRepoSharing, setSessionSharing } from '@/server/developpeurs/partage';
import { setRepoSharingAction, setSessionSharingAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/developpeurs/partage', () => ({
  GITHUB_PROJECT: /^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/,
  setRepoSharing: vi.fn(),
  setSessionSharing: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
});

describe('setSessionSharingAction', () => {
  it('« Rendre privée » et « Partager » appellent setSessionSharing, puis rafraîchissent la page', async () => {
    const id = randomUUID();

    await setSessionSharingAction(form({ id, partage: '0' }));
    await setSessionSharingAction(form({ id, partage: '1' }));

    expect(setSessionSharing).toHaveBeenNthCalledWith(1, ctx, id, false);
    expect(setSessionSharing).toHaveBeenNthCalledWith(2, ctx, id, true);
    expect(revalidatePath).toHaveBeenCalledWith('/developpeurs');
  });

  it('ignore un identifiant invalide', async () => {
    await setSessionSharingAction(form({ id: 'pas-un-uuid', partage: '0' }));

    expect(setSessionSharing).not.toHaveBeenCalled();
  });
});

describe('setRepoSharingAction', () => {
  it('l’interrupteur appelle setRepoSharing avec le dépôt', async () => {
    await setRepoSharingAction(form({ project: 'github.com/acme/app', partage: '0' }));

    expect(setRepoSharing).toHaveBeenCalledExactlyOnceWith(ctx, 'github.com/acme/app', false);
    expect(revalidatePath).toHaveBeenCalledWith('/developpeurs');
  });

  it('ignore une clé qui n’est pas un dépôt GitHub', async () => {
    await setRepoSharingAction(form({ project: 'dossier:0123456789abcdef', partage: '0' }));

    expect(setRepoSharing).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2 : lancer les tests, ils échouent**

Lancer : `pnpm vitest run "src/app/(app)/developpeurs/actions.test.ts"`
Attendu : ÉCHEC, module `./actions` introuvable.

- [ ] **Étape 3 : écrire les actions**

`src/app/(app)/developpeurs/actions.ts` :

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import { GITHUB_PROJECT, setRepoSharing, setSessionSharing } from '@/server/developpeurs/partage';

// Les boutons « Rendre privée » / « Partager » et l'interrupteur par dépôt. La règle (l'auteur seul) est en base.
const partage = z.enum(['0', '1']).transform((value) => value === '1');

export async function setSessionSharingAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const input = z
    .object({ id: z.uuid(), partage })
    .safeParse({ id: formData.get('id'), partage: formData.get('partage') });
  if (!input.success) return;
  await setSessionSharing(ctx, input.data.id, input.data.partage);
  revalidatePath('/developpeurs');
}

export async function setRepoSharingAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const input = z
    .object({ project: z.string().regex(GITHUB_PROJECT), partage })
    .safeParse({ project: formData.get('project'), partage: formData.get('partage') });
  if (!input.success) return;
  await setRepoSharing(ctx, input.data.project, input.data.partage);
  revalidatePath('/developpeurs');
}
```

- [ ] **Étape 4 : lancer les tests, ils passent**

Lancer : `pnpm vitest run "src/app/(app)/developpeurs/actions.test.ts"`
Attendu : 4 tests réussis.

- [ ] **Étape 5 : ajouter les textes**

Dans `messages/fr.json`, après le bloc `"documents": { … },` :

```json
  "developers": {
    "title": "Développeurs",
    "subtitle": "Les sessions Claude Code de l’équipe, rangées par dépôt, et les dernières notes de passation.",
    "reposSection": "Dépôts de l’équipe",
    "emptyTitle": "Aucune session partagée pour l’instant.",
    "emptyDescription": "Les sessions Claude Code dans un dépôt GitHub apparaissent ici après leur capture.",
    "noSessions": "Aucune session partagée sur ce dépôt.",
    "notes": "Dernières notes de passation",
    "repoShared": "Mes sessions sur ce dépôt : partagées",
    "repoPrivate": "Mes sessions sur ce dépôt : privées",
    "untitled": "Session sans titre",
    "formerMember": "ancien membre",
    "by": "{name} · {when}",
    "makePrivate": "Rendre privée",
    "makePrivateLabel": "Rendre privée la session {title}",
    "share": "Partager",
    "shareLabel": "Partager la session {title}",
    "privateSection": "Mes sessions privées",
    "privateDescription": "Liées à un dépôt, visibles de vous seul."
  },
```

Dans `messages/en.json`, au même endroit :

```json
  "developers": {
    "title": "Developers",
    "subtitle": "Your team’s Claude Code sessions, by repository, and the latest handoff notes.",
    "reposSection": "Team repositories",
    "emptyTitle": "No shared session yet.",
    "emptyDescription": "Claude Code sessions in a GitHub repository show up here once captured.",
    "noSessions": "No shared session in this repository.",
    "notes": "Latest handoff notes",
    "repoShared": "My sessions in this repository: shared",
    "repoPrivate": "My sessions in this repository: private",
    "untitled": "Untitled session",
    "formerMember": "former member",
    "by": "{name} · {when}",
    "makePrivate": "Make private",
    "makePrivateLabel": "Make session {title} private",
    "share": "Share",
    "shareLabel": "Share session {title}",
    "privateSection": "My private sessions",
    "privateDescription": "Linked to a repository, visible to you only."
  },
```

- [ ] **Étape 6 : écrire l'écran**

`src/components/verre/developpeurs/index.tsx` :

```tsx
'use client';

import { Code, EyeOff, Share2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setRepoSharingAction, setSessionSharingAction } from '@/app/(app)/developpeurs/actions';
import { Button, EmptyState, GlassCard, PageHeader, Section, Switch } from '@/components/verre';
import { formatRelative } from '@/lib/format';
import { nb } from '@/lib/verre';
import type { DeveloperSpace, DevSession } from '@/server/developpeurs/space';

// Une session : auteur et date ; pour les siennes, « Rendre privée » ou « Partager ».
function SessionItem({ session, viewerId }: { session: DevSession; viewerId: string }) {
  const t = useTranslations('developers');
  const locale = useLocale();
  const title = session.title || t('untitled');
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-fg" title={title}>
          {nb(title)}
        </p>
        <p className="mt-0.5 text-label text-muted">
          {nb(
            t('by', {
              name: session.ownerName ?? t('formerMember'),
              when: formatRelative(new Date(session.at), new Date(), locale),
            }),
          )}
        </p>
      </div>
      {session.ownerUserId === viewerId && (
        <form action={setSessionSharingAction}>
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="partage" value={session.shared ? '0' : '1'} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            icon={session.shared ? EyeOff : Share2}
            aria-label={t(session.shared ? 'makePrivateLabel' : 'shareLabel', { title })}
          >
            {t(session.shared ? 'makePrivate' : 'share')}
          </Button>
        </form>
      )}
    </li>
  );
}

// « Mes sessions sur ce dépôt : partagées / privées » : passées et futures.
function RepoSwitch({ project, shared }: { project: string; shared: boolean }) {
  const t = useTranslations('developers');
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={shared}
      disabled={pending}
      label={t(shared ? 'repoShared' : 'repoPrivate')}
      onCheckedChange={(on) =>
        start(async () => {
          const data = new FormData();
          data.set('project', project);
          data.set('partage', on ? '1' : '0');
          await setRepoSharingAction(data);
        })
      }
    />
  );
}

export function Developpeurs({ space, viewerId }: { space: DeveloperSpace; viewerId: string }) {
  const t = useTranslations('developers');
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Section title={t('reposSection')} className="mt-0">
        {space.repos.length === 0 ? (
          <EmptyState icon={Code} title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <div className="grid gap-4">
            {space.repos.map((repo) => (
              <GlassCard key={repo.project} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-ui font-semibold text-fg">
                    {nb(repo.project.replace(/^github\.com\//, ''))}
                  </h3>
                  {repo.project.startsWith('github.com/') && (
                    <RepoSwitch project={repo.project} shared={repo.mineShared} />
                  )}
                </div>
                {repo.sessions.length === 0 ? (
                  <p className="mt-3 text-label text-muted">{t('noSessions')}</p>
                ) : (
                  <ul className="mt-2">
                    {repo.sessions.map((session) => (
                      <SessionItem key={session.id} session={session} viewerId={viewerId} />
                    ))}
                  </ul>
                )}
                {repo.notes && (
                  <>
                    <p className="mt-4 text-label font-semibold text-fg-2">{t('notes')}</p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-label text-fg-2">
                      {repo.notes}
                    </pre>
                  </>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </Section>
      {space.privateSessions.length > 0 && (
        <Section title={t('privateSection')} description={t('privateDescription')}>
          <GlassCard className="px-4">
            <ul>
              {space.privateSessions.map((session) => (
                <SessionItem key={session.id} session={session} viewerId={viewerId} />
              ))}
            </ul>
          </GlassCard>
        </Section>
      )}
    </div>
  );
}
```

- [ ] **Étape 7 : écrire la page**

`src/app/(app)/developpeurs/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Developpeurs } from '@/components/verre/developpeurs';
import { requireUserContext } from '@/server/auth/session';
import { developerSpace } from '@/server/developpeurs/space';

export const metadata: Metadata = { title: 'Développeurs' };

// Réservée aux membres qui codent (une session Claude Code ou une note de passation) ; les autres voient une page
// introuvable, pas un refus.
export default async function DeveloppeursPage() {
  const ctx = await requireUserContext();
  const space = await developerSpace(ctx);
  if (space === null) notFound();
  return <Developpeurs space={space} viewerId={ctx.userId} />;
}
```

- [ ] **Étape 8 : vérifier les contrats et l'écran**

Lancer : `pnpm vitest run src/i18n src/test/contracts/ui-imports.test.ts src/test/contracts/page-links.test.ts "src/app/(app)/developpeurs"`
Attendu : tout réussit (mêmes clés en français et en anglais ; le composant client n'atteint du serveur que des types et des actions ; `revalidatePath('/developpeurs')` mène à une page).

Puis à l'œil, serveur local sur la base de la branche, connecté avec un compte qui a une session Claude Code : `/developpeurs` affiche ses dépôts, « Rendre privée » fait passer la session dans « Mes sessions privées », l'interrupteur bascule. Avec un compte sans session : page introuvable.

- [ ] **Étape 9 : commit**

```bash
pnpm lint && pnpm typecheck
git add "src/app/(app)/developpeurs/actions.ts" "src/app/(app)/developpeurs/actions.test.ts" "src/app/(app)/developpeurs/page.tsx" src/components/verre/developpeurs/index.tsx messages/fr.json messages/en.json
git commit -m "Sessions partagées : la page Développeurs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 8 : l'entrée « Développeurs » dans la navigation

**Fichiers :**
- Modifier : `src/components/verre/shell/nav.ts`
- Créer : `src/components/verre/shell/nav.test.ts`
- Modifier : `src/components/verre/shell/workspace-menu.tsx:23` (type `Viewer`)
- Modifier : `src/components/verre/shell/sidebar.tsx:28-40` (`NavList`) et `:202`
- Modifier : `src/components/verre/shell/mobile-bar.tsx:21-26`, `:98`
- Modifier : `src/components/verre/shell/command-palette.tsx:41-47`, `:83`, `:150`
- Modifier : `src/components/verre/shell/app-shell.tsx:160` (`CommandPalette`)
- Modifier : `src/app/(app)/layout.tsx`
- Modifier : `messages/fr.json`, `messages/en.json` (bloc `navigation`)

Après la tâche 7 : le contrat `page-links` exige que `/developpeurs` existe, et les deux tâches touchent `messages/*.json`.

L'entrée n'est **pas** ajoutée à `NAV` : le contrat `guides-docs` vérifie que le guide des connecteurs cite les sections de `NAV` telles quelles, et cette entrée n'apparaît que pour certains membres.

- [ ] **Étape 1 : écrire le test qui échoue**

`src/components/verre/shell/nav.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { navFor, sectionOf } from './nav';

describe('navFor', () => {
  it('ne montre « Développeurs » qu’à un membre qui code, avant Réglages', () => {
    expect(navFor(false).map((item) => item.href)).not.toContain('/developpeurs');
    expect(navFor(true).map((item) => item.href)).toEqual([
      '/',
      '/discussions',
      '/documents',
      '/connexions',
      '/developpeurs',
      '/reglages',
    ]);
  });

  it('reconnaît la section de la page Développeurs', () => {
    expect(sectionOf('/developpeurs')?.labelKey).toBe('developers');
  });
});
```

- [ ] **Étape 2 : lancer le test, il échoue**

Lancer : `pnpm vitest run src/components/verre/shell/nav.test.ts`
Attendu : ÉCHEC, `navFor` non exporté.

- [ ] **Étape 3 : l'entrée et `navFor`**

Dans `src/components/verre/shell/nav.ts`, ajouter `Code` à l'import de `lucide-react`, `'developers'` à l'union `labelKey`, puis après `NAV` :

```ts
// Réservée aux membres qui codent (une session Claude Code ou une note de passation) : hors de NAV, que les guides
// citent telle quelle.
export const DEVELOPERS_NAV: NavItem = {
  href: '/developpeurs',
  label: 'Développeurs',
  labelKey: 'developers',
  icon: Code,
};

/** Les sections que voit un membre : « Développeurs » avant Réglages, s'il code. */
export const navFor = (developer: boolean): NavItem[] =>
  developer ? [...NAV.slice(0, -1), DEVELOPERS_NAV, ...NAV.slice(-1)] : NAV;
```

et `sectionOf` cherche aussi dans cette entrée :

```ts
export const sectionOf = (pathname: string): NavItem | undefined =>
  [...NAV, DEVELOPERS_NAV].find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
```

Dans `messages/fr.json`, bloc `navigation`, après `"connections": "Connexions",` : `"developers": "Développeurs",`. Dans `messages/en.json`, au même endroit : `"developers": "Developers",`.

- [ ] **Étape 4 : le drapeau jusqu'aux trois listes**

`src/components/verre/shell/workspace-menu.tsx`, ligne 23 :

```ts
// `developer` : le membre code (voir isDeveloper) ; la barre et la palette lui montrent « Développeurs ».
export type Viewer = {
  organizationName: string;
  userName: string;
  userEmail: string;
  developer?: boolean;
};
```

`src/components/verre/shell/sidebar.tsx` : `NavList` reçoit le drapeau et lit `navFor` (import `navFor, sectionOf` depuis `./nav`, `NAV` n'y sert plus) :

```tsx
export function NavList({
  onNavigate,
  inkId = 'nav-ink',
  developer = false,
}: {
  onNavigate?: () => void;
  inkId?: string;
  developer?: boolean;
}) {
```

et dans le corps, `{NAV.map((item) => {` devient `{navFor(developer).map((item) => {`. Ligne 202 : `<NavList developer={viewer.developer} />`.

`src/components/verre/shell/mobile-bar.tsx` : ajouter `developer` aux propriétés déstructurées de `MobileBar`, et ligne 98 : `<NavList inkId="nav-ink-sheet" onNavigate={go} developer={developer} />`.

`src/components/verre/shell/command-palette.tsx` : ajouter `developer = false` aux propriétés (`developer?: boolean` dans leur type), importer `navFor` au lieu de `NAV`, remplacer `...NAV.map((n, i) => ({` par `...navFor(developer).map((n, i) => ({`, et ajouter `developer` au tableau de dépendances du `useMemo` (ligne 150).

`src/components/verre/shell/app-shell.tsx`, ligne 160 :

```tsx
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            developer={viewer.developer}
          />
```

`src/app/(app)/layout.tsx` :

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/verre/shell';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { isDeveloper } from '@/server/developpeurs/space';
import { channelHealth, staleChannels } from '@/server/memory/sources';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const [profile, channels, developer] = await Promise.all([
    getViewerProfile(ctx),
    channelHealth(ctx),
    isDeveloper(ctx),
  ]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      developer={developer}
      stale={staleChannels(channels, new Date())}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Étape 5 : lancer les tests, ils passent**

Lancer : `pnpm vitest run src/components/verre/shell src/i18n src/test/contracts`
Attendu : tout réussit (dont `guides-docs`, inchangé, et `page-links`).

- [ ] **Étape 6 : commit**

```bash
pnpm lint && pnpm typecheck
git add src/components/verre/shell/nav.ts src/components/verre/shell/nav.test.ts src/components/verre/shell/workspace-menu.tsx src/components/verre/shell/sidebar.tsx src/components/verre/shell/mobile-bar.tsx src/components/verre/shell/command-palette.tsx src/components/verre/shell/app-shell.tsx "src/app/(app)/layout.tsx" messages/fr.json messages/en.json
git commit -m "Sessions partagées : l'entrée Développeurs, pour les membres qui codent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 9 : vérification d'ensemble et texte de la PR

**Fichiers :** aucun.

- [ ] **Étape 1 : toute la suite**

Lancer : `pnpm lint && pnpm typecheck && pnpm test:unit && LEON_TEST_DATABASE=leon_test_passation pnpm vitest run --project db`
Attendu : tout réussit. Un échec dans un test qui suppose qu'une session `claude_code` liée à `github.com/…` reste privée à son auteur est une conséquence voulue : corriger le test (le dire dans la PR), pas le code.

- [ ] **Étape 2 : à l'œil, à deux comptes**

Serveur local sur une base de la branche, deux membres de la même organisation, crochets installés pour le premier. Une session Claude Code dans un dépôt GitHub : le second la trouve par `search` (son agent, ou la recherche de l'application). Le premier la rend privée depuis `/developpeurs`, puis depuis son agent (`session_rendre_privee` sans argument) : le second ne la trouve plus. Un membre sans session de code ne voit pas l'entrée et `/developpeurs` lui répond 404.

- [ ] **Étape 3 : le paragraphe à mettre dans la description de la PR**

À coller dans la description au moment d'ouvrir la PR (l'ouverture et la poussée restent à la décision de David) :

> **À savoir avant de fusionner : le déploiement partage les sessions déjà captées.** La migration 0044 rend visibles par toute l'organisation les sessions Claude Code déjà captées dans un dépôt GitHub (clé `github.com/…`). Les sessions hors d'un dépôt GitHub, et les conversations claude.ai, ChatGPT et `remember`, restent privées. Chaque membre concerné (aujourd'hui David et Amos) doit le savoir avant la fusion ; après, chacun peut rendre privée une session ou tout un dépôt depuis l'espace Développeurs ou avec l'outil `session_rendre_privee`.

---

## Relecture du plan contre la spec

| Exigence de la spec | Tâche |
|---|---|
| `claude_code` avec clé de projet partagée à l'organisation, sans clé privée | 1 (fonction), 4 (capture) |
| `claude_ai`, `chatgpt`, `mcp_remember` restent privées | 1 (`kind = 'claude_code'`), 4 (test) |
| Dépôt rendu privé : sessions anciennes et nouvelles privées | 1, 3 (passées), 4 et 6 (suivantes) |
| Partage décidé à la capture, et à la réception tardive de la clé, toutes lignes comprises | 4 |
| ACL sur les cinq tables, dans une transaction | 1 (`regler_partage_session`), 3 (test des cinq tables) |
| `depots_prives` (clé primaire, sécurité par ligne : ses lignes seulement) | 1 |
| `regler_partage_session` (auteur, `claude_code`, clé de projet, rend vrai si elle agit) | 1, 3 |
| `regler_partage_depot` | 1, 3 |
| Partage des sessions passées par la migration | 1 |
| Point du matin inchangé | aucune (vérifié : `briefings.ts:150` et `memory/sources.ts` filtrent sur l'auteur) |
| Texte de consentement de `leon installer-crochets` | 2 |
| Prévenir l'équipe dans la PR | 9 |
| `session_rendre_privee` (session, dépôt, sans argument) et `session_partager`, `MCP_INSTRUCTIONS` | 3, 6 |
| Espace Développeurs : visible des membres qui codent, 404 sinon, absent de la navigation | 5, 7, 8 |
| Dépôts de l'équipe, sessions partagées triées, notes de passation, « Rendre privée », interrupteur, sessions privées avec « Partager » | 5, 7 |
| Actions serveur sur le modèle de `reglages/actions.ts` | 7 |
| Seul l'auteur ; une autre organisation ne voit rien | 1, 3, 4, 6 |
| Contrats `rls-coverage` et `schema-contract` pour `depots_prives` | 1 (couverts d'office : ils lisent la base et le dossier `schema`) |
| Tests MCP, trois jeux d'arguments par outil | 6 |
| Tests de l'espace (invisible sans session, boutons) | 5, 7, 8 |

Écarts assumés par rapport à la spec :
- **« Clé de projet » = clé `github.com/…`.** La CLI envoie aussi `dossier:<hash>` pour un dossier sans remote GitHub ; ces sessions restent privées, comme la spec le veut pour « hors d'un dépôt ».
- **Pas de lien vers la session.** L'application n'a aucune page qui affiche une source seule ; en créer une sort du périmètre. La ligne montre le titre, l'auteur et la date ; la session se retrouve par la recherche. À trancher par David : ajouter une page de source plus tard, ou se contenter de la recherche.
- **Texte de consentement en anglais**, comme tout le texte de la CLI.
- **Partager une session isolée d'un dépôt rendu privé** est permis (bouton « Partager ») ; le dépôt reste dans `depots_prives`, ses sessions suivantes restent privées.
- **Au plus 500 sessions** lues par l'espace Développeurs (`shortcut:` dans `space.ts`).

Risques ouverts :
- Le partage des sessions passées touche toutes les lignes `claude_code` de la production en une transaction (`passage_vectors` compris, quelques dizaines de milliers de lignes au plus aujourd'hui) : à déployer hors des heures de capture.
- Les titres des sessions, déjà visibles par leur auteur, deviennent visibles de l'équipe : les secrets sont masqués à la capture (`maskSecrets`, `prepareTurnText`), pas les propos personnels. C'est l'objet du paragraphe de la PR.
- Le `layout` fait une requête de plus par page (`isDeveloper`, un `exists` sur l'index unique de `sources`).
