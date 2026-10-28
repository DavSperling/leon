# Supprimer son compte, supprimer l'organisation : plan d'exécution

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development. Les étapes se cochent
> (`- [ ]`).

**But :** un membre peut supprimer son compte depuis Profil (son travail reste à la société) ; le propriétaire peut
supprimer l'organisation entière depuis Équipe (tout part).

**Architecture :** un module serveur `src/server/auth/delete-account.ts` fait tout le travail en base dans une seule
transaction `withTenant`. Deux actions serveur vérifient l'identité (mot de passe, code 2FA, mot tapé) puis
l'appellent, préviennent Pipedream et envoient l'e-mail. La seule migration ajoute `user.deleted_at`.

**Pile :** Next.js 16 (actions serveur), Better Auth 1.7.7, Drizzle + Postgres (RLS), next-intl, Vitest.

**Spec :** `docs/specs/2026-10-28-supprimer-son-compte.md` (approuvée par Amos le 28/10). La lire d'abord.

## Contraintes communes

- Branche `amos/supprimer-compte`, partie de `origin/main`. Règles de `CLAUDE.md` : fichiers ajoutés un par un,
  jamais `.claude/launch.json`, jamais de secret.
- Tout texte d'interface passe par `messages/en.json` ET `messages/fr.json`, mêmes clés (test
  `src/i18n/messages.test.ts`). Français : vouvoiement, `nb()` pour les espaces insécables.
- Commentaires en français, au style du fichier voisin ; pas de commentaire qui répète le code.
- Tests en base : `LEON_TEST_DATABASE=leon_test_anglais pnpm exec vitest run --project db <fichier>` hors
  sandbox. Unitaires : `pnpm exec vitest run --project unit <fichier>`.
- Ne pas toucher `src/server/auth/auth.ts` (la PR #66 de David le modifie).
- Mot à taper : « SUPPRIMER » (fr), « DELETE » (en), comparé exactement après `trim()`.
- Un **membre actif** est une adhésion dont l'utilisateur n'a pas de `deleted_at`.
- Adresse d'un ancien membre : `ancien-<userId>@leon.invalid`.

## Points à surveiller

1. Deux propriétaires qui suppriment leur compte en même temps ne laissent jamais l'organisation sans
   propriétaire actif : les adhésions de l'organisation sont verrouillées (`for update`) en début de transaction.
   Tâche 1 : test qui lance deux suppressions en parallèle.
2. Un ancien membre ne peut ni se connecter, ni utiliser un jeton d'API, ni redemander un mot de passe (son
   adresse d'origine ne mène plus à aucun compte). Tâche 1 : test.
3. Un successeur qui n'est pas un membre actif de l'organisation (autre organisation, ancien membre, soi-même)
   est refusé. Tâche 1 : test.
4. Un point du matin déjà en file pour un compte supprimé ne refait rien et n'appelle pas le modèle. Tâche 1 :
   test.
5. Pipedream ou Resend en panne ne font pas échouer une suppression déjà faite en base. Tâche 3 : test.

---

### Tâche 1 : la base (migration, module de suppression)

**Fichiers :**
- Créer : `src/server/db/migrations/0040-suppression-compte.sql`
- Modifier : `src/server/db/schema/auth.ts` (colonne `deletedAt` sur `users`)
- Créer : `src/server/auth/delete-account.ts`
- Modifier : `src/server/briefing/briefings.ts` (`refreshBriefing` ne fait rien pour un compte supprimé)
- Test : `src/server/auth/delete-account.db.test.ts`, et un cas dans le test en base de `briefings.ts`

**Interfaces produites :**

```ts
export const formerEmail = (userId: string) => `ancien-${userId}@leon.invalid`;

export type DeletionInfo = {
  organizationName: string;
  isOwner: boolean; // propriétaire actif de l'organisation courante
  soleActiveMember: boolean; // supprimer le compte supprimera l'organisation
  needsSuccessor: boolean; // seul propriétaire actif, avec d'autres membres actifs
  successors: { userId: string; name: string }[]; // les autres membres actifs, par ancienneté
  activeMembers: number;
};
export async function deletionInfo(ctx: TenantContext): Promise<DeletionInfo>;

export type DeletionRefusal = 'successeur' | 'autre_organisation' | 'pas_proprietaire';
export class DeletionRefused extends Error {
  constructor(readonly reason: DeletionRefusal);
}

export type DeletionResult = {
  organizationDeleted: boolean;
  organizationName: string;
  notify: { email: string; kind: 'account' | 'organization' }[]; // adresses d'origine, relevées avant
  pipedreamUsers: string[]; // `config.externalUserId` des connexions Pipedream effacées
};
export async function deleteAccount(ctx: TenantContext, successorId: string | null): Promise<DeletionResult>;
export async function deleteOrganization(ctx: TenantContext): Promise<DeletionResult>;
```

**Comportement** (tout dans un seul `withTenant(ctx, async (tx) => …)` ; les tables de Better Auth, `api_tokens` et
`invitation_links` n'ont pas de RLS, `connections` a `acl = [tenantId]` donc tout le monde de l'organisation les
voit) :

- `deleteAccount` :
  1. Verrouille les adhésions de l'organisation (`select … from member where "organizationId" = tenant for update`).
  2. Refus `autre_organisation` si l'utilisateur est membre d'une autre organisation (choix de Claude : un compte
     n'a qu'une organisation en pratique ; ses connexions ailleurs resteraient sinon actives).
  3. Seul membre actif : fait `deleteOrganization` (dans la même transaction) et rend `organizationDeleted: true`.
  4. Seul propriétaire actif avec d'autres membres actifs : `successorId` doit être un membre actif de
     l'organisation autre que lui, sinon refus `successeur` ; ce membre reçoit le rôle `owner`.
  5. Relève son e-mail d'origine et les `externalUserId` de ses connexions où `config->>'authMode' = 'pipedream'`.
  6. `user` : `deleted_at = now()`, `email = formerEmail(id)`, `emailVerified = false`, `image = null`,
     `about = null`, `twoFactorEnabled = false`, `updatedAt = now()`. Le nom ne change pas.
  7. Ses adhésions passent à `role = 'member'`.
  8. Supprime ses lignes `account`, `session`, `twoFactor` ; `api_tokens.revoked_at = now()` pour ses jetons non
     révoqués ; `invitation_links.expires_at = now()` pour ses liens non servis ; supprime ses `connections`
     (leurs sources restent, `connection_id` passe à nul par la clé existante).
  9. Ne touche ni à ses sources, ni à ses discussions, ni à ses points du matin.
- `deleteOrganization` : refus `pas_proprietaire` si l'appelant n'est pas propriétaire actif. Relève le nom de
  l'organisation, les e-mails des membres actifs (`kind: 'organization'`, sauf l'appelant : `'account'`), les
  `externalUserId` Pipedream de toutes ses connexions, et la liste des utilisateurs qui n'ont pas d'autre
  organisation. Supprime la ligne `organization` (tout part en cascade), puis ces utilisateurs.
- `deletionInfo` : lecture seule, mêmes règles que ci-dessus pour `needsSuccessor` et `soleActiveMember`.
- `refreshBriefing` : si l'utilisateur a un `deleted_at`, rend tout de suite sans rien écrire ni appeler le modèle.

- [ ] **Étape 1 : écrire les tests en base** (`delete-account.db.test.ts`, avec `createTestTenant`, `seedSource`,
  `seedConnection` de `src/test/fixtures.ts` et `adminDb` pour vérifier) :
  - `garde ses sources, ses tours et ses discussions, et efface ce qui le rend joignable` : après `deleteAccount`,
    la ligne `user` a `deleted_at`, `email = formerEmail(id)`, son nom inchangé ; plus aucune ligne `account`,
    `session`, `twoFactor` ni `connections` à lui ; ses jetons ont `revoked_at` ; ses liens d'invitation sont
    expirés ; sa source privée et sa source partagée sont toujours là, et un collègue lit toujours la partagée.
  - `ne laisse plus se connecter` : un compte créé par `auth.api.signUpEmail` puis supprimé fait échouer
    `auth.api.signInEmail` avec son ancienne adresse ; aucun utilisateur ne porte plus cette adresse.
  - `demande un successeur au seul propriétaire` : refus `successeur` sans successeur, avec un membre d'une autre
    organisation, avec un ancien membre, avec lui-même ; avec un bon successeur, celui-ci devient `owner` et
    l'ancien propriétaire passe `member`.
  - `ne compte pas un ancien membre comme membre actif` : un propriétaire dont le seul autre membre est un ancien
    membre est `soleActiveMember`.
  - `supprime l'organisation quand il est le seul membre actif` : l'organisation, ses sources et les comptes de ses
    membres (actifs et anciens) n'existent plus ; une autre organisation est intacte.
  - `refuse de supprimer l'organisation à qui n'est pas propriétaire` (admin, membre) : `pas_proprietaire`.
  - `refuse quand il est membre d'une autre organisation` : `autre_organisation`.
  - `ne laisse jamais l'organisation sans propriétaire` : deux propriétaires, chacun choisit l'autre comme
    successeur, `Promise.allSettled` des deux suppressions : il reste exactement un propriétaire actif.
  - Dans le test de `briefings.ts` : `refreshBriefing` pour un compte supprimé n'écrit rien et n'appelle pas le
    faux modèle.
- [ ] **Étape 2 : les lancer, vérifier qu'ils échouent** (module absent).
- [ ] **Étape 3 : écrire la migration** `0040-suppression-compte.sql` : `alter table "user" add column deleted_at
  timestamptz;` avec une ligne de commentaire d'en-tête comme les autres migrations ; et `deletedAt:
  timestamp('deleted_at', { withTimezone: true })` dans `users`.
- [ ] **Étape 4 : écrire `delete-account.ts` et la garde de `refreshBriefing`.**
- [ ] **Étape 5 : lancer les tests en base, ils passent ;** `pnpm typecheck` et `pnpm lint` passent.
- [ ] **Étape 6 : commit** « Comptes : supprimer son compte en gardant son travail, supprimer l'organisation ».

### Tâche 2 : « ancien membre » à l'affichage

**Fichiers :**
- Modifier : `src/server/auth/members.ts` (`MemberRow` gagne `former: boolean` ; `email` vide pour un ancien membre)
- Modifier : `src/components/verre/reglages/members.tsx` (actifs d'abord ; anciens membres dans une liste à part,
  titre `settings.formerMembersTitle`, nom via `settings.formerMember`, sans e-mail ni badge de rôle)
- Modifier : `src/server/documents/documents.ts` et `src/components/verre/documents/index.tsx` (`ownerFormer:
  boolean`, nom affiché via `settings.formerMember`)
- Modifier : `messages/en.json`, `messages/fr.json`
- Test : `src/server/auth/members.db.test.ts` (ou le test existant de `listMembers`)

**Interfaces consommées :** la colonne `users.deletedAt` (tâche 1).

**Textes :** `settings.formerMember` : « {name} (former member) » / « {name} (ancien membre) » ;
`settings.formerMembersTitle` : « Former members » / « Anciens membres ».

Limite connue, à laisser telle quelle : `resolvePeople` (`search/people.ts`) rapproche un nom d'une adresse ; pour
un ancien membre, l'adresse ne mène plus à ses messages relevés. Ajouter un commentaire `shortcut:` à cet endroit.

- [ ] **Étape 1 : test** `listMembers rend les anciens membres marqués, sans leur adresse` : après
  `deleteAccount` d'un membre, sa ligne a `former: true` et `email: ''` ; les autres `former: false`.
- [ ] **Étape 2 : le lancer, il échoue.**
- [ ] **Étape 3 : modifier les requêtes, les composants et les textes.**
- [ ] **Étape 4 : tests, `pnpm typecheck`, `pnpm lint` passent.**
- [ ] **Étape 5 : commit** « Équipe et Documents : afficher « ancien membre » ».

### Tâche 3 : actions serveur et e-mail

**Fichiers :**
- Créer : `src/server/email/account-deleted.ts`
- Modifier : `src/app/(app)/reglages/actions.ts`
- Modifier : la page de connexion (`src/app/(auth)/connexion/`) pour le message après suppression
- Modifier : `messages/en.json`, `messages/fr.json`
- Test : `src/app/(app)/reglages/actions.test.ts`, `src/server/email/account-deleted.test.ts`

**Interfaces consommées :** `deleteAccount`, `deleteOrganization`, `DeletionRefused`, `DeletionResult` (tâche 1).

**Interfaces produites :**

```ts
// src/server/email/account-deleted.ts : rien si RESEND_API_KEY ou LEON_EMAIL_FROM manque ; lève si Resend refuse.
export async function sendDeletionEmail(input: {
  to: string;
  locale: Locale;
  kind: 'account' | 'organization';
  organizationName: string;
}): Promise<void>;

// src/app/(app)/reglages/actions.ts : en cas de succès, ne rend pas (redirect).
export async function deleteAccountAction(input: {
  password: string;
  code: string;
  word: string;
  successorId: string | null;
}): Promise<{ error: string }>;
export async function deleteOrganizationAction(input: {
  password: string;
  code: string;
  word: string;
}): Promise<{ error: string }>;
```

**Comportement commun** (une fonction locale non exportée `confirmIdentity`) : `passwordCheckAllowed()` (sinon
`security.tooManyAttempts`) ; mot tapé égal à `deleteAccount.word` de la langue courante (sinon
`deleteAccount.wrongWord`) ; `auth.api.verifyPassword({ body: { password }, headers })` (sinon
`security.wrongPassword`) ; si `session.user.twoFactorEnabled`, `auth.api.verifyTOTP({ body: { code }, headers })`
(sinon `deleteAccount.wrongCode`). Puis l'appel au module ; `DeletionRefused` donne `deleteAccount.refused.<reason>`.
Après : `forgetPipedreamUser` pour chaque utilisateur Pipedream, `sendDeletionEmail` pour chaque adresse (erreur →
`logError('account.deletion_email', …)`), `signOutCurrentUser()` dont l'erreur est ignorée (la session n'existe
déjà plus), puis `redirect('/connexion?supprime=compte')` ou `'/connexion?supprime=organisation'`.

**E-mail**, sur le modèle de `sendPasswordReset` (`auth.ts`) : sujets `deleteAccount.emailSubjectAccount` /
`emailSubjectOrganization`, corps avec le nom de l'organisation et la date, puis « Si vous n'êtes pas à l'origine de
cette suppression, prévenez l'administrateur de votre organisation. » Aucun lien. Langue : celle de la personne qui
supprime, pour tous les e-mails (shortcut : Leon ne garde pas la langue de chaque membre).

- [ ] **Étape 1 : tests unitaires** (`actions.test.ts`, mocks déjà en place pour `auth.api`) :
  `deleteAccountAction refuse un mot mal tapé, un mauvais mot de passe, un mauvais code 2FA, et au-delà de la
  limite, sans appeler deleteAccount` ; `deleteAccountAction supprime, prévient Pipedream, envoie l'e-mail et
  redirige` ; `une panne de Pipedream ou de Resend n'empêche pas la redirection` ; `un refus successeur rend son
  message` ; mêmes cas utiles pour `deleteOrganizationAction`. Pour `sendDeletionEmail` : rien n'est envoyé sans
  configuration ; le sujet et le texte sont ceux de la langue demandée.
- [ ] **Étape 2 : les lancer, ils échouent.**
- [ ] **Étape 3 : écrire le module d'e-mail, les deux actions, le message de la page de connexion et les textes.**
- [ ] **Étape 4 : tests, `pnpm typecheck`, `pnpm lint` passent.**
- [ ] **Étape 5 : commit** « Réglages : actions de suppression, et l'e-mail de confirmation ».

### Tâche 4 : les écrans

**Fichiers :**
- Créer : `src/components/verre/reglages/delete-account.tsx` (`DeleteAccountSection`, `DeleteOrganizationSection`)
- Modifier : `src/app/(app)/reglages/page.tsx` (lit `deletionInfo(ctx)`, place les deux blocs)
- Modifier : `messages/en.json`, `messages/fr.json`

**Interfaces consommées :** `DeletionInfo`, `deletionInfo` (tâche 1), `deleteAccountAction`,
`deleteOrganizationAction` (tâche 3).

```ts
export function DeleteAccountSection(props: { info: DeletionInfo; twoFactor: boolean }): JSX.Element;
export function DeleteOrganizationSection(props: { info: DeletionInfo; twoFactor: boolean }): JSX.Element;
```

**Contenu**, d'après la spec (section « Les écrans ») : `DeleteAccountSection` en bas du panneau Profil, après
`AboutSettings` ; `DeleteOrganizationSection` en bas du panneau Équipe, rendu seulement si `info.isOwner`. Chaque
bloc : titre, une phrase, un bouton rouge (variante `danger` de `Button` si elle existe, sinon la plus proche) qui
ouvre le `Dialog` du kit. Dans le dialogue : ce qui se passe (texte selon `soleActiveMember`), le `Select`
« Nouveau propriétaire » si `needsSuccessor` (parmi `successors`), le mot de passe, le code si `twoFactor`, le mot
à taper, et « Supprimer définitivement », désactivé tant que le mot n'est pas tapé. Erreur affichée dans un
`Notice`. Calqué sur `PasswordSettings` (`security-settings.tsx`) pour le formulaire et `MembersSection` pour le
dialogue.

- [ ] **Étape 1 : écrire les deux composants, brancher la page, ajouter les textes.**
- [ ] **Étape 2 : `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` passent** (dont le test des traductions).
- [ ] **Étape 3 : commit** « Profil et Équipe : supprimer son compte, supprimer l'organisation ».

### Tâche 5 : revues et corrections

- [ ] `security-review` et l'audit `auditing-runtime-contracts` sur la branche ; corriger ce qui tient.
- [ ] Revue de toute la branche contre la spec ; corriger.
- [ ] Suite complète : `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, tests en base du dossier `src/server/auth`
  et des fichiers touchés.

### Tâche 6 : vérification à l'écran (Claude, pas un agent)

Sur `localhost:3008` (base locale `leon_reglages_ux`, migrée à 0040), en français et en anglais : un membre qui
supprime son compte (puis son nom « ancien membre » dans Équipe pour un autre) ; le seul propriétaire avec un autre
membre (successeur obligatoire) ; un compte avec 2FA ; la suppression de l'organisation par son propriétaire ; les
mauvais mot de passe, code et mot. Puis montrer à Amos avant d'ouvrir la PR.
