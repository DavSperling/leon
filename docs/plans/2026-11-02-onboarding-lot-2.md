# Onboarding, lot 2 : invitations et étape « Collaborateurs » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**But :**
- Un lien d'invitation porte le service, le poste et le niveau de la personne invitée, fixés par un administrateur ; ils sont recopiés sur le membre quand il rejoint.
- Un propriétaire ou un administrateur modifie le poste de n'importe quel membre dans Réglages › Équipe.
- Le créateur d'un espace passe, après l'étape 1, par l'étape « Collaborateurs ».

**Architecture :**
- `invitation_links` gagne quatre colonnes ; `member` a déjà les siennes (lot 1, 0043).
- La validation du poste (service connu, poste du service, niveau de 1 à 8) devient un seul schéma, `PlacementSchema`. Il sert à l'étape 1, aux liens et à la modification par un administrateur.
- Côté écran, deux composants partagés :
  - `PlacementFields`, les trois listes, sert à l'étape 1, au formulaire d'invitation et à la fenêtre de modification ;
  - `InviteForm`, le formulaire d'invitation, sert à Réglages › Équipe et à l'étape 3.
- L'étape 3 est une page à part, `/bienvenue/collaborateurs`, dans le groupe `(onboarding)` du lot 1.

**Technologies :** Next.js 16 (App Router, server actions), React 19, Better Auth 1.7.7, Drizzle, Postgres, next-intl, zod 4.6, Vitest (`unit`, `db`), Biome.

**Spec :** `docs/specs/2026-10-28-onboarding.md` (sections « Étape 3 », « Données », lot 2). Textes exacts de l'étape 3 : objet `T` de `docs/specs/2026-10-28-onboarding-maquette.html` (`s3Title` à `you`, lignes 204-208 en anglais, 236-240 en français ; « e.g. Inès » ligne 353).

## Choix à valider par Amos (la spec ne tranche pas)

1. **Qui voit l'étape 3.**
   - Un propriétaire seul dans son espace y arrive après l'étape 1.
   - Un propriétaire qui a déjà une équipe (les comptes existants) va dans l'appli, comme le veut la spec : « Pas d'étapes 2 et 3 ».
   - Un propriétaire existant mais seul (espaces d'essai, comptes de démo) la verra une fois.
   - Tout propriétaire ou administrateur peut y revenir en tapant l'adresse.
2. **Pas d'écran « You're in » dans ce lot.** Sa phrase parle des sources que Leon lit : il vient avec l'étape 2, au lot 3. « Enter Leon » et « I'll invite people later » mènent à `/`.
3. **Pas de fil d'étapes** (1 · 2 · 3) avant le lot 3 : avec deux étapes, il n'apporte rien.
4. **Un administrateur modifie le poste de n'importe quel membre**, propriétaire et lui-même compris (« n'importe quel membre », section « Données »). C'est aussi ce qui corrige un lien mal rempli après coup.
5. **Le nom saisi est facultatif**, 100 caractères au plus. La maquette active « Create link » sans lui.
6. **Pas de « Amos vous a ajouté à l'espace Acme »** sur l'écran de l'invité : il faudrait garder qui a servi quel lien. La carte verrouillée du lot 1 suffit, elle affiche maintenant le poste recopié.
7. **Dans Réglages › Équipe, seuls les propriétaires et les administrateurs voient le poste et le niveau des autres.** La page ne les envoie même pas au navigateur d'un membre : un collègue ne lit pas « Stagiaire » ou « C-level » à côté d'un nom. Chacun voit le sien à l'étape 1.

## Contraintes globales

- **Langue :** anglais par défaut ; tout texte d'interface dans `messages/en.json` et `messages/fr.json` ; vouvoiement en français ; apostrophes typographiques (’) comme le reste des fichiers ; `src/i18n/messages.test.ts` vérifie la parité des clés.
- **Vocabulaire :**
  - « Teammates » / « Collaborateurs » pour les personnes invitées, y compris dans le code (`TeammatesStep`, `onboarding.teammates`) ;
  - « Department » / « Service », « Role » / « Poste » ;
  - « Team » / « Équipe » reste réservé aux membres de l'espace (Réglages › Équipe).
- **Stockage :** des identifiants, jamais des libellés. Un identifiant inconnu s'affiche « Other » / « Autre » (`departmentLabelKey`, `jobLabelKey`).
- **Qui écrit quoi :**
  - un administrateur fixe le poste d'un membre par une condition SQL d'écriture, sur le modèle d'`isAdminRole` (`src/server/auth/members.ts`) ;
  - un membre n'écrit jamais le sien, ni par l'interface ni par une action appelée à la main ;
  - `joinWithInvitation` recopie le poste du lien, dans sa transaction.
- **Aucun droit de lecture ne change** (ACL, RLS sur `sources`, `turns`, `passages`).
- **Frontière de confiance :** chaque action analyse tout son argument avec un seul schéma zod avant de lire une propriété. Une entrée forgée (`null`, objet incomplet) rend `{ errors: { form: 'form' } }`, jamais une erreur 500.
- **Erreurs :** une action rend des codes, le composant les traduit à l'affichage (leçon du lot 1 : une erreur traduite par le serveur reste dans l'ancienne langue).
- **Formulaires avec des listes Radix :** jamais `<form action={…}>` (React 19 remet le formulaire à zéro après l'action, et `Select` avec lui). On appelle l'action depuis un gestionnaire, comme `about-step.tsx`.
- **Migration :** `0044-invitations-poste.sql` (main en est à 0043 au 2/11).
- **Base de départ :** `origin/main` à `2785969` ou plus récent ; le plan est le premier commit de la branche.
- **Git :**
  - branche `amos/onboarding-invitations` ;
  - fichiers ajoutés un par un ;
  - messages de commit en français, terminés par la ligne `Co-Authored-By` ;
  - une seule PR.
- **Base de test :** `LEON_TEST_DATABASE=leon_test_onboarding` (la suite migre 0044 toute seule). Les commandes Postgres sortent de la sandbox.
- **Coordination :** la #69 de David (organigramme, ouverte) touche aussi `members.ts`, `members.tsx` et Réglages. La première fusionnée impose un rebase à l'autre. Le manager dans le formulaire d'invitation viendra après la #69.

## Points à surveiller à la relecture

1. **Un membre qui appelle à la main l'action de modification**, pour lui-même ou pour un autre, ne change rien. Testé aux tâches 1 (SQL) et 2 (action).
2. **Un administrateur d'un autre espace** qui envoie l'identifiant d'un membre de celui-ci ne change rien. Testé à la tâche 1.
3. **Un lien au poste incohérent ou forgé** est refusé, sans rien écrire :
   - poste hors du service, niveau 0 ou 9, service inconnu ;
   - nom de 101 caractères ;
   - argument `null`.
   Testé à la tâche 2. Le niveau est aussi contraint en base (tâche 1).
4. **Les liens créés avant ce lot**, sans poste, font toujours entrer : le membre a un poste vide et voit « Not set yet ». Testé à la tâche 1.
5. **Qui arrive sur l'étape 3.**
   - Un propriétaire seul : oui.
   - Un propriétaire qui a une équipe : l'appli.
   - Un membre qui tape l'adresse : l'appli.
   - Un propriétaire qui n'a pas fait l'étape 1 : `/bienvenue`.
   Testé à la tâche 4 (action et page).

---

### Tâche 1 : les données et les écritures

**Fichiers :**
- Créer : `src/server/db/migrations/0044-invitations-poste.sql`
- Modifier : `src/server/db/schema/invitation-links.ts`, `src/server/auth/members.ts`, `src/server/auth/onboarding.ts`
- Tests : `src/server/auth/members.db.test.ts`, `src/server/auth/onboarding.db.test.ts`, `src/server/auth/sign-up.db.test.ts` (appels existants à `createInvitationLink`)

**Interfaces :**
- Utilise : `DEPARTMENT_IDS`, `isDepartment`, `isJobOf`, `SENIORITY_LEVELS` (`src/lib/onboarding.ts`) ; `TenantContext`.
- Produit :
  - dans `onboarding.ts` :
    - `PlacementSchema` (zod) : `{ department: z.enum(DEPARTMENT_IDS), job: z.string(), seniority: z.coerce.number().int().min(1).max(SENIORITY_LEVELS.length) }`, avec le `refine` « poste du service » de l'`OwnerStepSchema` du lot 1 (`path: ['job']`), dont le `when` résiste à une valeur nulle : `when: ({ value }) => isDepartment(String((value as { department?: unknown } | null | undefined)?.department))` ;
    - `type ValidPlacement = z.infer<typeof PlacementSchema>` ;
    - `isSoleMember(ctx: TenantContext): Promise<boolean>` : vrai si l'espace n'a qu'un membre dont le compte n'est pas supprimé (`users.deletedAt` nul) ;
  - dans `members.ts` :
    - `MemberRow` gagne `department: string | null; job: string | null; seniority: number | null` ;
    - `createInvitationLink(ctx: TenantContext, invite: { name: string; placement: ValidPlacement }): Promise<{ token: string; expiresAt: Date } | null>` ; un nom vide est rangé `null` ;
    - `joinWithInvitation(token, userId)` : même signature, recopie le poste du lien sur le membre ;
    - `setMemberPlacement(ctx: TenantContext, memberId: string, placement: ValidPlacement): Promise<boolean>`.

La migration :

```sql
-- 0044-invitations-poste.sql : le lien d'invitation porte le service, le poste et le niveau de la personne invitée,
-- et le nom saisi pour s'y retrouver (onboarding, lot 2). joinWithInvitation les recopie sur le membre. Nuls pour les
-- liens d'avant : le serveur exige les trois pour tout nouveau lien.
alter table invitation_links
  add column invitee_name text check (char_length(invitee_name) <= 100),
  add column department text,
  add column job text,
  add column seniority smallint check (seniority between 1 and 8);
```

Les droits de `leon_app` sur la table (0033) couvrent les nouvelles colonnes.

**`setMemberPlacement`** met à jour `department`, `job` et `seniority` de la ligne `member` d'identifiant `memberId`, seulement si :
- `"organizationId" = ctx.tenantId` ;
- il existe une ligne `member` du lecteur (`ctx.userId`) dans `ctx.tenantId` avec `isAdminRole`.

Il rend `true` si une ligne a changé. Ne touche ni `role`, ni `goals`, ni `onboardedAt`.

- [ ] **Étape 1 : écrire les tests en base qui échouent, et mettre à jour les appels existants**

Les quatre appels existants à `createInvitationLink(ctx)` deviennent `createInvitationLink(ctx, { name: '', placement: backend })` :
- `members.db.test.ts:30, 71, 75` ;
- `sign-up.db.test.ts:210`.

Fixture : `createTestTenant(['Ana', 'Bob'])` ; Ana passe `admin` (`where` sur `userId` **et** `organizationId`, la base est partagée). `const backend = { department: 'engineering', job: 'backend', seniority: 3 } as const`. Pour Inès, reprendre `lonelyUser()` (`members.db.test.ts:37`).

```ts
// members.db.test.ts
it('le lien porte le poste, recopié sur le membre qui rejoint', async () => {
  const link = await createInvitationLink(ana, { name: 'Inès', placement: backend });
  expect(await joinWithInvitation(link!.token, inesId)).toBe(tenantId);
  // member d'Inès : department 'engineering', job 'backend', seniority 3, role 'member', onboardedAt null
  // invitation_links : invitee_name 'Inès' ; un lien créé avec name '' a invitee_name null
});
it("un lien d'avant ce lot, sans poste, fait toujours entrer", async () => {
  // createInvitationLink, puis adminDb remet invitee_name, department, job et seniority à null sur ce lien
  // join → tenantId ; member : department, job, seniority nuls
});
it('listMembers rend le poste de chacun', /* Bob avec un poste posé par adminDb → présent dans la ligne de Bob */);
it("un administrateur fixe le poste d'un membre", async () => {
  expect(await setMemberPlacement(ana, bobMemberId, backend)).toBe(true);
});
it('un administrateur fixe aussi son propre poste', /* ana, sa propre ligne → true */);
it("un membre ne fixe ni le sien ni celui d'un autre", async () => {
  expect(await setMemberPlacement(bob, bobMemberId, backend)).toBe(false);
  expect(await setMemberPlacement(bob, anaMemberId, backend)).toBe(false);
  // les deux lignes sont inchangées
});
it("un administrateur d'un autre espace ne touche pas à ce membre", /* admin d'un 2e tenant, bobMemberId → false */);
it('la base refuse un niveau hors de 1 à 8 sur un lien', /* update adminDb seniority 9 → rejects */);
```

```ts
// onboarding.db.test.ts
it('isSoleMember : vrai seul, faux à deux, vrai si le second compte est supprimé', async () => {
  // tenant d'une personne → true ; createTestUser(tenantId, 'Bob') → false ; users.deletedAt de Bob posé par adminDb → true
});
```

- [ ] **Étape 2 : les lancer et les voir échouer**

`LEON_TEST_DATABASE=leon_test_onboarding pnpm vitest run --project db src/server/auth/members.db.test.ts src/server/auth/onboarding.db.test.ts` : ÉCHEC (signatures et fonctions absentes).

- [ ] **Étape 3 : écrire la migration, les colonnes Drizzle et les fonctions**

Colonnes dans `invitation-links.ts` : `inviteeName: text('invitee_name')`, `department: text('department')`, `job: text('job')`, `seniority: smallint('seniority')`. `joinWithInvitation` prend le poste dans le `returning` de son `update` et le passe à l'`insert` du membre.

Après cette tâche, seul `src/app/(app)/reglages/actions.ts` échoue au typage (un appel à un argument). La tâche 2 le corrige ; ne pas y toucher ici.

- [ ] **Étape 4 : relancer ces tests, plus le contrat de schéma et la couverture RLS**

`LEON_TEST_DATABASE=leon_test_onboarding pnpm vitest run --project db src/server/auth src/server/db` : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add src/server/db/migrations/0044-invitations-poste.sql src/server/db/schema/invitation-links.ts src/server/auth/members.ts src/server/auth/members.db.test.ts src/server/auth/onboarding.ts src/server/auth/onboarding.db.test.ts src/server/auth/sign-up.db.test.ts
git commit -m "Onboarding : le lien d'invitation porte le poste, et un administrateur fixe celui d'un membre"
```

---

### Tâche 2 : les actions

**Fichiers :**
- Modifier : `src/app/(app)/reglages/actions.ts`, `src/app/(app)/reglages/actions.test.ts`
- Modifier : `src/app/(onboarding)/bienvenue/actions.ts` (seulement `OwnerStepSchema`)
- Modifier : `src/components/verre/reglages/members.tsx` (l'appel, au strict minimum)
- Modifier : `messages/en.json`, `messages/fr.json`

**Interfaces :**
- Utilise (tâche 1) : `PlacementSchema`, `ValidPlacement`, `createInvitationLink`, `setMemberPlacement`.
- Produit (tâches 3 et 4), exportés de `reglages/actions.ts` (des types, permis dans un fichier `'use server'`) :
  - `type PlacementInput = { department: string; job: string; seniority: string }` (valeurs telles que les listes les donnent) ;
  - `type InviteErrorCode = 'name' | 'department' | 'job' | 'seniority' | 'permission' | 'form'` ;
  - `type InviteErrors = Partial<Record<'name' | 'department' | 'job' | 'seniority' | 'form', InviteErrorCode>>` ;
  - `createInvitationAction(input: PlacementInput & { name: string }): Promise<{ url: string; expiresAt: Date } | { errors: InviteErrors }>` ;
  - `setMemberPlacementAction(memberId: string, input: PlacementInput): Promise<{ ok: true } | { errors: InviteErrors }>`.

Les règles :
- **`createInvitationAction`** analyse tout son argument avec `PlacementSchema.safeExtend({ name: z.string().trim().max(100) })` :
  - un code par champ fautif (`name`, `department`, `job`, `seniority`) ;
  - une erreur sans champ (argument `null`, forgé) : `form: 'form'` ;
  - `createInvitationLink` qui rend `null` : `form: 'permission'` ;
  - le lien en clair est construit comme aujourd'hui (`new URL('/invitation/' + token, env.BETTER_AUTH_URL)`).
- **`setMemberPlacementAction`** :
  - `memberId` qui n'est pas un UUID (`z.uuid()`) : `form: 'form'` ;
  - `input` analysé par `PlacementSchema`, mêmes codes ;
  - `setMemberPlacement` qui rend `false` : `form: 'permission'` ;
  - `revalidatePath('/reglages')` sur succès.
- **`OwnerStepSchema`** (`bienvenue/actions.ts`) devient `PlacementSchema.safeExtend({ size, goals })` : le `refine` du poste n'existe plus qu'à un endroit. Les tests du lot 1 restent verts sans changement.
- **La clé `settings.invitePermission`** ne sert plus : la retirer des deux fichiers.

Messages, sous `onboarding.inviteErrors`. Ils sont neutres, car c'est un administrateur qui choisit pour quelqu'un d'autre :

| Code | Anglais | Français |
| --- | --- | --- |
| `name` | Use 100 characters or fewer. | 100 caractères au plus. |
| `department` | Choose a department. | Choisissez un service. |
| `job` | Choose a role. | Choisissez un poste. |
| `seniority` | Choose a seniority level. | Choisissez un niveau. |
| `permission` | Only an owner or an admin can do this. | Seul un propriétaire ou un administrateur peut le faire. |
| `form` | Something went wrong. Try again. | Un problème est survenu. Réessayez. |

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `reglages/actions.test.ts`, **remplacer** le `describe('createInvitationAction')` existant (lignes 336-355 : appel sans argument, `toHaveBeenCalledWith(ctx)`, texte « administrateurs »). Ajouter le mock de `setMemberPlacement`. Garder le vrai `env` des tests.

```ts
const backend = { department: 'engineering', job: 'backend', seniority: '3' };
it('crée un lien qui porte le nom et le poste', async () => {
  vi.mocked(createInvitationLink).mockResolvedValue({ token: 't'.repeat(43), expiresAt });
  const result = await createInvitationAction({ name: '  Inès ', ...backend });
  expect(createInvitationLink).toHaveBeenCalledWith(ctx, { name: 'Inès', placement: { department: 'engineering', job: 'backend', seniority: 3 } });
  expect(result).toEqual({ url: expect.stringContaining('/invitation/'), expiresAt });
});
it.each([
  [{ department: 'sales', job: 'backend', seniority: '3' }, 'job'],
  [{ department: 'toString', job: 'backend', seniority: '3' }, 'department'],
  [{ ...backend, seniority: '0' }, 'seniority'],
  [{ ...backend, seniority: '9' }, 'seniority'],
])('refuse un poste incohérent sans rien créer (%o → %s)', async (input, field) => {
  expect(await createInvitationAction({ name: '', ...input })).toEqual({ errors: { [field]: field } });
  expect(createInvitationLink).not.toHaveBeenCalled();
});
it('refuse un nom de 101 caractères', /* errors.name = 'name' */);
it('refuse un argument forgé sans planter', async () => {
  expect(await createInvitationAction(null as never)).toEqual({ errors: { form: 'form' } });
});
it("dit qu'il faut être administrateur quand le lien est refusé", /* createInvitationLink → null : errors.form = 'permission' */);
it("fixe le poste d'un membre", /* setMemberPlacement → true : { ok: true }, appelé avec la placement validée */);
it("refuse un identifiant de membre qui n'est pas un UUID", /* 'abc' → errors.form = 'form', setMemberPlacement non appelé */);
it("dit qu'il faut être administrateur quand la modification est refusée", /* false → errors.form = 'permission' */);
```

- [ ] **Étape 2 : les lancer et les voir échouer**

`pnpm vitest run --project unit "src/app/(app)/reglages/actions.test.ts"` : ÉCHEC.

- [ ] **Étape 3 : écrire les deux actions, `OwnerStepSchema` et les messages**

Dans `members.tsx`, adapter l'appel à `createInvitationAction` au strict minimum pour que le typage passe : la tâche 3 refait ce formulaire.

- [ ] **Étape 4 : relancer les tests des deux actions, celui des messages et le typage**

`pnpm vitest run --project unit "src/app/(app)/reglages/actions.test.ts" "src/app/(onboarding)/bienvenue/actions.test.ts" src/i18n/messages.test.ts && pnpm typecheck` : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add "src/app/(app)/reglages/actions.ts" "src/app/(app)/reglages/actions.test.ts" "src/app/(onboarding)/bienvenue/actions.ts" src/components/verre/reglages/members.tsx messages/en.json messages/fr.json
git commit -m "Onboarding : actions pour inviter avec un poste et pour le modifier"
```

---

### Tâche 3 : Réglages › Équipe

**Fichiers :**
- Créer : `src/components/verre/onboarding/placement-fields.tsx`, `src/components/verre/onboarding/invite-form.tsx`
- Modifier : `src/components/verre/onboarding/about-step.tsx` (utilise `PlacementFields`)
- Modifier : `src/components/verre/reglages/members.tsx`, `src/app/(app)/reglages/page.tsx`
- Modifier : `messages/en.json`, `messages/fr.json`

**Interfaces :**
- Utilise : `createInvitationAction`, `setMemberPlacementAction`, `PlacementInput`, `InviteErrors` (tâche 2) ; `MemberRow` (tâche 1).
- Produit (tâche 4) :
  - `PlacementFields(props: { value: PlacementInput; onChange: (next: PlacementInput, field: 'department' | 'job' | 'seniority') => void; errors?: Partial<Record<'department' | 'job' | 'seniority', string>> })`.
    - Ce sont les trois listes de l'étape 1, avec leurs libellés (`onboarding.department`, `job`, `seniorityLabel`, `seniorityHint`, `choose`).
    - Un changement de service vide le poste.
    - `errors` reçoit des textes déjà traduits.
    - `about-step.tsx` l'utilise à la place de son propre bloc, sans changer de comportement : il efface l'erreur du champ reçu en second argument, et celle de `job` quand le service change.
  - `InviteForm(props: { onCreated: (link: { url: string; expiresAt: Date; name: string; placement: PlacementInput }) => void; secondaryAction?: ReactNode })`.
    - Il contient le nom (facultatif, aide et exemple), `PlacementFields`, puis une rangée d'actions : `secondaryAction`, puis « Create link ».
    - « Create link » est désactivé tant que service, poste et niveau ne sont pas choisis. Il appelle `createInvitationAction` depuis un gestionnaire, avec un état d'envoi.
    - Les erreurs s'affichent par champ, traduites depuis `onboarding.inviteErrors`.
    - En cas de succès, il appelle `onCreated`.

Ce qui change dans Réglages :
- **La fenêtre « Invite a member »** affiche `InviteForm`, avec « Cancel » en `secondaryAction`. `onCreated` passe à l'écran « lien créé » actuel, inchangé.
- **`reglages/page.tsx`** ne passe le poste des membres (`department`, `job`, `seniority`) que si le lecteur peut inviter. Sinon, ces trois champs valent `null` dans ce qu'il envoie au composant (choix 7).
- **Chaque membre actif**, pour un propriétaire ou un administrateur :
  - sous l'e-mail, « {poste} · {niveau} · {service} », ou « Role not set » / « Poste non renseigné » ;
  - un bouton icône (crayon), d'étiquette « Edit {name}’s department, role and seniority » / « Modifier le service, le poste et le niveau de {name} ». Il ouvre une fenêtre :
    - titre : `{name}` ;
    - description : « Department, role and seniority. {name} sees them but can’t change them. » / « Service, poste et niveau. {name} les voit sans pouvoir les changer. » ;
    - `PlacementFields`, prérempli ;
    - « Cancel » et « Save ».
  « Save » appelle `setMemberPlacementAction` et ferme la fenêtre sur succès ; `revalidatePath` rafraîchit la liste. Les erreurs viennent de `onboarding.inviteErrors`.
- Un ancien membre n'a ni poste affiché ni bouton.

Clés nouvelles :
- sous `settings` : `save` (« Save » / « Enregistrer »), `placementNotSet`, `editPlacement`, `editPlacementDescription` (textes ci-dessus) ;
- sous `onboarding.teammates`, reprises de la maquette pour `InviteForm` :
  - `name` (« Name » / « Nom ») ;
  - `nameHint` (« To tell links apart » / « Pour vous y retrouver ») ;
  - `namePlaceholder` (« e.g. Inès » / « ex. Inès ») ;
  - `createLink` (« Create link » / « Créer le lien »).

- [ ] **Étape 1 : extraire `PlacementFields` et le brancher dans `about-step.tsx`**

`pnpm vitest run --project unit "src/app/(onboarding)" src/i18n && pnpm typecheck` : tout passe, aucune différence de comportement à l'étape 1.

- [ ] **Étape 2 : `InviteForm`, la fenêtre d'invitation, le poste des membres et la fenêtre de modification**

- [ ] **Étape 3 : typage, lint, messages et contrats**

`pnpm typecheck && pnpm biome check src messages && pnpm vitest run --project unit src/i18n src/test/contracts "src/app/(app)"` : tout passe.

- [ ] **Étape 4 : commiter**

```bash
git add src/components/verre/onboarding/placement-fields.tsx src/components/verre/onboarding/invite-form.tsx src/components/verre/onboarding/about-step.tsx src/components/verre/reglages/members.tsx "src/app/(app)/reglages/page.tsx" messages/en.json messages/fr.json
git commit -m "Réglages › Équipe : inviter avec un poste, et le modifier pour chaque membre"
```

Le contrôleur fait l'essai dans le navigateur après la relecture :
- un lien créé ;
- un membre qui rejoint par ce lien ;
- une modification de poste ;
- un membre simple qui ne voit pas le poste des autres.

---

### Tâche 4 : l'étape « Collaborateurs »

**Fichiers :**
- Créer : `src/app/(onboarding)/bienvenue/collaborateurs/page.tsx`
- Créer : `src/app/(onboarding)/bienvenue/collaborateurs/page.test.ts`
- Créer : `src/components/verre/onboarding/teammates-step.tsx` (client)
- Modifier : `src/app/(onboarding)/bienvenue/actions.ts` et `actions.test.ts` (la redirection après l'étape 1)
- Modifier : `messages/en.json`, `messages/fr.json`

**Interfaces :**
- Utilise :
  - `InviteForm`, `PlacementInput` (tâches 2 et 3) ;
  - `isSoleMember` (tâche 1) ;
  - `getSession`, `getUserContext`, `readOnboardingMember`, `canInvite`, `getViewerProfile`, `Placement` ;
  - `departmentLabelKey`, `jobLabelKey`, `seniorityId` ;
  - `CopyButton`, `GlassCard`, `Badge`, `Button`.
- Produit : `TeammatesStep(props: { organizationName: string; you: { name: string; placement: Placement } })`.

**La redirection après l'étape 1** (`completeAboutStepAction`). Après `completeOwnerStep`, écrire :

```ts
if (await isSoleMember(ctx)) redirect('/bienvenue/collaborateurs');
redirect('/');
```

Le littéral permet au contrat `page-links` de vérifier la route. Un membre va toujours sur `/`.

**La page** (composant serveur, jamais `requireUserContext()`) :
1. Sans session : `/connexion`.
2. `getUserContext()` nul : `/bienvenue`.
3. Membre introuvable : `/`.
4. `onboardedAt` nul : `/bienvenue`.
5. `canInvite(ctx)` faux : `/`.
6. Sinon, `TeammatesStep`, avec le nom de l'espace et le poste du propriétaire.

`generateMetadata` : `onboarding.teammates.title`.

**L'écran** reprend le layout du lot 1 : formulaire à gauche, aperçu à droite au-dessus de 1024 px, aperçu dessous en dessous.
- Titre et chapeau.
- Une carte par collaborateur, une au départ :
  - avant le lien : `InviteForm` ;
  - après le lien : le nom (ou « — »), « {poste} · {niveau} · {service} », le lien, `CopyButton` et « Send it yourself. It works once and expires in 7 days. ». La carte ne se modifie plus.
- « + Add a teammate » ajoute une carte vide.
- « Enter Leon » (bouton principal) et « I’ll invite people later » (lien discret) mènent à `/`.
- **L'aperçu** : le nom de l'espace, puis un petit organigramme.
  - Le propriétaire : initiale, nom, « {poste} · {niveau} », badge « You ».
  - Chaque carte : initiale du nom (ou « ? »), le nom (ou « — »), « {poste} · {niveau} » une fois le lien créé, badge « Draft » ou « Link created ».

Les liens n'existent que dans l'état du composant : un rechargement les efface, comme dans Réglages.

Messages, sous `onboarding.teammates` (textes de la maquette, `T.en` / `T.fr`), en plus de ceux de la tâche 3 :
- `title` (`s3Title`), `lead` (`s3Lead`) ;
- `linkNote`, `addTeammate`, `enter`, `skip` (`skipTeam`) ;
- `linkCreated`, `draft`, `you`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`bienvenue/actions.test.ts` :
- ajouter `isSoleMember` au mock de `@/server/auth/onboarding`, à `false` par défaut dans `beforeEach` ;
- vérifier les redirections exactement : `expect(redirect).toHaveBeenLastCalledWith(…)`. `rejects.toThrow('NEXT_REDIRECT /')` passe aussi pour `/bienvenue/collaborateurs`.

```ts
it("propriétaire seul : l'étape Collaborateurs suit", /* isSoleMember → true : redirect('/bienvenue/collaborateurs') */);
it("propriétaire qui a une équipe : l'appli", /* false : redirect('/') */);
it("nouveau venu : l'espace créé, l'étape Collaborateurs suit", /* chemin newcomer du lot 1, isSoleMember → true */);
// le test « membre » existant : redirect('/') exactement, isSoleMember non appelé
```

`collaborateurs/page.test.ts`, sur le modèle de `src/app/(app)/layout.test.ts` :
- mocks de `@/server/auth/session`, `@/server/auth/onboarding`, `@/server/auth/members`, `@/server/auth/viewer` ;
- mock de `next/navigation` (`redirect` qui lève) ;
- mock du composant client : `vi.mock('@/components/verre/onboarding/teammates-step', () => ({ TeammatesStep: vi.fn() }))`. Sans lui, l'import descend jusqu'à `reglages/actions` puis Better Auth.

```ts
it('sans session → /connexion', …);
it('sans espace → /bienvenue', /* getUserContext → null */);
it('étape 1 à faire → /bienvenue', /* onboardedAt null */);
it("un membre qui n'est pas administrateur → /", /* canInvite → false */);
it("un propriétaire dont l'étape 1 est faite voit l'écran", /* rend sans redirect */);
```

- [ ] **Étape 2 : les lancer et les voir échouer**

`pnpm vitest run --project unit "src/app/(onboarding)"` : ÉCHEC (page introuvable, redirection vers `/`).

- [ ] **Étape 3 : écrire la redirection, la page, `TeammatesStep` et les messages**

- [ ] **Étape 4 : typage, lint, tests, messages, contrats**

`pnpm typecheck && pnpm biome check src messages && pnpm vitest run --project unit "src/app/(onboarding)" src/i18n src/test/contracts` : tout passe. `page-links` voit `redirect('/bienvenue/collaborateurs')` mener à la nouvelle page.

- [ ] **Étape 5 : commiter**

```bash
git add "src/app/(onboarding)/bienvenue/collaborateurs/page.tsx" "src/app/(onboarding)/bienvenue/collaborateurs/page.test.ts" src/components/verre/onboarding/teammates-step.tsx "src/app/(onboarding)/bienvenue/actions.ts" "src/app/(onboarding)/bienvenue/actions.test.ts" messages/en.json messages/fr.json
git commit -m "Onboarding : l'étape Collaborateurs, un lien par personne avec son poste"
```

Le contrôleur fait l'essai dans le navigateur après la relecture :
- un nouveau compte arrive sur l'étape 3 après l'étape 1 ;
- deux liens créés, avec l'organigramme qui suit ;
- un invité rejoint par l'un et voit son poste verrouillé à l'étape 1 ;
- « I’ll invite people later » ;
- 375 px.

---

### Tâche 5 : vérifications finales et PR

- [ ] **Étape 1 : toute la suite**

`pnpm typecheck && pnpm biome check src messages && pnpm test:unit && LEON_TEST_DATABASE=leon_test_onboarding pnpm test:db` (hors sandbox pour la base) : tout passe.

- [ ] **Étape 2 : relecture de la branche entière**

Grilles `security-review` et `auditing-runtime-contracts`, en particulier :
- qui écrit le poste ;
- un membre qui forge les actions ;
- un lien d'un autre espace ;
- ce que la page Réglages envoie au navigateur d'un membre ;
- les clés de messages ;
- la route `/bienvenue/collaborateurs`.

- [ ] **Étape 3 : se remettre à jour, vérifier le numéro de migration, demander à Amos avant de pousser**

Description de la PR :
- ce qui change, avec un lien vers la spec et le plan ;
- les sept choix à valider listés en tête de ce plan ;
- ce que David doit vérifier : la condition SQL de `setMemberPlacement`, la recopie dans `joinWithInvitation`, le conflit attendu avec la #69.
