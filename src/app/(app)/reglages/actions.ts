'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { LOCALE_COOKIE, localeOf, locales } from '@/i18n/request';
import {
  applyImport,
  type DirectoryError,
  directoryLinkUrl,
  directoryProviders,
  readDirectory,
} from '@/server/auth/annuaire';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import {
  DeletionRefused,
  type DeletionResult,
  deleteAccount,
  deleteOrganization,
} from '@/server/auth/delete-account';
import { deleteGroup, saveGroup, setGroupMembers } from '@/server/auth/groupes';
import {
  createInvitationLink,
  removeMember,
  setMemberPlacement,
  setMemberRole,
} from '@/server/auth/members';
import { PlacementSchema } from '@/server/auth/onboarding';
import { setManager, setManagersSeeAll } from '@/server/auth/organisation';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import {
  getSession,
  requestHeaders,
  requireUserContext,
  signedInRecently,
  signOutCurrentUser,
} from '@/server/auth/session';
import { registerSso, removeSso, SsoInputSchema, verifySsoDomain } from '@/server/auth/sso';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ABOUT_MAX_CHARS, saveAbout } from '@/server/briefing/about';
import { setDepotEquipe } from '@/server/connectors/github/depots-equipe';
import { forgetPipedreamUser } from '@/server/connectors/pipedream';
import { RESEND_BATCH_MAX, sendDeletionEmails } from '@/server/email/account-deleted';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { correctLesson, retireLesson, writeLesson } from '@/server/memory/lessons';
import {
  type MemoryTarget,
  type MemoryVersion,
  readMemoryVersion,
  restoreMemoryVersion,
} from '@/server/memory/memory-section';

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = z.enum(locales).safeParse(formData.get('locale'));
  if (!locale.success) return;
  (await cookies()).set(LOCALE_COOKIE, locale.data, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/', 'layout');
}

const TokenNameSchema = z.string().trim().min(1).max(80);

// Le jeton en clair n'existe que dans cette réponse : il n'est ni journalisé ni relisible ensuite.
export async function createTokenAction(
  name: string,
): Promise<{ token: string; hint: string } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const parsed = TokenNameSchema.safeParse(name);
  if (!parsed.success) return { error: t('invalidTokenName') };
  const { token, hint } = await createApiToken(ctx, parsed.data);
  revalidatePath('/reglages');
  return { token, hint };
}

// Les valeurs telles que les listes de `@/lib/onboarding` les donnent : c'est le schéma, côté serveur, qui les valide.
export type PlacementInput = { department: string; job: string; seniority: string };
// Un code par champ fautif (`form` pour ce qui ne vise aucun champ, `permission` quand le lecteur n'est ni propriétaire
// ni administrateur) : une clé de `onboarding.inviteErrors`, que le composant traduit à l'affichage.
export type InviteErrorCode = 'name' | 'department' | 'job' | 'seniority' | 'permission' | 'form';
export type InviteErrors = Partial<
  Record<'name' | 'department' | 'job' | 'seniority' | 'form', InviteErrorCode>
>;

const InvitationInputSchema = PlacementSchema.safeExtend({ name: z.string().trim().max(100) });
const INVITE_FIELDS = ['name', 'department', 'job', 'seniority'] as const;
const isInviteField = (field: string): field is (typeof INVITE_FIELDS)[number] =>
  (INVITE_FIELDS as readonly string[]).includes(field);

// Les schémas ne portent aucun message : le code de chaque champ est son nom. Un argument qui n'est pas un objet
// (`null` forgé) n'a pas de champ fautif : `form`.
function inviteErrors(error: z.ZodError): InviteErrors {
  const errors: InviteErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    const key = isInviteField(field) ? field : 'form';
    errors[key] ??= key;
  }
  return errors;
}

// Comme le jeton : le lien en clair n'existe que dans cette réponse. Tout l'argument est analysé avant d'être lu.
export async function createInvitationAction(
  input: PlacementInput & { name: string },
): Promise<{ url: string; expiresAt: Date } | { errors: InviteErrors }> {
  const ctx = await requireUserContext();
  const parsed = InvitationInputSchema.safeParse(input);
  if (!parsed.success) return { errors: inviteErrors(parsed.error) };
  const { name, ...placement } = parsed.data;
  const link = await createInvitationLink(ctx, { name, placement });
  if (!link) return { errors: { form: 'permission' } };
  const url = new URL(`/invitation/${link.token}`, env.BETTER_AUTH_URL).toString();
  return { url, expiresAt: link.expiresAt };
}

export async function setMemberPlacementAction(
  memberId: string,
  input: PlacementInput,
): Promise<{ ok: true } | { errors: InviteErrors }> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(memberId).success) return { errors: { form: 'form' } };
  const parsed = PlacementSchema.safeParse(input);
  if (!parsed.success) return { errors: inviteErrors(parsed.error) };
  if (!(await setMemberPlacement(ctx, memberId, parsed.data))) {
    return { errors: { form: 'permission' } };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

const DepotEquipeInputSchema = z.object({ depot: z.string(), coche: z.boolean() });
const DEPOT_ERRORS = {
  invalide: 'depotInvalid',
  refuse: 'depotRefused',
  illisible: 'depotUnreadable',
  echec: 'depotFailed',
} as const;

// Cocher ou décocher un dépôt d'équipe, ou en saisir un (décision D) : le module valide le dépôt, refuse qui n'est ni
// propriétaire ni administrateur, et un dépôt qu'aucune de ses connexions GitHub ne lit.
export async function setDepotEquipeAction(
  depot: string,
  coche: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const parsed = DepotEquipeInputSchema.safeParse({ depot, coche });
  if (!parsed.success) return { error: t('depotInvalid') };
  const result = await setDepotEquipe(ctx, parsed.data.depot, parsed.data.coche).catch((error) => {
    // Le message d'une erreur de requête porte ses paramètres, dont le dépôt : logError le masque.
    logError('settings.depot_failed', error);
    return 'echec' as const;
  });
  if (result !== 'ok') return { error: t(DEPOT_ERRORS[result]) };
  revalidatePath('/reglages');
  return { ok: true };
}

const GroupInputSchema = z.object({
  id: z.uuid().nullable(),
  nom: z.string(),
  membres: z.array(z.uuid()).max(500),
});

// Crée ou modifie un groupe libre : son nom, puis ses membres. Le nom d'abord : un nom déjà pris n'écrit rien.
export async function saveGroupAction(
  id: string | null,
  nom: string,
  membres: string[],
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const parsed = GroupInputSchema.safeParse({ id, nom, membres });
  if (!parsed.success) return { error: t('groupInvalid') };
  const saved = await saveGroup(ctx, parsed.data.id, parsed.data.nom);
  if (saved === 'nom_pris') return { error: t('groupNameTaken') };
  if (saved === 'refuse') return { error: t('groupRefused') };
  const ok = await setGroupMembers(ctx, saved.id, parsed.data.membres);
  revalidatePath('/reglages');
  revalidatePath('/documents');
  return ok ? { ok: true } : { error: t('groupRefused') };
}

export async function deleteGroupAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await deleteGroup(ctx, id);
  revalidatePath('/reglages');
  revalidatePath('/documents');
  return { ok };
}

export async function revokeTokenAction(tokenId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(tokenId).success) return { ok: false };
  const ok = await revokeApiToken(ctx, tokenId);
  revalidatePath('/reglages');
  return { ok };
}

// Organigramme et membres (0054) : réservés aux propriétaires et administrateurs, ce que members.ts et organisation.ts
// vérifient, avec les identifiants reçus du navigateur.
export async function setManagerAction(
  memberId: string,
  managerId: string | null,
): Promise<{ result: 'ok' | 'refuse' | 'boucle' | 'proprietaire' }> {
  const ctx = await requireUserContext();
  const result = await setManager(ctx, memberId, managerId);
  if (result === 'ok') {
    revalidatePath('/reglages');
    revalidatePath('/equipe');
  }
  return { result };
}

// « Importer l'organigramme » (annuaire.ts) : la personne part chez Google ou Microsoft ouvrir l'annuaire à Leon, et
// revient sur /reglages?annuaire=…, où la page montre l'aperçu. Un refus revient sur /reglages?annuaire=refus.
export async function startDirectoryImportAction(formData: FormData): Promise<void> {
  const ctx = await requireUserContext();
  const url = await directoryLinkUrl(ctx, String(formData.get('provider') ?? '')).catch((error) => {
    logError('settings.directory_start', error);
    return null;
  });
  redirect(url ?? '/reglages?annuaire=refus#equipe');
}

// « Appliquer » : l'annuaire relu, l'aperçu refait et écrit (réservé aux propriétaires et administrateurs).
export async function applyDirectoryImportAction(
  provider: string,
): Promise<{ count: number } | { error: DirectoryError | 'refus' }> {
  const ctx = await requireUserContext();
  const chosen = directoryProviders().find((one) => one === provider);
  if (!chosen) return { error: 'refus' };
  const people = await readDirectory(chosen);
  if (typeof people === 'string') return { error: people };
  const count = await applyImport(ctx, people);
  if (count === null) return { error: 'refus' };
  revalidatePath('/reglages');
  revalidatePath('/equipe');
  return { count };
}

// Les managers lisent-ils le privé des gens sous eux (0057) : un propriétaire ou un administrateur en décide.
export async function setManagersSeeAllAction(on: boolean): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = z.boolean().safeParse(on).success && (await setManagersSeeAll(ctx, on));
  if (ok) {
    revalidatePath('/reglages');
    revalidatePath('/equipe');
  }
  return { ok };
}

export async function setMemberRoleAction(
  memberId: string,
  role: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const parsed = z.enum(['admin', 'member']).safeParse(role);
  const ok = parsed.success && (await setMemberRole(ctx, memberId, parsed.data));
  if (ok) revalidatePath('/reglages');
  return { ok };
}

export async function removeMemberAction(memberId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await removeMember(ctx, memberId);
  if (ok) {
    revalidatePath('/reglages');
    revalidatePath('/equipe');
  }
  return { ok };
}

export async function updateProfileAction(name: string): Promise<{ ok: true } | { error: string }> {
  await requireUserContext();
  const t = await getTranslations('security');
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsed.success) return { error: t('nameInvalid') };
  try {
    await auth.api.updateUser({ body: { name: parsed.data }, headers: await requestHeaders() });
  } catch {
    return { error: t('profileFailed') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Un texte vide efface ce que l'utilisateur disait de lui.
export async function updateAboutAction(about: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('about');
  const parsed = z.string().trim().max(ABOUT_MAX_CHARS).safeParse(about);
  if (!parsed.success) return { error: t('tooLong', { max: ABOUT_MAX_CHARS }) };
  try {
    await saveAbout(ctx, parsed.data || null);
  } catch {
    return { error: t('failed') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Les actions qui vérifient le mot de passe comptent dans la limite de la connexion (rate-limit.ts), par e-mail :
// une session volée ne permet pas d'essayer des mots de passe sans fin.
async function passwordCheckAllowed(): Promise<boolean> {
  const session = await getSession();
  if (!session) redirect('/connexion');
  return authAttemptAllowed('connexion', session.user.email, await requestHeaders());
}

// Les autres sessions, peut-être volées, sont fermées ; Better Auth en ouvre une nouvelle pour celle-ci.
export async function changePasswordAction(
  current: string,
  password: string,
  confirmation: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations('security');
  const form = await getTranslations('auth');
  if (password.length < 8 || password.length > 128) return { error: form('passwordLength') };
  if (password !== confirmation) return { error: form('passwordsMismatch') };
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: password, revokeOtherSessions: true },
      headers: await requestHeaders(),
    });
  } catch {
    return { error: t('wrongPassword') };
  }
  return { ok: true };
}

export async function enableTotpAction(
  password: string,
): Promise<{ uri: string; backupCodes: string[] } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    const result = await auth.api.enableTwoFactor({
      body: { password, method: 'totp' },
      headers: await requestHeaders(),
    });
    if (result.method !== 'totp') return { error: t('enableFailed') };
    return { uri: result.totpURI, backupCodes: result.backupCodes };
  } catch {
    return { error: t('wrongPassword') };
  }
}

export async function verifyTotpSetupAction(
  code: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUserContext();
  const t = await getTranslations('security');
  if (!/^\d{6}$/.test(code)) return { error: t('codeInvalid') };
  try {
    // Better Auth remplace la session (la nouvelle porte la 2FA) : requestHeaders() suit le nouveau cookie.
    await auth.api.verifyTOTP({ body: { code }, headers: await requestHeaders() });
  } catch {
    return { error: t('codeWrong') };
  }
  // Les sessions ouvertes ailleurs, peut-être volées, se sont passées du code : elles sont fermées.
  await auth.api.revokeOtherSessions({ headers: await requestHeaders() });
  revalidatePath('/reglages');
  return { ok: true };
}

export async function disableTotpAction(
  password: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: await requestHeaders() });
  } catch {
    return { error: t('wrongPassword') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Les anciens codes de secours cessent de marcher ; les nouveaux ne sont montrés qu'une fois.
export async function regenerateBackupCodesAction(
  password: string,
): Promise<{ backupCodes: string[] } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    const { backupCodes } = await auth.api.generateBackupCodes({
      body: { password },
      headers: await requestHeaders(),
    });
    return { backupCodes };
  } catch {
    return { error: t('wrongPassword') };
  }
}

const DeletionInputSchema = z.object({ password: z.string(), code: z.string(), word: z.string() });
type DeletionInput = z.infer<typeof DeletionInputSchema>;
// `organizationToo` : ce que le dialogue a annoncé, que le module relit avant de rien effacer (`situation`).
const AccountDeletionInputSchema = DeletionInputSchema.extend({
  successorId: z.uuid().nullable(),
  organizationToo: z.boolean(),
});
// 2 requêtes par seconde chez Resend, avec une marge.
const RESEND_SPACING_MS = 600;

// Ce qui part ne revient pas : le mot tapé, le mot de passe et, avec la 2FA, le code de l'application. Rend le
// message du premier qui ne passe pas, ou null.
async function confirmIdentity({ password, code, word }: DeletionInput): Promise<string | null> {
  const t = await getTranslations('deleteAccount');
  const security = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return security('tooManyAttempts');
  if (word.trim() !== t('word')) return t('wrongWord', { word: t('word') });
  const headers = await requestHeaders();
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch {
    return security('wrongPassword');
  }
  // Avec une session ouverte, Better Auth ne compte pas les échecs du code : seule la limite d'essais protège.
  // Une session qui vient de disparaître ne dispense pas du code.
  const session = await getSession();
  if (!session || session.user.twoFactorEnabled) {
    try {
      await auth.api.verifyTOTP({ body: { code }, headers });
    } catch {
      return t('wrongCode');
    }
  }
  return null;
}

async function runDeletion<Input extends DeletionInput>(
  schema: z.ZodType<Input>,
  rawInput: unknown,
  deletion: (ctx: TenantContext, input: Input) => Promise<DeletionResult>,
  redirectTo: '/connexion?supprime=compte' | '/connexion?supprime=organisation',
): Promise<{ error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('deleteAccount');
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { error: t('failed') };
  const input = parsed.data;
  const refusal = await confirmIdentity(input);
  if (refusal) return { error: refusal };

  let result: DeletionResult;
  try {
    result = await deletion(ctx, input);
  } catch (error) {
    if (error instanceof DeletionRefused) return { error: t(`refused.${error.reason}`) };
    // Y compris un second envoi du formulaire : la première suppression a déjà retiré la personne.
    logError('account.deletion_failed', error);
    return { error: t('failed') };
  }

  // Tout est fait en base : ni Pipedream ni Resend ne peuvent plus faire échouer la suppression.
  const locale = localeOf(await getLocale());
  await Promise.all(
    result.pipedreamUsers.map((id) =>
      forgetPipedreamUser(id).catch((error) => logError('account.deletion_pipedream', error)),
    ),
  );
  // Par lots de 100, une requête par lot : 100 membres ne retiennent plus la page une minute. Resend limite à 2
  // requêtes par seconde : un lot après l'autre, espacés, et un échec n'arrête pas les suivants.
  for (let start = 0; start < result.notify.length; start += RESEND_BATCH_MAX) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, RESEND_SPACING_MS));
    await sendDeletionEmails({
      recipients: result.notify.slice(start, start + RESEND_BATCH_MAX),
      locale,
      organizationName: result.organizationName,
    }).catch((error) => logError('account.deletion_email', error));
  }
  // La session est déjà effacée en base : il ne reste que les cookies à retirer.
  await signOutCurrentUser().catch(() => undefined);
  redirect(redirectTo);
}

// `successorId` ne sert qu'au seul propriétaire qui laisse d'autres membres. En cas de succès, ne rend pas : la page
// part vers la connexion.
export async function deleteAccountAction(
  input: z.input<typeof AccountDeletionInputSchema>,
): Promise<{ error: string }> {
  return runDeletion(
    AccountDeletionInputSchema,
    input,
    (ctx, { successorId, organizationToo }) => deleteAccount(ctx, successorId, organizationToo),
    '/connexion?supprime=compte',
  );
}

export async function deleteOrganizationAction(
  input: z.input<typeof DeletionInputSchema>,
): Promise<{ error: string }> {
  return runDeletion(
    DeletionInputSchema,
    input,
    (ctx) => deleteOrganization(ctx),
    '/connexion?supprime=organisation',
  );
}

export type SsoFormState = { error?: string; values?: Record<string, string> };
const SSO_ERRORS = {
  refuse: 'ssoRefused',
  deja: 'ssoAlready',
  decouverte: 'ssoDiscoveryFailed',
  invalide: 'ssoInvalid',
} as const;

// Régler le SSO d'entreprise de l'espace (sso.ts) ; le secret OIDC n'est jamais renvoyé au formulaire.
export async function registerSsoAction(
  _previous: SsoFormState,
  formData: FormData,
): Promise<SsoFormState> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const fields = Object.fromEntries(
    ['protocol', 'domain', 'issuer', 'clientId', 'clientSecret', 'entryPoint', 'metadata'].map(
      (name) => [name, String(formData.get(name) ?? '')],
    ),
  );
  const { clientSecret: _secret, ...values } = fields;
  const parsed = SsoInputSchema.safeParse(fields);
  if (!parsed.success) return { error: t('ssoInvalid'), values };
  const result = await registerSso(ctx, parsed.data);
  if (!result.ok) return { error: t(SSO_ERRORS[result.error]), values };
  revalidatePath('/reglages');
  return {};
}

export async function verifySsoDomainAction(): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await verifySsoDomain(ctx);
  revalidatePath('/reglages');
  return { ok };
}

export async function removeSsoAction(): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await removeSso(ctx).catch((error) => {
    logError('settings.sso_remove', error);
    return false;
  });
  revalidatePath('/reglages');
  return { ok };
}

// La section Mémoire (T55, T57 ; D33, D34, D37, C12, C13 du plan de la mémoire à disposition) : les seuls gestes qui
// écrivent, corrigent, retirent une leçon ou remettent une version, sous la session du navigateur (requireUserContext ;
// sans le plugin bearer, aucun jeton n'y arrive). Écrire, corriger et remettre exigent une connexion de moins d'une
// heure (signedInRecently) : sinon « reconnexion », rien n'est écrit, et la section mène à /connexion?retour=memoire.
// Retirer ne l'exige pas (D37). Chaque erreur est un code, que la section traduit ; aucune ne recopie une valeur reçue.
export type MemoryError = 'reconnexion' | 'modifiee' | 'introuvable' | 'invalide';

// Le numéro d'une version : un int4, comme versions_memoire.n.
const VersionNumberSchema = z.int().min(1).max(2_147_483_647);
const MemoryTargetSchema = z.object({ cible: z.enum(['fil', 'note', 'lecon']), id: z.uuid() });
const WriteLessonSchema = z.object({ texte: z.string(), projet: z.string().nullable() });
const CorrectLessonSchema = z.object({
  id: z.string(),
  texte: z.string(),
  depuis: VersionNumberSchema,
});
const RestoreSchema = MemoryTargetSchema.extend({
  n: VersionNumberSchema,
  depuis: VersionNumberSchema,
});
const ReadVersionSchema = MemoryTargetSchema.extend({ n: VersionNumberSchema });

// `projet` : un des dépôts des fils de l'auteur, ou null pour tous ses dépôts. Le texte et le dépôt sont validés par
// lessons.ts (300 caractères, ProjectSchema), qui passe le texte par maskSecrets.
export async function writeLessonAction(input: {
  texte: string;
  projet: string | null;
}): Promise<{ ok: true; id: string; n: number } | { error: MemoryError }> {
  const ctx = await requireUserContext();
  const parsed = WriteLessonSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalide' };
  if (!(await signedInRecently())) return { error: 'reconnexion' };
  const written = await writeLesson(ctx, {
    texte: parsed.data.texte,
    projet: parsed.data.projet ?? undefined,
  });
  if (written === 'invalide') return { error: 'invalide' };
  revalidatePath('/reglages');
  return { ok: true, ...written };
}

// `depuis` : le numéro de la version que la section montrait (compare-and-set, D34).
export async function correctLessonAction(input: {
  id: string;
  texte: string;
  depuis: number;
}): Promise<{ ok: true; n: number } | { error: MemoryError }> {
  const ctx = await requireUserContext();
  const parsed = CorrectLessonSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalide' };
  if (!(await signedInRecently())) return { error: 'reconnexion' };
  const corrected = await correctLesson(ctx, parsed.data);
  if (typeof corrected !== 'object')
    return { error: corrected === 'depassee' ? 'modifiee' : corrected };
  revalidatePath('/reglages');
  return { ok: true, n: corrected.n };
}

// Elle sort des listes et du bloc ; ses versions restent (D33).
export async function retireLessonAction(
  id: string,
): Promise<{ ok: true } | { error: 'introuvable' | 'invalide' }> {
  const ctx = await requireUserContext();
  const parsed = z.string().safeParse(id);
  if (!parsed.success) return { error: 'invalide' };
  if (!(await retireLesson(ctx, parsed.data))) return { error: 'introuvable' };
  revalidatePath('/reglages');
  return { ok: true };
}

// « Remettre cette version » d'un fil, d'une note (par writeNote, T57) ou d'une leçon : v(depuis+1), écrite par l'humain, rien n'est effacé (D33).
export async function restoreMemoryVersionAction(input: {
  cible: MemoryTarget['cible'];
  id: string;
  n: number;
  depuis: number;
}): Promise<{ ok: true; n: number } | { error: MemoryError }> {
  const ctx = await requireUserContext();
  const parsed = RestoreSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalide' };
  if (!(await signedInRecently())) return { error: 'reconnexion' };
  const restored = await restoreMemoryVersion(ctx, parsed.data);
  if (typeof restored !== 'object')
    return { error: restored === 'depassee' ? 'modifiee' : restored };
  revalidatePath('/reglages');
  return { ok: true, n: restored.n };
}

// Le texte d'une version de l'historique, si elle est lisible (D33). Lire n'exige pas de connexion récente.
export async function readMemoryVersionAction(input: {
  cible: MemoryTarget['cible'];
  id: string;
  n: number;
}): Promise<
  { ok: true; version: MemoryVersion & { texte: string } } | { error: 'introuvable' | 'invalide' }
> {
  const ctx = await requireUserContext();
  const parsed = ReadVersionSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalide' };
  const version = await readMemoryVersion(ctx, parsed.data);
  return version ? { ok: true, version } : { error: 'introuvable' };
}
