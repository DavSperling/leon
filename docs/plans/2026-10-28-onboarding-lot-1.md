# Onboarding, lot 1 : données, `/bienvenue` et étape 1 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**But :** chaque membre a un service, un poste, un niveau et des attentes. Toute personne connectée qui n'a pas validé l'étape 1 est envoyée sur `/bienvenue` pour la remplir. Un nouveau venu sans espace y crée son organisation.

**Architecture :**
- Les listes (services, postes, niveaux, tailles, attentes, outils conseillés, exemples de questions) sont des données pures dans `src/lib/onboarding.ts`, partagées par le client et le serveur. Leurs libellés sont dans `messages/*.json`, sous l'espace `onboarding`.
- Les réponses vont dans de nouvelles colonnes de `member` et d'`organization` : une migration, plus `src/server/auth/onboarding.ts`.
- La page `/bienvenue` vit dans un groupe de routes à part, `(onboarding)`. Elle ne passe jamais par `requireUserContext()`.
- Le layout de l'appli renvoie sur `/bienvenue` tant que l'étape 1 n'est pas validée.
- Dans ce lot, l'étape 1 mène directement à l'appli. Les lots 2 et 3 ajouteront les étapes « Collaborateurs » et « Vos outils ».

**Technologies :** Next.js 16 (App Router, server actions, `useActionState`), Better Auth 1.7.7 (organization), Drizzle, Postgres, next-intl, Vitest (projets `unit` et `db`), Biome.

**Spec :** `docs/specs/2026-10-28-onboarding.md`. La maquette `docs/specs/2026-10-28-onboarding-maquette.html` donne les textes exacts en anglais et en français : objet `T`, puis `TEAMS` pour les postes et les exemples de questions.

## Contraintes globales

- **Langue :** anglais par défaut. Tout texte d'interface va dans `messages/en.json` et `messages/fr.json`, sans exception ; en français, on vouvoie. `src/i18n/messages.test.ts` vérifie que les deux fichiers ont les mêmes clés.
- **Vocabulaire :** « Department » / « Service » pour Dev, Sales… ; « Role » / « Poste » pour le poste. Le mot « Team » / « Équipe » est réservé aux membres de l'espace.
- **Stockage :** la base garde des identifiants, jamais des libellés. Un identifiant inconnu s'affiche « Other » / « Autre ».
- **Qui écrit quoi :** un membre qui n'est pas propriétaire n'écrit jamais `department`, `job` ni `seniority`. La règle est dans la condition SQL d'écriture, sur le modèle d'`isAdminRole` dans `src/server/auth/members.ts`, pas seulement dans l'interface.
- **Pas de boucle :** `/bienvenue` lit `getSession()` et `getUserContext()`, jamais `requireUserContext()`.
- **Aucun droit de lecture ne change :** ni les ACL, ni les politiques RLS sur `sources`, `turns` et `passages`.
- **Migration :** `0043-onboarding.sql`, le numéro libre au 2/11 (`main` a 0040 à 0042). Le migrateur trie par nom de fichier sans exiger de suite continue.
- **Base de départ :** `origin/main` à `f5cdb5b` ou plus récent. Le plan tient compte de `noteActivity` dans `getUserContext` (`@/server/admin/stats`).
- **Git :**
  - branche `amos/onboarding-etape-1`, partie d'`origin/main` après la fusion de la PR de la spec ;
  - fichiers ajoutés un par un (`git add <fichier>`) ;
  - messages de commit en français, comme l'historique ;
  - une seule PR pour tout le lot.
- **Base de test :** `LEON_TEST_DATABASE=leon_test_onboarding`. Pour la créer, suivre la recette de la mémoire « Poste d'Amos ». Les commandes Postgres et Docker sortent de la sandbox.

## Points à surveiller à la relecture

1. **Double envoi d'un nouveau venu, même depuis deux onglets.** Il ne doit pas créer deux espaces. Testé à la tâche 2 : deux appels simultanés de `createOrganizationForUser` donnent un seul espace, grâce à un verrou par utilisateur. Testé aussi à la tâche 4 : l'action poursuit alors avec l'espace existant.
   Cas voisin : **un membre retiré d'un espace** garde dans sa session l'ancienne organisation active. Il ne doit pas rester bloqué entre `/` et `/bienvenue`. Testé à la tâche 3 : `getUserContext` se rabat sur sa première organisation.
2. **Un membre qui forge un formulaire de propriétaire.** Service, poste et niveau sont ignorés. Testé à la tâche 2 (`completeOwnerStep` refusé pour le rôle `member`) et à la tâche 4 (l'action n'appelle que `completeMemberStep`).
3. **Valeurs incohérentes** : poste hors du service, niveau 0 ou 9, service inconnu. On renvoie une erreur sur le champ et on n'écrit rien. Testé à la tâche 4.
4. **Valeur retirée d'une liste après coup.** L'affichage dit « Other » et ne casse pas. Testé à la tâche 1.
5. **Retour sur `/bienvenue`, ou nouvel envoi, après l'étape 1.** On ne réécrit rien et on renvoie dans l'appli. Testé à la tâche 2 (deuxième appel refusé, valeurs inchangées) et à la tâche 4.

---

### Tâche 1 : les listes

**Fichiers :**
- Créer : `src/lib/onboarding.ts`
- Créer : `src/lib/onboarding.test.ts`
- Modifier : `messages/en.json`, `messages/fr.json` (nouvel espace `onboarding` : seulement les libellés des listes ; les textes d'écran viennent à la tâche 5)

**Interfaces :**
- Produit (utilisé par les tâches 2, 4 et 5) :
  - `DEPARTMENTS` : `{ [id]: { jobs: readonly string[]; tools: readonly ProviderId[] } }`
  - `type Department`
  - `DEPARTMENT_IDS: [Department, ...Department[]]`
  - `SENIORITY_LEVELS` (8 identifiants ; l'indice + 1 est la valeur en base)
  - `COMPANY_SIZES`, `type CompanySize`
  - `GOALS`, `type Goal`
  - `isDepartment(value: string): value is Department`
  - `isJobOf(department: Department, job: string): boolean`
  - `seniorityId(level: number | null): SeniorityId | null`
  - `departmentLabelKey(id: string | null): \`departments.${Department}\` | 'other'`
  - `jobLabelKey(department: string | null, job: string | null): JobLabelKey | 'other'`, où `JobLabelKey` est l'union littérale des `` `jobs.${département}.${poste}` `` déduite de `DEPARTMENTS`

  Les retours sont des unions littérales parce que les messages sont typés depuis `fr.json` (`src/i18n/request.ts`) : avec un simple `string`, `t(jobLabelKey(…))` ne compilerait pas.

Les identifiants. Chaque service se termine par `other`, et les outils sont ceux du tableau de la spec :

```ts
engineering: backend, frontend, fullstack, mobile, devops, qa, engineeringManager, cto, other
product: productManager, productOwner, headOfProduct, cpo, other
design: productDesigner, uxResearcher, artDirector, other
data: dataAnalyst, dataEngineer, dataScientist, other
sales: sdr, accountExecutive, accountManager, salesOps, vpSales, other
marketing: growth, content, productMarketing, communications, cmo, other
support: supportAgent, customerSuccess, implementation, headOfSupport, other
operations: officeManager, accountant, financialController, cfo, coo, other
people: recruiter, hrGeneralist, headOfPeople, other
legal: legalCounsel, generalCounsel, other
leadership: ceo, managingDirector, partner, other
SENIORITY_LEVELS = intern, apprentice, junior, mid, senior, lead, head, executive
COMPANY_SIZES = '1-10', '11-50', '51-200', '201+'
GOALS = find, meetings, briefing, team, onboarding, customers
```

Les clés de messages :
- `onboarding.departments.<id>` ;
- `onboarding.jobs.<département>.<poste>`, sans `other` ;
- `onboarding.other` (« Other » / « Autre »), pour un poste `other` et pour tout identifiant disparu des listes ;
- `onboarding.seniority.<id>` ;
- `onboarding.goals.<id>` ;
- `onboarding.asks.<département>.one` et `.two`.

Les tailles s'affichent telles quelles, avec un tiret demi-cadratin (`1–10`). Les textes viennent de la maquette.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/lib/onboarding.test.ts
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
// …
it('chaque service a au moins un poste, et « other » en dernier', () => {
  for (const id of DEPARTMENT_IDS) expect(DEPARTMENTS[id].jobs.at(-1)).toBe('other');
});
it('reconnaît un poste du service et refuse celui d’un autre service', () => {
  expect(isJobOf('engineering', 'backend')).toBe(true);
  expect(isJobOf('sales', 'backend')).toBe(false);
  expect(isDepartment('engineering')).toBe(true);
  expect(isDepartment('toString')).toBe(false);
});
it('donne le niveau de 1 à 8, et rien en dehors', () => {
  expect(seniorityId(1)).toBe('intern');
  expect(seniorityId(8)).toBe('executive');
  expect(seniorityId(0)).toBeNull();
  expect(seniorityId(9)).toBeNull();
  expect(seniorityId(null)).toBeNull();
});
it('affiche « other » pour un identifiant disparu des listes', () => {
  expect(jobLabelKey('engineering', 'backend')).toBe('jobs.engineering.backend');
  expect(jobLabelKey('engineering', 'other')).toBe('other');
  expect(jobLabelKey('engineering', 'retired-job')).toBe('other');
  expect(jobLabelKey('retired-dept', 'backend')).toBe('other');
  expect(departmentLabelKey('engineering')).toBe('departments.engineering');
  expect(departmentLabelKey('retired-dept')).toBe('other');
});
it('a un libellé en anglais et en français pour chaque identifiant', () => {
  for (const messages of [en, fr]) {
    // Les JSON importés sont typés au plus juste : on les relit comme des dictionnaires.
    const o = messages.onboarding as unknown as {
      departments: Record<string, string>; jobs: Record<string, Record<string, string>>;
      asks: Record<string, { one: string; two: string }>; seniority: Record<string, string>; goals: Record<string, string>;
    };
    for (const id of DEPARTMENT_IDS) {
      expect(o.departments[id], id).toBeTruthy();
      expect(o.asks[id].one && o.asks[id].two, id).toBeTruthy();
      for (const job of DEPARTMENTS[id].jobs.filter((j) => j !== 'other'))
        expect(o.jobs[id][job], `${id}.${job}`).toBeTruthy();
    }
    for (const id of SENIORITY_LEVELS) expect(o.seniority[id], id).toBeTruthy();
    for (const id of GOALS) expect(o.goals[id], id).toBeTruthy();
  }
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `pnpm vitest run --project unit src/lib/onboarding.test.ts`
Attendu : ÉCHEC, le module `./onboarding` est introuvable.

- [ ] **Étape 3 : écrire `src/lib/onboarding.ts` et les libellés dans les deux fichiers de messages**

`isDepartment` teste `Object.hasOwn(DEPARTMENTS, value)` (sinon `'toString'` passerait). `DEPARTMENTS` est déclaré avec `as const satisfies Record<string, { jobs: readonly string[]; tools: readonly ProviderId[] }>`.

- [ ] **Étape 4 : relancer ce test et celui des messages**

Commande : `pnpm vitest run --project unit src/lib/onboarding.test.ts src/i18n/messages.test.ts`
Attendu : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts messages/en.json messages/fr.json
git commit -m "Onboarding : listes des services, postes, niveaux et attentes"
```

---

### Tâche 2 : la base et l'écriture des réponses

**Fichiers :**
- Créer : `src/server/db/migrations/0043-onboarding.sql`
- Modifier : `src/server/db/schema/auth.ts` (`members`, `organizations`)
- Créer : `src/server/auth/onboarding.ts`
- Créer : `src/server/auth/onboarding.db.test.ts`
- Modifier : `src/server/auth/sign-up.ts`
- Modifier : `src/server/auth/sign-up.db.test.ts`

**Interfaces :**
- Utilise : `Department`, `CompanySize` et `Goal` (tâche 1) ; `TenantContext` et `firstOrganizationId` (`tenant-context.ts`).
- Produit (utilisé par les tâches 3, 4 et 5) :
  - `type Placement = { department: string | null; job: string | null; seniority: number | null }`
  - `type OnboardingMember = Placement & { role: string; goals: string[]; onboardedAt: Date | null }`
  - `spaceRole(role: string): 'owner' | 'admin' | 'member'` : lit les rôles séparés par des virgules ; `owner` l'emporte sur `admin`
  - `readOnboardingMember(ctx: TenantContext): Promise<OnboardingMember | null>`
  - `type OwnerStep = { department: Department; job: string; seniority: number; size: CompanySize; goals: Goal[] }`
  - `completeOwnerStep(ctx: TenantContext, step: OwnerStep): Promise<boolean>`
  - `completeMemberStep(ctx: TenantContext, goals: Goal[]): Promise<boolean>`
  - dans `sign-up.ts` : `createOrganizationForUser(userId: string, organizationName: string): Promise<{ ok: true; tenantId: string } | { ok: false; error: 'deja_membre' | 'invalide' }>`

La migration :

```sql
-- 0043-onboarding.sql : ce que l'onboarding demande (docs/specs/2026-10-28-onboarding.md). Le service, le poste,
-- le niveau et les attentes appartiennent à l'appartenance ; la taille, à l'organisation. Des identifiants, jamais
-- des libellés (src/lib/onboarding.ts). "onboardedAt" nul : l'étape 1 reste à faire (layout de l'appli).
alter table "member"
  add column "department" text,
  add column "job" text,
  add column "seniority" smallint check ("seniority" between 1 and 8),
  add column "goals" text[] not null default '{}',
  add column "onboardedAt" timestamptz;
alter table "organization" add column "size" text check ("size" in ('1-10', '11-50', '51-200', '201+'));
```

Les règles des deux écritures (dans `db.transaction` pour celle du propriétaire) :
- **`completeOwnerStep`** met à jour sa propre ligne `member` (`userId` et `organizationId` du contexte). Il n'écrit que si `"onboardedAt" is null` et si le rôle contient `owner` (`string_to_array("role", ',') && array['owner']`). Il pose `"onboardedAt" = now()`. Si aucune ligne n'a changé, il rend `false` et n'écrit rien d'autre ; sinon, il écrit `organization.size`.
- **`completeMemberStep`** n'écrit que `goals` et `"onboardedAt"`, toujours sous la condition `"onboardedAt" is null`.

`createOrganizationForUser` :
- valide le nom avec `SignUpInputSchema.shape.organizationName` ;
- prend un verrou par utilisateur pour toute la suite : une connexion du pool de `@/server/db/client`, `select pg_advisory_lock(hashtext($1))` sur `userId`, puis `pg_advisory_unlock` et la libération de la connexion dans un `finally`. Ainsi, deux onglets ne créent pas deux espaces ;
- rend `deja_membre` si `firstOrganizationId(userId)` n'est pas nul ;
- sinon, appelle `auth.api.createOrganization({ body: { name, slug: organizationSlug(name), userId } })` ;
- en cas d'erreur, la journalise (`logError('auth.sign_up.organization', error)`) et rend `invalide`.

`createUserWithOrganization` l'appelle à la place de son propre bloc de création, et garde la suppression de l'utilisateur quand ça échoue.

- [ ] **Étape 1 : écrire les tests en base qui échouent**

Fixture : `createTestTenant(['Ana', 'Bob'])`, puis Ana devient propriétaire avec `adminDb.update(members).set({ role: 'owner' }).where(and(eq(members.userId, ana.userId), eq(members.organizationId, tenantId)))`. Le `where` est indispensable : la base de test est partagée par quatre workers.

```ts
// onboarding.db.test.ts
const step: OwnerStep = { department: 'engineering', job: 'backend', seniority: 5, size: '11-50', goals: ['find', 'briefing'] };

it("un membre neuf n'a ni poste ni étape validée", async () => {
  expect(await readOnboardingMember(bob)).toEqual(expect.objectContaining({ department: null, job: null, seniority: null, goals: [], onboardedAt: null, role: 'member' }));
});
it('le propriétaire enregistre son poste, son niveau, ses attentes et la taille', async () => {
  expect(await completeOwnerStep(ana, step)).toBe(true);
  expect(await readOnboardingMember(ana)).toEqual(expect.objectContaining({ department: 'engineering', job: 'backend', seniority: 5, goals: ['find', 'briefing'], onboardedAt: expect.any(Date) }));
  // organization.size lu par adminDb
  expect(org.size).toBe('11-50');
});
it("ne réécrit rien une fois l'étape validée", async () => {
  await completeOwnerStep(ana, step);
  expect(await completeOwnerStep(ana, { ...step, job: 'cto', size: '201+' })).toBe(false);
  // job reste 'backend', size reste '11-50'
});
it("refuse l'étape du propriétaire à un membre", async () => {
  expect(await completeOwnerStep(bob, step)).toBe(false);
  // la ligne de Bob et organization.size sont inchangées (null)
});
it('accepte un propriétaire qui a plusieurs rôles (« owner,admin »)', async () => { /* role 'owner,admin' → true */ });
it('le membre enregistre ses attentes sans toucher au poste fixé par un administrateur', async () => {
  // adminDb : Bob a department 'sales', job 'sdr', seniority 3
  expect(await completeMemberStep(bob, ['meetings'])).toBe(true);
  expect(await readOnboardingMember(bob)).toEqual(expect.objectContaining({ department: 'sales', job: 'sdr', seniority: 3, goals: ['meetings'], onboardedAt: expect.any(Date) }));
  expect(await completeMemberStep(bob, ['find'])).toBe(false);
});
it('spaceRole', () => {
  expect(spaceRole('owner')).toBe('owner');
  expect(spaceRole('admin,owner')).toBe('owner');
  expect(spaceRole('admin')).toBe('admin');
  expect(spaceRole('member')).toBe('member');
});
```

```ts
// sign-up.db.test.ts, nouveau describe('createOrganizationForUser')
it("crée l'espace d'une personne qui n'en a pas, dont elle devient propriétaire", async () => { /* user inséré par adminDb sans member → ok, member role 'owner' */ });
it("refuse de créer un deuxième espace (double clic)", async () => {
  // le même utilisateur, deux appels de suite → le second rend { ok: false, error: 'deja_membre' } ; un seul member pour lui
});
it('deux envois simultanés (deux onglets) ne créent qu’un espace', async () => {
  const [a, b] = await Promise.all([createOrganizationForUser(userId, 'Acme'), createOrganizationForUser(userId, 'Acme')]);
  expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  // un seul member pour cet utilisateur
});
it('refuse un nom vide', async () => { /* '' → { ok: false, error: 'invalide' }, aucun espace */ });
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `LEON_TEST_DATABASE=leon_test_onboarding pnpm vitest run --project db src/server/auth/onboarding.db.test.ts src/server/auth/sign-up.db.test.ts`
Attendu : ÉCHEC, le module `./onboarding` et `createOrganizationForUser` sont introuvables.

- [ ] **Étape 3 : écrire la migration, les colonnes Drizzle, `onboarding.ts` et `createOrganizationForUser`**

Colonnes Drizzle, avec les noms de la migration :
- `department: text('department')`
- `job: text('job')`
- `seniority: smallint('seniority')`
- `goals: text('goals').array().notNull().default(sql\`'{}'\`)`
- `onboardedAt: timestamp('onboardedAt', { withTimezone: true })`
- `size: text('size')`

- [ ] **Étape 4 : relancer ces tests, ceux du contrat de schéma et ceux de l'inscription**

Commande : `LEON_TEST_DATABASE=leon_test_onboarding pnpm vitest run --project db src/server/auth src/server/db/schema-contract.db.test.ts src/server/db/rls-coverage.db.test.ts`
Attendu : tout passe, y compris le test existant « createOrganization en panne » de `sign-up.db.test.ts`.

- [ ] **Étape 5 : commiter**

```bash
git add src/server/db/migrations/0043-onboarding.sql src/server/db/schema/auth.ts src/server/auth/onboarding.ts src/server/auth/onboarding.db.test.ts src/server/auth/sign-up.ts src/server/auth/sign-up.db.test.ts
git commit -m "Onboarding : service, poste, niveau et attentes enregistrés par l'étape 1"
```

---

### Tâche 3 : renvoyer vers `/bienvenue`

**Fichiers :**
- Modifier : `src/server/auth/session.ts`
- Créer : `src/server/auth/session.test.ts`
- Modifier : `src/app/(app)/layout.tsx`
- Modifier : `src/app/(app)/actions.ts` (`signOutAction`)
- Modifier : `src/app/(app)/actions.test.ts`

**Interfaces :**
- Utilise : `readOnboardingMember` (tâche 2).
- Produit : `export const ONBOARDING_PATH = '/bienvenue'` dans `session.ts`. Si la branche `claude/fast-auth-providers-82f1ca` est déjà sur `main`, la constante y est : la reprendre telle quelle.

Ce qui change :
- **`getUserContext()`** : si l'organisation active de la session n'est plus une des siennes (membre retiré, Better Auth ne remet pas `activeOrganizationId` à zéro), il se rabat sur sa première organisation : `resolveTenantContext(uid, active) ?? (active ? resolveTenantContext(uid, null) : null)`. Le layout, la page et l'action suivent ainsi la même règle. Sans ce repli, la personne tournerait entre `/` et `/bienvenue`. `noteActivity` reste appelé comme aujourd'hui.
- **`requireUserContext()`** : sans session, il renvoie vers `/connexion` comme avant ; avec une session mais sans contexte (aucune organisation), il renvoie vers `ONBOARDING_PATH`.
- **Le layout de l'appli** lit `readOnboardingMember(ctx)` avant le reste. Si `onboardedAt` est nul, il renvoie vers `ONBOARDING_PATH`.
- **`signOutAction`** vérifie seulement `getSession()`, et non plus `requireUserContext()`. Sinon, une personne sans organisation, par exemple connectée avec le mauvais compte Google, serait renvoyée sur `/bienvenue` au lieu d'être déconnectée.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// session.test.ts : mocker ./auth (auth.api.getSession), ./tenant-context (resolveTenantContext),
// @/server/admin/stats (noteActivity, sinon le test ouvre une connexion Postgres), next/headers (headers,
// cookies().getAll) et next/navigation (redirect qui lève, comme dans src/app/(auth)/actions.test.ts).
// La session simulée porte session.id : noteActivity le lit.
it('sans session, renvoie vers la connexion', async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null);
  await expect(requireUserContext()).rejects.toThrow();
  expect(redirect).toHaveBeenCalledWith('/connexion');
});
it('une session sans organisation est renvoyée vers /bienvenue', async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: USER }, session: { activeOrganizationId: null } } as never);
  vi.mocked(resolveTenantContext).mockResolvedValue(null);
  await expect(requireUserContext()).rejects.toThrow();
  expect(redirect).toHaveBeenCalledWith('/bienvenue');
});
it('avec une organisation, rend le contexte sans rediriger', async () => { /* resolveTenantContext → ctx ; redirect non appelé */ });
it("se rabat sur la première organisation quand l'organisation active n'est plus la sienne", async () => {
  // session.activeOrganizationId = OLD ; resolveTenantContext(USER, OLD) → null, puis resolveTenantContext(USER, null) → ctx
  expect(await getUserContext()).toEqual(ctx);
  expect(resolveTenantContext).toHaveBeenLastCalledWith(USER, null);
});
```

```ts
// src/app/(app)/actions.test.ts
it('déconnecte une session sans organisation, sans passer par /bienvenue', async () => {
  // getSession → une session ; requireUserContext non appelé ; signOutCurrentUser appelé ; redirect('/connexion')
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `pnpm vitest run --project unit src/server/auth/session.test.ts "src/app/(app)/actions.test.ts"`
Attendu : ÉCHEC sur le renvoi vers `/bienvenue`, le repli et la déconnexion.

- [ ] **Étape 3 : ajouter `ONBOARDING_PATH`, le repli de `getUserContext()`, le renvoi de `requireUserContext()`, la redirection dans `src/app/(app)/layout.tsx`, et changer `signOutAction`**

- [ ] **Étape 4 : relancer les tests**

Commande : `pnpm vitest run --project unit src/server/auth/session.test.ts "src/app/(app)/actions.test.ts"`
Attendu : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add src/server/auth/session.ts src/server/auth/session.test.ts "src/app/(app)/layout.tsx" "src/app/(app)/actions.ts" "src/app/(app)/actions.test.ts"
git commit -m "Onboarding : l'appli renvoie sur /bienvenue tant que l'étape 1 n'est pas faite"
```

---

### Tâche 4 : l'action de l'étape 1

**Fichiers :**
- Créer : `src/app/(onboarding)/bienvenue/actions.ts`
- Créer : `src/app/(onboarding)/bienvenue/actions.test.ts`
- Modifier : `messages/en.json`, `messages/fr.json` (`onboarding.errors.*`)

**Interfaces :**
- Utilise :
  - `getSession` et `getUserContext` (`session.ts`) ;
  - `resolveTenantContext` ;
  - `createOrganizationForUser` et `SignUpInputSchema` (`sign-up.ts`) ;
  - `readOnboardingMember`, `spaceRole`, `completeOwnerStep` et `completeMemberStep` (tâche 2) ;
  - `DEPARTMENT_IDS`, `isJobOf`, `COMPANY_SIZES` et `GOALS` (tâche 1).
- Produit (utilisé par la tâche 5) :
  - `type AboutStepState = { errors?: Record<string, string>; values?: Record<string, string | string[]> }`
  - `completeAboutStepAction(previous: AboutStepState, formData: FormData): Promise<AboutStepState>`
- Champs du formulaire : `organizationName`, `department`, `job`, `seniority`, `size`, et `goals` (répété, lu par `formData.getAll`).

Le déroulé :
1. Sans session, renvoyer vers `/connexion`.
2. Si `getUserContext()` est nul, c'est un nouveau venu :
   - valider le nom de l'entreprise et le formulaire du propriétaire ;
   - appeler `createOrganizationForUser` ;
   - si la réponse est `deja_membre`, poursuivre avec `getUserContext()` (l'espace créé par le premier clic) ; si ce contexte est encore nul, rendre `errors.form` ;
   - si elle est `invalide`, rendre `errors.form`.
3. Lire `readOnboardingMember`. Si `onboardedAt` n'est pas nul, renvoyer vers `/` sans rien écrire.
4. Propriétaire (`spaceRole(member.role) === 'owner'`) : valider le formulaire avec `OwnerStepSchema` (zod) et appeler `completeOwnerStep`. Le schéma refuse :
   - un service inconnu ;
   - un poste qui n'est pas dans le service, avec l'erreur posée sur `job` ;
   - un niveau qui n'est pas un entier de 1 à 8 ;
   - une taille inconnue ;
   - une attente inconnue.
5. Tout autre rôle : valider seulement `goals` et appeler `completeMemberStep`. Les autres champs reçus sont ignorés.
6. Renvoyer vers `/`.

Chaque erreur de champ a son message : `onboarding.errors.department`, `.job`, `.seniority`, `.size`, `.company` et `.form`. Les textes :
- *Choose your department. / Choose your role. / Choose your seniority. / Choose your company size. / Enter a company name (2 to 100 characters). / Something went wrong. Try again.*
- *Choisissez votre service. / Choisissez votre poste. / Choisissez votre niveau. / Choisissez la taille de l'entreprise. / Saisissez le nom de l'entreprise (2 à 100 caractères). / Un problème est survenu. Réessayez.*

`values` renvoie ce qui a été saisi, pour garder le formulaire rempli.

- [ ] **Étape 1 : écrire les tests qui échouent**

Mocker `@/server/auth/session`, `@/server/auth/sign-up`, `@/server/auth/onboarding` (sauf `spaceRole`, gardé réel avec `vi.importActual`), `@/server/auth/tenant-context` et `next/navigation` (`redirect` qui lève, comme dans `src/app/(auth)/actions.test.ts`). Construire le formulaire avec un petit `form({ ... })` qui ajoute chaque attente avec `append('goals', …)`.

```ts
it('sans session, renvoie vers la connexion', /* redirect('/connexion'), rien appelé */);
it("propriétaire : enregistre service, poste, niveau, taille et attentes, puis ouvre l'appli", async () => {
  // readOnboardingMember → { role: 'owner', onboardedAt: null, … }
  // form: department=engineering job=backend seniority=5 size=11-50 goals=find,briefing
  expect(completeOwnerStep).toHaveBeenCalledWith(ctx, { department: 'engineering', job: 'backend', seniority: 5, size: '11-50', goals: ['find', 'briefing'] });
  expect(redirect).toHaveBeenCalledWith('/');
});
it("refuse un poste qui n'appartient pas au service", async () => {
  // department=sales job=backend → state.errors.job = 'Choisissez votre poste.' ; completeOwnerStep non appelé
});
it('refuse un niveau hors de 1 à 8', /* seniority=9 → errors.seniority */);
it('refuse un service inconnu', /* department=toString → errors.department */);
it("membre : n'enregistre que les attentes, même si le formulaire envoie un poste", async () => {
  // role 'member' ; form avec department/job/seniority + goals=meetings
  expect(completeMemberStep).toHaveBeenCalledWith(ctx, ['meetings']);
  expect(completeOwnerStep).not.toHaveBeenCalled();
});
it("nouveau venu : crée l'organisation, puis enregistre l'étape du propriétaire", async () => {
  // getUserContext → null puis ctx ; createOrganizationForUser → { ok: true, tenantId } ; resolveTenantContext → ctx
  expect(createOrganizationForUser).toHaveBeenCalledWith(USER_ID, 'Acme');
  expect(completeOwnerStep).toHaveBeenCalled();
});
it("nouveau venu : un double clic poursuit avec l'espace déjà créé", async () => {
  // createOrganizationForUser → { ok: false, error: 'deja_membre' } ; getUserContext (2e appel) → ctx ; completeOwnerStep appelé, aucune erreur
});
it("nouveau venu : un nom d'entreprise trop court ne crée rien", /* organizationName='A' → errors.company ; createOrganizationForUser non appelé */);
it("étape déjà validée : ouvre l'appli sans rien réécrire", /* onboardedAt: new Date() → redirect('/'), ni completeOwnerStep ni completeMemberStep */);
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `pnpm vitest run --project unit "src/app/(onboarding)/bienvenue/actions.test.ts"`
Attendu : ÉCHEC, le module `./actions` est introuvable.

- [ ] **Étape 3 : écrire `completeAboutStepAction` et les messages d'erreur**

- [ ] **Étape 4 : relancer ces tests et celui des messages**

Commande : `pnpm vitest run --project unit "src/app/(onboarding)/bienvenue/actions.test.ts" src/i18n/messages.test.ts`
Attendu : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add "src/app/(onboarding)/bienvenue/actions.ts" "src/app/(onboarding)/bienvenue/actions.test.ts" messages/en.json messages/fr.json
git commit -m "Onboarding : l'action de l'étape 1, nouveau venu compris"
```

---

### Tâche 5 : la page `/bienvenue`

**Fichiers :**
- Créer : `src/app/(onboarding)/layout.tsx`
- Créer : `src/app/(onboarding)/bienvenue/page.tsx`
- Créer : `src/components/verre/onboarding/about-step.tsx` (client)
- Créer : `src/components/verre/onboarding/preview.tsx` (client)
- Modifier : `messages/en.json`, `messages/fr.json` (textes de l'écran)

**Interfaces :**
- Utilise :
  - `completeAboutStepAction` et `AboutStepState` (tâche 4) ;
  - `readOnboardingMember`, `spaceRole` et `Placement` (tâche 2) ;
  - `signOutAction` (`src/app/(app)/actions.ts`, tâche 3) ;
  - les listes et les clés de libellés (tâche 1) ;
  - `setLocaleAction` (`src/app/(app)/reglages/actions.ts`, qui ne demande pas de session) ;
  - `getViewerProfile` ;
  - `Field`, `Input`, `Select` et `Button` (`src/components/verre/ui`) ;
  - `ToolIcon` (`chips.tsx`) ;
  - `GlassCard` et `Brand`.
- Produit : `AboutStep(props: { mode: 'newcomer' | 'owner' | 'member'; spaceRole: 'owner' | 'admin' | 'member'; userName: string; organizationName: string | null; placement: Placement | null })`. `mode` choisit le formulaire ; `spaceRole` donne l'étiquette de l'aperçu, où un administrateur existant est montré « Admin ».

La page (composant serveur) :
1. Sans `getSession()`, renvoyer vers `/connexion`.
2. Lire `ctx = await getUserContext()`.
3. Si `ctx` existe, lire `readOnboardingMember(ctx)` ; si `onboardedAt` n'est pas nul, renvoyer vers `/`.
4. Choisir le mode : `newcomer` sans `ctx`, `owner` si `spaceRole(role) === 'owner'`, `member` sinon.
5. `generateMetadata` donne le titre `onboarding.metaTitle` (« Welcome to Leon »).

Le layout :
- la marque en haut à gauche, et un lien discret « Sign out » / « Se déconnecter » en haut à droite (formulaire qui poste `signOutAction`) ;
- une `GlassCard` large, formulaire à gauche et aperçu à droite au-dessus de 1024 px, l'aperçu sous le formulaire en dessous ;
- pas d'en-tête du site public (la personne est connectée) et pas de défilement horizontal à 375 px.

Le formulaire suit la maquette (onglet « Créateur de l'espace », étape 1) :
- **Langue** (English | Français) en tête. Un clic appelle `setLocaleAction` dans une transition, puis `router.refresh()`. Les choix déjà faits restent en place.
- **Nouveau venu :** « Company name ».
- **Propriétaire et nouveau venu :**
  - « Department » puis « Role » : la liste des postes change avec le service ; « Choose… » au départ ;
  - « Seniority », avec l'aide « Same scale in every company » ;
  - « Company size » : quatre boutons à choix unique, envoyés dans un champ caché `size` ;
  - « What should Leon help you with? » : six boutons à cocher, envoyés dans des champs cachés `goals`.
- **Membre :**
  - une carte verrouillée avec le poste, le service et le niveau fixés, ou « Not set yet. An admin will set it. » quand rien n'est fixé ;
  - la phrase « Set by an {organization} admin. Something wrong? Ask them to change it. » ;
  - les attentes.
- **« Continue »** est désactivé pendant l'envoi (`pending` de `useActionState`). Après une erreur, le focus va au premier champ en erreur, comme dans `auth-form.tsx`.
- **L'aperçu** suit les choix sans envoi :
  - « Your profile in {organization} » : l'initiale, le nom, le poste, le niveau, le service, puis « Owner », « Admin » ou « Member » ;
  - « Leon will suggest connecting » : `ToolIcon` de chaque outil conseillé ;
  - « Things you can ask in Chat » : les deux exemples du service ;
  - « Setting up your workspace ».

  Tant que rien n'est choisi, l'aperçu montre seulement le nom.

Les clés de messages, sous `onboarding` : `metaTitle`, `title`, `lead`, `memberTitle` (« Welcome to {organization} »), `language`, `company`, `department`, `job`, `seniority`, `seniorityHint`, `size`, `goalsLabel`, `goalsHint`, `choose`, `continue`, `signOut`, `locked`, `notSet`, `preview.profileIn`, `preview.owner`, `preview.admin`, `preview.member`, `preview.connect`, `preview.ask` et `preview.settingUp`. Les textes exacts sont dans l'objet `T` de la maquette. Pour un nouveau venu, `{organization}` est le nom saisi, ou « your workspace » / « votre espace » tant qu'il est vide.

- [ ] **Étape 1 : écrire le layout, la page, les deux composants et les messages**

- [ ] **Étape 2 : vérifier le typage, le lint et les messages**

Commande : `pnpm typecheck && pnpm lint && pnpm vitest run --project unit src/i18n/messages.test.ts`
Attendu : aucune erreur.

- [ ] **Étape 3 : essayer pour de vrai, dans le navigateur, sur une base de dev migrée** (`pnpm db:migrate`, puis `pnpm dev`, hors sandbox)

Les cas à vérifier :
- **Propriétaire.** On s'inscrit par le formulaire et on arrive sur `/bienvenue` en anglais. On choisit Engineering, puis Backend engineer, Senior, 11–50 et deux attentes : l'aperçu suit chaque choix. « Continue » ouvre l'appli. On revient à la main sur `/bienvenue` : on est renvoyé dans l'appli.
- **Langue.** Le bouton Français bascule l'écran sans perdre les choix déjà faits.
- **Erreur.** On envoie sans service : l'erreur s'affiche sur le champ et le focus y va.
- **Membre.** On l'invite par un lien de Réglages › Équipe. Après l'inscription, on arrive sur `/bienvenue` : la carte verrouillée dit « Not set yet… », les attentes sont proposées, et « Continue » ouvre l'appli.
- **Nouveau venu.** Pour un compte de test : `delete from member where "userId" = …` dans la base de dev, puis connexion. On arrive sur `/bienvenue` avec « Company name ». Après l'envoi, un seul espace est créé et l'appli s'ouvre.
- **Largeur.** À 375 px, pas de défilement horizontal, et l'aperçu passe sous le formulaire.
- **Déconnexion.** Depuis `/bienvenue`, « Sign out » ramène à `/connexion`, y compris pour le nouveau venu sans espace.

- [ ] **Étape 4 : commiter**

```bash
git add "src/app/(onboarding)/layout.tsx" "src/app/(onboarding)/bienvenue/page.tsx" src/components/verre/onboarding/about-step.tsx src/components/verre/onboarding/preview.tsx messages/en.json messages/fr.json
git commit -m "Onboarding : la page /bienvenue et son aperçu"
```

---

### Tâche 6 : vérifications finales et PR

- [ ] **Étape 1 : lancer toute la suite**

Commande : `pnpm typecheck && pnpm lint && pnpm test:unit && LEON_TEST_DATABASE=leon_test_onboarding pnpm test:db` (hors sandbox pour la base)
Attendu : tout passe. Deux échecs connus peuvent apparaître et passent quand on les relance seuls : `members.db.test.ts` « refuse un lien expiré » (horloge du Postgres de Docker) et `index-run.db.test.ts` « en moins de 10 s ».

- [ ] **Étape 2 : relire la branche entière** : `auditing-runtime-contracts` (la route `/bienvenue`, les clés de messages, les colonnes), puis `security-review` (qui écrit le poste ; un nouveau venu ne peut pas rejoindre l'espace d'un autre). Corriger ce qui en sort.

- [ ] **Étape 3 : se remettre à jour et préparer la PR** : `git fetch origin && git rebase origin/main`. Vérifier le numéro de migration, et `ONBOARDING_PATH` si la branche de connexion sociale est déjà fusionnée. **Demander à Amos avant de pousser.** La description de la PR dit :
  - ce qui change et pourquoi, avec un lien vers la spec ;
  - ce que David doit vérifier : la condition SQL de `completeOwnerStep` et le cas du nouveau venu ;
  - que les comptes existants passent une fois par l'étape 1.
